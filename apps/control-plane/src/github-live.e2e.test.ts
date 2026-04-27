import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import { describe, expect, it } from "vitest"

import type { DirectTaskRunSummary } from "./direct-task-summary.js"
import { runControlPlaneCommand } from "./persistent-cli.js"

describe("live GitHub App MergeRequest flow", () => {
  it.skipIf(!liveGitHubEnabled())(
    "opens or reuses a sandbox PR through GitHub App installation auth",
    async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-github-live-"))
      const sqlitePath = join(tempDir, "control-plane.sqlite")
      const baseArgs = liveCommandArgs(sqlitePath)

      try {
        for (const command of setupCommands()) {
          await expectCommand([command, ...baseArgs])
        }

        await waitForPassingProviderVerification(baseArgs)

        for (const command of reviewCommands()) {
          await expectCommand([command, ...baseArgs])
        }

        if (mergeEnabled()) {
          await expectCommand(["merge-when-ready", ...baseArgs])
        }

        const summary = await commandSummary(["summary", ...baseArgs])
        expect(summary.providerPullRequestUrl).toContain("github")

        if (mergeEnabled()) {
          expect(summary.pullRequestMerged).toBe(true)
        } else {
          expect(summary.mergeRequestState).toBe("merge_ready")
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    },
    180_000
  )
})

function liveCommandArgs(sqlitePath: string): string[] {
  return [
    "--store-backend",
    "sqlite",
    "--sqlite-path",
    sqlitePath,
    "--merge-provider",
    "github",
    ...liveGitHubArgs(),
    "--json",
  ]
}

function setupCommands(): string[] {
  return [
    "reset",
    "initialize-workspace",
    "configure-repository",
    "configure-runtime",
    "configure-agent",
    "configure-role-definition",
    "configure-policy",
    "evaluate-readiness",
    "create-direct-task",
    "execute-next-dispatch",
    "open-merge-request",
  ]
}

function reviewCommands(): string[] {
  return [
    "request-review",
    "execute-next-dispatch",
    "complete-agent-review",
    "record-human-approval",
  ]
}

async function waitForPassingProviderVerification(
  baseArgs: readonly string[]
): Promise<void> {
  let latestError = "GitHub checks/statuses did not report before timeout."

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await expectCommand(["observe-provider-state", ...baseArgs])
    const gate = await runCommand([
      "require-provider-verification-passed",
      ...baseArgs,
    ])

    if (gate.code === 0) {
      return
    }

    latestError = gate.stderr
    await delay(2_000)
  }

  throw new Error(latestError)
}

async function expectCommand(argv: readonly string[]): Promise<void> {
  const result = await runCommand(argv)

  if (result.code !== 0) {
    throw new Error(result.stderr)
  }
}

async function commandSummary(
  argv: readonly string[]
): Promise<DirectTaskRunSummary> {
  const result = await runCommand(argv)

  if (result.code !== 0) {
    throw new Error(result.stderr)
  }

  return JSON.parse(result.stdout) as DirectTaskRunSummary
}

async function runCommand(argv: readonly string[]): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  let stdout = ""
  let stderr = ""
  const code = await runControlPlaneCommand(argv, {
    write: (text) => {
      stdout = text
    },
    writeError: (text) => {
      stderr = text
    },
  })

  return { code, stdout, stderr }
}

function liveGitHubEnabled(): boolean {
  return (
    process.env.STONEFORGE_GITHUB_LIVE_TESTS === "1" &&
    liveGitHubArgs().length > 0
  )
}

function liveGitHubArgs(): string[] {
  const env = process.env
  const required = [
    env.STONEFORGE_GITHUB_APP_ID,
    env.STONEFORGE_GITHUB_OWNER,
    env.STONEFORGE_GITHUB_REPO,
    env.STONEFORGE_GITHUB_BASE_BRANCH,
  ]

  if (required.some((value) => value === undefined)) {
    return []
  }

  const keyArgs = privateKeyArgs(env)

  if (keyArgs.length === 0) {
    return []
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
      env.STONEFORGE_GITHUB_INSTALLATION_ID
    ),
    ...optionalArg(
      "--github-source-branch-prefix",
      env.STONEFORGE_GITHUB_SOURCE_BRANCH_PREFIX
    ),
    ...optionalArg("--github-api-base-url", env.STONEFORGE_GITHUB_API_BASE_URL),
    ...optionalMergeArg(env.STONEFORGE_GITHUB_ALLOW_MERGE),
    ...keyArgs,
  ]
}

function privateKeyArgs(env: NodeJS.ProcessEnv): string[] {
  if (env.STONEFORGE_GITHUB_PRIVATE_KEY_PATH !== undefined) {
    return ["--github-private-key-path", env.STONEFORGE_GITHUB_PRIVATE_KEY_PATH]
  }

  if (env.STONEFORGE_GITHUB_PRIVATE_KEY !== undefined) {
    return ["--github-private-key", env.STONEFORGE_GITHUB_PRIVATE_KEY]
  }

  return []
}

function optionalArg(flag: string, value: string | undefined): string[] {
  return value === undefined ? [] : [flag, value]
}

function optionalMergeArg(value: string | undefined): string[] {
  return value === "1" || value === "true"
    ? ["--github-allow-merge", "true"]
    : []
}

function mergeEnabled(): boolean {
  return optionalMergeArg(process.env.STONEFORGE_GITHUB_ALLOW_MERGE).length > 0
}
