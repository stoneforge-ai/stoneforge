import { describe, expect, it } from "vitest"

import {
  createExecutionControlPlane,
  defineProviderInstance,
  makeAgentId,
  makeAssignmentId,
  makeProviderInstanceId,
  makeRuntimeId,
  makeSessionId,
  makeTaskId,
  makeWorkspaceId
} from "./index.js"
import {
  claudeProviderInstanceFixture,
  completedProviderResult,
  configureClaudeWorkspace
} from "./control-plane-test-support.js"

describe("shared execution control-plane contract", () => {
  it("dispatches a no-code Task through a Claude Code Worker Session", async () => {
    const workspaceId = makeWorkspaceId("workspace-first-slice")
    const runtimeId = makeRuntimeId("runtime-local")
    const agentId = makeAgentId("agent-claude")
    const taskId = makeTaskId("task-docs-review")
    const assignmentId = makeAssignmentId("assignment-claude")
    const sessionId = makeSessionId("session-claude")
    const providerInstanceId = makeProviderInstanceId("claude-primary")

    const controlPlane = createExecutionControlPlane({
      providerInstances: [
        defineProviderInstance({
          connectivity: "connectionless",
          id: providerInstanceId,
          provider: "claude-code",
          startSession: async (context) =>
            completedProviderResult(
              context,
              "claude-provider-session-1",
              `Completed ${context.task.title}`
            )
        })
      ],
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: () => assignmentId,
        nextSessionId: () => sessionId,
        nextTaskId: () => makeTaskId("task-generated")
      }
    })

    await controlPlane.configureWorkspace({
      agents: [
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          id: agentId,
          model: "claude-sonnet-4.5",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId
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
      intent: "Confirm the repository documentation is current.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskId,
      title: "Review documentation freshness",
      workspaceId
    })

    await controlPlane.activateTask({ taskId, workspaceId })

    const dispatch = await controlPlane.dispatchNextTask({
      workspaceId
    })

    expect(dispatch).toEqual({
      assignmentId,
      provider: "claude-code",
      providerInstanceId,
      sessionId,
      status: "completed",
      taskId
    })

    expect(await controlPlane.readWorkspaceExecution({ workspaceId })).toEqual({
      agents: [
        {
          id: agentId,
          provider: "claude-code",
          providerInstanceId,
          systemTags: [
            "agent:agent-claude",
            "model:claude-sonnet-4.5",
            "model-family:claude",
            "provider-instance:claude-primary",
            "provider:claude-code"
          ]
        }
      ],
      assignments: [
        {
          agentId,
          id: assignmentId,
          provider: "claude-code",
          providerInstanceId,
          runtimeId,
          sessionId,
          status: "completed",
          taskId
        }
      ],
      lineage: [
        {
          event: "task.created",
          taskId
        },
        {
          event: "task.activated",
          taskId
        },
        {
          assignmentId,
          event: "assignment.started",
          provider: "claude-code",
          providerInstanceId,
          taskId
        },
        {
          event: "session.completed",
          providerInstanceId,
          providerSessionId: "claude-provider-session-1",
          sessionId
        },
        {
          event: "task.completed",
          taskId
        }
      ],
      sessions: [
        {
          id: sessionId,
          assignmentId,
          connectivity: "connectionless",
          events: [
            {
              kind: "provider.session.started",
              providerSessionId: "claude-provider-session-1"
            },
            {
              kind: "provider.session.completed",
              status: "completed",
              summary: "Completed Review documentation freshness"
            }
          ],
          finalSummary: "Completed Review documentation freshness",
          logs: [],
          provider: "claude-code",
          providerInstanceId,
          providerSession: {
            external: [],
            provider: "claude-code",
            providerInstanceId,
            providerSessionId: "claude-provider-session-1"
          },
          providerSessionId: "claude-provider-session-1",
          status: "completed",
          transcript: [
            {
              role: "assistant",
              text: "Completed Review documentation freshness"
            }
          ]
        }
      ],
      tasks: [
        {
          id: taskId,
          requiredAgentTags: ["provider:claude-code"],
          state: "completed",
          title: "Review documentation freshness"
        }
      ],
      workspace: {
        id: workspaceId,
        repository: {
          owner: "stoneforge-ai",
          provider: "github",
          repo: "stoneforge",
          targetBranch: "main"
        },
        state: "ready"
      }
    })
  })

  it("routes separate no-code Tasks to Claude Code and OpenAI Codex Agents", async () => {
    const workspaceId = makeWorkspaceId("workspace-both-providers")
    const runtimeId = makeRuntimeId("runtime-shared")
    const claudeAgentId = makeAgentId("agent-claude")
    const codexAgentId = makeAgentId("agent-codex")
    const claudeTaskId = makeTaskId("task-claude")
    const codexTaskId = makeTaskId("task-codex")
    const claudeProviderInstanceId = makeProviderInstanceId("claude-primary")
    const codexProviderInstanceId = makeProviderInstanceId("codex-primary")

    const controlPlane = createExecutionControlPlane({
      providerInstances: [
        defineProviderInstance({
          connectivity: "connectionless",
          id: claudeProviderInstanceId,
          provider: "claude-code",
          startSession: async (context) =>
            completedProviderResult(
              context,
              "claude-provider-session-2",
              `Claude completed ${context.task.title}`
            )
        }),
        defineProviderInstance({
          connectivity: "connectionful",
          id: codexProviderInstanceId,
          provider: "openai-codex",
          startSession: async (context) =>
            completedProviderResult(
              context,
              "codex-provider-session-1",
              `Codex completed ${context.task.title}`
            )
        })
      ],
      idSequence: {
        nextAgentId: () => makeAgentId("agent-generated"),
        nextAssignmentId: (() => {
          const ids = [
            makeAssignmentId("assignment-claude-2"),
            makeAssignmentId("assignment-codex")
          ]

          return () => ids.shift() ?? makeAssignmentId("assignment-extra")
        })(),
        nextSessionId: (() => {
          const ids = [
            makeSessionId("session-claude-2"),
            makeSessionId("session-codex")
          ]

          return () => ids.shift() ?? makeSessionId("session-extra")
        })(),
        nextTaskId: () => makeTaskId("task-generated")
      }
    })

    await controlPlane.configureWorkspace({
      agents: [
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          id: claudeAgentId,
          model: "claude-sonnet-4.5",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId: claudeProviderInstanceId
        },
        {
          acceptableRuntimes: [{ id: runtimeId, priority: 10 }],
          concurrencyLimit: 1,
          id: codexAgentId,
          model: "gpt-5.1-codex",
          modelFamily: "gpt",
          provider: "openai-codex",
          providerInstanceId: codexProviderInstanceId
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
          capacity: 2,
          id: runtimeId,
          state: "healthy",
          type: "local-worktree"
        }
      ],
      id: workspaceId
    })

    await controlPlane.createNoCodeTask({
      intent: "Summarize the Claude path.",
      requiredAgentTags: ["provider:claude-code"],
      id: claudeTaskId,
      title: "Run Claude no-code task",
      workspaceId
    })
    await controlPlane.createNoCodeTask({
      intent: "Summarize the Codex path.",
      requiredAgentTags: ["provider:openai-codex"],
      id: codexTaskId,
      title: "Run Codex no-code task",
      workspaceId
    })
    await controlPlane.activateTask({ taskId: claudeTaskId, workspaceId })
    await controlPlane.activateTask({ taskId: codexTaskId, workspaceId })

    expect(await controlPlane.dispatchNextTask({ workspaceId })).toMatchObject({
      provider: "claude-code",
      status: "completed",
      taskId: claudeTaskId
    })
    expect(await controlPlane.dispatchNextTask({ workspaceId })).toMatchObject({
      provider: "openai-codex",
      status: "completed",
      taskId: codexTaskId
    })

    const executionSnapshot = await controlPlane.readWorkspaceExecution({ workspaceId })

    expect(executionSnapshot.assignments).toEqual([
      {
        agentId: claudeAgentId,
        id: makeAssignmentId("assignment-claude-2"),
        provider: "claude-code",
        providerInstanceId: claudeProviderInstanceId,
        runtimeId,
        sessionId: makeSessionId("session-claude-2"),
        status: "completed",
        taskId: claudeTaskId
      },
      {
        agentId: codexAgentId,
        id: makeAssignmentId("assignment-codex"),
        provider: "openai-codex",
        providerInstanceId: codexProviderInstanceId,
        runtimeId,
        sessionId: makeSessionId("session-codex"),
        status: "completed",
        taskId: codexTaskId
      }
    ])
    expect(executionSnapshot.sessions).toEqual([
      expect.objectContaining({
        connectivity: "connectionless",
        provider: "claude-code",
        providerInstanceId: claudeProviderInstanceId,
        providerSessionId: "claude-provider-session-2"
      }),
      expect.objectContaining({
        connectivity: "connectionful",
        provider: "openai-codex",
        providerInstanceId: codexProviderInstanceId,
        providerSessionId: "codex-provider-session-1"
      })
    ])
    expect(executionSnapshot.tasks).toEqual([
      expect.objectContaining({ id: claudeTaskId, state: "completed" }),
      expect.objectContaining({ id: codexTaskId, state: "completed" })
    ])
  })

  it("queues dispatch when no Task is ready", async () => {
    const workspaceId = makeWorkspaceId("workspace-empty-queue")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstanceFixture()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)

    await expect(controlPlane.dispatchNextTask({ workspaceId })).resolves.toEqual(
      {
        reason: "no_ready_task",
        status: "queued"
      }
    )
  })

  it("uses generated Task, Assignment, and Session ids when callers do not inject them", async () => {
    const workspaceId = makeWorkspaceId("workspace-default-ids")
    const providerInstance = claudeProviderInstanceFixture()
    const controlPlane = createExecutionControlPlane({
      providerInstances: [providerInstance]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)
    const task = await controlPlane.createNoCodeTask({
      intent: "Use generated identifiers.",
      requiredAgentTags: ["provider:claude-code"],
      title: "Run with generated identifiers",
      workspaceId
    })
    await controlPlane.activateTask({ taskId: task.id, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).resolves.toEqual(
      {
        assignmentId: makeAssignmentId("assignment-1"),
        provider: "claude-code",
        providerInstanceId: providerInstance.id,
        sessionId: makeSessionId("session-1"),
        status: "completed",
        taskId: makeTaskId("task-1")
      }
    )
  })

  it("keeps impossible provider routing visible as a placement failure", async () => {
    const workspaceId = makeWorkspaceId("workspace-no-agent")
    const taskId = makeTaskId("task-no-agent")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstanceFixture()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)
    await controlPlane.createNoCodeTask({
      intent: "Require Codex in a Workspace with only Claude.",
      requiredAgentTags: ["provider:openai-codex"],
      id: taskId,
      title: "Require unavailable provider",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).rejects.toThrow(
      "No eligible Agent satisfies the required Agent tags."
    )
  })

  it("requires an acceptable healthy Runtime before provider launch", async () => {
    const workspaceId = makeWorkspaceId("workspace-no-runtime")
    const taskId = makeTaskId("task-no-runtime")
    const runtimeId = makeRuntimeId("runtime-unhealthy")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstanceFixture()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId, {
      runtimes: [
        {
          capacity: 1,
          id: runtimeId,
          state: "unhealthy",
          type: "local-worktree"
        }
      ]
    })
    await controlPlane.createNoCodeTask({
      intent: "Try to dispatch without a healthy runtime.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskId,
      title: "Require healthy runtime",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).rejects.toThrow(
      "No healthy Runtime is acceptable for the selected Agent."
    )
  })

  it("selects the highest-priority acceptable Runtime for dispatch", async () => {
    const workspaceId = makeWorkspaceId("workspace-runtime-priority")
    const taskId = makeTaskId("task-runtime-priority")
    const lowerRuntimeId = makeRuntimeId("runtime-lower")
    const higherRuntimeId = makeRuntimeId("runtime-higher")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstanceFixture()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId, {
      agents: [
        {
          acceptableRuntimes: [
            { id: lowerRuntimeId, priority: 1 },
            { id: higherRuntimeId, priority: 10 }
          ],
          concurrencyLimit: 1,
          id: makeAgentId("agent-priority"),
          model: "claude-sonnet-4.5",
          modelFamily: "claude",
          provider: "claude-code",
          providerInstanceId: makeProviderInstanceId("claude-test")
        }
      ],
      runtimes: [
        {
          capacity: 1,
          id: lowerRuntimeId,
          state: "healthy",
          type: "local-worktree"
        },
        {
          capacity: 1,
          id: higherRuntimeId,
          state: "healthy",
          type: "container"
        }
      ]
    })
    await controlPlane.createNoCodeTask({
      intent: "Use the preferred Runtime.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskId,
      title: "Prefer Runtime priority",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })
    await controlPlane.dispatchNextTask({ workspaceId })

    await expect(
      controlPlane.readWorkspaceExecution({ workspaceId })
    ).resolves.toMatchObject({
      assignments: [
        {
          runtimeId: higherRuntimeId,
          taskId
        }
      ]
    })
  })

  it("requires a registered provider instance for the selected Agent", async () => {
    const workspaceId = makeWorkspaceId("workspace-no-adapter")
    const taskId = makeTaskId("task-no-adapter")
    const controlPlane = createExecutionControlPlane({
      providerInstances: []
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)
    await controlPlane.createNoCodeTask({
      intent: "Try to dispatch without a provider instance.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskId,
      title: "Require provider instance",
      workspaceId
    })
    await controlPlane.activateTask({ taskId, workspaceId })

    await expect(controlPlane.dispatchNextTask({ workspaceId })).rejects.toThrow(
      "No provider instance is registered for claude-test."
    )
  })

  it("keeps a Task ready for retry when provider launch fails", async () => {
    const workspaceId = makeWorkspaceId("workspace-provider-failure")
    const taskId = makeTaskId("task-provider-failure")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [
        defineProviderInstance({
          connectivity: "connectionless",
          id: makeProviderInstanceId("claude-test"),
          provider: "claude-code",
          startSession: async () => {
            throw new Error("provider auth failed")
          }
        })
      ]
    })

    await configureClaudeWorkspace(controlPlane, workspaceId)
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
      assignments: [],
      sessions: [],
      tasks: [
        {
          id: taskId,
          state: "ready",
        }
      ]
    })
  })

  it("scopes execution lineage to the requested Workspace", async () => {
    const workspaceAId = makeWorkspaceId("workspace-lineage-a")
    const workspaceBId = makeWorkspaceId("workspace-lineage-b")
    const taskAId = makeTaskId("task-lineage-a")
    const taskBId = makeTaskId("task-lineage-b")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstanceFixture()]
    })

    await configureClaudeWorkspace(controlPlane, workspaceAId)
    await configureClaudeWorkspace(controlPlane, workspaceBId)
    await controlPlane.createNoCodeTask({
      intent: "Run in Workspace A.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskAId,
      title: "Workspace A task",
      workspaceId: workspaceAId
    })
    await controlPlane.createNoCodeTask({
      intent: "Run in Workspace B.",
      requiredAgentTags: ["provider:claude-code"],
      id: taskBId,
      title: "Workspace B task",
      workspaceId: workspaceBId
    })
    await controlPlane.activateTask({ taskId: taskAId, workspaceId: workspaceAId })
    await controlPlane.activateTask({ taskId: taskBId, workspaceId: workspaceBId })
    await controlPlane.dispatchNextTask({ workspaceId: workspaceAId })
    await controlPlane.dispatchNextTask({ workspaceId: workspaceBId })

    const executionSnapshot = await controlPlane.readWorkspaceExecution({
      workspaceId: workspaceAId
    })

    expect(executionSnapshot.lineage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "task.created", taskId: taskAId }),
        expect.objectContaining({ event: "task.completed", taskId: taskAId })
      ])
    )
    expect(executionSnapshot.lineage).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: taskBId }),
        expect.objectContaining({ sessionId: makeSessionId("session-2") })
      ])
    )
  })

  it("rejects commands outside configured Workspace and Task boundaries", async () => {
    const workspaceId = makeWorkspaceId("workspace-boundaries")
    const missingWorkspaceId = makeWorkspaceId("workspace-missing")
    const taskId = makeTaskId("task-boundary")
    const controlPlane = createExecutionControlPlane({
      providerInstances: [claudeProviderInstanceFixture()]
    })

    await expect(
      controlPlane.readWorkspaceExecution({ workspaceId: missingWorkspaceId })
    ).rejects.toThrow("Workspace workspace-missing has not been configured.")
    await expect(
      controlPlane.createNoCodeTask({
        intent: "Cannot create without a Workspace.",
        requiredAgentTags: ["provider:claude-code"],
      id: taskId,
        title: "Missing Workspace",
        workspaceId
      })
    ).rejects.toThrow("Workspace workspace-boundaries has not been configured.")

    await configureClaudeWorkspace(controlPlane, workspaceId)

    await expect(
      controlPlane.activateTask({ taskId, workspaceId })
    ).rejects.toThrow(
      "Task task-boundary does not exist in Workspace workspace-boundaries."
    )
    expect(() => makeTaskId("   ")).toThrow("TaskId cannot be empty.")
  })
})
