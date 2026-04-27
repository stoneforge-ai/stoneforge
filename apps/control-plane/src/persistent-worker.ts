import type { Assignment, Checkpoint, Session } from "@stoneforge/execution"
import type { MergeRequestService } from "@stoneforge/merge-request"

import type { LoadedControlPlane } from "./persistent-control-plane-context.js"

export function recordWorkerProgress(
  loaded: LoadedControlPlane,
  assignment: Assignment,
  session: Session
): void {
  loaded.execution.recordHeartbeat(
    session.id,
    `${assignment.owner.type} worker online`
  )
  recordTaskCheckpoint(loaded, assignment, session)
  rememberReviewAssignment(loaded.mergeRequests, assignment)
}

function recordTaskCheckpoint(
  loaded: LoadedControlPlane,
  assignment: Assignment,
  session: Session
): void {
  if (assignment.owner.type !== "task") {
    return
  }

  loaded.execution.recordCheckpoint(session.id, createCheckpoint())
}

function rememberReviewAssignment(
  mergeRequests: MergeRequestService,
  assignment: Assignment
): void {
  if (assignment.owner.type !== "merge_request") {
    return
  }

  mergeRequests.recordReviewAssignment(assignment)
}

function createCheckpoint(): Checkpoint {
  return {
    completedWork: ["Created the deterministic local code change."],
    remainingWork: ["Open the MergeRequest and run review gates."],
    importantContext: ["This checkpoint is persisted in the local JSON store."],
    capturedAt: "2026-04-24T12:00:00.000Z",
  }
}
