import { Cause, Context, Effect, Exit, Layer, Option } from "effect"

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  type ControlPlaneStore,
} from "./control-plane-store.js"

export class ControlPlaneStoreService extends Context.Tag(
  "@stoneforge/control-plane/ControlPlaneStoreService"
)<ControlPlaneStoreService, ControlPlaneStore>() {}

export function controlPlaneStoreRuntime(
  store: ControlPlaneStore
): Layer.Layer<ControlPlaneStoreService> {
  return Layer.succeed(ControlPlaneStoreService, store)
}

export function runControlPlaneProgram<TResult, TError extends Error>(
  program: Effect.Effect<TResult, TError, ControlPlaneStoreService>,
  store: ControlPlaneStore
): Promise<TResult> {
  return runControlPlaneEffect(
    Effect.provide(program, controlPlaneStoreRuntime(store))
  )
}

export async function runControlPlaneEffect<TResult, TError extends Error>(
  program: Effect.Effect<TResult, TError>
): Promise<TResult> {
  const exit = await Effect.runPromiseExit(program)

  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  const failure = Cause.failureOption(exit.cause)

  if (Option.isSome(failure)) {
    throw failure.value
  }

  throw Cause.squash(exit.cause)
}

export function loadControlPlaneSnapshot(): Effect.Effect<
  ControlPlaneSnapshot,
  ControlPlanePersistenceError,
  ControlPlaneStoreService
> {
  return storeAction("control_plane.store.load", "load", (store) =>
    store.load()
  )
}

export function saveControlPlaneSnapshot(
  snapshot: ControlPlaneSnapshot
): Effect.Effect<void, ControlPlanePersistenceError, ControlPlaneStoreService> {
  return storeAction("control_plane.store.save", "save", (store) =>
    store.save(snapshot)
  )
}

export function resetControlPlaneSnapshot(): Effect.Effect<
  void,
  ControlPlanePersistenceError,
  ControlPlaneStoreService
> {
  return storeAction("control_plane.store.reset", "reset", (store) =>
    store.reset()
  )
}

function storeAction<TResult>(
  spanName: string,
  action: "load" | "reset" | "save",
  run: (store: ControlPlaneStore) => Promise<TResult>
): Effect.Effect<
  TResult,
  ControlPlanePersistenceError,
  ControlPlaneStoreService
> {
  return Effect.gen(function* () {
    const store = yield* ControlPlaneStoreService

    return yield* Effect.tryPromise({
      try: () => run(store),
      catch: (error) => {
        if (error instanceof ControlPlanePersistenceError) {
          return error
        }

        return persistenceError(
          action,
          error instanceof Error ? error : undefined
        )
      },
    })
  }).pipe(Effect.withSpan(spanName))
}

function persistenceError(
  action: "load" | "reset" | "save",
  error: Error | undefined
): ControlPlanePersistenceError {
  const detail =
    error === undefined || error.message.length === 0 ? "" : ` ${error.message}`

  return new ControlPlanePersistenceError(
    `Could not ${action} control-plane store.${detail}`
  )
}
