import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  GitHubAppInstallationTokenProvider,
  GitHubHttpError,
  GitHubIntegrationError,
  type GitHubHttpClient,
  type GitHubHttpRequest,
  type GitHubHttpResponse,
} from "./index.js";

describe("GitHubAppInstallationTokenProvider", () => {
  it("creates and caches installation tokens for explicit installations", async () => {
    const http = new RecordingGitHubHttpClient([
      {
        status: 201,
        json: {
          token: "installation-token",
          expires_at: "2026-04-24T12:10:00.000Z",
        },
      },
    ]);
    const provider = new GitHubAppInstallationTokenProvider(
      {
        appId: "123",
        privateKey: testPrivateKey(),
        installationId: 456,
      },
      http,
      fixedNow,
    );

    const firstToken = await provider.installationToken();
    const cachedToken = await provider.installationToken();

    expect(firstToken).toBe("installation-token");
    expect(cachedToken).toBe("installation-token");

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]?.method).toBe("POST");
    expect(http.requests[0]?.path).toBe("/app/installations/456/access_tokens");
    expect(http.requests[0]?.token?.split(".")).toHaveLength(3);
  });

  it("discovers installation ids from owner and repo", async () => {
    const http = new RecordingGitHubHttpClient([
      { status: 200, json: { id: 789 } },
      {
        status: 201,
        json: {
          token: "discovered-token",
          expires_at: "2026-04-24T12:10:00.000Z",
        },
      },
    ]);
    const provider = new GitHubAppInstallationTokenProvider(
      {
        appId: "123",
        privateKey: testPrivateKey(),
        owner: "tool co",
        repo: "stone/forge",
      },
      http,
      fixedNow,
    );

    await expect(provider.installationToken()).resolves.toBe(
      "discovered-token",
    );

    expect(http.requests.map((request) => request.path)).toEqual([
      "/repos/tool%20co/stone%2Fforge/installation",
      "/app/installations/789/access_tokens",
    ]);
  });

  it("reports invalid configuration and GitHub discovery failures", async () => {
    expect(() => {
      new GitHubAppInstallationTokenProvider(
        { appId: "123", privateKey: "not a private key", installationId: 1 },
        new RecordingGitHubHttpClient([]),
      );
    }).toThrow("Invalid GitHub App private key.");

    const missingRepository = new GitHubAppInstallationTokenProvider(
      { appId: "123", privateKey: testPrivateKey() },
      new RecordingGitHubHttpClient([]),
    );
    await expect(missingRepository.installationToken()).rejects.toThrow(
      "GitHub installation discovery requires owner and repo.",
    );

    await expect(
      providerForDiscoveryError(
        new GitHubHttpError("not found", 404, { message: "not found" }),
      ).installationToken(),
    ).rejects.toThrow(
      "GitHub App installation was not found for toolco/stoneforge.",
    );

    await expect(
      providerForDiscoveryError(
        new GitHubHttpError("forbidden", 403),
      ).installationToken(),
    ).rejects.toThrow(
      "GitHub App installation discovery for toolco/stoneforge was forbidden.",
    );

    await expect(
      providerForDiscoveryError(new Error("network gone")).installationToken(),
    ).rejects.toThrow("network gone");
  });

  it("requires object token and discovery responses", async () => {
    await expect(
      new GitHubAppInstallationTokenProvider(
        { appId: "123", privateKey: testPrivateKey(), installationId: 1 },
        new RecordingGitHubHttpClient([{ status: 201, json: undefined }]),
      ).installationToken(),
    ).rejects.toThrow("GitHub installation token response was empty.");

    await expect(
      new GitHubAppInstallationTokenProvider(
        {
          appId: "123",
          privateKey: testPrivateKey(),
          owner: "toolco",
          repo: "stoneforge",
        },
        new RecordingGitHubHttpClient([{ status: 200, json: undefined }]),
      ).installationToken(),
    ).rejects.toThrow(
      "GitHub installation discovery returned no installation.",
    );
  });
});

class RecordingGitHubHttpClient implements GitHubHttpClient {
  readonly requests: GitHubHttpRequest[] = [];

  constructor(
    private readonly responses: Array<GitHubHttpResponse | Error | string>,
  ) {}

  async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error("No recorded GitHub response exists.");
    }

    if (response instanceof Error) {
      throw response;
    }

    if (typeof response === "string") {
      throw new Error(response);
    }

    return response;
  }
}

function providerForDiscoveryError(
  error: Error | string,
): GitHubAppInstallationTokenProvider {
  return new GitHubAppInstallationTokenProvider(
    {
      appId: "123",
      privateKey: testPrivateKey(),
      owner: "toolco",
      repo: "stoneforge",
    },
    new RecordingGitHubHttpClient([error]),
  );
}

function fixedNow(): Date {
  return new Date("2026-04-24T12:00:00.000Z");
}

function testPrivateKey(): string {
  return generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
}
