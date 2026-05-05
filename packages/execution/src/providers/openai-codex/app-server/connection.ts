import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface, type Interface } from "node:readline"
import type {
  CodexAppServerTurnInput,
  CodexAppServerTurnResult,
} from "../../../models.js"
import type {
  ProviderSessionEvent,
  ProviderSessionEventSink,
  ProviderTranscriptEntry,
} from "../../models.js"
import {
  isErrorResponse,
  isNotification,
  isSuccessResponse,
  type JsonObject,
  type JsonRpcId,
  type JsonRpcIncomingMessage,
  type JsonRpcNotification,
  type JsonRpcOutgoingMessage,
  type JsonRpcRequest,
} from "./json.js"
import {
  encodeJsonRpcOutgoingMessage,
  parseJsonRpcIncomingMessageWithSchemas,
  readCodexNotificationEvent,
  readCodexTranscriptEntry,
  readThreadStartResponse,
  readTurnCompletion,
  readTurnStartResponse,
} from "./schema.js"
import { completedCodexTurnResult } from "./result.js"
import {
  CodexAppServerTurnCoordinator,
  type CodexTurnCompletion,
  type PendingTurn,
} from "./turn-coordinator.js"
interface PendingRequest {
  readonly reject: (error: Error) => void
  readonly resolve: (result: JsonObject) => void
}
export class CodexAppServerJsonRpcConnection {
  private readonly activeText: string[] = []
  private readonly events: ProviderSessionEvent[] = []
  private readonly lines: Interface
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private readonly providerSessionsStarted = new Set<string>()
  private readonly transcript: ProviderTranscriptEntry[] = []
  private completedText: string | undefined
  private nextId = 1
  private stderr = ""
  private readonly turns: CodexAppServerTurnCoordinator
  constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly onEvent: ProviderSessionEventSink | undefined = undefined
  ) {
    this.turns = new CodexAppServerTurnCoordinator((threadId, turnId, turn) =>
      this.completedTurnResult(threadId, turnId, turn)
    )
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
        version: "0.1.0",
      },
    })
    this.notify("initialized", {})
  }

  async startThread(input: CodexAppServerTurnInput): Promise<string> {
    const result = await this.request("thread/start", {
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      approvalPolicy: "never",
      model: input.model,
      serviceName: "stoneforge",
    })
    const threadId = readThreadStartResponse(result)
    return threadId
  }

  async startTurn(
    threadId: string,
    input: CodexAppServerTurnInput
  ): Promise<CodexAppServerTurnResult> {
    return new Promise((resolve, reject) => {
      const pendingTurn = this.turns.startPending(threadId, resolve, reject)

      this.request("turn/start", {
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        approvalPolicy: "never",
        input: [{ text: input.prompt, type: "text" }],
        model: input.model,
        sandboxPolicy: { type: "readOnly" },
        summary: "concise",
        threadId,
      })
        .then((result) => this.handleTurnStartResponse(pendingTurn, result))
        .catch((error: Error) => this.turns.rejectPending(pendingTurn, error))
    })
  }

  private handleTurnStartResponse(
    pendingTurn: PendingTurn,
    result: JsonObject
  ): void {
    const turnId = readTurnStartResponse(result)
    this.recordCodexSessionStarted(pendingTurn.threadId, turnId)
    this.recordEvent({
      kind: "provider.turn.started",
      turnId,
    })
    this.turns.acceptTurnStart(pendingTurn, turnId)
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

    this.recordCodexSessionStartedFromCompletion(turn)
    this.turns.completeTurn(turn)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()

    this.turns.rejectAll(error)
  }

  private recordNotificationFacts(message: JsonRpcNotification): void {
    const event = readCodexNotificationEvent(message)
    if (event !== undefined) {
      this.recordEvent(event)
    }
  }

  private recordEvent(event: ProviderSessionEvent): void {
    this.events.push(event)
    this.onEvent?.(event)
  }

  private recordCodexSessionStartedFromCompletion(
    turn: CodexTurnCompletion
  ): void {
    const threadId = this.turns.threadIdForTurn(turn.turnId)
    if (threadId !== undefined) {
      this.recordCodexSessionStarted(threadId, turn.turnId)
    }
  }

  private recordCodexSessionStarted(threadId: string, turnId: string): void {
    const providerSessionId = `openai-codex:${threadId}:${turnId}`
    if (this.providerSessionsStarted.has(providerSessionId)) {
      return
    }

    this.providerSessionsStarted.add(providerSessionId)
    this.recordEvent({
      kind: "provider.session.started",
      providerSessionId
    })
  }

  private completedTurnResult(
    threadId: string,
    turnId: string,
    completion: CodexTurnCompletion
  ): CodexAppServerTurnResult | Error {
    this.recordCodexSessionStarted(threadId, turnId)
    return completedCodexTurnResult({
      activeText: this.activeText,
      completedText: this.completedText,
      events: this.events,
      failureMessage: completion.failureMessage,
      status: completion.status,
      threadId,
      transcript: this.transcript,
      turnId,
    })
  }
}
