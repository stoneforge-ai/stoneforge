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
  repositoryAuditOutcome,
  repositoryConnectReason,
  repositoryLinkConflict,
  repositoryStatusReason,
} from "./repository-connection.js"
import {
  createOrgRecordInState,
  createWorkspaceRecordInState,
} from "./workspace-creation.js"
import { validateWorkspaceRecord } from "./workspace-validation-flow.js"
import {
  RepositoryNotLinked,
  WorkspaceNotFound,
  type WorkspaceSetupError,
} from "./workspace-errors.js"
import {
  now,
  runWorkspaceProgram,
  workspaceRuntime,
  type WorkspaceClockService,
  type WorkspaceSetupServiceOptions,
} from "./workspace-runtime.js"
import { Effect, type Layer } from "effect"

/**
 * In-memory application service for the Slice 1 workspace onboarding path.
 * It exists to exercise the `draft -> ready` setup lifecycle before an API,
 * storage layer, or UI surface is frozen.
 */
export class WorkspaceSetupService {
  private readonly state: WorkspaceSetupState
  private readonly capabilities: WorkspaceCapabilityRegistration
  private readonly runtime: Layer.Layer<WorkspaceClockService>

  constructor(
    snapshot?: WorkspaceSetupSnapshot,
    options: WorkspaceSetupServiceOptions = {}
  ) {
    this.state = new WorkspaceSetupState(snapshot)
    this.capabilities = new WorkspaceCapabilityRegistration(this.state)
    this.runtime = workspaceRuntime(options)
  }

  createOrg(input: CreateOrgInput): Org {
    return this.run(createOrgRecordInState(this.state, input))
  }

  createWorkspace(
    orgId: OrgId,
    input: CreateWorkspaceInput,
    actor: AuditActor
  ): Workspace {
    return this.run(
      createWorkspaceRecordInState(this.state, orgId, input, actor)
    )
  }

  connectGitHubRepository(
    workspaceId: WorkspaceId,
    input: ConnectGitHubRepositoryInput,
    actor: AuditActor
  ): Workspace {
    return this.run(
      Effect.gen(this, function* () {
        const workspace = yield* this.workspaceRecord(workspaceId)
        const conflict = repositoryLinkConflict(workspace, input)

        if (conflict) {
          return yield* Effect.fail(conflict)
        }

        const timestamp = yield* now()
        const repository = createRepositoryLink(input, timestamp)

        workspace.repository = repository
        workspace.updatedAt = timestamp
        workspace.state = computeConfiguredState(workspace)

        this.state.appendAuditEvent(
          {
            actor,
            action: "workspace.github_repository_connected",
            orgId: workspace.orgId,
            workspaceId: workspace.id,
            targetId: `${repository.owner}/${repository.repository}`,
            targetType: "repository",
            outcome: repositoryAuditOutcome(repository.connectionStatus),
            reason: repositoryConnectReason(repository.connectionStatus),
            policyPreset: workspace.policyPreset,
          },
          timestamp
        )

        return cloneWorkspace(workspace)
      }).pipe(
        Effect.withSpan("workspace.connect_github_repository", {
          attributes: {
            "stoneforge.workspace.id": workspaceId,
            "stoneforge.provider.name": "github",
            "stoneforge.provider.operation": "connect_repository",
          },
        })
      )
    )
  }

  selectPolicyPreset(
    workspaceId: WorkspaceId,
    preset: PolicyPreset,
    actor: AuditActor
  ): Workspace {
    return this.run(
      Effect.gen(this, function* () {
        const workspace = yield* this.workspaceRecord(workspaceId)
        const timestamp = yield* now()

        workspace.policyPreset = preset
        workspace.updatedAt = timestamp
        workspace.state = computeConfiguredState(workspace)

        this.state.appendAuditEvent(
          {
            actor,
            action: "workspace.policy_preset_selected",
            orgId: workspace.orgId,
            workspaceId: workspace.id,
            targetId: workspace.id,
            targetType: "policy",
            outcome: "success",
            policyPreset: preset,
          },
          timestamp
        )

        return cloneWorkspace(workspace)
      }).pipe(
        Effect.withSpan("workspace.select_policy_preset", {
          attributes: {
            "stoneforge.workspace.id": workspaceId,
            "stoneforge.policy.preset": preset,
          },
        })
      )
    )
  }

  registerRuntime(
    workspaceId: WorkspaceId,
    input: RegisterRuntimeInput,
    actor: AuditActor
  ): Runtime {
    return this.run(
      this.capabilities.registerRuntime(workspaceId, input, actor)
    )
  }

  registerAgent(
    workspaceId: WorkspaceId,
    input: RegisterAgentInput,
    actor: AuditActor
  ): Agent {
    return this.run(this.capabilities.registerAgent(workspaceId, input, actor))
  }

  registerRoleDefinition(
    workspaceId: WorkspaceId,
    input: RegisterRoleDefinitionInput,
    actor: AuditActor
  ): RoleDefinition {
    return this.run(
      this.capabilities.registerRoleDefinition(workspaceId, input, actor)
    )
  }

  recordGitHubRepositoryConnectionStatus(
    workspaceId: WorkspaceId,
    status: "connected" | "disconnected",
    actor: AuditActor
  ): Workspace {
    return this.run(
      Effect.gen(this, function* () {
        const workspace = yield* this.workspaceRecord(workspaceId)

        if (!workspace.repository) {
          return yield* Effect.fail(new RepositoryNotLinked({ workspaceId }))
        }

        const timestamp = yield* now()
        workspace.repository = {
          ...workspace.repository,
          connectionStatus: status,
        }
        workspace.updatedAt = timestamp

        this.state.appendAuditEvent(
          {
            actor,
            action: "workspace.github_repository_connection_updated",
            orgId: workspace.orgId,
            workspaceId: workspace.id,
            targetId: `${workspace.repository.owner}/${workspace.repository.repository}`,
            targetType: "repository",
            outcome: repositoryAuditOutcome(status),
            reason: repositoryStatusReason(status),
            policyPreset: workspace.policyPreset,
          },
          timestamp
        )

        return cloneWorkspace(workspace)
      }).pipe(
        Effect.withSpan("workspace.update_github_repository_connection", {
          attributes: {
            "stoneforge.workspace.id": workspaceId,
            "stoneforge.provider.name": "github",
            "stoneforge.provider.operation":
              "record_repository_connection_status",
          },
        })
      )
    )
  }

  updateRuntimeHealthStatus(
    workspaceId: WorkspaceId,
    runtimeId: RuntimeId,
    status: HealthStatus,
    actor: AuditActor
  ): Runtime {
    return this.run(
      this.capabilities.updateRuntimeHealthStatus(
        workspaceId,
        runtimeId,
        status,
        actor
      )
    )
  }

  validateWorkspace(
    workspaceId: WorkspaceId,
    actor: AuditActor
  ): WorkspaceValidationResult {
    return this.run(validateWorkspaceRecord(this.state, workspaceId, actor))
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

  private run<TResult>(
    program: Effect.Effect<TResult, WorkspaceSetupError, WorkspaceClockService>
  ): TResult {
    return runWorkspaceProgram(program, this.runtime)
  }

  private workspaceRecord(
    workspaceId: WorkspaceId
  ): Effect.Effect<Workspace, WorkspaceNotFound> {
    const workspace = this.state.getWorkspace(workspaceId)

    if (!workspace) {
      return Effect.fail(new WorkspaceNotFound({ workspaceId }))
    }

    return Effect.succeed(workspace)
  }
}
