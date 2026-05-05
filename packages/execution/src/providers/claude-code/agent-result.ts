import type {
  Options as ClaudeAgentOptions,
  SDKMessage
} from "@anthropic-ai/claude-agent-sdk"

import type {
  ProviderSessionEvent,
  ProviderSessionStartContext,
  ProviderTranscriptEntry
} from "../models.js"

export type ClaudeAgentQuery = (params: {
  readonly options?: ClaudeAgentOptions
  readonly prompt: string
}) => AsyncIterable<ClaudeAgentMessage>

type ClaudeAgentResultSubtype = Extract<
  SDKMessage,
  { readonly type: "result" }
>["subtype"]

export interface ClaudeAgentResultSuccess {
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

interface ClaudeAgentAssistantMessage {
  readonly message: {
    readonly content: readonly ClaudeAgentContentBlock[]
  }
  readonly type: "assistant"
  readonly uuid?: string
}

type ClaudeAgentContentBlock =
  | {
      readonly text: string
      readonly type: "text"
    }
  | {
      readonly type: string
    }

interface ClaudeAgentStreamEventMessage {
  readonly event: ClaudeAgentStreamEvent
  readonly type: "stream_event"
  readonly uuid?: string
}

type ClaudeAgentStreamEvent =
  | ClaudeAgentContentBlockDeltaEvent
  | {
      readonly type: string
    }

interface ClaudeAgentContentBlockDeltaEvent {
  readonly delta: ClaudeAgentStreamDelta
  readonly type: "content_block_delta"
}

type ClaudeAgentStreamDelta =
  | {
      readonly text: string
      readonly type: "text_delta"
    }
  | {
      readonly type: string
    }

type ClaudeAgentOtherMessage = {
  readonly type: Exclude<SDKMessage["type"], "assistant" | "result" | "stream_event">
}

export type ClaudeAgentMessage =
  | ClaudeAgentAssistantMessage
  | ClaudeAgentOtherMessage
  | ClaudeAgentResultError
  | ClaudeAgentResultSuccess
  | ClaudeAgentStreamEventMessage

export async function collectClaudeResultAndFacts(
  messages: AsyncIterable<ClaudeAgentMessage>,
  onEvent: ProviderSessionStartContext["onEvent"]
): Promise<{
  readonly events: readonly ProviderSessionEvent[]
  readonly logs: readonly { readonly level: "error" | "info"; readonly message: string }[]
  readonly result: ClaudeAgentResultSuccess
  readonly transcript: readonly ProviderTranscriptEntry[]
}> {
  const events: ProviderSessionEvent[] = []
  const logs: { readonly level: "error" | "info"; readonly message: string }[] = []

  for await (const message of messages) {
    recordClaudeMessageEvents(message, events, onEvent)
    if (message.type !== "result") {
      continue
    }

    return collectClaudeResultMessage(message, events, logs)
  }

  throw new Error("claude-code Agent SDK completed without a result message.")
}

function recordClaudeMessageEvents(
  message: ClaudeAgentMessage,
  events: ProviderSessionEvent[],
  onEvent: ProviderSessionStartContext["onEvent"]
): void {
  const messageEvents = claudeMessageEvents(message)

  for (const event of messageEvents) {
    events.push(event)
    onEvent?.(event)
  }
}

function claudeMessageEvents(
  message: ClaudeAgentMessage
): readonly ProviderSessionEvent[] {
  const transcriptEvents = claudeTranscriptEvents(message)
  if (transcriptEvents.length > 0) {
    return transcriptEvents
  }

  if (message.type === "stream_event") {
    return []
  }

  return [
    {
      kind: "provider.event",
      name: `claude.${message.type}`
    }
  ]
}

function claudeTranscriptEvents(
  message: ClaudeAgentMessage
): readonly ProviderSessionEvent[] {
  if (message.type === "assistant") {
    return claudeAssistantTranscriptEvents(message)
  }

  if (message.type === "stream_event") {
    return claudeStreamTranscriptEvents(message)
  }

  return []
}

function claudeAssistantTranscriptEvents(
  message: ClaudeAgentAssistantMessage
): readonly ProviderSessionEvent[] {
  const text = message.message.content
    .filter(isClaudeTextBlock)
    .map((block) => block.text)
    .join("")
    .trim()

  if (text.length === 0) {
    return []
  }

  return [
    {
      kind: "provider.transcript.item.completed",
      providerItemId: message.uuid,
      role: "assistant",
      text
    }
  ]
}

function claudeStreamTranscriptEvents(
  message: ClaudeAgentStreamEventMessage
): readonly ProviderSessionEvent[] {
  const event = message.event
  if (!isClaudeContentBlockDeltaEvent(event)) {
    return []
  }

  const delta = event.delta
  if (!isClaudeTextDelta(delta) || delta.text.length === 0) {
    return []
  }

  return [
    {
      kind: "provider.transcript.delta",
      providerItemId: message.uuid,
      role: "assistant",
      text: delta.text
    }
  ]
}

function isClaudeTextBlock(
  block: ClaudeAgentContentBlock
): block is Extract<ClaudeAgentContentBlock, { readonly type: "text" }> {
  return block.type === "text" && "text" in block
}

function isClaudeContentBlockDeltaEvent(
  event: ClaudeAgentStreamEvent
): event is ClaudeAgentContentBlockDeltaEvent {
  return event.type === "content_block_delta" && "delta" in event
}

function isClaudeTextDelta(
  delta: ClaudeAgentStreamDelta
): delta is Extract<ClaudeAgentStreamDelta, { readonly type: "text_delta" }> {
  return delta.type === "text_delta" && "text" in delta
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
  return { events, logs, result: message, transcript: transcriptFromEvents(events) }
}

function transcriptFromEvents(
  events: readonly ProviderSessionEvent[]
): readonly ProviderTranscriptEntry[] {
  return events.flatMap((event) =>
    event.kind === "provider.transcript.item.completed"
      ? [
          {
            providerItemId: event.providerItemId,
            role: event.role,
            text: event.text
          }
        ]
      : []
  )
}

function claudeResultError(message: ClaudeAgentResultError): Error {
  const detail =
    message.errors.length > 0 ? message.errors.join("; ") : message.subtype

  return new Error(`claude-code Agent SDK failed: ${detail}`)
}
