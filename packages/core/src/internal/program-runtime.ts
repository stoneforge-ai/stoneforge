import { Cause, Effect, Exit, type Layer, Option } from "effect"

export async function runLayeredProgram<
  TResult,
  TError extends Error,
  TRequirements,
>(
  program: Effect.Effect<TResult, TError, TRequirements>,
  layer: Layer.Layer<TRequirements>
): Promise<TResult> {
  const exit = await Effect.runPromiseExit(Effect.provide(program, layer))

  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  const failure = Cause.failureOption(exit.cause)

  if (Option.isSome(failure)) {
    throw failure.value
  }

  throw Cause.squash(exit.cause)
}
