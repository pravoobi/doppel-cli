import fs from "node:fs"
import path from "node:path"
import type { Project } from "ts-morph"
import { adjudicateCandidate } from "./agent/adjudicate.js"
import { mapLimit } from "./agent/concurrency.js"
import { describeComponents } from "./agent/describe.js"
import { triageCandidates } from "./agent/triage.js"
import { ConfigError } from "./errors.js"
import type { Llm } from "./llm/router.js"
import type { Finding, Report, ReportStats } from "./report/types.js"
import { buildDsIndex } from "./scanner/index-ds.js"
import { extractCandidates, normalizePath, shortlistCandidates } from "./scanner/extract.js"
import { detectDsDir, detectImportAlias, loadProject } from "./scanner/project.js"
import type { Candidate, DsComponent, DsIndex, ShortlistedCandidate } from "./types.js"
import { VERSION } from "./version.js"

export type ScanOptions = {
  root: string
  /** Design-system directory, relative to root. Auto-detected when omitted. */
  ds?: string
  /** Absolute paths; when set, only these files are scanned for candidates. */
  onlyFiles?: string[]
  /** Extra directories to skip, relative to root. */
  exclude?: string[]
}

export type ScanResult = {
  root: string
  dsDirAbsPath: string
  dsIndex: DsIndex
  candidates: Candidate[]
  shortlisted: ShortlistedCandidate[]
  scannedFiles: string[]
  project: Project
}

/** The deterministic half of the pipeline: index the DS, extract, shortlist. No network, no model. */
export function scanRepo(opts: ScanOptions): ScanResult {
  const root = path.resolve(opts.root)
  const dsDirAbsPath = detectDsDir(root, opts.ds)
  if (!dsDirAbsPath) {
    throw new ConfigError(
      opts.ds
        ? `Design system directory not found: ${path.resolve(root, opts.ds)}`
        : `No design system directory found under ${root} (looked for components/ui, src/components/ui). Pass --ds <path>.`
    )
  }

  const project = loadProject(root)
  const alias = detectImportAlias(project, root)
  const dsIndex = buildDsIndex(project, dsDirAbsPath, { importAlias: alias.prefix, aliasRootAbsPath: alias.rootAbsPath })

  const { candidates, scannedFiles } = extractCandidates(project, {
    dsDirAbsPath,
    excludeDirs: (opts.exclude ?? []).map((d) => path.resolve(root, d)),
    onlyFiles: opts.onlyFiles ? new Set(opts.onlyFiles.map(normalizePath)) : undefined,
  })
  const shortlisted = shortlistCandidates(
    candidates,
    dsIndex.components.map((c) => c.name)
  )

  return { root, dsDirAbsPath, dsIndex, candidates, shortlisted, scannedFiles, project }
}

export type RunOptions = ScanOptions & {
  /** Null runs deterministically: candidates are reported without any model judgment. */
  llm: Llm | null
  /** Triage results below this confidence are not adjudicated. */
  minConfidence?: number
  concurrency?: number
  /** Where the DS description cache lives; omit to disable caching. */
  cacheDir?: string
  /** Recorded on the report when the scan was limited to changed files. */
  since?: string
  onProgress?: (message: string) => void
}

const IGNORE_MARKER = "doppel-ignore"
const MAX_FULL_FILE_LINES = 300
const CONTEXT_LINES = 60

function fileLines(cache: Map<string, string[]>, file: string): string[] {
  let lines = cache.get(file)
  if (!lines) {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
    cache.set(file, lines)
  }
  return lines
}

/** A `doppel-ignore` comment on either of the two lines directly above the candidate. */
function isIgnored(lines: string[], line: number): boolean {
  return lines.slice(Math.max(0, line - 3), line - 1).some((l) => l.includes(IGNORE_MARKER))
}

function surroundingSource(lines: string[], line: number, endLine: number): string {
  if (lines.length <= MAX_FULL_FILE_LINES) return lines.join("\n")
  const start = Math.max(0, line - 1 - CONTEXT_LINES)
  const end = Math.min(lines.length, endLine + CONTEXT_LINES)
  return [`// ... (lines ${start + 1}-${end} of ${lines.length})`, ...lines.slice(start, end)].join("\n")
}

export async function runDoppel(opts: RunOptions): Promise<Report> {
  const progress = opts.onProgress ?? (() => {})
  const scan = scanRepo(opts)
  const rel = (f: string) => path.relative(scan.root, f).replace(/\\/g, "/")
  const linesCache = new Map<string, string[]>()
  progress(
    `Indexed ${scan.dsIndex.components.length} design-system components; ` +
      `${scan.candidates.length} raw candidates in ${scan.scannedFiles.length} files, ${scan.shortlisted.length} shortlisted`
  )

  const findings: Finding[] = scan.shortlisted.map((c) => ({
    id: c.id,
    status: "candidate",
    file: rel(c.file),
    line: c.line,
    endLine: c.endLine,
    rootTag: c.fingerprint.rootTag,
    shortlist: c.shortlist,
    component: c.shortlist[0] ?? null,
    importPath: null,
    triage: null,
    adjudication: null,
    source: c.sourceText,
  }))
  const byId = new Map(findings.map((f) => [f.id, f]))
  const componentsByName = new Map<string, DsComponent>(scan.dsIndex.components.map((c) => [c.name, c]))

  for (const c of scan.shortlisted) {
    if (isIgnored(fileLines(linesCache, c.file), c.line)) byId.get(c.id)!.status = "ignored"
  }
  const active = scan.shortlisted.filter((c) => byId.get(c.id)!.status !== "ignored")

  if (opts.llm && active.length > 0) {
    const llm = opts.llm
    const concurrency = opts.concurrency ?? 4

    const described = await describeComponents(llm, scan.dsIndex.components, {
      concurrency,
      cacheFile: opts.cacheDir ? path.join(opts.cacheDir, "ds-descriptions.json") : undefined,
    })
    for (const c of described.components) componentsByName.set(c.name, c)
    progress(
      `Described ${described.components.length} components (${described.cached} from cache` +
        `${described.failed.length ? `, ${described.failed.length} failed` : ""})`
    )

    const triage = await triageCandidates(llm, active, described.components, { concurrency })
    const minConfidence = opts.minConfidence ?? 0.4
    const toAdjudicate: ShortlistedCandidate[] = []
    for (const c of active) {
      const f = byId.get(c.id)!
      const t = triage.get(c.id)
      if (t) f.triage = { confidence: t.confidence, reason: t.reason }
      if (t?.match && (t.rerouted || t.confidence >= minConfidence)) {
        f.component = t.match
        toAdjudicate.push(c)
      } else {
        f.status = "triaged-out"
      }
    }
    progress(`Triage kept ${toAdjudicate.length} of ${active.length} candidates for review`)

    await mapLimit(toAdjudicate, concurrency, async (c) => {
      const f = byId.get(c.id)!
      const component = componentsByName.get(f.component!)!
      try {
        const a = await adjudicateCandidate(llm, {
          candidateSource: c.sourceText,
          surroundingSource: surroundingSource(fileLines(linesCache, c.file), c.line, c.endLine),
          component,
        })
        f.adjudication = a
        f.status = a.classification === "DRIFT" ? "drift" : a.classification === "INTENTIONAL_DEVIATION" ? "intentional" : "not-drift"
      } catch (err) {
        f.status = "error"
        f.error = (err as Error).message
      }
    })
  }

  for (const f of findings) {
    if (f.component) f.importPath = componentsByName.get(f.component)?.importPath ?? null
  }

  const count = (s: Finding["status"]) => findings.filter((f) => f.status === s).length
  const stats: ReportStats = {
    filesScanned: scan.scannedFiles.length,
    componentsIndexed: scan.dsIndex.components.length,
    rawCandidates: scan.candidates.length,
    shortlisted: scan.shortlisted.length,
    filteredBeforeInference: scan.candidates.length - scan.shortlisted.length,
    ignored: count("ignored"),
    triagedOut: count("triaged-out"),
    adjudicated: findings.filter((f) => f.adjudication !== null).length,
    drift: count("drift"),
    intentional: count("intentional"),
    notDrift: count("not-drift"),
    errors: count("error"),
  }

  return {
    tool: { name: "doppel", version: VERSION },
    generatedAt: new Date().toISOString(),
    root: scan.root,
    ds: rel(scan.dsDirAbsPath),
    mode: opts.llm ? "llm" : "deterministic",
    since: opts.since,
    models: opts.llm?.models,
    stats,
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    cost: opts.llm ? opts.llm.costSummary() : undefined,
  }
}
