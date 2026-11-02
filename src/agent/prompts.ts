import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Prompt templates ship as markdown in the package's top-level `prompts/`
 * directory. The bundled CLI (dist/) and the source (src/agent/) sit at
 * different depths, so walk up until the directory is found.
 */
function findPromptsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "prompts")
    if (fs.existsSync(path.join(candidate, "triage.md"))) return candidate
    dir = path.dirname(dir)
  }
  throw new Error("doppel: prompts directory not found next to the package; the install looks incomplete")
}

let promptsDir: string | null = null
const cache = new Map<string, string>()

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  promptsDir ??= findPromptsDir()
  let template = cache.get(name)
  if (template === undefined) {
    template = fs.readFileSync(path.join(promptsDir, `${name}.md`), "utf8")
    cache.set(name, template)
  }

  let out = template
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value)
  }
  const unresolved = out.match(/\{\{\w+\}\}/g)
  if (unresolved) throw new Error(`Prompt "${name}" has unresolved placeholders: ${unresolved.join(", ")}`)
  return out
}
