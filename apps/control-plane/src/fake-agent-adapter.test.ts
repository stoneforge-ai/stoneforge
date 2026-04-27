import {
  asAgentId,
  asMergeRequestId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
} from "@stoneforge/core"
import {
  asAssignmentId,
  asDispatchIntentId,
  asLeaseId,
  asSessionId,
  asTaskId,
  type AgentAdapterResumeContext,
  type AgentAdapterStartContext,
  type Assignment,
  type Checkpoint,
  type Session,
  type Task,
} from "@stoneforge/execution"
import { describe, expect, it } from "vitest"

import { createFakeAgentFixture } from "./index.js"

describe("fake agent adapter", () => {
  it("records starts, resumes, and cancellations deterministically", async () => {
    const adapter = createFakeAgentFixture()
    const start = await adapter.start(startContext())
    const resume = await adapter.resume(resumeContext())

    await adapter.cancel(failedSession())

    expect(start.providerSessionId).toBe("local-task-start-1")
    expect(resume.providerSessionId).toBe("local-merge_request-resume-1")
    expect(adapter.starts).toEqual([
      {
        assignmentId: "assign_implementation",
        providerSessionId: "local-task-start-1",
        targetType: "task",
      },
    ])
    expect(adapter.resumes).toEqual([
      {
        assignmentId: "assign_review",
        failedProviderSessionId: "provider_failed",
        providerSessionId: "local-merge_request-resume-1",
      },
    ])
    expect(adapter.canceledSessionIds).toEqual(["session_failed"])
  })
})

function startContext(): AgentAdapterStartContext {
  return {
    target: {
      type: "task",
      task: task(),
    },
    assignment: assignment("assign_implementation"),
    agent: agent(),
    runtime: runtime(),
    roleDefinition: roleDefinition(),
  }
}

function resumeContext(): AgentAdapterResumeContext {
  return {
    target: {
      type: "merge_request",
      mergeRequest: {
        id: asMergeRequestId("mr_1"),
        title: "Review direct-task scenario",
        providerPullRequestUrl:
          "https://github.example/toolco/stoneforge/pull/100",
      },
    },
    assignment: assignment("assign_review"),
    agent: agent(),
    runtime: runtime(),
    roleDefinition: roleDefinition(),
    checkpoint: checkpoint(),
    failedSession: failedSession(),
  }
}

function task(): Task {
  return {
    id: asTaskId("task_1"),
    workspaceId: asWorkspaceId("workspace_1"),
    title: "Direct-task scenario",
    intent: "Exercise the fake adapter.",
    acceptanceCriteria: ["A provider session id is returned."],
    priority: "normal",
    dependencyIds: [],
    state: "ready",
    requiresMergeRequest: true,
    dispatchConstraints: {
      requiredAgentTags: [],
      requiredRuntimeTags: [],
    },
    progressRecord: {
      checkpoints: [],
      repairContext: [],
    },
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  }
}

function assignment(id: string): Assignment {
  return {
    id: asAssignmentId(id),
    workspaceId: asWorkspaceId("workspace_1"),
    owner: {
      type: "task",
      taskId: asTaskId("task_1"),
    },
    taskId: asTaskId("task_1"),
    dispatchIntentId: asDispatchIntentId("intent_1"),
    roleDefinitionId: asRoleDefinitionId("role_1"),
    agentId: asAgentId("agent_1"),
    runtimeId: asRuntimeId("runtime_1"),
    leaseId: asLeaseId("lease_1"),
    state: "running",
    sessionIds: [],
    recoveryFailureCount: 0,
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  }
}

function agent(): AgentAdapterStartContext["agent"] {
  return {
    id: asAgentId("agent_1"),
    workspaceId: asWorkspaceId("workspace_1"),
    runtimeId: asRuntimeId("runtime_1"),
    name: "local agent",
    harness: "openai-codex",
    model: "gpt-5-codex",
    concurrencyLimit: 1,
    healthStatus: "healthy",
    tags: [],
    launcher: "fake-local-agent-adapter",
  }
}

function runtime(): AgentAdapterStartContext["runtime"] {
  return {
    id: asRuntimeId("runtime_1"),
    workspaceId: asWorkspaceId("workspace_1"),
    name: "local runtime",
    location: "customer_host",
    mode: "local_worktree",
    healthStatus: "healthy",
    tags: [],
  }
}

function roleDefinition(): AgentAdapterStartContext["roleDefinition"] {
  return {
    id: asRoleDefinitionId("role_1"),
    workspaceId: asWorkspaceId("workspace_1"),
    name: "worker",
    category: "worker",
    prompt: "Work on the direct-task scenario.",
    toolAccess: [],
    skillAccess: [],
    lifecycleHooks: [],
    tags: [],
    enabled: true,
  }
}

function failedSession(): Session {
  return {
    id: asSessionId("session_failed"),
    workspaceId: asWorkspaceId("workspace_1"),
    assignmentId: asAssignmentId("assign_review"),
    providerSessionId: "provider_failed",
    state: "crashed",
    heartbeats: [],
    checkpoints: [checkpoint()],
    createdAt: "2026-04-24T10:00:00.000Z",
    updatedAt: "2026-04-24T10:00:00.000Z",
  }
}

function checkpoint(): Checkpoint {
  return {
    completedWork: ["Started implementation."],
    remainingWork: ["Resume review."],
    importantContext: ["Synthetic adapter fixture."],
    capturedAt: "2026-04-24T10:00:00.000Z",
  }
}
