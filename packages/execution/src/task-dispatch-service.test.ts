import { describe, expect, it } from "vitest";

import {
  WorkspaceSetupService,
  type Agent,
  type AuditActor,
  type Workspace,
} from "@stoneforge/workspace";

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

describe("TaskDispatchService", () => {
  it("turns a ready unplanned task into scheduler-owned dispatch intent", () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);

    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Add dispatch lifecycle",
      intent: "Implement the narrow Task to Session path.",
      acceptanceCriteria: ["Task dispatch reaches a live session."],
    });

    expect(task.state).toBe("ready");
    expect(service.listDispatchIntents()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        state: "queued",
        action: "implement",
      }),
    ]);
  });

  it("queues and retries dispatch intent instead of dropping work", async () => {
    const { workspace } = createReadyWorkspace({ concurrencyLimit: 1 });
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);

    const firstTask = service.createTask({
      workspaceId: workspace.id,
      title: "First task",
      intent: "Occupy the only agent slot.",
      acceptanceCriteria: ["A session starts."],
    });
    await service.runSchedulerOnce();
    const firstAssignment = service.listAssignments()[0];

    expect(firstAssignment?.taskId).toBe(firstTask.id);

    const secondTask = service.createTask({
      workspaceId: workspace.id,
      title: "Second task",
      intent: "Wait until capacity is available.",
      acceptanceCriteria: ["The scheduler retries after capacity returns."],
    });

    const queuedResult = await service.runSchedulerOnce();

    expect(queuedResult).toEqual(
      expect.objectContaining({
        taskId: secondTask.id,
        state: "retry_wait",
        lastFailureReason: "capacity_exhausted",
      }),
    );
    expect(
      service.listDispatchIntents().some((intent) => intent.taskId === secondTask.id),
    ).toBe(true);

    service.completeAssignment(firstAssignment.id);

    const retriedResult = await service.runSchedulerOnce();

    expect(retriedResult).toEqual(
      expect.objectContaining({
        taskId: secondTask.id,
        state: "starting",
      }),
    );
  });

  it("leases and releases one Agent slot around an Assignment", async () => {
    const { workspace, agent } = createReadyWorkspace({ concurrencyLimit: 1 });
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    service.createTask({
      workspaceId: workspace.id,
      title: "Lease capacity",
      intent: "Prove Agent-level concurrency leasing.",
      acceptanceCriteria: ["Exactly one slot is leased and released."],
    });

    await service.runSchedulerOnce();

    const assignment = service.listAssignments()[0];

    expect(assignment).toBeDefined();
    expect(service.activeLeaseCount(agent.id)).toBe(1);

    const completed = service.completeAssignment(assignment.id);

    expect(completed.state).toBe("succeeded");
    expect(service.activeLeaseCount(agent.id)).toBe(0);
    expect(service.listLeases()).toEqual([
      expect.objectContaining({
        agentId: agent.id,
        state: "released",
      }),
    ]);
  });

  it("starts a live Session and records heartbeats", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter());

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Heartbeat",
      intent: "Start a worker session and report liveness.",
      acceptanceCriteria: ["A heartbeat moves execution to running."],
    });

    await service.runSchedulerOnce();

    const session = service.listSessions()[0];
    const heartbeat = service.recordHeartbeat(session.id, "worker online");

    expect(heartbeat.note).toBe("worker online");
    expect(service.getSession(session.id).heartbeats).toHaveLength(1);
    expect(service.getTask(task.id).state).toBe("in_progress");
    expect(service.listDispatchIntents()[0]?.state).toBe("running");
  });

  it("resumes a recoverable Session failure under the same Assignment", async () => {
    const { workspace } = createReadyWorkspace();
    const adapter = new RecordingAdapter();
    const service = new TaskDispatchService(adapter);

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "Recover session",
      intent: "Resume work after a provider crash.",
      acceptanceCriteria: ["A replacement session shares the assignment."],
    });

    await service.runSchedulerOnce();

    const firstSession = service.listSessions()[0];
    const assignment = service.listAssignments()[0];
    const checkpoint = createCheckpoint();
    const replacement = await service.recordRecoverableSessionFailure(
      firstSession.id,
      "crashed",
      checkpoint,
    );

    const updatedAssignment = service.getAssignment(assignment.id);

    expect(replacement.assignmentId).toBe(assignment.id);
    expect(updatedAssignment.sessionIds).toEqual([firstSession.id, replacement.id]);
    expect(updatedAssignment.state).toBe("running");
    expect(service.getTask(task.id).progressRecord.checkpoints).toEqual([
      expect.objectContaining({
        assignmentId: assignment.id,
        sessionId: firstSession.id,
        completedWork: checkpoint.completedWork,
      }),
    ]);
    expect(adapter.resumes).toHaveLength(1);
  });

  it("keeps placement failures queued until policy escalates them", async () => {
    const { workspace } = createReadyWorkspace();
    const service = new TaskDispatchService(new RecordingAdapter(), {
      maxPlacementFailures: 2,
      maxSessionRecoveryFailures: 1,
    });

    service.configureWorkspace(workspace);
    const task = service.createTask({
      workspaceId: workspace.id,
      title: "No placement",
      intent: "Request an impossible agent tag.",
      acceptanceCriteria: ["Placement does not disappear silently."],
      dispatchConstraints: {
        requiredAgentTags: ["missing-agent-pool"],
      },
    });

    const firstAttempt = await service.runSchedulerOnce();
    const secondAttempt = await service.runSchedulerOnce();

    expect(firstAttempt).toEqual(
      expect.objectContaining({
        state: "retry_wait",
        lastFailureReason: "no_eligible_agent",
      }),
    );
    expect(secondAttempt).toEqual(
      expect.objectContaining({
        state: "escalated",
        placementFailureCount: 2,
      }),
    );
    expect(service.getTask(task.id).state).toBe("human_review_required");
  });
});

function createReadyWorkspace(options?: {
  concurrencyLimit?: number;
}): { workspace: Workspace; agent: Agent } {
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
      concurrencyLimit: options?.concurrencyLimit ?? 1,
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
      prompt: "Implement the assigned task.",
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
    completedWork: ["Created the task model."],
    remainingWork: ["Finish scheduler tests."],
    importantContext: ["Resume under the same Assignment."],
    capturedAt: new Date().toISOString(),
  };
}
