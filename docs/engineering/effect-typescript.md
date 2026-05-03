# Effect TypeScript Rules

Status: V2 engineering guidance

Use this document whenever writing or modifying backend or library TypeScript code. Stoneforge backend and library internals use the Effect library to make asynchronous work, typed failures, dependency requirements, retries, interruption, resource lifetimes, and telemetry explicit.

This guidance is an implementation contract, not a product-domain model. Effect is how Stoneforge implements reliable TypeScript internals; it must not become part of user-facing API design.

## Scope

Effect is required for TypeScript backend and library implementation work, including:

- control-plane application services, commands, schedulers, workers, and adapters
- package internals that perform I/O, async orchestration, policy evaluation with dependencies, persistence, provider calls, retries, resource management, or other effectful work
- shared backend libraries that need typed failure, dependency injection, scoped resources, concurrency, or observability

Effect is not currently required for frontend implementation. React code must continue to follow [React engineering rules](../engineering/react.md).

Pure domain functions may stay plain TypeScript when they do not perform I/O, allocate resources, depend on services, or need typed operational failure. Do not wrap simple deterministic transformations in Effect just to satisfy the rule.

## API Boundary Rule

Effect must stay behind Stoneforge public, provider-facing, and frontend-facing boundaries.

Do not expose these in public APIs, provider-facing APIs, or private frontend APIs:

- `Effect.Effect`
- `Layer`
- `Context.Tag`
- `Scope`
- `Cause`
- Effect-specific service or runtime types

Public package APIs, HTTP handlers, CLI command boundaries, SDK clients, and frontend-facing request/response shapes should expose ordinary domain types, discriminated unions, `Promise` where async is required, and human-readable errors. They may run internal Effect programs behind the boundary.

Cross-package and package-to-app implementation APIs may require or return Effect types when both sides are backend/library internals. This is permitted and encouraged when it makes dependencies, typed failures, resource lifetime, concurrency, or observability simpler and more explicit. For example, `packages/core` may export an internal function used by another package that accepts Effect service requirements and returns an `Effect.Effect` result, so long as that function is not part of a public user-facing contract and is not consumed by a frontend app.

Acceptable boundary pattern:

```ts
export async function createTask(
  input: CreateTaskInput
): Promise<CreateTaskResult> {
  return Effect.runPromise(
    createTaskProgram(input).pipe(Effect.provide(LiveLayer))
  )
}
```

Internal modules may return `Effect.Effect<A, E, R>` when the caller is also inside the backend/library implementation boundary, even across package or package-to-app boundaries. Keep those modules clearly internal through package exports and file organization.

## Core Rules

### Model Effects Explicitly

Use `Effect.Effect<A, E, R>` for backend/library work that can fail operationally, needs services, runs asynchronously, performs I/O, controls concurrency, or needs interruption.

Use `Effect.gen` for multi-step workflows where generator syntax makes control flow easier to read. Use `pipe` for short transformations when it is clearer.

Keep pure computations pure. If a helper can be a total function with no operational dependencies, leave it as a plain function and call it from the Effect program.

### Use Typed Domain Errors

Expected failures belong in the error channel. Model them with tagged domain errors, usually through `Data.TaggedError`, and handle them with `Effect.catchTag`, `Effect.catchTags`, `Effect.match`, or boundary-specific translation.

Use defects only for programmer errors or impossible invariant violations. Do not throw for expected provider, persistence, policy, validation, cancellation, timeout, or configuration failures.

When calling throwing or Promise-based code, wrap the boundary with `Effect.try`, `Effect.tryPromise`, or a local adapter and immediately map failures into a Stoneforge error type.

### Use Services And Layers For Dependencies

Represent effectful dependencies with `Context.Tag` services and provide concrete implementations with `Layer`.

Use services for:

- persistence stores and transactions
- all external provider adapters, including source-control, agent, runtime, identity, notification, CI, and webhook adapters
- clocks, IDs, random values, configuration, and environment access
- logging, metrics, and OpenTelemetry setup

Do not read process environment, filesystem, network clients, databases, or provider SDKs directly from domain/policy modules. Those are app or infrastructure layer concerns.

### Manage Resources With Scope

Use Effect resource management for resources that must be closed, released, canceled, or flushed. Prefer scoped layers and acquire/release patterns over manual `try/finally` spread across callers.

This applies to database pools, provider clients with lifecycle, streaming connections, host-agent connections, OpenTelemetry SDK shutdown, and long-running scheduler resources.

### Use Effect For Concurrency, Retry, And Time

Scheduler, dispatch, adapter, and recovery logic should use Effect primitives for concurrency, timeout, retry schedules, interruption, and fiber lifecycle. Do not hand-roll retry loops or detached async work when Effect gives the behavior directly.

Retries must still respect the V2 policy and state-machine contracts. Effect retry tools implement the mechanics; Stoneforge policy decides whether retry, resume, repair, escalation, or cancellation is allowed.

## OpenTelemetry From The Start

Every backend executable should initialize OpenTelemetry through the Effect runtime from the beginning, even when local development exports to a no-op or console backend.

Use `@effect/opentelemetry` as the integration point between Effect observability and OpenTelemetry. Backend application entrypoints should build a live Layer that configures the Node OpenTelemetry SDK, exporters, service resource attributes, and shutdown behavior. Library packages should create spans through Effect instrumentation but must not configure global exporters or SDK process state.

### Required Span Boundaries

Create stable spans around operational boundaries that matter to V2 recovery and diagnosis:

- API, CLI, webhook, or automation trigger entrypoint
- readiness evaluation
- dispatch intent persistence and dedupe
- scheduler placement and lease acquisition
- Assignment creation and Session start/resume/cancel
- checkpoint capture
- provider adapter calls to GitHub, Claude Code, Codex, Daytona, and webhooks
- persistence transactions and migrations
- policy evaluation and Stoneforge Policy Check publication
- Verification Run observation and MergeRequest merge evaluation
- retry, resume, escalation, and cancellation decisions

Span names must be low-cardinality operation names such as `scheduler.evaluate_readiness`, `dispatch.acquire_lease`, `assignment.start_session`, `github.open_merge_request`, or `policy.evaluate_merge_request`. Put identifiers and variable detail in attributes, not span names.

### Required Attributes

Attach relevant canonical identifiers when available:

- `stoneforge.org.id`
- `stoneforge.workspace.id`
- `stoneforge.task.id`
- `stoneforge.plan.id`
- `stoneforge.assignment.id`
- `stoneforge.session.id`
- `stoneforge.merge_request.id`
- `stoneforge.verification_run.id`
- `stoneforge.dispatch_intent.id`
- `stoneforge.runtime.id`
- `stoneforge.agent.id`
- `stoneforge.role_definition.id`
- `stoneforge.policy.preset`
- `stoneforge.policy.decision`
- `stoneforge.provider.name`
- `stoneforge.provider.operation`

Never put secrets, tokens, private keys, raw prompts, transcript bodies, diffs, source code, full SQL text with user data, webhook payloads, or provider payloads into span attributes, events, logs, or metrics.

### Trace Context And Propagation

Preserve trace context across inbound and outbound boundaries where the transport supports it:

- inbound webhooks and API calls
- outbound automation webhooks
- host-agent control connections
- managed sandbox launch and callback paths
- provider adapter operations that support context metadata

When a provider cannot accept OpenTelemetry context, record Stoneforge correlation identifiers on spans and AuditEvents so operator debugging can still join telemetry with Execution Lineage.

## Audit Is Not Telemetry

OpenTelemetry spans, logs, and metrics are diagnostic signals. They are not the source of truth for policy, compliance, or lifecycle state.

Sensitive actions must still emit AuditEvents through the V2 audit model. Telemetry should carry correlation identifiers that help find the AuditEvent, Assignment, Session, MergeRequest, or provider operation involved.

## Testing

Test the public package or app Interface first. Public tests should not need to know that Effect exists behind the boundary.

For internal Effect programs:

- provide test Layers instead of monkey-patching globals
- use Effect test tools such as `TestClock` when time matters
- assert typed failures through the error channel
- test retry, timeout, cancellation, and resource cleanup behavior where those decisions are part of the contract
- use an in-memory OpenTelemetry exporter or span processor for telemetry tests, and assert only stable span names and required sanitized attributes

Do not snapshot trace IDs, span IDs, timestamps, durations, or provider-generated payloads.

## Migration Rule

New backend/library TypeScript work must follow this document. When changing existing backend/library code, move touched effectful behavior toward these rules in the same unit of work when it is reasonably local.

Do not churn pure domain modules or stable public APIs just to introduce Effect wrappers. The target is explicit operational behavior at real side-effect, dependency, concurrency, resource, and observability boundaries.

## References

- Effect docs: [Creating Effects](https://effect.website/docs/getting-started/creating-effects/), [Expected Errors](https://effect.website/docs/error-management/expected-errors/), [Managing Services](https://effect.website/docs/requirements-management/services/), [Managing Layers](https://effect.website/docs/requirements-management/layers/), and [Tracing](https://effect.website/docs/observability/tracing/)
- OpenTelemetry docs: [Libraries](https://opentelemetry.io/docs/concepts/instrumentation/libraries/) and [JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
