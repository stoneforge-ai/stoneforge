import type { GitHubMergeRequestAdapter } from "@stoneforge/merge-request";

import { createFakeGitHubMergeRequestFixture } from "./fake-github-merge-request-adapter.js";
import {
  GitHubAppInstallationTokenProvider,
  type GitHubAppAuthConfig,
} from "./github-app-token-provider.js";
import { GitHubAppMergeRequestClient } from "./github-merge-request-adapter.js";
import { FetchGitHubHttpClient } from "./github-http-client.js";
import type {
  GitHubMergeRequestConfig,
  MergeProviderConfig,
} from "./github-integration-config.js";

export function createMergeRequestAdapter(
  config: MergeProviderConfig,
): GitHubMergeRequestAdapter {
  if (config.provider === "fake") {
    return createFakeGitHubMergeRequestFixture();
  }

  const github = config.github;

  if (github === undefined) {
    throw new Error("GitHub merge provider config is missing.");
  }

  const http = new FetchGitHubHttpClient(github.apiBaseUrl);
  const authConfig = githubAuthConfig(github);
  const tokenProvider = new GitHubAppInstallationTokenProvider(
    authConfig,
    http,
  );

  const adapter: GitHubMergeRequestAdapter = new GitHubAppMergeRequestClient(
    github,
    tokenProvider,
    http,
  );

  return adapter;
}

function githubAuthConfig(
  github: GitHubMergeRequestConfig,
): GitHubAppAuthConfig {
  if (github.installationId !== undefined) {
    return {
      appId: github.appId,
      privateKey: github.privateKey,
      installationId: github.installationId,
      owner: github.owner,
      repo: github.repo,
    };
  }

  return {
    appId: github.appId,
    privateKey: github.privateKey,
    owner: github.owner,
    repo: github.repo,
  };
}
