/**
 * The single call site for every model request. Resolves a tier to a model,
 * enforces structured output against a zod schema, retries once with the
 * validation error appended, and records token usage for the cost report.
 */

import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai"
import type { z } from "zod"
import type { DoppelConfig } from "../config.js"
import { ConfigError } from "../errors.js"
import { apiKeyEnvFor, createModel, resolveTierModels, TIERS, type Tier, type TierModels } from "./models.js"
import { costUsd, priceFor } from "./pricing.js"

const DEFAULT_MAX_OUTPUT_TOKENS = 6000
const MAX_ATTEMPTS = 2

export type UsageRecord = {
  stage: string
  tier: Tier
  model: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  latencyMs: number
  attempt: number
  ok: boolean
}

export type GenerateRequest<T> = {
  tier: Tier
  /** Pipeline stage, e.g. "triage". Recorded verbatim in usage. */
  stage: string
  system?: string
  prompt: string
  schema: z.ZodType<T>
  schemaName: string
  maxOutputTokens?: number
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly stage: string,
    readonly model: string
  ) {
    super(message)
    this.name = "LlmError"
  }
}

export type CostSummary = {
  calls: number
  inputTokens: number
  outputTokens: number
  /** Null when any call used a model with no known price. */
  costUsd: number | null
  unpricedModels: string[]
  byTier: Record<string, { model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number | null }>
  byStage: Record<string, { calls: number; inputTokens: number; outputTokens: number }>
}

export class Llm {
  readonly usage: UsageRecord[] = []
  private readonly resolved = new Map<Tier, LanguageModel>()

  constructor(
    readonly models: TierModels,
    private readonly config: DoppelConfig,
    /** Prebuilt models per tier; used by tests to inject mock models. Unlisted tiers are created on first use. */
    overrides: Partial<Record<Tier, LanguageModel>> = {}
  ) {
    for (const tier of TIERS) {
      const m = overrides[tier]
      if (m) this.resolved.set(tier, m)
    }
  }

  static fromConfig(config: DoppelConfig, env: NodeJS.ProcessEnv = process.env): Llm {
    return new Llm(resolveTierModels(config, env), config)
  }

  /** Model objects are created lazily so an unused tier never demands an API key. */
  private model(tier: Tier): LanguageModel {
    let m = this.resolved.get(tier)
    if (!m) {
      m = createModel(this.models[tier], this.config)
      this.resolved.set(tier, m)
    }
    return m
  }

  async generate<T>(req: GenerateRequest<T>): Promise<T> {
    const spec = this.models[req.tier]
    const model = this.model(req.tier)
    let lastError = ""

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const prompt =
        attempt === 1
          ? req.prompt
          : `${req.prompt}\n\nYour previous response was invalid: ${lastError}\n` +
            "Reply again with ONLY the corrected JSON matching the schema."
      const start = Date.now()
      try {
        const result = await generateText({
          model,
          system: req.system,
          prompt,
          output: Output.object({ schema: req.schema, name: req.schemaName }),
          maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: 0,
          maxRetries: 2,
        })
        const output = result.output as T
        this.record(req, spec, result.usage, Date.now() - start, attempt, true)
        return output
      } catch (err) {
        if (NoObjectGeneratedError.isInstance(err)) {
          this.record(req, spec, err.usage, Date.now() - start, attempt, false)
          lastError = describeNoObject(err)
          continue
        }
        if (NoOutputGeneratedError.isInstance(err)) {
          this.record(req, spec, undefined, Date.now() - start, attempt, false)
          lastError = "the response contained no structured output"
          continue
        }
        throw this.toSetupError(err, spec) ??
          new LlmError(`${req.stage} call to ${spec} failed: ${(err as Error).message}`, req.stage, spec)
      }
    }

    throw new LlmError(
      `${req.stage}: ${spec} returned invalid output after ${MAX_ATTEMPTS} attempts (${lastError})`,
      req.stage,
      spec
    )
  }

  /** A rejected key or unknown model is a setup problem: no later call can succeed, so stop the run. */
  private toSetupError(err: unknown, spec: string): ConfigError | null {
    const apiError = APICallError.isInstance(err)
      ? err
      : RetryError.isInstance(err) && APICallError.isInstance(err.lastError)
        ? err.lastError
        : null
    const status = apiError?.statusCode
    if (status === 401 || status === 403) {
      const keyEnv = apiKeyEnvFor(spec, this.config)
      return new ConfigError(`${spec} rejected the API key (HTTP ${status}).${keyEnv ? ` Check ${keyEnv}.` : ""}`)
    }
    if (status === 404) {
      return new ConfigError(`${spec} was not found (HTTP 404). Check the model name for this provider.`)
    }
    return null
  }

  private record(
    req: GenerateRequest<unknown>,
    model: string,
    usage: LanguageModelUsage | undefined,
    latencyMs: number,
    attempt: number,
    ok: boolean
  ) {
    this.usage.push({
      stage: req.stage,
      tier: req.tier,
      model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
      latencyMs,
      attempt,
      ok,
    })
  }

  costSummary(): CostSummary {
    const summary: CostSummary = {
      calls: this.usage.length,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      unpricedModels: [],
      byTier: {},
      byStage: {},
    }
    for (const u of this.usage) {
      const cost = costUsd(priceFor(u.model, this.config), u.inputTokens, u.outputTokens)
      summary.inputTokens += u.inputTokens
      summary.outputTokens += u.outputTokens
      if (cost === null) {
        summary.costUsd = null
        if (!summary.unpricedModels.includes(u.model)) summary.unpricedModels.push(u.model)
      } else if (summary.costUsd !== null) {
        summary.costUsd += cost
      }

      const t = (summary.byTier[u.tier] ??= { model: u.model, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      t.calls++
      t.inputTokens += u.inputTokens
      t.outputTokens += u.outputTokens
      t.costUsd = cost === null || t.costUsd === null ? null : t.costUsd + cost

      const s = (summary.byStage[u.stage] ??= { calls: 0, inputTokens: 0, outputTokens: 0 })
      s.calls++
      s.inputTokens += u.inputTokens
      s.outputTokens += u.outputTokens
    }
    return summary
  }
}

function describeNoObject(err: NoObjectGeneratedError): string {
  if (!err.text || err.text.trim() === "") {
    return (
      "the response was empty. Reasoning models can spend the whole output budget on internal " +
      "reasoning before answering; answer directly and concisely"
    )
  }
  return err.cause instanceof Error ? err.cause.message : err.message
}
