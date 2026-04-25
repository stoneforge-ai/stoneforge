import { describe, expect, it } from "vitest";

import { asOrgId, asRuntimeId } from "./ids.js";
import { WorkspaceSetupService } from "./workspace-setup-service.js";
import type { AuditActor } from "./models.js";

const operator: AuditActor = {
  kind: "human",
  id: "user_1",
  displayName: "Platform Lead",
};

const scheduler: AuditActor = {
  kind: "service",
  id: "scheduler_1",
  displayName: "Stoneforge Scheduler",
};

describe("WorkspaceSetupService edge cases", () => {
  it("rejects workspace setup for a missing Org", () => {
    const service = new WorkspaceSetupService();

    expect(() =>
      service.createWorkspace(
        asOrgId("missing_org"),
        { name: "stoneforge", targetBranch: "main" },
        operator,
      ),
    ).toThrow(/does not exist/i);
  });

  it("records failed repository setup when connectivity is missing", () => {
    const { service, workspaceId } = createDraftWorkspace();

    const workspace = service.connectGitHubRepository(
      workspaceId,
      {
        installationId: "ghinst_1",
        owner: "stoneforge-ai",
        repository: "stoneforge",
        defaultBranch: "main",
        connectionStatus: "disconnected",
      },
      operator,
    );

    expect(workspace.state).toBe("draft");
    expect(service.listAuditEventsForWorkspace(workspaceId)).toContainEqual(
      expect.objectContaining({
        action: "workspace.github_repository_connected",
        outcome: "failure",
      }),
    );
  });

  it("rejects repository health updates before a repository is linked", () => {
    const { service, workspaceId } = createDraftWorkspace();

    expect(() =>
      service.recordGitHubRepositoryConnectionStatus(
        workspaceId,
        "connected",
        scheduler,
      ),
    ).toThrow(/not linked/i);
  });

  it("rejects invalid Agent and Runtime references", () => {
    const { service, workspaceId } = createDraftWorkspace();

    expect(() =>
      service.registerAgent(
        workspaceId,
        {
          name: "codex-worker",
          runtimeId: asRuntimeId("missing_runtime"),
          harness: "openai-codex",
          model: "gpt-5-codex",
          concurrencyLimit: 1,
          launcher: "codex-adapter",
        },
        operator,
      ),
    ).toThrow(/does not exist/i);

    expect(() =>
      service.updateRuntimeHealthStatus(
        workspaceId,
        asRuntimeId("missing_runtime"),
        "healthy",
        scheduler,
      ),
    ).toThrow(/does not exist/i);
  });

  it("rejects non-positive Agent concurrency limits", () => {
    const { service, workspaceId } = createDraftWorkspace();
    const runtime = service.registerRuntime(
      workspaceId,
      {
        name: "customer-host-worktree",
        location: "customer_host",
        mode: "local_worktree",
      },
      operator,
    );

    expect(() =>
      service.registerAgent(
        workspaceId,
        {
          name: "codex-worker",
          runtimeId: runtime.id,
          harness: "openai-codex",
          model: "gpt-5-codex",
          concurrencyLimit: 0,
          launcher: "codex-adapter",
        },
        operator,
      ),
    ).toThrow(/at least 1/i);
  });

  it("reports every missing readiness prerequisite", () => {
    const { service, workspaceId } = createDraftWorkspace();
    const validation = service.validateWorkspace(workspaceId, scheduler);

    expect(validation.ready).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual([
      "repo_not_connected",
      "policy_not_configured",
      "runtime_not_configured",
      "agent_not_configured",
      "role_definition_not_configured",
      "no_valid_execution_path",
    ]);
  });

  it("rejects disabled RoleDefinitions as execution paths", () => {
    const { service, workspaceId } = createDraftWorkspace();

    service.connectGitHubRepository(
      workspaceId,
      {
        installationId: "ghinst_1",
        owner: "stoneforge-ai",
        repository: "stoneforge",
        defaultBranch: "main",
      },
      operator,
    );
    const runtime = service.registerRuntime(
      workspaceId,
      {
        name: "customer-host-worktree",
        location: "customer_host",
        mode: "local_worktree",
      },
      operator,
    );
    service.registerAgent(
      workspaceId,
      {
        name: "codex-worker",
        runtimeId: runtime.id,
        harness: "openai-codex",
        model: "gpt-5-codex",
        concurrencyLimit: 1,
        launcher: "codex-adapter",
      },
      operator,
    );
    service.registerRoleDefinition(
      workspaceId,
      {
        name: "implementation-worker",
        category: "worker",
        prompt: "Implement the assigned task.",
        enabled: false,
      },
      operator,
    );
    service.selectPolicyPreset(workspaceId, "supervised", operator);

    const validation = service.validateWorkspace(workspaceId, scheduler);

    expect(validation.ready).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "no_valid_execution_path",
      }),
    );
  });
});

function createDraftWorkspace() {
  const service = new WorkspaceSetupService();
  const org = service.createOrg({ name: "Stoneforge" });
  const workspace = service.createWorkspace(
    org.id,
    { name: "stoneforge", targetBranch: "main" },
    operator,
  );

  return {
    service,
    workspaceId: workspace.id,
  };
}
