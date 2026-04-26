import type { Agent, RoleDefinition, Runtime } from "@stoneforge/core";

import type {
  ConnectGitHubRepositoryInput,
  CreateWorkspaceInput,
  GitHubRepositoryLink,
  Org,
  RegisterAgentInput,
  RegisterRoleDefinitionInput,
  RegisterRuntimeInput,
  Workspace,
} from "./models.js";
import type { OrgId, WorkspaceId } from "./ids.js";

export function createOrgRecord(
  id: OrgId,
  name: string,
  createdAt: string,
): Org {
  return {
    id,
    name,
    createdAt,
  };
}

export function createWorkspaceRecord(
  id: WorkspaceId,
  orgId: OrgId,
  input: CreateWorkspaceInput,
  now: string,
): Workspace {
  return {
    id,
    orgId,
    name: input.name,
    targetBranch: input.targetBranch,
    state: "draft",
    runtimes: [],
    agents: [],
    roleDefinitions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createRepositoryLink(
  input: ConnectGitHubRepositoryInput,
  connectedAt: string,
): GitHubRepositoryLink {
  return {
    installationId: input.installationId,
    owner: input.owner,
    repository: input.repository,
    defaultBranch: input.defaultBranch,
    connectionStatus: withDefault(input.connectionStatus, "connected"),
    connectedAt,
  };
}

export function createRuntimeRecord(
  id: Runtime["id"],
  workspaceId: WorkspaceId,
  input: RegisterRuntimeInput,
): Runtime {
  const base = {
    id,
    workspaceId,
    name: input.name,
    healthStatus: withDefault(input.healthStatus, "healthy"),
    tags: cloneArray(input.tags),
  };

  if (input.location === "managed") {
    return {
      ...base,
      location: input.location,
      mode: input.mode,
      managedProvider: input.managedProvider,
    };
  }

  return {
    ...base,
    location: input.location,
    mode: input.mode,
    hostId: input.hostId,
  };
}

export function createAgentRecord(
  id: Agent["id"],
  workspaceId: WorkspaceId,
  input: RegisterAgentInput,
): Agent {
  return {
    id,
    workspaceId,
    runtimeId: input.runtimeId,
    name: input.name,
    harness: input.harness,
    model: input.model,
    concurrencyLimit: input.concurrencyLimit,
    healthStatus: withDefault(input.healthStatus, "healthy"),
    tags: cloneArray(input.tags),
    launcher: input.launcher,
  };
}

export function createRoleDefinitionRecord(
  id: RoleDefinition["id"],
  workspaceId: WorkspaceId,
  input: RegisterRoleDefinitionInput,
): RoleDefinition {
  return {
    id,
    workspaceId,
    name: input.name,
    category: input.category,
    prompt: input.prompt,
    toolAccess: cloneArray(input.toolAccess),
    skillAccess: cloneArray(input.skillAccess),
    lifecycleHooks: cloneArray(input.lifecycleHooks),
    tags: cloneArray(input.tags),
    enabled: withDefault(input.enabled, true),
  };
}

function cloneArray<T>(value: T[] | undefined): T[] {
  return [...(value ?? [])];
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}
