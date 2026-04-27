import { Effect, type Layer } from "effect"

export function runLayeredProgram<TResult, TError, TRequirements>(
  program: Effect.Effect<TResult, TError, TRequirements>,
  layer: Layer.Layer<TRequirements>
): Promise<TResult> {
  return Effect.runPromise(Effect.provide(program, layer))
}
