import { describe, expect, expectTypeOf, it } from "vitest"

import {
  defineProviderInstance,
  makeProviderInstanceId
} from "./index.js"
import type {
  ExecutionProviderInstance,
  ProviderInstanceId,
  ProviderSessionStartContext
} from "./index.js"

describe("provider instance model helpers", () => {
  it("defines a provider instance through the public provider contract", () => {
    const providerInstanceId = makeProviderInstanceId("claude-review")
    const provider = defineProviderInstance({
      connectivity: "connectionless",
      id: providerInstanceId,
      provider: "claude-code",
      startSession: startRunningSession
    })

    expectTypeOf(provider).toMatchTypeOf<ExecutionProviderInstance>()
    expectTypeOf(provider.id).toEqualTypeOf<ProviderInstanceId>()
    expect(provider.id).toBe(providerInstanceId)
  })

  it("generates a provider instance id when one is not supplied", () => {
    const provider = defineProviderInstance({
      connectivity: "connectionful",
      provider: "openai-codex",
      startSession: startRunningSession
    })

    expect(provider.id).toMatch(/^provider-instance-\d+$/)
  })
})

async function startRunningSession(context: ProviderSessionStartContext) {
  return {
    events: [],
    logs: [],
    providerSession: {
      external: [],
      provider: context.agent.provider,
      providerInstanceId: context.agent.providerInstanceId,
      providerSessionId: "provider-session-test"
    },
    sessionId: context.sessionId,
    status: "running",
    transcript: []
  } satisfies Awaited<ReturnType<ExecutionProviderInstance["startSession"]>>
}
