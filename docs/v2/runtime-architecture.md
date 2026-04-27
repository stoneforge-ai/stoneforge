# Stoneforge V2 Runtime Architecture

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for how Stoneforge V2 schedules and executes first-slice work. It defines the runtime, host, scheduler, automation, adapter, and recovery boundaries needed to build the first real slice without freezing queue technology, provider payloads, or process topology.

## Scope And Status

First-slice scope:

- durable scheduler-owned dispatch, queueing, leasing, retry, and recovery
- customer-managed host execution through outbound host connectivity
- managed sandbox execution through a provider-neutral runtime contract
- Daytona as the first managed sandbox vendor
- Claude Code and OpenAI Codex adapters under the same control-plane model
- platform-provided and user-defined automations that trigger controlled workflow actions

Frozen in this doc:

- Automations create workflow intent; the Scheduler owns placement and recovery
- Host, Runtime, Agent, RoleDefinition, and adapter boundaries remain separate
- customer-managed hosts connect outbound to Stoneforge; no inbound SSH in the primary architecture
- one Assignment owns one dispatch; one or more Sessions may exist under that Assignment
- role attachment happens at dispatch time
- agent concurrency is enforced on the Agent, with additional capacity limits at Runtime and Host level
- backend runtime, scheduler, adapter, persistence, and recovery internals use Effect with OpenTelemetry instrumentation as described in [effect-typescript.md](effect-typescript.md)

Working assumptions:

- queue implementation may start simple so long as it is durable
- the first slice may run one or more scheduler processes, but the product contract is scheduler semantics, not a specific process model
- runtime selection is mostly achieved by selecting an eligible Agent that is already bound to a Runtime
- policy may add workspace or org concurrency caps later without changing the core Agent-level contract

Intentionally not specified yet:

- queue vendor or database schema
- process supervisor implementation
- exact lease timeout values
- exact load-balancing algorithm across equally eligible Agents
- exact host transport protocol
- exact provider SDK usage

## Control-Plane Persistence Boundary

The control-plane application role is defined in
[control-plane.md](control-plane.md). Runtime and persistence implementation must
preserve that boundary: the app wires I/O, storage, providers, diagnostics, and
operation handlers while package code owns domain behavior.

The control-plane persistence path is SQL-backed for active V2 work:

- SQLite is the default local development store
- PostgreSQL is the deployment-oriented store for cloud and self-hosted control planes
- the previous JSON file store remains a dev/test fallback only

Persistence stays an app/infrastructure concern. Domain packages own their snapshot export and restore shapes, and the control-plane store persists those cohesive snapshots as JSON payloads while keeping only useful operational metadata, such as current Org and Workspace identifiers, relational. Domain packages must not depend on SQL drivers, filesystem APIs, process environment, CLI parsing, or app framework details.

SQL stores initialize themselves idempotently and record a schema migration
marker. The first schema intentionally avoids table normalization beyond the
metadata required by the current smoke flow because no query or partial-update
need has been proven yet.

The GitHub-backed MergeRequest smoke flow uses the same snapshot boundary.
Provider PR identifiers are stored inside the MergeRequest snapshot as resume
facts, so a recreated control-plane service can observe the existing PR, record
provider checks/statuses, continue Stoneforge review/approval, and attempt merge
only when the GitHub adapter is explicitly configured to allow it.

## Component Boundaries

| Component            | Owns                                                                                                                                            | Does Not Own                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Automation           | event, schedule, or webhook trigger handling; creation of dispatch, review, merge-evaluation, escalation, or outbound automation webhook intent | direct provider session launch, lease management, policy bypass, merge execution |
| Scheduler            | readiness evaluation, durable queueing, leasing, placement, retries, resume, escalation, and cancellation propagation                           | role prompt content, provider-specific agent protocol, GitHub review semantics   |
| Host Agent           | outbound connectivity, capacity advertisement, launch/resume/cancel execution on customer-managed hosts, heartbeats, logs, result reporting     | repository authorization policy, task lifecycle decisions, merge decisions       |
| Runtime              | reusable execution environment contract describing where and how work runs                                                                      | task routing logic, role semantics                                               |
| Agent                | concrete harness/model capability bound to one Runtime plus concurrency limit                                                                   | planning, policy, or merge logic                                                 |
| RoleDefinition       | what job the Session performs, with prompt, tools, skills, and hooks                                                                            | runtime capacity or provider placement                                           |
| Claude/Codex Adapter | provider invocation, session identity, transcript/log capture, checkpoint extraction, resume/cancel hooks, final result reporting               | scheduling, policy evaluation, GitHub state, task status authority               |

## Effect And Observability Boundary

Backend implementation modules should model scheduler, adapter, persistence, recovery, and host-agent orchestration as internal Effect programs. Public control-plane APIs, provider-facing payloads, and frontend-facing clients must not expose Effect-specific types; they run Effect programs at app or package boundaries and translate results into ordinary domain responses.

OpenTelemetry is part of the runtime contract from the first slice. Backend executables initialize tracing through the Effect runtime, while library packages emit spans without configuring global exporters. Required spans should cover readiness evaluation, dispatch intent persistence, lease acquisition, Assignment and Session lifecycle, provider adapter calls, persistence transactions, policy evaluation, Verification Run observation, retry, resume, escalation, and cancellation.

Telemetry is diagnostic. It carries correlation identifiers for Execution Lineage and AuditEvents, but it does not replace durable workflow records, AuditEvents, policy decisions, or state-machine transitions.

## Architecture Overview

Stoneforge execution flows through the following path:

1. a human action or Automation creates workflow intent
2. the Scheduler persists that intent and reevaluates readiness and policy
3. the Scheduler resolves one concrete RoleDefinition, then finds an eligible Agent and Runtime path
4. the Scheduler acquires a lease against Agent concurrency and Runtime or Host capacity
5. execution is launched through either a customer-managed Host Agent or a managed sandbox provider adapter
6. the Claude Code or Codex adapter owns the concrete Session lifecycle
7. checkpoints, logs, and outcome reports flow back into Stoneforge
8. the Scheduler either marks success, schedules recovery, or escalates to human review

## Automation Vs Scheduler

Automations are user-facing durable triggers.

First-slice trigger types:

- product events such as task readiness, MergeRequest creation, verification changes, or review changes
- time-based schedules
- inbound workspace-scoped signed webhooks

First-slice action shapes:

- Agent Automation: create intent to run a concrete RoleDefinition with optional required agent or runtime constraints
- workflow-evaluation: request review, merge evaluation, or escalation handling through the normal control plane
- code-first: issue a signed outbound webhook to an external user-hosted handler

Rules:

- Automations never launch provider Sessions directly
- Automations never bypass Scheduler queueing or policy checks
- Automations may be platform-provided or user-defined, but both use the same control-plane boundaries
- user-defined code-first logic is hosted outside Stoneforge in the first slice

## Durable Queueing And Leasing

These are semantic internal records, not frozen storage types.

### Dispatch Intent

Dispatch intent is the durable record that some action should be evaluated by the Scheduler.

It should capture at least:

- target object such as Task, Plan, or MergeRequest
- requested action such as implement, review, reevaluate merge, or escalate
- requested RoleDefinition or workflow action type
- optional required tags or specific Agent constraints
- correlation identifiers for dedupe and audit

### Lease

A lease is a temporary reservation of execution capacity.
It is not the Assignment itself: the lease records scheduler capacity ownership, while the Assignment records the durable execution envelope created from a successful dispatch start.

It should capture at least:

- selected Agent
- selected Runtime
- selected Host or provider path
- time-bound ownership of one concurrency slot
- heartbeat and expiry information

Required behavior:

- if no eligible Agent exists, keep the intent durable and retry later
- if eligible Agents exist but all concurrency is exhausted, keep the intent queued and retry later
- if a lease expires before stable execution starts, release the slot and requeue
- if execution starts and then fails recoverably, either resume inside the same Assignment or create a fresh dispatch cycle as required by policy
- if retry thresholds are exceeded, escalate rather than looping forever

## Runtime Contract

A Runtime is the reusable contract that execution happens against.

First-slice Runtime responsibilities:

- define execution mode such as host worktree, container, or managed sandbox
- define environment preparation contract such as repository checkout, credential injection, and cleanup expectations
- advertise or enforce capability constraints such as network policy or tool availability
- expose enough health and capacity information for scheduling

What the Runtime contract should not freeze yet:

- exact filesystem layout
- container image format
- VM lifecycle API shapes
- exact sandbox network or resource classes

Current V2 package types preserve the known first-slice Runtime combinations:
customer-host Runtimes may use `local_worktree` or `container`, while managed
Runtimes currently use `managed_sandbox` with provider `daytona`. New Runtime
locations, modes, or managed providers require a docs update before being added
to the public type surface.

## Customer-Managed Host Path

The first customer-managed path is a host agent with outbound connectivity.

Required host-agent behavior:

- establish and maintain an outbound control connection to Stoneforge
- register Host identity and health
- advertise Runtime inventory and capacity
- accept start, resume, and cancel requests
- emit heartbeats, logs, checkpoints, and terminal outcome
- never require inbound SSH from Stoneforge

Host-agent trust boundary:

- Host Agents execute work only for Workspaces they are authorized to serve
- repository credentials should be short-lived and scoped to the assignment
- host-local ambient credentials are a fallback path at most, not the default contract

## Managed Sandbox Path

The first managed sandbox vendor is Daytona, but the product model stays provider-neutral.

Required managed sandbox behavior:

- create or select a per-assignment sandbox environment
- attach repository access using scoped, short-lived credentials
- start the selected adapter inside that sandbox
- stream heartbeats and results back to Stoneforge
- support cleanup or retention according to policy

Daytona-specific notes for the first slice:

- Daytona is the proving vendor for the managed sandbox Runtime path
- any Daytona-specific provisioning details should stay behind the Runtime adapter boundary
- the rest of the control plane should reason in terms of Runtime, Agent, Assignment, and Session rather than Daytona-specific nouns

## Runtime, Agent, And Role Resolution

Resolution order for an Agent Automation workflow action:

1. determine the workflow action type, such as implementation, review, or director planning
2. resolve one concrete RoleDefinition
3. filter Agents by compatibility with that RoleDefinition, required tags, policy, and health
4. filter remaining Agents by available concurrency
5. confirm the Agent's Runtime path is healthy and policy-allowed
6. lease the selected Agent and Runtime
7. create the Assignment and start the first Session

Important rules:

- explicit RoleDefinition selection is the normal path
- role tags may narrow the candidate set, but dispatch must resolve to one concrete RoleDefinition before execution
- Agent tags and Runtime tags are hard constraints, not preference weights
- the selection strategy among multiple equally eligible Agents is intentionally not frozen yet

## Concurrency Model

Concurrency rules for the first slice:

- Agent concurrency is the primary execution-slot limit
- Runtime and Host capacity may further constrain placement
- one active Lease consumes one Agent slot
- a live Assignment references the Lease that reserved its slot
- resumed Sessions inside the same Assignment continue under the same assignment-level capacity reservation unless policy releases and reacquires capacity
- multiple RoleDefinitions may share the same Agent over time, but only within the Agent's concurrency limit

Behavior when concurrency is exhausted:

- do not drop work
- keep dispatch intent queued
- retry when capacity changes or backoff expires
- escalate if repeated inability to place work crosses policy thresholds

## Adapter Boundaries

Claude Code and OpenAI Codex must fit behind a common adapter contract.

The adapter contract owns:

- provider launch and resume
- provider session identifier capture
- transcript and log collection
- checkpoint extraction and final summary extraction
- cancel or interrupt signaling
- terminal success or failure reporting

The adapter contract does not own:

- Task or Plan lifecycle decisions
- policy evaluation
- GitHub branch, PR, verification, or merge state
- queueing, retries, or escalation policy

Intent example only. This is not final implementation code.

```ts
interface AgentAdapter {
  start(assignmentContext: AssignmentContext): Promise<SessionHandle>
  resume(
    assignmentContext: AssignmentContext,
    checkpoint: Checkpoint
  ): Promise<SessionHandle>
  cancel(session: SessionHandle): Promise<void>
  collectOutcome(session: SessionHandle): Promise<AssignmentOutcome>
}
```

## Credentials And Repository Access

The default first-slice repository credential path is scoped, short-lived GitHub App installation credentials.

Rules:

- issue credentials per assignment or per short execution window
- inject credentials only into the Runtime that needs them
- avoid long-lived human PATs as the primary mechanism
- record credential issuance and sensitive use in audit logs
- do not require a customer-managed Host to have broad preinstalled Git credentials

## Retries, Recovery, And Escalation

Stoneforge must treat retry and recovery as first-class control-plane behavior.

Recovery categories:

- no eligible Agent yet
- Agent concurrency exhausted
- temporary host disconnect
- temporary managed-provider error
- Session crash
- Session context exhaustion
- launch failure before stable execution

Default recovery behavior:

- queue-and-retry placement problems
- create a new Session under the same Assignment for recoverable in-assignment failures
- create a new Assignment for new dispatches such as repair after review feedback or review after PR updates
- escalate to human review when repeated loops indicate the system is no longer progressing safely

## Code-First Automation Webhook Transport

User-defined code-first automations are external in the first slice.

Required first-slice behavior:

- Stoneforge hosts inbound signed webhook triggers that may create automation intent
- Stoneforge may also invoke user-hosted outbound automation webhook handlers when a configured code-first automation fires
- outbound webhook requests should include an idempotency key and a signed authenticity mechanism
- external handlers should acknowledge quickly and perform long-running work asynchronously
- follow-up actions should return through Stoneforge APIs or inbound webhooks

This keeps code-first automation extensibility without turning Stoneforge into a general-purpose workflow-code host before the main agent workflow is proven.
