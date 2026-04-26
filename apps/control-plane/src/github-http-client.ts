import {
  type JsonObject,
  type JsonValue,
  parseJsonValue,
} from "./github-json.js";

export interface GitHubHttpRequest {
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: string;
  token?: string;
  body?: JsonObject;
}

export interface GitHubHttpResponse {
  status: number;
  json?: JsonValue;
}

export interface GitHubHttpClient {
  request(request: GitHubHttpRequest): Promise<GitHubHttpResponse>;
}

export class GitHubHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly json?: JsonValue,
  ) {
    super(message);
  }
}

export class FetchGitHubHttpClient implements GitHubHttpClient {
  constructor(private readonly baseUrl = "https://api.github.com") {}

  async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
    const response = await fetch(`${this.baseUrl}${request.path}`, {
      method: request.method,
      headers: requestHeaders(request),
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    const json = await responseJson(response);

    if (response.status >= 400) {
      throw new GitHubHttpError(
        `GitHub API ${request.method} ${request.path} failed with HTTP ${response.status}.`,
        response.status,
        json,
      );
    }

    return { status: response.status, json };
  }
}

function requestHeaders(request: GitHubHttpRequest): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };

  if (request.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (request.token !== undefined) {
    headers.authorization = `Bearer ${request.token}`;
  }

  return headers;
}

async function responseJson(
  response: Response,
): Promise<JsonValue | undefined> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  return parseJsonValue(text);
}
