import type { DispatchIntentId, TaskId } from "./ids.js";
import type {
  CreateMergeRequestDispatchIntentInput,
  CreateTaskInput,
  DispatchIntent,
  Task,
  TaskDispatchConstraints,
  UpdateTaskInput,
} from "./models.js";

export function createTaskRecord(
  id: TaskId,
  input: CreateTaskInput,
  now: string,
): Task {
  return {
    id,
    workspaceId: input.workspaceId,
    title: input.title,
    intent: input.intent,
    acceptanceCriteria: cloneArray(input.acceptanceCriteria),
    priority: withDefault(input.priority, "normal"),
    dependencyIds: cloneArray(input.dependencyIds),
    planId: input.planId,
    state: "planned",
    requiresMergeRequest: withDefault(input.requiresMergeRequest, false),
    dispatchConstraints: normalizeDispatchConstraints(input.dispatchConstraints),
    progressRecord: {
      checkpoints: [],
      repairContext: [],
    },
    followUpSource: input.followUpSource,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTaskDispatchIntentRecord(
  id: DispatchIntentId,
  task: Task,
  now: string,
): DispatchIntent {
  return {
    id,
    workspaceId: task.workspaceId,
    targetType: "task",
    taskId: task.id,
    action: "implement",
    state: "queued",
    roleDefinitionId: task.dispatchConstraints.roleDefinitionId,
    requiredAgentTags: [...task.dispatchConstraints.requiredAgentTags],
    requiredRuntimeTags: [...task.dispatchConstraints.requiredRuntimeTags],
    placementFailureCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMergeRequestDispatchIntentRecord(
  id: DispatchIntentId,
  input: CreateMergeRequestDispatchIntentInput,
  now: string,
): DispatchIntent {
  return {
    id,
    workspaceId: input.workspaceId,
    targetType: "merge_request",
    mergeRequestId: input.mergeRequest.id,
    action: input.action,
    state: "queued",
    roleDefinitionId: input.roleDefinitionId,
    requiredAgentTags: cloneArray(input.requiredAgentTags),
    requiredRuntimeTags: cloneArray(input.requiredRuntimeTags),
    placementFailureCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyTaskUpdate(task: Task, input: UpdateTaskInput): void {
  for (const applyUpdate of taskUpdateAppliers) {
    applyUpdate(task, input);
  }
}

function normalizeDispatchConstraints(
  input: Partial<TaskDispatchConstraints> | undefined,
): TaskDispatchConstraints {
  return {
    roleDefinitionId: input?.roleDefinitionId,
    requiredAgentTags: cloneArray(input?.requiredAgentTags),
    requiredRuntimeTags: cloneArray(input?.requiredRuntimeTags),
  };
}

const taskUpdateAppliers: Array<
  (task: Task, input: UpdateTaskInput) => void
> = [
  applyTitleUpdate,
  applyIntentUpdate,
  applyAcceptanceCriteriaUpdate,
  applyPriorityUpdate,
  applyDependencyUpdate,
  applyDispatchConstraintUpdate,
];

function applyTitleUpdate(task: Task, input: UpdateTaskInput): void {
  if (input.title !== undefined) {
    task.title = input.title;
  }
}

function applyIntentUpdate(task: Task, input: UpdateTaskInput): void {
  if (input.intent !== undefined) {
    task.intent = input.intent;
  }
}

function applyAcceptanceCriteriaUpdate(
  task: Task,
  input: UpdateTaskInput,
): void {
  if (input.acceptanceCriteria !== undefined) {
    task.acceptanceCriteria = [...input.acceptanceCriteria];
  }
}

function applyPriorityUpdate(task: Task, input: UpdateTaskInput): void {
  if (input.priority !== undefined) {
    task.priority = input.priority;
  }
}

function applyDependencyUpdate(task: Task, input: UpdateTaskInput): void {
  if (input.dependencyIds !== undefined) {
    task.dependencyIds = [...input.dependencyIds];
  }
}

function applyDispatchConstraintUpdate(
  task: Task,
  input: UpdateTaskInput,
): void {
  if (input.dispatchConstraints !== undefined) {
    task.dispatchConstraints = normalizeDispatchConstraints({
      ...task.dispatchConstraints,
      ...input.dispatchConstraints,
    });
  }
}

function cloneArray<T>(value: T[] | undefined): T[] {
  return [...(value ?? [])];
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}
