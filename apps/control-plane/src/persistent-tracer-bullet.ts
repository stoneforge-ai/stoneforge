import type { DirectTaskRunSummary } from "./direct-task-summary.js";
import type { ControlPlaneStore } from "./control-plane-store.js";
import { PersistentControlPlane } from "./persistent-control-plane.js";

export async function runPersistentTracerBullet(
  store: ControlPlaneStore,
): Promise<DirectTaskRunSummary> {
  const firstProcess = new PersistentControlPlane(store);

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

  const resumedProcess = new PersistentControlPlane(store);

  await resumedProcess.openMergeRequest();
  await resumedProcess.recordCiPassed();
  await resumedProcess.requestReview();
  await resumedProcess.runWorker();
  await resumedProcess.completeReview();
  await resumedProcess.approve();
  await resumedProcess.merge();

  return resumedProcess.readSummary();
}
