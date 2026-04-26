import { createPrivateKey, createSign, type KeyObject } from "node:crypto";

import type { GitHubHttpClient } from "./github-http-client.js";
import { GitHubHttpError } from "./github-http-client.js";
import { jsonObject, requiredNumber, requiredString } from "./github-json.js";

export interface GitHubAppAuthConfig {
  appId: string;
  privateKey: string;
  installationId?: number;
  owner?: string;
  repo?: string;
}

export interface GitHubTokenProvider {
  installationToken(): Promise<string>;
}

export class GitHubIntegrationError extends Error {}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class GitHubAppInstallationTokenProvider implements GitHubTokenProvider {
  private readonly privateKey: KeyObject;
  private cachedToken?: CachedToken;
  private discoveredInstallationId?: number;

  constructor(
    private readonly config: GitHubAppAuthConfig,
    private readonly http: GitHubHttpClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.privateKey = parsePrivateKey(config.privateKey);
  }

  async installationToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > this.refreshCutoff()) {
      return this.cachedToken.token;
    }

    const installationId = await this.resolveInstallationId();
    const response = await this.http.request({
      method: "POST",
      path: `/app/installations/${installationId}/access_tokens`,
      token: this.appJwt(),
    });
    const json = jsonObject(response.json);

    if (!json) {
      throw new GitHubIntegrationError(
        "GitHub installation token response was empty.",
      );
    }

    this.cachedToken = {
      token: requiredString(
        json,
        "token",
        "GitHub installation token response",
      ),
      expiresAt: Date.parse(
        requiredString(
          json,
          "expires_at",
          "GitHub installation token response",
        ),
      ),
    };

    return this.cachedToken.token;
  }

  private async resolveInstallationId(): Promise<number> {
    if (this.config.installationId !== undefined) {
      return this.config.installationId;
    }

    if (this.discoveredInstallationId !== undefined) {
      return this.discoveredInstallationId;
    }

    this.discoveredInstallationId = await this.discoverInstallationId();
    return this.discoveredInstallationId;
  }

  private async discoverInstallationId(): Promise<number> {
    if (this.config.owner === undefined || this.config.repo === undefined) {
      throw new GitHubIntegrationError(
        "GitHub installation discovery requires owner and repo.",
      );
    }

    try {
      const response = await this.http.request({
        method: "GET",
        path: `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(
          this.config.repo,
        )}/installation`,
        token: this.appJwt(),
      });
      const json = jsonObject(response.json);

      if (!json) {
        throw new GitHubIntegrationError(
          "GitHub installation discovery returned no installation.",
        );
      }

      return requiredNumber(json, "id", "GitHub installation discovery");
    } catch (error) {
      if (error instanceof Error) {
        throw installationDiscoveryError(
          error,
          this.config.owner,
          this.config.repo,
        );
      }

      throw new GitHubIntegrationError("GitHub installation discovery failed.");
    }
  }

  private appJwt(): string {
    const issuedAt = Math.floor(this.now().getTime() / 1000) - 60;
    const expiresAt = issuedAt + 540;
    const unsigned = [
      base64UrlJson({ alg: "RS256", typ: "JWT" }),
      base64UrlJson({ iat: issuedAt, exp: expiresAt, iss: this.config.appId }),
    ].join(".");

    return `${unsigned}.${signJwt(unsigned, this.privateKey)}`;
  }

  private refreshCutoff(): number {
    return this.now().getTime() + 60_000;
  }
}

function parsePrivateKey(privateKey: string): KeyObject {
  try {
    return createPrivateKey(privateKey);
  } catch (error) {
    const details = error instanceof Error ? ` ${error.message}` : "";
    throw new GitHubIntegrationError(
      `Invalid GitHub App private key.${details} Provide the PEM value or a readable PEM file path.`,
    );
  }
}

function base64UrlJson(payload: {
  readonly [key: string]: string | number;
}): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signJwt(unsigned: string, privateKey: KeyObject): string {
  const signer = createSign("RSA-SHA256");

  signer.update(unsigned);
  signer.end();

  return signer.sign(privateKey).toString("base64url");
}

function installationDiscoveryError(
  error: Error,
  owner: string,
  repo: string,
): GitHubIntegrationError {
  if (error instanceof GitHubHttpError && error.status === 404) {
    return new GitHubIntegrationError(
      `GitHub App installation was not found for ${owner}/${repo}. Install the app on the repository or pass --github-installation-id.`,
    );
  }

  if (error instanceof GitHubHttpError && error.status === 403) {
    return new GitHubIntegrationError(
      `GitHub App installation discovery for ${owner}/${repo} was forbidden. Check App ID, private key, and repository access.`,
    );
  }

  return error instanceof GitHubIntegrationError
    ? error
    : new GitHubIntegrationError(error.message);
}
