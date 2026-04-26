import type { DirectTaskRunSummary } from "./direct-task-summary.js";
import {
  type ControlPlaneCommandStatus,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import {
  exportSnapshot,
  loadControlPlane,
  type LoadControlPlaneOptions,
  type LoadedControlPlane,
} from "./persistent-control-plane-context.js";
import {
  completeAgentReview,
  configureAgent,
  configurePolicy,
  configureRepository,
  configureRole,
  configureRuntime,
  createDirectTask,
  evaluateReadiness,
  executeNextDispatch,
  initializeWorkspace,
  mergeWhenReady,
  observeProviderState,
  openMergeRequest,
  publishPolicyStatus,
  recordHumanApproval,
  recordLocalVerificationPassed,
  requestReview,
  requireObservedProviderVerificationPassed,
} from "./control-plane-loaded-operations.js";
import { buildPersistentSummary } from "./persistent-summary.js";

export class ControlPlaneApplication {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly options: LoadControlPlaneOptions = {},
  ) {}

  async reset(): Promise<ControlPlaneCommandStatus> {
    await this.store.reset();
    return { command: "reset", id: "control-plane-store" };
  }

  async initializeWorkspace(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("initialize-workspace", initializeWorkspace);
  }

  async configureRepository(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-repository", configureRepository);
  }

  async configureRuntime(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-runtime", configureRuntime);
  }

  async configureAgent(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-agent", configureAgent);
  }

  async configureRole(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-role-definition", configureRole);
  }

  async configurePolicy(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-policy", configurePolicy);
  }

  async validateWorkspace(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("evaluate-readiness", evaluateReadiness);
  }

  async createDirectTask(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("create-direct-task", createDirectTask);
  }

  async runWorker(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("execute-next-dispatch", executeNextDispatch);
  }

  async openMergeRequest(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("open-merge-request", openMergeRequest);
  }

  async recordVerificationPassed(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync(
      "record-local-verification-passed",
      recordLocalVerificationPassed,
    );
  }

  async observeProviderState(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("observe-provider-state", observeProviderState);
  }

  async requireObservedProviderVerificationPassed(): Promise<ControlPlaneCommandStatus> {
    return this.mutate(
      "require-provider-verification-passed",
      requireObservedProviderVerificationPassed,
    );
  }

  async publishPolicyStatus(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("publish-policy-status", publishPolicyStatus);
  }

  async requestReview(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("request-review", requestReview);
  }

  async completeReview(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("complete-agent-review", completeAgentReview);
  }

  async approve(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("record-human-approval", recordHumanApproval);
  }

  async merge(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("merge-when-ready", mergeWhenReady);
  }

  async readSummary(): Promise<DirectTaskRunSummary> {
    return buildPersistentSummary(this.store, this.options);
  }

  private async mutate(
    command: string,
    action: (
      loaded: LoadedControlPlane,
    ) => Omit<ControlPlaneCommandStatus, "command">,
  ): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync(command, async (loaded) => action(loaded));
  }

  private async mutateAsync(
    command: string,
    action: (
      loaded: LoadedControlPlane,
    ) => Promise<Omit<ControlPlaneCommandStatus, "command">>,
  ): Promise<ControlPlaneCommandStatus> {
    const loaded = loadControlPlane(await this.store.load(), this.options);
    const result = await action(loaded);

    await this.store.save(exportSnapshot(loaded));

    return { command, ...result };
  }
}

export { ControlPlaneApplication as PersistentControlPlane };
