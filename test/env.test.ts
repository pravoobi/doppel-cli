import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadDotEnv } from "../src/env.js"

describe("loadDotEnv", () => {
  it("fills missing variables from .env without overriding the environment", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doppel-env-"))
    fs.writeFileSync(path.join(dir, ".env"), "ANTHROPIC_API_KEY=from-file\nOPENAI_API_KEY=from-file\n")
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "from-shell" }

    const loaded = loadDotEnv([dir, dir], env)

    expect(loaded).toHaveLength(1)
    expect(env.ANTHROPIC_API_KEY).toBe("from-file")
    expect(env.OPENAI_API_KEY).toBe("from-shell")
  })

  it("does nothing when there is no .env", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doppel-env-"))
    const env: NodeJS.ProcessEnv = {}
    expect(loadDotEnv([dir], env)).toEqual([])
    expect(env).toEqual({})
  })
})
