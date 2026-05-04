import { describe, expect, it } from "vitest"

import {
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
  ProviderSessionStartContext,
} from "@stoneforge/execution"

import { createLocalTaskConsole } from "./index.js"

describe("TanStack Start local web Task console", () => {
  it("runs a no-code Task in local single-user mode", async () => {
    const console = createLocalTaskConsole({
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: () => makeAssignmentId("assignment-local-web"),
        nextSessionId: () => makeSessionId("session-local-web"),
        nextTaskId: () => makeTaskId("task-local-web"),
      },
      providerInstances: [
        completedLocalProvider(
          "claude-local-web",
          "Local web checked the Task."
        ),
      ],
      workspace: {
        agentId: makeAgentId("agent-claude-local"),
        providerInstanceId: makeProviderInstanceId("claude-local-web"),
        runtimeId: makeRuntimeId("runtime-local-web"),
        workspaceId: makeWorkspaceId("workspace-local-web"),
      },
    })

    const run = await console.runNoCodeTask({
      intent: "Confirm local web can dispatch through the control plane.",
      title: "Verify local web dispatch",
    })

    expect(run).toMatchObject({
      connectionMode: "local",
      humanPrincipal: "local-human",
      status: "completed",
      task: {
        id: makeTaskId("task-local-web"),
        state: "completed",
        title: "Verify local web dispatch",
      },
    })

    expect(await console.readTaskConsole()).toMatchObject({
      connectionMode: "local",
      humanPrincipal: "local-human",
      tasks: [
        {
          id: makeTaskId("task-local-web"),
          state: "completed",
          title: "Verify local web dispatch",
        },
      ],
      sessions: [
        {
          finalSummary: "Local web checked the Task.",
          providerSessionId: "claude-code:local-web",
        },
      ],
    })
  })

  it("bootstraps the default local web workspace before running Tasks", async () => {
    const console = createLocalTaskConsole({
      providerInstances: [
        completedLocalProvider(
          "claude-local-web",
          "Default workspace completed."
        ),
      ],
    })

    await expect(console.readTaskConsole()).resolves.toMatchObject({
      connectionMode: "local",
      humanPrincipal: "local-human",
      tasks: [],
      workspace: {
        id: makeWorkspaceId("workspace-local-web"),
        state: "ready",
      },
    })

    await expect(
      console.runNoCodeTask({
        intent: "Run through default local web configuration.",
        title: "Default local Task",
      })
    ).resolves.toMatchObject({
      providerSessionId: "claude-code:local-web",
      sessionId: makeSessionId("session-local-web-1"),
      task: {
        id: makeTaskId("task-local-web-1"),
        state: "completed",
      },
    })
  })
})

function completedLocalProvider(
  id: string,
  summary: string
): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionless",
    id,
    provider: "claude-code",
    startSession: async (context) => completeSession(context, id, summary),
  })
}

function completeSession(
  context: ProviderSessionStartContext,
  id: string,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerInstanceId = makeProviderInstanceId(id)

  return {
    events: [
      {
        kind: "provider.session.started",
        providerSessionId: "claude-code:local-web",
      },
      {
        kind: "provider.session.completed",
        status: "completed",
        summary,
      },
    ],
    logs: [],
    providerSession: {
      external: [{ kind: "claude.session", sessionId: "local-web" }],
      provider: "claude-code",
      providerInstanceId,
      providerSessionId: "claude-code:local-web",
    },
    sessionId: context.sessionId,
    status: "completed",
    terminalOutcome: {
      providerSession: {
        external: [{ kind: "claude.session", sessionId: "local-web" }],
        provider: "claude-code",
        providerInstanceId,
        providerSessionId: "claude-code:local-web",
      },
      status: "completed",
      summary,
    },
    transcript: [{ role: "assistant", text: summary }],
  }
}
