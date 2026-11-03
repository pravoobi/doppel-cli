import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { ConfigError } from "./errors.js"

const ProviderSchema = z.object({
  baseURL: z.string().url(),
  /** Name of the environment variable holding the API key. Omit for keyless local servers. */
  apiKeyEnv: z.string().optional(),
})

const PriceSchema = z.object({
  /** USD per 1M input tokens. */
  input: z.number().nonnegative(),
  /** USD per 1M output tokens. */
  output: z.number().nonnegative(),
})

export const DoppelConfigSchema = z
  .object({
    ds: z.string().optional(),
    exclude: z.array(z.string()).optional(),
    preset: z.enum(["anthropic", "openai", "nebius"]).optional(),
    models: z
      .object({
        cheap: z.string().optional(),
        mid: z.string().optional(),
        strong: z.string().optional(),
      })
      .optional(),
    providers: z.record(z.string(), ProviderSchema).optional(),
    pricing: z.record(z.string(), PriceSchema).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    concurrency: z.number().int().min(1).max(16).optional(),
  })
  .strict()

export type DoppelConfig = z.infer<typeof DoppelConfigSchema>

export const CONFIG_FILENAME = "doppel.config.json"

export function loadConfigFile(root: string, explicitPath?: string): DoppelConfig {
  const file = explicitPath ? path.resolve(explicitPath) : path.join(root, CONFIG_FILENAME)
  if (!fs.existsSync(file)) {
    if (explicitPath) throw new ConfigError(`Config file not found: ${file}`)
    return {}
  }
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    throw new ConfigError(`${file} is not valid JSON: ${(err as Error).message}`)
  }
  const parsed = DoppelConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
    throw new ConfigError(`${file} is invalid:\n${issues}`)
  }
  return parsed.data
}
