import type { LogWarningsFunction, Warning } from "ai"

function describe(w: Warning): string {
  const fields = w as { feature?: string; details?: string; message?: string }
  return fields.details ?? fields.message ?? fields.feature ?? JSON.stringify(w)
}

/**
 * The router asks for temperature 0 as a best-effort request for repeatable
 * output; reasoning models ignore it. That warning tells the user nothing they
 * can act on, so it is dropped. Everything else is kept.
 */
function isExpected(w: Warning): boolean {
  return (w as { feature?: string }).feature === "temperature"
}

/**
 * The SDK logs provider warnings once per call, so one unsupported setting on a
 * model repeats for every candidate. This prints each distinct warning once.
 */
export function dedupedWarningLogger(print: (line: string) => void): LogWarningsFunction {
  const seen = new Set<string>()
  return ({ warnings, provider, model }) => {
    for (const w of warnings) {
      if (isExpected(w)) continue
      const line = `warning (${[provider, model].filter(Boolean).join(" / ")}): ${describe(w)}`
      if (seen.has(line)) continue
      seen.add(line)
      print(line)
    }
  }
}
