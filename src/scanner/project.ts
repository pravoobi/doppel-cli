import fs from "node:fs"
import path from "node:path"
import { Project } from "ts-morph"

const IGNORED_DIRS = ["node_modules", "dist", "build", ".next", "out", "coverage", ".doppel"]

export function loadProject(root: string): Project {
  const tsConfigFilePath = path.join(root, "tsconfig.json")
  const project = new Project({
    tsConfigFilePath: fs.existsSync(tsConfigFilePath) ? tsConfigFilePath : undefined,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  })
  const posixRoot = root.replace(/\\/g, "/")
  project.addSourceFilesAtPaths([
    `${posixRoot}/**/*.tsx`,
    ...IGNORED_DIRS.map((d) => `!${posixRoot}/**/${d}/**`),
  ])
  return project
}

/** Explicit path first, then the shadcn/ui conventions. */
export function detectDsDir(root: string, explicit?: string): string | null {
  const candidates = explicit ? [explicit] : ["components/ui", "src/components/ui", "app/components/ui"]
  for (const rel of candidates) {
    const abs = path.resolve(root, rel)
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs
  }
  return null
}

export type ImportAlias = { prefix: string; rootAbsPath: string }

/**
 * Reads the first wildcard path alias (e.g. `"@/*": ["./*"]`) from the project's
 * compiler options, so suggested import paths match what the repo actually writes.
 * Falls back to `@/` mapped to the repo root, the shadcn default.
 */
export function detectImportAlias(project: Project, root: string): ImportAlias {
  const opts = project.getCompilerOptions()
  const paths = opts.paths ?? {}
  const base = (opts.pathsBasePath as string | undefined) ?? opts.baseUrl ?? root
  for (const [key, targets] of Object.entries(paths)) {
    if (!key.endsWith("/*") || targets.length === 0 || !targets[0].endsWith("*")) continue
    return {
      prefix: key.slice(0, -1),
      rootAbsPath: path.resolve(base, targets[0].slice(0, -1)),
    }
  }
  return { prefix: "@/", rootAbsPath: root }
}
