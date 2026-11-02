# drift-demo — Doppel's ground-truth fixture

A small admin dashboard built on a shadcn/ui-style design system, with drift planted in it
deliberately. This is what every Doppel gate measures against.

It is written the way drift actually accumulates — a rushed export button, a field copied three
weeks later by someone else, a card nested inside a real card — rather than the way test fixtures
are usually written. If the planted cases look artificial, the precision numbers measured against
them are worthless.

```
drift-demo/
├── components/ui/          the design system: Button, Card, Alert, Badge,
│                           Input, Label, Dialog, Table
├── app/
│   ├── page.tsx            4 cases   dashboard overview
│   ├── billing/page.tsx    4 cases   invoices and plan
│   ├── settings/page.tsx   4 cases   org settings form
│   └── team/page.tsx       3 cases   member list and remove modal
├── components/
│   ├── marketing/hero.tsx        trap-001  INTENTIONAL_DEVIATION
│   ├── layout/shell.tsx          trap-002  NOT_DRIFT
│   └── reports/report-viewer.tsx trap-003  UNVERIFIABLE
├── EXPECTED.json           generated ground truth — do not hand-edit
└── scripts/
    └── generate-expected.mjs     the manifest + resolver
```

## What's planted

18 cases: **15 true drifts** and **3 traps**, plus **6 negatives** that must never be flagged.

| Kind | Count | Cases |
|---|---|---|
| Button | 4 | `btn-001` … `btn-004` |
| Card | 3 | `card-001` … `card-003` |
| Alert | 2 | `alert-001`, `alert-002` |
| Badge | 2 | `badge-001`, `badge-002` |
| Input | 2 | `input-001`, `input-002` |
| Table | 1 | `table-001` |
| Dialog | 1 | `modal-001` |
| Traps | 3 | `trap-001` … `trap-003` |

Expected verdicts: 12 `PASS`, 3 `REVIEW`, 1 `UNVERIFIABLE`, 2 with no verdict (no patch generated).

### The cases that matter most

**`alert-002` — the headline demo.** Structurally identical to `alert-001`, but with no
`role="alert"`. Its amber palette maps cleanly onto `variant="warning"`, so the migration is
pixel-identical and purely an accessibility gain: a banner that assistive technology previously
could not announce at all. This is the finding to put on screen at 0:50 in the video.

**`btn-002` — the honest tradeoff.** A gradient CTA. `Button` has no gradient variant, so the
correct output is `REVIEW` with `unmappable` populated, not a silent flattening of the design. A
tool that reports this as a clean `PASS` is lying.

**`btn-004` — the accessibility case.** A `<div role="button">` with a click handler, no
`tabIndex`, no key handler. Keyboard users cannot reach it. Migration makes it a real button.

**`card-003` — the over-eager matching test.** A hand-rolled card *inside* a real `<Card>`. The
inner one is genuine drift; the outer one is `neg-004`-adjacent and must stay clean. A scanner
that flags both has no notion of nesting.

**`trap-001` — does it understand design systems at all?** A brand-owned marketing CTA.
Structurally a button, deliberately off-system, signed off by the brand team. Migrating it would
be a regression. `INTENTIONAL_DEVIATION`, no patch.

**`trap-002` — does it match on meaning or on class tokens?** A layout region carrying every
class a `Card` carries — `rounded-xl border bg-white p-6 shadow-sm` — with no grouping semantics
whatsoever. The shortlist rules *will* surface it. The adjudicator has to reject it.

**`trap-003` — the worst failure mode in the product.** Real drift inside a component that cannot
mount in isolation: it reads route params, reads the query string, and consumes a context with no
default value that throws outside its provider. Doppel must generate the patch **and** return
`UNVERIFIABLE`. Reporting `PASS` here — claiming a render-verified result for something that was
never rendered — destroys the entire trust argument the product rests on.

## Ground truth

`EXPECTED.json` is generated, never hand-written. Each case in the manifest declares a unique
anchor string and the tag its element is rooted at; the resolver finds the anchor, scans backwards
to the opening tag, and records that line. It refuses to emit anything if an anchor is missing or
ambiguous, so ground truth cannot silently drift away from the fixture.

```bash
node scripts/generate-expected.mjs          # regenerate
node scripts/generate-expected.mjs --check  # CI: fail if stale
```

`fileHashes` pins the fixture content each line number was resolved against. **Wire `--check`
into CI.** The failure mode it prevents is the expensive one: editing a fixture file, shifting
every line below it, and silently scoring every subsequent run against stale anchors.

To add a case, add an entry to `CASES` in the generator and re-run. Never edit `EXPECTED.json`
directly.

## Targets

```json
{
  "detectionRecall": 1.0,
  "minPrecision": 0.8,
  "maxFalsePositives": 4,
  "minClassificationAccuracy": 0.85,
  "minVerdictAccuracy": 0.8,
  "lineMatchTolerance": 2
}
```

`detectionRecall: 1.0` — every one of the 18 cases must surface as a candidate, traps included.
Traps are *supposed* to be detected; they're graded on classification, not on being ignored.

`lineMatchTolerance: 2` — a scanner hit counts as matching a case when it lands within two lines
of the recorded start. Exact-line matching is too brittle to be useful.

Precision is measured against `cases` ∪ `negatives`: anything flagged that isn't a known case
counts as a false positive. Report the real number in the project README. A defensible 84% reads
as engineering maturity; an undefended "highly accurate" reads as a hackathon demo.

## Gates this fixture backs

- **M1** — scanner reaches ≥80% precision with full recall across all 18 cases, no LLM involved.
- **M2** — ≥10 generated patches pass `tsc --noEmit`, and classification accuracy clears 85%
  including all three traps.
- **M3** — verdicts match `expect.verdict` for ≥80% of cases, and `trap-003` returns
  `UNVERIFIABLE` rather than a false `PASS`.

## Setup

```bash
pnpm install
pnpm typecheck        # the fixture must be clean before any patch is judged against it
pnpm expected:check
```

The fixture typechecking cleanly is a precondition, not a nicety: the verifier compares
`tsc` output before and after each patch, so a fixture with pre-existing errors produces a dirty
baseline and every verdict downstream becomes meaningless.
