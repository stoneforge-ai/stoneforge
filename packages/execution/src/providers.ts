import {
  query as runClaudeAgentQuery,
  type Options as ClaudeAgentOptions,
  type SDKMessage
} from "@anthropic-ai/claude-agent-sdk"

import type {
  CodexAppServerClient,
  ProviderInstanceId
} from "./models.js"
import {
  completeProviderSession,
  defineProviderInstance
} from "./provider-models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionEvent,
  ProviderSessionIdentity,
  ProviderSessionStartContext,
  ProviderSessionStartResult
} from "./provider-models.js"
import { createNodeCodexAppServerClient } from "./codex-app-server.js"
import { makeProviderInstanceId } from "./ids.js"
import { noCodePrompt } from "./internal/provider-prompt.js"

type ClaudeAgentQuery = (params: {
  readonly options?: ClaudeAgentOptions
  readonly prompt: string
}) => AsyncIterable<ClaudeAgentMessage>

type ClaudeAgentResultSubtype = Extract<
  SDKMessage,
  { readonly type: "result" }
>["subtype"]

interface ClaudeAgentResultSuccess {
  readonly num_turns?: number
  readonly result: string
  readonly session_id: string
  readonly subtype: "success"
  readonly type: "result"
}

interface ClaudeAgentResultError {
  readonly errors: readonly string[]
  readonly subtype: Exclude<ClaudeAgentResultSubtype, "success">
  readonly type: "result"
}

type ClaudeAgentMessage =
  | ClaudeAgentResultError
  | ClaudeAgentResultSuccess
  | { readonly type: Exclude<SDKMessage["type"], "result"> }

interface ClaudeCodeProviderRuntimeInput {
  readonly id?: ProviderInstanceId | string
  readonly pathToClaudeCodeExecutable?: string
  readonly query?: ClaudeAgentQuery
}

interface CodexProviderRuntimeInput {
  readonly id?: ProviderInstanceId | string
  readonly command?: string
  readonly commandArgs?: readonly string[]
  readonly appServerClient?: CodexAppServerClient
}

export function createClaudeCodeProviderRuntime(
  input: ClaudeCodeProviderRuntimeInput = {}
): ExecutionProviderInstance {
  const query = input.query ?? runClaudeAgentQuery
  const providerInstanceId = makeProviderInstanceId(
    input.id ?? "claude-code-default"
  )
  const providerInstance = defineProviderInstance({
    connectivity: "connectionless",
    id: providerInstanceId,
    provider: "claude-code",
    startSession: (context) =>
      startClaudeNoCodeSession({
        context,
        pathToClaudeCodeExecutable: input.pathToClaudeCodeExecutable,
        providerInstanceId,
        query
      })
  })

  return providerInstance
}

export function createOpenAICodexProviderRuntime(
  input: CodexProviderRuntimeInput = {}
): ExecutionProviderInstance {
  const appServerClient =
    input.appServerClient ??
    createNodeCodexAppServerClient({
      command: input.command,
      commandArgs: input.commandArgs
    })
  const providerInstanceId = makeProviderInstanceId(
    input.id ?? "openai-codex-default"
  )
  const providerInstance = defineProviderInstance({
    connectivity: "connectionful",
    id: providerInstanceId,
    provider: "openai-codex",
    startSession: (context) =>
      startCodexNoCodeSession({
        appServerClient,
        context,
        providerInstanceId
      })
  })

  return providerInstance
}

async function startClaudeNoCodeSession(input: {
  readonly context: ProviderSessionStartContext
  readonly pathToClaudeCodeExecutable?: string
  readonly providerInstanceId: ProviderInstanceId
  readonly query: ClaudeAgentQuery
}): Promise<ProviderSessionStartResult> {
  const result = await collectClaudeResultAndFacts(
    input.query({
      options: {
        model: input.context.agent.model,
        pathToClaudeCodeExecutable: input.pathToClaudeCodeExecutable,
        permissionMode: "dontAsk",
        tools: []
      },
      prompt: noCodePrompt(input.context)
    })
  )
  const summary = result.result.result.trim()
  const providerSession = claudeProviderSessionIdentity(
    input.providerInstanceId,
    result.result.session_id
  )

  return completeProviderSession({
    context: input.context,
    events: claudeCompletionEvents(providerSession.providerSessionId, result.events, summary),
    logs: result.logs,
    providerSession,
    summary,
    transcript: [{ role: "assistant", text: summary }]
  })
}

async function startCodexNoCodeSession(input: {
  readonly appServerClient: CodexAppServerClient
  readonly context: ProviderSessionStartContext
  readonly providerInstanceId: ProviderInstanceId
}): Promise<ProviderSessionStartResult> {
  const result = await input.appServerClient.runTurn({
    cwd: input.context.runtime.worktreePath,
    model: input.context.agent.model,
    prompt: noCodePrompt(input.context)
  })
  const providerSession = codexProviderSessionIdentity(
    input.providerInstanceId,
    result.threadId,
    result.turnId
  )

  return completeProviderSession({
    context: input.context,
    events: [
      { kind: "provider.session.started", providerSessionId: providerSession.providerSessionId },
      ...result.events,
      {
        kind: "provider.session.completed",
        status: "completed",
        summary: result.finalSummary
      }
    ],
    logs: result.logs,
    providerSession,
    summary: result.finalSummary,
    transcript: result.transcript
  })
}

function claudeProviderSessionIdentity(
  providerInstanceId: ProviderInstanceId,
  sessionId: string
): ProviderSessionIdentity {
  return {
    external: [
      {
        kind: "claude.session",
        sessionId
      }
    ],
    provider: "claude-code",
    providerInstanceId,
    providerSessionId: `claude-code:${sessionId}`
  }
}

function codexProviderSessionIdentity(
  providerInstanceId: ProviderInstanceId,
  threadId: string,
  turnId: string
): ProviderSessionIdentity {
  return {
    external: [
      {
        kind: "codex.thread",
        threadId
      },
      {
        kind: "codex.turn",
        threadId,
        turnId
      }
    ],
    provider: "openai-codex",
    providerInstanceId,
    providerSessionId: `openai-codex:${threadId}:${turnId}`
  }
}

function claudeCompletionEvents(
  providerSessionId: string,
  events: readonly ProviderSessionEvent[],
  summary: string
): readonly ProviderSessionEvent[] {
  return [
    {
      kind: "provider.session.started",
      providerSessionId
    },
    ...events,
    {
      kind: "provider.transcript.item.completed",
      role: "assistant",
      text: summary
    },
    {
      kind: "provider.session.completed",
      status: "completed",
      summary
    }
  ]
}

async function collectClaudeResultAndFacts(
  messages: AsyncIterable<ClaudeAgentMessage>
): Promise<{
  readonly events: readonly ProviderSessionEvent[]
  readonly logs: readonly { readonly level: "error" | "info"; readonly message: string }[]
  readonly result: ClaudeAgentResultSuccess
}> {
  const events: ProviderSessionEvent[] = []
  const logs: { readonly level: "error" | "info"; readonly message: string }[] = []

  for await (const message of messages) {
    events.push({
      kind: "provider.event",
      name: `claude.${message.type}`
    })
    if (message.type !== "result") {
      continue
    }

    return collectClaudeResultMessage(message, events, logs)
  }

  throw new Error("claude-code Agent SDK completed without a result message.")
}

function collectClaudeResultMessage(
  message: ClaudeAgentResultError | ClaudeAgentResultSuccess,
  events: readonly ProviderSessionEvent[],
  logs: { readonly level: "error" | "info"; readonly message: string }[]
) {
  if (message.subtype !== "success") {
    throw claudeResultError(message)
  }

  logs.push({
    level: "info",
    message: `claude-code Agent SDK completed ${String(message.num_turns ?? 1)} turn(s).`
  })
  return { events, logs, result: message }
}

function claudeResultError(message: ClaudeAgentResultError): Error {
  const detail =
    message.errors.length > 0 ? message.errors.join("; ") : message.subtype

  return new Error(`claude-code Agent SDK failed: ${detail}`)
}
