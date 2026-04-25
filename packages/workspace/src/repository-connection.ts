import type {
  AuditOutcome,
  ConnectGitHubRepositoryInput,
  RepositoryConnectionStatus,
  Workspace,
} from "./models.js";

export function assertRepositoryLinkCompatible(
  workspace: Workspace,
  input: ConnectGitHubRepositoryInput,
): void {
  if (!workspace.repository) {
    return;
  }

  if (isSameRepository(workspace.repository, input)) {
    return;
  }

  throw new Error(
    `Workspace ${workspace.id} is already linked to ${workspace.repository.owner}/${workspace.repository.repository}.`,
  );
}

export function repositoryAuditOutcome(
  status: RepositoryConnectionStatus,
): AuditOutcome {
  if (status === "connected") {
    return "success";
  }

  return "failure";
}

export function repositoryConnectReason(
  status: RepositoryConnectionStatus,
): string | undefined {
  if (status === "connected") {
    return undefined;
  }

  return "Repository link was saved without a live connection.";
}

export function repositoryStatusReason(
  status: RepositoryConnectionStatus,
): string | undefined {
  if (status === "connected") {
    return undefined;
  }

  return "Repository connectivity check failed.";
}

function isSameRepository(
  existing: { owner: string; repository: string },
  input: ConnectGitHubRepositoryInput,
): boolean {
  if (existing.owner !== input.owner) {
    return false;
  }

  return existing.repository === input.repository;
}
