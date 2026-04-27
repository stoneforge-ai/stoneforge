import { asWorkspaceId } from "@stoneforge/core"
import { describe, expect, it } from "vitest"

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  type ControlPlaneStore,
  createEmptyControlPlaneSnapshot,
} from "./control-plane-store.js"
import { PersistentControlPlane } from "./persistent-control-plane.js"

describe("PersistentControlPlane Effect boundary", () => {
  it("reports non-Error summary failures as command failures", async () => {
    const controlPlane = new PersistentControlPlane(
      controlPlaneStore({ load: async () => Promise.reject("not an error") })
    )

    await expect(controlPlane.readSummary()).rejects.toThrow(
      "Control-plane command failed."
    )
  })

  it("preserves explicit persistence failures", async () => {
    const failure = new ControlPlanePersistenceError("store unavailable")
    const controlPlane = new PersistentControlPlane(
      controlPlaneStore({ reset: async () => Promise.reject(failure) })
    )

    await expect(controlPlane.reset()).rejects.toThrow(failure.message)
  })

  it("adds command context to unexpected persistence failures", async () => {
    const snapshot = createEmptyControlPlaneSnapshot()

    await expect(
      new PersistentControlPlane(
        controlPlaneStore({
          load: async () => Promise.reject(new Error("disk")),
        })
      ).initializeWorkspace()
    ).rejects.toThrow("Could not load control-plane store. disk")
    await expect(
      new PersistentControlPlane(
        controlPlaneStore({
          load: async () => snapshot,
          save: async () => Promise.reject(new Error("")),
        }),
        { operationInputs: testOperationInputs() }
      ).initializeWorkspace()
    ).rejects.toThrow("Could not save control-plane store.")
    await expect(
      new PersistentControlPlane(
        controlPlaneStore({ reset: async () => Promise.reject("not an error") })
      ).reset()
    ).rejects.toThrow("Could not reset control-plane store.")
  })

  it("reports load-time control-plane assembly failures before mutation", async () => {
    const snapshot = createEmptyControlPlaneSnapshot()
    snapshot.current.workspaceId = asWorkspaceId("workspace_missing")
    const store = controlPlaneStore({ load: async () => snapshot })
    const controlPlane = new PersistentControlPlane(store)

    await expect(controlPlane.configureRepository()).rejects.toThrow(
      "Workspace workspace_missing does not exist."
    )
  })
})

function controlPlaneStore(
  overrides: Partial<ControlPlaneStore> = {}
): ControlPlaneStore {
  const snapshot = createEmptyControlPlaneSnapshot()

  return {
    load: async (): Promise<ControlPlaneSnapshot> => snapshot,
    save: async (): Promise<void> => {},
    reset: async (): Promise<void> => {},
    ...overrides,
  }
}

function testOperationInputs(): NonNullable<
  ConstructorParameters<typeof PersistentControlPlane>[1]
>["operationInputs"] {
  return {
    workspace: {
      orgName: "Toolco",
      workspaceName: "stoneforge",
      targetBranch: "main",
    },
    repository: {
      installationId: "github-installation-local",
      owner: "toolco",
      repository: "stoneforge",
      defaultBranch: "main",
    },
    runtime: {
      name: "local-worktree-runtime",
      location: "customer_host",
      mode: "local_worktree",
      tags: ["local"],
    },
    agent: {
      name: "local-codex-agent",
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      launcher: "fake-local-agent-adapter",
      tags: ["local"],
    },
    roleDefinition: {
      name: "direct-task-worker",
      category: "worker",
      prompt: "Implement or review assigned control-plane work.",
      toolAccess: ["git", "shell"],
      tags: ["local"],
    },
    policyPreset: "supervised",
    task: {
      title: "Control-plane direct task smoke flow",
      intent: "Prove the durable control-plane command boundary and state.",
      acceptanceCriteria: [
        "The task dispatches, opens a MergeRequest, records gates, and merges.",
      ],
      priority: "normal",
      requiresMergeRequest: true,
      requiredAgentTags: ["local"],
      requiredRuntimeTags: ["local"],
    },
    localVerificationCheck: {
      providerCheckId: "local-check-1",
      name: "local quality",
    },
    review: {
      agentApprovalReason:
        "Local review approved the deterministic scenario change.",
      humanReviewerId: "user_approver",
      humanApprovalReason: "Human reviewer approved the MergeRequest.",
    },
  }
}
