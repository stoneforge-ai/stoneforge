import {
  buildSummary,
  type DirectTaskRunSummary,
} from "./direct-task-summary.js"
import type { ControlPlaneStore } from "./control-plane-store.js"
import {
  loadControlPlane,
  requireImplementationSessionId,
  requireMergeRequestId,
  requireReviewSessionId,
  requireTaskId,
  requireValue,
  requireWorkspaceId,
  type LoadControlPlaneOptions,
} from "./persistent-control-plane-context.js"

export async function buildPersistentSummary(
  store: ControlPlaneStore,
  options: LoadControlPlaneOptions
): Promise<DirectTaskRunSummary> {
  const loaded = loadControlPlane(await store.load(), options)
  const current = loaded.snapshot.current
  const implementationAssignment = loaded.execution.getAssignment(
    requireValue(
      current.implementationAssignmentId,
      "No implementation Assignment exists. Run the worker first."
    )
  )
  const reviewAssignment = loaded.execution.getAssignment(
    requireValue(
      current.reviewAssignmentId,
      "No review Assignment exists. Run the review worker first."
    )
  )

  return buildSummary({
    orgId: requireValue(
      current.orgId,
      "No Org exists. Initialize a workspace first."
    ),
    workspace: loaded.setup.getWorkspace(requireWorkspaceId(current)),
    task: loaded.execution.getTask(requireTaskId(current)),
    implementation: {
      assignment: implementationAssignment,
      session: loaded.execution.getSession(
        requireImplementationSessionId(current)
      ),
    },
    review: {
      assignment: reviewAssignment,
      session: loaded.execution.getSession(requireReviewSessionId(current)),
    },
    mergeRequest: loaded.mergeRequests.getMergeRequest(
      requireMergeRequestId(current)
    ),
    verificationRun: loaded.mergeRequests.getVerificationRun(
      requireValue(
        current.verificationRunId,
        "No Verification Run exists. Record verification first."
      )
    ),
    providerSessionIds: loaded.execution.listSessions().map((session) => {
      return session.providerSessionId
    }),
  })
}
