import fs from "node:fs"
import path from "node:path"
import { toMarkdown } from "./markdown.js"
import { toSarif } from "./sarif.js"
import type { Report } from "./types.js"

export type ReportFormat = "json" | "md" | "sarif"
export const REPORT_FORMATS: ReportFormat[] = ["json", "md", "sarif"]

export function writeReports(report: Report, outDir: string, formats: ReportFormat[], sarifBaseDir?: string): string[] {
  fs.mkdirSync(outDir, { recursive: true })
  const written: string[] = []
  for (const format of formats) {
    const file = path.join(outDir, `doppel-report.${format}`)
    const body =
      format === "json"
        ? JSON.stringify(report, null, 2)
        : format === "md"
          ? toMarkdown(report)
          : JSON.stringify(toSarif(report, sarifBaseDir), null, 2)
    fs.writeFileSync(file, body)
    written.push(file)
  }
  return written
}
