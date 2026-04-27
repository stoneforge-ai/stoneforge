import type { TaskDispatchService } from "@stoneforge/execution"

import type { MergeRequest, ProviderPullRequestObservation } from "./models.js"

export function reconcileProviderPullRequestObservation(input: {
  execution: TaskDispatchService
  mergeRequest: MergeRequest
  observation: ProviderPullRequestObservation
  observedAt: string
}): "open" | "terminal" {
  assertMatchingProviderPullRequest(input.mergeRequest, input.observation)

  input.mergeRequest.providerPullRequest = {
    ...input.mergeRequest.providerPullRequest,
    headSha: input.observation.headSha,
  }

  if (input.observation.state === "merged") {
    recordProviderMerged(input)
    return "terminal"
  }

  if (input.observation.state === "closed") {
    recordProviderClosedUnmerged(input)
    return "terminal"
  }

  input.mergeRequest.updatedAt = input.observedAt
  return "open"
}

function assertMatchingProviderPullRequest(
  mergeRequest: MergeRequest,
  observation: ProviderPullRequestObservation
): void {
  if (
    observation.providerPullRequestId ===
    mergeRequest.providerPullRequest.providerPullRequestId
  ) {
    return
  }

  throw new Error(
    `Provider observation ${observation.providerPullRequestId} does not match MergeRequest ${mergeRequest.id}.`
  )
}

function recordProviderMerged(input: {
  execution: TaskDispatchService
  mergeRequest: MergeRequest
  observedAt: string
}): void {
  input.mergeRequest.state = "merged"
  input.mergeRequest.mergedAt = input.observedAt
  input.mergeRequest.updatedAt = input.observedAt
  input.execution.completeTaskAfterMerge(input.mergeRequest.sourceOwner.taskId)
}

function recordProviderClosedUnmerged(input: {
  mergeRequest: MergeRequest
  observedAt: string
}): void {
  input.mergeRequest.state = "closed_unmerged"
  input.mergeRequest.updatedAt = input.observedAt
}
