import type { CodexAppServerTurnResult } from "../models.js"
import type {
  ProviderSessionEvent,
  ProviderTranscriptEntry
} from "../provider-models.js"

export function completedCodexTurnResult(input: {
  readonly activeText: readonly string[]
  readonly completedText?: string
  readonly events: readonly ProviderSessionEvent[]
  readonly status: string
  readonly threadId: string
  readonly transcript: readonly ProviderTranscriptEntry[]
  readonly turnId: string
}): CodexAppServerTurnResult | Error {
  if (input.status !== "completed") {
    return new Error(`codex app-server turn ended as ${input.status}.`)
  }

  return {
    events: input.events,
    finalSummary: (input.completedText ?? input.activeText.join("")).trim(),
    logs: [],
    status: "completed",
    transcript:
      input.transcript.length > 0
        ? input.transcript
        : [{ role: "assistant", text: input.activeText.join("").trim() }],
    threadId: input.threadId,
    turnId: input.turnId
  }
}
