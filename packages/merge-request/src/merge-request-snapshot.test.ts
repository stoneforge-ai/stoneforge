import { describe, expect, it } from "vitest"

import type {
  AgentAdapter,
  AgentAdapterStartContext,
  Checkpoint,
  Session,
} from "@stoneforge/execution"
import { TaskDispatchService } from "@stoneforge/execution"
import {
  WorkspaceSetupService,
  type AuditActor,
  type Workspace,
} from "@stoneforge/workspace"

import { MergeRequestService } from "./merge-request-service.js"
import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderPullRequestObservation,
  ProviderPullRequest,
} from "./models.js"

const operator: AuditActor = {
  kind: "human",
  id: "user_1",
  displayName: "Platform Lead",
}

const scheduler: AuditActor = {
  kind: "service",
  id: "scheduler_1",
  displayName: "Stoneforge Scheduler",
}

describe("MergeRequestService snapshots", () => {
  it("restores merge requests and Verification Runs", async () => {
    const { execution, task, assignment } = await createCompletedTaskFlow()
    const service = new MergeRequestService(
      execution,
      new SnapshotGitHubAdapter(),
      { policyPreset: "supervised", targetBranch: "main" }
    )
    const mergeRequest = await service.openOrUpdateTaskMergeRequest({
      taskAssignmentId: assignment.id,
    })

    await service.recordProviderCheck(mergeRequest.id, {
      providerCheckId: "check-1",
      name: "quality",
      state: "passed",
    })

    const restored = new MergeRequestService(
      execution,
      new SnapshotGitHubAdapter(),
      { policyPreset: "supervised", targetBranch: "main" },
      service.exportSnapshot()
    )

    expect(restored.getMergeRequest(mergeRequest.id).sourceOwner.taskId).toBe(
      task.id
    )
    expect(restored.listVerificationRuns()).toHaveLength(1)
  })
})

class SnapshotGitHubAdapter implements GitHubMergeRequestAdapter {
  async createOrUpdateTaskPullRequest(input: {
    workspaceId: string
    taskId: string
    title: string
    body: string
    sourceBranch: string
    targetBranch: string
  }): Promise<ProviderPullRequest> {
    return {
      provider: "github",
      providerPullRequestId: `provider-${input.taskId}`,
      number: 100,
      url: "https://github.example/toolco/stoneforge/pull/100",
      headSha: "provider-head-sha",
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    }
  }

  async publishPolicyCheck(input: { state: PolicyCheckState }): Promise<void> {
    expect(input.state).toBe("pending")
  }

  async mergePullRequest(): Promise<{ mergedAt: string }> {
    return { mergedAt: "2026-04-24T12:00:00.000Z" }
  }

  async observePullRequest(): Promise<ProviderPullRequestObservation> {
    return {
      providerPullRequestId: "provider-task_1",
      state: "open",
      headSha: "provider-head-sha",
      checks: [],
    }
  }
}

class SnapshotAgentAdapter implements AgentAdapter {
  async start(
    context: AgentAdapterStartContext
  ): Promise<{ providerSessionId: string }> {
    return { providerSessionId: `provider-${context.target.type}` }
  }

  async resume(): Promise<{ providerSessionId: string }> {
    return { providerSessionId: "provider-resume" }
  }

  async cancel(_session: Session): Promise<void> {}
}

async function createCompletedTaskFlow() {
  const workspace = createReadyWorkspace()
  const execution = new TaskDispatchService(new SnapshotAgentAdapter())

  execution.configureWorkspace(workspace)

  const task = execution.createTask({
    workspaceId: workspace.id,
    title: "Add merge flow",
    intent: "Open and validate a task pull request.",
    acceptanceCriteria: ["A task PR can be reviewed and merged."],
    requiresMergeRequest: true,
  })

  await execution.runSchedulerOnce()

  const assignment = execution.listAssignments()[0]
  const session = execution.listSessions()[0]

  execution.recordHeartbeat(session.id, "worker online")
  execution.recordCheckpoint(session.id, createCheckpoint())
  execution.completeAssignment(assignment.id)

  return { execution, task, assignment }
}

function createReadyWorkspace(): Workspace {
  const service = new WorkspaceSetupService()
  const org = service.createOrg({ name: "Stoneforge" })
  const workspace = service.createWorkspace(
    org.id,
    { name: "stoneforge", targetBranch: "main" },
    operator
  )

  service.connectGitHubRepository(
    workspace.id,
    {
      installationId: "ghinst_1",
      owner: "stoneforge-ai",
      repository: "stoneforge",
      defaultBranch: "main",
    },
    operator
  )
  const runtime = service.registerRuntime(
    workspace.id,
    {
      name: "customer-host-worktree",
      location: "customer_host",
      mode: "local_worktree",
      tags: ["customer-host"],
    },
    operator
  )

  service.registerAgent(
    workspace.id,
    {
      name: "codex-worker",
      runtimeId: runtime.id,
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      launcher: "codex-adapter",
      tags: ["default"],
    },
    operator
  )
  service.registerRoleDefinition(
    workspace.id,
    {
      name: "implementation-worker",
      category: "worker",
      prompt: "Implement or review the assigned work.",
      toolAccess: ["git", "shell"],
      tags: ["worker"],
    },
    operator
  )
  service.selectPolicyPreset(workspace.id, "supervised", operator)
  service.validateWorkspace(workspace.id, scheduler)

  return service.getWorkspace(workspace.id)
}

function createCheckpoint(): Checkpoint {
  return {
    completedWork: ["Implemented the task."],
    remainingWork: ["Open the task PR."],
    importantContext: ["This is a code-changing task."],
    capturedAt: new Date().toISOString(),
  }
}
