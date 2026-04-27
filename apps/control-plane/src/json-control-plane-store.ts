import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { Data, Effect } from "effect"

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  type ControlPlaneStore,
  createEmptyControlPlaneSnapshot,
  parseControlPlaneSnapshot,
} from "./control-plane-store.js"
import { runControlPlaneEffect } from "./control-plane-runtime.js"

class JsonStoreFileMissing extends Data.TaggedError("JsonStoreFileMissing")<
  Record<string, never>
> {}

export class FileControlPlaneStore implements ControlPlaneStore {
  constructor(private readonly filePath: string) {}

  load(): Promise<ControlPlaneSnapshot> {
    return runControlPlaneEffect(this.loadSnapshot())
  }

  save(snapshot: ControlPlaneSnapshot): Promise<void> {
    return runControlPlaneEffect(this.saveSnapshot(snapshot))
  }

  reset(): Promise<void> {
    return runControlPlaneEffect(this.resetSnapshot())
  }

  private loadSnapshot(): Effect.Effect<
    ControlPlaneSnapshot,
    ControlPlanePersistenceError
  > {
    return Effect.tryPromise({
      try: () => readFile(this.filePath, "utf8"),
      catch: (error) => {
        if (error instanceof Error && isNodeErrorWithCode(error, "ENOENT")) {
          return new JsonStoreFileMissing({})
        }

        return jsonStoreReadError(this.filePath)
      },
    }).pipe(
      Effect.flatMap((contents) =>
        Effect.try({
          try: () =>
            parseControlPlaneSnapshot(
              contents,
              `JSON store at ${this.filePath}`
            ),
          catch: (error) =>
            error instanceof ControlPlanePersistenceError
              ? error
              : jsonStoreReadError(this.filePath),
        })
      ),
      Effect.catchTag("JsonStoreFileMissing", () =>
        Effect.succeed(createEmptyControlPlaneSnapshot())
      ),
      Effect.withSpan("control_plane.json_store.load")
    )
  }

  private saveSnapshot(
    snapshot: ControlPlaneSnapshot
  ): Effect.Effect<void, ControlPlanePersistenceError> {
    return Effect.gen(this, function* () {
      yield* Effect.tryPromise({
        try: () => mkdir(dirname(this.filePath), { recursive: true }),
        catch: () =>
          new ControlPlanePersistenceError(
            `Could not create control-plane store directory for ${this.filePath}. Check filesystem access.`
          ),
      })

      yield* Effect.tryPromise({
        try: () =>
          writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`),
        catch: () =>
          new ControlPlanePersistenceError(
            `Could not write control-plane store at ${this.filePath}. Check filesystem access.`
          ),
      })
    }).pipe(Effect.withSpan("control_plane.json_store.save"))
  }

  private resetSnapshot(): Effect.Effect<void, ControlPlanePersistenceError> {
    return Effect.tryPromise({
      try: () => rm(this.filePath, { force: true }),
      catch: () =>
        new ControlPlanePersistenceError(
          `Could not reset control-plane store at ${this.filePath}. Check filesystem access.`
        ),
    }).pipe(Effect.withSpan("control_plane.json_store.reset"))
  }
}

function isNodeErrorWithCode(error: Error, code: string): boolean {
  return "code" in error && error.code === code
}

function jsonStoreReadError(filePath: string): ControlPlanePersistenceError {
  return new ControlPlanePersistenceError(
    `Could not read control-plane store at ${filePath}. Check that the file contains valid JSON.`
  )
}
