import {
  asAgentId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
  type Agent,
  type RoleDefinition,
  type Runtime,
} from "@stoneforge/core";
import { describe, expect, it } from "vitest";

import { asDispatchIntentId } from "./ids.js";
import type { DispatchIntent, WorkspaceExecutionCapabilities } from "./models.js";
import { resolvePlacement } from "./placement.js";

const workspaceId = asWorkspaceId("workspace_1");
const runtimeId = asRuntimeId("runtime_1");
const roleDefinitionId = asRoleDefinitionId("role_1");

describe("resolvePlacement", () => {
  it("selects the first healthy Agent with available capacity", () => {
    const placement = resolvePlacement(
      capabilities(),
      intent(),
      () => 0,
    );

    expect(placement).toEqual(
      expect.objectContaining({
        agent: expect.objectContaining({ id: asAgentId("agent_1") }),
        runtime: expect.objectContaining({ id: runtimeId }),
        roleDefinition: expect.objectContaining({ id: roleDefinitionId }),
      }),
    );
  });

  it("rejects missing or disabled RoleDefinitions", () => {
    expect(
      resolvePlacement(
        capabilities({ roleDefinitions: [] }),
        intent(),
        () => 0,
      ),
    ).toEqual({ reason: "no_eligible_agent" });

    expect(
      resolvePlacement(
        capabilities({
          roleDefinitions: [roleDefinition({ enabled: false })],
        }),
        intent({ roleDefinitionId }),
        () => 0,
      ),
    ).toEqual({ reason: "no_eligible_agent" });
  });

  it("rejects unhealthy or incorrectly tagged execution paths", () => {
    expect(
      resolvePlacement(
        capabilities({ agents: [agent({ healthStatus: "unhealthy" })] }),
        intent(),
        () => 0,
      ),
    ).toEqual({ reason: "no_eligible_agent" });

    expect(
      resolvePlacement(
        capabilities({ runtimes: [runtime({ healthStatus: "unhealthy" })] }),
        intent(),
        () => 0,
      ),
    ).toEqual({ reason: "no_eligible_agent" });

    expect(
      resolvePlacement(
        capabilities(),
        intent({ requiredAgentTags: ["missing"] }),
        () => 0,
      ),
    ).toEqual({ reason: "no_eligible_agent" });

    expect(
      resolvePlacement(
        capabilities(),
        intent({ requiredRuntimeTags: ["missing"] }),
        () => 0,
      ),
    ).toEqual({ reason: "no_eligible_agent" });
  });

  it("distinguishes exhausted capacity from missing eligibility", () => {
    expect(resolvePlacement(capabilities(), intent(), () => 1)).toEqual({
      reason: "capacity_exhausted",
    });
  });
});

function capabilities(
  overrides: Partial<WorkspaceExecutionCapabilities> = {},
): WorkspaceExecutionCapabilities {
  return {
    workspaceId,
    runtimes: [runtime()],
    agents: [agent()],
    roleDefinitions: [roleDefinition()],
    ...overrides,
  };
}

function intent(overrides: Partial<DispatchIntent> = {}): DispatchIntent {
  const now = new Date().toISOString();

  return {
    id: asDispatchIntentId("intent_1"),
    workspaceId,
    targetType: "task",
    taskId: undefined,
    action: "implement",
    state: "queued",
    requiredAgentTags: [],
    requiredRuntimeTags: [],
    placementFailureCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function runtime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    id: runtimeId,
    workspaceId,
    name: "customer host",
    location: "customer_host",
    mode: "local_worktree",
    healthStatus: "healthy",
    tags: ["default"],
    ...overrides,
  };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: asAgentId("agent_1"),
    workspaceId,
    runtimeId,
    name: "codex worker",
    harness: "openai-codex",
    model: "gpt-5-codex",
    concurrencyLimit: 1,
    healthStatus: "healthy",
    tags: ["default"],
    launcher: "codex-adapter",
    ...overrides,
  };
}

function roleDefinition(
  overrides: Partial<RoleDefinition> = {},
): RoleDefinition {
  return {
    id: roleDefinitionId,
    workspaceId,
    name: "implementation worker",
    prompt: "Implement the task.",
    toolAccess: [],
    skillAccess: [],
    lifecycleHooks: [],
    tags: [],
    enabled: true,
    ...overrides,
  };
}
