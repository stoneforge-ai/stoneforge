import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import SQLiteDatabase from "better-sqlite3";
import type { QueryResult, QueryResultRow } from "pg";
import { asOrgId, asWorkspaceId } from "@stoneforge/workspace";
import { describe, expect, it } from "vitest";

import {
  createEmptyControlPlaneSnapshot,
  type ControlPlaneSnapshot,
} from "./control-plane-store.js";
import { FileControlPlaneStore } from "./json-control-plane-store.js";
import {
  type PostgresControlPlaneClient,
  PostgresControlPlaneStore,
} from "./postgres-control-plane-store.js";
import { SQLiteControlPlaneStore } from "./sqlite-control-plane-store.js";

describe("SQL control-plane stores", () => {
  it("initializes SQLite idempotently and persists snapshots", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-sqlite-store-"));
    const databasePath = join(tempDir, "control-plane.sqlite");

    try {
      const store = new SQLiteControlPlaneStore(databasePath);
      const snapshot = createEmptyControlPlaneSnapshot();

      expect((await store.load()).current.workspaceId).toBeUndefined();

      snapshot.current.workspaceId = asWorkspaceId("workspace_sqlite");

      await store.save(snapshot);
      await store.save(snapshot);

      const loaded = await new SQLiteControlPlaneStore(databasePath).load();

      expect(loaded.current.workspaceId).toBe("workspace_sqlite");

      await store.reset();
      expect((await store.load()).current.workspaceId).toBeUndefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports invalid JSON snapshot versions and shapes", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-json-store-"));
    const storePath = join(tempDir, "control-plane.json");
    const store = new FileControlPlaneStore(storePath);

    try {
      await writeFile(storePath, JSON.stringify(snapshotWithoutVersion()));
      await expect(store.load()).rejects.toThrow("uses version missing");

      await writeFile(storePath, JSON.stringify(snapshotWithoutWorkspaceState()));
      await expect(store.load()).rejects.toThrow(
        "missing required domain snapshot collections",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports SQLite open and corrupt snapshot failures for humans", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-sqlite-errors-"));
    const blockedParent = join(tempDir, "blocked");
    const corruptPath = join(tempDir, "corrupt.sqlite");

    try {
      await writeFile(blockedParent, "not a directory");
      await expect(
        new SQLiteControlPlaneStore(join(blockedParent, "db.sqlite")).load(),
      ).rejects.toThrow("Could not open SQLite control-plane database");

      await new SQLiteControlPlaneStore(corruptPath).reset();
      writeCorruptSQLiteSnapshot(corruptPath);

      await expect(new SQLiteControlPlaneStore(corruptPath).load()).rejects.toThrow(
        "current ids snapshot",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("persists snapshots through the PostgreSQL adapter contract", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresControlPlaneStore(
      "postgres://stoneforge.example/control-plane",
      () => client,
    );
    const snapshot = createEmptyControlPlaneSnapshot();

    snapshot.current.orgId = asOrgId("org_postgres");
    snapshot.current.workspaceId = asWorkspaceId("workspace_postgres");

    await store.save(snapshot);

    const loaded = await store.load();

    expect(loaded.current.orgId).toBe("org_postgres");
    expect(loaded.current.workspaceId).toBe("workspace_postgres");
    expect(client.migrationCount).toBe(2);

    await store.reset();
    expect((await store.load()).current.workspaceId).toBeUndefined();
  });

  it("loads PostgreSQL jsonb rows without requiring text serialization", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresControlPlaneStore(
      "postgres://stoneforge.example/control-plane",
      () => client,
    );
    const snapshot = createEmptyControlPlaneSnapshot();

    snapshot.current.orgId = asOrgId("org_jsonb");
    snapshot.current.workspaceId = asWorkspaceId("workspace_jsonb");
    client.seedJsonbSnapshot(snapshot);

    await expect(store.load()).resolves.toEqual(snapshot);
  });

  it("reports PostgreSQL configuration, connection, and migration failures", async () => {
    await expect(new PostgresControlPlaneStore(undefined).load()).rejects.toThrow(
      "requires a connection string",
    );
    await expect(
      new PostgresControlPlaneStore(
        "postgres://stoneforge.example/control-plane",
        () => new FailingPostgresClient("connect"),
      ).load(),
    ).rejects.toThrow("Could not connect to PostgreSQL");
    await expect(
      new PostgresControlPlaneStore(
        "postgres://stoneforge.example/control-plane",
        () => new FailingPostgresClient("connect-empty"),
      ).load(),
    ).rejects.toThrow("Check STONEFORGE_CONTROL_PLANE_POSTGRES_URL");
    await expect(
      new PostgresControlPlaneStore(
        "postgres://stoneforge.example/control-plane",
        () => new FailingPostgresClient("migration"),
      ).load(),
    ).rejects.toThrow("Could not initialize PostgreSQL");
    await expect(
      new PostgresControlPlaneStore(
        "postgres://stoneforge.example/control-plane",
        () => new FailingPostgresClient("read"),
      ).load(),
    ).rejects.toThrow("Could not read PostgreSQL control-plane snapshot");
  });
});

function snapshotWithoutVersion(): Omit<ControlPlaneSnapshot, "version"> {
  const { version: _version, ...snapshot } = createEmptyControlPlaneSnapshot();

  return snapshot;
}

function snapshotWithoutWorkspaceState(): object {
  return {
    ...createEmptyControlPlaneSnapshot(),
    workspace: {
      orgs: [],
      workspaces: [],
    },
  };
}

function writeCorruptSQLiteSnapshot(databasePath: string): void {
  const database = new SQLiteDatabase(databasePath);

  try {
    database
      .prepare(
        `
insert into control_plane_snapshots (
  id,
  snapshot_version,
  workspace_snapshot,
  execution_snapshot,
  merge_request_snapshot,
  current_snapshot
) values (?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        "default",
        1,
        JSON.stringify({ orgs: [], workspaces: [], auditEvents: [] }),
        JSON.stringify({
          workspaces: [],
          tasks: [],
          dispatchIntents: [],
          assignments: [],
          sessions: [],
          leases: [],
          mergeRequestContexts: [],
        }),
        JSON.stringify({ mergeRequests: [], verificationRuns: [] }),
        "{not json",
      );
  } finally {
    database.close();
  }
}

class FakePostgresClient implements PostgresControlPlaneClient {
  migrationCount = 0;
  private row: QueryResultRow | undefined;

  seedJsonbSnapshot(snapshot: ControlPlaneSnapshot): void {
    this.row = {
      snapshot_version: snapshot.version,
      current_org_id: snapshot.current.orgId ?? null,
      current_workspace_id: snapshot.current.workspaceId ?? null,
      workspace_snapshot: snapshot.workspace,
      execution_snapshot: snapshot.execution,
      merge_request_snapshot: snapshot.mergeRequests,
      current_snapshot: snapshot.current,
    };
  }

  async connect(): Promise<void> {}

  async end(): Promise<void> {}

  async query<TResult extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: (string | number | null)[] = [],
  ): Promise<QueryResult<TResult>> {
    if (sql.includes("control_plane_schema_migrations")) {
      this.migrationCount += 1;
      return queryResult([]);
    }

    if (sql.startsWith("\nselect")) {
      return queryResult(this.row === undefined ? [] : [this.row as TResult]);
    }

    if (sql.startsWith("\ninsert into control_plane_snapshots")) {
      this.row = postgresRow(values);
      return queryResult([]);
    }

    this.row = undefined;
    return queryResult([]);
  }
}

class FailingPostgresClient implements PostgresControlPlaneClient {
  constructor(
    private readonly failure: "connect" | "connect-empty" | "migration" | "read",
  ) {}

  async connect(): Promise<void> {
    if (this.failure === "connect") {
      throw new Error("connection refused");
    }

    if (this.failure === "connect-empty") {
      throw new Error("");
    }
  }

  async end(): Promise<void> {}

  async query<TResult extends QueryResultRow = QueryResultRow>(
    sql = "",
  ): Promise<QueryResult<TResult>> {
    if (this.failure === "migration") {
      throw new Error("permission denied");
    }

    if (this.failure === "read" && sql.startsWith("\nselect")) {
      throw new Error("select failed");
    }

    return queryResult([]);
  }
}

function postgresRow(values: (string | number | null)[]): QueryResultRow {
  return {
    snapshot_version: values[1] as 1,
    current_org_id: stringOrNull(values[2]),
    current_workspace_id: stringOrNull(values[3]),
    workspace_snapshot: stringValue(values[4]),
    execution_snapshot: stringValue(values[5]),
    merge_request_snapshot: stringValue(values[6]),
    current_snapshot: stringValue(values[7]),
  };
}

function queryResult<TResult extends QueryResultRow>(
  rows: TResult[],
): QueryResult<TResult> {
  return {
    command: "",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows,
  };
}

function stringOrNull(value: string | number | null): string | null {
  if (value === null) {
    return null;
  }

  return String(value);
}

function stringValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  return String(value);
}
