import { Client } from "pg"
import { asOrgId, asWorkspaceId } from "@stoneforge/workspace"
import { describe, expect, it } from "vitest"

import { createEmptyControlPlaneSnapshot } from "./control-plane-store.js"
import { PostgresControlPlaneStore } from "./postgres-control-plane-store.js"

describe.skipIf(postgresTestUrl() === undefined)(
  "PostgreSQL control-plane store e2e",
  () => {
    it("initializes schema idempotently and persists snapshots across store instances", async () => {
      const postgresUrl = requirePostgresTestUrl()
      const store = new PostgresControlPlaneStore(postgresUrl)
      const snapshot = createEmptyControlPlaneSnapshot()

      snapshot.current.orgId = asOrgId("org_postgres_e2e")
      snapshot.current.workspaceId = asWorkspaceId("workspace_postgres_e2e")

      await store.reset()
      await store.save(snapshot)
      await store.save(snapshot)

      const loaded = await new PostgresControlPlaneStore(postgresUrl).load()
      const metadata = await readPersistedMetadata(postgresUrl)

      expect(loaded.current.orgId).toBe("org_postgres_e2e")
      expect(loaded.current.workspaceId).toBe("workspace_postgres_e2e")
      expect(metadata.schemaVersion).toBe(1)
      expect(metadata.currentWorkspaceId).toBe("workspace_postgres_e2e")
      expect(metadata.workspaceSnapshotType).toBe("object")

      await store.reset()
      expect((await store.load()).current.workspaceId).toBeUndefined()
    })

    it("reports incompatible persisted snapshots from PostgreSQL", async () => {
      const postgresUrl = requirePostgresTestUrl()
      const store = new PostgresControlPlaneStore(postgresUrl)
      const snapshot = createEmptyControlPlaneSnapshot()

      snapshot.current.workspaceId = asWorkspaceId("workspace_incompatible")

      await store.reset()
      await store.save(snapshot)
      await writeIncompatibleSnapshotVersion(postgresUrl)

      await expect(store.load()).rejects.toThrow("uses version 999")

      await store.reset()
    })
  }
)

interface PersistedMetadata {
  schemaVersion: number
  currentWorkspaceId: string | null
  workspaceSnapshotType: string
}

async function readPersistedMetadata(
  connectionString: string
): Promise<PersistedMetadata> {
  const client = new Client({ connectionString })

  try {
    await client.connect()

    const result = await client.query<{
      schema_version: number
      current_workspace_id: string | null
      workspace_snapshot_type: string
    }>(`
select
  (select version from control_plane_schema_migrations order by version desc limit 1) as schema_version,
  current_workspace_id,
  jsonb_typeof(workspace_snapshot) as workspace_snapshot_type
from control_plane_snapshots
where id = 'default'
`)
    const row = result.rows[0]

    if (row === undefined) {
      throw new Error("PostgreSQL e2e snapshot row was not persisted.")
    }

    return {
      schemaVersion: row.schema_version,
      currentWorkspaceId: row.current_workspace_id,
      workspaceSnapshotType: row.workspace_snapshot_type,
    }
  } finally {
    await client.end()
  }
}

async function writeIncompatibleSnapshotVersion(
  connectionString: string
): Promise<void> {
  const client = new Client({ connectionString })

  try {
    await client.connect()
    await client.query(
      "update control_plane_snapshots set snapshot_version = 999 where id = 'default'"
    )
  } finally {
    await client.end()
  }
}

function postgresTestUrl(): string | undefined {
  return process.env.STONEFORGE_CONTROL_PLANE_POSTGRES_TEST_URL
}

function requirePostgresTestUrl(): string {
  const postgresUrl = postgresTestUrl()

  if (postgresUrl === undefined) {
    throw new Error("STONEFORGE_CONTROL_PLANE_POSTGRES_TEST_URL is required.")
  }

  return postgresUrl
}
