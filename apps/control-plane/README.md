# Stoneforge V2 Control Plane

Runs local control-plane scenarios through the active V2 domain services with fake adapters. The first scenario is a direct code-changing Task through dispatch, review, approval, and merge.

```sh
pnpm --dir apps/control-plane start
```

The command builds the control-plane app and its workspace package dependencies, runs the direct-task scenario, and prints a concise end-state summary.

## Persistent Local Tracer Bullet

Run the persistent control-plane tracer bullet with fake Agent and GitHub adapters:

```sh
pnpm --dir apps/control-plane start -- tracer-bullet
```

The command uses SQLite by default at `.stoneforge/control-plane.sqlite`, resets the local store, creates and configures a Workspace, creates a direct Task, runs the fake worker, recreates the control-plane service from the persisted store, then opens the MergeRequest, records CI, review, approval, merge, and prints the final summary.

The same flow can also be driven one public command at a time:

```sh
pnpm --dir apps/control-plane start -- initialize-workspace
pnpm --dir apps/control-plane start -- configure-repo
pnpm --dir apps/control-plane start -- configure-runtime
pnpm --dir apps/control-plane start -- configure-agent
pnpm --dir apps/control-plane start -- configure-role
pnpm --dir apps/control-plane start -- configure-policy
pnpm --dir apps/control-plane start -- validate-workspace
pnpm --dir apps/control-plane start -- create-direct-task
pnpm --dir apps/control-plane start -- run-worker
pnpm --dir apps/control-plane start -- open-merge-request
pnpm --dir apps/control-plane start -- observe-provider-state
pnpm --dir apps/control-plane start -- record-ci-passed
pnpm --dir apps/control-plane start -- request-review
pnpm --dir apps/control-plane start -- run-worker
pnpm --dir apps/control-plane start -- complete-review
pnpm --dir apps/control-plane start -- approve
pnpm --dir apps/control-plane start -- merge
pnpm --dir apps/control-plane start -- summary
```

## GitHub App MergeRequest Flow

The fake GitHub adapter remains the default. A real GitHub-backed MergeRequest flow is opt-in:

```sh
STONEFORGE_MERGE_PROVIDER=github \
STONEFORGE_GITHUB_APP_ID=12345 \
STONEFORGE_GITHUB_PRIVATE_KEY_PATH=/path/to/app-private-key.pem \
STONEFORGE_GITHUB_INSTALLATION_ID=67890 \
STONEFORGE_GITHUB_OWNER=toolco \
STONEFORGE_GITHUB_REPO=stoneforge-sandbox \
STONEFORGE_GITHUB_BASE_BRANCH=main \
pnpm --dir apps/control-plane start -- tracer-bullet --json
```

`STONEFORGE_GITHUB_PRIVATE_KEY` may be used instead of `STONEFORGE_GITHUB_PRIVATE_KEY_PATH`; escaped `\n` sequences are expanded. If `STONEFORGE_GITHUB_INSTALLATION_ID` is omitted, the control plane attempts installation discovery for the configured owner/repo.

Optional config:

- `STONEFORGE_GITHUB_SOURCE_BRANCH_PREFIX` sets the working branch prefix. Default: `stoneforge/task`.
- `STONEFORGE_GITHUB_ALLOW_MERGE=true` enables the final GitHub merge call. Leave it unset unless the target is a sandbox repository/branch.
- `STONEFORGE_GITHUB_API_BASE_URL` targets a non-default GitHub API URL for tests or GitHub Enterprise.

Required GitHub App repository grants:

- Metadata: read
- Contents: read/write, for branch refs and the task change marker commit
- Pull requests: read/write
- Commit statuses: read/write, for `stoneforge/policy`
- Checks: read, for check-run observation

The GitHub mode creates or updates a branch, commits a small task change marker under `.stoneforge/tasks/`, opens or reuses a PR, persists the provider PR id/number/url/head SHA, recreates the control-plane service after PR creation, observes provider PR state and checks/statuses, and records Stoneforge review/approval/policy state. The `stoneforge/policy` status is published to the observed PR head SHA. The GitHub one-shot command does not inject local fake CI; if no passing provider check/status is observed, it stops with a human-readable pending/failing check message. If merge is not enabled, the one-shot command stops after approval with the MergeRequest `merge_ready`; the explicit `merge` command reports that GitHub merge is disabled.

### SQLite

SQLite is the default local persistent store. To choose an explicit database path:

```sh
pnpm --dir apps/control-plane start -- tracer-bullet --store-backend sqlite --sqlite-path ../../.stoneforge/control-plane.sqlite
```

The same path can be provided with `STONEFORGE_CONTROL_PLANE_SQLITE_PATH`.

### PostgreSQL

PostgreSQL uses the same control-plane store abstraction and stores the domain-owned snapshots in JSONB columns with relational metadata for the current Org and Workspace.

```sh
STONEFORGE_CONTROL_PLANE_POSTGRES_URL=postgres://user:pass@localhost:5432/stoneforge \
  pnpm --dir apps/control-plane start -- tracer-bullet --store-backend postgres
```

The connection string can also be passed directly:

```sh
pnpm --dir apps/control-plane start -- tracer-bullet --store-backend postgres --postgres-url postgres://user:pass@localhost:5432/stoneforge
```

For local service-backed development, start Postgres with Docker Compose:

```sh
docker compose up -d postgres
pnpm --dir apps/control-plane start -- tracer-bullet --store-backend postgres --postgres-url postgres://stoneforge:stoneforge@localhost:5432/stoneforge
```

To run the app itself inside Compose against the Compose Postgres service:

```sh
docker compose --profile app up --abort-on-container-exit control-plane
```

### JSON Fallback

The file-backed JSON store remains available as a dev/test fallback. The legacy `--store` flag selects JSON automatically:

```sh
pnpm --dir apps/control-plane start -- tracer-bullet --store ../../.stoneforge/control-plane.json
```

You can also select it explicitly with `--store-backend json --json-store <path>` or `STONEFORGE_CONTROL_PLANE_JSON_PATH`.

### Tests

Default tests run SQLite and JSON persistence paths, plus a mocked PostgreSQL adapter contract:

```sh
pnpm --dir apps/control-plane test
```

The real PostgreSQL store and command-boundary tracer bullets are opt-in and run only when `STONEFORGE_CONTROL_PLANE_POSTGRES_TEST_URL` is set:

```sh
STONEFORGE_CONTROL_PLANE_POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/stoneforge_test \
  pnpm --dir apps/control-plane test
```

With the Compose database, use:

```sh
docker compose up -d postgres
pnpm --dir apps/control-plane test:postgres
```

Or run the test command inside Compose:

```sh
docker compose --profile test up --abort-on-container-exit control-plane-postgres-tests
```

### Live GitHub Tests

Live GitHub tests are skipped unless `STONEFORGE_GITHUB_LIVE_TESTS=1` is set with the GitHub App config above. They create or reuse a sandbox PR and do not merge unless `STONEFORGE_GITHUB_ALLOW_MERGE=true` is also set.

```sh
STONEFORGE_GITHUB_LIVE_TESTS=1 \
STONEFORGE_MERGE_PROVIDER=github \
STONEFORGE_GITHUB_APP_ID=12345 \
STONEFORGE_GITHUB_PRIVATE_KEY_PATH=/path/to/app-private-key.pem \
STONEFORGE_GITHUB_OWNER=toolco \
STONEFORGE_GITHUB_REPO=stoneforge-sandbox \
STONEFORGE_GITHUB_BASE_BRANCH=main \
pnpm --dir apps/control-plane test
```

Deferred behavior: webhook ingestion, provider comments, imported GitHub review identity mapping, generalized non-GitHub source control, and native CI execution remain outside this first GitHub flow.
