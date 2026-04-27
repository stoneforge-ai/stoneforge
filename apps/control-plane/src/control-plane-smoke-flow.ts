import { Effect } from "effect"

import type { DirectTaskRunSummary } from "./direct-task-summary.js"
import type { ControlPlaneStore } from "./control-plane-store.js"
import { runControlPlaneEffect } from "./control-plane-runtime.js"
import {
  type ControlPlaneOperationName,
  runControlPlaneOperation,
} from "./control-plane-operations.js"
import { localSmokeOperationInputs } from "./control-plane-smoke-inputs.js"
import { PersistentControlPlane } from "./persistent-control-plane.js"
import type { LoadControlPlaneOptions } from "./persistent-control-plane-context.js"

export async function runControlPlaneSmokeFlow(
  store: ControlPlaneStore,
  options: LoadControlPlaneOptions = {}
): Promise<DirectTaskRunSummary> {
  return runControlPlaneEffect(runControlPlaneSmokeFlowProgram(store, options))
}

function runControlPlaneSmokeFlowProgram(
  store: ControlPlaneStore,
  options: LoadControlPlaneOptions
): Effect.Effect<DirectTaskRunSummary, Error> {
  const smokeOptions = withSmokeInputs(options)
  const firstProcess = new PersistentControlPlane(store, smokeOptions)

  return Effect.gen(function* () {
    yield* runOperations(firstProcess, [
      "reset",
      "initialize-workspace",
      "configure-repository",
      "configure-runtime",
      "configure-agent",
      "configure-role-definition",
      "configure-policy",
      "evaluate-readiness",
      "create-direct-task",
      "execute-next-dispatch",
    ])

    const resumedProcess = new PersistentControlPlane(store, smokeOptions)

    yield* runOperation(resumedProcess, "open-merge-request")

    const gatesProcess = new PersistentControlPlane(store, smokeOptions)

    yield* runOperation(gatesProcess, "observe-provider-state")
    if (smokeOptions.mergeProvider === "github") {
      yield* runOperation(gatesProcess, "require-provider-verification-passed")
    } else {
      yield* runOperation(gatesProcess, "record-local-verification-passed")
    }
    yield* runOperations(gatesProcess, [
      "publish-policy-status",
      "request-review",
      "execute-next-dispatch",
      "complete-agent-review",
      "publish-policy-status",
      "record-human-approval",
      "publish-policy-status",
    ])

    if (smokeOptions.mergeEnabled !== false) {
      yield* runOperation(gatesProcess, "merge-when-ready")
    }

    return yield* Effect.tryPromise({
      try: () => gatesProcess.readSummary(),
      catch: (error) =>
        error instanceof Error
          ? error
          : new Error("Control-plane smoke flow summary failed."),
    })
  }).pipe(Effect.withSpan("control_plane.smoke_flow"))
}

function runOperations(
  controlPlane: PersistentControlPlane,
  operations: readonly ControlPlaneOperationName[]
): Effect.Effect<void, Error> {
  return Effect.forEach(operations, (operation) =>
    runOperation(controlPlane, operation)
  ).pipe(Effect.asVoid)
}

function runOperation(
  controlPlane: PersistentControlPlane,
  operation: ControlPlaneOperationName
): Effect.Effect<ControlPlaneOperationName, Error> {
  return Effect.tryPromise({
    try: async () => {
      await runControlPlaneOperation(controlPlane, operation)
      return operation
    },
    catch: (error) =>
      error instanceof Error
        ? error
        : new Error(`Control-plane operation ${operation} failed.`),
  }).pipe(
    Effect.withSpan("control_plane.smoke_flow.operation", {
      attributes: { "stoneforge.control_plane.command": operation },
    })
  )
}

function withSmokeInputs(
  options: LoadControlPlaneOptions
): LoadControlPlaneOptions {
  if (options.operationInputs !== undefined) {
    return options
  }

  return {
    ...options,
    operationInputs: localSmokeOperationInputs(options.repository),
  }
}
