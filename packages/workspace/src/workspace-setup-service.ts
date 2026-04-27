import type {
  Agent,
  AuditActor,
  AuditEvent,
  ConnectGitHubRepositoryInput,
  CreateOrgInput,
  CreateWorkspaceInput,
  HealthStatus,
  Org,
  PolicyPreset,
  RegisterAgentInput,
  RegisterRoleDefinitionInput,
  RegisterRuntimeInput,
  RoleDefinition,
  Runtime,
  Workspace,
  WorkspaceSetupSnapshot,
  WorkspaceValidationResult,
} from "./models.js"
import type { OrgId, RuntimeId, WorkspaceId } from "./ids.js"
import { cloneWorkspace } from "./cloning.js"
import { createRepositoryLink } from "./workspace-records.js"
import { computeConfiguredState } from "./workspace-validation.js"
import { WorkspaceSetupState } from "./workspace-state.js"
import { WorkspaceCapabilityRegistration } from "./workspace-capabilities.js"
import {
  assertRepositoryLinkCompatible,
  repositoryAuditOutcome,
  repositoryConnectReason,
  repositoryStatusReason,
} from "./repository-connection.js"
import {
  createOrgRecordInState,
  createWorkspaceRecordInState,
} from "./workspace-creation.js"
import { validateWorkspaceRecord } from "./workspace-validation-flow.js"

/**
 * In-memory application service for the Slice 1 workspace onboarding path.
 * It exists to exercise the `draft -> ready` setup lifecycle before an API,
 * storage layer, or UI surface is frozen.
 */
export class WorkspaceSetupService {
  private readonly state: WorkspaceSetupState
  private readonly capabilities: WorkspaceCapabilityRegistration

  constructor(snapshot?: WorkspaceSetupSnapshot) {
    this.state = new WorkspaceSetupState(snapshot)
    this.capabilities = new WorkspaceCapabilityRegistration(this.state)
  }

  createOrg(input: CreateOrgInput): Org {
    return createOrgRecordInState(this.state, input)
  }

  createWorkspace(
    orgId: OrgId,
    input: CreateWorkspaceInput,
    actor: AuditActor
  ): Workspace {
    return createWorkspaceRecordInState(this.state, orgId, input, actor)
  }

  connectGitHubRepository(
    workspaceId: WorkspaceId,
    input: ConnectGitHubRepositoryInput,
    actor: AuditActor
  ): Workspace {
    const workspace = this.state.requireWorkspace(workspaceId)

    assertRepositoryLinkCompatible(workspace, input)

    const now = this.state.now()
    const repository = createRepositoryLink(input, now)

    workspace.repository = repository
    workspace.updatedAt = now
    workspace.state = computeConfiguredState(workspace)

    this.state.appendAuditEvent({
      actor,
      action: "workspace.github_repository_connected",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: `${repository.owner}/${repository.repository}`,
      targetType: "repository",
      outcome: repositoryAuditOutcome(repository.connectionStatus),
      reason: repositoryConnectReason(repository.connectionStatus),
      policyPreset: workspace.policyPreset,
    })

    return cloneWorkspace(workspace)
  }

  selectPolicyPreset(
    workspaceId: WorkspaceId,
    preset: PolicyPreset,
    actor: AuditActor
  ): Workspace {
    const workspace = this.state.requireWorkspace(workspaceId)

    workspace.policyPreset = preset
    workspace.updatedAt = this.state.now()
    workspace.state = computeConfiguredState(workspace)

    this.state.appendAuditEvent({
      actor,
      action: "workspace.policy_preset_selected",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: workspace.id,
      targetType: "policy",
      outcome: "success",
      policyPreset: preset,
    })

    return cloneWorkspace(workspace)
  }

  registerRuntime(
    workspaceId: WorkspaceId,
    input: RegisterRuntimeInput,
    actor: AuditActor
  ): Runtime {
    return this.capabilities.registerRuntime(workspaceId, input, actor)
  }

  registerAgent(
    workspaceId: WorkspaceId,
    input: RegisterAgentInput,
    actor: AuditActor
  ): Agent {
    return this.capabilities.registerAgent(workspaceId, input, actor)
  }

  registerRoleDefinition(
    workspaceId: WorkspaceId,
    input: RegisterRoleDefinitionInput,
    actor: AuditActor
  ): RoleDefinition {
    return this.capabilities.registerRoleDefinition(workspaceId, input, actor)
  }

  recordGitHubRepositoryConnectionStatus(
    workspaceId: WorkspaceId,
    status: "connected" | "disconnected",
    actor: AuditActor
  ): Workspace {
    const workspace = this.state.requireWorkspace(workspaceId)

    if (!workspace.repository) {
      throw new Error(`Workspace ${workspaceId} is not linked to a repository.`)
    }

    workspace.repository = {
      ...workspace.repository,
      connectionStatus: status,
    }
    workspace.updatedAt = this.state.now()

    this.state.appendAuditEvent({
      actor,
      action: "workspace.github_repository_connection_updated",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: `${workspace.repository.owner}/${workspace.repository.repository}`,
      targetType: "repository",
      outcome: repositoryAuditOutcome(status),
      reason: repositoryStatusReason(status),
      policyPreset: workspace.policyPreset,
    })

    return cloneWorkspace(workspace)
  }

  updateRuntimeHealthStatus(
    workspaceId: WorkspaceId,
    runtimeId: RuntimeId,
    status: HealthStatus,
    actor: AuditActor
  ): Runtime {
    return this.capabilities.updateRuntimeHealthStatus(
      workspaceId,
      runtimeId,
      status,
      actor
    )
  }

  validateWorkspace(
    workspaceId: WorkspaceId,
    actor: AuditActor
  ): WorkspaceValidationResult {
    return validateWorkspaceRecord(this.state, workspaceId, actor)
  }

  getWorkspace(workspaceId: WorkspaceId): Workspace {
    return cloneWorkspace(this.state.requireWorkspace(workspaceId))
  }

  listAuditEventsForWorkspace(workspaceId: WorkspaceId): AuditEvent[] {
    return this.state.listAuditEventsForWorkspace(workspaceId)
  }

  exportSnapshot(): WorkspaceSetupSnapshot {
    return this.state.exportSnapshot()
  }
}
