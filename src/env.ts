import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

/** Checked in this order; the first file to set a variable wins. */
const ENV_FILES = [".env.local", ".env"]

/**
 * Loads `.env.local` and `.env` from the scan root and the current directory.
 * Variables already in the environment win, so a CI secret is never shadowed
 * by a stray file, and empty values (`OPENAI_API_KEY=` left blank from
 * .env.example) count as unset. Returns the files that were read.
 */
export function loadDotEnv(dirs: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = []
  for (const dir of [...new Set(dirs.map((d) => path.resolve(d)))]) {
    for (const name of ENV_FILES) {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) continue
      const values = parseEnv(fs.readFileSync(file, "utf8"))
      for (const [key, value] of Object.entries(values)) {
        if (value !== "" && !env[key]) env[key] = value
      }
      loaded.push(file)
    }
  }
  return loaded
}
