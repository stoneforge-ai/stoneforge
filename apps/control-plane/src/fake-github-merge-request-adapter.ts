import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderPullRequestObservation,
  ProviderPullRequest,
} from "@stoneforge/merge-request"

type PullRequestInput = Parameters<
  GitHubMergeRequestAdapter["createOrUpdateTaskPullRequest"]
>[0]

export interface FakePullRequestCall {
  taskId: string
  title: string
  sourceBranch: string
  targetBranch: string
}

export interface FakePolicyCheckPublication {
  providerPullRequestId: string
  state: PolicyCheckState
  reason: string
}

export interface FakeMergeCall {
  providerPullRequestId: string
  mergedAt: string
}

export interface FakeGitHubFixture extends GitHubMergeRequestAdapter {
  readonly pullRequestCalls: readonly FakePullRequestCall[]
  readonly policyChecks: readonly FakePolicyCheckPublication[]
  readonly merges: readonly FakeMergeCall[]
}

class LocalGitHubMergeRequestSink implements FakeGitHubFixture {
  readonly pullRequestCalls: FakePullRequestCall[] = []
  readonly policyChecks: FakePolicyCheckPublication[] = []
  readonly merges: FakeMergeCall[] = []

  async createOrUpdateTaskPullRequest(
    input: PullRequestInput
  ): Promise<ProviderPullRequest> {
    this.pullRequestCalls.push({
      taskId: input.taskId,
      title: input.title,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    })

    return {
      provider: "github",
      providerPullRequestId: providerPullRequestIdFor(input),
      number: 100,
      url: "https://github.example/toolco/stoneforge/pull/100",
      headSha: "local-head-sha",
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    }
  }

  async publishPolicyCheck(input: {
    providerPullRequest: ProviderPullRequest
    state: PolicyCheckState
    reason: string
  }): Promise<void> {
    this.policyChecks.push({
      providerPullRequestId: input.providerPullRequest.providerPullRequestId,
      state: input.state,
      reason: input.reason,
    })
  }

  async mergePullRequest(input: {
    providerPullRequest: ProviderPullRequest
  }): Promise<{ mergedAt: string }> {
    const mergedAt = "2026-04-24T12:00:00.000Z"

    this.merges.push({
      providerPullRequestId: input.providerPullRequest.providerPullRequestId,
      mergedAt,
    })

    return { mergedAt }
  }

  async observePullRequest(input: {
    providerPullRequest: ProviderPullRequest
  }): Promise<ProviderPullRequestObservation> {
    return {
      providerPullRequestId: input.providerPullRequest.providerPullRequestId,
      state: "open",
      headSha: input.providerPullRequest.headSha,
      checks: [
        {
          providerCheckId: "local-check-1",
          name: "local quality",
          state: "passed",
        },
      ],
    }
  }
}

export function createFakeGitHubMergeRequestFixture(): FakeGitHubFixture {
  return new LocalGitHubMergeRequestSink()
}

function providerPullRequestIdFor(input: PullRequestInput): string {
  return `github-pr-${input.taskId}`
}
