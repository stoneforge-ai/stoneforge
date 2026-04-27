import { Cause, Clock, Context, Effect, Exit, Layer, Option } from "effect"

export interface WorkspaceClock {
  readonly currentTimeMillis: () => number
}

export interface WorkspaceSetupServiceOptions {
  readonly clock?: WorkspaceClock
}

export class WorkspaceClockService extends Context.Tag(
  "@stoneforge/workspace/WorkspaceClockService"
)<WorkspaceClockService, { readonly now: Effect.Effect<string> }>() {}

export function workspaceRuntime(
  options: WorkspaceSetupServiceOptions = {}
): Layer.Layer<WorkspaceClockService> {
  const injectedClock = options.clock

  return Layer.succeed(WorkspaceClockService, {
    now: injectedClock
      ? Effect.sync(() => toIsoTimestamp(injectedClock.currentTimeMillis()))
      : currentIsoTimestamp,
  })
}

export function runWorkspaceProgram<
  TResult,
  TError extends Error,
  TRequirements,
>(
  program: Effect.Effect<TResult, TError, TRequirements>,
  layer: Layer.Layer<TRequirements>
): TResult {
  const exit = Effect.runSyncExit(Effect.provide(program, layer))

  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  const failure = Cause.failureOption(exit.cause)

  if (Option.isSome(failure)) {
    throw failure.value
  }

  throw Cause.squash(exit.cause)
}

export function now(): Effect.Effect<string, never, WorkspaceClockService> {
  return Effect.gen(function* () {
    const clock = yield* WorkspaceClockService

    return yield* clock.now
  })
}

const currentIsoTimestamp = Clock.currentTimeMillis.pipe(
  Effect.map(toIsoTimestamp)
)

function toIsoTimestamp(currentTimeMillis: number): string {
  return new Date(currentTimeMillis).toISOString()
}
