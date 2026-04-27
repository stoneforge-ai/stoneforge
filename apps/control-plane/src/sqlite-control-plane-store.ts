import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import SQLiteDatabase from "better-sqlite3"
import { Effect } from "effect"

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  type ControlPlaneStore,
  createEmptyControlPlaneSnapshot,
} from "./control-plane-store.js"
import { runControlPlaneEffect } from "./control-plane-runtime.js"
import {
  currentSchemaVersion,
  deserializeSnapshot,
  errorMessage,
  type SerializedSnapshot,
  serializeSnapshot,
  singletonSnapshotId,
} from "./sql-snapshot-codec.js"

interface SQLiteSnapshotRow {
  snapshot_version: 1
  current_org_id: string | null
  current_workspace_id: string | null
  workspace_snapshot: string
  execution_snapshot: string
  merge_request_snapshot: string
  current_snapshot: string
}

export class SQLiteControlPlaneStore implements ControlPlaneStore {
  constructor(private readonly databasePath: string) {}

  load(): Promise<ControlPlaneSnapshot> {
    return this.withDatabase("read", (database) => {
      const row = database
        .prepare(sqliteSelectSnapshot)
        .get(singletonSnapshotId) as SQLiteSnapshotRow | undefined

      if (row === undefined) {
        return createEmptyControlPlaneSnapshot()
      }

      return deserializeSnapshot(
        sqliteRowToSerializedSnapshot(row),
        `SQLite database at ${this.databasePath}`
      )
    })
  }

  save(snapshot: ControlPlaneSnapshot): Promise<void> {
    return this.withDatabase("save", (database) => {
      database.prepare(sqliteUpsertSnapshot).run({
        id: singletonSnapshotId,
        ...serializeSnapshot(snapshot),
      })
    })
  }

  reset(): Promise<void> {
    return this.withDatabase("reset", (database) => {
      database
        .prepare("delete from control_plane_snapshots where id = ?")
        .run(singletonSnapshotId)
    })
  }

  private withDatabase<TResult>(
    action: "read" | "reset" | "save",
    run: (database: SQLiteDatabase.Database) => TResult
  ): Promise<TResult> {
    return runControlPlaneEffect(
      Effect.acquireUseRelease(
        this.openDatabase(),
        (database) =>
          Effect.try({
            try: () => {
              migrateSQLite(database, this.databasePath)
              return run(database)
            },
            catch: (error) =>
              sqliteError(
                action,
                this.databasePath,
                error instanceof Error
                  ? error
                  : new Error("Unknown SQLite error.")
              ),
          }),
        (database) => Effect.sync(() => database.close())
      ).pipe(Effect.withSpan(`control_plane.sqlite_store.${action}`))
    )
  }

  private openDatabase(): Effect.Effect<
    SQLiteDatabase.Database,
    ControlPlanePersistenceError
  > {
    return Effect.gen(this, function* () {
      yield* Effect.tryPromise({
        try: () => mkdir(dirname(this.databasePath), { recursive: true }),
        catch: (error) =>
          sqliteError(
            "open",
            this.databasePath,
            error instanceof Error ? error : new Error("Unknown SQLite error.")
          ),
      })

      return yield* Effect.try({
        try: () => new SQLiteDatabase(this.databasePath),
        catch: (error) =>
          sqliteError(
            "open",
            this.databasePath,
            error instanceof Error ? error : new Error("Unknown SQLite error.")
          ),
      })
    })
  }
}

function migrateSQLite(
  database: SQLiteDatabase.Database,
  databasePath: string
): void {
  try {
    database.exec(sqliteMigration)
  } catch (error) {
    throw new ControlPlanePersistenceError(
      `Could not initialize SQLite control-plane database at ${databasePath}. Migration failed. ${errorMessage(
        error as Error
      )}`
    )
  }
}

function sqliteRowToSerializedSnapshot(
  row: SQLiteSnapshotRow
): SerializedSnapshot {
  return {
    snapshotVersion: row.snapshot_version,
    currentOrgId: row.current_org_id,
    currentWorkspaceId: row.current_workspace_id,
    workspaceSnapshot: row.workspace_snapshot,
    executionSnapshot: row.execution_snapshot,
    mergeRequestSnapshot: row.merge_request_snapshot,
    currentSnapshot: row.current_snapshot,
  }
}

function sqliteError(
  action: "open" | "read" | "reset" | "save",
  databasePath: string,
  error: Error
): ControlPlanePersistenceError {
  if (error instanceof ControlPlanePersistenceError) {
    return error
  }

  return new ControlPlanePersistenceError(
    `Could not ${sqliteActionText(
      action
    )} SQLite control-plane database at ${databasePath}. Check that the path can be created and opened. ${errorMessage(
      error
    )}`
  )
}

function sqliteActionText(action: "open" | "read" | "reset" | "save"): string {
  if (action === "open") {
    return "open"
  }

  return `${action} from`
}

const sqliteMigration = `
create table if not exists control_plane_schema_migrations (
  version integer primary key,
  applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists control_plane_snapshots (
  id text primary key,
  snapshot_version integer not null,
  current_org_id text,
  current_workspace_id text,
  workspace_snapshot text not null,
  execution_snapshot text not null,
  merge_request_snapshot text not null,
  current_snapshot text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert or ignore into control_plane_schema_migrations (version)
values (${currentSchemaVersion});
`

const sqliteSelectSnapshot = `
select
  snapshot_version,
  current_org_id,
  current_workspace_id,
  workspace_snapshot,
  execution_snapshot,
  merge_request_snapshot,
  current_snapshot
from control_plane_snapshots
where id = ?
`

const sqliteUpsertSnapshot = `
insert into control_plane_snapshots (
  id,
  snapshot_version,
  current_org_id,
  current_workspace_id,
  workspace_snapshot,
  execution_snapshot,
  merge_request_snapshot,
  current_snapshot,
  updated_at
) values (
  @id,
  @snapshotVersion,
  @currentOrgId,
  @currentWorkspaceId,
  @workspaceSnapshot,
  @executionSnapshot,
  @mergeRequestSnapshot,
  @currentSnapshot,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
on conflict(id) do update set
  snapshot_version = excluded.snapshot_version,
  current_org_id = excluded.current_org_id,
  current_workspace_id = excluded.current_workspace_id,
  workspace_snapshot = excluded.workspace_snapshot,
  execution_snapshot = excluded.execution_snapshot,
  merge_request_snapshot = excluded.merge_request_snapshot,
  current_snapshot = excluded.current_snapshot,
  updated_at = excluded.updated_at
`
