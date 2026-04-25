import type { ExecutionSnapshot } from "@stoneforge/execution";
import type { MergeRequestSnapshot } from "@stoneforge/merge-request";
import type { WorkspaceSetupSnapshot } from "@stoneforge/workspace";

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  validateControlPlaneSnapshot,
} from "./control-plane-store.js";

export const singletonSnapshotId = "default";
export const currentSchemaVersion = 1;

export type JsonColumn<TValue> = TValue | string;

export interface SerializedSnapshot {
  snapshotVersion: number;
  currentOrgId: string | null;
  currentWorkspaceId: string | null;
  workspaceSnapshot: JsonColumn<WorkspaceSetupSnapshot>;
  executionSnapshot: JsonColumn<ExecutionSnapshot>;
  mergeRequestSnapshot: JsonColumn<MergeRequestSnapshot>;
  currentSnapshot: JsonColumn<ControlPlaneSnapshot["current"]>;
}

type SnapshotColumns = Pick<
  SerializedSnapshot,
  | "currentSnapshot"
  | "executionSnapshot"
  | "mergeRequestSnapshot"
  | "snapshotVersion"
  | "workspaceSnapshot"
>;

export function serializeSnapshot(
  snapshot: ControlPlaneSnapshot,
): SerializedSnapshot {
  return {
    snapshotVersion: snapshot.version,
    currentOrgId: snapshot.current.orgId ?? null,
    currentWorkspaceId: snapshot.current.workspaceId ?? null,
    workspaceSnapshot: JSON.stringify(snapshot.workspace),
    executionSnapshot: JSON.stringify(snapshot.execution),
    mergeRequestSnapshot: JSON.stringify(snapshot.mergeRequests),
    currentSnapshot: JSON.stringify(snapshot.current),
  };
}

export function deserializeSnapshot(
  row: SnapshotColumns,
  source: string,
): ControlPlaneSnapshot {
  return validateControlPlaneSnapshot(
    {
      version: row.snapshotVersion as ControlPlaneSnapshot["version"],
      workspace: parseJsonColumn<WorkspaceSetupSnapshot>(
        row.workspaceSnapshot,
        "workspace",
        source,
      ),
      execution: parseJsonColumn<ExecutionSnapshot>(
        row.executionSnapshot,
        "execution",
        source,
      ),
      mergeRequests: parseJsonColumn<MergeRequestSnapshot>(
        row.mergeRequestSnapshot,
        "merge request",
        source,
      ),
      current: parseJsonColumn<ControlPlaneSnapshot["current"]>(
        row.currentSnapshot,
        "current ids",
        source,
      ),
    },
    source,
  );
}

export function jsonColumnText<TValue>(value: JsonColumn<TValue>): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function errorMessage(error: Error): string {
  return error.message.length === 0 ? "" : `Cause: ${error.message}`;
}

function parseJsonColumn<TValue>(
  value: JsonColumn<TValue>,
  label: string,
  source: string,
): TValue {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as TValue;
  } catch {
    throw new ControlPlanePersistenceError(
      `Could not read ${label} snapshot from ${source}. The persisted snapshot is corrupt or incompatible.`,
    );
  }
}
