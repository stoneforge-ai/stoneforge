import { Client, type QueryResult, type QueryResultRow } from "pg";

import type { ExecutionSnapshot } from "@stoneforge/execution";
import type { MergeRequestSnapshot } from "@stoneforge/merge-request";
import type { WorkspaceSetupSnapshot } from "@stoneforge/workspace";

import {
  ControlPlanePersistenceError,
  type ControlPlaneSnapshot,
  type ControlPlaneStore,
  createEmptyControlPlaneSnapshot,
} from "./control-plane-store.js";
import {
  currentSchemaVersion,
  deserializeSnapshot,
  errorMessage,
  type JsonColumn,
  jsonColumnText,
  type SerializedSnapshot,
  serializeSnapshot,
  singletonSnapshotId,
} from "./sql-snapshot-codec.js";

type SqlValue = string | number | null;

interface PostgresSnapshotRow extends QueryResultRow {
  snapshot_version: 1;
  current_org_id: string | null;
  current_workspace_id: string | null;
  workspace_snapshot: JsonColumn<WorkspaceSetupSnapshot>;
  execution_snapshot: JsonColumn<ExecutionSnapshot>;
  merge_request_snapshot: JsonColumn<MergeRequestSnapshot>;
  current_snapshot: JsonColumn<ControlPlaneSnapshot["current"]>;
}

export interface PostgresControlPlaneClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<TResult extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: SqlValue[],
  ): Promise<QueryResult<TResult>>;
}

export type CreatePostgresClient = (
  connectionString: string,
) => PostgresControlPlaneClient;

export class PostgresControlPlaneStore implements ControlPlaneStore {
  private readonly createClient: CreatePostgresClient;

  constructor(
    private readonly connectionString: string | undefined,
    createClient: CreatePostgresClient = defaultPostgresClient,
  ) {
    this.createClient = createClient;
  }

  async load(): Promise<ControlPlaneSnapshot> {
    return this.withClient("read", async (client) => {
      const result = await client.query<PostgresSnapshotRow>(
        postgresSelectSnapshot,
        [singletonSnapshotId],
      );
      const row = result.rows[0];

      if (row === undefined) {
        return createEmptyControlPlaneSnapshot();
      }

      return deserializeSnapshot(
        postgresRowToSerializedSnapshot(row),
        "PostgreSQL control-plane database",
      );
    });
  }

  async save(snapshot: ControlPlaneSnapshot): Promise<void> {
    await this.withClient("save", async (client) => {
      const serialized = serializeSnapshot(snapshot);

      await client.query(postgresUpsertSnapshot, [
        singletonSnapshotId,
        serialized.snapshotVersion,
        serialized.currentOrgId,
        serialized.currentWorkspaceId,
        jsonColumnText(serialized.workspaceSnapshot),
        jsonColumnText(serialized.executionSnapshot),
        jsonColumnText(serialized.mergeRequestSnapshot),
        jsonColumnText(serialized.currentSnapshot),
      ]);
    });
  }

  async reset(): Promise<void> {
    await this.withClient("reset", async (client) => {
      await client.query("delete from control_plane_snapshots where id = $1", [
        singletonSnapshotId,
      ]);
    });
  }

  private async withClient<TResult>(
    action: "read" | "reset" | "save",
    run: (client: PostgresControlPlaneClient) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.openClient();

    try {
      await migratePostgres(client);
      return await run(client);
    } catch (error) {
      throw postgresError(action, error as Error);
    } finally {
      await client.end();
    }
  }

  private async openClient(): Promise<PostgresControlPlaneClient> {
    if (this.connectionString === undefined || this.connectionString.length === 0) {
      throw new ControlPlanePersistenceError(
        "PostgreSQL control-plane store requires a connection string. Pass --postgres-url or set STONEFORGE_CONTROL_PLANE_POSTGRES_URL.",
      );
    }

    return connectPostgresClient(this.createClient(this.connectionString));
  }
}

async function connectPostgresClient(
  client: PostgresControlPlaneClient,
): Promise<PostgresControlPlaneClient> {
  try {
    await client.connect();
    return client;
  } catch (error) {
    throw new ControlPlanePersistenceError(
      `Could not connect to PostgreSQL control-plane database. Check STONEFORGE_CONTROL_PLANE_POSTGRES_URL and database availability. ${errorMessage(
        error as Error,
      )}`,
    );
  }
}

async function migratePostgres(client: PostgresControlPlaneClient): Promise<void> {
  try {
    await client.query(postgresMigration);
  } catch (error) {
    throw new ControlPlanePersistenceError(
      `Could not initialize PostgreSQL control-plane database. Migration failed. ${errorMessage(
        error as Error,
      )}`,
    );
  }
}

function postgresRowToSerializedSnapshot(
  row: PostgresSnapshotRow,
): SerializedSnapshot {
  return {
    snapshotVersion: row.snapshot_version,
    currentOrgId: row.current_org_id,
    currentWorkspaceId: row.current_workspace_id,
    workspaceSnapshot: jsonColumnText(row.workspace_snapshot),
    executionSnapshot: jsonColumnText(row.execution_snapshot),
    mergeRequestSnapshot: jsonColumnText(row.merge_request_snapshot),
    currentSnapshot: jsonColumnText(row.current_snapshot),
  };
}

function postgresError(
  action: "read" | "reset" | "save",
  error: Error,
): ControlPlanePersistenceError {
  if (error instanceof ControlPlanePersistenceError) {
    return error;
  }

  return new ControlPlanePersistenceError(
    `Could not ${action} PostgreSQL control-plane snapshot. Check the database connection and schema. ${errorMessage(
      error,
    )}`,
  );
}

function defaultPostgresClient(connectionString: string): PostgresControlPlaneClient {
  const client = new Client({ connectionString });

  return {
    async connect() {
      await client.connect();
    },
    async end() {
      await client.end();
    },
    async query<TResult extends QueryResultRow = QueryResultRow>(
      sql: string,
      values?: SqlValue[],
    ) {
      return client.query<TResult>(sql, values);
    },
  };
}

const postgresMigration = `
create table if not exists control_plane_schema_migrations (
  version integer primary key,
  applied_at timestamptz not null default now()
);

create table if not exists control_plane_snapshots (
  id text primary key,
  snapshot_version integer not null,
  current_org_id text,
  current_workspace_id text,
  workspace_snapshot jsonb not null,
  execution_snapshot jsonb not null,
  merge_request_snapshot jsonb not null,
  current_snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

insert into control_plane_schema_migrations (version)
values (${currentSchemaVersion})
on conflict (version) do nothing;
`;

const postgresSelectSnapshot = `
select
  snapshot_version,
  current_org_id,
  current_workspace_id,
  workspace_snapshot,
  execution_snapshot,
  merge_request_snapshot,
  current_snapshot
from control_plane_snapshots
where id = $1
`;

const postgresUpsertSnapshot = `
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
  $1,
  $2,
  $3,
  $4,
  $5::jsonb,
  $6::jsonb,
  $7::jsonb,
  $8::jsonb,
  now()
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
`;
