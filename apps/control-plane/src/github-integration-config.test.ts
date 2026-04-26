import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  githubValueFlags,
  parseMergeProviderConfig,
  type GitHubMergeRequestConfig,
  type MergeProviderConfig,
} from "./index.js";

describe("GitHub integration config", () => {
  it("defaults to the fake merge provider", () => {
    const config = parseMergeProviderConfig([], {});

    expectTypeOf(config).toEqualTypeOf<MergeProviderConfig>();
    expect(config).toEqual({ provider: "fake" });
  });

  it("parses GitHub provider config from CLI flags", () => {
    const config = parseMergeProviderConfig(
      [
        "--merge-provider",
        "github",
        "--github-app-id",
        "123",
        "--github-private-key",
        "line1\\nline2",
        "--github-installation-id",
        "456",
        "--github-owner",
        "toolco",
        "--github-repo",
        "stoneforge",
        "--github-base-branch",
        "main",
        "--github-source-branch-prefix",
        "sf/task",
        "--github-api-base-url",
        "https://github.test",
        "--github-allow-merge",
        "true",
      ],
      {},
    );

    expect(config).toEqual({
      provider: "github",
      github: {
        appId: "123",
        privateKey: "line1\nline2",
        installationId: 456,
        owner: "toolco",
        repo: "stoneforge",
        baseBranch: "main",
        sourceBranchPrefix: "sf/task",
        apiBaseUrl: "https://github.test",
        allowMerge: true,
      },
    });

    if (config.provider !== "github") {
      throw new Error("Expected GitHub provider config.");
    }

    expectTypeOf(config.github).toEqualTypeOf<GitHubMergeRequestConfig>();
  });

  it("parses GitHub provider config from environment and private key files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-github-config-"));
    const privateKeyPath = join(tempDir, "app.pem");

    try {
      await writeFile(privateKeyPath, "pem-value");

      expect(
        parseMergeProviderConfig([], {
          STONEFORGE_MERGE_PROVIDER: "github",
          STONEFORGE_GITHUB_APP_ID: "123",
          STONEFORGE_GITHUB_PRIVATE_KEY_PATH: privateKeyPath,
          STONEFORGE_GITHUB_OWNER: "toolco",
          STONEFORGE_GITHUB_REPO: "stoneforge",
          STONEFORGE_GITHUB_BASE_BRANCH: "main",
          STONEFORGE_GITHUB_ALLOW_MERGE: "1",
        }),
      ).toEqual({
        provider: "github",
        github: {
          appId: "123",
          privateKey: "pem-value",
          installationId: undefined,
          owner: "toolco",
          repo: "stoneforge",
          baseBranch: "main",
          sourceBranchPrefix: "stoneforge/task",
          allowMerge: true,
          apiBaseUrl: undefined,
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports invalid provider values and missing required GitHub config", () => {
    expect(() =>
      parseMergeProviderConfig(["--merge-provider", "gitlab"], {}),
    ).toThrow("Unknown merge provider gitlab. Use fake or github.");
    expect(() => parseMergeProviderConfig(["--merge-provider"], {})).toThrow(
      "Missing value for --merge-provider.",
    );
    expect(() =>
      parseMergeProviderConfig(["--merge-provider", "github"], {}),
    ).toThrow("GitHub App ID is required for the GitHub merge provider.");
    expect(() =>
      parseMergeProviderConfig(
        [
          "--merge-provider",
          "github",
          "--github-app-id",
          "123",
          "--github-private-key",
          "pem",
          "--github-installation-id",
          "0",
          "--github-owner",
          "toolco",
          "--github-repo",
          "stoneforge",
          "--github-base-branch",
          "main",
        ],
        {},
      ),
    ).toThrow("GitHub installation ID must be a positive integer.");
  });

  it("lists GitHub value flags consumed by the CLI parser", () => {
    expect(githubValueFlags()).toContain("--github-private-key-path");
    expect(githubValueFlags()).toContain("--github-api-base-url");
  });
});
