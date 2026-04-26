import type { DirectTaskRunSummary } from "./direct-task-summary.js";
import type { ControlPlaneStore } from "./control-plane-store.js";
import { PersistentControlPlane } from "./persistent-control-plane.js";
import type { LoadControlPlaneOptions } from "./persistent-control-plane-context.js";

export async function runPersistentTracerBullet(
  store: ControlPlaneStore,
  options: LoadControlPlaneOptions = {},
): Promise<DirectTaskRunSummary> {
  const firstProcess = new PersistentControlPlane(store, options);

  await firstProcess.reset();
  await firstProcess.initializeWorkspace();
  await firstProcess.configureRepository();
  await firstProcess.configureRuntime();
  await firstProcess.configureAgent();
  await firstProcess.configureRole();
  await firstProcess.configurePolicy();
  await firstProcess.validateWorkspace();
  await firstProcess.createDirectTask();
  await firstProcess.runWorker();

  const resumedProcess = new PersistentControlPlane(store, options);

  await resumedProcess.openMergeRequest();

  const gatesProcess = new PersistentControlPlane(store, options);

  await gatesProcess.observeProviderState();
  if (options.mergeProvider === "github") {
    await gatesProcess.requireObservedProviderVerificationPassed();
  } else {
    await gatesProcess.recordVerificationPassed();
  }
  await gatesProcess.requestReview();
  await gatesProcess.runWorker();
  await gatesProcess.completeReview();
  await gatesProcess.approve();

  if (options.mergeEnabled !== false) {
    await gatesProcess.merge();
  }

  return gatesProcess.readSummary();
}
