import type { Adjudication } from "../agent/schemas.js"
import type { TierModels } from "../llm/models.js"
import type { CostSummary } from "../llm/router.js"

/**
 * - drift / intentional / not-drift: the adjudicator's classification
 * - triaged-out: the cheap pass found no plausible match, so no adjudication was spent on it
 * - candidate: deterministic (--no-llm) mode; structurally matches but was never judged by a model
 * - ignored: a `doppel-ignore` comment sits directly above it
 * - error: a model call failed for this candidate; the rest of the run continued
 */
export type FindingStatus = "drift" | "intentional" | "not-drift" | "triaged-out" | "candidate" | "ignored" | "error"

export type Finding = {
  id: string
  status: FindingStatus
  /** Relative to the scan root, forward slashes. */
  file: string
  line: number
  endLine: number
  rootTag: string
  shortlist: string[]
  /** Best-matching design-system component, when one was identified. */
  component: string | null
  importPath: string | null
  triage: { confidence: number; reason: string } | null
  adjudication: Adjudication | null
  source: string
  error?: string
}

export type ReportStats = {
  filesScanned: number
  componentsIndexed: number
  rawCandidates: number
  shortlisted: number
  filteredBeforeInference: number
  ignored: number
  triagedOut: number
  adjudicated: number
  drift: number
  intentional: number
  notDrift: number
  errors: number
}

export type Report = {
  tool: { name: "doppel"; version: string }
  generatedAt: string
  root: string
  ds: string
  mode: "llm" | "deterministic"
  since?: string
  models?: TierModels
  stats: ReportStats
  findings: Finding[]
  cost?: CostSummary
}
