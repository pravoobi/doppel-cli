import { z } from "zod"

export const DsDescriptionSchema = z.object({
  description: z.string().min(1),
  aliases: z.array(z.string()),
})
export type DsDescription = z.infer<typeof DsDescriptionSchema>

export const TriageResultSchema = z.object({
  id: z.string(),
  match: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
})
export type TriageResult = z.infer<typeof TriageResultSchema>

/** Wrapped in an object: several providers require an object at the root of structured output. */
export const TriageBatchSchema = z.object({ results: z.array(TriageResultSchema) })

export const ClassificationSchema = z.enum(["DRIFT", "INTENTIONAL_DEVIATION", "NOT_DRIFT"])
export type Classification = z.infer<typeof ClassificationSchema>

export const RiskSchema = z.enum(["low", "medium", "high"])
export type Risk = z.infer<typeof RiskSchema>

export const PropMappingEntrySchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Required-but-nullable rather than optional: OpenAI's strict structured outputs reject optional fields. */
  note: z.string().nullable(),
})
export type PropMappingEntry = z.infer<typeof PropMappingEntrySchema>

export const AdjudicationSchema = z.object({
  classification: ClassificationSchema,
  rationale: z.string().min(1),
  propMapping: z.array(PropMappingEntrySchema),
  unmappable: z.array(z.string()),
  risk: RiskSchema.nullable(),
})
export type Adjudication = z.infer<typeof AdjudicationSchema>
