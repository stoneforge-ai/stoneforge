import { describe, expect, it } from "vitest";

import type {
  AgentAdapter,
  AgentAdapterResumeContext,
  AgentAdapterStartContext,
  Checkpoint,
  Session,
} from "@stoneforge/execution";
import { TaskDispatchService } from "@stoneforge/execution";
import {
  WorkspaceSetupService,
  type Agent,
  type AuditActor,
  type Workspace,
} from "@stoneforge/workspace";

import { MergeRequestService } from "./merge-request-service.js";
import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderPullRequestObservation,
  ProviderPullRequest,
} from "./models.js";

const operator: AuditActor = {
  kind: "human",
  id: "user_1",
  displayName: "Platform Lead",
};

const scheduler: AuditActor = {
  kind: "service",
  id: "scheduler_1",
  displayName: "Stoneforge Scheduler",
};

class RecordingAgentAdapter implements AgentAdapter {
  readonly starts: AgentAdapterStartContext[] = [];
  readonly resumes: AgentAdapterResumeContext[] = [];
  readonly canceledSessions: Session[] = [];

  async start(
    context: AgentAdapterStartContext,
  ): Promise<{ providerSessionId: string }> {
    this.starts.push(context);

    return {
      providerSessionId: `provider_start_${this.starts.length}`,
    };
  }

  async resume(
    context: AgentAdapterResumeContext,
  ): Promise<{ providerSessionId: string }> {
    this.resumes.push(context);

    return {
      providerSessionId: `provider_resume_${this.resumes.length}`,
    };
  }

  async cancel(session: Session): Promise<void> {
    this.canceledSessions.push(session);
  }
}

class RecordingGitHubAdapter implements GitHubMergeRequestAdapter {
  readonly pullRequestCalls: Array<{
    title: string;
    sourceBranch: string;
    targetBranch: string;
  }> = [];
  readonly policyChecks: Array<{
    state: PolicyCheckState;
    reason: string;
  }> = [];
  readonly merges: string[] = [];
  observation: ProviderPullRequestObservation = {
    providerPullRequestId: "github_pr_1",
    state: "open",
    headSha: "provider-head-sha",
    checks: [],
  };

  async createOrUpdateTaskPullRequest(input: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ProviderPullRequest> {
    this.pullRequestCalls.push({
      title: input.title,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    });

    return {
      provider: "github",
      providerPullRequestId: "github_pr_1",
      number: 42,
      url: "https://github.example/pull/42",
      headSha: "provider-head-sha",
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    };
  }

  async publishPolicyCheck(input: {
    state: PolicyCheckState;
    reason: string;
  }): Promise<void> {
    this.policyChecks.push({
      state: input.state,
      reason: input.reason,
    });
  }

  async mergePullRequest(): Promise<{ mergedAt: string }> {
    this.merges.push("github_pr_1");

    return {
      mergedAt: new Date().toISOString(),
    };
  }

  async observePullRequest(): Promise<ProviderPullRequestObservation> {
    return this.observation;
  }
}

describe("MergeRequestService", () => {
  it("opens and updates a task MergeRequest from a completed code-changing Assignment", async () => {
    const { execution, gitHub, mergeRequests } =
      await createCompletedTaskFlow();
    const assignment = execution.listAssignments()[0];

    const firstOpen = await mergeRequests.openOrUpdateTaskMergeRequest({
      taskAssignmentId: assignment.id,
    });
    const secondOpen = await mergeRequests.openOrUpdateTaskMergeRequest({
      taskAssignmentId: assignment.id,
    });

    expect(firstOpen.id).toBe(secondOpen.id);
    expect(firstOpen.state).toBe("open");
    expect(gitHub.pullRequestCalls).toHaveLength(2);
    expect(execution.getTask(firstOpen.sourceOwner.taskId).state).toBe(
      "awaiting_review",
    );
  });

  it("aggregates provider checks into one Verification Run per head SHA", async () => {
    const { mergeRequests, mergeRequest } = await createOpenMergeRequestFlow();

    const queued = await mergeRequests.recordProviderCheck(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "queued",
    });
    const stillQueued = await mergeRequests.recordProviderCheck(
      mergeRequest.id,
      {
        providerCheckId: "check_2",
        name: "lint",
        state: "passed",
      },
    );
    const passed = await mergeRequests.recordProviderCheck(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "passed",
    });

    expect(queued.id).toBe(stillQueued.id);
    expect(queued.id).toBe(passed.id);
    expect(stillQueued.state).toBe("queued");
    expect(passed.state).toBe("passed");
    expect(mergeRequests.listVerificationRuns()).toEqual([
      expect.objectContaining({
        headSha: mergeRequest.providerPullRequest.headSha,
        state: "passed",
        providerChecks: [
          expect.objectContaining({
            providerCheckId: "check_1",
            state: "passed",
          }),
          expect.objectContaining({
            providerCheckId: "check_2",
            state: "passed",
          }),
        ],
      }),
    ]);
  });

  it("observes provider pull request checks as Verification Runs", async () => {
    const { gitHub, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();

    gitHub.observation = {
      providerPullRequestId: "github_pr_1",
      state: "open",
      headSha: "observed-head-sha",
      checks: [
        {
          providerCheckId: "provider_check_1",
          name: "quality",
          state: "passed",
          observedAt: "2026-04-24T12:00:00.000Z",
        },
      ],
    };

    const verificationRuns = await mergeRequests.observeProviderPullRequest(
      mergeRequest.id,
    );

    expect(verificationRuns).toEqual([
      expect.objectContaining({
        headSha: "observed-head-sha",
        state: "passed",
        providerChecks: [
          expect.objectContaining({
            providerCheckId: "provider_check_1",
            name: "quality",
            state: "passed",
            observedAt: "2026-04-24T12:00:00.000Z",
          }),
        ],
      }),
    ]);
    expect(mergeRequests.listVerificationRuns()).toHaveLength(1);
    expect(
      mergeRequests.getMergeRequest(mergeRequest.id).providerPullRequest
        .headSha,
    ).toBe("observed-head-sha");
  });

  it("starts a new Verification Run and stales the prior run when the head SHA changes", async () => {
    const { gitHub, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();
    const firstRun = await mergeRequests.recordProviderCheck(mergeRequest.id, {
      providerCheckId: "provider_check_1",
      name: "quality",
      state: "passed",
    });

    gitHub.observation = {
      providerPullRequestId: "github_pr_1",
      state: "open",
      headSha: "new-head-sha",
      checks: [
        {
          providerCheckId: "provider_check_2",
          name: "quality",
          state: "passed",
          observedAt: "2026-04-24T12:00:00.000Z",
        },
      ],
    };

    const [secondRun] = await mergeRequests.observeProviderPullRequest(
      mergeRequest.id,
    );

    expect(secondRun?.id).not.toBe(firstRun.id);
    expect(mergeRequests.getVerificationRun(firstRun.id).state).toBe("stale");
    expect(secondRun).toEqual(
      expect.objectContaining({
        headSha: "new-head-sha",
        state: "passed",
      }),
    );
  });

  it("allows optional Provider Checks to fail without failing the Verification Run", async () => {
    const { mergeRequests, mergeRequest } = await createOpenMergeRequestFlow();
    const verificationRun = await mergeRequests.recordProviderCheck(
      mergeRequest.id,
      {
        providerCheckId: "optional_check_1",
        name: "coverage report",
        required: false,
        state: "failed",
      },
    );

    expect(verificationRun).toEqual(
      expect.objectContaining({
        state: "passed",
        providerChecks: [
          expect.objectContaining({
            providerCheckId: "optional_check_1",
            required: false,
            state: "failed",
          }),
        ],
      }),
    );
  });

  it("reconciles provider closed and merged states during observation", async () => {
    const closedFlow = await createOpenMergeRequestFlow();
    closedFlow.gitHub.observation = {
      providerPullRequestId: "github_pr_1",
      state: "closed",
      headSha: "closed-head-sha",
      checks: [],
    };

    await closedFlow.mergeRequests.observeProviderPullRequest(
      closedFlow.mergeRequest.id,
    );

    const closedMergeRequest = closedFlow.mergeRequests.getMergeRequest(
      closedFlow.mergeRequest.id,
    );

    expect(closedMergeRequest.state).toBe("closed_unmerged");
    expect(closedMergeRequest.providerPullRequest.headSha).toBe(
      "closed-head-sha",
    );

    const mergedFlow = await createOpenMergeRequestFlow();
    mergedFlow.gitHub.observation = {
      providerPullRequestId: "github_pr_1",
      state: "merged",
      headSha: "merged-head-sha",
      checks: [],
    };

    await mergedFlow.mergeRequests.observeProviderPullRequest(
      mergedFlow.mergeRequest.id,
    );

    const mergedMergeRequest = mergedFlow.mergeRequests.getMergeRequest(
      mergedFlow.mergeRequest.id,
    );

    expect(mergedMergeRequest.state).toBe("merged");
    expect(mergedMergeRequest.providerPullRequest.headSha).toBe(
      "merged-head-sha",
    );
    expect(
      mergedFlow.execution.getTask(mergedFlow.mergeRequest.sourceOwner.taskId)
        .state,
    ).toBe("completed");
  });

  it("keeps policy pending when no provider check has passed", async () => {
    const { execution, gitHub, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();
    const reviewAssignment = await startReviewAssignment(
      execution,
      mergeRequests,
      mergeRequest.id,
    );

    gitHub.observation = {
      providerPullRequestId: "github_pr_1",
      state: "open",
      headSha: "observed-head-sha",
      checks: [],
    };
    execution.completeAssignment(reviewAssignment.id);
    await mergeRequests.observeProviderPullRequest(mergeRequest.id);
    await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      assignmentId: reviewAssignment.id,
      reviewerKind: "agent",
      reviewerId: reviewAssignment.agentId,
      outcome: "approved",
    });
    const approved = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      reviewerKind: "human",
      reviewerId: "user_approver",
      outcome: "approved",
    });

    expect(approved.state).toBe("open");
    expect(approved.policyCheck).toEqual(
      expect.objectContaining({
        state: "pending",
        reason: "A passing Verification Run and Review Approved are required.",
      }),
    );
    await expect(mergeRequests.merge(mergeRequest.id)).rejects.toThrow(
      /not merge_ready/i,
    );
  });

  it("runs review through a MergeRequest-owned Assignment", async () => {
    const { agentAdapter, execution, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();

    mergeRequests.requestReview(mergeRequest.id);
    await execution.runSchedulerOnce();

    const reviewAssignment = execution.listAssignments().find((assignment) => {
      return assignment.owner.type === "merge_request";
    });

    expect(reviewAssignment).toBeDefined();
    expect(reviewAssignment?.mergeRequestId).toBe(mergeRequest.id);
    expect(agentAdapter.starts.at(-1)?.target).toEqual(
      expect.objectContaining({
        type: "merge_request",
      }),
    );
  });

  it("publishes stoneforge/policy and gates merge until supervised approval exists", async () => {
    const { execution, gitHub, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();
    const reviewAssignment = await startReviewAssignment(
      execution,
      mergeRequests,
      mergeRequest.id,
    );

    execution.completeAssignment(reviewAssignment.id);
    await mergeRequests.recordProviderCheck(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "passed",
    });
    const reviewed = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      assignmentId: reviewAssignment.id,
      reviewerKind: "agent",
      reviewerId: reviewAssignment.agentId,
      outcome: "approved",
    });

    expect(reviewed.state).toBe("policy_pending");
    expect(gitHub.policyChecks.at(-1)).toEqual(
      expect.objectContaining({
        state: "pending",
      }),
    );
    await expect(mergeRequests.merge(mergeRequest.id)).rejects.toThrow(
      /not merge_ready/i,
    );

    const approved = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      reviewerKind: "human",
      reviewerId: "user_approver",
      outcome: "approved",
    });
    const merged = await mergeRequests.merge(mergeRequest.id);

    expect(approved.state).toBe("merge_ready");
    expect(merged.state).toBe("merged");
    expect(gitHub.policyChecks.at(-1)).toEqual(
      expect.objectContaining({
        state: "passed",
      }),
    );
    expect(execution.getTask(mergeRequest.sourceOwner.taskId).state).toBe(
      "completed",
    );
  });

  it("publishes the current policy status on demand", async () => {
    const { gitHub, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();

    const published = await mergeRequests.publishPolicyStatus(mergeRequest.id);

    expect(published.state).toBe("open");
    expect(published.policyCheck).toEqual(
      expect.objectContaining({
        state: "pending",
        reason: "A passing Verification Run and Review Approved are required.",
      }),
    );
    expect(gitHub.policyChecks.at(-1)).toEqual(
      expect.objectContaining({
        state: "pending",
      }),
    );
  });

  it("marks the MergeRequest repair_required after review changes are requested and redispatches repair work", async () => {
    const { execution, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();
    const reviewAssignment = await startReviewAssignment(
      execution,
      mergeRequests,
      mergeRequest.id,
    );

    execution.completeAssignment(reviewAssignment.id);
    const repaired = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      assignmentId: reviewAssignment.id,
      reviewerKind: "agent",
      reviewerId: reviewAssignment.agentId,
      outcome: "changes_requested",
      reason: "Tighten the tests.",
    });

    const repairTask = execution.getTask(mergeRequest.sourceOwner.taskId);

    expect(repaired.state).toBe("repair_required");
    expect(repairTask.state).toBe("ready");
    expect(repairTask.progressRecord.repairContext).toContain(
      "Tighten the tests.",
    );

    await execution.runSchedulerOnce();

    const repairAssignment = execution.listAssignments().at(-1);

    expect(repairAssignment?.owner).toEqual({
      type: "task",
      taskId: mergeRequest.sourceOwner.taskId,
    });
  });

  it("marks the MergeRequest repair_required after verification failure and redispatches repair work", async () => {
    const { execution, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();

    await mergeRequests.recordProviderCheck(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "failed",
    });

    const repaired = mergeRequests.getMergeRequest(mergeRequest.id);

    expect(repaired.state).toBe("repair_required");
    expect(execution.getTask(mergeRequest.sourceOwner.taskId).state).toBe(
      "ready",
    );

    await execution.runSchedulerOnce();

    const repairAssignment = execution.listAssignments().at(-1);

    expect(repairAssignment?.owner).toEqual({
      type: "task",
      taskId: mergeRequest.sourceOwner.taskId,
    });
  });
});

async function createOpenMergeRequestFlow() {
  const flow = await createCompletedTaskFlow();
  const assignment = flow.execution.listAssignments()[0];
  const mergeRequest = await flow.mergeRequests.openOrUpdateTaskMergeRequest({
    taskAssignmentId: assignment.id,
  });

  return {
    ...flow,
    mergeRequest,
  };
}

async function createCompletedTaskFlow() {
  const { workspace } = createReadyWorkspace();
  const agentAdapter = new RecordingAgentAdapter();
  const gitHub = new RecordingGitHubAdapter();
  const execution = new TaskDispatchService(agentAdapter);

  execution.configureWorkspace(workspace);

  const task = execution.createTask({
    workspaceId: workspace.id,
    title: "Add merge flow",
    intent: "Open and validate a task pull request.",
    acceptanceCriteria: ["A task PR can be reviewed and merged."],
    requiresMergeRequest: true,
  });

  await execution.runSchedulerOnce();
  const assignment = execution.listAssignments()[0];

  execution.recordHeartbeat(execution.listSessions()[0].id, "worker online");
  execution.recordCheckpoint(
    execution.listSessions()[0].id,
    createCheckpoint(),
  );
  execution.completeAssignment(assignment.id);

  expect(execution.getTask(task.id).state).toBe("awaiting_review");

  return {
    agentAdapter,
    execution,
    gitHub,
    mergeRequests: new MergeRequestService(execution, gitHub, {
      policyPreset: "supervised",
    }),
  };
}

async function startReviewAssignment(
  execution: TaskDispatchService,
  mergeRequests: MergeRequestService,
  mergeRequestId: Parameters<MergeRequestService["getMergeRequest"]>[0],
) {
  mergeRequests.requestReview(mergeRequestId);
  await execution.runSchedulerOnce();

  const assignment = execution.listAssignments().find((candidate) => {
    return candidate.owner.type === "merge_request";
  });

  if (!assignment) {
    throw new Error("Expected a MergeRequest-owned Assignment.");
  }

  mergeRequests.recordReviewAssignment(assignment);

  return assignment;
}

function createReadyWorkspace(): { workspace: Workspace; agent: Agent } {
  const service = new WorkspaceSetupService();
  const org = service.createOrg({ name: "Stoneforge" });
  const workspace = service.createWorkspace(
    org.id,
    { name: "stoneforge", targetBranch: "main" },
    operator,
  );

  service.connectGitHubRepository(
    workspace.id,
    {
      installationId: "ghinst_1",
      owner: "stoneforge-ai",
      repository: "stoneforge",
      defaultBranch: "main",
    },
    operator,
  );
  const runtime = service.registerRuntime(
    workspace.id,
    {
      name: "customer-host-worktree",
      location: "customer_host",
      mode: "local_worktree",
      tags: ["customer-host"],
    },
    operator,
  );
  const agent = service.registerAgent(
    workspace.id,
    {
      name: "codex-worker",
      runtimeId: runtime.id,
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      launcher: "codex-adapter",
      tags: ["default"],
    },
    operator,
  );
  service.registerRoleDefinition(
    workspace.id,
    {
      name: "implementation-worker",
      category: "worker",
      prompt: "Implement or review the assigned work.",
      toolAccess: ["git", "shell"],
      tags: ["worker"],
    },
    operator,
  );
  service.selectPolicyPreset(workspace.id, "supervised", operator);
  service.validateWorkspace(workspace.id, scheduler);

  return {
    workspace: service.getWorkspace(workspace.id),
    agent,
  };
}

function createCheckpoint(): Checkpoint {
  return {
    completedWork: ["Implemented the task."],
    remainingWork: ["Open the task PR."],
    importantContext: ["This is a code-changing task."],
    capturedAt: new Date().toISOString(),
  };
}
