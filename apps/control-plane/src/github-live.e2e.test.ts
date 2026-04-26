import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DirectTaskRunSummary } from "./direct-task-summary.js";
import { runControlPlaneCommand } from "./persistent-cli.js";

describe("live GitHub App MergeRequest flow", () => {
  it.skipIf(!liveGitHubEnabled())(
    "opens or reuses a sandbox PR through GitHub App installation auth",
    async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-github-live-"));
      const sqlitePath = join(tempDir, "control-plane.sqlite");

      try {
        const result = await runCommand([
          "tracer-bullet",
          "--store-backend",
          "sqlite",
          "--sqlite-path",
          sqlitePath,
          "--merge-provider",
          "github",
          ...liveGitHubArgs(),
          "--json",
        ]);
        const summary = JSON.parse(result.stdout) as DirectTaskRunSummary;

        expect(result.code).toBe(0);
        expect(summary.providerPullRequestUrl).toContain("github");
        expect(
          summary.mergeRequestState === "merge_ready" ||
            summary.pullRequestMerged,
        ).toBe(true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

async function runCommand(argv: readonly string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  const code = await runControlPlaneCommand(argv, {
    write: (text) => {
      stdout = text;
    },
    writeError: (text) => {
      stderr = text;
    },
  });

  return { code, stdout, stderr };
}

function liveGitHubEnabled(): boolean {
  return (
    process.env.STONEFORGE_GITHUB_LIVE_TESTS === "1" &&
    liveGitHubArgs().length > 0
  );
}

function liveGitHubArgs(): string[] {
  const env = process.env;
  const required = [
    env.STONEFORGE_GITHUB_APP_ID,
    env.STONEFORGE_GITHUB_OWNER,
    env.STONEFORGE_GITHUB_REPO,
    env.STONEFORGE_GITHUB_BASE_BRANCH,
  ];

  if (required.some((value) => value === undefined)) {
    return [];
  }

  const keyArgs = privateKeyArgs(env);

  if (keyArgs.length === 0) {
    return [];
  }

  return [
    "--github-app-id",
    env.STONEFORGE_GITHUB_APP_ID ?? "",
    "--github-owner",
    env.STONEFORGE_GITHUB_OWNER ?? "",
    "--github-repo",
    env.STONEFORGE_GITHUB_REPO ?? "",
    "--github-base-branch",
    env.STONEFORGE_GITHUB_BASE_BRANCH ?? "",
    ...optionalArg(
      "--github-installation-id",
      env.STONEFORGE_GITHUB_INSTALLATION_ID,
    ),
    ...optionalArg(
      "--github-source-branch-prefix",
      env.STONEFORGE_GITHUB_SOURCE_BRANCH_PREFIX,
    ),
    ...optionalArg("--github-api-base-url", env.STONEFORGE_GITHUB_API_BASE_URL),
    ...optionalMergeArg(env.STONEFORGE_GITHUB_ALLOW_MERGE),
    ...keyArgs,
  ];
}

function privateKeyArgs(env: NodeJS.ProcessEnv): string[] {
  if (env.STONEFORGE_GITHUB_PRIVATE_KEY !== undefined) {
    return ["--github-private-key", env.STONEFORGE_GITHUB_PRIVATE_KEY];
  }

  return optionalArg(
    "--github-private-key-path",
    env.STONEFORGE_GITHUB_PRIVATE_KEY_PATH,
  );
}

function optionalArg(flag: string, value: string | undefined): string[] {
  return value === undefined ? [] : [flag, value];
}

function optionalMergeArg(value: string | undefined): string[] {
  return value === "1" || value === "true"
    ? ["--github-allow-merge", "true"]
    : [];
}
