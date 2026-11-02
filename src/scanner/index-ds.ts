/**
 * Builds the design-system capability index with ts-morph. Pure AST work: the
 * model-written `description` and `aliases` are filled in later by the agent.
 */

import path from "node:path"
import { SyntaxKind, type Project, type SourceFile } from "ts-morph"
import type { DsComponent, DsIndex, PropSpec } from "../types.js"

const SOURCE_EXCERPT_LINES = 80

export type DsIndexOptions = {
  /** Directory that the import alias points at, e.g. the repo root for `@/*` → `./*`. */
  aliasRootAbsPath: string
  /** Import alias prefix, e.g. "@/". */
  importAlias: string
}

export function buildDsIndex(project: Project, dsDirAbsPath: string, opts: DsIndexOptions): DsIndex {
  const components: DsComponent[] = []
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath()
    if (!isUnder(dsDirAbsPath, filePath)) continue
    if (/\.(test|spec|stories)\.tsx?$/.test(filePath)) continue
    components.push(...extractComponentsFromFile(sf, opts))
  }
  return { path: dsDirAbsPath, components }
}

function isUnder(dir: string, filePath: string): boolean {
  const rel = path.relative(dir, filePath)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

function extractComponentsFromFile(sf: SourceFile, opts: DsIndexOptions): DsComponent[] {
  const variantsByCvaVar = extractCvaVariants(sf)
  const propsByInterfaceName = extractPropInterfaces(sf)
  const sourceExcerpt = sf.getFullText().split("\n").slice(0, SOURCE_EXCERPT_LINES).join("\n")
  const importPath = toImportPath(sf.getFilePath(), opts)

  const out: DsComponent[] = []
  const seen = new Set<string>()

  for (const [name, declarations] of sf.getExportedDeclarations()) {
    if (!/^[A-Z]/.test(name) || seen.has(name)) continue
    const isComponentValue = declarations.some(
      (d) => d.getKind() === SyntaxKind.VariableDeclaration || d.getKind() === SyntaxKind.FunctionDeclaration
    )
    if (!isComponentValue) continue
    seen.add(name)

    const ownProps = propsByInterfaceName.get(`${name}Props`) ?? []
    const cvaVarName = findCvaVariantsRefForComponent(sf, name)
    const variants = cvaVarName ? (variantsByCvaVar.get(cvaVarName) ?? {}) : {}
    const variantProps: PropSpec[] = Object.entries(variants).map(([propName, literals]) => ({
      name: propName,
      type: literals.map((l) => `"${l}"`).join(" | "),
      optional: true,
      literals,
    }))

    out.push({
      name,
      importPath,
      props: dedupeProps([...ownProps, ...variantProps]),
      variants,
      sourceExcerpt,
      description: "",
      aliases: [],
    })
  }
  return out
}

function dedupeProps(props: PropSpec[]): PropSpec[] {
  const byName = new Map<string, PropSpec>()
  for (const p of props) byName.set(p.name, p)
  return [...byName.values()]
}

function extractPropInterfaces(sf: SourceFile): Map<string, PropSpec[]> {
  const out = new Map<string, PropSpec[]>()
  for (const iface of sf.getInterfaces()) {
    if (!iface.getName().endsWith("Props")) continue
    out.set(
      iface.getName(),
      iface.getProperties().map((prop) => ({
        name: prop.getName(),
        type: prop.getTypeNode()?.getText() ?? "unknown",
        optional: prop.hasQuestionToken(),
      }))
    )
  }
  return out
}

/** `cvaVariableName -> { propName: [literal, ...] }`, for the shadcn `const xVariants = cva(base, { variants })` convention. */
function extractCvaVariants(sf: SourceFile): Map<string, Record<string, string[]>> {
  const out = new Map<string, Record<string, string[]>>()

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== "cva") continue
    const varDecl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
    const configArg = call.getArguments()[1]
    if (!varDecl || !configArg || configArg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue

    const variantsProp = configArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperty("variants")
    if (!variantsProp || variantsProp.getKind() !== SyntaxKind.PropertyAssignment) continue
    const variantsObj = variantsProp
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
      .getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
    if (!variantsObj) continue

    const variants: Record<string, string[]> = {}
    for (const variantProp of variantsObj.getProperties()) {
      if (variantProp.getKind() !== SyntaxKind.PropertyAssignment) continue
      const pa = variantProp.asKindOrThrow(SyntaxKind.PropertyAssignment)
      const optionsObj = pa.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
      if (!optionsObj) continue
      variants[pa.getName()] = optionsObj
        .getProperties()
        .filter((p) => p.getKind() === SyntaxKind.PropertyAssignment)
        .map((p) => p.asKindOrThrow(SyntaxKind.PropertyAssignment).getName().replace(/['"]/g, ""))
    }
    out.set(varDecl.getName(), variants)
  }
  return out
}

function findCvaVariantsRefForComponent(sf: SourceFile, componentName: string): string | null {
  const iface = sf.getInterface(`${componentName}Props`)
  if (!iface) return null
  const m = iface.getText().match(/VariantProps<typeof (\w+)>/)
  return m ? m[1] : null
}

function toImportPath(fileAbsPath: string, opts: DsIndexOptions): string {
  const rel = path.relative(opts.aliasRootAbsPath, fileAbsPath).replace(/\\/g, "/")
  return `${opts.importAlias}${rel.replace(/\.tsx?$/, "")}`
}
