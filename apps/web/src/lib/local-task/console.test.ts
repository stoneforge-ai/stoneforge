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
  ProviderKind,
  ProviderSessionStartContext,
} from "@stoneforge/execution"

import { createLocalTaskConsole } from "../../index.js"

describe("TanStack Start local web Task console", () => {
  it("runs no-code Tasks for Claude Code and OpenAI Codex in local single-user mode", async () => {
    const console = createLocalTaskConsole({
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: (() => {
          const ids = [
            makeAssignmentId("assignment-local-web-claude"),
            makeAssignmentId("assignment-local-web-codex"),
          ]

          return () => ids.shift() ?? makeAssignmentId("assignment-extra")
        })(),
        nextSessionId: (() => {
          const ids = [
            makeSessionId("session-local-web-claude"),
            makeSessionId("session-local-web-codex"),
          ]

          return () => ids.shift() ?? makeSessionId("session-extra")
        })(),
        nextTaskId: (() => {
          const ids = [
            makeTaskId("task-local-web-claude"),
            makeTaskId("task-local-web-codex"),
          ]

          return () => ids.shift() ?? makeTaskId("task-extra")
        })(),
      },
      providerInstances: [
        completedLocalProvider(
          "claude-local-web",
          "claude-code",
          "Local web checked the Task."
        ),
        completedLocalProvider(
          "codex-local-web",
          "openai-codex",
          "Codex checked the Task."
        ),
      ],
      workspace: {
        providers: [
          {
            agentId: makeAgentId("agent-claude-local"),
            model: "claude-sonnet-4-6",
            modelFamily: "claude",
            provider: "claude-code",
            providerInstanceId: makeProviderInstanceId("claude-local-web"),
          },
          {
            agentId: makeAgentId("agent-codex-local"),
            model: "gpt-5.5",
            modelFamily: "gpt",
            provider: "openai-codex",
            providerInstanceId: makeProviderInstanceId("codex-local-web"),
          },
        ],
        runtimeId: makeRuntimeId("runtime-local-web"),
        workspaceId: makeWorkspaceId("workspace-local-web"),
      },
    })

    const claudeRun = await console.runNoCodeTask({
      intent: "Confirm local web can dispatch through the control plane.",
      provider: "claude-code",
      title: "Verify local web dispatch",
    })
    const codexRun = await console.runNoCodeTask({
      intent: "Confirm local web can dispatch to Codex.",
      provider: "openai-codex",
      title: "Verify Codex local web dispatch",
    })

    expect(claudeRun).toMatchObject({
      connectionMode: "local",
      humanPrincipal: "local-human",
      provider: "claude-code",
      status: "completed",
      task: {
        id: makeTaskId("task-local-web-claude"),
        state: "completed",
        title: "Verify local web dispatch",
      },
    })
    expect(codexRun).toMatchObject({
      provider: "openai-codex",
      status: "completed",
      task: {
        id: makeTaskId("task-local-web-codex"),
        state: "completed",
        title: "Verify Codex local web dispatch",
      },
    })

    expect(await console.readTaskConsole()).toMatchObject({
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
      tasks: [
        {
          id: makeTaskId("task-local-web-claude"),
          state: "completed",
          title: "Verify local web dispatch",
        },
        {
          id: makeTaskId("task-local-web-codex"),
          state: "completed",
          title: "Verify Codex local web dispatch",
        },
      ],
      sessions: [
        {
          finalSummary: "Local web checked the Task.",
          providerSessionId: "claude-code:local-web",
        },
        {
          finalSummary: "Codex checked the Task.",
          providerSessionId: "openai-codex:local-web:turn-local-web",
        },
      ],
    })
  })

  it("bootstraps the default local web workspace before running Tasks", async () => {
    const console = createLocalTaskConsole({
      providerInstances: [
        completedLocalProvider(
          "claude-local-web",
          "claude-code",
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
        provider: "claude-code",
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

  it("configures default Claude Code and OpenAI Codex provider Agents", async () => {
    const console = createLocalTaskConsole()

    await expect(console.readTaskConsole()).resolves.toMatchObject({
      connectionMode: "local",
      humanPrincipal: "local-human",
      workspace: {
        id: makeWorkspaceId("workspace-local-web"),
        state: "ready",
      },
    })
  })

  it("rejects a default local web Workspace without a Codex provider", () => {
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

function completedLocalProvider(
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
      ? "claude-code:local-web"
      : "openai-codex:local-web:turn-local-web"

  return {
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
      external:
        provider === "claude-code"
          ? [{ kind: "claude.session", sessionId: "local-web" }]
          : [
              { kind: "codex.thread", threadId: "local-web" },
              {
                kind: "codex.turn",
                threadId: "local-web",
                turnId: "turn-local-web",
              },
            ],
      provider,
      providerInstanceId,
      providerSessionId,
    },
    sessionId: context.sessionId,
    status: "completed",
    terminalOutcome: {
      providerSession: {
        external:
          provider === "claude-code"
            ? [{ kind: "claude.session", sessionId: "local-web" }]
            : [
                { kind: "codex.thread", threadId: "local-web" },
                {
                  kind: "codex.turn",
                  threadId: "local-web",
                  turnId: "turn-local-web",
                },
              ],
        provider,
        providerInstanceId,
        providerSessionId,
      },
      status: "completed",
      summary,
    },
    transcript: [{ role: "assistant", text: summary }],
  }
}
