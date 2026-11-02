/**
 * Walks an app's JSX and extracts drift candidates. Deterministic, zero LLM calls.
 *
 * A candidate is a JSX subtree rooted at a host element (lowercase tag) with at
 * least one signal: a className with >=3 utility tokens, an inline style, an
 * interaction handler, a role/aria-* attribute, or >=2 nested elements.
 *
 * A `fixed inset-0 z-*` overlay root is extracted as one atomic candidate; its
 * children are not walked, since a modal's backdrop and content wrapper are
 * parts of the modal, not separate drift.
 */

import path from "node:path"
import { Node, type Project, type SourceFile } from "ts-morph"
import type { Candidate, ShortlistedCandidate } from "../types.js"
import {
  computeFingerprint,
  getClassTokens,
  getDescendantElements,
  getRole,
  getTagName,
  hasAriaAttr,
  hasHandlerAttr,
  hasInlineStyle,
} from "./fingerprint.js"
import { isDialogOverlay, shortlistFingerprint } from "./shortlist.js"

const EXCLUDE_FILE_RE = /\.(test|spec|stories)\.tsx?$/

export type ExtractOptions = {
  dsDirAbsPath: string
  /** Extra absolute directory paths to skip, beyond the DS dir and node_modules. */
  excludeDirs?: string[]
  /** When set, only these absolute file paths are scanned (e.g. files changed since a git ref). */
  onlyFiles?: Set<string>
}

function isUnder(dir: string, filePath: string): boolean {
  const rel = path.relative(dir, filePath)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

export function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").toLowerCase()
}

function isExcluded(filePath: string, opts: ExtractOptions): boolean {
  if (EXCLUDE_FILE_RE.test(filePath)) return true
  if (/[\\/]node_modules[\\/]/.test(filePath)) return true
  if (opts.onlyFiles && !opts.onlyFiles.has(normalizePath(filePath))) return true
  return [opts.dsDirAbsPath, ...(opts.excludeDirs ?? [])].some((d) => isUnder(d, filePath))
}

function qualifiesAsRawCandidate(node: Node): boolean {
  return (
    getClassTokens(node).length >= 3 ||
    hasInlineStyle(node) ||
    hasHandlerAttr(node) ||
    getRole(node) !== null ||
    hasAriaAttr(node) ||
    getDescendantElements(node).length >= 2
  )
}

export function extractCandidates(
  project: Project,
  opts: ExtractOptions
): { candidates: Candidate[]; scannedFiles: string[] } {
  const candidates: Candidate[] = []
  const scannedFiles: string[] = []
  for (const sf of project.getSourceFiles()) {
    if (isExcluded(sf.getFilePath(), opts)) continue
    scannedFiles.push(sf.getFilePath())
    walkFile(sf, candidates)
  }
  return { candidates, scannedFiles }
}

function walkFile(sf: SourceFile, out: Candidate[]) {
  const visit = (node: Node) => {
    for (const child of node.getChildren()) {
      if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) {
        const isHostElement = /^[a-z]/.test(getTagName(child))
        if (isHostElement && qualifiesAsRawCandidate(child)) {
          const line = child.getStartLineNumber()
          const fingerprint = computeFingerprint(child, sf.getFilePath(), line)
          out.push({
            id: `c${out.length + 1}`,
            file: sf.getFilePath(),
            line,
            endLine: child.getEndLineNumber(),
            fingerprint,
            sourceText: child.getText(),
          })
          if (isDialogOverlay(fingerprint)) continue
        }
      }
      visit(child)
    }
  }
  visit(sf)
}

export function shortlistCandidates(
  candidates: Candidate[],
  knownComponents?: string[]
): ShortlistedCandidate[] {
  return candidates
    .map((c) => ({ ...c, shortlist: shortlistFingerprint(c.fingerprint, knownComponents) }))
    .filter((c) => c.shortlist.length > 0)
}
