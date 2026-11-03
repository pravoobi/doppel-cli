import type { Warning } from "ai"
import { describe, expect, it } from "vitest"
import { dedupedWarningLogger } from "../src/llm/warnings.js"

const warning = (fields: Record<string, string>) => fields as unknown as Warning

describe("dedupedWarningLogger", () => {
  it("prints each distinct warning once across calls", () => {
    const lines: string[] = []
    const log = dedupedWarningLogger((l) => lines.push(l))
    const w = warning({ type: "unsupported", feature: "topK", details: "topK is not supported" })
    for (let i = 0; i < 18; i++) log({ warnings: [w], provider: "anthropic.messages", model: "claude-sonnet-5" })
    log({ warnings: [w], provider: "openai", model: "x" })
    expect(lines).toEqual([
      "warning (anthropic.messages / claude-sonnet-5): topK is not supported",
      "warning (openai / x): topK is not supported",
    ])
  })

  it("drops the expected temperature warning from reasoning models", () => {
    const lines: string[] = []
    const log = dedupedWarningLogger((l) => lines.push(l))
    log({ warnings: [warning({ type: "unsupported", feature: "temperature", details: "not supported" })], provider: "openai", model: "x" })
    expect(lines).toEqual([])
  })
})
