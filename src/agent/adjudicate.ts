/** Mid tier: full source in, DRIFT / INTENTIONAL_DEVIATION / NOT_DRIFT plus a prop mapping out. */

import type { Llm } from "../llm/router.js"
import type { DsComponent } from "../types.js"
import { loadPrompt } from "./prompts.js"
import { AdjudicationSchema, type Adjudication } from "./schemas.js"

export type AdjudicateInput = {
  candidateSource: string
  /** The enclosing file, or a window of it for large files. */
  surroundingSource: string
  component: DsComponent
}

export function adjudicateCandidate(llm: Llm, input: AdjudicateInput): Promise<Adjudication> {
  return llm.generate({
    tier: "mid",
    stage: "adjudicate",
    prompt: loadPrompt("adjudicate", {
      candidateSource: input.candidateSource,
      surroundingSource: input.surroundingSource,
      componentName: input.component.name,
      componentProps: JSON.stringify(input.component.props, null, 2),
      componentVariants: JSON.stringify(input.component.variants, null, 2),
      componentSourceExcerpt: input.component.sourceExcerpt,
    }),
    schema: AdjudicationSchema,
    schemaName: "Adjudication",
  })
}
