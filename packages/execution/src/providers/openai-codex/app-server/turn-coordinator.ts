import type { CodexAppServerTurnResult } from "../../../models.js"

export interface CodexTurnCompletion {
  readonly failureMessage?: string
  readonly status: string
  readonly turnId: string
}

export interface PendingTurn {
  readonly reject: (error: Error) => void
  readonly resolve: (result: CodexAppServerTurnResult) => void
  readonly threadId: string
}

interface ActiveTurn extends PendingTurn {
  readonly turnId: string
}

export class CodexAppServerTurnCoordinator {
  private readonly completedTurns = new Map<string, CodexTurnCompletion>()
  private activeTurn: ActiveTurn | undefined
  private pendingTurn: PendingTurn | undefined

  constructor(
    private readonly complete: (
      threadId: string,
      turnId: string,
      completion: CodexTurnCompletion
    ) => CodexAppServerTurnResult | Error
  ) {}

  startPending(
    threadId: string,
    resolve: (result: CodexAppServerTurnResult) => void,
    reject: (error: Error) => void
  ): PendingTurn {
    const pendingTurn = { reject, resolve, threadId } satisfies PendingTurn
    this.pendingTurn = pendingTurn

    return pendingTurn
  }

  acceptTurnStart(pendingTurn: PendingTurn, turnId: string): void {
    if (this.pendingTurn !== pendingTurn) {
      return
    }

    const completedStatus = this.completedTurns.get(turnId)
    if (completedStatus !== undefined) {
      this.completedTurns.delete(turnId)
      this.resolvePendingTurn(pendingTurn, turnId, completedStatus)
      return
    }

    this.pendingTurn = undefined
    this.activeTurn = { ...pendingTurn, turnId }
  }

  completeTurn(completion: CodexTurnCompletion): void {
    const activeTurn = this.takeActiveTurn(completion.turnId)
    if (activeTurn !== undefined) {
      this.resolveActiveTurn(activeTurn, completion)
      return
    }

    const pendingTurn = this.takePendingTurn()
    if (pendingTurn === undefined) {
      this.completedTurns.set(completion.turnId, completion)
      return
    }

    this.resolvePendingTurn(pendingTurn, completion.turnId, completion)
  }

  rejectAll(error: Error): void {
    if (this.pendingTurn !== undefined) {
      this.pendingTurn.reject(error)
      this.pendingTurn = undefined
    }

    if (this.activeTurn !== undefined) {
      this.activeTurn.reject(error)
      this.activeTurn = undefined
    }
  }

  rejectPending(pendingTurn: PendingTurn, error: Error): void {
    if (this.pendingTurn !== pendingTurn) {
      return
    }

    this.pendingTurn = undefined
    pendingTurn.reject(error)
  }

  threadIdForTurn(turnId: string): string | undefined {
    if (this.activeTurn?.turnId === turnId) {
      return this.activeTurn.threadId
    }

    return this.pendingTurn?.threadId
  }

  private resolvePendingTurn(
    pendingTurn: PendingTurn,
    turnId: string,
    completion: CodexTurnCompletion
  ): void {
    this.pendingTurn = undefined
    this.resolveActiveTurn({ ...pendingTurn, turnId }, completion)
  }

  private resolveActiveTurn(
    activeTurn: ActiveTurn,
    completion: CodexTurnCompletion
  ): void {
    const completed = this.complete(
      activeTurn.threadId,
      activeTurn.turnId,
      completion
    )
    if (completed instanceof Error) {
      activeTurn.reject(completed)
      return
    }

    activeTurn.resolve(completed)
  }

  private takeActiveTurn(turnId: string): ActiveTurn | undefined {
    if (this.activeTurn?.turnId !== turnId) {
      return undefined
    }

    const activeTurn = this.activeTurn
    this.activeTurn = undefined
    return activeTurn
  }

  private takePendingTurn(): PendingTurn | undefined {
    const pendingTurn = this.pendingTurn
    this.pendingTurn = undefined
    return pendingTurn
  }
}
