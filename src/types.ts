export type PropSpec = {
  name: string
  type: string
  optional: boolean
  /** Union literal members, when the type is a string-literal union (e.g. variant props). */
  literals?: string[]
}

export type DsComponent = {
  name: string
  importPath: string
  props: PropSpec[]
  /** e.g. { variant: ["default","destructive"], size: ["default","sm","lg","icon"] } */
  variants: Record<string, string[]>
  /** First ~80 lines of source, given to the adjudicator as context. */
  sourceExcerpt: string
  /** One-line model-written description. Empty in --no-llm mode. */
  description: string
  /** Informal names a developer might use, e.g. ["banner","callout"] for Alert. */
  aliases: string[]
}

export type DsIndex = {
  path: string
  components: DsComponent[]
}

export type Fingerprint = {
  rootTag: string
  depth: number
  childTags: string[]
  /** Utility class tokens as written: bg-*, rounded-*, px-*, text-*, etc. */
  classTokens: string[]
  ariaRole: string | null
  hasHandler: boolean
  /** First 40 chars of literal text content, for context. */
  textSample: string
  file: string
  line: number
}

export type Candidate = {
  id: string
  file: string
  line: number
  endLine: number
  fingerprint: Fingerprint
  /** The candidate's own JSX source text. */
  sourceText: string
}

export type ShortlistedCandidate = Candidate & {
  /** 1-3 plausible DS component names, ranked by rule specificity. Never empty. */
  shortlist: string[]
}
