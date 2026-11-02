#!/usr/bin/env node
/**
 * Generates EXPECTED.json — the ground truth for the drift-demo fixture.
 *
 * Line numbers are DERIVED, never hand-written. Each case declares a unique
 * anchor string and the tag its candidate element is rooted at; this script
 * finds the anchor, scans backwards to the opening tag, and records that line.
 * It refuses to emit anything if an anchor is missing or ambiguous, so the
 * ground truth can never silently drift away from the fixture.
 *
 * Run from the fixture root:  node scripts/generate-expected.mjs
 * Verify without writing:     node scripts/generate-expected.mjs --check
 *
 * Zero dependencies by design — this has to run in CI and inside a sandbox
 * image without an install step.
 */

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CHECK_ONLY = process.argv.includes("--check")

/* ------------------------------------------------------------------ *
 * The manifest. This is the only hand-maintained part of the fixture. *
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} Case
 * @property {string}   id
 * @property {string}   file
 * @property {string}   anchor        Unique substring inside the candidate.
 * @property {string}   rootTag       Tag the candidate element is rooted at.
 * @property {string}   kind          Grouping label for reporting.
 * @property {Object}   expect
 * @property {string}   why           Why this case exists. Shows up in reports.
 */

/** @type {Case[]} */
const CASES = [
  /* ---------------------------------------------------------------- *
   * app/page.tsx                                                     *
   * ---------------------------------------------------------------- */
  {
    id: "btn-001",
    file: "app/page.tsx",
    anchor: "Export CSV",
    rootTag: "button",
    kind: "button",
    why: "Plain hand-rolled primary button. The base case — if this is missed, nothing else matters.",
    expect: {
      detected: true,
      matchedComponent: "Button",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      propMapping: [{ from: "onClick", to: "onClick" }],
    },
  },
  {
    id: "card-001",
    file: "app/page.tsx",
    anchor: "{metrics[0].label}",
    rootTag: "div",
    kind: "card",
    why: "Stat card as a raw div, sitting next to a real <Card> rendering the same shape.",
    expect: {
      detected: true,
      matchedComponent: "Card",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: ["CardContent"],
    },
  },
  {
    id: "badge-001",
    file: "app/page.tsx",
    anchor: "text-emerald-800",
    rootTag: "span",
    kind: "badge",
    why: "Status pill whose colours map exactly onto Badge variant='success'. Should be a clean PASS.",
    expect: {
      detected: true,
      matchedComponent: "Badge",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      propMapping: [{ from: "bg-emerald-100 text-emerald-800", to: 'variant="success"' }],
    },
  },
  {
    id: "card-002",
    file: "app/page.tsx",
    anchor: "{metrics[1].label}",
    rootTag: "div",
    kind: "card",
    why: "Second hand-rolled card, this one already containing a real <Badge>. Tests partial adoption.",
    expect: {
      detected: true,
      matchedComponent: "Card",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: ["CardContent"],
    },
  },

  /* ---------------------------------------------------------------- *
   * app/billing/page.tsx                                             *
   * ---------------------------------------------------------------- */
  {
    id: "alert-001",
    file: "app/billing/page.tsx",
    anchor: "Your last payment failed",
    rootTag: "div",
    kind: "alert",
    why: "Alert that already has role='alert'. Migration is cosmetic, not an a11y fix — pairs with alert-002.",
    expect: {
      detected: true,
      matchedComponent: "Alert",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: ["AlertTitle", "AlertDescription"],
      propMapping: [{ from: "border-red-300 bg-red-50", to: 'variant="destructive"' }],
    },
  },
  {
    id: "badge-002",
    file: "app/billing/page.tsx",
    anchor: "bg-violet-100",
    rootTag: "span",
    kind: "badge",
    why: "Badge in a colour the design system has no variant for. Must surface as unmappable, not silently recoloured.",
    expect: {
      detected: true,
      matchedComponent: "Badge",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "medium",
      unmappable: ["violet palette has no corresponding Badge variant"],
      verdict: "REVIEW",
    },
  },
  {
    id: "btn-002",
    file: "app/billing/page.tsx",
    anchor: "Upgrade to Scale",
    rootTag: "button",
    kind: "button",
    why: "Gradient CTA. Button has no gradient variant, so an honest run reports the tradeoff instead of flattening the design.",
    expect: {
      detected: true,
      matchedComponent: "Button",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "high",
      unmappable: [
        "bg-gradient-to-r has no corresponding Button variant",
        "shadow-lg exceeds the shadow scale Button exposes",
      ],
      verdict: "REVIEW",
    },
  },
  {
    id: "table-001",
    file: "app/billing/page.tsx",
    anchor: '<table className="w-full text-sm">',
    rootTag: "table",
    kind: "table",
    why: "Hand-rolled table with no caption and no scope on headers. Migration is a real a11y gain.",
    expect: {
      detected: true,
      matchedComponent: "Table",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "medium",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: [
        "TableHeader",
        "TableBody",
        "TableRow",
        "TableHead",
        "TableCell",
      ],
      accessibilityGain: "adds <caption> and scope='col' on headers",
    },
  },

  /* ---------------------------------------------------------------- *
   * app/settings/page.tsx                                            *
   * ---------------------------------------------------------------- */
  {
    id: "alert-002",
    file: "app/settings/page.tsx",
    anchor: "Your trial ends in 5 days",
    rootTag: "div",
    kind: "alert",
    why: "Same shape as alert-001 but with no role. Colours map cleanly to variant='warning', so the migration is visually identical and purely an a11y win. This is the headline example for the demo.",
    expect: {
      detected: true,
      matchedComponent: "Alert",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: ["AlertTitle", "AlertDescription"],
      propMapping: [{ from: "border-amber-500/50 bg-amber-50", to: 'variant="warning"' }],
      accessibilityGain: "adds role='alert' — the banner was previously invisible to assistive tech",
    },
  },
  {
    id: "input-001",
    file: "app/settings/page.tsx",
    anchor: "Organisation name",
    rootTag: "div",
    kind: "input",
    why: "Label and input with no htmlFor/id association. Migration must add the association, not just swap tags.",
    expect: {
      detected: true,
      matchedComponent: "Input",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: ["Label"],
      accessibilityGain: "associates label and input via htmlFor/id",
    },
  },
  {
    id: "input-002",
    file: "app/settings/page.tsx",
    anchor: "Primary domain",
    rootTag: "div",
    kind: "input",
    why: "Near-identical copy of input-001. Both must be found — de-duplication that collapses them is a bug.",
    expect: {
      detected: true,
      matchedComponent: "Input",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
      secondaryComponents: ["Label"],
      accessibilityGain: "associates label and input via htmlFor/id",
    },
  },
  {
    id: "btn-003",
    file: "app/settings/page.tsx",
    anchor: "Save changes",
    rootTag: "button",
    kind: "button",
    why: "Slate-palette button. Maps to variant='default' despite not sharing a single class token with it.",
    expect: {
      detected: true,
      matchedComponent: "Button",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
    },
  },

  /* ---------------------------------------------------------------- *
   * app/team/page.tsx                                                *
   * ---------------------------------------------------------------- */
  {
    id: "card-003",
    file: "app/team/page.tsx",
    anchor: "rounded-lg border bg-white p-4 shadow-sm",
    rootTag: "div",
    kind: "card",
    why: "A hand-rolled card nested inside a real <Card>. Genuine drift — but the enclosing real Card must not also be flagged (see negatives).",
    expect: {
      detected: true,
      matchedComponent: "Card",
      classification: "DRIFT",
      minTriageConfidence: 0.5,
      risk: "low",
      unmappable: [],
      verdict: "PASS",
    },
  },
  {
    id: "btn-004",
    file: "app/team/page.tsx",
    anchor: 'role="button"',
    rootTag: "div",
    kind: "button",
    why: "A div with role='button' and a click handler but no keyboard handler and no tabIndex. Keyboard users cannot reach it at all.",
    expect: {
      detected: true,
      matchedComponent: "Button",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "medium",
      unmappable: [],
      verdict: "PASS",
      propMapping: [
        { from: "onClick", to: "onClick" },
        { from: 'role="button"', to: "native <button>" },
      ],
      accessibilityGain:
        "becomes a real button — keyboard focusable, Enter/Space activation, correct role",
    },
  },
  {
    id: "modal-001",
    file: "app/team/page.tsx",
    anchor: "fixed inset-0 z-50 flex items-center justify-center",
    rootTag: "div",
    kind: "dialog",
    why: "Hand-rolled modal: no Escape handling, no focus trap, no focus restore, no aria-modal. Structurally the largest migration in the fixture.",
    expect: {
      detected: true,
      matchedComponent: "Dialog",
      classification: "DRIFT",
      minTriageConfidence: 0.6,
      risk: "high",
      unmappable: [],
      verdict: "REVIEW",
      secondaryComponents: ["DialogContent", "DialogTitle", "DialogFooter"],
      accessibilityGain:
        "adds aria-modal, Escape to dismiss and focus restore on close",
    },
  },

  /* ---------------------------------------------------------------- *
   * Traps. These are what separate a real tool from a regex.         *
   * ---------------------------------------------------------------- */
  {
    id: "trap-001",
    file: "components/marketing/hero.tsx",
    anchor: "Start free",
    rootTag: "a",
    kind: "trap:intentional",
    why: "Brand-owned marketing CTA. Structurally a button, deliberately off-system. Migrating it would be a regression. A tool that flags this as DRIFT does not understand design systems.",
    expect: {
      detected: true,
      matchedComponent: "Button",
      classification: "INTENTIONAL_DEVIATION",
      minTriageConfidence: 0.4,
      risk: null,
      unmappable: [],
      verdict: null,
      patchGenerated: false,
    },
  },
  {
    id: "trap-002",
    file: "components/layout/shell.tsx",
    anchor: "min-h-full rounded-xl border bg-white p-6 shadow-sm",
    rootTag: "div",
    kind: "trap:not-drift",
    why: "Carries every class token a Card carries, but it is a layout region with no grouping semantics. The shortlist rules will surface it; the adjudicator has to reject it.",
    expect: {
      detected: true,
      matchedComponent: "Card",
      classification: "NOT_DRIFT",
      minTriageConfidence: 0.3,
      risk: null,
      unmappable: [],
      verdict: null,
      patchGenerated: false,
    },
  },
  {
    id: "trap-003",
    file: "components/reports/report-viewer.tsx",
    anchor: "Download PDF",
    rootTag: "button",
    kind: "trap:unverifiable",
    why: "Genuine drift inside a component that cannot mount in isolation — it needs route params, a query string and a context with no default. The patch must be generated AND labelled unproven. Claiming PASS here is the single worst failure mode in the product.",
    expect: {
      detected: true,
      matchedComponent: "Button",
      classification: "DRIFT",
      minTriageConfidence: 0.7,
      risk: "low",
      unmappable: [],
      verdict: "UNVERIFIABLE",
      patchGenerated: true,
      unverifiableReason:
        "requires useParams, useSearchParams and WorkspaceContext; throws outside a provider",
    },
  },
]

/**
 * Places that must NOT be reported as drift. False positives here are what
 * make the tool look naive in a demo, so they are asserted explicitly.
 */
const NEGATIVES = [
  {
    id: "neg-001",
    file: "app/page.tsx",
    anchor: "{metrics[2].label}",
    rootTag: "Card",
    why: "A correct <Card> usage sitting between two drifted copies.",
  },
  {
    id: "neg-002",
    file: "app/page.tsx",
    anchor: 'className="flex items-center justify-between border-b py-3 last:border-0"',
    rootTag: "div",
    why: "A list row. Bordered and padded, but no component in the system represents it.",
  },
  {
    id: "neg-003",
    file: "app/settings/page.tsx",
    anchor: 'htmlFor="billing-email"',
    rootTag: "Label",
    why: "A correctly associated Label/Input pair, two fields below two drifted ones.",
  },
  {
    id: "neg-004",
    file: "app/team/page.tsx",
    anchor: 'variant="destructive"',
    rootTag: "Button",
    why: "A real Button inside the hand-rolled modal. Partial adoption must not drag correct usages into the report.",
  },
  {
    id: "neg-005",
    file: "components/ui/card.tsx",
    anchor: '"rounded-xl border bg-card text-card-foreground shadow"',
    rootTag: "div",
    why: "The design system's own source. Scanning must exclude the DS directory or every primitive self-reports as drift.",
  },
  {
    id: "neg-006",
    file: "app/page.tsx",
    anchor: 'className="mx-auto flex max-w-6xl flex-col gap-8 p-8"',
    rootTag: "div",
    why: "Page shell. Padding and flex alone must never be enough to flag something.",
  },
]

/** Aggregate thresholds the M1 and M2 gates assert against. */
const TARGETS = {
  detectionRecall: 1.0,
  minPrecision: 0.8,
  maxFalsePositives: 4,
  minClassificationAccuracy: 0.85,
  minVerdictAccuracy: 0.8,
  lineMatchTolerance: 2,
}

/* ------------------------------------------------------------------ *
 * Resolution                                                         *
 * ------------------------------------------------------------------ */

const fileCache = new Map()

function loadFile(relPath) {
  if (!fileCache.has(relPath)) {
    const text = readFileSync(resolve(ROOT, relPath), "utf8")
    fileCache.set(relPath, {
      text,
      lines: text.split("\n"),
      sha256: createHash("sha256").update(text).digest("hex").slice(0, 16),
    })
  }
  return fileCache.get(relPath)
}

const errors = []

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function resolveAnchor(entry) {
  const { lines } = loadFile(entry.file)

  const hits = []
  lines.forEach((line, i) => {
    if (line.includes(entry.anchor)) hits.push(i)
  })

  if (hits.length === 0) {
    errors.push(`${entry.id}: anchor not found in ${entry.file} — ${JSON.stringify(entry.anchor)}`)
    return null
  }
  if (hits.length > 1) {
    errors.push(
      `${entry.id}: anchor is ambiguous in ${entry.file} (${hits.length} hits on lines ${hits
        .map((h) => h + 1)
        .join(", ")}) — make it more specific`
    )
    return null
  }

  const anchorIndex = hits[0]

  // Walk backwards to the opening tag the candidate is rooted at.
  // The boundary assertion matters: without it `<Card` also matches
  // `<CardTitle`, and the anchor silently lands on the wrong element.
  const open = new RegExp(`<${escapeRegExp(entry.rootTag)}(?![A-Za-z0-9_-])`)
  let elementIndex = -1
  for (let i = anchorIndex; i >= 0 && i > anchorIndex - 40; i--) {
    if (open.test(lines[i])) {
      elementIndex = i
      break
    }
  }

  if (elementIndex === -1) {
    errors.push(
      `${entry.id}: no <${entry.rootTag} found within 40 lines above the anchor in ${entry.file}`
    )
    return null
  }

  return {
    line: elementIndex + 1,
    anchorLine: anchorIndex + 1,
    snippet: lines[elementIndex].trim().slice(0, 120),
  }
}

/* ------------------------------------------------------------------ *
 * Emit                                                               *
 * ------------------------------------------------------------------ */

const resolvedCases = CASES.map((c) => {
  const loc = resolveAnchor(c)
  return {
    id: c.id,
    kind: c.kind,
    file: c.file,
    line: loc?.line ?? null,
    anchor: c.anchor,
    anchorLine: loc?.anchorLine ?? null,
    rootTag: c.rootTag,
    snippet: loc?.snippet ?? null,
    why: c.why,
    expect: c.expect,
  }
})

const resolvedNegatives = NEGATIVES.map((n) => {
  const loc = resolveAnchor(n)
  return {
    id: n.id,
    file: n.file,
    line: loc?.line ?? null,
    anchor: n.anchor,
    rootTag: n.rootTag,
    snippet: loc?.snippet ?? null,
    why: n.why,
    expect: { detected: false },
  }
})

if (errors.length > 0) {
  console.error("\n  EXPECTED.json was not written. Unresolved anchors:\n")
  for (const e of errors) console.error(`   • ${e}`)
  console.error("")
  process.exit(1)
}

const files = [...new Set([...CASES, ...NEGATIVES].map((c) => c.file))].sort()

const counts = resolvedCases.reduce((acc, c) => {
  acc[c.kind] = (acc[c.kind] ?? 0) + 1
  return acc
}, {})

const output = {
  $schema: "./expected.schema.json",
  version: 1,
  fixture: "drift-demo",
  generatedBy: "scripts/generate-expected.mjs",
  note:
    "Generated file. Do not hand-edit — change the manifest in the generator and re-run. " +
    "Line numbers are resolved from anchors, and fileHashes pin the fixture content they were resolved against.",
  designSystem: {
    path: "components/ui",
    components: [
      "Button",
      "Card",
      "Alert",
      "Badge",
      "Input",
      "Label",
      "Dialog",
      "Table",
    ],
  },
  summary: {
    totalCases: resolvedCases.length,
    trueDrifts: resolvedCases.filter((c) => c.expect.classification === "DRIFT").length,
    traps: resolvedCases.filter((c) => c.kind.startsWith("trap:")).length,
    negatives: resolvedNegatives.length,
    byKind: counts,
    byVerdict: resolvedCases.reduce((acc, c) => {
      const v = c.expect.verdict ?? "n/a"
      acc[v] = (acc[v] ?? 0) + 1
      return acc
    }, {}),
  },
  targets: TARGETS,
  fileHashes: Object.fromEntries(
    files.map((f) => [f, loadFile(f).sha256])
  ),
  cases: resolvedCases,
  negatives: resolvedNegatives,
}

const outPath = resolve(ROOT, "EXPECTED.json")
const serialized = JSON.stringify(output, null, 2) + "\n"

if (CHECK_ONLY) {
  let current = ""
  try {
    current = readFileSync(outPath, "utf8")
  } catch {
    console.error("  EXPECTED.json is missing. Run without --check to generate it.")
    process.exit(1)
  }
  if (current !== serialized) {
    console.error(
      "  EXPECTED.json is stale — the fixture changed since it was generated.\n" +
        "  Run: node scripts/generate-expected.mjs"
    )
    process.exit(1)
  }
  console.log("  EXPECTED.json is up to date.")
  process.exit(0)
}

writeFileSync(outPath, serialized)

console.log(`  Wrote EXPECTED.json`)
console.log(`   ${output.summary.totalCases} cases (${output.summary.trueDrifts} drift, ${output.summary.traps} traps)`)
console.log(`   ${output.summary.negatives} negatives across ${files.length} files`)
console.log(`   verdicts: ${JSON.stringify(output.summary.byVerdict)}`)
