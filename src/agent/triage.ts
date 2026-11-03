/** Cheap tier, batched: per-call overhead dominates at this volume, so 20 candidates go in each call. */

import type { Llm } from "../llm/router.js"
import { shortlistReason } from "../scanner/shortlist.js"
import type { DsComponent, ShortlistedCandidate } from "../types.js"
import { mapLimit } from "./concurrency.js"
import { loadPrompt } from "./prompts.js"
import { TriageBatchSchema, type TriageResult } from "./schemas.js"

const BATCH_SIZE = 20

/**
 * `rerouted`: triage's answer for this candidate was unusable (it named a
 * component outside the candidate's shortlist, or skipped the candidate
 * entirely), so it goes to adjudication under its own shortlist regardless of
 * confidence. Triage exists to save money, not to have the last word: a lost
 * candidate is real drift nobody ever reviews.
 */
export type TriageOutcome = TriageResult & { rerouted?: boolean }

const EXCERPT_CHARS = 600

function excerpt(source: string): string {
  const compact = source.replace(/\s+/g, " ").trim()
  return compact.length <= EXCERPT_CHARS ? compact : `${compact.slice(0, EXCERPT_CHARS)} …`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function triageBatch(
  llm: Llm,
  batch: ShortlistedCandidate[],
  byName: Map<string, DsComponent>,
  out: Map<string, TriageOutcome>
): Promise<void> {
  const names = [...new Set(batch.flatMap((c) => c.shortlist))]
  const componentDescriptions = names
    .map((name) => {
      const c = byName.get(name)
      const aliases = c?.aliases.length ? ` (also called: ${c.aliases.join(", ")})` : ""
      return `- ${name}: ${c?.description || "(no description)"}${aliases}`
    })
    .join("\n")

  const candidatesJson = JSON.stringify(
    batch.map((c) => ({
      id: c.id,
      rootTag: c.fingerprint.rootTag,
      // Without child tags, a wrapper <div> around a <label> + <input> looks like a bare flex container.
      childTags: c.fingerprint.childTags,
      depth: c.fingerprint.depth,
      classTokens: c.fingerprint.classTokens,
      ariaRole: c.fingerprint.ariaRole,
      hasHandler: c.fingerprint.hasHandler,
      textSample: c.fingerprint.textSample,
      shortlist: c.shortlist,
      shortlistedAs: Object.fromEntries(c.shortlist.map((name) => [name, shortlistReason(name) ?? name])),
      // The fingerprint only describes the root element; for a wrapper, the drift evidence is
      // often on its children (a hand-styled <input> inside a field <div>).
      source: excerpt(c.sourceText),
    })),
    null,
    2
  )

  const { results } = await llm.generate({
    tier: "cheap",
    stage: "triage",
    prompt: loadPrompt("triage", { componentDescriptions, candidates: candidatesJson }),
    schema: TriageBatchSchema,
    schemaName: "TriageBatch",
  })

  const batchById = new Map(batch.map((c) => [c.id, c]))
  for (const r of results) {
    const candidate = batchById.get(r.id)
    if (!candidate) continue
    if (r.match && !candidate.shortlist.includes(r.match)) {
      // Seen live: a gradient <button> answered with the modal's "full-screen overlay" reason,
      // i.e. the model mixed up rows in the batch. Its confidence can't be trusted.
      out.set(r.id, {
        ...r,
        match: candidate.shortlist[0],
        reason: `Triage answered "${r.match}", outside this candidate's shortlist; reviewing as ${candidate.shortlist[0]}.`,
        rerouted: true,
      })
      continue
    }
    out.set(r.id, r)
  }
}

export async function triageCandidates(
  llm: Llm,
  candidates: ShortlistedCandidate[],
  components: DsComponent[],
  opts: { concurrency: number }
): Promise<Map<string, TriageOutcome>> {
  const byName = new Map(components.map((c) => [c.name, c]))
  const out = new Map<string, TriageOutcome>()

  await mapLimit(chunk(candidates, BATCH_SIZE), opts.concurrency, (batch) => triageBatch(llm, batch, byName, out))

  // Batched answers sometimes skip a row. Ask once more for just those, then fail open.
  const missing = candidates.filter((c) => !out.has(c.id))
  if (missing.length > 0) {
    await mapLimit(chunk(missing, BATCH_SIZE), opts.concurrency, (batch) => triageBatch(llm, batch, byName, out))
  }
  for (const c of candidates) {
    if (out.has(c.id)) continue
    out.set(c.id, {
      id: c.id,
      match: c.shortlist[0],
      confidence: 0,
      reason: `Triage returned no answer for this candidate; reviewing as ${c.shortlist[0]}.`,
      rerouted: true,
    })
  }
  return out
}
