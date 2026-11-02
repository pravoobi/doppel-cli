/**
 * SARIF 2.1.0, the format GitHub code scanning ingests: uploading it turns each
 * finding into an inline annotation on the PR with no extra integration code.
 */

import path from "node:path"
import type { Finding, Report } from "./types.js"

type SarifLevel = "warning" | "note"

function ruleFor(f: Finding): { id: string; level: SarifLevel; description: string } {
  const component = f.component ?? "component"
  if (f.status === "drift") {
    return {
      id: `ds-drift/${component}`,
      level: "warning",
      description: `Hand-rolled duplicate of the design system's ${component}`,
    }
  }
  return {
    id: `ds-candidate/${component}`,
    level: "note",
    description: `Structurally resembles the design system's ${component} (not yet classified by a model)`,
  }
}

function message(f: Finding): string {
  const parts: string[] = []
  if (f.status === "drift") {
    parts.push(f.adjudication?.rationale ?? `Hand-rolled ${f.component}.`)
    if (f.component && f.importPath) parts.push(`Use: import { ${f.component} } from "${f.importPath}"`)
    if (f.adjudication && f.adjudication.unmappable.length > 0) {
      parts.push(`Can't be mapped cleanly: ${f.adjudication.unmappable.join(", ")}`)
    }
  } else {
    parts.push(`<${f.rootTag}> structurally resembles ${f.shortlist.join(" / ")}. Unclassified: run with a model to confirm.`)
  }
  return parts.join("\n")
}

/**
 * @param baseDir Directory artifact URIs are written relative to. For GitHub,
 * this must be the repository root, which differs from the scan root when
 * scanning one app inside a monorepo.
 */
export function toSarif(report: Report, baseDir: string = report.root): object {
  const reported = report.findings.filter((f) => f.status === "drift" || f.status === "candidate")
  const rules = new Map<string, ReturnType<typeof ruleFor>>()
  const results = reported.map((f) => {
    const rule = ruleFor(f)
    rules.set(rule.id, rule)
    const uri = path.relative(baseDir, path.join(report.root, f.file)).replace(/\\/g, "/")
    return {
      ruleId: rule.id,
      level: rule.level,
      message: { text: message(f) },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri, uriBaseId: "%SRCROOT%" },
            region: { startLine: f.line, endLine: f.endLine },
          },
        },
      ],
      properties: {
        status: f.status,
        component: f.component,
        risk: f.adjudication?.risk ?? null,
        triageConfidence: f.triage?.confidence ?? null,
      },
    }
  })

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "doppel",
            version: report.tool.version,
            informationUri: "https://github.com/pravoobi/doppel-cli",
            rules: [...rules.values()].map((r) => ({
              id: r.id,
              shortDescription: { text: r.description },
              defaultConfiguration: { level: r.level },
            })),
          },
        },
        results,
      },
    ],
  }
}
