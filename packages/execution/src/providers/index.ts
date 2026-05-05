import {
  query as runClaudeAgentQuery
} from "@anthropic-ai/claude-agent-sdk"

import type {
  CodexAppServerClient,
  ProviderInstanceId
} from "../models.js"
import {
  completeProviderSession,
  defineProviderInstance
} from "./models.js"
import type {
  ExecutionProviderInstance,
  ProviderSessionEvent,
  ProviderSessionIdentity,
  ProviderSessionStartContext,
  ProviderSessionStartResult
} from "./models.js"
import { createNodeCodexAppServerClient } from "./openai-codex/app-server/client.js"
import { makeProviderInstanceId } from "../ids.js"
import {
  collectClaudeResultAndFacts,
  type ClaudeAgentQuery
} from "./claude-code/agent-result.js"
import { noCodePrompt } from "./shared/provider-prompt.js"

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
    }),
    input.context.onEvent
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
    transcript:
      result.transcript.length > 0
        ? result.transcript
        : [{ role: "assistant", text: summary }]
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
    onEvent: input.context.onEvent,
    prompt: noCodePrompt(input.context)
  })
  const providerSession = codexProviderSessionIdentity(
    input.providerInstanceId,
    result.threadId,
    result.turnId
  )

  return completeProviderSession({
    context: input.context,
    events: codexCompletionEvents(
      providerSession.providerSessionId,
      result.events,
      result.finalSummary
    ),
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
  const transcriptEvents = events.some(isAssistantTranscriptEvent)
    ? []
    : [
        {
          kind: "provider.transcript.item.completed",
          role: "assistant",
          text: summary
        } satisfies ProviderSessionEvent
      ]

  return [
    {
      kind: "provider.session.started",
      providerSessionId
    },
    ...events,
    ...transcriptEvents,
    {
      kind: "provider.session.completed",
      status: "completed",
      summary
    }
  ]
}

function codexCompletionEvents(
  providerSessionId: string,
  events: readonly ProviderSessionEvent[],
  summary: string
): readonly ProviderSessionEvent[] {
  return [
    {
      kind: "provider.session.started",
      providerSessionId
    },
    ...events.filter((event) => event.kind !== "provider.session.started"),
    {
      kind: "provider.session.completed",
      status: "completed",
      summary
    }
  ]
}

function isAssistantTranscriptEvent(event: ProviderSessionEvent): boolean {
  return (
    (event.kind === "provider.transcript.delta" ||
      event.kind === "provider.transcript.item.completed") &&
    event.role === "assistant"
  )
}
