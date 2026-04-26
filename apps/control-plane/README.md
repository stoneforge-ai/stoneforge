# Stoneforge V2 Control Plane

`apps/control-plane` is the durable backend entrypoint for Stoneforge V2. It
wires storage, provider adapters, policy evaluation, task execution,
MergeRequest flow, diagnostics, and smoke/e2e commands around the domain rules
owned by `packages/*`.

The app owns orchestration and I/O boundaries:

- store selection and snapshot persistence for local, self-hosted, and future
  cloud deployments
- provider wiring for GitHub-backed MergeRequests and local fake adapters
- command/API handlers that operators, CI, webhook handlers, and smoke tests can
  call
- production-like composition of workspace setup, readiness evaluation,
  dispatch, provider observation, policy status publication, review, approval,
  and merge operations

The app does not own domain policy. Task lifecycle, scheduler behavior,
workspace readiness, MergeRequest policy, verification aggregation, review
outcomes, and approval semantics remain in the workspace, execution, and
merge-request packages.

```sh
pnpm --dir apps/control-plane start
```

The default command runs the local smoke flow and prints a concise end-state
summary.

## Public Operations

The stable control-plane operation surface is intentionally command-shaped for
now. HTTP/webhook/operator APIs can call the same handlers in later slices.

Durable operations:

```sh
pnpm --dir apps/control-plane start -- reset
pnpm --dir apps/control-plane start -- initialize-workspace
pnpm --dir apps/control-plane start -- configure-repository
pnpm --dir apps/control-plane start -- configure-runtime
pnpm --dir apps/control-plane start -- configure-agent
pnpm --dir apps/control-plane start -- configure-role-definition
pnpm --dir apps/control-plane start -- configure-policy
pnpm --dir apps/control-plane start -- evaluate-readiness
pnpm --dir apps/control-plane start -- create-direct-task
pnpm --dir apps/control-plane start -- execute-next-dispatch
pnpm --dir apps/control-plane start -- open-merge-request
pnpm --dir apps/control-plane start -- observe-provider-state
pnpm --dir apps/control-plane start -- require-provider-verification-passed
pnpm --dir apps/control-plane start -- record-local-verification-passed
pnpm --dir apps/control-plane start -- publish-policy-status
pnpm --dir apps/control-plane start -- request-review
pnpm --dir apps/control-plane start -- complete-agent-review
pnpm --dir apps/control-plane start -- record-human-approval
pnpm --dir apps/control-plane start -- merge-when-ready
pnpm --dir apps/control-plane start -- summary
```

Legacy spellings such as `tracer-bullet`, `configure-repo`, `run-worker`,
`approve`, and `merge` remain as compatibility aliases.

## Smoke And E2E Flows

Tracer bullets still exist, but only as smoke/e2e scenarios that compose the
public operation surface.

```sh
pnpm --dir apps/control-plane start -- smoke-flow
```

The local smoke flow uses SQLite by default at
`.stoneforge/control-plane.sqlite`, resets the store, creates and configures a
Workspace, evaluates readiness, creates a direct Task, executes the next
dispatch, recreates the control-plane service from the persisted store, opens a
MergeRequest, observes provider state, publishes policy status, records review
and human approval, merges when ready, and prints the final summary.

`tracer-bullet` is an alias for the same smoke flow.

## GitHub App MergeRequest Flow

The fake GitHub adapter remains the default. A real GitHub-backed MergeRequest
flow is opt-in:

```sh
STONEFORGE_MERGE_PROVIDER=github \
STONEFORGE_GITHUB_APP_ID=12345 \
STONEFORGE_GITHUB_PRIVATE_KEY_PATH=/path/to/app-private-key.pem \
STONEFORGE_GITHUB_INSTALLATION_ID=67890 \
STONEFORGE_GITHUB_OWNER=toolco \
STONEFORGE_GITHUB_REPO=stoneforge-sandbox \
STONEFORGE_GITHUB_BASE_BRANCH=main \
pnpm --dir apps/control-plane start -- smoke-flow --json
```

`STONEFORGE_GITHUB_PRIVATE_KEY` may be used instead of
`STONEFORGE_GITHUB_PRIVATE_KEY_PATH`; escaped `\n` sequences are expanded. If
`STONEFORGE_GITHUB_INSTALLATION_ID` is omitted, the control plane attempts
installation discovery for the configured owner/repo.

Optional config:

- `STONEFORGE_GITHUB_SOURCE_BRANCH_PREFIX` sets the working branch prefix.
  Default: `stoneforge/task`.
- `STONEFORGE_GITHUB_ALLOW_MERGE=true` enables the final GitHub merge call.
  Leave it unset unless the target is a sandbox repository/branch.
- `STONEFORGE_GITHUB_API_BASE_URL` targets a non-default GitHub API URL for
  tests or GitHub Enterprise.

Required GitHub App repository grants:

- Metadata: read
- Contents: read/write, for branch refs and the task change marker commit
- Pull requests: read/write
- Commit statuses: read/write, for `stoneforge/policy`
- Checks: read, for check-run observation

GitHub mode creates or updates a branch, commits a small task change marker
under `.stoneforge/tasks/`, opens or reuses a PR, persists the provider PR
id/number/url/head SHA, recreates the control-plane service after PR creation,
observes provider PR state and checks/statuses, and records Stoneforge
review/approval/policy state. The `stoneforge/policy` status is published to
the observed PR head SHA. The smoke flow does not inject local fake verification
in GitHub mode; if no passing provider check/status is observed, it stops with a
human-readable pending/failing check message. If merge is not enabled, the flow
stops after approval with the MergeRequest `merge_ready`; the explicit
`merge-when-ready` command reports that GitHub merge is disabled.

## SQLite

SQLite is the default local persistent store. To choose an explicit database
path:

```sh
pnpm --dir apps/control-plane start -- smoke-flow --store-backend sqlite --sqlite-path ../../.stoneforge/control-plane.sqlite
```

The same path can be provided with `STONEFORGE_CONTROL_PLANE_SQLITE_PATH`.

## PostgreSQL

PostgreSQL uses the same control-plane store abstraction and stores the
domain-owned snapshots in JSONB columns with relational metadata for the current
Org and Workspace.

```sh
STONEFORGE_CONTROL_PLANE_POSTGRES_URL=postgres://user:pass@localhost:5432/stoneforge \
  pnpm --dir apps/control-plane start -- smoke-flow --store-backend postgres
```

The connection string can also be passed directly:

```sh
pnpm --dir apps/control-plane start -- smoke-flow --store-backend postgres --postgres-url postgres://user:pass@localhost:5432/stoneforge
```

For local service-backed development, start Postgres with Docker Compose:

```sh
docker compose up -d postgres
pnpm --dir apps/control-plane start -- smoke-flow --store-backend postgres --postgres-url postgres://stoneforge:stoneforge@localhost:5432/stoneforge
```

To run the app itself inside Compose against the Compose Postgres service:

```sh
docker compose --profile app up --abort-on-container-exit control-plane
```

## JSON Fallback

The file-backed JSON store remains available as a dev/test fallback. The legacy
`--store` flag selects JSON automatically:

```sh
pnpm --dir apps/control-plane start -- smoke-flow --store ../../.stoneforge/control-plane.json
```

You can also select it explicitly with `--store-backend json --json-store
<path>` or `STONEFORGE_CONTROL_PLANE_JSON_PATH`.

## Tests

Default tests run SQLite and JSON persistence paths, plus a mocked PostgreSQL
adapter contract:

```sh
pnpm --dir apps/control-plane test
```

The real PostgreSQL store and command-boundary smoke flows are opt-in and run
only when `STONEFORGE_CONTROL_PLANE_POSTGRES_TEST_URL` is set:

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

## Live GitHub Tests

Live GitHub tests are skipped unless `STONEFORGE_GITHUB_LIVE_TESTS=1` is set
with the GitHub App config above. They create or reuse a sandbox PR and do not
merge unless `STONEFORGE_GITHUB_ALLOW_MERGE=true` is also set.

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

Deferred behavior: webhook ingestion, provider comments, imported GitHub review
identity mapping, generalized non-GitHub source control, and native CI
execution remain outside this first GitHub flow.
