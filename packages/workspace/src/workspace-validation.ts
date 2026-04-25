import type {
  Workspace,
  WorkspaceExecutionPath,
  WorkspaceState,
  WorkspaceValidationIssue,
  WorkspaceValidationResult,
} from "./models.js";

export function computeConfiguredState(workspace: Workspace): WorkspaceState {
  if (workspace.state === "archived") {
    return "archived";
  }

  if (workspace.repository?.connectionStatus !== "connected") {
    return "draft";
  }

  if (hasExecutionConfiguration(workspace)) {
    return "execution_configured";
  }

  return "repo_connected";
}

export function computeValidatedState(
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

  return computeConfiguredState(workspace);
}

export function buildValidationResult(
  workspace: Workspace,
  validatedAt: string,
): WorkspaceValidationResult {
  const issues = collectValidationIssues(workspace);
  const selectedExecutionPath = selectExecutionPath(workspace);

  return {
    repoConnected: workspace.repository?.connectionStatus === "connected",
    policyConfigured: workspace.policyPreset !== undefined,
    executionConfigured: hasExecutionConfiguration(workspace),
    ready: issues.length === 0,
    issues,
    selectedExecutionPath: selectedExecutionPath ?? undefined,
    validatedAt,
  };
}

function collectValidationIssues(workspace: Workspace): WorkspaceValidationIssue[] {
  return [
    repoIssue(workspace),
    policyIssue(workspace),
    runtimeIssue(workspace),
    agentIssue(workspace),
    roleDefinitionIssue(workspace),
    executionPathIssue(workspace),
  ].filter((issue): issue is WorkspaceValidationIssue => issue !== null);
}

function repoIssue(workspace: Workspace): WorkspaceValidationIssue | null {
  if (workspace.repository?.connectionStatus === "connected") {
    return null;
  }

  return {
    code: "repo_not_connected",
    message:
      "Workspace readiness requires one GitHub App-linked repository with live connectivity.",
  };
}

function policyIssue(workspace: Workspace): WorkspaceValidationIssue | null {
  if (workspace.policyPreset !== undefined) {
    return null;
  }

  return {
    code: "policy_not_configured",
    message: "Workspace readiness requires a policy preset.",
  };
}

function runtimeIssue(workspace: Workspace): WorkspaceValidationIssue | null {
  if (workspace.runtimes.length > 0) {
    return null;
  }

  return {
    code: "runtime_not_configured",
    message: "Workspace readiness requires at least one Runtime.",
  };
}

function agentIssue(workspace: Workspace): WorkspaceValidationIssue | null {
  if (workspace.agents.length > 0) {
    return null;
  }

  return {
    code: "agent_not_configured",
    message: "Workspace readiness requires at least one Agent.",
  };
}

function roleDefinitionIssue(
  workspace: Workspace,
): WorkspaceValidationIssue | null {
  if (workspace.roleDefinitions.length > 0) {
    return null;
  }

  return {
    code: "role_definition_not_configured",
    message: "Workspace readiness requires at least one RoleDefinition.",
  };
}

function executionPathIssue(
  workspace: Workspace,
): WorkspaceValidationIssue | null {
  if (selectExecutionPath(workspace)) {
    return null;
  }

  return {
    code: "no_valid_execution_path",
    message:
      "Workspace readiness requires one healthy Runtime/Agent/RoleDefinition path.",
  };
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
    const runtime = workspace.runtimes.find((candidateRuntime) => {
      return candidateRuntime.id === agent.runtimeId;
    });

    if (isHealthyExecutionPath(agent, runtime)) {
      return {
        runtimeId: runtime.id,
        agentId: agent.id,
        roleDefinitionId: enabledRole.id,
      };
    }
  }

  return null;
}

function isHealthyExecutionPath(
  agent: Workspace["agents"][number],
  runtime: Workspace["runtimes"][number] | undefined,
): runtime is Workspace["runtimes"][number] {
  return (
    runtime !== undefined &&
    agent.healthStatus === "healthy" &&
    agent.concurrencyLimit >= 1 &&
    runtime.healthStatus === "healthy"
  );
}
