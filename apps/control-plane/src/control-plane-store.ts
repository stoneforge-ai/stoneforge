import type { ExecutionSnapshot } from "@stoneforge/execution";
import type { MergeRequestSnapshot } from "@stoneforge/merge-request";
import type { WorkspaceSetupSnapshot } from "@stoneforge/workspace";

import {
  parseCurrentControlPlaneIds,
  type CurrentControlPlaneIds,
} from "./control-plane-current-ids.js";

export type { CurrentControlPlaneIds } from "./control-plane-current-ids.js";

export const controlPlaneSnapshotVersion = 1;

export interface ControlPlaneSnapshot {
  version: typeof controlPlaneSnapshotVersion;
  workspace: WorkspaceSetupSnapshot;
  execution: ExecutionSnapshot;
  mergeRequests: MergeRequestSnapshot;
  current: CurrentControlPlaneIds;
}

export interface ControlPlaneStore {
  load(): Promise<ControlPlaneSnapshot>;
  save(snapshot: ControlPlaneSnapshot): Promise<void>;
  reset(): Promise<void>;
}

export interface ControlPlaneCommandStatus {
  command: string;
  id: string;
  state?: string;
}

export class ControlPlanePersistenceError extends Error {}

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
      ciRuns: [],
    },
    current: {},
  };
}

export function parseControlPlaneSnapshot(
  contents: string,
  source: string,
): ControlPlaneSnapshot {
  try {
    return validateControlPlaneSnapshot(
      JSON.parse(contents) as Partial<ControlPlaneSnapshot>,
      source,
    );
  } catch (error) {
    if (error instanceof ControlPlanePersistenceError) {
      throw error;
    }

    throw new ControlPlanePersistenceError(
      `Could not read persisted control-plane snapshot from ${source}. The snapshot is corrupt or incompatible.`,
    );
  }
}

export function validateControlPlaneSnapshot(
  snapshot: Partial<ControlPlaneSnapshot>,
  source: string,
): ControlPlaneSnapshot {
  if (snapshot.version !== controlPlaneSnapshotVersion) {
    throw new ControlPlanePersistenceError(
      `Persisted control-plane snapshot in ${source} uses version ${snapshotVersionText(
        snapshot,
      )}; this build supports version ${controlPlaneSnapshotVersion}. Reset the store or run a compatible migration.`,
    );
  }

  if (!hasRequiredCollections(snapshot)) {
    throw new ControlPlanePersistenceError(
      `Persisted control-plane snapshot in ${source} is missing required domain snapshot collections. Reset the store or restore a compatible snapshot.`,
    );
  }

  const validSnapshot = snapshot as ControlPlaneSnapshot;

  return {
    ...validSnapshot,
    current: parseCurrentControlPlaneIds(
      validSnapshot.current,
      source,
      invalidCurrentIdError,
    ),
  };
}

function hasRequiredCollections(
  snapshot: Partial<ControlPlaneSnapshot>,
): boolean {
  return (
    hasWorkspaceCollections(snapshot) &&
    hasExecutionCollections(snapshot) &&
    hasMergeRequestCollections(snapshot) &&
    snapshot.current !== undefined
  );
}

function hasWorkspaceCollections(
  snapshot: Partial<ControlPlaneSnapshot>,
): boolean {
  return [
    snapshot.workspace?.orgs,
    snapshot.workspace?.workspaces,
    snapshot.workspace?.auditEvents,
  ].every(Array.isArray);
}

function hasExecutionCollections(
  snapshot: Partial<ControlPlaneSnapshot>,
): boolean {
  return [
    snapshot.execution?.workspaces,
    snapshot.execution?.tasks,
    snapshot.execution?.dispatchIntents,
    snapshot.execution?.assignments,
    snapshot.execution?.sessions,
    snapshot.execution?.leases,
    snapshot.execution?.mergeRequestContexts,
  ].every(Array.isArray);
}

function hasMergeRequestCollections(
  snapshot: Partial<ControlPlaneSnapshot>,
): boolean {
  return [
    snapshot.mergeRequests?.mergeRequests,
    snapshot.mergeRequests?.ciRuns,
  ].every(Array.isArray);
}

function snapshotVersionText(snapshot: Partial<ControlPlaneSnapshot>): string {
  if (snapshot.version === undefined) {
    return "missing";
  }

  return String(snapshot.version);
}

function invalidCurrentIdError(
  label: string,
  source: string,
): ControlPlanePersistenceError {
  return new ControlPlanePersistenceError(
    `Persisted control-plane snapshot in ${source} has invalid ${label}. Reset the store or restore a compatible snapshot.`,
  );
}
