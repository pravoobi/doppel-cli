import { Node, SyntaxKind, type JsxAttributeLike } from "ts-morph"
import type { Fingerprint } from "../types.js"

const HANDLER_ATTR = /^on[A-Z]/

export function getTagName(node: Node): string {
  if (Node.isJsxElement(node)) return node.getOpeningElement().getTagNameNode().getText()
  if (Node.isJsxSelfClosingElement(node)) return node.getTagNameNode().getText()
  return ""
}

export function getAttributes(node: Node): JsxAttributeLike[] {
  if (Node.isJsxElement(node)) return node.getOpeningElement().getAttributes()
  if (Node.isJsxSelfClosingElement(node)) return node.getAttributes()
  return []
}

/** All string literals reachable inside an attribute's value, covering `cn(...)`/`clsx(...)` calls. */
function collectStringLiterals(node: Node): string[] {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return [node.getLiteralText()]
  }
  const out: string[] = []
  for (const child of node.getDescendants()) {
    if (Node.isStringLiteral(child) || Node.isNoSubstitutionTemplateLiteral(child)) {
      out.push(child.getLiteralText())
    }
  }
  return out
}

export function getClassTokens(node: Node): string[] {
  const tokens: string[] = []
  for (const attr of getAttributes(node)) {
    if (!Node.isJsxAttribute(attr)) continue
    if (attr.getNameNode().getText() !== "className") continue
    const init = attr.getInitializer()
    if (!init) continue

    let literals: string[] = []
    if (Node.isStringLiteral(init)) {
      literals = [init.getLiteralText()]
    } else if (Node.isJsxExpression(init)) {
      const expr = init.getExpression()
      if (expr) literals = collectStringLiterals(expr)
    }

    for (const lit of literals) {
      tokens.push(...lit.split(/\s+/).filter(Boolean))
    }
  }
  return [...new Set(tokens)]
}

export function hasInlineStyle(node: Node): boolean {
  return getAttributes(node).some((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === "style")
}

export function hasHandlerAttr(node: Node): boolean {
  return getAttributes(node).some(
    (a) => Node.isJsxAttribute(a) && HANDLER_ATTR.test(a.getNameNode().getText())
  )
}

export function getRole(node: Node): string | null {
  const attr = getAttributes(node).find(
    (a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === "role"
  )
  if (!attr || !Node.isJsxAttribute(attr)) return null
  const init = attr.getInitializer()
  if (init && Node.isStringLiteral(init)) return init.getLiteralText()
  return null
}

export function hasAriaAttr(node: Node): boolean {
  return getAttributes(node).some(
    (a) => Node.isJsxAttribute(a) && /^aria-/.test(a.getNameNode().getText())
  )
}

/** Nested descendant JSX elements, not counting the node itself. */
export function getDescendantElements(node: Node): Node[] {
  return node.getDescendants().filter((d) => Node.isJsxElement(d) || Node.isJsxSelfClosingElement(d))
}

export function getDirectChildTags(node: Node): string[] {
  const children = Node.isJsxElement(node) ? node.getJsxChildren() : []
  return children
    .filter((c) => Node.isJsxElement(c) || Node.isJsxSelfClosingElement(c))
    .map((c) => getTagName(c))
}

export function getDepth(node: Node): number {
  let max = 0
  function walk(n: Node, d: number) {
    max = Math.max(max, d)
    if (!Node.isJsxElement(n)) return
    for (const child of n.getJsxChildren()) {
      if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) walk(child, d + 1)
    }
  }
  walk(node, 0)
  return max
}

export function getTextSample(node: Node): string {
  return node
    .getDescendantsOfKind(SyntaxKind.JsxText)
    .map((t) => t.getText().trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 40)
}

export function computeFingerprint(node: Node, file: string, line: number): Fingerprint {
  return {
    rootTag: getTagName(node),
    depth: getDepth(node),
    childTags: getDirectChildTags(node),
    classTokens: getClassTokens(node),
    ariaRole: getRole(node),
    hasHandler: hasHandlerAttr(node),
    textSample: getTextSample(node),
    file,
    line,
  }
}
