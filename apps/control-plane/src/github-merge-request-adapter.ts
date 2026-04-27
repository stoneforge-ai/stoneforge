import type {
  GitHubMergeRequestAdapter,
  PolicyCheckState,
  ProviderCheckObservation,
  ProviderPullRequest,
  ProviderPullRequestObservation,
} from "@stoneforge/merge-request"

import type { GitHubTokenProvider } from "./github-app-token-provider.js"
import { GitHubIntegrationError } from "./github-app-token-provider.js"
import { upsertWorkingBranchAndChangeMarker } from "./github-branch-file-ops.js"
import type { GitHubMergeRequestConfig } from "./github-integration-config.js"
import type { GitHubHttpClient } from "./github-http-client.js"
import { GitHubHttpError } from "./github-http-client.js"
import {
  type JsonObject,
  type JsonValue,
  jsonArray,
  jsonBoolean,
  jsonObject,
  requiredNumber,
  requiredString,
} from "./github-json.js"
import {
  branchPath,
  checkRunObservation,
  githubActionError,
  providerPullRequest,
  pullRequestState,
  statusObservation,
  statusState,
} from "./github-merge-request-mapping.js"

type PullRequestInput = Parameters<
  GitHubMergeRequestAdapter["createOrUpdateTaskPullRequest"]
>[0]

export class GitHubAppMergeRequestClient implements GitHubMergeRequestAdapter {
  constructor(
    private readonly config: GitHubMergeRequestConfig,
    private readonly tokenProvider: GitHubTokenProvider,
    private readonly http: GitHubHttpClient,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createOrUpdateTaskPullRequest(
    input: PullRequestInput
  ): Promise<ProviderPullRequest> {
    const token = await this.tokenProvider.installationToken()
    const baseSha = await this.baseBranchSha(token, input.targetBranch)

    await upsertWorkingBranchAndChangeMarker({
      request: (method, path, body, action) => {
        return this.request(token, method, path, body, action)
      },
      repoPath: this.repoPath(),
      pullRequest: input,
      baseSha,
      now: this.now(),
    })

    const pullRequest =
      (await this.findOpenPullRequest(token, input)) ??
      (await this.createPullRequest(token, input))

    return providerPullRequest(pullRequest)
  }

  async publishPolicyCheck(input: {
    providerPullRequest: ProviderPullRequest
    state: PolicyCheckState
    reason: string
  }): Promise<void> {
    const token = await this.tokenProvider.installationToken()
    const headSha = encodeURIComponent(input.providerPullRequest.headSha)

    await this.request(
      token,
      "POST",
      `/repos/${this.repoPath()}/statuses/${headSha}`,
      {
        state: statusState(input.state),
        context: "stoneforge/policy",
        description: input.reason.slice(0, 140),
        target_url: input.providerPullRequest.url,
      },
      "publish Stoneforge policy check"
    )
  }

  async mergePullRequest(input: {
    providerPullRequest: ProviderPullRequest
  }): Promise<{ mergedAt: string }> {
    if (!this.config.allowMerge) {
      throw new GitHubIntegrationError(
        "GitHub merge is disabled. Set --github-allow-merge only for a sandbox repository and branch."
      )
    }

    const token = await this.tokenProvider.installationToken()
    const response = jsonObject(
      await this.request(
        token,
        "PUT",
        `/repos/${this.repoPath()}/pulls/${input.providerPullRequest.number}/merge`,
        { merge_method: "squash" },
        "merge GitHub pull request"
      )
    )

    if (jsonBoolean(response?.merged) !== true) {
      throw new GitHubIntegrationError(
        `GitHub rejected merge for PR #${input.providerPullRequest.number}. Check branch protection and required checks.`
      )
    }

    return { mergedAt: this.now().toISOString() }
  }

  async observePullRequest(input: {
    providerPullRequest: ProviderPullRequest
  }): Promise<ProviderPullRequestObservation> {
    const token = await this.tokenProvider.installationToken()
    const pullRequest = jsonObject(
      await this.request(
        token,
        "GET",
        `/repos/${this.repoPath()}/pulls/${input.providerPullRequest.number}`,
        undefined,
        "observe GitHub pull request"
      )
    )

    if (!pullRequest) {
      throw new GitHubIntegrationError(
        "GitHub PR observation returned no pull request."
      )
    }
    const observedHeadSha = headSha(pullRequest)

    return {
      providerPullRequestId: String(
        requiredNumber(pullRequest, "id", "GitHub PR observation")
      ),
      state: pullRequestState(pullRequest),
      headSha: observedHeadSha,
      checks: await this.checkObservations(token, observedHeadSha),
    }
  }

  private async baseBranchSha(token: string, branch: string): Promise<string> {
    const response = jsonObject(
      await this.request(
        token,
        "GET",
        `/repos/${this.repoPath()}/git/ref/heads/${branchPath(branch)}`,
        undefined,
        "read GitHub base branch"
      )
    )

    return requiredString(
      jsonObject(response?.object) ?? {},
      "sha",
      "GitHub base branch ref"
    )
  }

  private async findOpenPullRequest(
    token: string,
    input: PullRequestInput
  ): Promise<JsonObject | undefined> {
    const head = `${this.config.owner}:${input.sourceBranch}`
    const response = await this.request(
      token,
      "GET",
      `/repos/${this.repoPath()}/pulls?head=${encodeURIComponent(head)}&base=${encodeURIComponent(input.targetBranch)}&state=open`,
      undefined,
      "reuse GitHub pull request"
    )

    return jsonArray(response).map(jsonObject).find(isPresent)
  }

  private async createPullRequest(
    token: string,
    input: PullRequestInput
  ): Promise<JsonObject> {
    const response = jsonObject(
      await this.request(
        token,
        "POST",
        `/repos/${this.repoPath()}/pulls`,
        {
          title: input.title,
          body: input.body,
          head: input.sourceBranch,
          base: input.targetBranch,
        },
        "create GitHub pull request"
      )
    )

    if (!response) {
      throw new GitHubIntegrationError(
        "GitHub PR creation returned no pull request."
      )
    }

    return response
  }

  private async checkObservations(
    token: string,
    sha: string
  ): Promise<ProviderCheckObservation[]> {
    const [checkRuns, statuses] = await Promise.all([
      this.checkRuns(token, sha),
      this.statuses(token, sha),
    ])

    return [...checkRuns, ...statuses]
  }

  private async checkRuns(
    token: string,
    sha: string
  ): Promise<ProviderCheckObservation[]> {
    const response = jsonObject(
      await this.request(
        token,
        "GET",
        `/repos/${this.repoPath()}/commits/${sha}/check-runs`,
        undefined,
        "observe GitHub checks"
      )
    )

    return jsonArray(response?.check_runs).flatMap(checkRunObservation)
  }

  private async statuses(
    token: string,
    sha: string
  ): Promise<ProviderCheckObservation[]> {
    const response = await this.request(
      token,
      "GET",
      `/repos/${this.repoPath()}/commits/${sha}/statuses`,
      undefined,
      "observe GitHub statuses"
    )

    return jsonArray(response)
      .flatMap(statusObservation)
      .filter(isProviderCheck)
  }

  private async request(
    token: string,
    method: "GET" | "PATCH" | "POST" | "PUT",
    path: string,
    body: JsonObject | undefined,
    action: string
  ): Promise<JsonValue | undefined> {
    try {
      const response =
        method === "GET"
          ? await this.http.request({ method, path, token })
          : await this.http.request({ method, path, token, body })

      return response.json
    } catch (error) {
      if (error instanceof GitHubHttpError && error.status === 404) {
        throw error
      }

      throw githubActionError(
        error instanceof Error ? error : undefined,
        action,
        this.config.owner,
        this.config.repo
      )
    }
  }

  private repoPath(): string {
    return `${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}`
  }
}

function headSha(pullRequest: JsonObject): string {
  return requiredString(
    jsonObject(pullRequest.head) ?? {},
    "sha",
    "GitHub PR observation"
  )
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined
}

function isProviderCheck(observation: ProviderCheckObservation): boolean {
  return observation.name !== "stoneforge/policy"
}
