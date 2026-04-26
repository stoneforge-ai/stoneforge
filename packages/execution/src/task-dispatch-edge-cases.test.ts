import { asMergeRequestId } from "@stoneforge/core";
import {
  WorkspaceSetupService,
  type AuditActor,
  type Workspace,
} from "@stoneforge/workspace";
import { describe, expect, it } from "vitest";

import {
  asAssignmentId,
  asDispatchIntentId,
  asSessionId,
  asTaskId,
} from "./ids.js";
import type {
  AgentAdapter,
  AgentAdapterResumeContext,
  AgentAdapterStartContext,
  Checkpoint,
  Session,
} from "./models.js";
import { TaskDispatchService } from "./task-dispatch-service.js";

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

class RecordingAdapter implements AgentAdapter {
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

class FailingStartAdapter extends RecordingAdapter {
  async start(): Promise<{ providerSessionId: string }> {
    throw new Error("adapter unavailable");
  }
}

describe("TaskDispatchService edge cases", () => {
  it("requires a ready workspace before dispatch configuration", () => {
    const service = new TaskDispatchService(new RecordingAdapter());

    expect(() => service.configureWorkspace(createDraftWorkspace())).toThrow(
      /must be ready/i,
    );
  });

  it("keeps incomplete tasks planned until updates make them dispatchable", () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Incomplete task",
      intent: "Needs acceptance criteria.",
    });

    expect(task.state).toBe("planned");
    expect(service.listDispatchIntents()).toEqual([]);

    const updated = service.updateTask(task.id, {
      acceptanceCriteria: ["A dispatch intent is created."],
    });

    expect(updated.state).toBe("ready");
    expect(service.listDispatchIntents()).toHaveLength(1);
  });

  it("applies every task update field and marks stale intents not ready", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Original",
      intent: "Original intent.",
      acceptanceCriteria: ["Original criterion."],
    });
    const updated = service.updateTask(task.id, {
      title: "Updated",
      intent: "Updated intent.",
      acceptanceCriteria: [],
      priority: "high",
      dependencyIds: [],
      dispatchConstraints: {
        requiredAgentTags: ["default"],
        requiredRuntimeTags: ["customer-host"],
      },
    });

    expect(updated).toEqual(
      expect.objectContaining({
        title: "Updated",
        intent: "Updated intent.",
        acceptanceCriteria: [],
        priority: "high",
      }),
    );

    const result = await service.runSchedulerOnce();

    expect(result).toEqual(
      expect.objectContaining({
        lastFailureReason: "task_not_ready",
        state: "retry_wait",
      }),
    );
  });

  it("blocks dependent tasks until their dependencies complete", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const dependency = service.createTask({
      workspaceId: workspace.id,
      title: "Dependency",
      intent: "Complete first.",
      acceptanceCriteria: ["Dependency is done."],
    });
    const blocked = service.createTask({
      workspaceId: workspace.id,
      title: "Blocked",
      intent: "Waits for dependency.",
      acceptanceCriteria: ["Dispatches second."],
      dependencyIds: [dependency.id],
    });

    expect(blocked.state).toBe("planned");

    await service.runSchedulerOnce();
    service.completeAssignment(service.listAssignments()[0].id);
    const unblocked = service.updateTask(blocked.id, {});

    expect(unblocked.state).toBe("ready");
  });

  it("queues MergeRequest dispatch intents only once per open action", async () => {
    const { workspace } = createReadyWorkspace();
    const adapter = new RecordingAdapter();
    const service = new TaskDispatchService(adapter);
    const mergeRequest = {
      id: asMergeRequestId("mr_1"),
      title: "Review PR #1",
      providerPullRequestUrl: "https://github.example/pull/1",
    };

    service.configureWorkspace(workspace);
    const firstIntent = service.createMergeRequestDispatchIntent({
      workspaceId: workspace.id,
      mergeRequest,
      action: "review",
    });
    const secondIntent = service.createMergeRequestDispatchIntent({
      workspaceId: workspace.id,
      mergeRequest,
      action: "review",
    });

    expect(secondIntent.id).toBe(firstIntent.id);

    await service.runSchedulerOnce();

    expect(service.listAssignments()[0].owner).toEqual({
      type: "merge_request",
      mergeRequestId: mergeRequest.id,
    });
    expect(adapter.starts[0].target).toEqual({
      type: "merge_request",
      mergeRequest,
    });
  });

  it("keeps adapter start failures retryable and releases capacity", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new FailingStartAdapter(), {
      maxPlacementFailures: 2,
      maxSessionRecoveryFailures: 1,
    });

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Adapter failure",
      intent: "Retry after adapter failure.",
      acceptanceCriteria: ["The lease is released."],
    });

    const result = await service.runSchedulerOnce();

    expect(result).toEqual(
      expect.objectContaining({
        lastFailureReason: "adapter_start_failed",
        state: "retry_wait",
      }),
    );
    expect(service.getTask(task.id).state).toBe("ready");
    expect(service.listLeases()[0].state).toBe("released");
    expect(service.listAssignments()[0].state).toBe("canceled");
  });

  it("requires repair and completes task records through explicit lifecycle methods", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Repairable task",
      intent: "Can require repair before merge.",
      acceptanceCriteria: ["Repair context is captured."],
      requiresMergeRequest: true,
    });

    await service.runSchedulerOnce();
    const assignment = service.completeAssignment(service.listAssignments()[0].id);
    const repairRequired = service.requireTaskRepair(task.id, "Review requested changes");

    expect(assignment.state).toBe("succeeded");
    expect(repairRequired.state).toBe("ready");
    expect(repairRequired.progressRecord.repairContext).toContain(
      "Review requested changes",
    );

    const completed = service.completeTaskAfterMerge(task.id);

    expect(completed.state).toBe("completed");
    expect(() => service.requireTaskRepair(task.id, "Too late")).toThrow(
      /cannot require repair/i,
    );
  });

  it("records first-class follow-up task lineage to prior terminal work", () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const original = service.createTask({
      workspaceId: workspace.id,
      title: "Original task",
      intent: "Complete behavior.",
      acceptanceCriteria: ["Original work completes."],
    });
    const followUp = service.createTask({
      workspaceId: workspace.id,
      title: "Follow-up task",
      intent: "Continue from prior terminal work.",
      acceptanceCriteria: ["Follow-up work completes."],
      followUpSource: {
        taskId: original.id,
        sourceOutcome: "closed_unmerged",
        mergeRequestId: asMergeRequestId("merge_request_1"),
      },
    });

    expect(followUp.followUpSource).toEqual({
      taskId: original.id,
      sourceOutcome: "closed_unmerged",
      mergeRequestId: asMergeRequestId("merge_request_1"),
    });
  });

  it("keeps repair-required tasks undispatched until readiness gates pass", () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Blocked repair",
      intent: "Needs acceptance criteria before repair can dispatch.",
      requiresMergeRequest: true,
    });
    const repairRequired = service.requireTaskRepair(task.id, "Repair trigger");

    expect(repairRequired.state).toBe("repair_required");
    expect(service.listDispatchIntents()).toEqual([]);

    const dispatchable = service.updateTask(task.id, {
      acceptanceCriteria: ["Repair work can dispatch."],
    });

    expect(dispatchable.state).toBe("ready");
    expect(service.listDispatchIntents()).toHaveLength(1);
  });

  it("escalates after exceeding session recovery policy", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter(), {
      maxPlacementFailures: 2,
      maxSessionRecoveryFailures: 0,
    });

    service.configureWorkspace(workspace);
    service.createTask({
      workspaceId: workspace.id,
      title: "Recover failure",
      intent: "Escalate immediately.",
      acceptanceCriteria: ["Recovery policy is enforced."],
    });

    await service.runSchedulerOnce();

    const session = service.listSessions()[0];

    await expect(
      service.recordRecoverableSessionFailure(
        session.id,
        "expired",
        createCheckpoint(),
      ),
    ).rejects.toThrow(/exceeded session recovery policy/i);
  });

  it("rejects task recovery for MergeRequest-owned assignments", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    service.createMergeRequestDispatchIntent({
      workspaceId: workspace.id,
      mergeRequest: {
        id: asMergeRequestId("mr_1"),
        title: "Review PR #1",
        providerPullRequestUrl: "https://github.example/pull/1",
      },
      action: "review",
    });
    await service.runSchedulerOnce();

    const session = service.listSessions()[0];

    await expect(
      service.recordRecoverableSessionFailure(
        session.id,
        "crashed",
        createCheckpoint(),
      ),
    ).rejects.toThrow(/cannot use task recovery/i);
  });

  it("returns null when no dispatch intents are queued", async () => {
    const service = new TaskDispatchService(new RecordingAdapter());

    await expect(service.runSchedulerOnce()).resolves.toBeNull();
  });

  it("throws for missing records", () => {
    const service = new TaskDispatchService(new RecordingAdapter());

    expect(() => service.getTask(asTaskId("missing"))).toThrow(/does not exist/i);
    expect(() =>
      service.getDispatchIntent(asDispatchIntentId("missing")),
    ).toThrow(/does not exist/i);
    expect(() =>
      service.getAssignment(asAssignmentId("missing")),
    ).toThrow(/does not exist/i);
    expect(() => service.getSession(asSessionId("missing"))).toThrow(
      /does not exist/i,
    );
  });
});

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
      tags: ["customer-host"],
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
  };
}

function createDraftWorkspace(): Workspace {
  const service = new WorkspaceSetupService();
  const org = service.createOrg({ name: "Stoneforge" });

  return service.createWorkspace(
    org.id,
    { name: "stoneforge", targetBranch: "main" },
    operator,
  );
}

function createCheckpoint(): Checkpoint {
  return {
    completedWork: ["Captured progress."],
    remainingWork: ["Resume or escalate."],
    importantContext: ["The session failed."],
    capturedAt: new Date().toISOString(),
  };
}
