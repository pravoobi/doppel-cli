import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"
import type { DoppelConfig } from "../config.js"
import { ConfigError } from "../errors.js"

/**
 * Three tiers, each used for a different kind of work:
 * - cheap:  high-volume, low-judgment (DS component descriptions, batched triage)
 * - mid:    real judgment with full source context (adjudication)
 * - strong: code generation (migration and repair, phase 2)
 */
export type Tier = "cheap" | "mid" | "strong"
export const TIERS: Tier[] = ["cheap", "mid", "strong"]

export type TierModels = Record<Tier, string>

/**
 * Only model IDs we could verify go here. Anthropic IDs are current published
 * IDs; Nebius IDs were pinned verbatim from GET /v1/models on 2026-09-23.
 */
export const PRESETS: Record<NonNullable<DoppelConfig["preset"]>, TierModels> = {
  anthropic: {
    cheap: "anthropic:claude-haiku-4-5-20251001",
    mid: "anthropic:claude-sonnet-5",
    strong: "anthropic:claude-opus-5-5",
  },
  nebius: {
    cheap: "nebius:nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    mid: "nebius:nvidia/nemotron-3-super-120b-a12b",
    strong: "nebius:nvidia/Nemotron-3-Ultra-550b-a55b",
  },
}

type BuiltinProvider = {
  apiKeyEnv?: string
  create: (apiKey: string | undefined, modelId: string) => LanguageModel
}

function compatible(name: string, baseURL: string) {
  return (apiKey: string | undefined, modelId: string) =>
    createOpenAICompatible({ name, baseURL, apiKey, supportsStructuredOutputs: true })(modelId)
}

const BUILTIN_PROVIDERS: Record<string, BuiltinProvider> = {
  anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", create: (apiKey, id) => createAnthropic({ apiKey })(id) },
  openai: { apiKeyEnv: "OPENAI_API_KEY", create: (apiKey, id) => createOpenAI({ apiKey })(id) },
  nebius: {
    apiKeyEnv: "NEBIUS_API_KEY",
    create: compatible("nebius", process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1/"),
  },
  openrouter: { apiKeyEnv: "OPENROUTER_API_KEY", create: compatible("openrouter", "https://openrouter.ai/api/v1") },
  ollama: { create: compatible("ollama", process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1") },
}

/** Name of the environment variable holding the key for a model spec, if it uses one. */
export function apiKeyEnvFor(spec: string, config: DoppelConfig): string | undefined {
  const { provider } = parseModelSpec(spec)
  return config.providers?.[provider]?.apiKeyEnv ?? BUILTIN_PROVIDERS[provider]?.apiKeyEnv
}

/** Splits "provider:model". Model IDs may themselves contain ":" or "/", so only the first ":" counts. */
export function parseModelSpec(spec: string): { provider: string; modelId: string } {
  const i = spec.indexOf(":")
  if (i <= 0 || i === spec.length - 1) {
    throw new ConfigError(`Invalid model "${spec}". Use "provider:model", e.g. "anthropic:claude-sonnet-5".`)
  }
  return { provider: spec.slice(0, i), modelId: spec.slice(i + 1) }
}

export function createModel(spec: string, config: DoppelConfig, env: NodeJS.ProcessEnv = process.env): LanguageModel {
  const { provider, modelId } = parseModelSpec(spec)

  const custom = config.providers?.[provider]
  if (custom) {
    const apiKey = custom.apiKeyEnv ? env[custom.apiKeyEnv] : undefined
    if (custom.apiKeyEnv && !apiKey) {
      throw new ConfigError(`Model "${spec}" needs ${custom.apiKeyEnv} to be set.`)
    }
    return compatible(provider, custom.baseURL)(apiKey, modelId)
  }

  const builtin = BUILTIN_PROVIDERS[provider]
  if (!builtin) {
    const known = [...Object.keys(BUILTIN_PROVIDERS), ...Object.keys(config.providers ?? {})].join(", ")
    throw new ConfigError(
      `Unknown provider "${provider}" in "${spec}". Known: ${known}. ` +
        `Any OpenAI-compatible endpoint can be added under "providers" in doppel.config.json.`
    )
  }
  const apiKey = builtin.apiKeyEnv ? env[builtin.apiKeyEnv] : undefined
  if (builtin.apiKeyEnv && !apiKey) {
    throw new ConfigError(`Model "${spec}" needs ${builtin.apiKeyEnv} to be set.`)
  }
  return builtin.create(apiKey, modelId)
}

/**
 * Resolution order: explicit per-tier models, then a preset, then a preset
 * inferred from whichever provider key is present. A missing tier borrows from
 * its neighbour, so a single `--model` is enough to run everything on one model.
 */
export function resolveTierModels(config: DoppelConfig, env: NodeJS.ProcessEnv = process.env): TierModels {
  const presetName =
    config.preset ?? (env.ANTHROPIC_API_KEY ? "anthropic" : env.NEBIUS_API_KEY ? "nebius" : undefined)
  const preset = presetName ? PRESETS[presetName] : undefined
  const m = config.models ?? {}

  const cheap = m.cheap ?? m.mid ?? m.strong ?? preset?.cheap
  const mid = m.mid ?? m.strong ?? m.cheap ?? preset?.mid
  const strong = m.strong ?? m.mid ?? m.cheap ?? preset?.strong

  if (!cheap || !mid || !strong) {
    throw new ConfigError(
      "No model configured. Set ANTHROPIC_API_KEY or NEBIUS_API_KEY to use a built-in preset, " +
        'pass --model "provider:model", or set "models" in doppel.config.json. Use --no-llm for a deterministic scan.'
    )
  }
  return { cheap, mid, strong }
}
