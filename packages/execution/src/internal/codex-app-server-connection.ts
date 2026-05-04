import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface, type Interface } from "node:readline"

import type {
  CodexAppServerTurnInput,
  CodexAppServerTurnResult
} from "../models.js"
import type {
  ProviderSessionEvent,
  ProviderTranscriptEntry
} from "../provider-models.js"
import {
  isErrorResponse,
  isNotification,
  isSuccessResponse,
  type JsonObject,
  type JsonRpcId,
  type JsonRpcIncomingMessage,
  type JsonRpcNotification,
  type JsonRpcOutgoingMessage,
  type JsonRpcRequest
} from "./codex-app-server-json.js"
import {
  encodeJsonRpcOutgoingMessage,
  parseJsonRpcIncomingMessageWithSchemas,
  readCodexNotificationEvent,
  readCodexTranscriptEntry,
  readThreadStartResponse,
  readTurnCompletion,
  readTurnStartResponse
} from "./codex-app-server-schema.js"
import { completedCodexTurnResult } from "./codex-app-server-result.js"

interface PendingRequest {
  readonly reject: (error: Error) => void
  readonly resolve: (result: JsonObject) => void
}

interface ActiveTurn {
  readonly reject: (error: Error) => void
  readonly resolve: (result: CodexAppServerTurnResult) => void
  readonly threadId: string
  readonly turnId: string
}

export class CodexAppServerJsonRpcConnection {
  private readonly activeText: string[] = []
  private readonly completedTurns = new Map<string, string>()
  private readonly events: ProviderSessionEvent[] = []
  private readonly lines: Interface
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private readonly transcript: ProviderTranscriptEntry[] = []
  private activeTurn: ActiveTurn | undefined
  private completedText: string | undefined
  private nextId = 1
  private stderr = ""

  constructor(
    private readonly process: ChildProcessWithoutNullStreams
  ) {
    process.stderr.setEncoding("utf8")
    process.stderr.on("data", (chunk: string) => {
      this.stderr += chunk
    })
    process.once("error", (error) => this.rejectAll(error))
    process.once("close", (code) => {
      if (code === 0 || code === null) {
        return
      }

      this.rejectAll(
        new Error(
          `codex app-server exited with code ${code}: ${this.stderr.trim()}`
        )
      )
    })

    this.lines = createInterface({ input: process.stdout })
    this.lines.on("line", (line) => this.receiveLine(line))
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "stoneforge",
        title: "Stoneforge",
        version: "0.1.0"
      }
    })
    this.notify("initialized", {})
  }

  async startThread(input: CodexAppServerTurnInput): Promise<string> {
    const result = await this.request("thread/start", {
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      approvalPolicy: "never",
      model: input.model,
      serviceName: "stoneforge"
    })
    const threadId = readThreadStartResponse(result)
    this.events.push({
      kind: "provider.session.started",
      providerSessionId: threadId
    })
    return threadId
  }

  async startTurn(
    threadId: string,
    input: CodexAppServerTurnInput
  ): Promise<CodexAppServerTurnResult> {
    const result = await this.request("turn/start", {
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      approvalPolicy: "never",
      input: [{ text: input.prompt, type: "text" }],
      model: input.model,
      sandboxPolicy: { type: "readOnly" },
      summary: "concise",
      threadId
    })
    const turnId = readTurnStartResponse(result)
    this.events.push({
      kind: "provider.turn.started",
      turnId
    })
    const completedStatus = this.completedTurns.get(turnId)
    if (completedStatus !== undefined) {
      this.completedTurns.delete(turnId)
      const completed = this.completedTurnResult(threadId, turnId, completedStatus)
      if (completed instanceof Error) {
        throw completed
      }

      return completed
    }

    return new Promise((resolve, reject) => {
      this.activeTurn = {
        reject,
        resolve,
        threadId,
        turnId
      }
    })
  }

  close(): void {
    this.lines.close()
    this.process.stdin.end()
    if (this.process.exitCode === null) {
      this.process.kill()
    }
  }

  private request(method: string, params: JsonObject): Promise<JsonObject> {
    const id = this.nextId++
    const message = { id, method, params } satisfies JsonRpcRequest

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve })
      this.send(message)
    })
  }

  private notify(method: string, params: JsonObject): void {
    this.send({ method, params } satisfies JsonRpcNotification)
  }

  private send(message: JsonRpcOutgoingMessage): void {
    this.process.stdin.write(`${encodeJsonRpcOutgoingMessage(message)}\n`)
  }

  private receiveLine(line: string): void {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return
    }

    try {
      this.receiveMessage(parseJsonRpcIncomingMessageWithSchemas(trimmed))
    } catch {
      this.rejectAll(
        new Error("codex app-server emitted invalid JSON-RPC message.")
      )
    }
  }

  private receiveMessage(message: JsonRpcIncomingMessage): void {
    if (isSuccessResponse(message)) {
      this.resolveRequest(message.id, message.result)
      return
    }

    if (isErrorResponse(message)) {
      this.rejectRequest(message.id, message.error.message)
      return
    }

    if (isNotification(message)) {
      this.handleNotification(message)
    }
  }

  private resolveRequest(id: JsonRpcId, result: JsonObject): void {
    const pending = this.pending.get(id)
    if (pending === undefined) {
      return
    }

    this.pending.delete(id)
    pending.resolve(result)
  }

  private rejectRequest(id: JsonRpcId, message: string): void {
    const pending = this.pending.get(id)
    if (pending === undefined) {
      return
    }

    this.pending.delete(id)
    pending.reject(new Error(`codex app-server request failed: ${message}`))
  }

  private handleNotification(message: JsonRpcNotification): void {
    if (message.method === "item/agentMessage/delta") {
      this.recordNotificationFacts(message)
      this.appendAgentMessageDelta(message)
      return
    }

    if (message.method === "item/completed") {
      this.recordNotificationFacts(message)
      this.recordCompletedItem(message)
      return
    }

    if (message.method !== "turn/completed") {
      this.recordNotificationFacts(message)
      return
    }

    this.recordNotificationFacts(message)
    this.completeTurn(message)
  }

  private appendAgentMessageDelta(message: JsonRpcNotification): void {
    const event = readCodexNotificationEvent(message)
    if (event?.kind === "provider.transcript.delta") {
      this.activeText.push(event.text)
    }
  }

  private recordCompletedItem(message: JsonRpcNotification): void {
    const transcript = readCodexTranscriptEntry(message)
    if (transcript === undefined) {
      return
    }

    this.transcript.push(transcript)
    this.completedText = transcript.text
  }

  private completeTurn(message: JsonRpcNotification): void {
    const turn = readTurnCompletion(message)
    if (turn === undefined) {
      return
    }

    const { status, turnId } = turn
    const activeTurn = this.takeActiveTurn(turnId)
    if (activeTurn === undefined) {
      this.completedTurns.set(turnId, status)
      return
    }

    this.resolveActiveTurn(activeTurn, status)
  }

  private takeActiveTurn(turnId: string): ActiveTurn | undefined {
    if (this.activeTurn?.turnId !== turnId) {
      return undefined
    }

    const activeTurn = this.activeTurn
    this.activeTurn = undefined
    return activeTurn
  }

  private resolveActiveTurn(activeTurn: ActiveTurn, status: string): void {
    const completed = this.completedTurnResult(
      activeTurn.threadId,
      activeTurn.turnId,
      status
    )
    if (completed instanceof Error) {
      activeTurn.reject(completed)
      return
    }

    activeTurn.resolve(completed)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()

    if (this.activeTurn !== undefined) {
      this.activeTurn.reject(error)
      this.activeTurn = undefined
    }
  }

  private recordNotificationFacts(message: JsonRpcNotification): void {
    const event = readCodexNotificationEvent(message)
    if (event !== undefined) {
      this.events.push(event)
    }
  }

  private completedTurnResult(
    threadId: string,
    turnId: string,
    status: string
  ): CodexAppServerTurnResult | Error {
    return completedCodexTurnResult({
      activeText: this.activeText,
      completedText: this.completedText,
      events: this.events,
      status,
      threadId,
      transcript: this.transcript,
      turnId
    })
  }
}
