import { cloneAgent, cloneRoleDefinition, cloneRuntime } from "@stoneforge/core"

import type {
  AuditEvent,
  GitHubRepositoryLink,
  Org,
  Workspace,
  WorkspaceValidationResult,
} from "./models.js"

export function cloneOrg(org: Org): Org {
  return {
    ...org,
  }
}

export function cloneWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    repository: workspace.repository
      ? cloneRepositoryLink(workspace.repository)
      : undefined,
    runtimes: workspace.runtimes.map(cloneRuntime),
    agents: workspace.agents.map(cloneAgent),
    roleDefinitions: workspace.roleDefinitions.map(cloneRoleDefinition),
    validation: workspace.validation
      ? cloneValidationResult(workspace.validation)
      : undefined,
  }
}

export function cloneValidationResult(
  validation: WorkspaceValidationResult
): WorkspaceValidationResult {
  return {
    ...validation,
    issues: validation.issues.map((issue) => ({ ...issue })),
    selectedExecutionPath: validation.selectedExecutionPath
      ? { ...validation.selectedExecutionPath }
      : undefined,
  }
}

export function cloneAuditEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    actor: {
      ...event.actor,
    },
  }
}

function cloneRepositoryLink(
  repository: GitHubRepositoryLink
): GitHubRepositoryLink {
  return {
    ...repository,
  }
}
