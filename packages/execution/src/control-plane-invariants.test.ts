import { describe, expect, it } from "vitest"

import {
  completeProviderSession,
  createExecutionControlPlane,
  defineProviderInstance,
  makeAgentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeTaskId,
  makeWorkspaceId,
  type ExecutionControlPlane,
  type WorkspaceId
} from "./index.js"

describe("execution control-plane invariants", () => {
  it("does not dispatch a ready Task from another Workspace", async () => {
    const workspaceAId = makeWorkspaceId("workspace-empty-scope")
    const workspaceBId = makeWorkspaceId("workspace-ready-scope")
    const taskBId = makeTaskId("task-ready-other-workspace")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstance()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceAId)
    await configureClaudeWorkspace(controlPlane, workspaceBId)
    await controlPlane.createNoCodeTask({
      id: taskBId,
      intent: "Stay scoped to Workspace B.",
      requiredAgentTags: ["provider:claude-code"],
      title: "Other Workspace task",
      workspaceId: workspaceBId
    })
    await controlPlane.activateTask({ taskId: taskBId, workspaceId: workspaceBId })

    await expect(
      controlPlane.dispatchNextTask({ workspaceId: workspaceAId })
    ).resolves.toEqual({
      reason: "no_ready_task",
      status: "queued"
    })
  })

  it("reports Workspace readiness from both Agent and healthy Runtime availability", async () => {
    const runtimeId = makeRuntimeId("runtime-readiness")
    const controlPlane = createExecutionControlPlane({
      providerInstances: []
    })

    await expect(
      controlPlane.configureWorkspace({
        agents: [],
        id: makeWorkspaceId("workspace-no-agents"),
        repository: repositoryFixture,
        runtimes: [
          {
            capacity: 1,
            id: runtimeId,
            state: "healthy",
            type: "local-worktree"
          }
        ]
      })
    ).resolves.toMatchObject({ state: "degraded" })

    await expect(
      controlPlane.configureWorkspace({
        agents: [
          {
            acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
            concurrencyLimit: 1,
            id: makeAgentId("agent-readiness"),
            model: "claude-sonnet-4.5",
            modelFamily: "claude",
            provider: "claude-code",
            providerInstanceId: makeProviderInstanceId("claude-test")
          }
        ],
        id: makeWorkspaceId("workspace-mixed-runtimes"),
        repository: repositoryFixture,
        runtimes: [
          {
            capacity: 1,
            id: makeRuntimeId("runtime-unhealthy-readiness"),
            state: "unhealthy",
            type: "container"
          },
          {
            capacity: 1,
            id: runtimeId,
            state: "healthy",
            type: "local-worktree"
          }
        ]
      })
    ).resolves.toMatchObject({ state: "ready" })
  })

  it("requires an Agent to satisfy every required tag", async () => {
    const workspaceId = makeWorkspaceId("workspace-all-tags")
    const taskId = makeTaskId("task-all-tags")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstance()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)
    await controlPlane.createNoCodeTask({
      id: taskId,
      intent: "Require a tag combination no single Agent has.",
      requiredAgentTags: ["provider:claude-code", "model:gpt-5.1-codex"],
      title: "Require all tags",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).rejects.toThrow(
      "No eligible Agent satisfies the required Agent tags."
    )
  })

  it("keeps completed provider Sessions without terminal outcomes readable", async () => {
    const workspaceId = makeWorkspaceId("workspace-no-terminal-outcome")
    const taskId = makeTaskId("task-no-terminal-outcome")
    const providerInstanceId = makeProviderInstanceId("claude-test")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [
        defineProviderInstance({
          connectivity: "connectionless",
          id: providerInstanceId,
          provider: "claude-code",
          startSession: async (context) => ({
            events: [],
            logs: [],
            providerSession: {
              external: [],
              provider: "claude-code",
              providerInstanceId,
              providerSessionId: "provider-session-no-terminal-outcome"
            },
            sessionId: context.sessionId,
            status: "completed",
            transcript: []
          })
        })
      ]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)
    await controlPlane.createNoCodeTask({
      id: taskId,
      intent: "Complete without terminal outcome.",
      requiredAgentTags: ["provider:claude-code"],
      title: "No terminal outcome",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })
    await controlPlane.dispatchNextTask({ workspaceId })

    await expect(
      controlPlane.readWorkspaceExecution({ workspaceId })
    ).resolves.toMatchObject({
      sessions: [
        {
          finalSummary: "",
          providerSessionId: "provider-session-no-terminal-outcome"
        }
      ]
    })
  })
})

const repositoryFixture = {
  owner: "stoneforge-ai",
  provider: "github",
  repo: "stoneforge",
  targetBranch: "main"
} as const

function claudeProviderInstance() {
  return defineProviderInstance({
    connectivity: "connectionless",
    id: makeProviderInstanceId("claude-test"),
    provider: "claude-code",
    startSession: async (context) => {
      const summary = `Completed ${context.task.title}`
      const providerSession = {
        external: [],
        provider: context.agent.provider,
        providerInstanceId: context.agent.providerInstanceId,
        providerSessionId: "claude-provider-session-test"
      }

      return completeProviderSession({
        context,
        events: [
          {
            kind: "provider.session.started",
            providerSessionId: providerSession.providerSessionId
          },
          {
            kind: "provider.session.completed",
            status: "completed",
            summary
          }
        ],
        logs: [],
        providerSession,
        summary,
        transcript: [{ role: "assistant", text: summary }]
      })
    }
  })
}

async function configureClaudeWorkspace(
  controlPlane: ExecutionControlPlane,
  workspaceId: WorkspaceId
) {
  const runtimeId = makeRuntimeId("runtime-test")

  await controlPlane.configureWorkspace({
    agents: [
      {
        acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
        concurrencyLimit: 1,
        id: makeAgentId("agent-claude-test"),
        model: "claude-sonnet-4.5",
        modelFamily: "claude",
        provider: "claude-code",
        providerInstanceId: makeProviderInstanceId("claude-test")
      }
    ],
    id: workspaceId,
    repository: repositoryFixture,
    runtimes: [
      {
        capacity: 1,
        id: runtimeId,
        state: "healthy",
        type: "local-worktree"
      }
    ]
  })
}
