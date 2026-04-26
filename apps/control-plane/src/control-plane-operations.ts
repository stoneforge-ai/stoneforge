import type { ControlPlaneCommandStatus } from "./control-plane-store.js";
import type { PersistentControlPlane } from "./persistent-control-plane.js";

export const controlPlaneOperationNames = [
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
  "open-merge-request",
  "observe-provider-state",
  "require-provider-verification-passed",
  "record-local-verification-passed",
  "publish-policy-status",
  "request-review",
  "complete-agent-review",
  "record-human-approval",
  "merge-when-ready",
] as const;

export type ControlPlaneOperationName =
  (typeof controlPlaneOperationNames)[number];

type ControlPlaneOperationHandler = (
  controlPlane: PersistentControlPlane,
) => Promise<ControlPlaneCommandStatus>;

const controlPlaneOperationHandlers = {
  reset: (controlPlane) => controlPlane.reset(),
  "initialize-workspace": (controlPlane) => controlPlane.initializeWorkspace(),
  "configure-repository": (controlPlane) => controlPlane.configureRepository(),
  "configure-runtime": (controlPlane) => controlPlane.configureRuntime(),
  "configure-agent": (controlPlane) => controlPlane.configureAgent(),
  "configure-role-definition": (controlPlane) =>
    controlPlane.configureRoleDefinition(),
  "configure-policy": (controlPlane) => controlPlane.configurePolicy(),
  "evaluate-readiness": (controlPlane) => controlPlane.evaluateReadiness(),
  "create-direct-task": (controlPlane) => controlPlane.createDirectTask(),
  "execute-next-dispatch": (controlPlane) => controlPlane.executeNextDispatch(),
  "open-merge-request": (controlPlane) => controlPlane.openMergeRequest(),
  "observe-provider-state": (controlPlane) =>
    controlPlane.observeProviderState(),
  "require-provider-verification-passed": (controlPlane) =>
    controlPlane.requireObservedProviderVerificationPassed(),
  "record-local-verification-passed": (controlPlane) =>
    controlPlane.recordLocalVerificationPassed(),
  "publish-policy-status": (controlPlane) => controlPlane.publishPolicyStatus(),
  "request-review": (controlPlane) => controlPlane.requestReview(),
  "complete-agent-review": (controlPlane) => controlPlane.completeAgentReview(),
  "record-human-approval": (controlPlane) => controlPlane.recordHumanApproval(),
  "merge-when-ready": (controlPlane) => controlPlane.mergeWhenReady(),
} satisfies Record<ControlPlaneOperationName, ControlPlaneOperationHandler>;

export function runControlPlaneOperation(
  controlPlane: PersistentControlPlane,
  operation: ControlPlaneOperationName,
): Promise<ControlPlaneCommandStatus> {
  return controlPlaneOperationHandlers[operation](controlPlane);
}
