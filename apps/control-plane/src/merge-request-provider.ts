import type { GitHubMergeRequestAdapter } from "@stoneforge/merge-request";

import { createFakeGitHubMergeRequestFixture } from "./fake-github-merge-request-adapter.js";
import { GitHubAppInstallationTokenProvider } from "./github-app-token-provider.js";
import { GitHubAppMergeRequestClient } from "./github-merge-request-adapter.js";
import { FetchGitHubHttpClient } from "./github-http-client.js";
import type { MergeProviderConfig } from "./github-integration-config.js";

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
  const tokenProvider = new GitHubAppInstallationTokenProvider(
    {
      appId: github.appId,
      privateKey: github.privateKey,
      installationId: github.installationId,
      owner: github.owner,
      repo: github.repo,
    },
    http,
  );

  const adapter: GitHubMergeRequestAdapter = new GitHubAppMergeRequestClient(
    github,
    tokenProvider,
    http,
  );

  return adapter;
}
