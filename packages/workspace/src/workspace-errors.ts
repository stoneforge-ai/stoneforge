import { Data } from "effect"

import type { OrgId, RuntimeId, WorkspaceId } from "./ids.js"

export class OrgNotFound extends Data.TaggedError("OrgNotFound")<{
  readonly orgId: OrgId
}> {
  get message(): string {
    return `Org ${this.orgId} does not exist.`
  }
}

export class WorkspaceNotFound extends Data.TaggedError("WorkspaceNotFound")<{
  readonly workspaceId: WorkspaceId
}> {
  get message(): string {
    return `Workspace ${this.workspaceId} does not exist.`
  }
}

export class RepositoryAlreadyLinked extends Data.TaggedError(
  "RepositoryAlreadyLinked"
)<{
  readonly workspaceId: WorkspaceId
  readonly owner: string
  readonly repository: string
}> {
  get message(): string {
    return `Workspace ${this.workspaceId} is already linked to ${this.owner}/${this.repository}.`
  }
}

export class RepositoryNotLinked extends Data.TaggedError(
  "RepositoryNotLinked"
)<{
  readonly workspaceId: WorkspaceId
}> {
  get message(): string {
    return `Workspace ${this.workspaceId} is not linked to a repository.`
  }
}

export class RuntimeNotFound extends Data.TaggedError("RuntimeNotFound")<{
  readonly workspaceId: WorkspaceId
  readonly runtimeId: RuntimeId
}> {
  get message(): string {
    return `Runtime ${this.runtimeId} does not exist in workspace ${this.workspaceId}.`
  }
}

export class InvalidAgentConcurrencyLimit extends Data.TaggedError(
  "InvalidAgentConcurrencyLimit"
)<{
  readonly concurrencyLimit: number
}> {
  get message(): string {
    return "Agent concurrencyLimit must be at least 1."
  }
}

export type WorkspaceSetupError =
  | OrgNotFound
  | WorkspaceNotFound
  | RepositoryAlreadyLinked
  | RepositoryNotLinked
  | RuntimeNotFound
  | InvalidAgentConcurrencyLimit
