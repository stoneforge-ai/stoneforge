import { describe, expect, it } from "vitest"

import {
  completeProviderSession,
  defineProviderInstance,
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId,
} from "@stoneforge/execution"
import type {
  ExecutionProviderInstance,
  ProviderKind,
  ProviderSessionStartContext,
} from "@stoneforge/execution"

import { createElectronDesktopTaskClient } from "./index.js"

describe("Electron desktop local Task client", () => {
  it("runs no-code Tasks through the shared command surface in desktop-managed local mode", async () => {
    const client = createElectronDesktopTaskClient({
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: () =>
          makeAssignmentId("assignment-desktop-local-claude"),
        nextSessionId: () => makeSessionId("session-desktop-local-claude"),
        nextTaskId: () => makeTaskId("task-desktop-local-claude"),
      },
      providerInstances: [
        completedDesktopProvider(
          "claude-desktop-local",
          "claude-code",
          "Desktop local checked the Task."
        ),
      ],
      workspace: {
        providers: [
          {
            agentId: makeAgentId("agent-claude-desktop-local"),
            model: "claude-sonnet-4-6",
            modelFamily: "claude",
            provider: "claude-code",
            providerInstanceId: makeProviderInstanceId("claude-desktop-local"),
          },
        ],
        runtimeId: makeRuntimeId("runtime-desktop-local"),
        workspaceId: makeWorkspaceId("workspace-desktop-local"),
      },
    })

    const run = await client.runNoCodeTask({
      intent: "Confirm Electron can dispatch through the local control plane.",
      provider: "claude-code",
      title: "Verify desktop local dispatch",
    })

    expect(run).toMatchObject({
      connectionMode: "managed-by-desktop",
      humanPrincipal: "local-human",
      provider: "claude-code",
      providerSessionId: "claude-code:desktop-local",
      status: "completed",
      task: {
        id: makeTaskId("task-desktop-local-claude"),
        state: "completed",
        title: "Verify desktop local dispatch",
      },
    })
    await expect(client.readTaskConsole()).resolves.toMatchObject({
      assignments: [
        {
          provider: "claude-code",
          runtimeId: makeRuntimeId("runtime-desktop-local"),
        },
      ],
      connectionMode: "managed-by-desktop",
      humanPrincipal: "local-human",
      sessions: [
        {
          finalSummary: "Desktop local checked the Task.",
          providerSessionId: "claude-code:desktop-local",
        },
      ],
      tasks: [
        {
          id: makeTaskId("task-desktop-local-claude"),
          state: "completed",
        },
      ],
      workspace: {
        id: makeWorkspaceId("workspace-desktop-local"),
        state: "ready",
      },
    })
  })
})

function completedDesktopProvider(
  id: string,
  provider: ProviderKind,
  summary: string
): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionless",
    id,
    provider,
    startSession: async (context) =>
      completeDesktopSession(context, id, provider, summary),
  })
}

function completeDesktopSession(
  context: ProviderSessionStartContext,
  id: string,
  provider: ProviderKind,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerInstanceId = makeProviderInstanceId(id)
  const providerSessionId = `${provider}:desktop-local`

  return completeProviderSession({
    context,
    events: [
      {
        kind: "provider.session.started",
        providerSessionId,
      },
      {
        kind: "provider.session.completed",
        status: "completed",
        summary,
      },
    ],
    logs: [],
    providerSession: {
      external: [{ kind: "claude.session", sessionId: "desktop-local" }],
      provider,
      providerInstanceId,
      providerSessionId,
    },
    summary,
    transcript: [{ role: "assistant", text: summary }],
  })
}
