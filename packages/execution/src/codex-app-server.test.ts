import { describe, expectTypeOf, it } from "vitest"

import { createNodeCodexAppServerClient } from "./codex-app-server.js"
import type { CodexAppServerClient } from "./models.js"

describe("Codex App Server client API", () => {
  it("returns the public Codex App Server client shape", () => {
    expectTypeOf(createNodeCodexAppServerClient()).toMatchTypeOf<CodexAppServerClient>()
  })
})
