import type { ConnectGitHubRepositoryInput } from "@stoneforge/workspace"

import type { ControlPlaneOperationInputs } from "./control-plane-operation-inputs.js"

const fakeRepository: ConnectGitHubRepositoryInput = {
  installationId: "github-installation-local",
  owner: "toolco",
  repository: "stoneforge",
  defaultBranch: "main",
}

export function localSmokeOperationInputs(
  repository: ConnectGitHubRepositoryInput = fakeRepository
): ControlPlaneOperationInputs {
  return {
    workspace: {
      orgName: "Toolco",
      workspaceName: "stoneforge",
      targetBranch: repository.defaultBranch,
    },
    repository,
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
