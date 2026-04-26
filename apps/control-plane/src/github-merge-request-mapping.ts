import type {
  CIRunState,
  PolicyCheckState,
  ProviderCheckObservation,
  ProviderPullRequest,
  ProviderPullRequestObservation,
} from "@stoneforge/merge-request";

import { GitHubIntegrationError } from "./github-app-token-provider.js";
import { GitHubHttpError } from "./github-http-client.js";
import {
  type JsonObject,
  type JsonValue,
  jsonBoolean,
  jsonObject,
  jsonString,
  requiredNumber,
  requiredString,
} from "./github-json.js";

export interface GitHubTaskPullRequestInput {
  taskId: string;
  title: string;
  body: string;
}

export function providerPullRequest(json: JsonObject): ProviderPullRequest {
  return {
    provider: "github",
    providerPullRequestId: String(
      requiredNumber(json, "id", "GitHub pull request"),
    ),
    number: requiredNumber(json, "number", "GitHub pull request"),
    url: requiredString(json, "html_url", "GitHub pull request"),
    headSha: requiredString(
      jsonObject(json.head) ?? {},
      "sha",
      "GitHub pull request head",
    ),
    sourceBranch: requiredString(
      jsonObject(json.head) ?? {},
      "ref",
      "GitHub pull request head",
    ),
    targetBranch: requiredString(
      jsonObject(json.base) ?? {},
      "ref",
      "GitHub pull request base",
    ),
  };
}

export function statusState(state: PolicyCheckState): string {
  switch (state) {
    case "passed":
      return "success";
    case "failed":
      return "failure";
    case "pending":
      return "pending";
  }
}

export function pullRequestState(
  json: JsonObject,
): ProviderPullRequestObservation["state"] {
  if (jsonBoolean(json.merged) === true) {
    return "merged";
  }

  return requiredString(json, "state", "GitHub PR observation") === "closed"
    ? "closed"
    : "open";
}

export function branchPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

export function changeMarkerFileContent(
  input: GitHubTaskPullRequestInput,
  updatedAt: Date,
): string {
  return [
    `# Stoneforge task change ${input.taskId}`,
    "",
    `Task: ${input.title}`,
    `Updated: ${updatedAt.toISOString()}`,
    "",
    input.body,
    "",
  ].join("\n");
}

export function checkRunObservation(
  value: JsonValue | undefined,
): ProviderCheckObservation[] {
  const object = jsonObject(value);

  if (!object) {
    return [];
  }

  return [
    {
      providerCheckId: String(requiredNumber(object, "id", "GitHub check run")),
      name: requiredString(object, "name", "GitHub check run"),
      state: checkRunState(
        jsonString(object.status),
        jsonString(object.conclusion),
      ),
      observedAt: jsonString(object.completed_at) ?? undefined,
    },
  ];
}

export function statusObservation(
  value: JsonValue | undefined,
): ProviderCheckObservation[] {
  const object = jsonObject(value);

  if (!object) {
    return [];
  }

  return [
    {
      providerCheckId: requiredString(object, "id", "GitHub status"),
      name: requiredString(object, "context", "GitHub status"),
      state: statusRunState(requiredString(object, "state", "GitHub status")),
      observedAt: jsonString(object.updated_at) ?? undefined,
    },
  ];
}

export function branchError(
  error: Error | undefined,
  branch: string,
): GitHubIntegrationError {
  return new GitHubIntegrationError(
    `Could not create or update GitHub branch ${branch}. ${errorMessage(error)}`,
  );
}

export function githubActionError(
  error: Error | undefined,
  action: string,
  owner: string,
  repo: string,
): GitHubIntegrationError {
  if (error instanceof GitHubIntegrationError) {
    return error;
  }

  if (error instanceof GitHubHttpError && error.status === 403) {
    return new GitHubIntegrationError(
      `GitHub could not ${action} for ${owner}/${repo}. Check GitHub App repository access and installation grants.`,
    );
  }

  return new GitHubIntegrationError(
    `GitHub could not ${action} for ${owner}/${repo}. ${errorMessage(error)}`,
  );
}

function checkRunState(
  status: string | undefined,
  conclusion: string | undefined,
): CIRunState {
  switch (status) {
    case "queued":
      return "queued";
    case "in_progress":
      return "running";
    case undefined:
    default:
      return checkConclusionState(conclusion);
  }
}

function checkConclusionState(conclusion: string | undefined): CIRunState {
  switch (conclusion) {
    case "success":
    case "neutral":
    case "skipped":
      return "passed";
    case "cancelled":
      return "canceled";
    case undefined:
    default:
      return "failed";
  }
}

function statusRunState(state: string): CIRunState {
  switch (state) {
    case "success":
      return "passed";
    case "pending":
      return "running";
    default:
      return "failed";
  }
}

function errorMessage(error: Error | undefined): string {
  return error?.message ?? "No provider error details were available.";
}
