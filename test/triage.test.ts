import { describe, expect, it } from "vitest"
import { triageCandidates } from "../src/agent/triage.js"
import { Llm } from "../src/llm/router.js"
import type { ShortlistedCandidate } from "../src/types.js"
import { mockModel } from "./helpers.js"

function candidate(id: string, shortlist: string[]): ShortlistedCandidate {
  return {
    id,
    file: "/repo/page.tsx",
    line: 1,
    endLine: 1,
    sourceText: "<button />",
    shortlist,
    fingerprint: { rootTag: "button", depth: 0, childTags: [], classTokens: [], ariaRole: null, hasHandler: false, textSample: "", file: "/repo/page.tsx", line: 1 },
  }
}

const tiers = { cheap: "test:cheap", mid: "test:mid", strong: "test:strong" }

describe("triageCandidates", () => {
  it("reroutes a match outside the candidate's shortlist instead of trusting it", async () => {
    const { model } = mockModel([
      JSON.stringify({
        results: [
          { id: "c1", match: "Dialog", confidence: 0.85, reason: "Full-screen overlay." },
          { id: "c2", match: "Dialog", confidence: 0.9, reason: "Overlay." },
        ],
      }),
    ])
    const llm = new Llm(tiers, {}, { cheap: model })
    const out = await triageCandidates(llm, [candidate("c1", ["Button"]), candidate("c2", ["Dialog"])], [], { concurrency: 1 })

    expect(out.get("c1")).toMatchObject({ match: "Button", confidence: 0.85, rerouted: true })
    expect(out.get("c2")).toMatchObject({ match: "Dialog", confidence: 0.9 })
    expect(out.get("c2")?.rerouted).toBeUndefined()
  })

  it("ignores invented ids, re-asks for skipped candidates, then fails open", async () => {
    const { model, prompts } = mockModel([JSON.stringify({ results: [{ id: "ghost", match: "Button", confidence: 1, reason: "x" }] })])
    const llm = new Llm(tiers, {}, { cheap: model })
    const out = await triageCandidates(llm, [candidate("c1", ["Button"])], [], { concurrency: 1 })
    expect(out.has("ghost")).toBe(false)
    expect(prompts).toHaveLength(2)
    expect(out.get("c1")).toMatchObject({ match: "Button", confidence: 0, rerouted: true })
  })

  it("uses the second answer when the retry fills the gap", async () => {
    const { model } = mockModel([
      JSON.stringify({ results: [] }),
      JSON.stringify({ results: [{ id: "c1", match: null, confidence: 0.8, reason: "Not a button." }] }),
    ])
    const llm = new Llm(tiers, {}, { cheap: model })
    const out = await triageCandidates(llm, [candidate("c1", ["Button"])], [], { concurrency: 1 })
    expect(out.get("c1")).toMatchObject({ match: null, confidence: 0.8 })
    expect(out.get("c1")?.rerouted).toBeUndefined()
  })
})
