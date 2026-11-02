#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { CONFIG_FILENAME, loadConfigFile, type DoppelConfig } from "./config.js"
import { loadDotEnv } from "./env.js"
import { ConfigError } from "./errors.js"
import { changedFilesSince } from "./git.js"
import { Llm, LlmError } from "./llm/router.js"
import { runDoppel } from "./pipeline.js"
import { costLine } from "./report/markdown.js"
import type { Report } from "./report/types.js"
import { REPORT_FORMATS, writeReports, type ReportFormat } from "./report/write.js"
import { detectDsDir } from "./scanner/project.js"
import { VERSION } from "./version.js"

const HELP = `doppel ${VERSION}: find hand-rolled UI that duplicates your design system

Usage:
  doppel scan [path] [options]   Scan a React/TSX repo (default: current directory)
  doppel init [path]             Write a starter ${CONFIG_FILENAME}

Scan options:
  --ds <dir>                Design-system directory, relative to path (default: auto-detect components/ui)
  --no-llm                  Deterministic scan only: no model, no network, no API key
  --model <provider:model>  Use one model for every tier, e.g. anthropic:claude-sonnet-5
  --model-cheap <spec>      Model for descriptions and triage
  --model-mid <spec>        Model for adjudication
  --preset <name>           Built-in model set: anthropic | nebius
  --since <git-ref>         Only scan .tsx files changed since the merge base with <git-ref>
  --format <list>           Comma-separated: json,md,sarif (default: all)
  --out <dir>               Report directory (default: .doppel)
  --fail-on <level>         Exit 1 when findings reach a level: drift | candidate | none (default: none)
  --min-confidence <0-1>    Triage confidence needed before adjudication (default: 0.4)
  --concurrency <n>         Parallel model calls (default: 4)
  --config <file>           Config file (default: <path>/${CONFIG_FILENAME})
  --quiet                   Only print the summary

Models: set ANTHROPIC_API_KEY or NEBIUS_API_KEY to use a built-in preset, or pass
--model with any of: anthropic, openai, nebius, openrouter, ollama, or a custom
OpenAI-compatible provider declared in ${CONFIG_FILENAME}. Keys are read from the
environment, or from a .env file in the scanned path or the current directory
(environment variables take precedence).

Exit codes: 0 ok, 1 --fail-on threshold reached, 2 configuration error, 3 unexpected error.
`

function parseFormats(value: string | undefined): ReportFormat[] {
  if (!value) return REPORT_FORMATS
  const formats = value.split(",").map((f) => f.trim())
  const bad = formats.filter((f) => !REPORT_FORMATS.includes(f as ReportFormat))
  if (bad.length > 0) throw new ConfigError(`Unknown --format ${bad.join(", ")}. Use json, md, sarif.`)
  return formats as ReportFormat[]
}

function parseNumber(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (Number.isNaN(n)) throw new ConfigError(`${flag} expects a number, got "${value}"`)
  return n
}

function gitTopLevel(dir: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return undefined
  }
}

function printSummary(report: Report, files: string[]) {
  const s = report.stats
  const rel = (f: string) => path.relative(process.cwd(), f) || f
  console.log("")
  if (report.mode === "llm") {
    console.log(
      `Results: ${s.drift} drift · ${s.intentional} intentional · ${s.notDrift} not drift · ` +
        `${s.triagedOut} dismissed by triage${s.ignored ? ` · ${s.ignored} ignored` : ""}${s.errors ? ` · ${s.errors} errors` : ""}`
    )
  } else {
    console.log(`Results: ${s.shortlisted} candidates (deterministic, unclassified)${s.ignored ? ` · ${s.ignored} ignored` : ""}`)
  }

  const shown = report.findings.filter((f) => f.status === "drift" || f.status === "candidate" || f.status === "error")
  const width = Math.min(48, Math.max(0, ...shown.map((f) => `${f.file}:${f.line}`.length)))
  for (const f of shown) {
    const loc = `${f.file}:${f.line}`.padEnd(width)
    const detail =
      f.status === "error" ? `error: ${f.error}` : f.adjudication?.risk ? `${f.adjudication.risk} risk` : f.shortlist.join(" / ")
    console.log(`  ${loc}  ${(f.component ?? "").padEnd(8)}  ${f.status.padEnd(9)}  ${detail}`)
  }
  if (report.cost) console.log(`\n${costLine(report.cost)}`)
  console.log(`Reports: ${files.map(rel).join(", ")}`)
}

async function scan(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      ds: { type: "string" },
      "no-llm": { type: "boolean" },
      model: { type: "string" },
      "model-cheap": { type: "string" },
      "model-mid": { type: "string" },
      preset: { type: "string" },
      since: { type: "string" },
      format: { type: "string" },
      out: { type: "string" },
      "fail-on": { type: "string" },
      "min-confidence": { type: "string" },
      concurrency: { type: "string" },
      config: { type: "string" },
      quiet: { type: "boolean" },
    },
  })

  const root = path.resolve(positionals[0] ?? ".")
  if (!fs.existsSync(root)) throw new ConfigError(`Path not found: ${root}`)
  const envFiles = loadDotEnv([root, process.cwd()])
  const fileConfig = loadConfigFile(root, values.config)

  const failOn = values["fail-on"] ?? "none"
  if (!["drift", "candidate", "none"].includes(failOn)) {
    throw new ConfigError(`--fail-on must be drift, candidate, or none (got "${failOn}")`)
  }
  if (values.preset && values.preset !== "anthropic" && values.preset !== "nebius") {
    throw new ConfigError(`--preset must be anthropic or nebius (got "${values.preset}")`)
  }

  const config: DoppelConfig = {
    ...fileConfig,
    preset: (values.preset as DoppelConfig["preset"]) ?? fileConfig.preset,
    models: {
      ...fileConfig.models,
      ...(values.model ? { cheap: values.model, mid: values.model, strong: values.model } : {}),
      ...(values["model-cheap"] ? { cheap: values["model-cheap"] } : {}),
      ...(values["model-mid"] ? { mid: values["model-mid"] } : {}),
    },
  }
  const formats = parseFormats(values.format)
  const outDir = path.resolve(root, values.out ?? ".doppel")
  const llm = values["no-llm"] ? null : Llm.fromConfig(config)
  const onlyFiles = values.since ? changedFilesSince(root, values.since) : undefined

  const log = (m: string) => {
    if (!values.quiet) console.error(m)
  }
  log(`doppel ${VERSION} · ${root}`)
  if (envFiles.length > 0) log(`Loaded ${envFiles.map((f) => path.relative(process.cwd(), f) || f).join(", ")}`)
  if (llm) log(`Models: cheap ${llm.models.cheap} · mid ${llm.models.mid}`)
  else log("Mode: deterministic (--no-llm)")
  if (onlyFiles) log(`Scanning ${onlyFiles.length} changed .tsx file(s) since ${values.since}`)

  const report = await runDoppel({
    root,
    ds: values.ds ?? config.ds,
    exclude: config.exclude,
    onlyFiles,
    since: values.since,
    llm,
    minConfidence: parseNumber(values["min-confidence"], "--min-confidence") ?? config.minConfidence,
    concurrency: parseNumber(values.concurrency, "--concurrency") ?? config.concurrency,
    cacheDir: path.join(outDir, "cache"),
    onProgress: log,
  })

  const files = writeReports(report, outDir, formats, gitTopLevel(root) ?? root)
  printSummary(report, files)

  const failing = failOn === "drift" ? report.stats.drift : failOn === "candidate" ? report.stats.drift + report.findings.filter((f) => f.status === "candidate").length : 0
  return failing > 0 ? 1 : 0
}

function init(argv: string[]) {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} })
  const root = path.resolve(positionals[0] ?? ".")
  const file = path.join(root, CONFIG_FILENAME)
  if (fs.existsSync(file)) throw new ConfigError(`${file} already exists`)

  const ds = detectDsDir(root)
  const config: DoppelConfig = {
    ds: ds ? path.relative(root, ds).replace(/\\/g, "/") : "components/ui",
    exclude: [],
    minConfidence: 0.4,
    ...(process.env.ANTHROPIC_API_KEY ? { preset: "anthropic" as const } : process.env.NEBIUS_API_KEY ? { preset: "nebius" as const } : {}),
  }
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`Wrote ${file}`)
  if (!ds) console.log(`No components/ui directory found; edit "ds" to point at your design system.`)
  if (!config.preset) {
    console.log('No API key found. Set ANTHROPIC_API_KEY or NEBIUS_API_KEY, or add "models" (e.g. {"mid": "openai:<model>"}).')
  }
  return 0
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(HELP)
    return 0
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION)
    return 0
  }
  if (command === "scan") return scan(rest)
  if (command === "init") return init(rest)
  throw new ConfigError(`Unknown command "${command}". Run doppel --help.`)
}

// exitCode rather than process.exit(): exiting while parallel model requests are
// still in flight trips a libuv assertion on Windows (UV_HANDLE_CLOSING).
main().then(
  (code) => {
    process.exitCode = code
  },
  (err) => {
    const isArgError = String((err as { code?: string }).code ?? "").startsWith("ERR_PARSE_ARGS")
    if (err instanceof ConfigError || isArgError) {
      console.error(`doppel: ${(err as Error).message}`)
      process.exitCode = 2
    } else if (err instanceof LlmError) {
      console.error(`doppel: ${err.message}`)
      process.exitCode = 3
    } else {
      console.error(err)
      process.exitCode = 3
    }
  }
)
