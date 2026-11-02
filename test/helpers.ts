import { MockLanguageModelV4 } from "ai/test"

type Reply = string | ((prompt: string) => string)

function promptText(options: unknown): string {
  const prompt = (options as { prompt?: Array<{ role: string; content: unknown }> }).prompt ?? []
  return prompt
    .flatMap((m) => (typeof m.content === "string" ? [m.content] : (m.content as Array<{ text?: string }>).map((p) => p.text ?? "")))
    .join("\n")
}

/** A mock model that answers each call with the next reply (the last one repeats). */
export function mockModel(replies: Reply[], tokens = { input: 100, output: 50 }) {
  let i = 0
  const prompts: string[] = []
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const text = promptText(options)
      prompts.push(text)
      const reply = replies[Math.min(i++, replies.length - 1)]
      return {
        content: [{ type: "text", text: typeof reply === "function" ? reply(text) : reply }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: tokens.input, noCache: tokens.input, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: tokens.output, text: tokens.output, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
  return { model, prompts }
}
