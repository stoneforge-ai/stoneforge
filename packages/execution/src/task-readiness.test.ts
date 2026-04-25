import { asRoleDefinitionId, asWorkspaceId } from "@stoneforge/core";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";

import {
  asTaskId,
  isTaskDispatchable,
  type Task,
  type TaskReadinessContext,
  type WorkspaceExecutionCapabilities,
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

  it("is dispatchable exactly when content, dependencies, work, and role constraints are satisfied", () => {
    fc.assert(
      fc.property(readinessCaseArbitrary, assertReadinessInvariant),
    );
  });
});

const readinessCaseArbitrary: Arbitrary<ReadinessCase> = fc.record({
  title: fc.string({ maxLength: 12 }),
  intent: fc.string({ maxLength: 12 }),
  acceptanceCriteria: fc.array(fc.string({ maxLength: 12 }), { maxLength: 3 }),
  hasPlan: fc.boolean(),
  dependencies: fc.array(fc.boolean(), { maxLength: 3 }),
  activeWork: fc.boolean(),
  workspaceExists: fc.boolean(),
  roleEnabled: fc.boolean(),
  requireRole: fc.boolean(),
  roleMatches: fc.boolean(),
});

interface ReadinessCase {
  title: string;
  intent: string;
  acceptanceCriteria: string[];
  hasPlan: boolean;
  dependencies: boolean[];
  activeWork: boolean;
  workspaceExists: boolean;
  roleEnabled: boolean;
  requireRole: boolean;
  roleMatches: boolean;
}

function assertReadinessInvariant(readinessCase: ReadinessCase): void {
  const dependencies = buildDependencies(readinessCase.dependencies);
  const dependencyIds = dependencies.map((dependency) => dependency.id);
  const roleDefinitionId = asRoleDefinitionId("role_1");
  const taskUnderTest = readinessTask(
    readinessCase,
    dependencyIds,
    roleDefinitionId,
  );
  const expectedDispatchable = isExpectedDispatchable(
    readinessCase,
    taskUnderTest,
    dependencies,
  );

  expect(
    isTaskDispatchable(
      taskUnderTest,
      readinessContext(readinessCase, dependencies, roleDefinitionId),
    ),
  ).toBe(expectedDispatchable);
}

function buildDependencies(
  values: boolean[],
): Array<{ id: Task["id"]; completed: boolean }> {
  return values.map((completed, index) => {
    return {
      id: asTaskId(`dependency_${index}`),
      completed,
    };
  });
}

function readinessTask(
  readinessCase: ReadinessCase,
  dependencyIds: Task["dependencyIds"],
  roleDefinitionId: ReturnType<typeof asRoleDefinitionId>,
): Task {
  return task({
    title: readinessCase.title,
    intent: readinessCase.intent,
    acceptanceCriteria: readinessCase.acceptanceCriteria,
    planId: readinessCase.hasPlan ? "plan_1" : undefined,
    dependencyIds,
    dispatchConstraints: {
      roleDefinitionId: readinessCase.requireRole ? roleDefinitionId : undefined,
      requiredAgentTags: [],
      requiredRuntimeTags: [],
    },
  });
}

function readinessContext(
  readinessCase: ReadinessCase,
  dependencies: Array<{ id: Task["id"]; completed: boolean }>,
  roleDefinitionId: ReturnType<typeof asRoleDefinitionId>,
): TaskReadinessContext {
  return context({
    activeWork: readinessCase.activeWork,
    capabilities: workspaceCapabilities(readinessCase, roleDefinitionId),
    dependencies,
  });
}

function workspaceCapabilities(
  readinessCase: ReadinessCase,
  roleDefinitionId: ReturnType<typeof asRoleDefinitionId>,
): WorkspaceExecutionCapabilities | undefined {
  if (!readinessCase.workspaceExists) {
    return undefined;
  }

  return capabilities({
    roleDefinitionId: readinessCase.roleMatches
      ? roleDefinitionId
      : asRoleDefinitionId("other_role"),
    roleEnabled: readinessCase.roleEnabled,
  });
}

function isExpectedDispatchable(
  readinessCase: ReadinessCase,
  taskUnderTest: Task,
  dependencies: Array<{ completed: boolean }>,
): boolean {
  return (
    !readinessCase.hasPlan &&
    taskContentIsDispatchable(taskUnderTest) &&
    dependencies.every((dependency) => dependency.completed) &&
    !readinessCase.activeWork &&
    readinessCase.workspaceExists &&
    readinessCase.roleEnabled &&
    (!readinessCase.requireRole || readinessCase.roleMatches)
  );
}

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
    repairContext: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function context(options: {
  activeWork?: boolean;
  capabilities?: WorkspaceExecutionCapabilities;
  dependencies?: Array<{ id: ReturnType<typeof asTaskId>; completed: boolean }>;
} = {}): TaskReadinessContext {
  return {
    getTask: (dependencyId) => {
      const dependency = options.dependencies?.find((candidateDependency) => {
        return candidateDependency.id === dependencyId;
      });

      return dependency
        ? task({
            id: dependency.id,
            state: dependency.completed ? "completed" : "planned",
          })
        : undefined;
    },
    getWorkspace: () =>
      "capabilities" in options ? options.capabilities : capabilities(),
    hasActiveWork: () => options.activeWork ?? false,
  };
}

function capabilities(options: {
  roleDefinitionId?: ReturnType<typeof asRoleDefinitionId>;
  roleEnabled?: boolean;
} = {}): WorkspaceExecutionCapabilities {
  return {
    workspaceId,
    runtimes: [],
    agents: [],
    roleDefinitions: [
      {
        id: options.roleDefinitionId ?? asRoleDefinitionId("role_1"),
        workspaceId,
        name: "implementation worker",
        category: "worker",
        prompt: "Implement.",
        toolAccess: [],
        skillAccess: [],
        lifecycleHooks: [],
        tags: [],
        enabled: options.roleEnabled ?? true,
      },
    ],
  };
}

function taskContentIsDispatchable(candidateTask: Task): boolean {
  return (
    candidateTask.acceptanceCriteria.length > 0 &&
    [
      candidateTask.title,
      candidateTask.intent,
      ...candidateTask.acceptanceCriteria,
    ].every((value) => value.trim().length > 0)
  );
}
