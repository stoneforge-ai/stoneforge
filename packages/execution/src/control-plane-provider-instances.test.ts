import { describe, expect, it } from "vitest"

import {
  completeProviderSession,
  createExecutionControlPlane,
  defineProviderInstance
} from "./index.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartContext
} from "./index.js"

describe("execution provider instance routing", () => {
  it("distinguishes multiple provider instances for the same provider kind", async () => {
    const workspaceId = "workspace-provider-instances"
    const runtimeId = "runtime-provider-instances"
    const primaryProviderInstance = defineProviderInstance({
      connectivity: "connectionless",
      id: "claude-primary",
      provider: "claude-code",
      startSession: async (context) =>
        completedProviderResult(
          context,
          "primary-provider-session",
          "Primary Claude completed the task."
        )
    })
    const reviewProviderInstance = defineProviderInstance({
      connectivity: "connectionless",
      id: "claude-review",
      provider: "claude-code",
      startSession: async (context) =>
        completedProviderResult(
          context,
          "review-provider-session",
          "Review Claude completed the task."
        )
    })

    const controlPlane = createExecutionControlPlane({
      providerInstances: [primaryProviderInstance, reviewProviderInstance]
    })

    await controlPlane.configureWorkspace({
      agents: [
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          model: "claude-sonnet-4-6",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId: primaryProviderInstance.id
        },
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          model: "claude-sonnet-4-6",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId: reviewProviderInstance.id
        }
      ],
      repository: {
        owner: "stoneforge-ai",
        provider: "github",
        repo: "stoneforge",
        targetBranch: "main"
      },
      id: workspaceId,
      runtimes: [{ capacity: 2, id: runtimeId, state: "healthy", type: "local-worktree" }]
    })
    const task = await controlPlane.createNoCodeTask({
      intent: "Use the review Claude instance.",
      requiredAgentTags: [
        `provider-instance:${reviewProviderInstance.id}`
      ],
      title: "Route to review instance",
      workspaceId
    })
    await controlPlane.activateTask({ taskId: task.id, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).resolves.toMatchObject(
      {
        provider: "claude-code",
        providerInstanceId: reviewProviderInstance.id,
        taskId: task.id
      }
    )
    await expect(
      controlPlane.readWorkspaceExecution({ workspaceId })
    ).resolves.toMatchObject({
      agents: [
        {
          id: "agent-1",
          providerInstanceId: primaryProviderInstance.id
        },
        {
          id: "agent-2",
          providerInstanceId: reviewProviderInstance.id
        }
      ],
      sessions: [
        {
          finalSummary: "Review Claude completed the task.",
          providerInstanceId: reviewProviderInstance.id,
          providerSessionId: "review-provider-session"
        }
      ]
    })
  })
})

function completedProviderResult(
  context: ProviderSessionStartContext,
  providerSessionId: string,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerSession = {
    external: [],
    provider: context.agent.provider,
    providerInstanceId: context.agent.providerInstanceId,
    providerSessionId
  }

  return completeProviderSession({
    context,
    events: [
      { kind: "provider.session.started", providerSessionId },
      { kind: "provider.session.completed", status: "completed", summary }
    ],
    logs: [],
    providerSession,
    summary,
    transcript: [{ role: "assistant", text: summary }]
  })
}
