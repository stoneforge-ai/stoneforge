import { asAgentId, asRoleDefinitionId, asRuntimeId } from "@stoneforge/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildValidationResult,
  computeConfiguredState,
  computeValidatedState,
  type Workspace,
} from "./index.js";

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

  it("is ready exactly when every readiness prerequisite has a healthy execution path", () => {
    fc.assert(
      fc.property(workspaceOptionArbitrary, (options) => {
        const validation = buildValidationResult(workspace(options), now);
        const expectedExecutionPath = hasHealthyExecutionPath(options);
        const expectedReady = options.repositoryConnected && expectedExecutionPath;

        expect(validation.ready).toBe(expectedReady);
        expect(validation.issues.length === 0).toBe(expectedReady);
        expect(validation.selectedExecutionPath !== undefined).toBe(
          expectedExecutionPath,
        );
      }),
    );
  });

  it("preserves archived state regardless of readiness facts", () => {
    fc.assert(
      fc.property(workspaceOptionArbitrary, (options) => {
        const archived = workspace({ ...options, state: "archived" });

        expect(computeConfiguredState(archived)).toBe("archived");
        expect(
          computeValidatedState(archived, buildValidationResult(archived, now)),
        ).toBe("archived");
      }),
    );
  });
});

const now = "2026-04-24T00:00:00.000Z";
const workspaceOptionArbitrary = fc.record({
  repositoryConnected: fc.boolean(),
  policyConfigured: fc.boolean(),
  runtimeHealth: fc.constantFrom("healthy" as const, "unhealthy" as const),
  agentHealth: fc.constantFrom("healthy" as const, "unhealthy" as const),
  concurrencyLimit: fc.integer({ min: -1, max: 3 }),
  runtimeLinked: fc.boolean(),
  roleEnabled: fc.boolean(),
});

interface WorkspaceOptions {
  state?: Workspace["state"];
  repositoryConnected?: boolean;
  policyConfigured?: boolean;
  runtimeHealth?: "healthy" | "unhealthy";
  agentHealth?: "healthy" | "unhealthy";
  concurrencyLimit?: number;
  runtimeLinked?: boolean;
  roleEnabled?: boolean;
  runtimeId?: ReturnType<typeof asRuntimeId>;
}

function hasHealthyExecutionPath(options: WorkspaceOptions): boolean {
  return (
    options.policyConfigured === true &&
    options.runtimeHealth === "healthy" &&
    options.agentHealth === "healthy" &&
    (options.concurrencyLimit ?? 1) >= 1 &&
    options.runtimeLinked === true &&
    options.roleEnabled === true
  );
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
  const agentRuntimeId =
    options.runtimeLinked === false ? asRuntimeId("missing_runtime") : runtimeId;

  return {
    id: "workspace_1" as never,
    orgId: "org_1" as never,
    name: "Stoneforge",
    targetBranch: "main",
    state: options.state ?? "draft",
    repository: repository(options),
    policyPreset: options.policyConfigured ? "supervised" : undefined,
    runtimes: runtimes(options),
    agents: agents(options, agentRuntimeId),
    roleDefinitions: roleDefinitions(options),
    createdAt: now,
    updatedAt: now,
  };
}

function repository(options: WorkspaceOptions): Workspace["repository"] {
  if (!options.repositoryConnected) {
    return undefined;
  }

  return {
    installationId: "ghinst_1",
    owner: "stoneforge-ai",
    repository: "stoneforge",
    defaultBranch: "main",
    connectionStatus: "connected",
    connectedAt: now,
  };
}

function runtimes(options: WorkspaceOptions): Workspace["runtimes"] {
  if (!options.runtimeHealth) {
    return [];
  }

  return [
    {
      id: asRuntimeId("runtime_1"),
      workspaceId: "workspace_1" as never,
      name: "runtime",
      location: "customer_host",
      mode: "local_worktree",
      healthStatus: options.runtimeHealth,
      tags: [],
    },
  ];
}

function agents(
  options: WorkspaceOptions,
  agentRuntimeId: ReturnType<typeof asRuntimeId>,
): Workspace["agents"] {
  if (!options.agentHealth) {
    return [];
  }

  return [
    {
      id: asAgentId("agent_1"),
      workspaceId: "workspace_1" as never,
      runtimeId: agentRuntimeId,
      name: "agent",
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: options.concurrencyLimit ?? 1,
      healthStatus: options.agentHealth,
      tags: [],
      launcher: "codex-adapter",
    },
  ];
}

function roleDefinitions(options: WorkspaceOptions): Workspace["roleDefinitions"] {
  if (!options.policyConfigured) {
    return [];
  }

  return [
    {
      id: asRoleDefinitionId("role_definition_1"),
      workspaceId: "workspace_1" as never,
      name: "implementation-worker",
      category: "worker",
      prompt: "Implement the assigned task.",
      toolAccess: [],
      skillAccess: [],
      lifecycleHooks: [],
      tags: [],
      enabled: options.roleEnabled ?? true,
    },
  ];
}
