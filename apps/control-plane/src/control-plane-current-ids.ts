import {
  asAgentId,
  asCIRunId,
  asMergeRequestId,
  asOrgId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
  type AgentId,
  type CIRunId,
  type MergeRequestId,
  type OrgId,
  type RoleDefinitionId,
  type RuntimeId,
  type WorkspaceId,
} from "@stoneforge/core";
import {
  asAssignmentId,
  asSessionId,
  asTaskId,
  type AssignmentId,
  type SessionId,
  type TaskId,
} from "@stoneforge/execution";

type ParsedId<TId extends string> = (value: string) => TId;
type InvalidCurrentIdError = (label: string, source: string) => Error;
type UntypedCurrentControlPlaneIds = Partial<
  Record<keyof CurrentControlPlaneIds, unknown>
>;

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

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

export function parseCurrentControlPlaneIds(
  current: CurrentControlPlaneIds,
  source: string,
  onInvalidId: InvalidCurrentIdError,
): CurrentControlPlaneIds {
  const untypedCurrent = current as UntypedCurrentControlPlaneIds;

  return {
    ...parseWorkspaceCurrentIds(untypedCurrent, source, onInvalidId),
    ...parseExecutionCurrentIds(untypedCurrent, source, onInvalidId),
    ...parseMergeCurrentIds(untypedCurrent, source, onInvalidId),
  };
}

function parseWorkspaceCurrentIds(
  current: UntypedCurrentControlPlaneIds,
  source: string,
  onInvalidId: InvalidCurrentIdError,
): CurrentControlPlaneIds {
  return {
    orgId: parseOptionalId(
      current.orgId,
      "current.orgId",
      source,
      asOrgId,
      onInvalidId,
    ),
    workspaceId: parseOptionalId(
      current.workspaceId,
      "current.workspaceId",
      source,
      asWorkspaceId,
      onInvalidId,
    ),
    runtimeId: parseOptionalId(
      current.runtimeId,
      "current.runtimeId",
      source,
      asRuntimeId,
      onInvalidId,
    ),
    agentId: parseOptionalId(
      current.agentId,
      "current.agentId",
      source,
      asAgentId,
      onInvalidId,
    ),
    roleDefinitionId: parseOptionalId(
      current.roleDefinitionId,
      "current.roleDefinitionId",
      source,
      asRoleDefinitionId,
      onInvalidId,
    ),
  };
}

function parseExecutionCurrentIds(
  current: UntypedCurrentControlPlaneIds,
  source: string,
  onInvalidId: InvalidCurrentIdError,
): CurrentControlPlaneIds {
  return {
    taskId: parseOptionalId(
      current.taskId,
      "current.taskId",
      source,
      asTaskId,
      onInvalidId,
    ),
    implementationAssignmentId: parseOptionalId(
      current.implementationAssignmentId,
      "current.implementationAssignmentId",
      source,
      asAssignmentId,
      onInvalidId,
    ),
    implementationSessionId: parseOptionalId(
      current.implementationSessionId,
      "current.implementationSessionId",
      source,
      asSessionId,
      onInvalidId,
    ),
  };
}

function parseMergeCurrentIds(
  current: UntypedCurrentControlPlaneIds,
  source: string,
  onInvalidId: InvalidCurrentIdError,
): CurrentControlPlaneIds {
  return {
    mergeRequestId: parseOptionalId(
      current.mergeRequestId,
      "current.mergeRequestId",
      source,
      asMergeRequestId,
      onInvalidId,
    ),
    ciRunId: parseOptionalId(
      current.ciRunId,
      "current.ciRunId",
      source,
      asCIRunId,
      onInvalidId,
    ),
    reviewAssignmentId: parseOptionalId(
      current.reviewAssignmentId,
      "current.reviewAssignmentId",
      source,
      asAssignmentId,
      onInvalidId,
    ),
    reviewSessionId: parseOptionalId(
      current.reviewSessionId,
      "current.reviewSessionId",
      source,
      asSessionId,
      onInvalidId,
    ),
  };
}

function parseOptionalId<TId extends string>(
  value: unknown,
  label: string,
  source: string,
  parse: ParsedId<TId>,
  onInvalidId: InvalidCurrentIdError,
): TId | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw onInvalidId(label, source);
  }

  try {
    return parse(validIdValue(value, label, source, onInvalidId));
  } catch {
    throw onInvalidId(label, source);
  }
}

function validIdValue(
  value: string,
  label: string,
  source: string,
  onInvalidId: InvalidCurrentIdError,
): string {
  if (idPattern.test(value)) {
    return value;
  }

  throw onInvalidId(label, source);
}
