import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderPullRequest,
  ProviderPullRequestObservation,
} from "@stoneforge/merge-request"

import { PersistentControlPlane } from "./persistent-control-plane.js"
import { runControlPlaneSmokeFlow } from "./control-plane-smoke-flow.js"
import { SQLiteControlPlaneStore } from "./sqlite-control-plane-store.js"

class ResumeRecordingAdapter implements GitHubMergeRequestAdapter {
  readonly observedProviderPullRequestIds: string[] = []
  readonly policyCheckProviderHeadShas: string[] = []

  constructor(
    private readonly checks: ProviderPullRequestObservation["checks"] = [
      {
        providerCheckId: "provider-check-1",
        name: "provider quality",
        state: "passed",
      },
    ]
  ) {}

  async createOrUpdateTaskPullRequest(input: {
    sourceBranch: string
    targetBranch: string
  }): Promise<ProviderPullRequest> {
    return {
      provider: "github",
      providerPullRequestId: "provider-pr-900",
      number: 900,
      url: "https://github.test/toolco/stoneforge/pull/900",
      headSha: "created-head-sha",
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    }
  }

  async publishPolicyCheck(input: {
    providerPullRequest: ProviderPullRequest
    state: PolicyCheckState
    reason: string
  }): Promise<void> {
    this.policyCheckProviderHeadShas.push(input.providerPullRequest.headSha)
  }

  async mergePullRequest(): Promise<{ mergedAt: string }> {
    return { mergedAt: "2026-04-24T12:00:00.000Z" }
  }

  async observePullRequest(input: {
    providerPullRequest: ProviderPullRequest
  }): Promise<ProviderPullRequestObservation> {
    this.observedProviderPullRequestIds.push(
      input.providerPullRequest.providerPullRequestId
    )

    return {
      providerPullRequestId: input.providerPullRequest.providerPullRequestId,
      state: "open",
      headSha: "observed-head-sha",
      checks: this.checks,
    }
  }
}

describe("persistent provider resume", () => {
  it("uses persisted provider PR identifiers after recreating the service", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-provider-resume-"))
    const sqlitePath = join(tempDir, "control-plane.sqlite")
    const firstAdapter = new ResumeRecordingAdapter()
    const secondAdapter = new ResumeRecordingAdapter()

    try {
      const first = new PersistentControlPlane(
        new SQLiteControlPlaneStore(sqlitePath),
        {
          mergeRequestAdapter: firstAdapter,
          ...smokeOptions(),
        }
      )

      await prepareOpenMergeRequest(first)

      const resumed = new PersistentControlPlane(
        new SQLiteControlPlaneStore(sqlitePath),
        {
          mergeRequestAdapter: secondAdapter,
          ...smokeOptions(),
        }
      )

      await resumed.observeProviderState()

      expect(secondAdapter.observedProviderPullRequestIds).toEqual([
        "provider-pr-900",
      ])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("uses observed GitHub checks instead of injecting local fake verification", async () => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "stoneforge-provider-verification-")
    )
    const sqlitePath = join(tempDir, "control-plane.sqlite")
    const adapter = new ResumeRecordingAdapter()
    const store = new SQLiteControlPlaneStore(sqlitePath)

    try {
      const summary = await runControlPlaneSmokeFlow(store, {
        mergeProvider: "github",
        mergeEnabled: false,
        mergeRequestAdapter: adapter,
        repository: {
          installationId: "discovered",
          owner: "toolco",
          repository: "stoneforge",
          defaultBranch: "main",
        },
        sourceBranchPrefix: "stoneforge/task",
      })
      const snapshot = await store.load()

      expect(summary.mergeRequestState).toBe("merge_ready")
      expect(snapshot.mergeRequests.verificationRuns).toEqual([
        expect.objectContaining({
          headSha: "observed-head-sha",
          state: "passed",
          providerChecks: [
            expect.objectContaining({
              providerCheckId: "provider-check-1",
              name: "provider quality",
              state: "passed",
            }),
          ],
        }),
      ])
      expect(
        snapshot.mergeRequests.verificationRuns.some((verificationRun) => {
          return verificationRun.providerChecks.some((providerCheck) => {
            return providerCheck.providerCheckId === "local-check-1"
          })
        })
      ).toBe(false)
      expect(adapter.policyCheckProviderHeadShas).toContain("observed-head-sha")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("stops the GitHub-mode smoke flow when no provider check has passed", async () => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "stoneforge-provider-verification-pending-")
    )
    const sqlitePath = join(tempDir, "control-plane.sqlite")

    try {
      await expect(
        runControlPlaneSmokeFlow(new SQLiteControlPlaneStore(sqlitePath), {
          mergeProvider: "github",
          mergeEnabled: false,
          mergeRequestAdapter: new ResumeRecordingAdapter([]),
          repository: {
            installationId: "discovered",
            owner: "toolco",
            repository: "stoneforge",
            defaultBranch: "main",
          },
          sourceBranchPrefix: "stoneforge/task",
        })
      ).rejects.toThrow(
        "No provider check/status was observed for MergeRequest"
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("reports the latest observed provider check when it is not passing", async () => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "stoneforge-provider-verification-failed-")
    )
    const sqlitePath = join(tempDir, "control-plane.sqlite")
    const controlPlane = new PersistentControlPlane(
      new SQLiteControlPlaneStore(sqlitePath),
      {
        mergeRequestAdapter: new ResumeRecordingAdapter([
          {
            providerCheckId: "provider-check-1",
            name: "provider quality",
            state: "running",
          },
        ]),
        ...smokeOptions(),
      }
    )

    try {
      await prepareOpenMergeRequest(controlPlane)
      await controlPlane.observeProviderState()

      await expect(
        controlPlane.requireObservedProviderVerificationPassed()
      ).rejects.toThrow("Latest provider check provider quality is running")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

async function prepareOpenMergeRequest(
  controlPlane: PersistentControlPlane
): Promise<void> {
  await controlPlane.reset()
  await controlPlane.initializeWorkspace()
  await controlPlane.configureRepository()
  await controlPlane.configureRuntime()
  await controlPlane.configureAgent()
  await controlPlane.configureRoleDefinition()
  await controlPlane.configurePolicy()
  await controlPlane.evaluateReadiness()
  await controlPlane.createDirectTask()
  await controlPlane.executeNextDispatch()
  await controlPlane.openMergeRequest()
}

function smokeOptions(): NonNullable<
  ConstructorParameters<typeof PersistentControlPlane>[1]
> {
  return {
    operationInputs: {
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
    },
  }
}
