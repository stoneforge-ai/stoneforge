import {
  asAgentId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
  type Agent,
  type CustomerHostRuntime,
  type RoleDefinition,
} from "@stoneforge/core";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";

import {
  asDispatchIntentId,
  asTaskId,
  resolvePlacement,
  type WorkspaceExecutionCapabilities,
} from "./index.js";
import type { TaskDispatchIntent } from "./models.js";

const workspaceId = asWorkspaceId("workspace_1");
const runtimeId = asRuntimeId("runtime_1");
const roleDefinitionId = asRoleDefinitionId("role_1");

describe("resolvePlacement", () => {
  it("selects the first healthy Agent with available capacity", () => {
    const placement = resolvePlacement(capabilities(), intent(), () => 0);

    if ("reason" in placement) {
      throw new Error(`Expected placement but received ${placement.reason}.`);
    }

    expect(placement.agent.id).toBe(asAgentId("agent_1"));
    expect(placement.runtime.id).toBe(runtimeId);
    expect(placement.roleDefinition.id).toBe(roleDefinitionId);
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

  it("places work exactly when role, tags, health, runtime, and capacity are eligible", () => {
    fc.assert(fc.property(placementCaseArbitrary, assertPlacementInvariant));
  });
});

const placementCaseArbitrary: Arbitrary<PlacementCase> = fc.record({
  roleEnabled: fc.boolean(),
  agentHealthy: fc.boolean(),
  runtimeHealthy: fc.boolean(),
  runtimeLinked: fc.boolean(),
  requiredAgentTag: fc.boolean(),
  agentHasRequiredTag: fc.boolean(),
  requiredRuntimeTag: fc.boolean(),
  runtimeHasRequiredTag: fc.boolean(),
  concurrencyLimit: fc.integer({ min: 1, max: 3 }),
  activeLeaseCount: fc.integer({ min: 0, max: 3 }),
});

interface PlacementCase {
  roleEnabled: boolean;
  agentHealthy: boolean;
  runtimeHealthy: boolean;
  runtimeLinked: boolean;
  requiredAgentTag: boolean;
  agentHasRequiredTag: boolean;
  requiredRuntimeTag: boolean;
  runtimeHasRequiredTag: boolean;
  concurrencyLimit: number;
  activeLeaseCount: number;
}

function assertPlacementInvariant(placementCase: PlacementCase): void {
  const requiredAgentTags = requiredTags(
    placementCase.requiredAgentTag,
    "required-agent",
  );
  const requiredRuntimeTags = requiredTags(
    placementCase.requiredRuntimeTag,
    "required-runtime",
  );
  const result = resolvePlacement(
    placementCapabilities(
      placementCase,
      requiredAgentTags,
      requiredRuntimeTags,
    ),
    intent({ requiredAgentTags, requiredRuntimeTags }),
    () => placementCase.activeLeaseCount,
  );
  const expectedPlaced = isExpectedPlaced(placementCase);

  expect("agent" in result).toBe(expectedPlaced);
  if (!expectedPlaced) {
    expect("reason" in result).toBe(true);
  }
}

function requiredTags(required: boolean, tag: string): string[] {
  return required ? [tag] : [];
}

function placementCapabilities(
  placementCase: PlacementCase,
  requiredAgentTags: string[],
  requiredRuntimeTags: string[],
): WorkspaceExecutionCapabilities {
  return capabilities({
    agents: [
      agent({
        concurrencyLimit: placementCase.concurrencyLimit,
        healthStatus: placementCase.agentHealthy ? "healthy" : "unhealthy",
        runtimeId: placementCase.runtimeLinked
          ? runtimeId
          : asRuntimeId("missing_runtime"),
        tags: placementCase.agentHasRequiredTag
          ? ["default", ...requiredAgentTags]
          : ["default"],
      }),
    ],
    runtimes: [
      runtime({
        healthStatus: placementCase.runtimeHealthy ? "healthy" : "unhealthy",
        tags: placementCase.runtimeHasRequiredTag
          ? ["default", ...requiredRuntimeTags]
          : ["default"],
      }),
    ],
    roleDefinitions: [roleDefinition({ enabled: placementCase.roleEnabled })],
  });
}

function isExpectedPlaced(placementCase: PlacementCase): boolean {
  return (
    placementCase.roleEnabled &&
    placementCase.agentHealthy &&
    placementCase.runtimeLinked &&
    placementCase.runtimeHealthy &&
    hasRequiredAgentTag(placementCase) &&
    hasRequiredRuntimeTag(placementCase) &&
    placementCase.activeLeaseCount < placementCase.concurrencyLimit
  );
}

function hasRequiredAgentTag(placementCase: PlacementCase): boolean {
  return !placementCase.requiredAgentTag || placementCase.agentHasRequiredTag;
}

function hasRequiredRuntimeTag(placementCase: PlacementCase): boolean {
  return (
    !placementCase.requiredRuntimeTag || placementCase.runtimeHasRequiredTag
  );
}

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

function intent(
  overrides: Partial<TaskDispatchIntent> = {},
): TaskDispatchIntent {
  const now = new Date().toISOString();

  return {
    id: asDispatchIntentId("intent_1"),
    workspaceId,
    targetType: "task",
    taskId: asTaskId("task_1"),
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

function runtime(
  overrides: Partial<CustomerHostRuntime> = {},
): CustomerHostRuntime {
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
    category: "worker",
    prompt: "Implement the task.",
    toolAccess: [],
    skillAccess: [],
    lifecycleHooks: [],
    tags: [],
    enabled: true,
    ...overrides,
  };
}
