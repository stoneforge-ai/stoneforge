import { Context, Data, Effect, Layer } from "effect"

import type { MergeRequestId, WorkspaceId } from "@stoneforge/core"
import type { TaskId } from "@stoneforge/execution"

import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderPullRequest,
  ProviderPullRequestObservation,
} from "./models.js"

type CreateOrUpdateTaskPullRequestInput = Parameters<
  GitHubMergeRequestAdapter["createOrUpdateTaskPullRequest"]
>[0]

type PublishPolicyCheckInput = Parameters<
  GitHubMergeRequestAdapter["publishPolicyCheck"]
>[0]

type MergePullRequestInput = Parameters<
  GitHubMergeRequestAdapter["mergePullRequest"]
>[0]

type ObservePullRequestInput = Parameters<
  GitHubMergeRequestAdapter["observePullRequest"]
>[0]

export class MergeRequestAdapterService extends Context.Tag(
  "@stoneforge/merge-request/MergeRequestAdapterService"
)<MergeRequestAdapterService, GitHubMergeRequestAdapter>() {}

export function mergeRequestRuntime(
  adapter: GitHubMergeRequestAdapter
): Layer.Layer<MergeRequestAdapterService> {
  return Layer.succeed(MergeRequestAdapterService, adapter)
}

export class CreateOrUpdatePullRequestFailed extends Data.TaggedError(
  "CreateOrUpdatePullRequestFailed"
)<{
  readonly workspaceId: WorkspaceId
  readonly taskId: TaskId
}> {
  get message(): string {
    return `GitHub adapter failed to create or update the pull request for Task ${this.taskId}.`
  }
}

export class PublishPolicyCheckFailed extends Data.TaggedError(
  "PublishPolicyCheckFailed"
)<{
  readonly mergeRequestId: MergeRequestId
  readonly state: PolicyCheckState
}> {
  get message(): string {
    return `GitHub adapter failed to publish the ${this.state} policy check for MergeRequest ${this.mergeRequestId}.`
  }
}

export class MergePullRequestFailed extends Data.TaggedError(
  "MergePullRequestFailed"
)<{
  readonly mergeRequestId: MergeRequestId
}> {
  get message(): string {
    return `GitHub adapter failed to merge MergeRequest ${this.mergeRequestId}.`
  }
}

export class ObservePullRequestFailed extends Data.TaggedError(
  "ObservePullRequestFailed"
)<{
  readonly mergeRequestId: MergeRequestId
}> {
  get message(): string {
    return `GitHub adapter failed to observe MergeRequest ${this.mergeRequestId}.`
  }
}

export function createOrUpdateTaskPullRequest(
  input: CreateOrUpdateTaskPullRequestInput
): Effect.Effect<
  ProviderPullRequest,
  CreateOrUpdatePullRequestFailed,
  MergeRequestAdapterService
> {
  return Effect.gen(function* () {
    const adapter = yield* MergeRequestAdapterService

    return yield* Effect.tryPromise({
      try: () => adapter.createOrUpdateTaskPullRequest(input),
      catch: () =>
        new CreateOrUpdatePullRequestFailed({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        }),
    })
  }).pipe(
    Effect.withSpan("github.open_merge_request", {
      attributes: {
        "stoneforge.workspace.id": input.workspaceId,
        "stoneforge.task.id": input.taskId,
        "stoneforge.provider.name": "github",
        "stoneforge.provider.operation": "create_or_update_pull_request",
      },
    })
  )
}

export function publishPolicyCheck(
  input: PublishPolicyCheckInput
): Effect.Effect<void, PublishPolicyCheckFailed, MergeRequestAdapterService> {
  return Effect.gen(function* () {
    const adapter = yield* MergeRequestAdapterService

    yield* Effect.tryPromise({
      try: () => adapter.publishPolicyCheck(input),
      catch: () =>
        new PublishPolicyCheckFailed({
          mergeRequestId: input.mergeRequestId,
          state: input.state,
        }),
    })
  }).pipe(
    Effect.withSpan("github.publish_policy_check", {
      attributes: {
        "stoneforge.merge_request.id": input.mergeRequestId,
        "stoneforge.policy.decision": input.state,
        "stoneforge.provider.name": "github",
        "stoneforge.provider.operation": "publish_policy_check",
      },
    })
  )
}

export function mergePullRequest(
  input: MergePullRequestInput
): Effect.Effect<
  { mergedAt: string },
  MergePullRequestFailed,
  MergeRequestAdapterService
> {
  return Effect.gen(function* () {
    const adapter = yield* MergeRequestAdapterService

    return yield* Effect.tryPromise({
      try: () => adapter.mergePullRequest(input),
      catch: () =>
        new MergePullRequestFailed({
          mergeRequestId: input.mergeRequestId,
        }),
    })
  }).pipe(
    Effect.withSpan("github.merge_pull_request", {
      attributes: {
        "stoneforge.merge_request.id": input.mergeRequestId,
        "stoneforge.provider.name": "github",
        "stoneforge.provider.operation": "merge_pull_request",
      },
    })
  )
}

export function observePullRequest(
  input: ObservePullRequestInput
): Effect.Effect<
  ProviderPullRequestObservation,
  ObservePullRequestFailed,
  MergeRequestAdapterService
> {
  return Effect.gen(function* () {
    const adapter = yield* MergeRequestAdapterService

    return yield* Effect.tryPromise({
      try: () => adapter.observePullRequest(input),
      catch: () =>
        new ObservePullRequestFailed({
          mergeRequestId: input.mergeRequestId,
        }),
    })
  }).pipe(
    Effect.withSpan("github.observe_pull_request", {
      attributes: {
        "stoneforge.merge_request.id": input.mergeRequestId,
        "stoneforge.provider.name": "github",
        "stoneforge.provider.operation": "observe_pull_request",
      },
    })
  )
}
