# doppel

Find the places a React codebase re-implements a design-system component by hand.

Every component library slowly accumulates copies of itself: a `<button className="...">` written
because the library's Button lacked one variant, then copied, then copied again. Those copies miss
rebrands, skip the library's accessibility work (focus rings, keyboard handling, ARIA roles), and
nobody can say how many exist. Lint rules can ban a raw `<button>`, but they can't tell you which
component should replace a given block of markup, or whether a divergence was deliberate.

doppel scans your TSX, finds structural look-alikes of your design system's components, and has a
model of your choice decide which are real drift, which are deliberate, and which only look
similar. It works with Claude, OpenAI, Nemotron on Nebius, OpenRouter, a local Ollama model, or
any OpenAI-compatible endpoint.

A real run against the test fixture in this repo:

```text
$ doppel scan test/fixtures/drift-demo --preset nebius
doppel 0.1.0 · test/fixtures/drift-demo
Models: cheap nebius:nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B · mid nebius:nvidia/nemotron-3-super-120b-a12b
Indexed 23 design-system components; 68 raw candidates in 8 files, 18 shortlisted
Described 23 components (23 from cache)
Triage kept 18 of 18 candidates for review

Results: 16 drift · 1 intentional · 1 not drift · 0 dismissed by triage
  app/billing/page.tsx:17                  Alert     drift      high risk
  app/billing/page.tsx:32                  Badge     drift      low risk
  app/billing/page.tsx:38                  Button    drift      high risk
  ...

19 model calls · 53,251 input / 35,070 output tokens · $0.05
Reports: .doppel/doppel-report.json, .doppel/doppel-report.md, .doppel/doppel-report.sarif
```

## How it works

1. **Index** the design system with the TypeScript compiler API: every exported component, its
   props, and its `cva` variants. Defaults to the shadcn/ui layout (`components/ui`).
2. **Extract** candidate JSX subtrees and fingerprint them (tag, children, utility classes, ARIA
   role, handlers).
3. **Shortlist** with deterministic rules: a candidate only reaches a model if it structurally
   resembles a component you actually have. On the test fixture this drops 50 of 68 candidates
   before any model call.
4. **Triage** with a cheap model, 20 candidates per call.
5. **Adjudicate** each surviving candidate with a stronger model and its full source: `DRIFT`,
   `INTENTIONAL_DEVIATION` (a marketing hero, a flagged experiment), or `NOT_DRIFT` (a layout
   wrapper that happens to share a card's classes). Drift comes back with a prop mapping and an
   honest list of anything the component can't express.

Steps 1-3 need no network and no API key: `--no-llm` stops there and reports unclassified
candidates.

## Install

```bash
npx doppel-cli scan .            # one-off
npm install -D doppel-cli        # or pin it in the repo
```

Requires Node 20.12+. From source: `pnpm install && pnpm build && node dist/cli.js scan <path>`.

## API keys

doppel reads provider keys from environment variables. Set whichever providers you use:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Claude (enables the anthropic preset)
export OPENAI_API_KEY=sk-...          # OpenAI (enables the openai preset)
```

Or put them in a `.env.local` or `.env` file in the repo you're scanning, or in the directory you
run doppel from. [`.env.example`](.env.example) lists every variable. `.env.local` wins over
`.env`, keys already set in your shell or CI win over both, and blank values count as unset.
Keep both files out of git.

In CI, store keys as repository secrets and pass them as environment variables (see
[In CI](#in-ci)). No key is needed for `--no-llm` or for a local Ollama model.

## Usage

```bash
doppel scan [path]                        # scan with the model inferred from your API key
doppel scan . --no-llm                    # deterministic only, no key needed
doppel scan . --since origin/main         # only files changed on this branch
doppel scan . --fail-on drift             # exit 1 if any drift is found (CI gate)
doppel scan . --format md --out reports   # choose report formats and location
doppel init                               # write a starter doppel.config.json
```

Reports land in `.doppel/` by default: `doppel-report.json` (everything), `doppel-report.md`
(written to be posted as a PR comment), and `doppel-report.sarif` (for GitHub code scanning).

Exit codes: `0` ok, `1` the `--fail-on` threshold was reached, `2` configuration error,
`3` unexpected error.

### Skipping a deliberate divergence

Put `doppel-ignore` in a comment on either of the two lines above the element. It is skipped
before any model call.

```tsx
{/* doppel-ignore: brand CTA, approved by design */}
<a className="inline-flex rounded-full bg-gradient-to-r ...">Start free trial</a>
```

## Choosing a model

doppel uses three tiers: **cheap** (component descriptions, triage), **mid** (adjudication), and
**strong** (reserved for code generation in a later release). Pick models in any of these ways,
highest precedence first:

1. Flags: `--model provider:model` for every tier, or `--model-cheap` / `--model-mid`.
2. `models` in `doppel.config.json`.
3. `--preset anthropic`, `--preset openai` or `--preset nebius`.
4. Nothing: the preset follows whichever key is set, checked in the order `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY`, `NEBIUS_API_KEY`.

| Preset | Triage (cheap) | Adjudication (mid) |
|---|---|---|
| `anthropic` | `claude-haiku-4-5-20251001` | `claude-sonnet-5` |
| `openai` | `gpt-5.4-mini` | `gpt-5.4` |
| `nebius` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | `nvidia/nemotron-3-super-120b-a12b` |

Any other model works through its provider prefix:

| Provider | Spec | Key |
|---|---|---|
| Anthropic | `anthropic:<model>` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai:<model>` | `OPENAI_API_KEY` |
| Nebius Token Factory | `nebius:<model>` | `NEBIUS_API_KEY` |
| OpenRouter | `openrouter:<vendor>/<model>` | `OPENROUTER_API_KEY` |
| Ollama (local) | `ollama:<model>` | none (`OLLAMA_BASE_URL` to override) |
| Anything OpenAI-compatible | declare it under `providers` | your choice |

A missing tier borrows from its neighbour, so one `--model` runs everything on a single model.

## Configuration

`doppel.config.json` at the scan root (or `--config <file>`):

```json
{
  "ds": "components/ui",
  "exclude": ["app/legacy"],
  "models": { "cheap": "openai:<small-model>", "mid": "mygateway:<model>" },
  "providers": {
    "mygateway": { "baseURL": "https://llm.internal.example/v1", "apiKeyEnv": "GATEWAY_KEY" }
  },
  "pricing": { "mygateway:<model>": { "input": 0.5, "output": 1.5 } },
  "minConfidence": 0.4,
  "concurrency": 4
}
```

`pricing` is USD per million tokens. doppel only ships prices it has verified (currently the Nebius
Nemotron models); for anything else the report gives token counts and says the cost is unknown
until you add a price. It never estimates one.

Component descriptions are cached in `.doppel/cache/`, keyed by model and component source, so
repeat runs only pay for components that changed. Cache that directory in CI.

## In CI

A GitHub Actions job that scans only the PR's changes, fails on drift, and shows findings as
inline annotations through code scanning:

```yaml
name: design-system drift
on: pull_request
permissions:
  contents: read
  security-events: write
jobs:
  doppel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # --since needs the base branch history
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx doppel-cli scan . --since origin/${{ github.base_ref }} --fail-on drift
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: .doppel/doppel-report.sarif
          category: doppel
```

SARIF paths are written relative to the git root, so scanning one app inside a monorepo still
annotates the right files. Pull requests from forks don't receive repository secrets; use
`--no-llm` there if you want a deterministic check.

## Measured results

On the planted-drift fixture in `test/fixtures/drift-demo` (18 known cases: 15 real drifts plus
three traps, a marketing hero, a layout wrapper and an unrenderable component):

- The deterministic scanner reaches 100% recall and 100% precision, checked by the test suite.
- Model classification, scored against the fixture's ground truth:

| Preset | Runs at 18/18 | Calls per run | Tokens in / out | Cost per run |
|---|---|---|---|---|
| `openai` (GPT-5.4 mini + GPT-5.4) | 3 of 3 | 42 | ~73k / ~6k | not measured |
| `anthropic` (Haiku 4.5 + Sonnet 5) | 2 of 2 | 42 | ~116k / ~13k | not measured |
| `nebius` (Nemotron Nano + Super) | 1 of 2 | 19-20 (descriptions cached) | ~56k / ~36k | $0.04-0.05 |

The other Nemotron run scored 17/18: it called the layout-wrapper trap an intentional deviation
instead of "not drift". Both verdicts leave the code alone, so no wrong change would be suggested.
Calls per run include 23 one-time component descriptions where the cache was cold. Cost is "not
measured" where doppel has no verified price for the model; it never estimates one.

Reproduce it with `node dist/cli.js scan test/fixtures/drift-demo --out .doppel/eval` followed by
`pnpm eval .doppel/eval`.

This fixture was written by the author, so treat it as a regression test, not a benchmark, and
read these as small samples.

## Library use

```ts
import { Llm, runDoppel, toMarkdown } from "doppel-cli"

const report = await runDoppel({ root: ".", llm: Llm.fromConfig({ preset: "anthropic" }) })
console.log(report.stats.drift, toMarkdown(report))
```

## Roadmap

- **Migrate and verify.** Generate the replacement JSX, add the import deterministically, and
  prove the change by rendering before and after (via Storybook where available) and pixel-diffing.
- **GitHub Action.** A packaged action that posts the Markdown report and suggested changes on
  the PR.

## Development

```bash
pnpm install
pnpm test        # scanner precision, router, pipeline (mock models), reports
pnpm typecheck
pnpm build
```

## License

Apache-2.0
