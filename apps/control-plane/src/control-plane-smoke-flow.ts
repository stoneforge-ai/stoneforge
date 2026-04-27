import type { DirectTaskRunSummary } from "./direct-task-summary.js"
import type { ControlPlaneStore } from "./control-plane-store.js"
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
  const smokeOptions = withSmokeInputs(options)
  const firstProcess = new PersistentControlPlane(store, smokeOptions)

  await runOperations(firstProcess, [
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

  await runControlPlaneOperation(resumedProcess, "open-merge-request")

  const gatesProcess = new PersistentControlPlane(store, smokeOptions)

  await runControlPlaneOperation(gatesProcess, "observe-provider-state")
  if (smokeOptions.mergeProvider === "github") {
    await runControlPlaneOperation(
      gatesProcess,
      "require-provider-verification-passed"
    )
  } else {
    await runControlPlaneOperation(
      gatesProcess,
      "record-local-verification-passed"
    )
  }
  await runOperations(gatesProcess, [
    "publish-policy-status",
    "request-review",
    "execute-next-dispatch",
    "complete-agent-review",
    "publish-policy-status",
    "record-human-approval",
    "publish-policy-status",
  ])

  if (smokeOptions.mergeEnabled !== false) {
    await runControlPlaneOperation(gatesProcess, "merge-when-ready")
  }

  return gatesProcess.readSummary()
}

async function runOperations(
  controlPlane: PersistentControlPlane,
  operations: readonly ControlPlaneOperationName[]
): Promise<void> {
  for (const operation of operations) {
    await runControlPlaneOperation(controlPlane, operation)
  }
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
