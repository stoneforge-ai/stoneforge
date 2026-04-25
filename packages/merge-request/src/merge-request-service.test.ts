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

  async start(context: AgentAdapterStartContext): Promise<{ providerSessionId: string }> {
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
}

describe("MergeRequestService", () => {
  it("opens and updates a task MergeRequest from a completed code-changing Assignment", async () => {
    const { execution, gitHub, mergeRequests } = await createCompletedTaskFlow();
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

  it("records GitHub check observations as CIRuns", async () => {
    const { mergeRequests, mergeRequest } = await createOpenMergeRequestFlow();

    const queued = await mergeRequests.recordCIRun(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "queued",
    });
    const passed = await mergeRequests.recordCIRun(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "passed",
    });

    expect(queued.id).toBe(passed.id);
    expect(mergeRequests.listCIRuns()).toEqual([
      expect.objectContaining({
        providerCheckId: "check_1",
        state: "passed",
      }),
    ]);
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
    const reviewAssignment = await startReviewAssignment(execution, mergeRequests, mergeRequest.id);

    execution.completeAssignment(reviewAssignment.id);
    await mergeRequests.recordCIRun(mergeRequest.id, {
      providerCheckId: "check_1",
      name: "test",
      state: "passed",
    });
    const reviewed = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      assignmentId: reviewAssignment.id,
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

    const approved = await mergeRequests.recordHumanApproval(
      mergeRequest.id,
      "user_approver",
    );
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

  it("marks the MergeRequest repair_required after review changes are requested and redispatches repair work", async () => {
    const { execution, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();
    const reviewAssignment = await startReviewAssignment(execution, mergeRequests, mergeRequest.id);

    execution.completeAssignment(reviewAssignment.id);
    const repaired = await mergeRequests.recordReviewOutcome(mergeRequest.id, {
      assignmentId: reviewAssignment.id,
      outcome: "changes_requested",
      reason: "Tighten the tests.",
    });

    const reopenedTask = execution.getTask(mergeRequest.sourceOwner.taskId);

    expect(repaired.state).toBe("repair_required");
    expect(reopenedTask.state).toBe("ready");
    expect(reopenedTask.repairContexts).toContain("Tighten the tests.");

    await execution.runSchedulerOnce();

    const repairAssignment = execution.listAssignments().at(-1);

    expect(repairAssignment?.owner).toEqual({
      type: "task",
      taskId: mergeRequest.sourceOwner.taskId,
    });
  });

  it("marks the MergeRequest repair_required after CI failure and redispatches repair work", async () => {
    const { execution, mergeRequests, mergeRequest } =
      await createOpenMergeRequestFlow();

    await mergeRequests.recordCIRun(mergeRequest.id, {
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
  execution.recordCheckpoint(execution.listSessions()[0].id, createCheckpoint());
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
