import { readFileSync } from "node:fs"

import { GitHubIntegrationError } from "./github-app-token-provider.js"

export type MergeProvider = "fake" | "github"

export interface GitHubMergeRequestConfig {
  appId: string
  privateKey: string
  installationId?: number
  owner: string
  repo: string
  baseBranch: string
  sourceBranchPrefix: string
  allowMerge: boolean
  apiBaseUrl?: string
}

export type MergeProviderConfig =
  | { provider: "fake" }
  | { provider: "github"; github: GitHubMergeRequestConfig }

const githubValueFlagList = [
  "--merge-provider",
  "--github-app-id",
  "--github-private-key",
  "--github-private-key-path",
  "--github-installation-id",
  "--github-owner",
  "--github-repo",
  "--github-base-branch",
  "--github-source-branch-prefix",
  "--github-api-base-url",
] as const

export function parseMergeProviderConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv
): MergeProviderConfig {
  const provider = mergeProvider(
    optionValue(argv, "--merge-provider") ??
      env.STONEFORGE_MERGE_PROVIDER ??
      "fake"
  )

  if (provider === "fake") {
    return { provider }
  }

  return { provider, github: parseGitHubConfig(argv, env) }
}

export function githubValueFlags(): typeof githubValueFlagList {
  return githubValueFlagList
}

function parseGitHubConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv
): GitHubMergeRequestConfig {
  return {
    appId: requiredConfig(
      "GitHub App ID",
      githubConfigValue(argv, env, "app-id", "APP_ID")
    ),
    privateKey: privateKey(argv, env),
    installationId: optionalInteger(
      githubConfigValue(argv, env, "installation-id", "INSTALLATION_ID"),
      "GitHub installation ID"
    ),
    owner: requiredConfig(
      "GitHub owner",
      githubConfigValue(argv, env, "owner", "OWNER")
    ),
    repo: requiredConfig(
      "GitHub repo",
      githubConfigValue(argv, env, "repo", "REPO")
    ),
    baseBranch: requiredConfig(
      "GitHub base branch",
      githubConfigValue(argv, env, "base-branch", "BASE_BRANCH")
    ),
    sourceBranchPrefix:
      githubConfigValue(
        argv,
        env,
        "source-branch-prefix",
        "SOURCE_BRANCH_PREFIX"
      ) ?? "stoneforge/task",
    allowMerge: booleanConfig(
      optionValue(argv, "--github-allow-merge") ??
        env.STONEFORGE_GITHUB_ALLOW_MERGE
    ),
    apiBaseUrl: githubConfigValue(argv, env, "api-base-url", "API_BASE_URL"),
  }
}

function mergeProvider(value: string): MergeProvider {
  if (value === "fake" || value === "github") {
    return value
  }

  throw new GitHubIntegrationError(
    `Unknown merge provider ${value}. Use fake or github.`
  )
}

function githubConfigValue(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  optionSuffix: string,
  envSuffix: string
): string | undefined {
  return (
    optionValue(argv, `--github-${optionSuffix}`) ??
    env[`STONEFORGE_GITHUB_${envSuffix}`]
  )
}

function privateKey(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  const inlineKey = githubConfigValue(argv, env, "private-key", "PRIVATE_KEY")

  if (inlineKey !== undefined) {
    return inlineKey.replaceAll("\\n", "\n")
  }

  const path = githubConfigValue(
    argv,
    env,
    "private-key-path",
    "PRIVATE_KEY_PATH"
  )

  if (path !== undefined) {
    return readFileSync(path, "utf8")
  }

  return requiredConfig("GitHub App private key", undefined)
}

function requiredConfig(label: string, value: string | undefined): string {
  if (value !== undefined && value.length > 0) {
    return value
  }

  throw new GitHubIntegrationError(
    `${label} is required for the GitHub merge provider. Set the matching STONEFORGE_GITHUB_* env var or CLI flag.`
  )
}

function optionalInteger(
  value: string | undefined,
  label: string
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  throw new GitHubIntegrationError(`${label} must be a positive integer.`)
}

function booleanConfig(value: string | undefined): boolean {
  return value === "1" || value === "true"
}

function optionValue(
  argv: readonly string[],
  option: string
): string | undefined {
  const index = argv.indexOf(option)

  if (index < 0) {
    return undefined
  }

  const value = argv[index + 1]

  if (
    value === undefined ||
    (value.startsWith("--") && option !== "--github-private-key")
  ) {
    throw new GitHubIntegrationError(`Missing value for ${option}.`)
  }

  return value
}
