import {
  asAgentId,
  asAuditEventId,
  asOrgId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
} from "./ids.js";
import type {
  Agent,
  AuditActor,
  AuditEvent,
  ConnectGitHubRepositoryInput,
  CreateOrgInput,
  CreateWorkspaceInput,
  GitHubRepositoryLink,
  HealthStatus,
  Org,
  PolicyPreset,
  RegisterAgentInput,
  RegisterRoleDefinitionInput,
  RegisterRuntimeInput,
  RoleDefinition,
  Runtime,
  Workspace,
  WorkspaceExecutionPath,
  WorkspaceState,
  WorkspaceValidationIssue,
  WorkspaceValidationResult,
} from "./models.js";
import type { OrgId, RuntimeId, WorkspaceId } from "./ids.js";

type CounterName =
  | "org"
  | "workspace"
  | "runtime"
  | "agent"
  | "roleDefinition"
  | "audit";

/**
 * In-memory application service for the Slice 1 workspace onboarding path.
 * It exists to exercise the `draft -> ready` setup lifecycle before an API,
 * storage layer, or UI surface is frozen.
 */
export class WorkspaceSetupService {
  private readonly orgs = new Map<OrgId, Org>();
  private readonly workspaces = new Map<WorkspaceId, Workspace>();
  private readonly auditEvents: AuditEvent[] = [];
  private readonly counters: Record<CounterName, number> = {
    org: 0,
    workspace: 0,
    runtime: 0,
    agent: 0,
    roleDefinition: 0,
    audit: 0,
  };

  createOrg(input: CreateOrgInput): Org {
    const now = this.now();
    const org: Org = {
      id: asOrgId(this.nextId("org")),
      name: input.name,
      createdAt: now,
    };

    this.orgs.set(org.id, org);

    return cloneOrg(org);
  }

  createWorkspace(
    orgId: OrgId,
    input: CreateWorkspaceInput,
    actor: AuditActor,
  ): Workspace {
    const org = this.orgs.get(orgId);

    if (!org) {
      throw new Error(`Org ${orgId} does not exist.`);
    }

    const now = this.now();
    const workspace: Workspace = {
      id: asWorkspaceId(this.nextId("workspace")),
      orgId,
      name: input.name,
      targetBranch: input.targetBranch,
      state: "draft",
      runtimes: [],
      agents: [],
      roleDefinitions: [],
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspace.id, workspace);
    this.appendAuditEvent({
      actor,
      action: "workspace.created",
      orgId,
      workspaceId: workspace.id,
      targetId: workspace.id,
      targetType: "workspace",
      outcome: "success",
    });

    return cloneWorkspace(workspace);
  }

  connectGitHubRepository(
    workspaceId: WorkspaceId,
    input: ConnectGitHubRepositoryInput,
    actor: AuditActor,
  ): Workspace {
    const workspace = this.requireWorkspace(workspaceId);

    if (
      workspace.repository &&
      (workspace.repository.owner !== input.owner ||
        workspace.repository.repository !== input.repository)
    ) {
      throw new Error(
        `Workspace ${workspaceId} is already linked to ${workspace.repository.owner}/${workspace.repository.repository}.`,
      );
    }

    const now = this.now();
    const repository: GitHubRepositoryLink = {
      installationId: input.installationId,
      owner: input.owner,
      repository: input.repository,
      defaultBranch: input.defaultBranch,
      connectionStatus: input.connectionStatus ?? "connected",
      connectedAt: now,
    };

    workspace.repository = repository;
    workspace.updatedAt = now;
    workspace.state = this.computeConfiguredState(workspace);

    this.appendAuditEvent({
      actor,
      action: "workspace.github_repository_connected",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: `${repository.owner}/${repository.repository}`,
      targetType: "repository",
      outcome: repository.connectionStatus === "connected" ? "success" : "failure",
      reason:
        repository.connectionStatus === "connected"
          ? undefined
          : "Repository link was saved without a live connection.",
      policyPreset: workspace.policyPreset,
    });

    return cloneWorkspace(workspace);
  }

  selectPolicyPreset(
    workspaceId: WorkspaceId,
    preset: PolicyPreset,
    actor: AuditActor,
  ): Workspace {
    const workspace = this.requireWorkspace(workspaceId);

    workspace.policyPreset = preset;
    workspace.updatedAt = this.now();
    workspace.state = this.computeConfiguredState(workspace);

    this.appendAuditEvent({
      actor,
      action: "workspace.policy_preset_selected",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: workspace.id,
      targetType: "policy",
      outcome: "success",
      policyPreset: preset,
    });

    return cloneWorkspace(workspace);
  }

  registerRuntime(
    workspaceId: WorkspaceId,
    input: RegisterRuntimeInput,
    actor: AuditActor,
  ): Runtime {
    const workspace = this.requireWorkspace(workspaceId);

    const runtime: Runtime = {
      id: asRuntimeId(this.nextId("runtime")),
      workspaceId,
      name: input.name,
      location: input.location,
      mode: input.mode,
      healthStatus: input.healthStatus ?? "healthy",
      tags: [...(input.tags ?? [])],
      hostId: input.hostId,
      managedProvider: input.managedProvider,
    };

    workspace.runtimes.push(runtime);
    workspace.updatedAt = this.now();
    workspace.state = this.computeConfiguredState(workspace);

    this.appendAuditEvent({
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
    const workspace = this.requireWorkspace(workspaceId);
    const runtime = workspace.runtimes.find(
      (existingRuntime) => existingRuntime.id === input.runtimeId,
    );

    if (!runtime) {
      throw new Error(
        `Runtime ${input.runtimeId} does not exist in workspace ${workspaceId}.`,
      );
    }

    if (input.concurrencyLimit < 1) {
      throw new Error("Agent concurrencyLimit must be at least 1.");
    }

    const agent: Agent = {
      id: asAgentId(this.nextId("agent")),
      workspaceId,
      runtimeId: input.runtimeId,
      name: input.name,
      harness: input.harness,
      model: input.model,
      concurrencyLimit: input.concurrencyLimit,
      healthStatus: input.healthStatus ?? "healthy",
      tags: [...(input.tags ?? [])],
      launcher: input.launcher,
    };

    workspace.agents.push(agent);
    workspace.updatedAt = this.now();
    workspace.state = this.computeConfiguredState(workspace);

    this.appendAuditEvent({
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
    const workspace = this.requireWorkspace(workspaceId);

    const roleDefinition: RoleDefinition = {
      id: asRoleDefinitionId(this.nextId("roleDefinition")),
      workspaceId,
      name: input.name,
      prompt: input.prompt,
      toolAccess: [...(input.toolAccess ?? [])],
      skillAccess: [...(input.skillAccess ?? [])],
      lifecycleHooks: [...(input.lifecycleHooks ?? [])],
      tags: [...(input.tags ?? [])],
      enabled: input.enabled ?? true,
    };

    workspace.roleDefinitions.push(roleDefinition);
    workspace.updatedAt = this.now();
    workspace.state = this.computeConfiguredState(workspace);

    this.appendAuditEvent({
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

  recordGitHubRepositoryConnectionStatus(
    workspaceId: WorkspaceId,
    status: "connected" | "disconnected",
    actor: AuditActor,
  ): Workspace {
    const workspace = this.requireWorkspace(workspaceId);

    if (!workspace.repository) {
      throw new Error(`Workspace ${workspaceId} is not linked to a repository.`);
    }

    workspace.repository = {
      ...workspace.repository,
      connectionStatus: status,
    };
    workspace.updatedAt = this.now();

    this.appendAuditEvent({
      actor,
      action: "workspace.github_repository_connection_updated",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: `${workspace.repository.owner}/${workspace.repository.repository}`,
      targetType: "repository",
      outcome: status === "connected" ? "success" : "failure",
      reason:
        status === "connected"
          ? undefined
          : "Repository connectivity check failed.",
      policyPreset: workspace.policyPreset,
    });

    return cloneWorkspace(workspace);
  }

  updateRuntimeHealthStatus(
    workspaceId: WorkspaceId,
    runtimeId: RuntimeId,
    status: HealthStatus,
    actor: AuditActor,
  ): Runtime {
    const workspace = this.requireWorkspace(workspaceId);
    const runtime = workspace.runtimes.find(
      (existingRuntime) => existingRuntime.id === runtimeId,
    );

    if (!runtime) {
      throw new Error(
        `Runtime ${runtimeId} does not exist in workspace ${workspaceId}.`,
      );
    }

    runtime.healthStatus = status;
    workspace.updatedAt = this.now();

    this.appendAuditEvent({
      actor,
      action: "workspace.runtime_health_updated",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: runtime.id,
      targetType: "runtime",
      outcome: status === "healthy" ? "success" : "failure",
      reason:
        status === "healthy" ? undefined : "Runtime health check failed.",
      policyPreset: workspace.policyPreset,
    });

    return cloneRuntime(runtime);
  }

  validateWorkspace(
    workspaceId: WorkspaceId,
    actor: AuditActor,
  ): WorkspaceValidationResult {
    const workspace = this.requireWorkspace(workspaceId);
    const validation = this.buildValidationResult(workspace);

    workspace.validation = validation;
    workspace.updatedAt = validation.validatedAt;
    workspace.state = this.computeValidatedState(workspace, validation);

    this.appendAuditEvent({
      actor,
      action: "workspace.validated",
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      targetId: workspace.id,
      targetType: "workspace",
      outcome: validation.ready ? "success" : "failure",
      reason: validation.ready
        ? undefined
        : validation.issues.map((issue) => issue.code).join(", "),
      policyPreset: workspace.policyPreset,
    });

    return cloneValidationResult(validation);
  }

  getWorkspace(workspaceId: WorkspaceId): Workspace {
    return cloneWorkspace(this.requireWorkspace(workspaceId));
  }

  listAuditEventsForWorkspace(workspaceId: WorkspaceId): AuditEvent[] {
    return this.auditEvents
      .filter((event) => event.workspaceId === workspaceId)
      .map(cloneAuditEvent);
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} does not exist.`);
    }

    return workspace;
  }

  private computeConfiguredState(workspace: Workspace): WorkspaceState {
    if (workspace.state === "archived") {
      return "archived";
    }

    const repoConnected =
      workspace.repository?.connectionStatus === "connected";

    if (!repoConnected) {
      return "draft";
    }

    if (hasExecutionConfiguration(workspace)) {
      return "execution_configured";
    }

    return "repo_connected";
  }

  private computeValidatedState(
    workspace: Workspace,
    validation: WorkspaceValidationResult,
  ): WorkspaceState {
    if (workspace.state === "archived") {
      return "archived";
    }

    if (validation.ready) {
      return "ready";
    }

    if (workspace.state === "ready") {
      return "degraded";
    }

    return this.computeConfiguredState(workspace);
  }

  private buildValidationResult(
    workspace: Workspace,
  ): WorkspaceValidationResult {
    const issues: WorkspaceValidationIssue[] = [];

    const repoConnected = workspace.repository?.connectionStatus === "connected";
    if (!repoConnected) {
      issues.push({
        code: "repo_not_connected",
        message:
          "Workspace readiness requires one GitHub App-linked repository with live connectivity.",
      });
    }

    const policyConfigured = workspace.policyPreset !== undefined;
    if (!policyConfigured) {
      issues.push({
        code: "policy_not_configured",
        message: "Workspace readiness requires a policy preset.",
      });
    }

    if (workspace.runtimes.length === 0) {
      issues.push({
        code: "runtime_not_configured",
        message: "Workspace readiness requires at least one Runtime.",
      });
    }

    if (workspace.agents.length === 0) {
      issues.push({
        code: "agent_not_configured",
        message: "Workspace readiness requires at least one Agent.",
      });
    }

    if (workspace.roleDefinitions.length === 0) {
      issues.push({
        code: "role_definition_not_configured",
        message: "Workspace readiness requires at least one RoleDefinition.",
      });
    }

    const selectedExecutionPath = selectExecutionPath(workspace);
    if (!selectedExecutionPath) {
      issues.push({
        code: "no_valid_execution_path",
        message:
          "Workspace readiness requires one healthy Runtime/Agent/RoleDefinition path.",
      });
    }

    return {
      repoConnected,
      policyConfigured,
      executionConfigured: hasExecutionConfiguration(workspace),
      ready: issues.length === 0,
      issues,
      selectedExecutionPath: selectedExecutionPath ?? undefined,
      validatedAt: this.now(),
    };
  }

  private appendAuditEvent(
    input: Omit<AuditEvent, "id" | "timestamp">,
  ): void {
    const event: AuditEvent = {
      ...input,
      id: asAuditEventId(this.nextId("audit")),
      timestamp: this.now(),
    };

    this.auditEvents.push(event);
  }

  private nextId(counterName: CounterName): string {
    this.counters[counterName] += 1;
    return `${counterName}_${this.counters[counterName]}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}

function hasExecutionConfiguration(workspace: Workspace): boolean {
  return (
    workspace.policyPreset !== undefined &&
    workspace.runtimes.length > 0 &&
    workspace.agents.length > 0 &&
    workspace.roleDefinitions.length > 0
  );
}

function selectExecutionPath(
  workspace: Workspace,
): WorkspaceExecutionPath | null {
  const enabledRole = workspace.roleDefinitions.find((roleDefinition) => {
    return roleDefinition.enabled;
  });

  if (!enabledRole) {
    return null;
  }

  for (const agent of workspace.agents) {
    const runtime = workspace.runtimes.find(
      (candidateRuntime) => candidateRuntime.id === agent.runtimeId,
    );

    if (!runtime) {
      continue;
    }

    if (agent.healthStatus !== "healthy") {
      continue;
    }

    if (agent.concurrencyLimit < 1) {
      continue;
    }

    if (runtime.healthStatus !== "healthy") {
      continue;
    }

    return {
      runtimeId: runtime.id,
      agentId: agent.id,
      roleDefinitionId: enabledRole.id,
    };
  }

  return null;
}

function cloneOrg(org: Org): Org {
  return {
    ...org,
  };
}

function cloneWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    repository: workspace.repository
      ? cloneRepositoryLink(workspace.repository)
      : undefined,
    runtimes: workspace.runtimes.map(cloneRuntime),
    agents: workspace.agents.map(cloneAgent),
    roleDefinitions: workspace.roleDefinitions.map(cloneRoleDefinition),
    validation: workspace.validation
      ? cloneValidationResult(workspace.validation)
      : undefined,
  };
}

function cloneRepositoryLink(
  repository: GitHubRepositoryLink,
): GitHubRepositoryLink {
  return {
    ...repository,
  };
}

function cloneRuntime(runtime: Runtime): Runtime {
  return {
    ...runtime,
    tags: [...runtime.tags],
  };
}

function cloneAgent(agent: Agent): Agent {
  return {
    ...agent,
    tags: [...agent.tags],
  };
}

function cloneRoleDefinition(roleDefinition: RoleDefinition): RoleDefinition {
  return {
    ...roleDefinition,
    toolAccess: [...roleDefinition.toolAccess],
    skillAccess: [...roleDefinition.skillAccess],
    lifecycleHooks: [...roleDefinition.lifecycleHooks],
    tags: [...roleDefinition.tags],
  };
}

function cloneValidationResult(
  validation: WorkspaceValidationResult,
): WorkspaceValidationResult {
  return {
    ...validation,
    issues: validation.issues.map((issue) => ({ ...issue })),
    selectedExecutionPath: validation.selectedExecutionPath
      ? { ...validation.selectedExecutionPath }
      : undefined,
  };
}

function cloneAuditEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    actor: {
      ...event.actor,
    },
  };
}
