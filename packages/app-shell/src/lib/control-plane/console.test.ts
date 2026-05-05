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

import { createLocalTaskConsole } from "../../index.js"

describe("shared local Task command surface", () => {
  it("runs no-code Tasks for both first-slice providers", async () => {
    const console = createLocalTaskConsole({
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: (() => {
          const ids = [
            makeAssignmentId("assignment-local-claude"),
            makeAssignmentId("assignment-local-codex"),
          ]

          return () => ids.shift() ?? makeAssignmentId("assignment-extra")
        })(),
        nextSessionId: (() => {
          const ids = [
            makeSessionId("session-local-claude"),
            makeSessionId("session-local-codex"),
          ]

          return () => ids.shift() ?? makeSessionId("session-extra")
        })(),
        nextTaskId: (() => {
          const ids = [
            makeTaskId("task-local-claude"),
            makeTaskId("task-local-codex"),
          ]

          return () => ids.shift() ?? makeTaskId("task-extra")
        })(),
      },
      providerInstances: [
        completedProvider(
          "claude-local-web",
          "claude-code",
          "Claude completed the Task."
        ),
        completedProvider(
          "codex-local-web",
          "openai-codex",
          "Codex completed the Task."
        ),
      ],
    })

    await expect(
      console.runNoCodeTask({
        intent: "Confirm the shared local command can dispatch to Claude.",
        provider: "claude-code",
        title: "Shared Claude Task",
      })
    ).resolves.toMatchObject({
      connectionMode: "local",
      provider: "claude-code",
      task: { id: makeTaskId("task-local-claude"), state: "completed" },
    })
    await expect(
      console.runNoCodeTask({
        intent: "Confirm the shared local command can dispatch to Codex.",
        provider: "openai-codex",
        title: "Shared Codex Task",
      })
    ).resolves.toMatchObject({
      provider: "openai-codex",
      task: { id: makeTaskId("task-local-codex"), state: "completed" },
    })
    await expect(console.readTaskConsole()).resolves.toMatchObject({
      assignments: [{ provider: "claude-code" }, { provider: "openai-codex" }],
      connectionMode: "local",
      humanPrincipal: "local-human",
      lineage: [
        { event: "task.created" },
        { event: "task.activated" },
        { event: "assignment.started", provider: "claude-code" },
        { event: "session.completed" },
        { event: "task.completed" },
        { event: "task.created" },
        { event: "task.activated" },
        { event: "assignment.started", provider: "openai-codex" },
        { event: "session.completed" },
        { event: "task.completed" },
      ],
      sessions: [
        { finalSummary: "Claude completed the Task." },
        { finalSummary: "Codex completed the Task." },
      ],
    })
  })

  it("supports a desktop-managed local connection profile", async () => {
    const console = createLocalTaskConsole({
      connectionMode: "managed-by-desktop",
      idPrefix: "desktop-local",
      providerInstances: [
        completedProvider(
          "claude-desktop-local",
          "claude-code",
          "Desktop profile completed the Task."
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
      workspaceLabel: "Desktop local Workspace",
      worktreePath: "/tmp/stoneforge-desktop",
    })

    await expect(
      console.runNoCodeTask({
        intent: "Confirm the desktop-managed profile uses shared dispatch.",
        provider: "claude-code",
        title: "Desktop profile Task",
      })
    ).resolves.toMatchObject({
      connectionMode: "managed-by-desktop",
      sessionId: makeSessionId("session-desktop-local-1"),
      task: {
        id: makeTaskId("task-desktop-local-1"),
        state: "completed",
      },
    })
  })

  it("makes a running Assignment and Session readable while provider dispatch is pending", async () => {
    let completeProviderRun: () => void = () => {
      throw new Error("Provider run was not started.")
    }
    const console = createLocalTaskConsole({
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: () => makeAssignmentId("assignment-pending"),
        nextSessionId: () => makeSessionId("session-pending"),
        nextTaskId: () => makeTaskId("task-pending"),
      },
      providerInstances: [
        defineProviderInstance({
          connectivity: "connectionless",
          id: makeProviderInstanceId("claude-pending"),
          provider: "claude-code",
          startSession: async (context) =>
            new Promise<
              Awaited<ReturnType<ExecutionProviderInstance["startSession"]>>
            >((resolve) => {
              completeProviderRun = () =>
                resolve(
                  completeSession(
                    context,
                    "claude-pending",
                    "claude-code",
                    "Pending provider completed."
                  )
                )
            }),
        }),
      ],
      workspace: {
        providers: [
          {
            agentId: makeAgentId("agent-claude-pending"),
            model: "claude-sonnet-4-6",
            modelFamily: "claude",
            provider: "claude-code",
            providerInstanceId: makeProviderInstanceId("claude-pending"),
          },
        ],
        runtimeId: makeRuntimeId("runtime-pending"),
        workspaceId: makeWorkspaceId("workspace-pending"),
      },
    })

    await expect(
      console.startNoCodeTask({
        intent: "Show Task before provider completion.",
        provider: "claude-code",
        title: "Pending provider Task",
      })
    ).resolves.toMatchObject({
      status: "started",
      task: { id: makeTaskId("task-pending"), state: "ready" },
    })

    const dispatch = console.dispatchNextTask()

    await expect.poll(async () => {
      const view = await console.readTaskConsole()

      return view.sessions[0]?.status
    }).toBe("running")
    await expect(console.readTaskConsole()).resolves.toMatchObject({
      assignments: [
        {
          id: makeAssignmentId("assignment-pending"),
          status: "running",
          taskId: makeTaskId("task-pending"),
        },
      ],
      sessions: [
        {
          id: makeSessionId("session-pending"),
          providerSessionId: "claude-code:pending:session-pending",
          status: "running",
        },
      ],
      tasks: [{ id: makeTaskId("task-pending"), state: "in_progress" }],
    })

    completeProviderRun()
    await expect(dispatch).resolves.toMatchObject({
      run: {
        status: "completed",
        task: { id: makeTaskId("task-pending"), state: "completed" },
      },
      status: "completed",
    })
  })

  it("reports missing default provider configuration with the shell label", async () => {
    await expect(
      createLocalTaskConsole({
        providerInstances: [
          completedProvider(
            "claude-local-web",
            "claude-code",
            "Default workspace completed."
          ),
          completedProvider(
            "codex-local-web",
            "openai-codex",
            "Default workspace completed."
          ),
        ],
      }).readTaskConsole()
    ).resolves.toMatchObject({
      workspace: {
        id: makeWorkspaceId("workspace-local-web"),
        state: "ready",
      },
    })

    expect(() =>
      createLocalTaskConsole({
        workspace: {
          providers: [
            {
              agentId: makeAgentId("agent-claude-local"),
              model: "claude-sonnet-4-6",
              modelFamily: "claude",
              provider: "claude-code",
              providerInstanceId: makeProviderInstanceId("claude-local-web"),
            },
          ],
          runtimeId: makeRuntimeId("runtime-local-web"),
          workspaceId: makeWorkspaceId("workspace-local-web"),
        },
      })
    ).toThrow("Local web Workspace is missing a openai-codex Provider.")
  })
})

function completedProvider(
  id: string,
  provider: ProviderKind,
  summary: string
): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity:
      provider === "claude-code" ? "connectionless" : "connectionful",
    id,
    provider,
    startSession: async (context) =>
      completeSession(context, id, provider, summary),
  })
}

function completeSession(
  context: ProviderSessionStartContext,
  id: string,
  provider: ProviderKind,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerInstanceId = makeProviderInstanceId(id)
  const providerSessionId =
    provider === "claude-code"
      ? "claude-code:local-command"
      : "openai-codex:local-command:turn-local-command"
  const external =
    provider === "claude-code"
      ? [{ kind: "claude.session" as const, sessionId: "local-command" }]
      : [
          { kind: "codex.thread" as const, threadId: "local-command" },
          {
            kind: "codex.turn" as const,
            threadId: "local-command",
            turnId: "turn-local-command",
          },
        ]

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
      external,
      provider,
      providerInstanceId,
      providerSessionId,
    },
    summary,
    transcript: [{ role: "assistant", text: summary }],
  })
}
