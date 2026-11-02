#!/usr/bin/env node
/**
 * Scores a doppel JSON report of the drift-demo fixture against its ground truth.
 *
 *   node dist/cli.js scan test/fixtures/drift-demo --out .doppel/eval
 *   node scripts/eval-fixture.mjs .doppel/eval
 *
 * A case counts as correct when the finding has the expected classification and,
 * where the fixture names one, the expected design-system component.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const outDir = process.argv[2] ?? ".doppel"
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const report = JSON.parse(fs.readFileSync(path.resolve(outDir, "doppel-report.json"), "utf8"))
const expected = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "test/fixtures/drift-demo/EXPECTED.json"), "utf8")
)

const STATUS_TO_CLASS = { drift: "DRIFT", intentional: "INTENTIONAL_DEVIATION", "not-drift": "NOT_DRIFT" }
const tolerance = expected.targets.lineMatchTolerance
let correct = 0
let total = 0

for (const c of expected.cases) {
  if (!c.expect.detected || c.line === null) continue
  total++
  const f = report.findings.find((f) => f.file === c.file && Math.abs(f.line - c.line) <= tolerance)
  const got = f ? (STATUS_TO_CLASS[f.status] ?? f.status) : "missing"
  const componentOk = !c.expect.matchedComponent || f?.component === c.expect.matchedComponent
  if (got === c.expect.classification && componentOk) {
    correct++
  } else {
    console.log(`miss  ${c.id.padEnd(10)} ${c.file}:${c.line}  want ${c.expect.classification} ${c.expect.matchedComponent ?? ""}, got ${got} ${f?.component ?? ""}`)
  }
}

const cost = report.cost
console.log(`\n${correct}/${total} classified correctly (${report.mode} mode, models: ${report.models ? Object.values(report.models).join(", ") : "none"})`)
if (cost) console.log(`${cost.calls} model calls, cost ${cost.costUsd === null ? "unknown" : `$${cost.costUsd.toFixed(4)}`}`)
process.exit(report.mode === "llm" && correct < total ? 1 : 0)
