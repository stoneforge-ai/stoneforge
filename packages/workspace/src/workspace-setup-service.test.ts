import { describe, expect, it } from "vitest"

import { WorkspaceSetupService } from "./workspace-setup-service.js"
import type { AuditActor, WorkspaceSetupAuditAction } from "./models.js"

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

describe("WorkspaceSetupService", () => {
  it("reaches ready only after validation succeeds", () => {
    const service = new WorkspaceSetupService()
    const org = service.createOrg({ name: "Stoneforge" })
    const workspace = service.createWorkspace(
      org.id,
      { name: "stoneforge", targetBranch: "main" },
      operator
    )

    expect(service.getWorkspace(workspace.id).state).toBe("draft")

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

    expect(service.getWorkspace(workspace.id).state).toBe("repo_connected")

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
    const agent = service.registerAgent(
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
    const roleDefinition = service.registerRoleDefinition(
      workspace.id,
      {
        name: "implementation-worker",
        category: "worker",
        prompt: "Implement the assigned task against the repository.",
        toolAccess: ["git", "shell"],
        tags: ["worker"],
      },
      operator
    )

    expect(service.getWorkspace(workspace.id).state).toBe("repo_connected")

    service.selectPolicyPreset(workspace.id, "supervised", operator)

    expect(service.getWorkspace(workspace.id).state).toBe(
      "execution_configured"
    )

    const validation = service.validateWorkspace(workspace.id, scheduler)

    expect(validation.ready).toBe(true)
    expect(service.getWorkspace(workspace.id).state).toBe("ready")
    expect(validation.selectedExecutionPath).toEqual({
      runtimeId: runtime.id,
      agentId: agent.id,
      roleDefinitionId: roleDefinition.id,
    })
  })

  it("requires one healthy execution path before becoming ready", () => {
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
        healthStatus: "unhealthy",
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
      },
      operator
    )
    service.registerRoleDefinition(
      workspace.id,
      {
        name: "implementation-worker",
        category: "worker",
        prompt: "Implement the assigned task.",
      },
      operator
    )
    service.selectPolicyPreset(workspace.id, "supervised", operator)

    const validation = service.validateWorkspace(workspace.id, scheduler)

    expect(validation.ready).toBe(false)
    expect(service.getWorkspace(workspace.id).state).toBe(
      "execution_configured"
    )
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "no_valid_execution_path",
      })
    )
  })

  it("enforces exactly one GitHub repository link per workspace", () => {
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

    expect(() =>
      service.connectGitHubRepository(
        workspace.id,
        {
          installationId: "ghinst_2",
          owner: "stoneforge-ai",
          repository: "other-repo",
          defaultBranch: "main",
        },
        operator
      )
    ).toThrow(/already linked/i)
  })

  it("degrades a previously ready workspace when repo connectivity breaks", () => {
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
      },
      operator
    )
    service.registerAgent(
      workspace.id,
      {
        name: "claude-worker",
        runtimeId: runtime.id,
        harness: "claude-code",
        model: "claude-sonnet",
        concurrencyLimit: 1,
        launcher: "claude-adapter",
      },
      operator
    )
    service.registerRoleDefinition(
      workspace.id,
      {
        name: "review-worker",
        category: "reviewer",
        prompt: "Review the assigned work.",
      },
      operator
    )
    service.selectPolicyPreset(workspace.id, "supervised", operator)
    service.validateWorkspace(workspace.id, scheduler)

    service.recordGitHubRepositoryConnectionStatus(
      workspace.id,
      "disconnected",
      scheduler
    )

    const validation = service.validateWorkspace(workspace.id, scheduler)

    expect(validation.ready).toBe(false)
    expect(service.getWorkspace(workspace.id).state).toBe("degraded")
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "repo_not_connected",
      })
    )
  })

  it("emits setup-path audit events for sensitive setup actions", () => {
    const service = new WorkspaceSetupService()
    const org = service.createOrg({ name: "Stoneforge" })
    const workspace = service.createWorkspace(
      org.id,
      { name: "stoneforge", targetBranch: "main" },
      operator
    )

    const runtime = service.registerRuntime(
      workspace.id,
      {
        name: "managed-sandbox",
        location: "managed",
        mode: "managed_sandbox",
        managedProvider: "daytona",
      },
      operator
    )
    service.updateRuntimeHealthStatus(
      workspace.id,
      runtime.id,
      "unhealthy",
      scheduler
    )
    service.updateRuntimeHealthStatus(
      workspace.id,
      runtime.id,
      "healthy",
      scheduler
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
    service.selectPolicyPreset(workspace.id, "autonomous", operator)
    service.registerAgent(
      workspace.id,
      {
        name: "codex-worker",
        runtimeId: runtime.id,
        harness: "openai-codex",
        model: "gpt-5-codex",
        concurrencyLimit: 1,
        launcher: "codex-adapter",
      },
      operator
    )
    service.registerRoleDefinition(
      workspace.id,
      {
        name: "implementation-worker",
        category: "worker",
        prompt: "Implement the assigned task.",
      },
      operator
    )
    service.validateWorkspace(workspace.id, scheduler)

    const actions = new Set(
      service
        .listAuditEventsForWorkspace(workspace.id)
        .map((event) => event.action)
    )

    const expectedActions: WorkspaceSetupAuditAction[] = [
      "workspace.created",
      "workspace.github_repository_connected",
      "workspace.policy_preset_selected",
      "workspace.runtime_registered",
      "workspace.runtime_health_updated",
      "workspace.agent_registered",
      "workspace.role_definition_registered",
      "workspace.validated",
    ]

    for (const action of expectedActions) {
      expect(actions.has(action)).toBe(true)
    }

    expect(service.listAuditEventsForWorkspace(workspace.id)).toContainEqual(
      expect.objectContaining({
        action: "workspace.runtime_health_updated",
        outcome: "failure",
        reason: "Runtime health check failed.",
      })
    )
  })
})
