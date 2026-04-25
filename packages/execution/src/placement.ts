import type {
  Agent,
  RoleDefinition,
  RoleDefinitionId,
  Runtime,
} from "@stoneforge/core";

import type {
  DispatchIntent,
  PlacementFailureReason,
  WorkspaceExecutionCapabilities,
} from "./models.js";

export interface Placement {
  agent: Agent;
  runtime: Runtime;
  roleDefinition: RoleDefinition;
}

export type PlacementResult = Placement | { reason: PlacementFailureReason };

export function resolvePlacement(
  capabilities: WorkspaceExecutionCapabilities,
  intent: DispatchIntent,
  activeLeaseCount: (agent: Agent) => number,
): PlacementResult {
  const roleDefinition = selectRoleDefinition(
    capabilities.roleDefinitions,
    intent.roleDefinitionId,
  );

  if (!roleDefinition) {
    return { reason: "no_eligible_agent" };
  }

  const agentResult = selectAvailableAgent(
    eligibleAgentsForIntent(capabilities, intent),
    activeLeaseCount,
  );

  if ("reason" in agentResult) {
    return agentResult;
  }

  const runtime = requireRuntimeForAgent(capabilities.runtimes, agentResult);

  return {
    agent: agentResult,
    runtime,
    roleDefinition,
  };
}

function eligibleAgentsForIntent(
  capabilities: WorkspaceExecutionCapabilities,
  intent: DispatchIntent,
): Agent[] {
  return capabilities.agents.filter((agent) => {
    return isAgentEligible(capabilities.runtimes, intent, agent);
  });
}

function selectAvailableAgent(
  eligibleAgents: Agent[],
  activeLeaseCount: (agent: Agent) => number,
): Agent | { reason: PlacementFailureReason } {
  if (eligibleAgents.length === 0) {
    return { reason: "no_eligible_agent" };
  }

  const agent = eligibleAgents.find((candidateAgent) => {
    return activeLeaseCount(candidateAgent) < candidateAgent.concurrencyLimit;
  });

  if (!agent) {
    return { reason: "capacity_exhausted" };
  }

  return agent;
}

function selectRoleDefinition(
  roleDefinitions: RoleDefinition[],
  roleDefinitionId: RoleDefinitionId | undefined,
): RoleDefinition | null {
  if (roleDefinitionId) {
    return (
      roleDefinitions.find((roleDefinition) => {
        return roleDefinition.id === roleDefinitionId && roleDefinition.enabled;
      }) ?? null
    );
  }

  return (
    roleDefinitions.find((roleDefinition) => roleDefinition.enabled) ?? null
  );
}

function isAgentEligible(
  runtimes: Runtime[],
  intent: DispatchIntent,
  agent: Agent,
): boolean {
  if (agent.healthStatus !== "healthy") {
    return false;
  }

  if (!hasAllTags(agent.tags, intent.requiredAgentTags)) {
    return false;
  }

  return isRuntimeEligible(runtimeForAgent(runtimes, agent), intent);
}

function runtimeForAgent(
  runtimes: Runtime[],
  agent: Agent,
): Runtime | undefined {
  return runtimes.find((candidateRuntime) => {
    return candidateRuntime.id === agent.runtimeId;
  });
}

function requireRuntimeForAgent(runtimes: Runtime[], agent: Agent): Runtime {
  const runtime = runtimeForAgent(runtimes, agent);

  if (!runtime) {
    throw new Error(`Runtime ${agent.runtimeId} does not exist for Agent ${agent.id}.`);
  }

  return runtime;
}

function isRuntimeEligible(
  runtime: Runtime | undefined,
  intent: DispatchIntent,
): boolean {
  if (!runtime) {
    return false;
  }

  if (runtime.healthStatus !== "healthy") {
    return false;
  }

  return hasAllTags(runtime.tags, intent.requiredRuntimeTags);
}

function hasAllTags(candidateTags: string[], requiredTags: string[]): boolean {
  return requiredTags.every((requiredTag) => candidateTags.includes(requiredTag));
}
