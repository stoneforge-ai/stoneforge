import { describe, expectTypeOf, it } from "vitest"

import type {
  RegisterManagedRuntimeInput,
  RegisterRuntimeInput,
} from "./index.js"

describe("workspace input types", () => {
  it("correlates registered runtime location with accepted modes", () => {
    const managedRuntime = {
      name: "managed sandbox",
      location: "managed",
      mode: "managed_sandbox",
      managedProvider: "daytona",
    } satisfies RegisterRuntimeInput

    expectTypeOf(managedRuntime).toMatchTypeOf<RegisterManagedRuntimeInput>()
  })

  it("rejects unsupported runtime registration combinations", () => {
    const invalidRuntime = {
      name: "bad managed runtime",
      location: "managed",
      mode: "local_worktree",
      managedProvider: "daytona",
    }

    // @ts-expect-error Managed runtime registration must use managed_sandbox.
    const input: RegisterRuntimeInput = invalidRuntime
    expectTypeOf(input).toEqualTypeOf<RegisterRuntimeInput>()
  })
})
