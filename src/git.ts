import { execFileSync } from "node:child_process"
import path from "node:path"
import { ConfigError } from "./errors.js"

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw new ConfigError(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`)
  }
}

/**
 * Absolute paths of .tsx files added or modified since the merge base with `ref`,
 * including uncommitted changes. Merge base, not `ref` itself, so a PR branch
 * only reports its own changes even when the base branch has moved on.
 */
export function changedFilesSince(root: string, ref: string): string[] {
  const top = git(root, ["rev-parse", "--show-toplevel"])
  const base = git(root, ["merge-base", ref, "HEAD"])
  const tracked = git(root, ["diff", "--name-only", "--diff-filter=ACMR", base])
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"])
  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")])]
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.resolve(top, f))
}
