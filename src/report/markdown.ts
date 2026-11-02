import type { CostSummary } from "../llm/router.js"
import type { Finding, Report } from "./types.js"

const STATUS_LABEL: Record<Finding["status"], string> = {
  drift: "Drift",
  intentional: "Intentional",
  "not-drift": "Not drift",
  "triaged-out": "Dismissed by triage",
  candidate: "Candidate",
  ignored: "Ignored",
  error: "Error",
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
}

function fence(code: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((m) => m.length))
  const ticks = "`".repeat(longest + 1)
  return `${ticks}tsx\n${code}\n${ticks}`
}

export function formatUsd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

export function costLine(cost: CostSummary): string {
  const tokens = `${cost.inputTokens.toLocaleString("en-US")} input / ${cost.outputTokens.toLocaleString("en-US")} output tokens`
  const price =
    cost.costUsd !== null
      ? formatUsd(cost.costUsd)
      : `cost unknown (no pricing for ${cost.unpricedModels.map((m) => `\`${m}\``).join(", ")}; add it under "pricing" in doppel.config.json)`
  return `${cost.calls} model calls · ${tokens} · ${price}`
}

function importLine(f: Finding): string | null {
  return f.component && f.importPath ? `import { ${f.component} } from "${f.importPath}"` : null
}

function driftSection(f: Finding): string {
  const a = f.adjudication
  const out = [`### \`${f.file}:${f.line}\` → \`${f.component}\``, ""]
  if (a?.risk) out.push(`Risk: **${a.risk}**${f.triage ? ` · triage confidence ${Math.round(f.triage.confidence * 100)}%` : ""}`, "")
  if (a?.rationale) out.push(a.rationale, "")
  const imp = importLine(f)
  if (imp) out.push(`Use: \`${imp}\``, "")
  if (a && a.propMapping.length > 0) {
    out.push(
      "Prop mapping:",
      ...a.propMapping.map((p) => {
        const to = p.to.trim() ? `\`${p.to}\`` : `built into ${f.component}`
        return `- \`${p.from}\` → ${to}${p.note ? ` (${p.note})` : ""}`
      }),
      ""
    )
  }
  if (a && a.unmappable.length > 0) {
    out.push("Can't be mapped cleanly:", ...a.unmappable.map((u) => `- \`${u}\``), "")
  }
  out.push("<details><summary>Source</summary>", "", fence(f.source), "", "</details>", "")
  return out.join("\n")
}

export function toMarkdown(report: Report): string {
  const s = report.stats
  const out: string[] = ["## Doppel: design-system drift report", ""]

  if (report.mode === "llm") {
    const headline =
      s.drift === 0 ? "No drift found" : `**${s.drift} drift finding${s.drift === 1 ? "" : "s"}**`
    out.push(
      `${headline} in ${s.filesScanned} files scanned${report.since ? ` (changed since \`${report.since}\`)` : ""}. ` +
        `${s.shortlisted} candidates shortlisted, ${s.filteredBeforeInference} filtered before any model call, ` +
        `${s.triagedOut} dismissed by triage, ${s.intentional} intentional, ${s.notDrift} not drift.`,
      ""
    )
  } else {
    out.push(
      `Deterministic scan (no model): **${s.shortlisted} candidate${s.shortlisted === 1 ? "" : "s"}** structurally ` +
        `resemble a design-system component in ${s.filesScanned} files scanned. These are unconfirmed; run with a model ` +
        "configured to classify them.",
      ""
    )
  }

  const listed = report.findings.filter((f) => ["drift", "candidate", "intentional", "error"].includes(f.status))
  if (listed.length > 0) {
    out.push("| Status | Location | Component | Risk |", "|---|---|---|---|")
    for (const f of listed) {
      out.push(
        `| ${STATUS_LABEL[f.status]} | \`${cell(`${f.file}:${f.line}`)}\` | ${cell(f.component ?? "")} | ${f.adjudication?.risk ?? ""} |`
      )
    }
    out.push("")
  }

  for (const f of report.findings.filter((f) => f.status === "drift")) out.push(driftSection(f))

  const intentional = report.findings.filter((f) => f.status === "intentional")
  if (intentional.length > 0) {
    out.push("### Intentional deviations (left alone)", "")
    for (const f of intentional) out.push(`- \`${f.file}:${f.line}\` (${f.component}): ${f.adjudication?.rationale ?? ""}`)
    out.push("")
  }

  const errors = report.findings.filter((f) => f.status === "error")
  if (errors.length > 0) {
    out.push("### Errors", "")
    for (const f of errors) out.push(`- \`${f.file}:${f.line}\`: ${f.error}`)
    out.push("")
  }

  if (report.cost) out.push(`<sub>${costLine(report.cost)}</sub>`, "")
  out.push(`<sub>doppel ${report.tool.version}</sub>`, "")
  return out.join("\n")
}
