import type { ExecutionSnapshot } from "@stoneforge/execution"
import type { MergeRequestSnapshot } from "@stoneforge/merge-request"
import type { WorkspaceSetupSnapshot } from "@stoneforge/workspace"

import {
  parseCurrentControlPlaneIds,
  type CurrentControlPlaneIds,
} from "./control-plane-current-ids.js"

export type { CurrentControlPlaneIds } from "./control-plane-current-ids.js"

export const controlPlaneSnapshotVersion = 1

export interface ControlPlaneSnapshot {
  version: typeof controlPlaneSnapshotVersion
  workspace: WorkspaceSetupSnapshot
  execution: ExecutionSnapshot
  mergeRequests: MergeRequestSnapshot
  current: CurrentControlPlaneIds
}

export interface ControlPlaneStore {
  load(): Promise<ControlPlaneSnapshot>
  save(snapshot: ControlPlaneSnapshot): Promise<void>
  reset(): Promise<void>
}

export interface ControlPlaneCommandStatus {
  command: string
  id: string
  state?: string
}

export class ControlPlanePersistenceError extends Error {}

type WorkspaceCollections = Pick<
  WorkspaceSetupSnapshot,
  "auditEvents" | "orgs" | "workspaces"
>
type ExecutionCollections = Pick<
  ExecutionSnapshot,
  | "assignments"
  | "dispatchIntents"
  | "leases"
  | "mergeRequestContexts"
  | "sessions"
  | "tasks"
  | "workspaces"
>
type MergeRequestCollections = Pick<
  MergeRequestSnapshot,
  "mergeRequests" | "verificationRuns"
>

export function createEmptyControlPlaneSnapshot(): ControlPlaneSnapshot {
  return {
    version: controlPlaneSnapshotVersion,
    workspace: {
      orgs: [],
      workspaces: [],
      auditEvents: [],
    },
    execution: {
      workspaces: [],
      tasks: [],
      dispatchIntents: [],
      assignments: [],
      sessions: [],
      leases: [],
      mergeRequestContexts: [],
    },
    mergeRequests: {
      mergeRequests: [],
      verificationRuns: [],
    },
    current: {},
  }
}

export function parseControlPlaneSnapshot(
  contents: string,
  source: string
): ControlPlaneSnapshot {
  try {
    return validateControlPlaneSnapshot(
      JSON.parse(contents) as Partial<ControlPlaneSnapshot>,
      source
    )
  } catch (error) {
    if (error instanceof ControlPlanePersistenceError) {
      throw error
    }

    throw new ControlPlanePersistenceError(
      `Could not read persisted control-plane snapshot from ${source}. The snapshot is corrupt or incompatible.`
    )
  }
}

export function validateControlPlaneSnapshot(
  snapshot: Partial<ControlPlaneSnapshot>,
  source: string
): ControlPlaneSnapshot {
  if (snapshot.version !== controlPlaneSnapshotVersion) {
    throw new ControlPlanePersistenceError(
      `Persisted control-plane snapshot in ${source} uses version ${snapshotVersionText(
        snapshot
      )}; this build supports version ${controlPlaneSnapshotVersion}. Reset the store or run a compatible migration.`
    )
  }

  if (
    !hasWorkspaceCollections(snapshot.workspace) ||
    !hasExecutionCollections(snapshot.execution) ||
    !hasMergeRequestCollections(snapshot.mergeRequests) ||
    snapshot.current === undefined
  ) {
    throw new ControlPlanePersistenceError(
      `Persisted control-plane snapshot in ${source} is missing required domain snapshot collections. Reset the store or restore a compatible snapshot.`
    )
  }

  return {
    version: controlPlaneSnapshotVersion,
    workspace: {
      orgs: snapshot.workspace.orgs,
      workspaces: snapshot.workspace.workspaces,
      auditEvents: snapshot.workspace.auditEvents,
    },
    execution: {
      workspaces: snapshot.execution.workspaces,
      tasks: snapshot.execution.tasks,
      dispatchIntents: snapshot.execution.dispatchIntents,
      assignments: snapshot.execution.assignments,
      sessions: snapshot.execution.sessions,
      leases: snapshot.execution.leases,
      mergeRequestContexts: snapshot.execution.mergeRequestContexts,
    },
    mergeRequests: {
      mergeRequests: snapshot.mergeRequests.mergeRequests,
      verificationRuns: snapshot.mergeRequests.verificationRuns,
    },
    current: parseCurrentControlPlaneIds(
      snapshot.current,
      source,
      invalidCurrentIdError
    ),
  }
}

function hasWorkspaceCollections(
  snapshot: Partial<WorkspaceSetupSnapshot> | undefined
): snapshot is WorkspaceCollections {
  return [snapshot?.orgs, snapshot?.workspaces, snapshot?.auditEvents].every(
    Array.isArray
  )
}

function hasExecutionCollections(
  snapshot: Partial<ExecutionSnapshot> | undefined
): snapshot is ExecutionCollections {
  return [
    snapshot?.workspaces,
    snapshot?.tasks,
    snapshot?.dispatchIntents,
    snapshot?.assignments,
    snapshot?.sessions,
    snapshot?.leases,
    snapshot?.mergeRequestContexts,
  ].every(Array.isArray)
}

function hasMergeRequestCollections(
  snapshot: Partial<MergeRequestSnapshot> | undefined
): snapshot is MergeRequestCollections {
  return [snapshot?.mergeRequests, snapshot?.verificationRuns].every(
    Array.isArray
  )
}

function snapshotVersionText(snapshot: Partial<ControlPlaneSnapshot>): string {
  if (snapshot.version === undefined) {
    return "missing"
  }

  return String(snapshot.version)
}

function invalidCurrentIdError(
  label: string,
  source: string
): ControlPlanePersistenceError {
  return new ControlPlanePersistenceError(
    `Persisted control-plane snapshot in ${source} has invalid ${label}. Reset the store or restore a compatible snapshot.`
  )
}
