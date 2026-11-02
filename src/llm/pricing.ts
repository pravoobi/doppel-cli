import type { DoppelConfig } from "../config.js"

export type Price = { input: number; output: number }

/**
 * Prices confirmed against the provider's own dashboard, USD per 1M tokens.
 * Nothing goes here unless it was checked; every other model reports token
 * counts with cost "unknown" until the user adds pricing in doppel.config.json.
 *
 * Nebius Nemotron: confirmed against tokenfactory.nebius.com/organization/prices, 2026-09-25.
 */
export const CONFIRMED_PRICES: Record<string, Price> = {
  "nebius:nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { input: 0.06, output: 0.24 },
  "nebius:nvidia/Nemotron-3_5-Lightning": { input: 0.06, output: 0.24 },
  "nebius:nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9 },
  "nebius:nvidia/Nemotron-3-Ultra-550b-a55b": { input: 1.0, output: 3.0 },
}

export function priceFor(modelSpec: string, config: DoppelConfig): Price | null {
  return config.pricing?.[modelSpec] ?? CONFIRMED_PRICES[modelSpec] ?? null
}

/** Null when the model has no known price — never a guessed number. */
export function costUsd(price: Price | null, inputTokens: number, outputTokens: number): number | null {
  if (!price) return null
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output
}
