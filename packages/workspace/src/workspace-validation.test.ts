import { asAgentId, asRoleDefinitionId, asRuntimeId } from "@stoneforge/core";
import { describe, expect, it } from "vitest";

import {
  buildValidationResult,
  computeConfiguredState,
  computeValidatedState,
} from "./workspace-validation.js";
import type { Workspace } from "./models.js";

describe("workspace validation policy", () => {
  it("preserves archived state during configuration and validation", () => {
    const archived = workspace({ state: "archived" });

    expect(computeConfiguredState(archived)).toBe("archived");
    expect(
      computeValidatedState(archived, {
        ...buildValidationResult(archived, now),
        ready: false,
      }),
    ).toBe("archived");
  });

  it("moves through draft, repo_connected, execution_configured, ready, and degraded", () => {
    expect(computeConfiguredState(workspace())).toBe("draft");
    expect(computeConfiguredState(workspace({ repositoryConnected: true }))).toBe(
      "repo_connected",
    );
    expect(computeConfiguredState(readyWorkspace())).toBe("execution_configured");

    const ready = buildValidationResult(readyWorkspace(), now);

    expect(computeValidatedState(readyWorkspace(), ready)).toBe("ready");
    expect(
      computeValidatedState(
        readyWorkspace({ repositoryConnected: false, state: "ready" }),
        buildValidationResult(
          readyWorkspace({ repositoryConnected: false, state: "ready" }),
          now,
        ),
      ),
    ).toBe("degraded");
  });

  it("reports readiness facts and the selected execution path", () => {
    expect(buildValidationResult(workspace(), now)).toMatchObject({
      repoConnected: false,
      policyConfigured: false,
      executionConfigured: false,
      ready: false,
    });

    const validation = buildValidationResult(readyWorkspace(), now);

    expect(validation).toMatchObject({
      repoConnected: true,
      policyConfigured: true,
      executionConfigured: true,
      ready: true,
      issues: [],
      selectedExecutionPath: {
        runtimeId: "runtime_1",
        agentId: "agent_1",
        roleDefinitionId: "role_definition_1",
      },
    });
  });

  it("rejects invalid execution paths", () => {
    expect(
      buildValidationResult(
        readyWorkspace({ runtimeHealth: "unhealthy" }),
        now,
      ).issues,
    ).toContainEqual(expect.objectContaining({ code: "no_valid_execution_path" }));
    expect(
      buildValidationResult(
        readyWorkspace({ agentHealth: "unhealthy" }),
        now,
      ).issues,
    ).toContainEqual(expect.objectContaining({ code: "no_valid_execution_path" }));
    expect(
      buildValidationResult(
        readyWorkspace({ concurrencyLimit: 0 }),
        now,
      ).issues,
    ).toContainEqual(expect.objectContaining({ code: "no_valid_execution_path" }));
    expect(
      buildValidationResult(
        readyWorkspace({ runtimeId: asRuntimeId("missing_runtime") }),
        now,
      ).issues,
    ).toContainEqual(expect.objectContaining({ code: "no_valid_execution_path" }));
  });
});

const now = "2026-04-24T00:00:00.000Z";

interface WorkspaceOptions {
  state?: Workspace["state"];
  repositoryConnected?: boolean;
  policyConfigured?: boolean;
  runtimeHealth?: "healthy" | "unhealthy";
  agentHealth?: "healthy" | "unhealthy";
  concurrencyLimit?: number;
  runtimeId?: ReturnType<typeof asRuntimeId>;
}

function readyWorkspace(overrides: WorkspaceOptions = {}): Workspace {
  return workspace({
    repositoryConnected: true,
    policyConfigured: true,
    runtimeHealth: "healthy",
    agentHealth: "healthy",
    concurrencyLimit: 1,
    ...overrides,
  });
}

function workspace(options: WorkspaceOptions = {}): Workspace {
  const runtimeId = options.runtimeId ?? asRuntimeId("runtime_1");

  return {
    id: "workspace_1" as never,
    orgId: "org_1" as never,
    name: "Stoneforge",
    targetBranch: "main",
    state: options.state ?? "draft",
    repository: options.repositoryConnected
      ? {
          installationId: "ghinst_1",
          owner: "stoneforge-ai",
          repository: "stoneforge",
          defaultBranch: "main",
          connectionStatus: "connected",
          connectedAt: now,
        }
      : undefined,
    policyPreset: options.policyConfigured ? "supervised" : undefined,
    runtimes: options.runtimeHealth
      ? [
          {
            id: asRuntimeId("runtime_1"),
            workspaceId: "workspace_1" as never,
            name: "runtime",
            location: "customer_host",
            mode: "local_worktree",
            healthStatus: options.runtimeHealth,
            tags: [],
          },
        ]
      : [],
    agents: options.agentHealth
      ? [
          {
            id: asAgentId("agent_1"),
            workspaceId: "workspace_1" as never,
            runtimeId,
            name: "agent",
            harness: "openai-codex",
            model: "gpt-5-codex",
            concurrencyLimit: options.concurrencyLimit ?? 1,
            healthStatus: options.agentHealth,
            tags: [],
            launcher: "codex-adapter",
          },
        ]
      : [],
    roleDefinitions: options.policyConfigured
      ? [
          {
            id: asRoleDefinitionId("role_definition_1"),
            workspaceId: "workspace_1" as never,
            name: "implementation-worker",
            prompt: "Implement the assigned task.",
            toolAccess: [],
            skillAccess: [],
            lifecycleHooks: [],
            tags: [],
            enabled: true,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };
}
