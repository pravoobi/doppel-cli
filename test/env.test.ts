import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadDotEnv } from "../src/env.js"

function tempDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doppel-env-"))
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body)
  return dir
}

describe("loadDotEnv", () => {
  it("fills missing variables without overriding the environment", () => {
    const dir = tempDir({ ".env": "ANTHROPIC_API_KEY=from-file\nOPENAI_API_KEY=from-file\n" })
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "from-shell" }
    expect(loadDotEnv([dir, dir], env)).toHaveLength(1)
    expect(env.ANTHROPIC_API_KEY).toBe("from-file")
    expect(env.OPENAI_API_KEY).toBe("from-shell")
  })

  it("prefers .env.local over .env", () => {
    const dir = tempDir({ ".env.local": "OPENAI_API_KEY=local\n", ".env": "OPENAI_API_KEY=shared\nANTHROPIC_API_KEY=shared\n" })
    const env: NodeJS.ProcessEnv = {}
    expect(loadDotEnv([dir], env)).toHaveLength(2)
    expect(env.OPENAI_API_KEY).toBe("local")
    expect(env.ANTHROPIC_API_KEY).toBe("shared")
  })

  it("treats blank values as unset", () => {
    const dir = tempDir({ ".env.local": "NEBIUS_API_KEY=\n", ".env": "NEBIUS_API_KEY=real\n" })
    const env: NodeJS.ProcessEnv = {}
    loadDotEnv([dir], env)
    expect(env.NEBIUS_API_KEY).toBe("real")
  })

  it("does nothing when there is no env file", () => {
    const env: NodeJS.ProcessEnv = {}
    expect(loadDotEnv([tempDir({})], env)).toEqual([])
    expect(env).toEqual({})
  })
})
