import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

/**
 * Loads `.env` from the scan root and the current directory. Variables already
 * in the environment win, so a CI secret is never shadowed by a stray file.
 * Returns the files that were read.
 */
export function loadDotEnv(dirs: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = []
  for (const dir of [...new Set(dirs.map((d) => path.resolve(d)))]) {
    const file = path.join(dir, ".env")
    if (!fs.existsSync(file)) continue
    const values = parseEnv(fs.readFileSync(file, "utf8"))
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined) env[key] = value
    }
    loaded.push(file)
  }
  return loaded
}
