import { describe, expect, it } from "vitest"

import {
  WorkspaceSetupService,
  type AuditActor,
  type Workspace,
} from "@stoneforge/workspace"

import { TaskDispatchService } from "./task-dispatch-service.js"
import type { AgentAdapter, AgentAdapterStartContext } from "./models.js"

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

describe("TaskDispatchService snapshots", () => {
  it("restores dispatch state and continues id allocation", async () => {
    const service = new TaskDispatchService(new SnapshotAgentAdapter())
    const workspace = createReadyWorkspace()

    service.configureWorkspace(workspace)
    service.createTask({
      workspaceId: workspace.id,
      title: "Snapshot task",
      intent: "Persist execution records.",
      acceptanceCriteria: ["Execution records survive restore."],
      requiresMergeRequest: false,
    })
    await service.runSchedulerOnce()
    const assignment = service.listAssignments()[0]

    service.completeAssignment(assignment.id)

    const restored = new TaskDispatchService(
      new SnapshotAgentAdapter(),
      undefined,
      service.exportSnapshot()
    )

    expect(restored.listAssignments()).toHaveLength(1)
    expect(restored.listSessions()[0]?.providerSessionId).toBe("provider-task")

    restored.createTask({
      workspaceId: workspace.id,
      title: "Next task",
      intent: "Continue allocation.",
      acceptanceCriteria: ["New ids follow restored ids."],
      requiresMergeRequest: false,
    })

    expect(restored.listDispatchIntents()[1]?.id).toBe("dispatchIntent_2")
  })
})

class SnapshotAgentAdapter implements AgentAdapter {
  async start(
    context: AgentAdapterStartContext
  ): Promise<{ providerSessionId: string }> {
    return { providerSessionId: `provider-${context.target.type}` }
  }

  async resume(): Promise<{ providerSessionId: string }> {
    return { providerSessionId: "provider-resume" }
  }

  async cancel(): Promise<void> {}
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
      prompt: "Implement the assigned task.",
      toolAccess: ["git", "shell"],
      tags: ["worker"],
    },
    operator
  )
  service.selectPolicyPreset(workspace.id, "supervised", operator)
  service.validateWorkspace(workspace.id, scheduler)

  return service.getWorkspace(workspace.id)
}
