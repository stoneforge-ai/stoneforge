# Stoneforge V2 Control Plane

Parent charter: [README.md](README.md)

This document defines the intended role of the V2 control-plane application
without freezing final HTTP routes, process topology, or deployment packaging.

## Scope And Status

First-slice scope:

- one backend application boundary in `apps/control-plane`
- durable command/API handlers for workspace setup, readiness evaluation,
  dispatch, provider observation, policy status publication, review, approval,
  and merge
- local SQLite, deployment-oriented PostgreSQL, and JSON dev/test persistence
  through one control-plane store abstraction
- fake local adapters plus opt-in GitHub App MergeRequest wiring
- smoke/e2e flows that compose the same public operations used by operators,
  CI, webhook handlers, or future HTTP APIs

Frozen in this doc:

- the control plane owns orchestration, I/O, provider wiring, diagnostics, and
  command/API boundaries
- domain rules remain in `packages/*`
- smoke and e2e flows must not bypass the public control-plane operation
  surface
- provider observations and policy status publication are real control-plane
  operations, not test-only shortcuts

Intentionally not specified yet:

- final REST, RPC, or event API shape
- database schema beyond current snapshot persistence
- deployment process topology
- complete authentication and authorization middleware
- final operator UI navigation

## Ownership Boundary

`apps/control-plane` is the backend entrypoint that assembles Stoneforge V2. It
loads configuration, opens stores, wires provider adapters, runs command/API
handlers, and coordinates operations across workspace, execution, and
merge-request packages.

The app does not own the product rules themselves:

- Workspace readiness and setup invariants remain in `@stoneforge/workspace`.
- Task dispatch, Assignment, Session, lease, and scheduler semantics remain in
  `@stoneforge/execution`.
- MergeRequest, Verification Run, review, approval, policy-check, and merge
  semantics remain in `@stoneforge/merge-request`.

The control-plane boundary is allowed to choose which package operation happens
next. It is not allowed to restate package-owned policy decisions or skip
package-owned state transitions for convenience.

## Operation Surface

The first operation surface is command-shaped because it must work for local
development, CI, e2e tests, and operator scripts before the final server API is
designed. Later HTTP, webhook, or worker entrypoints should call the same
operation handlers rather than introducing parallel orchestration paths.

Durable operation categories:

- configure workspace, repository, runtime, agent, role, and policy inputs
- evaluate workspace readiness
- create a direct Task
- execute the next dispatch intent through scheduler and adapter boundaries
- open or update a MergeRequest
- observe provider state and Provider Checks
- require provider verification for GitHub-backed flows
- record deterministic local verification only in fake-provider mode
- publish Stoneforge policy status/check
- request and complete review
- record human approval
- merge only when the MergeRequest is `merge_ready`

Durable code and docs should use operation names that describe production
control-plane behavior.

## Smoke And E2E Rule

Smoke/e2e scenarios may encode a specific scenario sequence, but each step must
call the public control-plane operation surface. They must not directly
manipulate package services, provider fixtures, persisted snapshots, or current
IDs in ways that future operator, webhook, CI, or local self-hosted flows could
not use.

The GitHub App smoke flow is required to observe real provider checks/statuses
before proceeding. It must not inject local fake verification in GitHub mode.
