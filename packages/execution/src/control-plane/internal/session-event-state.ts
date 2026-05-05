import type { SessionView } from "../../models.js"
import type {
  ProviderLogEntry,
  ProviderSessionEvent
} from "../../providers/models.js"

export function sessionWithProviderEvent(
  session: SessionView,
  event: ProviderSessionEvent
): SessionView {
  return {
    ...session,
    events: [...session.events, event],
    finalSummary: sessionFinalSummary(session.finalSummary, event),
    logs: appendLogEntry(session.logs, event),
    providerSession: sessionProviderIdentity(session, event),
    providerSessionId: sessionProviderSessionId(session.providerSessionId, event),
    status: sessionStatus(session.status, event),
    transcript: appendTranscriptEntry(session.transcript, event)
  }
}

function appendLogEntry(
  logs: SessionView["logs"],
  event: ProviderSessionEvent
): readonly ProviderLogEntry[] {
  if (event.kind !== "provider.log") {
    return logs
  }

  return [...logs, { level: event.level, message: event.message }]
}

function appendTranscriptEntry(
  transcript: SessionView["transcript"],
  event: ProviderSessionEvent
): SessionView["transcript"] {
  if (event.kind !== "provider.transcript.item.completed") {
    return transcript
  }

  return [
    ...transcript,
    {
      providerItemId: event.providerItemId,
      role: event.role,
      text: event.text
    }
  ]
}

function sessionFinalSummary(
  current: string,
  event: ProviderSessionEvent
): string {
  if (event.kind !== "provider.session.completed") {
    return current
  }

  return event.summary
}

function sessionProviderIdentity(
  session: SessionView,
  event: ProviderSessionEvent
): SessionView["providerSession"] {
  if (event.kind !== "provider.session.started") {
    return session.providerSession
  }

  return {
    ...session.providerSession,
    providerSessionId: event.providerSessionId
  }
}

function sessionProviderSessionId(
  current: string,
  event: ProviderSessionEvent
): string {
  if (event.kind !== "provider.session.started") {
    return current
  }

  return event.providerSessionId
}

function sessionStatus(
  current: SessionView["status"],
  event: ProviderSessionEvent
): SessionView["status"] {
  if (event.kind !== "provider.session.completed") {
    return current
  }

  if (event.status === "completed" || event.status === "failed") {
    return event.status
  }

  return current
}
