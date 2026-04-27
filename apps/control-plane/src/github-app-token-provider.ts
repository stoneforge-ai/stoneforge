import { createPrivateKey, createSign, type KeyObject } from "node:crypto"

import { Effect } from "effect"

import { runControlPlaneEffect } from "./control-plane-runtime.js"
import type { GitHubHttpClient } from "./github-http-client.js"
import { GitHubHttpError } from "./github-http-client.js"
import { jsonObject, requiredNumber, requiredString } from "./github-json.js"

interface GitHubAppAuthConfigBase {
  appId: string
  privateKey: string
}

export type GitHubAppAuthConfig =
  | (GitHubAppAuthConfigBase & {
      installationId: number
      owner?: string
      repo?: string
    })
  | (GitHubAppAuthConfigBase & {
      installationId?: never
      owner: string
      repo: string
    })

export interface GitHubTokenProvider {
  installationToken(): Promise<string>
}

export class GitHubIntegrationError extends Error {}

interface CachedToken {
  token: string
  expiresAt: number
}

export class GitHubAppInstallationTokenProvider implements GitHubTokenProvider {
  private readonly privateKey: KeyObject
  private cachedToken?: CachedToken
  private discoveredInstallationId?: number

  constructor(
    private readonly config: GitHubAppAuthConfig,
    private readonly http: GitHubHttpClient,
    private readonly now: () => Date = () => new Date()
  ) {
    this.privateKey = parsePrivateKey(config.privateKey)
  }

  installationToken(): Promise<string> {
    return runControlPlaneEffect(
      Effect.gen(this, function* () {
        if (
          this.cachedToken &&
          this.cachedToken.expiresAt > this.refreshCutoff()
        ) {
          return this.cachedToken.token
        }

        const installationId = yield* this.resolveInstallationId()
        const response = yield* Effect.tryPromise({
          try: () =>
            this.http.request({
              method: "POST",
              path: `/app/installations/${installationId}/access_tokens`,
              token: this.appJwt(),
            }),
          catch: (error) =>
            error instanceof Error
              ? error
              : new GitHubIntegrationError(
                  "GitHub installation token request failed."
                ),
        })
        const json = jsonObject(response.json)

        if (!json) {
          return yield* Effect.fail(
            new GitHubIntegrationError(
              "GitHub installation token response was empty."
            )
          )
        }

        this.cachedToken = {
          token: requiredString(
            json,
            "token",
            "GitHub installation token response"
          ),
          expiresAt: Date.parse(
            requiredString(
              json,
              "expires_at",
              "GitHub installation token response"
            )
          ),
        }

        return this.cachedToken.token
      }).pipe(
        Effect.withSpan("github.create_installation_token", {
          attributes: {
            "stoneforge.provider.name": "github",
            "stoneforge.provider.operation": "create_installation_token",
          },
        })
      )
    )
  }

  private resolveInstallationId(): Effect.Effect<number, Error> {
    if (this.config.installationId !== undefined) {
      return Effect.succeed(this.config.installationId)
    }

    if (this.discoveredInstallationId !== undefined) {
      return Effect.succeed(this.discoveredInstallationId)
    }

    return this.discoverInstallationId().pipe(
      Effect.tap((installationId) =>
        Effect.sync(() => {
          this.discoveredInstallationId = installationId
        })
      )
    )
  }

  private discoverInstallationId(): Effect.Effect<number, Error> {
    if (this.config.owner === undefined || this.config.repo === undefined) {
      return Effect.fail(
        new GitHubIntegrationError(
          "GitHub installation discovery requires owner and repo."
        )
      )
    }

    const owner = this.config.owner
    const repo = this.config.repo

    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          this.http.request({
            method: "GET",
            path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
              repo
            )}/installation`,
            token: this.appJwt(),
          }),
        catch: (error) =>
          error instanceof Error
            ? installationDiscoveryError(error, owner, repo)
            : new GitHubIntegrationError(
                "GitHub installation discovery failed."
              ),
      })
      const json = jsonObject(response.json)

      if (!json) {
        return yield* Effect.fail(
          new GitHubIntegrationError(
            "GitHub installation discovery returned no installation."
          )
        )
      }

      return requiredNumber(json, "id", "GitHub installation discovery")
    }).pipe(
      Effect.withSpan("github.discover_installation", {
        attributes: {
          "stoneforge.provider.name": "github",
          "stoneforge.provider.operation": "discover_installation",
        },
      })
    )
  }

  private appJwt(): string {
    const issuedAt = Math.floor(this.now().getTime() / 1000) - 60
    const expiresAt = issuedAt + 540
    const unsigned = [
      base64UrlJson({ alg: "RS256", typ: "JWT" }),
      base64UrlJson({ iat: issuedAt, exp: expiresAt, iss: this.config.appId }),
    ].join(".")

    return `${unsigned}.${signJwt(unsigned, this.privateKey)}`
  }

  private refreshCutoff(): number {
    return this.now().getTime() + 60_000
  }
}

function parsePrivateKey(privateKey: string): KeyObject {
  try {
    return createPrivateKey(privateKey)
  } catch (error) {
    const details = error instanceof Error ? ` ${error.message}` : ""
    throw new GitHubIntegrationError(
      `Invalid GitHub App private key.${details} Provide the PEM value or a readable PEM file path.`
    )
  }
}

function base64UrlJson(payload: {
  readonly [key: string]: string | number
}): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url")
}

function signJwt(unsigned: string, privateKey: KeyObject): string {
  const signer = createSign("RSA-SHA256")

  signer.update(unsigned)
  signer.end()

  return signer.sign(privateKey).toString("base64url")
}

function installationDiscoveryError(
  error: Error,
  owner: string,
  repo: string
): GitHubIntegrationError {
  if (error instanceof GitHubHttpError && error.status === 404) {
    return new GitHubIntegrationError(
      `GitHub App installation was not found for ${owner}/${repo}. Install the app on the repository or pass --github-installation-id.`
    )
  }

  if (error instanceof GitHubHttpError && error.status === 403) {
    return new GitHubIntegrationError(
      `GitHub App installation discovery for ${owner}/${repo} was forbidden. Check App ID, private key, and repository access.`
    )
  }

  return error instanceof GitHubIntegrationError
    ? error
    : new GitHubIntegrationError(error.message)
}
