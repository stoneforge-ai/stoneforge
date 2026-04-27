import { asMergeRequestId, type MergeRequestId } from "@stoneforge/core"
import type { Task } from "@stoneforge/execution"

import { cloneMergeRequest } from "./cloning.js"
import {
  applyProviderPullRequestUpdate,
  createTaskMergeRequestRecord,
} from "./merge-request-records.js"
import type { MergeRequest, ProviderPullRequest } from "./models.js"

export interface TaskMergeRequestStore {
  mergeRequests: Map<MergeRequestId, MergeRequest>
  mergeRequestIdsByTaskId: Map<string, MergeRequestId>
  nextId(): string
  now(): string
}

export function upsertTaskMergeRequest(
  store: TaskMergeRequestStore,
  task: Task,
  providerPullRequest: ProviderPullRequest
): MergeRequest {
  const existingId = store.mergeRequestIdsByTaskId.get(task.id)

  if (existingId) {
    const existing = requireMergeRequest(store.mergeRequests, existingId)
    applyProviderPullRequestUpdate(existing, providerPullRequest, store.now())

    return cloneMergeRequest(existing)
  }

  const mergeRequest = createTaskMergeRequestRecord(
    asMergeRequestId(store.nextId()),
    task,
    providerPullRequest,
    store.now()
  )

  store.mergeRequests.set(mergeRequest.id, mergeRequest)
  store.mergeRequestIdsByTaskId.set(task.id, mergeRequest.id)

  return cloneMergeRequest(mergeRequest)
}

function requireMergeRequest(
  mergeRequests: Map<MergeRequestId, MergeRequest>,
  mergeRequestId: MergeRequestId
): MergeRequest {
  const mergeRequest = mergeRequests.get(mergeRequestId)

  if (!mergeRequest) {
    throw new Error(`MergeRequest ${mergeRequestId} does not exist.`)
  }

  return mergeRequest
}
