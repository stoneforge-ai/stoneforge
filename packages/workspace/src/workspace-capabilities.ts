import {
  asAgentId,
  asRoleDefinitionId,
  asRuntimeId,
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core"
import { Effect } from "effect"

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
  Workspace,
} from "./models.js"
import type { RuntimeId, WorkspaceId } from "./ids.js"
import type { WorkspaceSetupState } from "./workspace-state.js"
import {
  createAgentRecord,
  createRoleDefinitionRecord,
  createRuntimeRecord,
} from "./workspace-records.js"
import { computeConfiguredState } from "./workspace-validation.js"
import {
  InvalidAgentConcurrencyLimit,
  RuntimeNotFound,
  WorkspaceNotFound,
} from "./workspace-errors.js"
import { now, type WorkspaceClockService } from "./workspace-runtime.js"

export class WorkspaceCapabilityRegistration {
  constructor(private readonly state: WorkspaceSetupState) {}

  registerRuntime(
    workspaceId: WorkspaceId,
    input: RegisterRuntimeInput,
    actor: AuditActor
  ): Effect.Effect<Runtime, WorkspaceNotFound, WorkspaceClockService> {
    return Effect.gen(this, function* () {
      const workspace = yield* this.workspaceRecord(workspaceId)
      const timestamp = yield* now()
      const runtime = createRuntimeRecord(
        asRuntimeId(this.state.nextId("runtime")),
        workspaceId,
        input
      )

      workspace.runtimes.push(runtime)
      workspace.updatedAt = timestamp
      workspace.state = computeConfiguredState(workspace)

      this.state.appendAuditEvent(
        {
          actor,
          action: "workspace.runtime_registered",
          orgId: workspace.orgId,
          workspaceId: workspace.id,
          targetId: runtime.id,
          targetType: "runtime",
          outcome: "success",
          policyPreset: workspace.policyPreset,
        },
        timestamp
      )

      return cloneRuntime(runtime)
    }).pipe(
      Effect.withSpan("workspace.register_runtime", {
        attributes: workspaceAttributes(workspaceId),
      })
    )
  }

  registerAgent(
    workspaceId: WorkspaceId,
    input: RegisterAgentInput,
    actor: AuditActor
  ): Effect.Effect<
    Agent,
    WorkspaceNotFound | RuntimeNotFound | InvalidAgentConcurrencyLimit,
    WorkspaceClockService
  > {
    return Effect.gen(this, function* () {
      const workspace = yield* this.workspaceRecord(workspaceId)
      const runtime = workspace.runtimes.find((candidate) => {
        return candidate.id === input.runtimeId
      })

      if (!runtime) {
        return yield* Effect.fail(
          new RuntimeNotFound({
            workspaceId,
            runtimeId: input.runtimeId,
          })
        )
      }

      if (input.concurrencyLimit < 1) {
        return yield* Effect.fail(
          new InvalidAgentConcurrencyLimit({
            concurrencyLimit: input.concurrencyLimit,
          })
        )
      }

      const timestamp = yield* now()
      const agent = createAgentRecord(
        asAgentId(this.state.nextId("agent")),
        workspaceId,
        input
      )

      workspace.agents.push(agent)
      workspace.updatedAt = timestamp
      workspace.state = computeConfiguredState(workspace)

      this.state.appendAuditEvent(
        {
          actor,
          action: "workspace.agent_registered",
          orgId: workspace.orgId,
          workspaceId: workspace.id,
          targetId: agent.id,
          targetType: "agent",
          outcome: "success",
          policyPreset: workspace.policyPreset,
        },
        timestamp
      )

      return cloneAgent(agent)
    }).pipe(
      Effect.withSpan("workspace.register_agent", {
        attributes: workspaceAttributes(workspaceId),
      })
    )
  }

  registerRoleDefinition(
    workspaceId: WorkspaceId,
    input: RegisterRoleDefinitionInput,
    actor: AuditActor
  ): Effect.Effect<RoleDefinition, WorkspaceNotFound, WorkspaceClockService> {
    return Effect.gen(this, function* () {
      const workspace = yield* this.workspaceRecord(workspaceId)
      const timestamp = yield* now()
      const roleDefinition = createRoleDefinitionRecord(
        asRoleDefinitionId(this.state.nextId("roleDefinition")),
        workspaceId,
        input
      )

      workspace.roleDefinitions.push(roleDefinition)
      workspace.updatedAt = timestamp
      workspace.state = computeConfiguredState(workspace)

      this.state.appendAuditEvent(
        {
          actor,
          action: "workspace.role_definition_registered",
          orgId: workspace.orgId,
          workspaceId: workspace.id,
          targetId: roleDefinition.id,
          targetType: "role_definition",
          outcome: "success",
          policyPreset: workspace.policyPreset,
        },
        timestamp
      )

      return cloneRoleDefinition(roleDefinition)
    }).pipe(
      Effect.withSpan("workspace.register_role_definition", {
        attributes: workspaceAttributes(workspaceId),
      })
    )
  }

  updateRuntimeHealthStatus(
    workspaceId: WorkspaceId,
    runtimeId: RuntimeId,
    status: HealthStatus,
    actor: AuditActor
  ): Effect.Effect<
    Runtime,
    WorkspaceNotFound | RuntimeNotFound,
    WorkspaceClockService
  > {
    return Effect.gen(this, function* () {
      const workspace = yield* this.workspaceRecord(workspaceId)
      const runtime = workspace.runtimes.find((candidate) => {
        return candidate.id === runtimeId
      })

      if (!runtime) {
        return yield* Effect.fail(
          new RuntimeNotFound({ workspaceId, runtimeId })
        )
      }

      const timestamp = yield* now()
      runtime.healthStatus = status
      workspace.updatedAt = timestamp

      this.state.appendAuditEvent(
        {
          actor,
          action: "workspace.runtime_health_updated",
          orgId: workspace.orgId,
          workspaceId: workspace.id,
          targetId: runtime.id,
          targetType: "runtime",
          outcome: runtimeHealthOutcome(status),
          reason: runtimeHealthReason(status),
          policyPreset: workspace.policyPreset,
        },
        timestamp
      )

      return cloneRuntime(runtime)
    }).pipe(
      Effect.withSpan("workspace.update_runtime_health", {
        attributes: {
          ...workspaceAttributes(workspaceId),
          "stoneforge.runtime.id": runtimeId,
        },
      })
    )
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

function runtimeHealthOutcome(status: HealthStatus): AuditOutcome {
  if (status === "healthy") {
    return "success"
  }

  return "failure"
}

function runtimeHealthReason(status: HealthStatus): string | undefined {
  if (status === "healthy") {
    return undefined
  }

  return "Runtime health check failed."
}

function workspaceAttributes(workspaceId: WorkspaceId): {
  readonly "stoneforge.workspace.id": WorkspaceId
} {
  return {
    "stoneforge.workspace.id": workspaceId,
  }
}
