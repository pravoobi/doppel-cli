import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Llm } from "../src/llm/router.js"
import { runDoppel } from "../src/pipeline.js"
import { mockModel } from "./helpers.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = path.resolve(__dirname, "fixtures/drift-demo")
const tiers = { cheap: "test:cheap", mid: "test:mid", strong: "test:strong" }

/** Cheap tier: answers describe prompts, and triages every candidate as its first shortlisted component. */
function cheapReply(prompt: string): string {
  if (prompt.includes("documenting a design-system component")) {
    return JSON.stringify({ description: "A component.", aliases: ["thing"] })
  }
  const json = prompt.split("excerpt, truncated):\n")[1].split("\n\nFor EACH")[0]
  const candidates = JSON.parse(json) as Array<{ id: string; shortlist: string[] }>
  return JSON.stringify({
    results: candidates.map((c) => ({ id: c.id, match: c.shortlist[0], confidence: 0.9, reason: "looks alike" })),
  })
}

const driftReply = JSON.stringify({
  classification: "DRIFT",
  rationale: "Hand-rolled copy of the component.",
  propMapping: [{ from: "bg-red-50", to: "variant='destructive'", note: null }],
  unmappable: [],
  risk: "low",
})

function makeLlm() {
  const cheap = mockModel([cheapReply])
  const mid = mockModel([driftReply])
  return { llm: new Llm(tiers, {}, { cheap: cheap.model, mid: mid.model }), cheap, mid }
}

describe("runDoppel", () => {
  it("runs deterministically with no model", async () => {
    const report = await runDoppel({ root: FIXTURE_ROOT, llm: null })
    expect(report.mode).toBe("deterministic")
    expect(report.stats.shortlisted).toBe(18)
    expect(report.findings.every((f) => f.status === "candidate")).toBe(true)
    expect(report.cost).toBeUndefined()
  })

  it("triages, adjudicates, and reports drift with import paths and cost", async () => {
    const { llm, mid } = makeLlm()
    const report = await runDoppel({ root: FIXTURE_ROOT, llm })
    expect(report.mode).toBe("llm")
    expect(report.stats.drift).toBe(18)
    expect(mid.prompts).toHaveLength(18)
    const finding = report.findings.find((f) => f.status === "drift")!
    expect(finding.importPath).toMatch(/^@\/components\/ui\//)
    expect(finding.adjudication?.rationale).toBeTruthy()
    expect(report.cost?.calls).toBeGreaterThan(18)
    expect(report.cost?.costUsd).toBeNull()
  })

  it("reuses cached component descriptions on the next run", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doppel-cache-"))
    const first = makeLlm()
    await runDoppel({ root: FIXTURE_ROOT, llm: first.llm, cacheDir })
    const second = makeLlm()
    await runDoppel({ root: FIXTURE_ROOT, llm: second.llm, cacheDir })
    const describeCalls = (l: Llm) => l.usage.filter((u) => u.stage === "describe").length
    expect(describeCalls(first.llm)).toBeGreaterThan(0)
    expect(describeCalls(second.llm)).toBe(0)
  })

  it("skips candidates under a doppel-ignore comment without calling a model", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "doppel-ignore-"))
    fs.mkdirSync(path.join(root, "components/ui"), { recursive: true })
    fs.writeFileSync(
      path.join(root, "components/ui/button.tsx"),
      "export function Button(props: { children?: unknown }) { return <button>{props.children as never}</button> }\n"
    )
    fs.writeFileSync(
      path.join(root, "page.tsx"),
      [
        "export function Page() {",
        "  return (",
        "    <div>",
        '      <button className="rounded px-3 py-2 bg-blue-600">Save</button>',
        "      {/* doppel-ignore: brand CTA */}",
        '      <button className="rounded px-3 py-2 bg-pink-600">Join</button>',
        "    </div>",
        "  )",
        "}",
        "",
      ].join("\n")
    )
    const { llm, mid } = makeLlm()
    const report = await runDoppel({ root, llm })
    expect(report.findings.map((f) => f.status).sort()).toEqual(["drift", "ignored"])
    expect(mid.prompts).toHaveLength(1)
  })
})
