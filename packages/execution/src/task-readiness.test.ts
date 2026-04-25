import { asRoleDefinitionId, asWorkspaceId } from "@stoneforge/core";
import { describe, expect, it } from "vitest";

import {
  asTaskId,
  isTaskDispatchable,
  Task,
  type TaskReadinessContext,
  WorkspaceExecutionCapabilities,
} from "./index.js";

const workspaceId = asWorkspaceId("workspace_1");
const taskId = asTaskId("task_1");

describe("isTaskDispatchable", () => {
  it("requires unplanned content, completed dependencies, and enabled role access", () => {
    expect(isTaskDispatchable(task(), context())).toBe(true);
    expect(isTaskDispatchable(task({ planId: "plan_1" }), context())).toBe(false);
    expect(isTaskDispatchable(task({ title: "" }), context())).toBe(false);
    expect(isTaskDispatchable(task({ intent: "" }), context())).toBe(false);
    expect(
      isTaskDispatchable(task({ acceptanceCriteria: [] }), context()),
    ).toBe(false);
    expect(isTaskDispatchable(task(), context({ activeWork: true }))).toBe(false);
    expect(
      isTaskDispatchable(
        task({ dependencyIds: [asTaskId("dependency_1")] }),
        context(),
      ),
    ).toBe(false);
    expect(
      isTaskDispatchable(
        task({
          dispatchConstraints: {
            roleDefinitionId: asRoleDefinitionId("missing_role"),
            requiredAgentTags: [],
            requiredRuntimeTags: [],
          },
        }),
        context(),
      ),
    ).toBe(false);
    expect(isTaskDispatchable(task(), context({ capabilities: undefined }))).toBe(
      false,
    );
  });
});

function task(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();

  return {
    id: taskId,
    workspaceId,
    title: "Dispatchable task",
    intent: "Run this task.",
    acceptanceCriteria: ["It dispatches."],
    priority: "normal",
    dependencyIds: [],
    state: "planned",
    requiresMergeRequest: false,
    dispatchConstraints: {
      requiredAgentTags: [],
      requiredRuntimeTags: [],
    },
    continuity: [],
    repairContexts: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function context(options: {
  activeWork?: boolean;
  capabilities?: WorkspaceExecutionCapabilities;
} = {}): TaskReadinessContext {
  return {
    getTask: () => undefined,
    getWorkspace: () =>
      "capabilities" in options ? options.capabilities : capabilities(),
    hasActiveWork: () => options.activeWork ?? false,
  };
}

function capabilities(): WorkspaceExecutionCapabilities {
  return {
    workspaceId,
    runtimes: [],
    agents: [],
    roleDefinitions: [
      {
        id: asRoleDefinitionId("role_1"),
        workspaceId,
        name: "implementation worker",
        category: "worker",
        prompt: "Implement.",
        toolAccess: [],
        skillAccess: [],
        lifecycleHooks: [],
        tags: [],
        enabled: true,
      },
    ],
  };
}
