import {
  type JsonObject,
  type JsonValue,
  parseJsonValue,
} from "./github-json.js"
import { Effect } from "effect"

import { runControlPlaneEffect } from "./control-plane-runtime.js"

interface GitHubHttpRequestBase {
  path: string
  token?: string
}

export type GitHubHttpRequest =
  | (GitHubHttpRequestBase & {
      method: "DELETE" | "GET"
      body?: never
    })
  | (GitHubHttpRequestBase & {
      method: "PATCH" | "POST" | "PUT"
      body?: JsonObject
    })

export interface GitHubHttpResponse {
  status: number
  json?: JsonValue
}

export interface GitHubHttpClient {
  request(request: GitHubHttpRequest): Promise<GitHubHttpResponse>
}

export class GitHubHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly json?: JsonValue
  ) {
    super(message)
  }
}

export class FetchGitHubHttpClient implements GitHubHttpClient {
  constructor(private readonly baseUrl = "https://api.github.com") {}

  request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
    return runControlPlaneEffect(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`${this.baseUrl}${request.path}`, {
            method: request.method,
            headers: requestHeaders(request),
            body:
              request.body === undefined
                ? undefined
                : JSON.stringify(request.body),
          })
          const json = await responseJson(response)

          if (response.status >= 400) {
            throw new GitHubHttpError(
              `GitHub API ${request.method} ${request.path} failed with HTTP ${response.status}.`,
              response.status,
              json
            )
          }

          return { status: response.status, json }
        },
        catch: (error) => {
          if (error instanceof GitHubHttpError) {
            return error
          }

          return new GitHubHttpError(
            `GitHub API ${request.method} ${request.path} failed before an HTTP response was available.`,
            0
          )
        },
      }).pipe(
        Effect.tap((response) =>
          Effect.annotateCurrentSpan(
            "http.response.status_code",
            response.status
          )
        ),
        Effect.withSpan("github.http_request", {
          attributes: {
            "stoneforge.provider.name": "github",
            "stoneforge.provider.operation": request.method,
          },
        })
      )
    )
  }
}

function requestHeaders(request: GitHubHttpRequest): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  }

  if (request.body !== undefined) {
    headers["content-type"] = "application/json"
  }

  if (request.token !== undefined) {
    headers.authorization = `Bearer ${request.token}`
  }

  return headers
}

async function responseJson(
  response: Response
): Promise<JsonValue | undefined> {
  const text = await response.text()

  if (text.length === 0) {
    return undefined
  }

  return parseJsonValue(text)
}
