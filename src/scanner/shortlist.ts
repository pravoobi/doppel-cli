/**
 * Rule-based candidate → design-system component shortlist. Deterministic and
 * model-free: anything no rule matches is dropped before any inference, which is
 * what keeps LLM call volume (and cost) an order of magnitude down.
 */

import type { Fingerprint } from "../types.js"

const DIV_LIKE = new Set(["div", "section", "article"])
const PILL_LIKE = new Set(["span", "div", "a"])
const ALERT_COLORS = /^(bg|border)-(red|amber|yellow|orange|rose|green|emerald)-/

function has(tokens: string[], re: RegExp): boolean {
  return tokens.some((t) => re.test(t))
}

function hasToken(tokens: string[], token: string): boolean {
  return tokens.includes(token)
}

/**
 * A dialog/overlay root owns its internal structure: its backdrop and content
 * wrapper are implementation details of the modal, not separate candidates.
 * Extraction uses this same predicate to stop recursing.
 */
export function isDialogOverlay(fp: Pick<Fingerprint, "rootTag" | "classTokens">): boolean {
  return (
    fp.rootTag === "div" &&
    hasToken(fp.classTokens, "fixed") &&
    hasToken(fp.classTokens, "inset-0") &&
    has(fp.classTokens, /^z-/)
  )
}

function isCardShaped(fp: Fingerprint): boolean {
  return (
    DIV_LIKE.has(fp.rootTag) &&
    has(fp.classTokens, /^rounded(-|$)/) &&
    has(fp.classTokens, /^border(-|$)/) &&
    has(fp.classTokens, /^p[xy]?-/)
  )
}

/** An <a> laid out and padded like a button is structurally a Button even with no click handler. */
function isButtonShapedLink(fp: Fingerprint): boolean {
  return (
    fp.rootTag === "a" &&
    hasToken(fp.classTokens, "inline-flex") &&
    has(fp.classTokens, /^rounded/) &&
    has(fp.classTokens, /^px-/)
  )
}

function isButtonShaped(fp: Fingerprint): boolean {
  return (
    fp.rootTag === "button" ||
    fp.ariaRole === "button" ||
    (fp.hasHandler && hasToken(fp.classTokens, "cursor-pointer")) ||
    isButtonShapedLink(fp)
  )
}

function isAlertShaped(fp: Fingerprint): boolean {
  return (fp.rootTag === "div" && has(fp.classTokens, ALERT_COLORS)) || fp.ariaRole === "alert"
}

function isBadgeShaped(fp: Fingerprint): boolean {
  return (
    PILL_LIKE.has(fp.rootTag) &&
    has(fp.classTokens, /^rounded-full/) &&
    has(fp.classTokens, /^text-xs/) &&
    has(fp.classTokens, /^px-/)
  )
}

function isInputWrapperShaped(fp: Fingerprint): boolean {
  return fp.rootTag === "div" && fp.childTags.includes("label") && fp.childTags.includes("input")
}

function isTableShaped(fp: Fingerprint): boolean {
  return fp.rootTag === "table"
}

/**
 * `why` is shown to the triage model so it judges the scanner's reading of the
 * markup, not just the bare component name. Without it, a model asked "is this
 * wrapper <div> an Input?" reasonably says no, when the real question is
 * whether it's a hand-built form field.
 */
const RULES: Array<{ component: string; why: string; test: (fp: Fingerprint) => boolean }> = [
  { component: "Button", why: "a clickable element styled as a button, or a link padded like one", test: isButtonShaped },
  { component: "Alert", why: "a coloured notice or status block, or an element with role=alert", test: isAlertShaped },
  { component: "Badge", why: "a small rounded-full text-xs pill", test: isBadgeShaped },
  {
    component: "Input",
    why: "a wrapper holding a <label> and an <input>: a hand-built form field, which the design system builds from Label + Input",
    test: isInputWrapperShaped,
  },
  { component: "Dialog", why: "a fixed full-screen overlay: a hand-built modal", test: isDialogOverlay },
  { component: "Table", why: "a raw <table>", test: isTableShaped },
  // Card last: the broadest structural match, so it never masks a more specific rule.
  { component: "Card", why: "a bordered, rounded, padded container", test: isCardShaped },
]

export function shortlistReason(component: string): string | undefined {
  return RULES.find((r) => r.component === component)?.why
}

/** Maps a fingerprint to 1-3 plausible DS component names. Empty when no rule fires. */
export function shortlistFingerprint(fp: Fingerprint, knownComponents?: string[]): string[] {
  const matches = RULES.filter((r) => r.test(fp)).map((r) => r.component)
  const filtered = knownComponents ? matches.filter((m) => knownComponents.includes(m)) : matches
  return filtered.slice(0, 3)
}
