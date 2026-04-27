import type {
  AgentAdapter,
  AgentAdapterResumeContext,
  AgentAdapterStartContext,
  Session,
  SessionHandle,
} from "@stoneforge/execution"

export interface FakeAgentSessionStart {
  assignmentId: string
  providerSessionId: string
  targetType: AgentAdapterStartContext["target"]["type"]
}

export interface FakeAgentSessionResume {
  assignmentId: string
  failedProviderSessionId: string
  providerSessionId: string
}

export interface FakeAgentFixture extends AgentAdapter {
  readonly starts: readonly FakeAgentSessionStart[]
  readonly resumes: readonly FakeAgentSessionResume[]
  readonly canceledSessionIds: readonly string[]
}

class LocalAgentAdapter implements FakeAgentFixture {
  readonly starts: FakeAgentSessionStart[] = []
  readonly resumes: FakeAgentSessionResume[] = []
  readonly canceledSessionIds: string[] = []

  async start(context: AgentAdapterStartContext): Promise<SessionHandle> {
    const providerSessionId = providerSessionIdFor(
      "start",
      context.target.type,
      this.starts.length + 1
    )

    this.starts.push({
      assignmentId: context.assignment.id,
      providerSessionId,
      targetType: context.target.type,
    })

    return { providerSessionId }
  }

  async resume(context: AgentAdapterResumeContext): Promise<SessionHandle> {
    const providerSessionId = providerSessionIdFor(
      "resume",
      context.target.type,
      this.resumes.length + 1
    )

    this.resumes.push({
      assignmentId: context.assignment.id,
      failedProviderSessionId: context.failedSession.providerSessionId,
      providerSessionId,
    })

    return { providerSessionId }
  }

  async cancel(session: Session): Promise<void> {
    this.canceledSessionIds.push(session.id)
  }
}

export function createFakeAgentFixture(): FakeAgentFixture {
  return new LocalAgentAdapter()
}

function providerSessionIdFor(
  action: "start" | "resume",
  targetType: AgentAdapterStartContext["target"]["type"],
  sequence: number
): string {
  return `local-${targetType}-${action}-${sequence}`
}
