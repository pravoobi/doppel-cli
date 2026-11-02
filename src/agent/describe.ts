/**
 * One cheap call per design-system component, writing the description and
 * aliases triage matches against. Cached on disk keyed by model + component
 * source, so repeat runs (every CI build) only pay for components that changed.
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { LlmError, type Llm } from "../llm/router.js"
import type { DsComponent } from "../types.js"
import { mapLimit } from "./concurrency.js"
import { loadPrompt } from "./prompts.js"
import { DsDescriptionSchema, type DsDescription } from "./schemas.js"

type CacheFile = Record<string, DsDescription>

function cacheKey(component: DsComponent, model: string): string {
  const hash = crypto.createHash("sha1").update(component.sourceExcerpt).digest("hex").slice(0, 12)
  return `${model}|${component.name}|${hash}`
}

function readCache(file: string | undefined): CacheFile {
  if (!file || !fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CacheFile
  } catch {
    return {}
  }
}

export async function describeComponents(
  llm: Llm,
  components: DsComponent[],
  opts: { cacheFile?: string; concurrency: number }
): Promise<{ components: DsComponent[]; cached: number; failed: string[] }> {
  const cache = readCache(opts.cacheFile)
  const model = llm.models.cheap
  let cached = 0
  const failed: string[] = []

  const described = await mapLimit(components, opts.concurrency, async (component) => {
    const key = cacheKey(component, model)
    const hit = cache[key]
    if (hit) {
      cached++
      return { ...component, ...hit }
    }
    try {
      const result = await llm.generate({
        tier: "cheap",
        stage: "describe",
        prompt: loadPrompt("ds-describe", {
          componentName: component.name,
          componentProps: JSON.stringify(component.props, null, 2),
          componentVariants: JSON.stringify(component.variants, null, 2),
          componentSourceExcerpt: component.sourceExcerpt,
        }),
        schema: DsDescriptionSchema,
        schemaName: "DsDescription",
        maxOutputTokens: 2000,
      })
      cache[key] = result
      return { ...component, ...result }
    } catch (err) {
      // Bad output for one component only weakens triage for it; setup errors (bad key, unknown
      // model) still stop the run.
      if (!(err instanceof LlmError)) throw err
      failed.push(component.name)
      return component
    }
  })

  if (opts.cacheFile) {
    fs.mkdirSync(path.dirname(opts.cacheFile), { recursive: true })
    fs.writeFileSync(opts.cacheFile, JSON.stringify(cache, null, 2))
  }
  return { components: described, cached, failed }
}
