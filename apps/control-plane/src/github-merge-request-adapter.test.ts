import { Buffer } from "node:buffer";
import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { asWorkspaceId } from "@stoneforge/core";
import { asTaskId } from "@stoneforge/execution";

import type { GitHubTokenProvider } from "./index.js";
import {
  GitHubAppMergeRequestClient,
  GitHubHttpError,
  createMergeRequestAdapter,
  type GitHubHttpClient,
  type GitHubHttpRequest,
  type GitHubHttpResponse,
} from "./index.js";

class StaticTokenProvider implements GitHubTokenProvider {
  async installationToken(): Promise<string> {
    return "installation-token";
  }
}

class RecordingGitHubHttpClient implements GitHubHttpClient {
  readonly requests: GitHubHttpRequest[] = [];

  constructor(private readonly responses: Array<GitHubHttpResponse | Error>) {}

  async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error(
        `No recorded response for ${request.method} ${request.path}.`,
      );
    }

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }
}

describe("GitHubAppMergeRequestClient", () => {
  it("creates a branch, commits a task change marker, opens a PR, and observes checks", async () => {
    const http = new RecordingGitHubHttpClient([
      ok({ object: { sha: "base-sha" } }),
      new GitHubHttpError("missing branch", 404),
      ok({ ref: "refs/heads/stoneforge/task/task_1" }),
      new GitHubHttpError("missing file", 404),
      ok({ content: { sha: "file-sha" } }),
      ok([]),
      ok(providerPullRequest()),
      ok({
        ...providerPullRequest(),
        state: "open",
        merged: false,
        head: { ref: "stoneforge/task/task_1", sha: "observed-head-sha" },
      }),
      ok({
        check_runs: [
          {
            id: 1,
            name: "quality",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-04-24T12:00:00.000Z",
          },
        ],
      }),
      ok([{ id: "status-1", context: "deploy", state: "pending" }]),
    ]);
    const client = githubClient(http);

    const pullRequest = await client.createOrUpdateTaskPullRequest({
      workspaceId: asWorkspaceId("workspace_1"),
      taskId: asTaskId("task_1"),
      title: "Add policy",
      body: "Implement policy.",
      sourceBranch: "stoneforge/task/task_1",
      targetBranch: "main",
    });
    const observation = await client.observePullRequest({
      providerPullRequest: pullRequest,
    });

    expect(pullRequest.providerPullRequestId).toBe("101");
    expect(pullRequest.headSha).toBe("created-head-sha");
    expect(observation.headSha).toBe("observed-head-sha");
    expect(observation.checks).toEqual([
      {
        providerCheckId: "1",
        name: "quality",
        state: "passed",
        observedAt: "2026-04-24T12:00:00.000Z",
      },
      {
        providerCheckId: "status-1",
        name: "deploy",
        state: "running",
        observedAt: undefined,
      },
    ]);
    expect(http.requests.map((request) => request.method)).toEqual([
      "GET",
      "PATCH",
      "POST",
      "GET",
      "PUT",
      "GET",
      "POST",
      "GET",
      "GET",
      "GET",
    ]);
  });

  it("updates existing GitHub branch state and reuses the task change marker", async () => {
    const http = new RecordingGitHubHttpClient([
      ok({ object: { sha: "base-sha" } }),
      ok({ ref: "refs/heads/stoneforge/task/task_1" }),
      ok({ sha: "existing-file-sha" }),
      ok({ content: { sha: "new-file-sha" } }),
      ok([providerPullRequest()]),
    ]);
    const client = githubClient(http);

    const pullRequest = await client.createOrUpdateTaskPullRequest(
      pullRequestInput(),
    );

    expect(pullRequest.providerPullRequestId).toBe("101");
    expect(http.requests.map((request) => request.method)).toEqual([
      "GET",
      "PATCH",
      "GET",
      "PUT",
      "GET",
    ]);
    expect(http.requests[3]?.path).toBe(
      "/repos/toolco/stoneforge/contents/.stoneforge/tasks/task_1.md",
    );
    expect(http.requests[3]?.body).toEqual(
      expect.objectContaining({
        branch: "stoneforge/task/task_1",
        sha: "existing-file-sha",
      }),
    );
    expect(markerContent(http.requests[3]?.body)).toContain(
      "# Stoneforge task change task_1",
    );
  });

  it("reports branch update and malformed PR creation failures", async () => {
    await expect(
      githubClient(
        new RecordingGitHubHttpClient([
          ok({ object: { sha: "base-sha" } }),
          new Error("branch denied"),
        ]),
      ).createOrUpdateTaskPullRequest(pullRequestInput()),
    ).rejects.toThrow(
      "Could not create or update GitHub branch stoneforge/task/task_1. GitHub could not update GitHub working branch for toolco/stoneforge. branch denied",
    );

    await expect(
      githubClient(
        new RecordingGitHubHttpClient([
          ok({ object: { sha: "base-sha" } }),
          new GitHubHttpError("missing branch", 404),
          ok({ ref: "refs/heads/stoneforge/task/task_1" }),
          new GitHubHttpError("missing file", 404),
          ok({ content: { sha: "file-sha" } }),
          ok([]),
          ok(undefined),
        ]),
      ).createOrUpdateTaskPullRequest(pullRequestInput()),
    ).rejects.toThrow("GitHub PR creation returned no pull request.");
  });

  it("publishes policy checks and refuses merge when sandbox merge is disabled", async () => {
    const http = new RecordingGitHubHttpClient([ok({})]);
    const client = githubClient(http);
    const pullRequest = providerPullRequestModel();

    await client.publishPolicyCheck({
      providerPullRequest: pullRequest,
      state: "passed",
      reason: "Policy satisfied.",
    });

    await expect(
      client.mergePullRequest({
        providerPullRequest: pullRequest,
      }),
    ).rejects.toThrow("GitHub merge is disabled.");
    expect(http.requests[0]?.body).toEqual(
      expect.objectContaining({
        context: "stoneforge/policy",
        state: "success",
      }),
    );
    expect(http.requests[0]?.path).toBe(
      "/repos/toolco/stoneforge/statuses/model-head-sha",
    );
    expect(http.requests[0]?.path).not.toContain("stoneforge%2Ftask%2Ftask_1");
  });

  it("merges when enabled and reports malformed provider responses", async () => {
    await expect(
      githubClient(
        new RecordingGitHubHttpClient([ok({ merged: true })]),
        true,
      ).mergePullRequest({ providerPullRequest: providerPullRequestModel() }),
    ).resolves.toEqual({ mergedAt: "2026-04-24T12:00:00.000Z" });

    await expect(
      githubClient(
        new RecordingGitHubHttpClient([ok({ merged: false })]),
        true,
      ).mergePullRequest({ providerPullRequest: providerPullRequestModel() }),
    ).rejects.toThrow("GitHub rejected merge for PR #7.");

    await expect(
      githubClient(
        new RecordingGitHubHttpClient([ok(undefined)]),
      ).observePullRequest({
        providerPullRequest: providerPullRequestModel(),
      }),
    ).rejects.toThrow("GitHub PR observation returned no pull request.");

    expect(createMergeRequestAdapter({ provider: "fake" })).toHaveProperty(
      "pullRequestCalls",
    );
    expect(
      createMergeRequestAdapter({
        provider: "github",
        github: {
          appId: "123",
          privateKey: privateKey(),
          owner: "toolco",
          repo: "stoneforge",
          baseBranch: "main",
          sourceBranchPrefix: "stoneforge/task",
          allowMerge: false,
        },
      }),
    ).toBeInstanceOf(GitHubAppMergeRequestClient);
  });
});

function githubClient(
  http: GitHubHttpClient,
  allowMerge = false,
): GitHubAppMergeRequestClient {
  return new GitHubAppMergeRequestClient(
    {
      appId: "123",
      privateKey: "unused",
      installationId: 456,
      owner: "toolco",
      repo: "stoneforge",
      baseBranch: "main",
      sourceBranchPrefix: "stoneforge/task",
      allowMerge,
    },
    new StaticTokenProvider(),
    http,
    () => new Date("2026-04-24T12:00:00.000Z"),
  );
}

function ok(json: GitHubHttpResponse["json"]): GitHubHttpResponse {
  return { status: 200, json };
}

function providerPullRequest() {
  return {
    id: 101,
    number: 7,
    html_url: "https://github.test/toolco/stoneforge/pull/7",
    head: { ref: "stoneforge/task/task_1", sha: "created-head-sha" },
    base: { ref: "main" },
  };
}

function providerPullRequestModel() {
  return {
    provider: "github" as const,
    providerPullRequestId: "101",
    number: 7,
    url: "https://github.test/toolco/stoneforge/pull/7",
    headSha: "model-head-sha",
    sourceBranch: "stoneforge/task/task_1",
    targetBranch: "main",
  };
}

function pullRequestInput() {
  return {
    workspaceId: asWorkspaceId("workspace_1"),
    taskId: asTaskId("task_1"),
    title: "Add policy",
    body: "Implement policy.",
    sourceBranch: "stoneforge/task/task_1",
    targetBranch: "main",
  };
}

function markerContent(body: GitHubHttpRequest["body"]): string {
  const content = body?.content;

  if (typeof content !== "string") {
    return "";
  }

  return Buffer.from(content, "base64").toString("utf8");
}

function privateKey(): string {
  return generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
}
