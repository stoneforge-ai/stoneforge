import type {
  AuditOutcome,
  ConnectGitHubRepositoryInput,
  RepositoryConnectionStatus,
  Workspace,
} from "./models.js"
import { RepositoryAlreadyLinked } from "./workspace-errors.js"

export function assertRepositoryLinkCompatible(
  workspace: Workspace,
  input: ConnectGitHubRepositoryInput
): void {
  const conflict = repositoryLinkConflict(workspace, input)

  if (conflict) {
    throw conflict
  }
}

export function repositoryLinkConflict(
  workspace: Workspace,
  input: ConnectGitHubRepositoryInput
): RepositoryAlreadyLinked | null {
  if (!workspace.repository || isSameRepository(workspace.repository, input)) {
    return null
  }

  return new RepositoryAlreadyLinked({
    workspaceId: workspace.id,
    owner: workspace.repository.owner,
    repository: workspace.repository.repository,
  })
}

export function repositoryAuditOutcome(
  status: RepositoryConnectionStatus
): AuditOutcome {
  if (status === "connected") {
    return "success"
  }

  return "failure"
}

export function repositoryConnectReason(
  status: RepositoryConnectionStatus
): string | undefined {
  if (status === "connected") {
    return undefined
  }

  return "Repository link was saved without a live connection."
}

export function repositoryStatusReason(
  status: RepositoryConnectionStatus
): string | undefined {
  if (status === "connected") {
    return undefined
  }

  return "Repository connectivity check failed."
}

function isSameRepository(
  existing: { owner: string; repository: string },
  input: ConnectGitHubRepositoryInput
): boolean {
  if (existing.owner !== input.owner) {
    return false
  }

  return existing.repository === input.repository
}
