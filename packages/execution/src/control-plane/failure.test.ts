import { describe, expect, it } from "vitest"

import {
  createExecutionControlPlane,
  defineProviderInstance,
  makeAgentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeTaskId,
  makeWorkspaceId
} from "../index.js"

describe("execution control-plane provider failures", () => {
  it("keeps a Task ready for retry when provider launch fails", async () => {
    const workspaceId = makeWorkspaceId("workspace-provider-failure")
    const runtimeId = makeRuntimeId("runtime-provider-failure")
    const taskId = makeTaskId("task-provider-failure")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [
        defineProviderInstance({
          connectivity: "connectionless",
          id: makeProviderInstanceId("claude-test"),
          provider: "claude-code",
          startSession: async (context) => {
            context.onEvent?.({
              kind: "provider.session.started",
              providerSessionId: "claude-provider-session-before-failure"
            })
            context.onEvent?.({
              kind: "provider.log",
              level: "info",
              message: "provider accepted task before failure"
            })
            context.onEvent?.({
              kind: "provider.transcript.item.completed",
              role: "assistant",
              text: "partial failure context"
            })
            throw new Error("provider auth failed")
          }
        })
      ]
    })

    await controlPlane.configureWorkspace({
      agents: [
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          id: makeAgentId("agent-provider-failure"),
          model: "claude-sonnet-4-6",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId: makeProviderInstanceId("claude-test")
        }
      ],
      repository: {
        owner: "stoneforge-ai",
        provider: "github",
        repo: "stoneforge",
        targetBranch: "main"
      },
      runtimes: [
        {
          capacity: 1,
          id: runtimeId,
          state: "healthy",
          type: "local-worktree"
        }
      ],
      id: workspaceId
    })
    await controlPlane.createNoCodeTask({
      intent: "Provider fails before a Session starts.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskId,
      title: "Handle provider launch failure",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).rejects.toThrow(
      "provider auth failed"
    )
    await expect(
      controlPlane.readWorkspaceExecution({ workspaceId })
    ).resolves.toMatchObject({
      assignments: [
        {
          provider: "claude-code",
          status: "failed",
          taskId
        }
      ],
      lineage: [
        { event: "task.created", taskId },
        { event: "task.activated", taskId },
        { event: "assignment.started", provider: "claude-code", taskId },
        {
          event: "session.failed",
          message: "provider auth failed",
          providerSessionId: "claude-provider-session-before-failure"
        }
      ],
      sessions: [
        {
          events: [
            {
              kind: "provider.session.started",
              providerSessionId: "claude-code:pending:session-1"
            },
            {
              kind: "provider.session.started",
              providerSessionId: "claude-provider-session-before-failure"
            },
            {
              kind: "provider.log",
              level: "info",
              message: "provider accepted task before failure"
            },
            {
              kind: "provider.transcript.item.completed",
              role: "assistant",
              text: "partial failure context"
            },
            {
              kind: "provider.log",
              level: "error",
              message: "provider auth failed"
            },
            {
              kind: "provider.session.completed",
              status: "failed",
              summary: "provider auth failed"
            }
          ],
          finalSummary: "provider auth failed",
          logs: [
            {
              level: "info",
              message: "provider accepted task before failure"
            },
            { level: "error", message: "provider auth failed" }
          ],
          providerSessionId: "claude-provider-session-before-failure",
          status: "failed",
          transcript: [{ text: "partial failure context" }]
        }
      ],
      tasks: [
        {
          id: taskId,
          state: "ready"
        }
      ]
    })
  })
})
