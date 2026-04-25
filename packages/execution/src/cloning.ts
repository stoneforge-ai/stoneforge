import { cloneAgent, cloneRoleDefinition, cloneRuntime } from "@stoneforge/core";

import type {
  Assignment,
  Checkpoint,
  DispatchIntent,
  Lease,
  Session,
  Task,
  WorkspaceExecutionCapabilities,
} from "./models.js";

export function cloneWorkspaceCapabilities(
  capabilities: WorkspaceExecutionCapabilities,
): WorkspaceExecutionCapabilities {
  return {
    workspaceId: capabilities.workspaceId,
    runtimes: capabilities.runtimes.map(cloneRuntime),
    agents: capabilities.agents.map(cloneAgent),
    roleDefinitions: capabilities.roleDefinitions.map(cloneRoleDefinition),
  };
}

export function cloneTask(task: Task): Task {
  return {
    ...task,
    acceptanceCriteria: [...task.acceptanceCriteria],
    dependencyIds: [...task.dependencyIds],
    dispatchConstraints: {
      roleDefinitionId: task.dispatchConstraints.roleDefinitionId,
      requiredAgentTags: [...task.dispatchConstraints.requiredAgentTags],
      requiredRuntimeTags: [...task.dispatchConstraints.requiredRuntimeTags],
    },
    continuity: task.continuity.map((checkpoint) => ({
      ...checkpoint,
      completedWork: [...checkpoint.completedWork],
      remainingWork: [...checkpoint.remainingWork],
      importantContext: [...checkpoint.importantContext],
    })),
    repairContext: [...task.repairContext],
  };
}

export function cloneDispatchIntent(intent: DispatchIntent): DispatchIntent {
  return {
    ...intent,
    requiredAgentTags: [...intent.requiredAgentTags],
    requiredRuntimeTags: [...intent.requiredRuntimeTags],
  };
}

export function cloneLease(lease: Lease): Lease {
  return {
    ...lease,
  };
}

export function cloneAssignment(assignment: Assignment): Assignment {
  return {
    ...assignment,
    sessionIds: [...assignment.sessionIds],
  };
}

export function cloneSession(session: Session): Session {
  return {
    ...session,
    heartbeats: session.heartbeats.map((heartbeat) => ({ ...heartbeat })),
    checkpoints: session.checkpoints.map(cloneCheckpoint),
  };
}

export function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    completedWork: [...checkpoint.completedWork],
    remainingWork: [...checkpoint.remainingWork],
    importantContext: [...checkpoint.importantContext],
  };
}
