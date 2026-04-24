import { describe, expect, it } from "vitest";

import { asAgentId, asRoleDefinitionId, asRuntimeId, asWorkspaceId } from "./ids.js";
import {
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
  type Agent,
  type RoleDefinition,
  type Runtime,
} from "./execution-capabilities.js";

describe("execution capability cloning", () => {
  it("copies mutable arrays on capability models", () => {
    const workspaceId = asWorkspaceId("workspace_1");
    const runtime: Runtime = {
      id: asRuntimeId("runtime_1"),
      workspaceId,
      name: "customer host",
      location: "customer_host",
      mode: "local_worktree",
      healthStatus: "healthy",
      tags: ["host"],
    };
    const agent: Agent = {
      id: asAgentId("agent_1"),
      workspaceId,
      runtimeId: runtime.id,
      name: "codex worker",
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      healthStatus: "healthy",
      tags: ["worker"],
      launcher: "codex-adapter",
    };
    const roleDefinition: RoleDefinition = {
      id: asRoleDefinitionId("role_1"),
      workspaceId,
      name: "implementation worker",
      prompt: "Implement the task.",
      toolAccess: ["git"],
      skillAccess: ["repo"],
      lifecycleHooks: ["checkpoint"],
      tags: ["implementation"],
      enabled: true,
    };

    const runtimeCopy = cloneRuntime(runtime);
    const agentCopy = cloneAgent(agent);
    const roleCopy = cloneRoleDefinition(roleDefinition);

    runtime.tags.push("changed");
    agent.tags.push("changed");
    roleDefinition.toolAccess.push("changed");
    roleDefinition.skillAccess.push("changed");
    roleDefinition.lifecycleHooks.push("changed");
    roleDefinition.tags.push("changed");

    expect(runtimeCopy.tags).toEqual(["host"]);
    expect(agentCopy.tags).toEqual(["worker"]);
    expect(roleCopy.toolAccess).toEqual(["git"]);
    expect(roleCopy.skillAccess).toEqual(["repo"]);
    expect(roleCopy.lifecycleHooks).toEqual(["checkpoint"]);
    expect(roleCopy.tags).toEqual(["implementation"]);
  });
});
