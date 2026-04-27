import type { RoleDefinitionId, WorkspaceId } from "@stoneforge/core"

import type { Task, WorkspaceExecutionCapabilities } from "./models.js"
import type { TaskId } from "./ids.js"

export interface TaskReadinessContext {
  getTask(taskId: TaskId): Task | undefined
  getWorkspace(
    workspaceId: WorkspaceId
  ): WorkspaceExecutionCapabilities | undefined
  hasActiveWork(taskId: TaskId): boolean
}

export function isTaskDispatchable(
  task: Task,
  context: TaskReadinessContext
): boolean {
  return taskReadinessChecks.every((check) => check(task, context))
}

const taskReadinessChecks: Array<
  (task: Task, context: TaskReadinessContext) => boolean
> = [
  hasNoPlan,
  hasDispatchableContent,
  dependenciesAreComplete,
  hasNoActiveWork,
  canEvaluateConstraints,
]

function hasNoPlan(task: Task): boolean {
  return task.planId === undefined
}

function hasDispatchableContent(task: Task): boolean {
  if (task.acceptanceCriteria.length === 0) {
    return false
  }

  return [
    task.title.trim(),
    task.intent.trim(),
    ...task.acceptanceCriteria.map((criterion) => criterion.trim()),
  ].every((value) => value.length > 0)
}

function dependenciesAreComplete(
  task: Task,
  context: TaskReadinessContext
): boolean {
  return task.dependencyIds.every((dependencyId) => {
    return context.getTask(dependencyId)?.state === "completed"
  })
}

function hasNoActiveWork(task: Task, context: TaskReadinessContext): boolean {
  return !context.hasActiveWork(task.id)
}

function canEvaluateConstraints(
  task: Task,
  context: TaskReadinessContext
): boolean {
  const capabilities = context.getWorkspace(task.workspaceId)

  if (!capabilities) {
    return false
  }

  return hasEnabledRoleDefinition(
    capabilities,
    task.dispatchConstraints.roleDefinitionId
  )
}

function hasEnabledRoleDefinition(
  capabilities: WorkspaceExecutionCapabilities,
  roleDefinitionId: RoleDefinitionId | undefined
): boolean {
  return capabilities.roleDefinitions.some((roleDefinition) => {
    return isEnabledRoleDefinition(roleDefinition, roleDefinitionId)
  })
}

function isEnabledRoleDefinition(
  roleDefinition: { enabled: boolean; id: RoleDefinitionId },
  roleDefinitionId: RoleDefinitionId | undefined
): boolean {
  if (!roleDefinition.enabled) {
    return false
  }

  return matchesRoleDefinition(roleDefinition.id, roleDefinitionId)
}

function matchesRoleDefinition(
  candidateId: RoleDefinitionId,
  requiredId: RoleDefinitionId | undefined
): boolean {
  if (requiredId === undefined) {
    return true
  }

  return candidateId === requiredId
}
