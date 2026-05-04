import { describe, expect, expectTypeOf, it } from "vitest"

import {
  defineProviderInstance,
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
  ProviderOperationUnsupportedError
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
    expect(provider.capabilities).toEqual({
      connectivity: "connectionless",
      supportsCancel: false,
      supportsInterrupt: false,
      supportsResume: false,
      supportsSteering: false,
      supportsTerminalOutcomeCollection: false
    })
  })

  it("generates a provider instance id when one is not supplied", () => {
    const provider = defineProviderInstance({
      connectivity: "connectionful",
      provider: "openai-codex",
      startSession: startRunningSession
    })

    expect(provider.id).toMatch(/^provider-instance-\d+$/)
  })

  it("reports typed unsupported lifecycle operations", async () => {
    const provider = defineProviderInstance({
      connectivity: "connectionful",
      id: "codex-review",
      provider: "openai-codex",
      startSession: startRunningSession
    })
    const providerSession = {
      external: [],
      provider: "openai-codex",
      providerInstanceId: provider.id,
      providerSessionId: "codex-review-session"
    } as const
    const controlContext = {
      assignmentId: makeAssignmentId("assignment-unsupported"),
      providerSession,
      sessionId: makeSessionId("session-unsupported")
    }

    await expect(provider.cancelSession(controlContext)).rejects.toMatchObject({
      code: "provider_operation_unsupported",
      details: { operation: "cancel", providerInstanceId: provider.id },
      name: "ProviderOperationUnsupportedError"
    })
    await expect(provider.collectTerminalOutcome(controlContext)).rejects.toMatchObject({
      details: {
        operation: "collect-terminal-outcome",
        providerInstanceId: provider.id
      }
    })
    await expect(
      provider.resumeSession({
        ...startContextForResume(provider.id),
        previousSession: providerSession,
        resumePrompt: "Continue."
      })
    ).rejects.toBeInstanceOf(ProviderOperationUnsupportedError)
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

function startContextForResume(
  providerInstanceId: ProviderInstanceId
): ProviderSessionStartContext {
  return {
    agent: {
      acceptableRuntimes: [{ id: makeRuntimeId("runtime-resume"), priority: 10 }],
      concurrencyLimit: 1,
      id: makeAgentId("agent-resume"),
      model: "gpt-5.1-codex",
      modelFamily: "gpt",
      provider: "openai-codex",
      providerInstanceId
    },
    assignmentId: makeAssignmentId("assignment-resume"),
    noCode: true,
    runtime: {
      capacity: 1,
      id: makeRuntimeId("runtime-resume"),
      state: "healthy",
      type: "local-worktree"
    },
    sessionId: makeSessionId("session-resume"),
    task: {
      id: makeTaskId("task-resume"),
      intent: "Resume.",
      title: "Resume"
    },
    workspace: {
      id: makeWorkspaceId("workspace-resume"),
      repository: {
        owner: "stoneforge-ai",
        provider: "github",
        repo: "stoneforge",
        targetBranch: "main"
      },
      state: "ready"
    }
  }
}
