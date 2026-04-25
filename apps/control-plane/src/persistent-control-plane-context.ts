import type { MergeRequestId } from "@stoneforge/core";
import type { Assignment, DispatchIntent, Session } from "@stoneforge/execution";
import { TaskDispatchService } from "@stoneforge/execution";
import { MergeRequestService } from "@stoneforge/merge-request";
import type {
  AuditActor,
  PolicyPreset,
  RoleDefinition,
  Workspace,
  WorkspaceSetupService,
} from "@stoneforge/workspace";
import { WorkspaceSetupService as WorkspaceSetup } from "@stoneforge/workspace";

import {
  type ControlPlaneSnapshot,
  type CurrentControlPlaneIds,
} from "./control-plane-store.js";
import { createFakeAgentFixture } from "./fake-agent-adapter.js";
import { createFakeGitHubMergeRequestFixture } from "./fake-github-merge-request-adapter.js";

export interface LoadedControlPlane {
  snapshot: ControlPlaneSnapshot;
  setup: WorkspaceSetupService;
  execution: TaskDispatchService;
  mergeRequests: MergeRequestService;
}

export const operator: AuditActor = {
  kind: "human",
  id: "user_operator",
  displayName: "Local Operator",
};

export const scheduler: AuditActor = {
  kind: "service",
  id: "scheduler_local",
  displayName: "Local Scheduler",
};

export function loadControlPlane(
  snapshot: ControlPlaneSnapshot,
): LoadedControlPlane {
  const setup = new WorkspaceSetup(snapshot.workspace);
  const execution = new TaskDispatchService(
    createFakeAgentFixture(),
    undefined,
    snapshot.execution,
  );
  const mergeRequests = new MergeRequestService(
    execution,
    createFakeGitHubMergeRequestFixture(),
    mergeRequestOptions(snapshot, setup),
    snapshot.mergeRequests,
  );

  return { snapshot, setup, execution, mergeRequests };
}

export function exportSnapshot(
  loaded: LoadedControlPlane,
): ControlPlaneSnapshot {
  return {
    version: loaded.snapshot.version,
    workspace: loaded.setup.exportSnapshot(),
    execution: loaded.execution.exportSnapshot(),
    mergeRequests: loaded.mergeRequests.exportSnapshot(),
    current: { ...loaded.snapshot.current },
  };
}

export function requireRoleDefinition(
  loaded: LoadedControlPlane,
): RoleDefinition {
  const workspace = loaded.setup.getWorkspace(
    requireWorkspaceId(loaded.snapshot.current),
  );
  const roleDefinitionId = requireValue(
    loaded.snapshot.current.roleDefinitionId,
    "Configure a RoleDefinition before creating tasks or reviews.",
  );
  const roleDefinition = workspace.roleDefinitions.find((candidate) => {
    return candidate.id === roleDefinitionId;
  });

  return requireValue(
    roleDefinition,
    `RoleDefinition ${roleDefinitionId} does not exist in the current workspace.`,
  );
}

export function requireStartedAssignment(
  execution: TaskDispatchService,
  intent: DispatchIntent | null,
): Assignment {
  if (intent === null) {
    throw new Error("No queued dispatch intent exists. Create or request work first.");
  }

  if (intent.assignmentId === undefined) {
    throw new Error(startFailureMessage(intent));
  }

  return execution.getAssignment(intent.assignmentId);
}

export function requireLatestSession(
  execution: TaskDispatchService,
  assignment: Assignment,
): Session {
  const sessionId = assignment.sessionIds.at(-1);

  return execution.getSession(
    requireValue(sessionId, `Assignment ${assignment.id} did not start a Session.`),
  );
}

export function rememberCompletedAssignment(
  current: CurrentControlPlaneIds,
  assignment: Assignment,
  session: Session,
): void {
  if (assignment.owner.type === "task") {
    current.implementationAssignmentId = assignment.id;
    current.implementationSessionId = session.id;
    return;
  }

  current.reviewAssignmentId = assignment.id;
  current.reviewSessionId = session.id;
}

export function requireWorkspaceId(current: CurrentControlPlaneIds): Workspace["id"] {
  return requireValue(
    current.workspaceId,
    "No Workspace exists. Run initialize-workspace first.",
  );
}

export function requireRuntimeId(
  current: CurrentControlPlaneIds,
): Workspace["runtimes"][number]["id"] {
  return requireValue(
    current.runtimeId,
    "No Runtime exists. Run configure-runtime before configure-agent.",
  );
}

export function requireTaskId(
  current: CurrentControlPlaneIds,
): ReturnType<TaskDispatchService["getTask"]>["id"] {
  return requireValue(current.taskId, "No Task exists. Create a direct task first.");
}

export function requireMergeRequestId(
  current: CurrentControlPlaneIds,
): MergeRequestId {
  return requireValue(
    current.mergeRequestId,
    "No MergeRequest exists. Open a MergeRequest first.",
  );
}

export function requireImplementationSessionId(
  current: CurrentControlPlaneIds,
): Session["id"] {
  return requireValue(
    current.implementationSessionId,
    "No implementation Session exists. Run the implementation worker first.",
  );
}

export function requireReviewSessionId(
  current: CurrentControlPlaneIds,
): Session["id"] {
  return requireValue(
    current.reviewSessionId,
    "No review Session exists. Run the review worker first.",
  );
}

export function requireValue<TValue>(
  value: TValue | undefined,
  message: string,
): TValue {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function mergeRequestOptions(
  snapshot: ControlPlaneSnapshot,
  setup: WorkspaceSetupService,
): { policyPreset: PolicyPreset; targetBranch: string } {
  const workspace = findCurrentWorkspace(snapshot, setup);

  return {
    policyPreset: workspace?.policyPreset ?? "supervised",
    targetBranch: workspace?.targetBranch ?? "main",
  };
}

function findCurrentWorkspace(
  snapshot: ControlPlaneSnapshot,
  setup: WorkspaceSetupService,
): Workspace | undefined {
  if (snapshot.current.workspaceId === undefined) {
    return undefined;
  }

  return setup.getWorkspace(snapshot.current.workspaceId);
}

function startFailureMessage(intent: DispatchIntent): string {
  const failure = intent.lastFailureReason ?? "the placement failure";

  return `Dispatch intent ${intent.id} did not start. Resolve ${failure} and run the worker again.`;
}
