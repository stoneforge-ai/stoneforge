import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  AgentId,
  CIRunId,
  MergeRequestId,
  OrgId,
  RoleDefinitionId,
  RuntimeId,
  WorkspaceId,
} from "@stoneforge/core";
import type {
  AssignmentId,
  ExecutionSnapshot,
  SessionId,
  TaskId,
} from "@stoneforge/execution";
import type { MergeRequestSnapshot } from "@stoneforge/merge-request";
import type { WorkspaceSetupSnapshot } from "@stoneforge/workspace";

const snapshotVersion = 1;

export interface CurrentControlPlaneIds {
  orgId?: OrgId;
  workspaceId?: WorkspaceId;
  runtimeId?: RuntimeId;
  agentId?: AgentId;
  roleDefinitionId?: RoleDefinitionId;
  taskId?: TaskId;
  implementationAssignmentId?: AssignmentId;
  implementationSessionId?: SessionId;
  mergeRequestId?: MergeRequestId;
  ciRunId?: CIRunId;
  reviewAssignmentId?: AssignmentId;
  reviewSessionId?: SessionId;
}

export interface ControlPlaneSnapshot {
  version: typeof snapshotVersion;
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

export class FileControlPlaneStore implements ControlPlaneStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<ControlPlaneSnapshot> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return JSON.parse(contents) as ControlPlaneSnapshot;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return createEmptyControlPlaneSnapshot();
      }

      throw new Error(
        `Could not read control-plane store at ${this.filePath}. Check that the file contains valid JSON.`,
      );
    }
  }

  async save(snapshot: ControlPlaneSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  async reset(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

export function createEmptyControlPlaneSnapshot(): ControlPlaneSnapshot {
  return {
    version: snapshotVersion,
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
