import { Effect } from "effect"

import type { DirectTaskRunSummary } from "./direct-task-summary.js"
import {
  type ControlPlaneCommandStatus,
  type ControlPlaneStore,
} from "./control-plane-store.js"
import {
  loadControlPlaneSnapshot,
  resetControlPlaneSnapshot,
  runControlPlaneEffect,
  runControlPlaneProgram,
  saveControlPlaneSnapshot,
  type ControlPlaneStoreService,
} from "./control-plane-runtime.js"
import {
  exportSnapshot,
  loadControlPlane,
  type LoadControlPlaneOptions,
  type LoadedControlPlane,
} from "./persistent-control-plane-context.js"
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
} from "./control-plane-loaded-operations.js"
import { buildPersistentSummary } from "./persistent-summary.js"

export class ControlPlaneApplication {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly options: LoadControlPlaneOptions = {}
  ) {}

  reset(): Promise<ControlPlaneCommandStatus> {
    return this.run(
      resetControlPlaneSnapshot().pipe(
        Effect.as({ command: "reset", id: "control-plane-store" }),
        Effect.withSpan("control_plane.command", {
          attributes: { "stoneforge.control_plane.command": "reset" },
        })
      )
    )
  }

  async initializeWorkspace(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("initialize-workspace", initializeWorkspace)
  }

  async configureRepository(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-repository", configureRepository)
  }

  async configureRuntime(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-runtime", configureRuntime)
  }

  async configureAgent(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-agent", configureAgent)
  }

  async configureRoleDefinition(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-role-definition", configureRole)
  }

  async configurePolicy(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("configure-policy", configurePolicy)
  }

  async evaluateReadiness(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("evaluate-readiness", evaluateReadiness)
  }

  async createDirectTask(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("create-direct-task", createDirectTask)
  }

  async executeNextDispatch(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("execute-next-dispatch", executeNextDispatch)
  }

  async openMergeRequest(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("open-merge-request", openMergeRequest)
  }

  async recordLocalVerificationPassed(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync(
      "record-local-verification-passed",
      recordLocalVerificationPassed
    )
  }

  async observeProviderState(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("observe-provider-state", observeProviderState)
  }

  async requireObservedProviderVerificationPassed(): Promise<ControlPlaneCommandStatus> {
    return this.mutate(
      "require-provider-verification-passed",
      requireObservedProviderVerificationPassed
    )
  }

  async publishPolicyStatus(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("publish-policy-status", publishPolicyStatus)
  }

  async requestReview(): Promise<ControlPlaneCommandStatus> {
    return this.mutate("request-review", requestReview)
  }

  async completeAgentReview(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("complete-agent-review", completeAgentReview)
  }

  async recordHumanApproval(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("record-human-approval", recordHumanApproval)
  }

  async mergeWhenReady(): Promise<ControlPlaneCommandStatus> {
    return this.mutateAsync("merge-when-ready", mergeWhenReady)
  }

  readSummary(): Promise<DirectTaskRunSummary> {
    return runControlPlaneEffect(
      Effect.tryPromise({
        try: () => buildPersistentSummary(this.store, this.options),
        catch: (error) =>
          commandError(error instanceof Error ? error : undefined),
      }).pipe(
        Effect.withSpan("control_plane.command", {
          attributes: { "stoneforge.control_plane.command": "summary" },
        })
      )
    )
  }

  private mutate(
    command: string,
    action: (
      loaded: LoadedControlPlane
    ) => Omit<ControlPlaneCommandStatus, "command">
  ): Promise<ControlPlaneCommandStatus> {
    return this.mutateProgram(command, (loaded) =>
      Effect.try({
        try: () => action(loaded),
        catch: (error) =>
          commandError(error instanceof Error ? error : undefined),
      })
    )
  }

  private mutateAsync(
    command: string,
    action: (
      loaded: LoadedControlPlane
    ) => Promise<Omit<ControlPlaneCommandStatus, "command">>
  ): Promise<ControlPlaneCommandStatus> {
    return this.mutateProgram(command, (loaded) =>
      Effect.tryPromise({
        try: () => action(loaded),
        catch: (error) =>
          commandError(error instanceof Error ? error : undefined),
      })
    )
  }

  private mutateProgram(
    command: string,
    action: (
      loaded: LoadedControlPlane
    ) => Effect.Effect<Omit<ControlPlaneCommandStatus, "command">, Error>
  ): Promise<ControlPlaneCommandStatus> {
    return this.run(
      Effect.gen(this, function* () {
        const snapshot = yield* loadControlPlaneSnapshot()
        const loaded = yield* Effect.try({
          try: () => loadControlPlane(snapshot, this.options),
          catch: (error) =>
            commandError(error instanceof Error ? error : undefined),
        })
        const result = yield* action(loaded)
        const exported = yield* Effect.try({
          try: () => exportSnapshot(loaded),
          catch: (error) =>
            commandError(error instanceof Error ? error : undefined),
        })

        yield* saveControlPlaneSnapshot(exported)

        return { command, ...result }
      }).pipe(
        Effect.withSpan("control_plane.command", {
          attributes: { "stoneforge.control_plane.command": command },
        })
      )
    )
  }

  private run<TResult>(
    program: Effect.Effect<TResult, Error, ControlPlaneStoreService>
  ): Promise<TResult> {
    return runControlPlaneProgram(program, this.store)
  }
}

export { ControlPlaneApplication as PersistentControlPlane }

function commandError(error: Error | undefined): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error("Control-plane command failed.")
}
