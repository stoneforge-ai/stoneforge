import {
  buildSummary,
  type DirectTaskRunSummary,
} from "./direct-task-summary.js";
import {
  type ControlPlaneCommandStatus,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import {
  exportSnapshot,
  loadControlPlane,
  operator,
  rememberCompletedAssignment,
  requireImplementationSessionId,
  requireLatestSession,
  requireMergeRequestId,
  requireRoleDefinition,
  requireReviewSessionId,
  requireRuntimeId,
  requireStartedAssignment,
  requireTaskId,
  requireValue,
  requireWorkspaceId,
  scheduler,
  type LoadedControlPlane,
} from "./persistent-control-plane-context.js";
import { recordWorkerProgress } from "./persistent-worker.js";

export class PersistentControlPlane {
  constructor(private readonly store: ControlPlaneStore) {}

  async reset(): Promise<ControlPlaneCommandStatus> {
    await this.store.reset();
    return { command: "reset", id: "control-plane-store" };
  }

  async initializeWorkspace(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("initialize-workspace", (loaded) => {
      const org = loaded.setup.createOrg({ name: "Toolco" });
      const workspace = loaded.setup.createWorkspace(
        org.id,
        { name: "stoneforge", targetBranch: "main" },
        operator,
      );

      loaded.snapshot.current.orgId = org.id;
      loaded.snapshot.current.workspaceId = workspace.id;

      return { id: workspace.id, state: workspace.state };
    });
  }

  async configureRepository(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-repo", (loaded) => {
      const workspace = loaded.setup.connectGitHubRepository(
        requireWorkspaceId(loaded.snapshot.current),
        {
          installationId: "github-installation-local",
          owner: "toolco",
          repository: "stoneforge",
          defaultBranch: "main",
        },
        operator,
      );

      return { id: workspace.id, state: workspace.state };
    });
  }

  async configureRuntime(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-runtime", (loaded) => {
      const runtime = loaded.setup.registerRuntime(
        requireWorkspaceId(loaded.snapshot.current),
        {
          name: "local-worktree-runtime",
          location: "customer_host",
          mode: "local_worktree",
          tags: ["local"],
        },
        operator,
      );

      loaded.snapshot.current.runtimeId = runtime.id;

      return { id: runtime.id, state: runtime.healthStatus };
    });
  }

  async configureAgent(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-agent", (loaded) => {
      const agent = loaded.setup.registerAgent(
        requireWorkspaceId(loaded.snapshot.current),
        {
          name: "local-codex-agent",
          runtimeId: requireRuntimeId(loaded.snapshot.current),
          harness: "openai-codex",
          model: "gpt-5-codex",
          concurrencyLimit: 1,
          launcher: "fake-local-agent-adapter",
          tags: ["local"],
        },
        operator,
      );

      loaded.snapshot.current.agentId = agent.id;

      return { id: agent.id, state: agent.healthStatus };
    });
  }

  async configureRole(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-role", (loaded) => {
      const roleDefinition = loaded.setup.registerRoleDefinition(
        requireWorkspaceId(loaded.snapshot.current),
        {
          name: "direct-task-worker",
          category: "worker",
          prompt: "Implement or review assigned control-plane work.",
          toolAccess: ["git", "shell"],
          tags: ["local"],
        },
        operator,
      );

      loaded.snapshot.current.roleDefinitionId = roleDefinition.id;

      return { id: roleDefinition.id, state: roleDefinition.category };
    });
  }

  async configurePolicy(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-policy", (loaded) => {
      const workspace = loaded.setup.selectPolicyPreset(
        requireWorkspaceId(loaded.snapshot.current),
        "supervised",
        operator,
      );

      return { id: workspace.id, state: workspace.policyPreset };
    });
  }

  async validateWorkspace(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("validate-workspace", (loaded) => {
      const workspaceId = requireWorkspaceId(loaded.snapshot.current);
      const validation = loaded.setup.validateWorkspace(workspaceId, scheduler);
      const workspace = loaded.setup.getWorkspace(workspaceId);

      if (!validation.ready) {
        throw new Error(
          "Workspace is not ready. Configure repository, policy, runtime, agent, and role before validation.",
        );
      }

      loaded.execution.configureWorkspace(workspace);

      return { id: workspace.id, state: workspace.state };
    });
  }

  async createDirectTask(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("create-direct-task", (loaded) => {
      const roleDefinition = requireRoleDefinition(loaded);
      const task = loaded.execution.createTask({
        workspaceId: requireWorkspaceId(loaded.snapshot.current),
        title: "Persistent direct task tracer bullet",
        intent: "Prove the local control-plane command boundary and durable state.",
        acceptanceCriteria: [
          "The task dispatches through the public command surface.",
          "The fake AgentAdapter records provider session ids.",
          "The fake GitHub adapter drives review, approval, and merge.",
        ],
        priority: "normal",
        requiresMergeRequest: true,
        dispatchConstraints: {
          roleDefinitionId: roleDefinition.id,
          requiredAgentTags: ["local"],
          requiredRuntimeTags: ["local"],
        },
      });

      loaded.snapshot.current.taskId = task.id;

      return { id: task.id, state: task.state };
    });
  }

  async runWorker(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("run-worker", async (loaded) => {
      const intent = await loaded.execution.runSchedulerOnce();
      const assignment = requireStartedAssignment(loaded.execution, intent);
      const session = requireLatestSession(loaded.execution, assignment);

      recordWorkerProgress(loaded, assignment, session);
      const completed = loaded.execution.completeAssignment(assignment.id);

      rememberCompletedAssignment(loaded.snapshot.current, completed, session);

      return { id: completed.id, state: completed.state };
    });
  }

  async openMergeRequest(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("open-merge-request", async (loaded) => {
      const mergeRequest = await loaded.mergeRequests.openOrUpdateTaskMergeRequest({
        taskAssignmentId: requireValue(
          loaded.snapshot.current.implementationAssignmentId,
          "Run the implementation worker before opening a MergeRequest.",
        ),
      });

      loaded.snapshot.current.mergeRequestId = mergeRequest.id;

      return { id: mergeRequest.id, state: mergeRequest.state };
    });
  }

  async recordCiPassed(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("record-ci-passed", async (loaded) => {
      const ciRun = await loaded.mergeRequests.recordCIRun(
        requireMergeRequestId(loaded.snapshot.current),
        {
          providerCheckId: "local-check-1",
          name: "local quality",
          state: "passed",
        },
      );

      loaded.snapshot.current.ciRunId = ciRun.id;

      return { id: ciRun.id, state: ciRun.state };
    });
  }

  async requestReview(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("request-review", (loaded) => {
      const roleDefinition = requireRoleDefinition(loaded);
      const intent = loaded.mergeRequests.requestReview(
        requireMergeRequestId(loaded.snapshot.current),
        {
          roleDefinitionId: roleDefinition.id,
          requiredAgentTags: ["local"],
          requiredRuntimeTags: ["local"],
        },
      );

      return { id: intent.id, state: intent.state };
    });
  }

  async completeReview(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("complete-review", async (loaded) => {
      const mergeRequest = await loaded.mergeRequests.recordReviewOutcome(
        requireMergeRequestId(loaded.snapshot.current),
        {
          assignmentId: requireValue(
            loaded.snapshot.current.reviewAssignmentId,
            "Run the review worker before completing review.",
          ),
          outcome: "approved",
          reason: "Local review approved the deterministic scenario change.",
        },
      );

      return { id: mergeRequest.id, state: mergeRequest.state };
    });
  }

  async approve(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("approve", async (loaded) => {
      const mergeRequest = await loaded.mergeRequests.recordHumanApproval(
        requireMergeRequestId(loaded.snapshot.current),
        "user_approver",
      );

      return { id: mergeRequest.id, state: mergeRequest.state };
    });
  }

  async merge(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("merge", async (loaded) => {
      const mergeRequest = await loaded.mergeRequests.merge(
        requireMergeRequestId(loaded.snapshot.current),
      );

      return { id: mergeRequest.id, state: mergeRequest.state };
    });
  }

  async readSummary(): Promise<DirectTaskRunSummary> {
    const loaded = loadControlPlane(await this.store.load());
    const current = loaded.snapshot.current;
    const implementationAssignment = loaded.execution.getAssignment(
      requireValue(
        current.implementationAssignmentId,
        "No implementation Assignment exists. Run the worker first.",
      ),
    );
    const reviewAssignment = loaded.execution.getAssignment(
      requireValue(
        current.reviewAssignmentId,
        "No review Assignment exists. Run the review worker first.",
      ),
    );

    return buildSummary({
      orgId: requireValue(current.orgId, "No Org exists. Initialize a workspace first."),
      workspace: loaded.setup.getWorkspace(requireWorkspaceId(current)),
      task: loaded.execution.getTask(requireTaskId(current)),
      implementation: {
        assignment: implementationAssignment,
        session: loaded.execution.getSession(requireImplementationSessionId(current)),
      },
      review: {
        assignment: reviewAssignment,
        session: loaded.execution.getSession(requireReviewSessionId(current)),
      },
      mergeRequest: loaded.mergeRequests.getMergeRequest(requireMergeRequestId(current)),
      ciRun: loaded.mergeRequests.getCIRun(
        requireValue(current.ciRunId, "No CIRun exists. Record CI first."),
      ),
      providerSessionIds: loaded.execution.listSessions().map((session) => {
        return session.providerSessionId;
      }),
    });
  }

  private async mutate(
    command: string,
    action: (loaded: LoadedControlPlane) => Omit<ControlPlaneCommandStatus, "command">,
  ): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync(command, async (loaded) => action(loaded));
  }

  private async mutateAsync(
    command: string,
    action: (loaded: LoadedControlPlane) => Promise<Omit<ControlPlaneCommandStatus, "command">>,
  ): Promise<ControlPlaneCommandStatus> {
    const loaded = loadControlPlane(await this.store.load());
    const result = await action(loaded);

    await this.store.save(exportSnapshot(loaded));

    return { command, ...result };
  }
}
