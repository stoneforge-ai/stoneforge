import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderPullRequest,
  ProviderPullRequestObservation,
} from "@stoneforge/merge-request";

import { PersistentControlPlane } from "./persistent-control-plane.js";
import { runPersistentTracerBullet } from "./persistent-tracer-bullet.js";
import { SQLiteControlPlaneStore } from "./sqlite-control-plane-store.js";

class ResumeRecordingAdapter implements GitHubMergeRequestAdapter {
  readonly observedProviderPullRequestIds: string[] = [];
  readonly policyCheckProviderHeadShas: string[] = [];

  constructor(
    private readonly checks: ProviderPullRequestObservation["checks"] = [
      {
        providerCheckId: "provider-check-1",
        name: "provider quality",
        state: "passed",
      },
    ],
  ) {}

  async createOrUpdateTaskPullRequest(input: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ProviderPullRequest> {
    return {
      provider: "github",
      providerPullRequestId: "provider-pr-900",
      number: 900,
      url: "https://github.test/toolco/stoneforge/pull/900",
      headSha: "created-head-sha",
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    };
  }

  async publishPolicyCheck(input: {
    providerPullRequest: ProviderPullRequest;
    state: PolicyCheckState;
    reason: string;
  }): Promise<void> {
    this.policyCheckProviderHeadShas.push(input.providerPullRequest.headSha);
  }

  async mergePullRequest(): Promise<{ mergedAt: string }> {
    return { mergedAt: "2026-04-24T12:00:00.000Z" };
  }

  async observePullRequest(input: {
    providerPullRequest: ProviderPullRequest;
  }): Promise<ProviderPullRequestObservation> {
    this.observedProviderPullRequestIds.push(
      input.providerPullRequest.providerPullRequestId,
    );

    return {
      providerPullRequestId: input.providerPullRequest.providerPullRequestId,
      state: "open",
      headSha: "observed-head-sha",
      checks: this.checks,
    };
  }
}

describe("persistent provider resume", () => {
  it("uses persisted provider PR identifiers after recreating the service", async () => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "stoneforge-provider-resume-"),
    );
    const sqlitePath = join(tempDir, "control-plane.sqlite");
    const firstAdapter = new ResumeRecordingAdapter();
    const secondAdapter = new ResumeRecordingAdapter();

    try {
      const first = new PersistentControlPlane(
        new SQLiteControlPlaneStore(sqlitePath),
        {
          mergeRequestAdapter: firstAdapter,
        },
      );

      await prepareOpenMergeRequest(first);

      const resumed = new PersistentControlPlane(
        new SQLiteControlPlaneStore(sqlitePath),
        {
          mergeRequestAdapter: secondAdapter,
        },
      );

      await resumed.observeProviderState();

      expect(secondAdapter.observedProviderPullRequestIds).toEqual([
        "provider-pr-900",
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uses observed GitHub checks instead of injecting local fake CI", async () => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "stoneforge-provider-ci-"),
    );
    const sqlitePath = join(tempDir, "control-plane.sqlite");
    const adapter = new ResumeRecordingAdapter();
    const store = new SQLiteControlPlaneStore(sqlitePath);

    try {
      const summary = await runPersistentTracerBullet(store, {
        mergeProvider: "github",
        mergeEnabled: false,
        mergeRequestAdapter: adapter,
      });
      const snapshot = await store.load();

      expect(summary.mergeRequestState).toBe("merge_ready");
      expect(snapshot.mergeRequests.ciRuns).toEqual([
        expect.objectContaining({
          providerCheckId: "provider-check-1",
          name: "provider quality",
          state: "passed",
        }),
      ]);
      expect(
        snapshot.mergeRequests.ciRuns.some((ciRun) => {
          return ciRun.providerCheckId === "local-check-1";
        }),
      ).toBe(false);
      expect(adapter.policyCheckProviderHeadShas).toContain(
        "observed-head-sha",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("stops the GitHub-mode tracer when no provider check has passed", async () => {
    const tempDir = await mkdtemp(
      join(tmpdir(), "stoneforge-provider-ci-pending-"),
    );
    const sqlitePath = join(tempDir, "control-plane.sqlite");

    try {
      await expect(
        runPersistentTracerBullet(new SQLiteControlPlaneStore(sqlitePath), {
          mergeProvider: "github",
          mergeEnabled: false,
          mergeRequestAdapter: new ResumeRecordingAdapter([]),
        }),
      ).rejects.toThrow(
        "No provider check/status was observed for MergeRequest",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function prepareOpenMergeRequest(
  controlPlane: PersistentControlPlane,
): Promise<void> {
  await controlPlane.reset();
  await controlPlane.initializeWorkspace();
  await controlPlane.configureRepository();
  await controlPlane.configureRuntime();
  await controlPlane.configureAgent();
  await controlPlane.configureRole();
  await controlPlane.configurePolicy();
  await controlPlane.validateWorkspace();
  await controlPlane.createDirectTask();
  await controlPlane.runWorker();
  await controlPlane.openMergeRequest();
}
