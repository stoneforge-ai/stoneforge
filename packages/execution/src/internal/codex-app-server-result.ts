import { z } from "zod"

import type { CodexAppServerTurnResult } from "../models.js"
import type {
  ProviderSessionEvent,
  ProviderTranscriptEntry,
} from "../provider-models.js"

const codexFailureDetailSchema = z.object({
  detail: z.string().trim().min(1),
})

export function completedCodexTurnResult(input: {
  readonly activeText: readonly string[]
  readonly completedText?: string
  readonly events: readonly ProviderSessionEvent[]
  readonly failureMessage?: string
  readonly status: string
  readonly threadId: string
  readonly transcript: readonly ProviderTranscriptEntry[]
  readonly turnId: string
}): CodexAppServerTurnResult | Error {
  if (input.status !== "completed") {
    return failedCodexTurnResult(input.status, input.failureMessage)
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
    turnId: input.turnId,
  }
}

function failedCodexTurnResult(
  status: string,
  failureMessage: string | undefined
): Error {
  if (failureMessage !== undefined) {
    return new Error(
      `codex app-server turn failed: ${codexFailureMessage(failureMessage)}`
    )
  }

  return new Error(`codex app-server turn ended as ${status}.`)
}

function codexFailureMessage(message: string): string {
  try {
    const decoded = codexFailureDetailSchema.safeParse(JSON.parse(message))

    if (decoded.success) {
      return decoded.data.detail
    }
  } catch {
    return message
  }

  return message
}
