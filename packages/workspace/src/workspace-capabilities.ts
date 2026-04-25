import {
  asAgentId,
  asRoleDefinitionId,
  asRuntimeId,
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core";

import type {
  Agent,
  AuditActor,
  AuditOutcome,
  HealthStatus,
  RegisterAgentInput,
  RegisterRoleDefinitionInput,
  RegisterRuntimeInput,
  RoleDefinition,
  Runtime,
} from "./models.js";
import type { RuntimeId, WorkspaceId } from "./ids.js";
import type { WorkspaceSetupState } from "./workspace-state.js";
import {
  createAgentRecord,
  createRoleDefinitionRecord,
  createRuntimeRecord,
} from "./workspace-records.js";
import { computeConfiguredState } from "./workspace-validation.js";

export class WorkspaceCapabilityRegistration {
  constructor(private readonly state: WorkspaceSetupState) {}

  registerRuntime(
    workspaceId: WorkspaceId,
    input: RegisterRuntimeInput,
    actor: AuditActor,
  ): Runtime {
    const workspace = this.state.requireWorkspace(workspaceId);
    const runtime = createRuntimeRecord(
      asRuntimeId(this.state.nextId("runtime")),
      workspaceId,
      input,
    );

    workspace.runtimes.push(runtime);
    workspace.updatedAt = this.state.now();
    workspace.state = computeConfiguredState(workspace);

    this.state.appendAuditEvent({
      actor,
      action: "workspace.runtime_registered",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: runtime.id,
      targetType: "runtime",
      outcome: "success",
      policyPreset: workspace.policyPreset,
    });

    return cloneRuntime(runtime);
  }

  registerAgent(
    workspaceId: WorkspaceId,
    input: RegisterAgentInput,
    actor: AuditActor,
  ): Agent {
    const workspace = this.state.requireWorkspace(workspaceId);
    const runtime = workspace.runtimes.find((candidate) => {
      return candidate.id === input.runtimeId;
    });

    if (!runtime) {
      throw new Error(
        `Runtime ${input.runtimeId} does not exist in workspace ${workspaceId}.`,
      );
    }

    if (input.concurrencyLimit < 1) {
      throw new Error("Agent concurrencyLimit must be at least 1.");
    }

    const agent = createAgentRecord(
      asAgentId(this.state.nextId("agent")),
      workspaceId,
      input,
    );

    workspace.agents.push(agent);
    workspace.updatedAt = this.state.now();
    workspace.state = computeConfiguredState(workspace);

    this.state.appendAuditEvent({
      actor,
      action: "workspace.agent_registered",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: agent.id,
      targetType: "agent",
      outcome: "success",
      policyPreset: workspace.policyPreset,
    });

    return cloneAgent(agent);
  }

  registerRoleDefinition(
    workspaceId: WorkspaceId,
    input: RegisterRoleDefinitionInput,
    actor: AuditActor,
  ): RoleDefinition {
    const workspace = this.state.requireWorkspace(workspaceId);
    const roleDefinition = createRoleDefinitionRecord(
      asRoleDefinitionId(this.state.nextId("roleDefinition")),
      workspaceId,
      input,
    );

    workspace.roleDefinitions.push(roleDefinition);
    workspace.updatedAt = this.state.now();
    workspace.state = computeConfiguredState(workspace);

    this.state.appendAuditEvent({
      actor,
      action: "workspace.role_definition_registered",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: roleDefinition.id,
      targetType: "role_definition",
      outcome: "success",
      policyPreset: workspace.policyPreset,
    });

    return cloneRoleDefinition(roleDefinition);
  }

  updateRuntimeHealthStatus(
    workspaceId: WorkspaceId,
    runtimeId: RuntimeId,
    status: HealthStatus,
    actor: AuditActor,
  ): Runtime {
    const workspace = this.state.requireWorkspace(workspaceId);
    const runtime = workspace.runtimes.find((candidate) => {
      return candidate.id === runtimeId;
    });

    if (!runtime) {
      throw new Error(
        `Runtime ${runtimeId} does not exist in workspace ${workspaceId}.`,
      );
    }

    runtime.healthStatus = status;
    workspace.updatedAt = this.state.now();

    this.state.appendAuditEvent({
      actor,
      action: "workspace.runtime_health_updated",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: runtime.id,
      targetType: "runtime",
      outcome: runtimeHealthOutcome(status),
      reason: runtimeHealthReason(status),
      policyPreset: workspace.policyPreset,
    });

    return cloneRuntime(runtime);
  }
}

function runtimeHealthOutcome(status: HealthStatus): AuditOutcome {
  if (status === "healthy") {
    return "success";
  }

  return "failure";
}

function runtimeHealthReason(status: HealthStatus): string | undefined {
  if (status === "healthy") {
    return undefined;
  }

  return "Runtime health check failed.";
}
