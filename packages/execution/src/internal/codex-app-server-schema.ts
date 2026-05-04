import { z } from "zod"

import type {
  ProviderSessionEvent,
  ProviderTranscriptEntry
} from "../provider-models.js"
import type {
  JsonObject,
  JsonRpcIncomingMessage,
  JsonRpcNotification,
  JsonRpcOutgoingMessage
} from "./codex-app-server-json.js"

const jsonRpcIdSchema = z.union([z.number(), z.string()])
const jsonObjectSchema = z.record(z.string(), z.json())

const jsonRpcSuccessResponseSchema = z.object({
  id: jsonRpcIdSchema,
  result: jsonObjectSchema
})

const jsonRpcErrorResponseSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string()
  }),
  id: jsonRpcIdSchema
})

const jsonRpcRequestSchema = z.object({
  id: jsonRpcIdSchema,
  method: z.string(),
  params: jsonObjectSchema.optional()
})

const jsonRpcNotificationSchema = z.object({
  id: z.undefined().optional(),
  method: z.string(),
  params: jsonObjectSchema.optional()
})

const threadStartResponseSchema = z.object({
  thread: z.object({
    id: z.string()
  })
})

const turnStartResponseSchema = z.object({
  turn: z.object({
    id: z.string()
  })
})

const agentMessageDeltaNotificationSchema = z.object({
  delta: z.string(),
  itemId: z.string().optional()
})

const itemCompletedNotificationSchema = z.object({
  item: z.object({
    id: z.string().optional(),
    text: z.string().optional(),
    type: z.string()
  })
})

const turnCompletedNotificationSchema = z.object({
  turn: z.object({
    id: z.string(),
    status: z.string()
  })
})

export function parseJsonRpcIncomingMessageWithSchemas(
  text: string
): JsonRpcIncomingMessage {
  const parsed = z.json().parse(JSON.parse(text))

  for (const schema of [
    jsonRpcSuccessResponseSchema,
    jsonRpcErrorResponseSchema,
    jsonRpcRequestSchema,
    jsonRpcNotificationSchema
  ]) {
    const result = schema.safeParse(parsed)
    if (result.success) {
      return result.data
    }
  }

  throw new Error("codex app-server emitted invalid JSON-RPC message.")
}

export function encodeJsonRpcOutgoingMessage(
  message: JsonRpcOutgoingMessage
): string {
  return JSON.stringify(message)
}

export function readThreadStartResponse(result: JsonObject): string {
  const decoded = threadStartResponseSchema.safeParse(result)
  if (!decoded.success) {
    throw new Error("codex app-server response missing object field thread.")
  }

  return decoded.data.thread.id
}

export function readTurnStartResponse(result: JsonObject): string {
  const decoded = turnStartResponseSchema.safeParse(result)
  if (!decoded.success) {
    throw new Error("codex app-server response missing string field id.")
  }

  return decoded.data.turn.id
}

export function readCodexNotificationEvent(
  message: JsonRpcNotification
): ProviderSessionEvent | undefined {
  if (message.method === "item/agentMessage/delta") {
    return readAgentMessageDeltaEvent(message)
  }

  if (message.method === "item/completed") {
    return readItemCompletedEvent(message)
  }

  if (message.method === "turn/completed") {
    return readTurnCompletedEvent(message)
  }

  return {
    kind: "provider.event",
    name: `codex.${message.method}`
  }
}

function readAgentMessageDeltaEvent(
  message: JsonRpcNotification
): ProviderSessionEvent | undefined {
  const decoded = agentMessageDeltaNotificationSchema.safeParse(message.params)
  if (!decoded.success) {
    return undefined
  }

  return {
    kind: "provider.transcript.delta",
    providerItemId: decoded.data.itemId,
    role: "assistant",
    text: decoded.data.delta
  }
}

function readItemCompletedEvent(
  message: JsonRpcNotification
): ProviderSessionEvent | undefined {
  const decoded = itemCompletedNotificationSchema.safeParse(message.params)
  if (!decoded.success) {
    return undefined
  }

  if (decoded.data.item.type === "agentMessage") {
    return readAgentMessageCompletedEvent(decoded.data.item)
  }

  return {
    kind: "provider.event",
    name: `codex.item.${decoded.data.item.type}`,
    providerItemId: decoded.data.item.id
  }
}

function readAgentMessageCompletedEvent(item: {
  readonly id?: string
  readonly text?: string
}): ProviderSessionEvent | undefined {
  if (item.text === undefined) {
    return undefined
  }

  return {
    kind: "provider.transcript.item.completed",
    providerItemId: item.id,
    role: "assistant",
    text: item.text
  }
}

function readTurnCompletedEvent(
  message: JsonRpcNotification
): ProviderSessionEvent | undefined {
  const decoded = turnCompletedNotificationSchema.safeParse(message.params)
  if (!decoded.success) {
    return undefined
  }

  return {
    kind: "provider.event",
    name: `codex.turn.${decoded.data.turn.status}`
  }
}

export function readCodexTranscriptEntry(
  message: JsonRpcNotification
): ProviderTranscriptEntry | undefined {
  if (message.method !== "item/completed") {
    return undefined
  }

  const decoded = itemCompletedNotificationSchema.safeParse(message.params)
  if (!decoded.success) {
    return undefined
  }

  return readAgentMessageTranscriptEntry(decoded.data.item)
}

function readAgentMessageTranscriptEntry(item: {
  readonly id?: string
  readonly text?: string
  readonly type: string
}): ProviderTranscriptEntry | undefined {
  if (item.type !== "agentMessage" || item.text === undefined) {
    return undefined
  }

  return {
    providerItemId: item.id,
    role: "assistant",
    text: item.text
  }
}

export function readTurnCompletion(
  message: JsonRpcNotification
): { readonly status: string; readonly turnId: string } | undefined {
  if (message.method !== "turn/completed") {
    return undefined
  }

  const decoded = turnCompletedNotificationSchema.safeParse(message.params)
  if (!decoded.success) {
    throw new Error("codex app-server response missing string field id.")
  }

  return {
    status: decoded.data.turn.status,
    turnId: decoded.data.turn.id
  }
}
