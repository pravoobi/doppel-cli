import path from "node:path"
import { describe, expect, it } from "vitest"
import { toMarkdown } from "../src/report/markdown.js"
import { toSarif } from "../src/report/sarif.js"
import type { Finding, Report } from "../src/report/types.js"

const base: Omit<Finding, "id" | "status"> = {
  file: "app/page.tsx",
  line: 10,
  endLine: 14,
  rootTag: "button",
  shortlist: ["Button"],
  component: "Button",
  importPath: "@/components/ui/button",
  triage: { confidence: 0.9, reason: "button-shaped" },
  adjudication: {
    classification: "DRIFT",
    rationale: "Hand-rolled Button | with a pipe.",
    propMapping: [{ from: "bg-red-600", to: "variant='destructive'", note: null }],
    unmappable: ["bg-gradient-to-r"],
    risk: "medium",
  },
  source: '<button className="a">```Save```</button>',
}

function report(findings: Finding[], mode: Report["mode"] = "llm"): Report {
  return {
    tool: { name: "doppel", version: "0.0.0-test" },
    generatedAt: "2026-01-01T00:00:00.000Z",
    root: path.resolve("/repo/apps/web"),
    ds: "components/ui",
    mode,
    stats: {
      filesScanned: 3, componentsIndexed: 5, rawCandidates: 9, shortlisted: findings.length, filteredBeforeInference: 9 - findings.length,
      ignored: 0, triagedOut: 0, adjudicated: findings.length, drift: findings.filter((f) => f.status === "drift").length,
      intentional: findings.filter((f) => f.status === "intentional").length, notDrift: 0, errors: 0,
    },
    findings,
    cost: { calls: 3, inputTokens: 1000, outputTokens: 200, costUsd: null, unpricedModels: ["openai:x"], byTier: {}, byStage: {} },
  }
}

describe("markdown report", () => {
  const md = toMarkdown(
    report([
      { ...base, id: "c1", status: "drift" },
      { ...base, id: "c2", status: "intentional", line: 30, adjudication: { ...base.adjudication!, classification: "INTENTIONAL_DEVIATION", rationale: "Marketing hero." } },
    ])
  )

  it("summarises and details drift with the import to use", () => {
    expect(md).toContain("**1 drift finding**")
    expect(md).toContain('Use: `import { Button } from "@/components/ui/button"`')
    expect(md).toContain("Can't be mapped cleanly:")
    expect(md).toContain("Intentional deviations (left alone)")
  })

  it("escapes table pipes and fences source containing backticks", () => {
    expect(md).toContain("````tsx")
    expect(md).not.toMatch(/\| Drift \|[^\n]*\|[^\n]*\|[^\n]*\| with a pipe/)
  })

  it("renders an empty mapping target as built-in, not an empty code span", () => {
    const withEmpty = toMarkdown(
      report([
        {
          ...base,
          id: "c1",
          status: "drift",
          adjudication: { ...base.adjudication!, propMapping: [{ from: 'role="alert"', to: "", note: "Alert sets it" }] },
        },
      ])
    )
    expect(withEmpty).toContain('- `role="alert"` → built into Button (Alert sets it)')
    expect(withEmpty).not.toContain("→ ``")
  })

  it("says cost is unknown instead of inventing a price", () => {
    expect(md).toContain("cost unknown (no pricing for `openai:x`")
  })
})

describe("sarif report", () => {
  it("reports drift as warnings with repo-relative URIs", () => {
    const sarif = toSarif(report([{ ...base, id: "c1", status: "drift" }]), path.resolve("/repo")) as {
      version: string
      runs: Array<{ results: Array<{ ruleId: string; level: string; locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }> }> }>
    }
    const result = sarif.runs[0].results[0]
    expect(sarif.version).toBe("2.1.0")
    expect(result.ruleId).toBe("ds-drift/Button")
    expect(result.level).toBe("warning")
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("apps/web/app/page.tsx")
    expect(result.locations[0].physicalLocation.region.startLine).toBe(10)
  })

  it("leaves intentional and not-drift findings out", () => {
    const sarif = toSarif(report([{ ...base, id: "c1", status: "intentional" }])) as { runs: Array<{ results: unknown[] }> }
    expect(sarif.runs[0].results).toEqual([])
  })

  it("reports deterministic candidates as notes", () => {
    const sarif = toSarif(report([{ ...base, id: "c1", status: "candidate", adjudication: null }], "deterministic")) as {
      runs: Array<{ results: Array<{ level: string }> }>
    }
    expect(sarif.runs[0].results[0].level).toBe("note")
  })
})
