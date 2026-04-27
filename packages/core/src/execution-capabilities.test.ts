import { describe, expect, expectTypeOf, it } from "vitest"

import {
  asAgentId,
  asRoleDefinitionId,
  asRuntimeId,
  asWorkspaceId,
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
  type CustomerHostRuntime,
  type ManagedRuntime,
  type Runtime,
} from "./index.js"

describe("runtime capability types", () => {
  it("correlates runtime location with valid execution modes", () => {
    expectTypeOf<
      Extract<Runtime, { location: "customer_host" }>
    >().toEqualTypeOf<CustomerHostRuntime>()
    expectTypeOf<
      Extract<Runtime, { location: "managed" }>
    >().toEqualTypeOf<ManagedRuntime>()

    const managed: Runtime = {
      id: asRuntimeId("runtime_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      name: "managed sandbox",
      location: "managed",
      mode: "managed_sandbox",
      healthStatus: "healthy",
      tags: [],
      managedProvider: "daytona",
    }

    expectTypeOf(managed.mode).toEqualTypeOf<"managed_sandbox">()
  })

  it("rejects unsupported location and mode combinations", () => {
    const invalidManagedRuntime = {
      id: asRuntimeId("runtime_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      name: "managed sandbox",
      location: "managed",
      mode: "local_worktree",
      healthStatus: "healthy",
      tags: [],
      managedProvider: "daytona",
    }

    // @ts-expect-error Managed runtimes must use the managed sandbox mode.
    const runtime: Runtime = invalidManagedRuntime
    expectTypeOf(runtime).toEqualTypeOf<Runtime>()
  })

  it("clones mutable capability collections", () => {
    const runtime = cloneRuntime({
      id: asRuntimeId("runtime_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      name: "local host",
      location: "customer_host",
      mode: "local_worktree",
      healthStatus: "healthy",
      tags: ["default"],
    })
    const agent = cloneAgent({
      id: asAgentId("agent_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      runtimeId: asRuntimeId("runtime_1"),
      name: "codex worker",
      harness: "openai-codex",
      model: "gpt-5.3-codex",
      concurrencyLimit: 1,
      healthStatus: "healthy",
      tags: ["default"],
      launcher: "codex",
    })
    const roleDefinition = cloneRoleDefinition({
      id: asRoleDefinitionId("role_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      name: "Implementer",
      category: "worker",
      prompt: "Implement the task.",
      toolAccess: ["shell"],
      skillAccess: ["type-driven-apis"],
      lifecycleHooks: ["quality"],
      tags: ["default"],
      enabled: true,
    })

    expect(runtime.tags).toEqual(["default"])
    expect(agent.tags).toEqual(["default"])
    expect(roleDefinition.toolAccess).toEqual(["shell"])
    expect(roleDefinition.skillAccess).toEqual(["type-driven-apis"])
    expect(roleDefinition.lifecycleHooks).toEqual(["quality"])
    expect(roleDefinition.tags).toEqual(["default"])
  })
})
