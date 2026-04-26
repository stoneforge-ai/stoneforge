import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  FetchGitHubHttpClient,
  GitHubHttpError,
  type GitHubHttpRequest,
} from "./index.js";

describe("FetchGitHubHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON requests with GitHub headers", async () => {
    const requests: CapturedFetchRequest[] = [];
    vi.stubGlobal(
      "fetch",
      fetchStub(requests, new Response('{"ok":true}', { status: 201 })),
    );

    const response = await new FetchGitHubHttpClient(
      "https://github.test",
    ).request({
      method: "POST",
      path: "/repos/toolco/stoneforge/issues",
      token: "token-1",
      body: { title: "Build it" },
    });

    expect(response).toEqual({ status: 201, json: { ok: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(
      "https://github.test/repos/toolco/stoneforge/issues",
    );
    expect(requests[0]?.init.method).toBe("POST");
    expect(requests[0]?.init.body).toBe('{"title":"Build it"}');
    expect(headerValue(requests[0]?.init.headers, "accept")).toBe(
      "application/vnd.github+json",
    );
    expect(headerValue(requests[0]?.init.headers, "content-type")).toBe(
      "application/json",
    );
    expect(headerValue(requests[0]?.init.headers, "authorization")).toBe(
      "Bearer token-1",
    );
  });

  it("omits optional request body and token headers", async () => {
    const requests: CapturedFetchRequest[] = [];
    vi.stubGlobal(
      "fetch",
      fetchStub(requests, new Response(null, { status: 204 })),
    );

    const response = await new FetchGitHubHttpClient(
      "https://github.test",
    ).request({
      method: "GET",
      path: "/repos/toolco/stoneforge",
    });

    expect(response).toEqual({ status: 204, json: undefined });
    expect(requests[0]?.init.body).toBeUndefined();
    expect(
      headerValue(requests[0]?.init.headers, "content-type"),
    ).toBeUndefined();
    expect(
      headerValue(requests[0]?.init.headers, "authorization"),
    ).toBeUndefined();
  });

  it("throws contextual errors for failing responses", async () => {
    vi.stubGlobal(
      "fetch",
      fetchStub([], new Response('{"message":"nope"}', { status: 403 })),
    );

    const request = new FetchGitHubHttpClient("https://github.test").request({
      method: "GET",
      path: "/repos/toolco/private",
    });

    await expect(request).rejects.toBeInstanceOf(GitHubHttpError);
    await expect(request).rejects.toMatchObject({
      message: "GitHub API GET /repos/toolco/private failed with HTTP 403.",
      status: 403,
      json: { message: "nope" },
    });
  });

  it("disallows request bodies for read-only methods", () => {
    const postRequest = {
      method: "POST",
      path: "/repos/toolco/stoneforge/issues",
      body: { title: "Build it" },
    } satisfies GitHubHttpRequest;
    expectTypeOf(postRequest.body).toEqualTypeOf<{ title: string }>();

    const readRequest = {
      method: "GET",
      path: "/repos/toolco/stoneforge",
    } satisfies GitHubHttpRequest;
    expectTypeOf(readRequest.method).toEqualTypeOf<"GET">();

    // @ts-expect-error GET requests cannot carry JSON bodies.
    const invalidReadRequest: GitHubHttpRequest = {
      method: "GET",
      path: "/repos/toolco/stoneforge",
      body: { title: "nope" },
    };
    expectTypeOf(invalidReadRequest).toEqualTypeOf<GitHubHttpRequest>();
  });
});

interface CapturedFetchRequest {
  readonly input: Parameters<typeof fetch>[0];
  readonly init: RequestInit;
}

function fetchStub(
  requests: CapturedFetchRequest[],
  response: Response,
): (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response> {
  return async (input, init) => {
    requests.push({ input, init: init ?? {} });
    return response.clone();
  };
}

function headerValue(
  headers: HeadersInit | undefined,
  key: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }

  if (Array.isArray(headers)) {
    return headers.find(([name]) => name === key)?.[1];
  }

  return headers?.[key];
}
