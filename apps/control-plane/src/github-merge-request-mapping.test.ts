import { describe, expect, it } from "vitest"

import { GitHubIntegrationError } from "./github-app-token-provider.js"
import { GitHubHttpError } from "./github-http-client.js"
import {
  branchError,
  branchPath,
  changeMarkerFileContent,
  checkRunObservation,
  githubActionError,
  providerPullRequest,
  pullRequestState,
  statusObservation,
  statusState,
} from "./github-merge-request-mapping.js"

describe("GitHub merge request mapping", () => {
  it("maps provider pull requests and pull request states", () => {
    expect(
      providerPullRequest({
        id: 123,
        number: 7,
        html_url: "https://github.test/toolco/stoneforge/pull/7",
        head: { ref: "stoneforge/task/1", sha: "provider-head-sha" },
        base: { ref: "main" },
      })
    ).toMatchObject({
      providerPullRequestId: "123",
      number: 7,
      headSha: "provider-head-sha",
      sourceBranch: "stoneforge/task/1",
      targetBranch: "main",
    })
    expect(pullRequestState({ merged: true, state: "closed" })).toBe("merged")
    expect(pullRequestState({ state: "closed" })).toBe("closed")
    expect(pullRequestState({ state: "open" })).toBe("open")
  })

  it("maps check and status states", () => {
    expect(statusState("passed")).toBe("success")
    expect(statusState("failed")).toBe("failure")
    expect(statusState("pending")).toBe("pending")
    expect(checkRunObservation(null)).toEqual([])
    expect(
      checkRunObservation({ id: 1, name: "quality", status: "queued" })
    ).toEqual([
      {
        providerCheckId: "1",
        name: "quality",
        state: "queued",
        observedAt: undefined,
      },
    ])
    expect(
      checkRunObservation({ id: 2, name: "quality", status: "in_progress" })
    ).toEqual([
      {
        providerCheckId: "2",
        name: "quality",
        state: "running",
        observedAt: undefined,
      },
    ])
    expect(
      checkRunObservation({
        id: 3,
        name: "quality",
        status: "completed",
        conclusion: "success",
      })
    ).toEqual([
      {
        providerCheckId: "3",
        name: "quality",
        state: "passed",
        observedAt: undefined,
      },
    ])
    expect(
      checkRunObservation({
        id: 4,
        name: "quality",
        status: "completed",
        conclusion: "cancelled",
      })
    ).toEqual([
      {
        providerCheckId: "4",
        name: "quality",
        state: "canceled",
        observedAt: undefined,
      },
    ])
    expect(
      checkRunObservation({
        id: 5,
        name: "quality",
        status: "completed",
        conclusion: "failure",
      })
    ).toEqual([
      {
        providerCheckId: "5",
        name: "quality",
        state: "failed",
        observedAt: undefined,
      },
    ])
    expect(checkRunObservation({ id: 6, name: "quality" })).toEqual([
      {
        providerCheckId: "6",
        name: "quality",
        state: "failed",
        observedAt: undefined,
      },
    ])
    expect(statusObservation("not object")).toEqual([])
    expect(
      statusObservation({ id: 1, context: "ci", state: "success" })
    ).toEqual([
      {
        providerCheckId: "1",
        name: "ci",
        state: "passed",
        observedAt: undefined,
      },
    ])
    expect(
      statusObservation({ id: "s2", context: "ci", state: "pending" })
    ).toEqual([
      {
        providerCheckId: "s2",
        name: "ci",
        state: "running",
        observedAt: undefined,
      },
    ])
    expect(
      statusObservation({ id: "s3", context: "ci", state: "error" })
    ).toEqual([
      {
        providerCheckId: "s3",
        name: "ci",
        state: "failed",
        observedAt: undefined,
      },
    ])
  })

  it("formats paths, change-marker content, and provider errors", () => {
    expect(branchPath("stoneforge/task 1")).toBe("stoneforge/task%201")
    expect(
      changeMarkerFileContent(
        {
          taskId: "task-1",
          title: "Add policy",
          body: "Implement the policy.",
        },
        new Date("2026-04-24T12:00:00.000Z")
      )
    ).toContain("Updated: 2026-04-24T12:00:00.000Z")
    expect(branchError(new Error("no ref"), "feature/x").message).toContain(
      "no ref"
    )
    expect(
      githubActionError(
        new GitHubHttpError("forbidden", 403, { message: "blocked" }),
        "merge",
        "toolco",
        "stoneforge"
      ).message
    ).toContain("repository access and installation grants")
    expect(
      githubActionError(
        new GitHubIntegrationError("already explained"),
        "merge",
        "toolco",
        "stoneforge"
      ).message
    ).toBe("already explained")
    expect(
      githubActionError(undefined, "merge", "toolco", "stoneforge").message
    ).toContain("No provider error details were available.")
  })
})
