import { describe, expect, expectTypeOf, it } from "vitest"

import {
  createNodeCodexAppServerClient,
  resolveCodexAppServerCommand,
} from "./codex-app-server.js"
import type { CodexAppServerClient } from "./models.js"

describe("Codex App Server client API", () => {
  it("returns the public Codex App Server client shape", () => {
    expectTypeOf(
      createNodeCodexAppServerClient()
    ).toMatchTypeOf<CodexAppServerClient>()
  })

  it("resolves configured Codex App Server commands before local defaults", () => {
    expect(
      resolveCodexAppServerCommand({
        appCommandExists: () => true,
        configuredCommand: "/opt/codex",
        environmentCommand: "/env/codex",
        macosAppCommand: "/Applications/Codex.app/Contents/Resources/codex",
        platform: "darwin",
      })
    ).toBe("/opt/codex")
  })

  it("resolves environment Codex App Server commands before local defaults", () => {
    expect(
      resolveCodexAppServerCommand({
        appCommandExists: () => true,
        environmentCommand: "/env/codex",
        macosAppCommand: "/Applications/Codex.app/Contents/Resources/codex",
        platform: "darwin",
      })
    ).toBe("/env/codex")
  })

  it("prefers the macOS app-bundled Codex command when it exists", () => {
    expect(
      resolveCodexAppServerCommand({
        appCommandExists: () => true,
        macosAppCommand: "/Applications/Codex.app/Contents/Resources/codex",
        platform: "darwin",
      })
    ).toBe("/Applications/Codex.app/Contents/Resources/codex")
  })

  it("falls back to the PATH Codex command without a local app command", () => {
    expect(
      resolveCodexAppServerCommand({
        appCommandExists: () => false,
        macosAppCommand: "/Applications/Codex.app/Contents/Resources/codex",
        platform: "linux",
      })
    ).toBe("codex")
  })
})
