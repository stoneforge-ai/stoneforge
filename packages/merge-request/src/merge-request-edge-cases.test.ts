import { asCIRunId } from "@stoneforge/core";
import type {
  AgentAdapter,
  AgentAdapterResumeContext,
  Session,
} from "@stoneforge/execution";
import { TaskDispatchService } from "@stoneforge/execution";
import {
  WorkspaceSetupService,
  type AuditActor,
  type Workspace,
} from "@stoneforge/workspace";
import { describe, expect, it } from "vitest";

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
  async start(): Promise<{ providerSessionId: string }> {
    return {
      providerSessionId: "provider_start_1",
    };
  }

  async resume(
    _context: AgentAdapterResumeContext,
  ): Promise<{ providerSessionId: string }> {
    return {
      providerSessionId: "provider_resume_1",
    };
  }

  async cancel(_session: Session): Promise<void> {}
}

class RecordingGitHubAdapter implements GitHubMergeRequestAdapter {
  readonly policyChecks: Array<{ state: PolicyCheckState; reason: string }> = [];

  async createOrUpdateTaskPullRequest(input: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ProviderPullRequest> {
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
    return {
      mergedAt: new Date().toISOString(),
    };
  }

  async observePullRequest(): Promise<ProviderPullRequestObservation> {
    return {
      providerPullRequestId: "github_pr_1",
      state: "open",
      headSha: "provider-head-sha",
      checks: [],
    };
  }
}

describe("MergeRequestService edge cases", () => {
  it("rejects opening a MergeRequest from invalid Assignments", async () => {
    const flow = createConfiguredExecution();
    const runningTaskAssignment = await startTaskAssignment(flow, false);

    await expect(
      flow.mergeRequests.openOrUpdateTaskMergeRequest({
        taskAssignmentId: runningTaskAssignment.id,
      }),
    ).rejects.toThrow(/must succeed/i);

    flow.execution.completeAssignment(runningTaskAssignment.id);

    await expect(
      flow.mergeRequests.openOrUpdateTaskMergeRequest({
        taskAssignmentId: runningTaskAssignment.id,
      }),
    ).rejects.toThrow(/not waiting/i);
  });

  it("rejects task-owned Assignments in review APIs", async () => {
    const flow = createConfiguredExecution();
    const taskAssignment = await startTaskAssignment(flow, true);

    flow.execution.completeAssignment(taskAssignment.id);
    const mergeRequest = await flow.mergeRequests.openOrUpdateTaskMergeRequest({
      taskAssignmentId: taskAssignment.id,
    });

    expect(() =>
      flow.mergeRequests.recordReviewAssignment(taskAssignment),
    ).toThrow(/not MergeRequest-owned/i);
    await expect(
      flow.mergeRequests.recordReviewOutcome(mergeRequest.id, {
        assignmentId: taskAssignment.id,
        outcome: "approved",
      }),
    ).rejects.toThrow(/does not belong/i);
  });

  it("requires review Assignments to finish before recording outcomes", async () => {
    const flow = createConfiguredExecution();
    const taskAssignment = await startTaskAssignment(flow, true);

    flow.execution.completeAssignment(taskAssignment.id);
    const mergeRequest = await flow.mergeRequests.openOrUpdateTaskMergeRequest({
      taskAssignmentId: taskAssignment.id,
    });

    flow.mergeRequests.requestReview(mergeRequest.id);
    await flow.execution.runSchedulerOnce();

    const reviewAssignment = flow.execution.listAssignments().at(-1);

    if (!reviewAssignment) {
      throw new Error("Expected review Assignment.");
    }

    await expect(
      flow.mergeRequests.recordReviewOutcome(mergeRequest.id, {
        assignmentId: reviewAssignment.id,
        outcome: "approved",
      }),
    ).rejects.toThrow(/must succeed/i);
  });

  it("allows autonomous policy to reach merge_ready without human approval", async () => {
    const flow = createConfiguredExecution("autonomous");
    const taskAssignment = await startTaskAssignment(flow, true);

    flow.execution.completeAssignment(taskAssignment.id);
    const mergeRequest = await flow.mergeRequests.openOrUpdateTaskMergeRequest({
      taskAssignmentId: taskAssignment.id,
    });
    const reviewAssignment = await startReviewAssignment(flow, mergeRequest.id);

    flow.execution.completeAssignment(reviewAssignment.id);
    await flow.mergeRequests.recordCIRun(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "passed",
    });

    const reviewed = await flow.mergeRequests.recordReviewOutcome(mergeRequest.id, {
      assignmentId: reviewAssignment.id,
      outcome: "approved",
    });

    expect(reviewed.state).toBe("merge_ready");
  });

  it("throws for missing MergeRequest and CIRun records", () => {
    const flow = createConfiguredExecution();

    expect(() => flow.mergeRequests.getMergeRequest("missing" as never)).toThrow(
      /does not exist/i,
    );
    expect(() =>
      flow.mergeRequests.getCIRun(asCIRunId("missing_ci")),
    ).toThrow(/does not exist/i);
  });
});

async function startTaskAssignment(
  flow: ReturnType<typeof createConfiguredExecution>,
  requiresMergeRequest: boolean,
) {
  flow.execution.createTask({
    workspaceId: flow.workspaceId,
    title: "Task work",
    intent: "Complete implementation work.",
    acceptanceCriteria: ["The worker Assignment succeeds."],
    requiresMergeRequest,
  });
  await flow.execution.runSchedulerOnce();

  const assignment = flow.execution.listAssignments().at(-1);

  if (!assignment) {
    throw new Error("Expected task Assignment.");
  }

  return assignment;
}

async function startReviewAssignment(
  flow: ReturnType<typeof createConfiguredExecution>,
  mergeRequestId: Parameters<MergeRequestService["getMergeRequest"]>[0],
) {
  flow.mergeRequests.requestReview(mergeRequestId);
  await flow.execution.runSchedulerOnce();

  const assignment = flow.execution.listAssignments().at(-1);

  if (!assignment) {
    throw new Error("Expected review Assignment.");
  }

  flow.mergeRequests.recordReviewAssignment(assignment);

  return assignment;
}

function createConfiguredExecution(policyPreset: "supervised" | "autonomous" = "supervised") {
  const { workspace } = createReadyWorkspace();
  const execution = new TaskDispatchService(new RecordingAgentAdapter());
  const gitHub = new RecordingGitHubAdapter();

  execution.configureWorkspace(workspace);

  return {
    execution,
    gitHub,
    workspaceId: workspace.id,
    mergeRequests: new MergeRequestService(execution, gitHub, {
      policyPreset,
    }),
  };
}

function createReadyWorkspace(): { workspace: Workspace } {
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
    },
    operator,
  );
  service.registerAgent(
    workspace.id,
    {
      name: "codex-worker",
      runtimeId: runtime.id,
      harness: "openai-codex",
      model: "gpt-5-codex",
      concurrencyLimit: 1,
      launcher: "codex-adapter",
    },
    operator,
  );
  service.registerRoleDefinition(
    workspace.id,
    {
      name: "implementation-worker",
      category: "worker",
      prompt: "Implement or review the assigned work.",
    },
    operator,
  );
  service.selectPolicyPreset(workspace.id, "supervised", operator);
  service.validateWorkspace(workspace.id, scheduler);

  return {
    workspace: service.getWorkspace(workspace.id),
  };
}
