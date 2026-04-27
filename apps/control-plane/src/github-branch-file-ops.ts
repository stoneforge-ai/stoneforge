import type { GitHubMergeRequestAdapter } from "@stoneforge/merge-request"

import { GitHubIntegrationError } from "./github-app-token-provider.js"
import { GitHubHttpError } from "./github-http-client.js"
import type { JsonObject, JsonValue } from "./github-json.js"
import { jsonObject, requiredString } from "./github-json.js"
import {
  branchError,
  branchPath,
  changeMarkerFileContent,
} from "./github-merge-request-mapping.js"

type PullRequestInput = Parameters<
  GitHubMergeRequestAdapter["createOrUpdateTaskPullRequest"]
>[0]

export type GitHubRequest = (
  method: "GET" | "PATCH" | "POST" | "PUT",
  path: string,
  body: JsonObject | undefined,
  action: string
) => Promise<JsonValue | undefined>

export async function upsertWorkingBranchAndChangeMarker(input: {
  request: GitHubRequest
  repoPath: string
  pullRequest: PullRequestInput
  baseSha: string
  now: Date
}): Promise<void> {
  await upsertBranch(
    input.request,
    input.repoPath,
    input.pullRequest.sourceBranch,
    input.baseSha
  )
  await upsertChangeMarkerFile(input)
}

async function upsertBranch(
  request: GitHubRequest,
  repoPath: string,
  branch: string,
  sha: string
): Promise<void> {
  if (!(await branchExists(request, repoPath, branch))) {
    await createBranch(request, repoPath, branch, sha)
    return
  }

  try {
    await request(
      "PATCH",
      `/repos/${repoPath}/git/refs/heads/${branchPath(branch)}`,
      { sha, force: true },
      "update GitHub working branch"
    )
  } catch (error) {
    throw branchError(error instanceof Error ? error : undefined, branch)
  }
}

async function branchExists(
  request: GitHubRequest,
  repoPath: string,
  branch: string
): Promise<boolean> {
  try {
    await request(
      "GET",
      `/repos/${repoPath}/git/ref/heads/${branchPath(branch)}`,
      undefined,
      "read GitHub working branch"
    )

    return true
  } catch (error) {
    if (error instanceof GitHubHttpError && error.status === 404) {
      return false
    }

    throw branchError(error instanceof Error ? error : undefined, branch)
  }
}

function createBranch(
  request: GitHubRequest,
  repoPath: string,
  branch: string,
  sha: string
): Promise<JsonValue | undefined> {
  return request(
    "POST",
    `/repos/${repoPath}/git/refs`,
    { ref: `refs/heads/${branch}`, sha },
    "create GitHub working branch"
  )
}

async function upsertChangeMarkerFile(input: {
  request: GitHubRequest
  repoPath: string
  pullRequest: PullRequestInput
  now: Date
}): Promise<void> {
  const path = `.stoneforge/tasks/${encodeURIComponent(input.pullRequest.taskId)}.md`
  const existingSha = await existingFileSha(
    input.request,
    input.repoPath,
    path,
    input.pullRequest.sourceBranch
  )

  await input.request(
    "PUT",
    `/repos/${input.repoPath}/contents/${path}`,
    changeMarkerFileBody(input.pullRequest, existingSha, input.now),
    "commit GitHub task change marker"
  )
}

async function existingFileSha(
  request: GitHubRequest,
  repoPath: string,
  path: string,
  branch: string
): Promise<string | undefined> {
  try {
    const response = jsonObject(
      await request(
        "GET",
        `/repos/${repoPath}/contents/${path}?ref=${encodeURIComponent(branch)}`,
        undefined,
        "read GitHub task change marker"
      )
    )

    return requiredString(response ?? {}, "sha", "GitHub task change marker")
  } catch (error) {
    if (error instanceof GitHubHttpError && error.status === 404) {
      return undefined
    }

    throw error instanceof Error
      ? error
      : new GitHubIntegrationError("Could not read GitHub task change marker.")
  }
}

function changeMarkerFileBody(
  input: PullRequestInput,
  existingSha: string | undefined,
  now: Date
): JsonObject {
  const common: JsonObject = {
    message: `stoneforge: update task change ${input.taskId}`,
    content: Buffer.from(changeMarkerFileContent(input, now)).toString(
      "base64"
    ),
    branch: input.sourceBranch,
  }

  return existingSha === undefined ? common : { ...common, sha: existingSha }
}
