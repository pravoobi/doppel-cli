import { describe, expect, it } from "vitest"
import { z } from "zod"
import { Llm, LlmError } from "../src/llm/router.js"
import { parseModelSpec, resolveTierModels } from "../src/llm/models.js"
import { ConfigError } from "../src/errors.js"
import { mockModel } from "./helpers.js"

const Schema = z.object({ answer: z.string() })
const tiers = { cheap: "test:cheap", mid: "test:mid", strong: "test:strong" }

describe("Llm.generate", () => {
  it("returns schema-valid output and records usage", async () => {
    const { model } = mockModel(['{"answer":"yes"}'])
    const llm = new Llm(tiers, {}, { cheap: model })
    const out = await llm.generate({ tier: "cheap", stage: "triage", prompt: "q", schema: Schema, schemaName: "A" })
    expect(out).toEqual({ answer: "yes" })
    expect(llm.usage).toHaveLength(1)
    expect(llm.usage[0]).toMatchObject({ stage: "triage", tier: "cheap", model: "test:cheap", inputTokens: 100, ok: true })
  })

  it("retries once with the validation error appended", async () => {
    const { model, prompts } = mockModel(['{"wrong":1}', '{"answer":"fixed"}'])
    const llm = new Llm(tiers, {}, { mid: model })
    const out = await llm.generate({ tier: "mid", stage: "adjudicate", prompt: "q", schema: Schema, schemaName: "A" })
    expect(out).toEqual({ answer: "fixed" })
    expect(prompts[1]).toContain("Your previous response was invalid")
    expect(llm.usage.map((u) => u.ok)).toEqual([false, true])
  })

  it("fails loudly after two invalid responses instead of returning junk", async () => {
    const { model } = mockModel(["not json at all"])
    const llm = new Llm(tiers, {}, { cheap: model })
    await expect(
      llm.generate({ tier: "cheap", stage: "triage", prompt: "q", schema: Schema, schemaName: "A" })
    ).rejects.toBeInstanceOf(LlmError)
  })

  it("reports cost as unknown for unpriced models, and computes it when priced", async () => {
    const { model } = mockModel(['{"answer":"x"}'], { input: 1_000_000, output: 1_000_000 })
    const unpriced = new Llm(tiers, {}, { cheap: model })
    await unpriced.generate({ tier: "cheap", stage: "triage", prompt: "q", schema: Schema, schemaName: "A" })
    expect(unpriced.costSummary().costUsd).toBeNull()
    expect(unpriced.costSummary().unpricedModels).toEqual(["test:cheap"])

    const priced = new Llm(tiers, { pricing: { "test:cheap": { input: 1, output: 2 } } }, { cheap: model })
    await priced.generate({ tier: "cheap", stage: "triage", prompt: "q", schema: Schema, schemaName: "A" })
    expect(priced.costSummary().costUsd).toBeCloseTo(3)
  })
})

describe("setup errors", () => {
  it("turns a rejected key into a one-line ConfigError naming the env var, without retrying", async () => {
    const { MockLanguageModelV4 } = await import("ai/test")
    const { APICallError } = await import("ai")
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++
        throw new APICallError({ message: "invalid x-api-key", url: "https://api.example", requestBodyValues: {}, statusCode: 401, isRetryable: false })
      },
    })
    const llm = new Llm({ cheap: "anthropic:m", mid: "anthropic:m", strong: "anthropic:m" }, {}, { cheap: model })
    const err = await llm
      .generate({ tier: "cheap", stage: "triage", prompt: "q", schema: Schema, schemaName: "A" })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as Error).message).toContain("Check ANTHROPIC_API_KEY")
    expect(calls).toBe(1)
  })
})

describe("model resolution", () => {
  it("splits provider on the first colon only", () => {
    expect(parseModelSpec("ollama:llama3.1:8b")).toEqual({ provider: "ollama", modelId: "llama3.1:8b" })
    expect(parseModelSpec("nebius:nvidia/nemotron-3-super-120b-a12b").modelId).toBe("nvidia/nemotron-3-super-120b-a12b")
    expect(() => parseModelSpec("no-provider")).toThrow(ConfigError)
  })

  it("lets one model fill every tier", () => {
    expect(resolveTierModels({ models: { mid: "openai:some-model" } }, {})).toEqual({
      cheap: "openai:some-model",
      mid: "openai:some-model",
      strong: "openai:some-model",
    })
  })

  it("infers a preset from the available API key", () => {
    expect(resolveTierModels({}, { ANTHROPIC_API_KEY: "x" }).mid).toMatch(/^anthropic:/)
    expect(resolveTierModels({}, { OPENAI_API_KEY: "x" }).mid).toMatch(/^openai:/)
    expect(resolveTierModels({}, { NEBIUS_API_KEY: "x" }).mid).toMatch(/^nebius:/)
    expect(resolveTierModels({}, { ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y" }).mid).toMatch(/^anthropic:/)
    expect(resolveTierModels({ preset: "openai" }, { ANTHROPIC_API_KEY: "x" }).mid).toMatch(/^openai:/)
  })

  it("explains what to do when nothing is configured", () => {
    expect(() => resolveTierModels({}, {})).toThrow(/--no-llm/)
  })
})
