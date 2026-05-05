import type { LocalTaskConsoleView } from "../control-plane/index.js"

type Session = LocalTaskConsoleView["sessions"][number]
type NonTranscriptSessionEvent = Exclude<
  Session["events"][number],
  | { readonly kind: "provider.transcript.delta" }
  | { readonly kind: "provider.transcript.item.completed" }
>
type ProviderLifecycleEvent = Extract<
  NonTranscriptSessionEvent,
  {
    readonly kind:
      | "provider.session.completed"
      | "provider.session.started"
      | "provider.turn.started"
  }
>
export interface SessionActivityItem {
  readonly completed?: boolean
  readonly key: string
  readonly kind: "text" | "transcript"
  readonly providerItemId?: string
  readonly role?: Session["transcript"][number]["role"]
  readonly text: string
  readonly transcriptText?: string
}

interface TranscriptActivityInput {
  readonly completed: boolean
  readonly key: string
  readonly providerItemId?: string
  readonly role: Session["transcript"][number]["role"]
  readonly text: string
}

export function sessionActivityItems(
  session: Session
): readonly SessionActivityItem[] {
  const items: SessionActivityItem[] = []
  const eventLogCounts = providerLogEventCounts(session.events)

  session.events.forEach((event, index) => {
    appendSessionEventActivity(items, event, `event-${String(index)}`)
  })
  session.logs.forEach((log, index) => {
    const logKey = providerLogKey(log)
    const eventCount = eventLogCounts.get(logKey) ?? 0
    if (eventCount > 0) {
      eventLogCounts.set(logKey, eventCount - 1)
      return
    }

    appendTextActivity(
      items,
      `${log.level}: ${log.message}`,
      `log-${String(index)}`
    )
  })
  session.transcript.forEach((entry, index) => {
    appendTranscriptActivity(items, {
      completed: true,
      key: `transcript-${String(index)}`,
      providerItemId: entry.providerItemId,
      role: entry.role,
      text: entry.text
    })
  })

  return items
}

function providerLogEventCounts(events: Session["events"]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const event of events) {
    if (event.kind !== "provider.log") {
      continue
    }

    const key = providerLogKey(event)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

function providerLogKey(input: {
  readonly level: string
  readonly message: string
}): string {
  return `${input.level}:${input.message}`
}

function appendSessionEventActivity(
  items: SessionActivityItem[],
  event: Session["events"][number],
  key: string
): void {
  if (
    event.kind === "provider.transcript.delta" ||
    event.kind === "provider.transcript.item.completed"
  ) {
    appendTranscriptActivity(items, {
      completed: event.kind === "provider.transcript.item.completed",
      key,
      providerItemId: event.providerItemId,
      role: event.role,
      text: event.text
    })
    return
  }

  appendTextActivity(items, sessionEventText(event), key)
}

function appendTextActivity(
  items: SessionActivityItem[],
  text: string,
  key: string
): void {
  items.push({ key, kind: "text", text })
}

function appendTranscriptActivity(
  items: SessionActivityItem[],
  input: TranscriptActivityInput
): void {
  const existingIndex = findOpenTranscriptActivityIndex(items, input)
  if (existingIndex === -1) {
    appendNewTranscriptActivity(items, input)
    return
  }

  items[existingIndex] = mergedTranscriptActivity(items[existingIndex], input)
}

function appendNewTranscriptActivity(
  items: SessionActivityItem[],
  input: TranscriptActivityInput
): void {
  if (hasCompletedTranscriptActivity(items, input)) {
    return
  }

  items.push({
    completed: input.completed,
    key: input.key,
    kind: "transcript",
    providerItemId: input.providerItemId,
    role: input.role,
    text: `${input.role}: ${input.text}`,
    transcriptText: input.text
  })
}

function mergedTranscriptActivity(
  existing: SessionActivityItem,
  input: TranscriptActivityInput
): SessionActivityItem {
  const transcriptText = transcriptActivityText(existing, input)

  return {
    ...existing,
    completed: transcriptActivityCompleted(existing, input),
    providerItemId: existing.providerItemId ?? input.providerItemId,
    text: `${input.role}: ${transcriptText}`,
    transcriptText
  }
}

function transcriptActivityText(
  existing: SessionActivityItem,
  input: TranscriptActivityInput
): string {
  if (input.completed) {
    return input.text
  }

  return `${existing.transcriptText ?? ""}${input.text}`
}

function transcriptActivityCompleted(
  existing: SessionActivityItem,
  input: TranscriptActivityInput
): boolean {
  return existing.completed === true || input.completed
}

function findOpenTranscriptActivityIndex(
  items: readonly SessionActivityItem[],
  input: {
    readonly providerItemId?: string
    readonly role: Session["transcript"][number]["role"]
  }
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (isOpenTranscriptActivityMatch(items[index], input)) {
      return index
    }
  }

  return -1
}

function isOpenTranscriptActivityMatch(
  item: SessionActivityItem,
  input: {
    readonly providerItemId?: string
    readonly role: Session["transcript"][number]["role"]
  }
): boolean {
  if (!isOpenTranscriptCandidate(item, input.role)) {
    return false
  }

  return providerItemScopeMatches(item, input)
}

function isOpenTranscriptCandidate(
  item: SessionActivityItem,
  role: Session["transcript"][number]["role"]
): boolean {
  return (
    item.kind === "transcript" &&
    item.completed !== true &&
    item.role === role
  )
}

function providerItemScopeMatches(
  item: SessionActivityItem,
  input: { readonly providerItemId?: string }
): boolean {
  return hasProviderItemScope(item, input)
    ? item.providerItemId === input.providerItemId
    : true
}

function hasProviderItemScope(
  item: SessionActivityItem,
  input: { readonly providerItemId?: string }
): boolean {
  return item.providerItemId !== undefined || input.providerItemId !== undefined
}

function hasCompletedTranscriptActivity(
  items: readonly SessionActivityItem[],
  input: {
    readonly providerItemId?: string
    readonly role: Session["transcript"][number]["role"]
    readonly text: string
  }
): boolean {
  return items.some(
    (item) =>
      item.kind === "transcript" &&
      item.completed === true &&
      item.providerItemId === input.providerItemId &&
      item.role === input.role &&
      item.transcriptText === input.text
  )
}

function sessionEventText(event: NonTranscriptSessionEvent): string {
  if (event.kind === "provider.event") {
    return `event: ${event.name}`
  }

  if (event.kind === "provider.log") {
    return `${event.level}: ${event.message}`
  }

  return providerLifecycleEventText(event)
}

function providerLifecycleEventText(event: ProviderLifecycleEvent): string {
  switch (event.kind) {
    case "provider.session.completed":
      return `session ${event.status}: ${event.summary}`
    case "provider.session.started":
      return `session started: ${event.providerSessionId}`
    case "provider.turn.started":
      return `turn started: ${event.turnId}`
  }
}
