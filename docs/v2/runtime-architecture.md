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
- Agents are stateless configuration/capability records; Session state lives in Sessions, and execution capacity is constrained by Runtime, Host, or provider limits plus any configured Agent-level throttle
- backend runtime, scheduler, adapter, persistence, and recovery internals use Effect with OpenTelemetry instrumentation as described in [effect-typescript.md](../engineering/effect-typescript.md)

Working assumptions:

- queue implementation may start simple so long as it is durable
- the first slice may run one or more scheduler processes, but the product contract is scheduler semantics, not a specific process model
- runtime selection is achieved by selecting an eligible Agent and then resolving one concrete Runtime from that Agent's acceptable Runtime set using numeric priority scores
- policy may add workspace or org concurrency caps later without changing the core Agent-level contract

Intentionally not specified yet:

- queue vendor or database schema
- exact table and migration layout
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
- local OSS/dev product acceptance uses the real GitHub App provider boundary rather than fake providers

Automated golden-workflow acceptance may use a deterministic test Agent or
adapter for stable CI coverage of Stoneforge state-machine, scheduler, GitHub PR
flow, policy, review, repair, and merge behavior. This does not replace release
smoke coverage for real Claude Code and OpenAI Codex adapters: first-slice
release acceptance should prove launch, resume, cancel, provider Session
identity, progress, and outcome paths against real providers or their supported
local app-server integration. The full golden workflow should not depend on
live LLM quality, latency, or cost for every run.

Persistence stays an app/infrastructure concern. The active first-slice
persistence model should move toward normalized relational tables early rather
than relying on broad JSON snapshots as the long-term shape. The goal is to get
database-level constraints, typed query surfaces, migration discipline, and
production-ready data access before the workflow model becomes too large to
refactor safely.

Use a typed SQL layer, such as Drizzle, at the control-plane infrastructure
boundary. Domain packages must still not depend on SQL drivers, ORM/query
builders, filesystem APIs, process environment, CLI parsing, or app framework
details. Package interfaces own domain behavior and validation; the
control-plane persistence layer maps those domain records to relational rows.

SQL stores initialize themselves idempotently and record schema migrations.
Migrations are expected to evolve as the first slice is built. JSON snapshot
storage may remain a dev/test fallback and may be used as a narrow compatibility
bridge, but new production-oriented first-slice persistence should prefer
normalized tables for core workflow objects, relationships, provider facts,
AuditEvents, and Workflow Events.

Core workflow objects should have normalized current-state tables that answer
what is true now. AuditEvents and Workflow Events should also be stored as
append-only records that answer how the system reached that state. Workflow
Events should capture lifecycle and projection facts such as task readiness
changes, dispatch intent creation, Assignment and Session lifecycle changes,
checkpoint creation, MergeRequest opening, Verification Run observation, repair
triggers, policy decisions, preview lifecycle changes, and automation runs.

Provider PR identifiers and other resume facts should be persisted as
queryable provider fact rows or columns tied to the relevant MergeRequest rather
than hidden only inside opaque snapshots, so a recreated control-plane service
can observe the existing PR, record provider checks/statuses, continue
Stoneforge review/approval, and attempt merge only when the GitHub adapter is
explicitly configured to allow it.

## Component Boundaries

| Component            | Owns                                                                                                                                            | Does Not Own                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Automation           | event, schedule, or webhook trigger handling; creation of agent-based dispatch intent or code-first automation work                             | direct provider session launch, lease management, policy bypass, merge execution |
| Scheduler            | readiness evaluation, durable queueing, leasing, placement, retries, resume, escalation, and cancellation propagation                           | role prompt content, provider-specific agent protocol, GitHub review semantics   |
| Host Agent           | outbound connectivity, capacity advertisement, launch/resume/cancel execution on customer-managed hosts, heartbeats, logs, result reporting     | repository authorization policy, task lifecycle decisions, merge decisions       |
| Runtime              | reusable execution environment contract describing where and how work runs                                                                      | task routing logic, role semantics                                               |
| Agent                | concrete harness/model capability with an acceptable Runtime set, numeric Runtime priorities, and concurrency limit                              | planning, policy, or merge logic                                                 |
| RoleDefinition       | what job the Session performs, with prompt, tools, skills, and hooks                                                                            | runtime capacity or provider placement                                           |
| Claude/Codex Adapter | provider invocation, session identity, transcript/log capture, validated checkpoint update capture, resume/cancel hooks, final result reporting | scheduling, policy evaluation, GitHub state, task status authority               |

## Effect And Observability Boundary

Backend implementation modules should model scheduler, adapter, persistence, recovery, and host-agent orchestration as internal Effect programs. Public control-plane APIs, provider-facing payloads, and frontend-facing clients must not expose Effect-specific types; they run Effect programs at app or package boundaries and translate results into ordinary domain responses.

OpenTelemetry is part of the runtime contract from the first slice. Backend executables initialize tracing through the Effect runtime, while library packages emit spans without configuring global exporters. Required spans should cover readiness evaluation, dispatch intent persistence, lease acquisition, Assignment and Session lifecycle, provider adapter calls, persistence transactions, policy evaluation, Verification Run observation, retry, resume, escalation, and cancellation.

Telemetry is diagnostic. It carries correlation identifiers for Execution Lineage and AuditEvents, but it does not replace durable workflow records, AuditEvents, policy decisions, or state-machine transitions.

## Architecture Overview

Stoneforge execution flows through the following path:

1. a human action or Automation creates workflow intent
2. the Scheduler persists that intent and reevaluates readiness and policy
3. the Scheduler resolves one concrete RoleDefinition, then finds an eligible Agent and Runtime path
4. the Scheduler acquires a lease against the selected Runtime or Host capacity, plus any configured Agent-level throttle
5. execution is launched through either a customer-managed Host Agent or a managed sandbox provider adapter
6. the Claude Code or Codex adapter owns the concrete Session lifecycle
7. lightweight checkpoints, logs, and outcome reports flow back into Stoneforge
8. the Scheduler either marks success, schedules recovery, or escalates to human review

## Automation Vs Scheduler

Automations are user-facing durable triggers.

First-slice trigger types are curated, not arbitrary object-change
subscriptions:

- Task state changed
- Plan state changed
- MergeRequest opened or updated
- Review Outcome recorded
- VerificationRun changed
- AutomationRun changed
- time-based schedules
- inbound workspace-scoped signed webhooks
- schedule triggers support simple intervals and cron expressions, require explicit timezone, and record evaluated next-run time plus timezone in AutomationRun/source metadata
- missed schedule runs after downtime are not backfilled in the first slice; record a missed-run event/count, evaluate the next future run, and let users manually run if recovery is needed
- manual runs of schedule-based Automations create separate AutomationRuns and do not move or reset the next scheduled run time
- inbound webhook triggers use one unique endpoint per Automation in the first slice and require a signed request plus idempotency key
- inbound webhook signing supports either per-webhook signing secrets or a workspace-wide signing secret; Workspace or Org policy may disable workspace-wide signing-secret use
- inbound webhook signing secrets support rotation with an overlap window and last-used metadata for old/new secret retirement
- outbound automation webhook signing supports either per-destination signing secrets or a workspace-wide outbound signing secret; Workspace or Org policy may require per-destination secrets
- outbound automation webhook signing secrets support rotation with an overlap window and last-used metadata

First-slice action shapes:

- Agent Automation: create intent to run a concrete RoleDefinition with optional required agent or runtime constraints
- code-first: run platform-defined workflow code, or issue a signed outbound webhook to an external user-hosted handler

Rules:

- Automations never launch provider Sessions directly
- Automations never bypass Scheduler queueing or policy checks
- Automations may be platform-provided or user-defined, but both use the same control-plane boundaries
- arbitrary "any object changed" triggers are out of scope until event schemas and loop-prevention rules are stronger
- AutomationRun changed triggers require explicit filters for AutomationRun state, action, and source; self-triggering is prevented by default; idempotency keys are enforced; and chain depth is capped per root correlation ID
- exceeding the chain-depth cap creates a blocked AutomationRun with reason `automation_chain_depth_exceeded`, root correlation ID and parent-run lineage, and UI visibility rather than silently dropping the event
- the user-defined automation chain-depth cap is Workspace policy, defaulting conservatively to `3`; platform automations may use separate internal safeguards
- workflow evaluation is not a third automation action type; platform merge-evaluation and failure-escalation automations are platform-defined code-first automations
- user-defined code-first logic is hosted outside Stoneforge in the first slice
- each trigger evaluation creates an AutomationRun that records the trigger source, evaluated policy, idempotency key, target object, action type, attempts, result, and linked follow-up objects
- agent-based AutomationRuns may create Dispatch Intent; code-first AutomationRuns record platform handler or outbound webhook attempts and results
- AutomationRuns snapshot the effective Automation definition or reference an immutable Automation version at run creation
- Automation edits affect future AutomationRuns only; existing running, delivering, blocked, or retrying runs keep their original version/snapshot
- disabling an Automation prevents new trigger-created AutomationRuns but does not stop existing runs by default; cancel-active-runs is an explicit operator action
- Automation hard delete is out of scope in the first slice; archive or soft-delete preserves versions and historical AutomationRuns
- archived or soft-deleted Automations keep historical runs inspectable, but direct manual re-run requires restoring the Automation or creating a new Automation from the historical version
- AutomationRun lifecycle states should be `created`, `blocked`, `delivering`, `retry_wait`, `running`, `succeeded`, `failed`, and `canceled`
- `succeeded` means the automation action succeeded; Dispatch Intent creation, webhook acknowledgement, provider facts, or workflow updates are results and linked records
- `blocked` may become actionable again after policy, eligibility, idempotency, or configuration facts change
- blocked AutomationRun re-evaluation is explicit Workspace policy, defaulting to platform automations and non-external user-defined automations only; alternative modes are all automations or no automations

## Durable Queueing And Leasing

These are semantic internal records, not frozen storage types.

### Dispatch Intent

Dispatch intent is the durable record that some action should be evaluated by the Scheduler.

It should capture at least:

- target object such as Task, Plan, or MergeRequest
- requested action such as implement, review, reevaluate merge, or escalate
- requested RoleDefinition or workflow action type
- optional required tags, including Required Agent Tags
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
- if required Agent tags are unsatisfiable, immediately record an `unplaceable` placement blocker instead of silently retrying as a transient capacity issue
- if eligible Agents exist but all concurrency is exhausted, keep the intent queued and retry later
- if an otherwise eligible Agent has no acceptable Runtime currently healthy, policy-allowed, and below capacity, keep the intent queued and record the placement reason
- never place work on an Agent or Runtime outside the resolved acceptable set
- if a lease expires before stable execution starts, release the slot and requeue
- if execution starts and then fails recoverably, either resume inside the same Assignment or create a fresh dispatch cycle as required by policy
- if retry thresholds are exceeded, escalate rather than looping forever

## Runtime Contract

A Runtime is the reusable contract that execution happens against.

First-slice Runtime responsibilities:

- define execution mode such as host worktree, container, or managed sandbox
- define environment preparation contract such as repository checkout, credential injection, and cleanup expectations
- carry configuration for network policy, capacity, and environment preparation relevant to its execution mode
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

First-slice customer-managed Runtimes are statically bound to one specific Host
plus one execution mode. The Scheduler checks that Host's current health and
capacity before leasing work, but it does not dynamically choose among
interchangeable Hosts. A later slice may introduce Runtime-level Host capability
requirements and dynamic Host placement.

Disabling a Runtime or editing Runtime capacity/configuration affects future
placement only by default. New dispatch stops for that Runtime, and queued or
ready work is blocked if no acceptable Runtime remains. Running Assignments keep
their resolved Runtime unless an explicit operator or policy action stops them.
Destructive Runtime removal requires confirmation when running or queued work
depends on it, and queued work receives placement blockers and repair actions
rather than silent cancellation.

## Customer-Managed Host Path

The first customer-managed path is a host agent with outbound connectivity.

Host registration contract:

- a Host is registered to one Workspace
- registration records name, host type, reachability and heartbeat state, supported Runtime labels and capabilities, capacity limits, and a scoped enrollment token
- the Host Agent uses the enrollment token to establish its first outbound connection and bind itself to the registered Host
- the first slice supports reconnecting, disabling, and removing Hosts
- the first slice does not need fleet autoscaling or complex host scheduling
- disabling a Host stops new leases and dispatch to that Host, and queued or ready work is blocked if no acceptable placement remains
- running Assignments may continue on a disabled Host while the Host remains connected
- removing or force-disconnecting a Host with running Assignments requires confirmation and must either wait for the work to stop or explicitly stop and mark those Assignments interrupted
- unexpected Host disconnect creates a contact-loss reconciliation window rather than immediately failing affected Assignments
- when the Host reconnects, Stoneforge reconciles known Sessions with the Host Agent; healthy processes continue without resume, while stopped or lost processes move through recoverable interruption and resume or redispatch policy
- the control plane owns the authoritative Session and Assignment state transition after reconciliation
- Host Agents report observed facts: live process and Session inventory, terminal outcomes, logs and checkpoints since the last heartbeat, and any unknown observation gaps
- provider adapters validate provider-specific Session identity and resumability where applicable

Required host-agent behavior:

- establish and maintain an outbound control connection to Stoneforge
- register Host identity and health
- advertise Runtime inventory and capacity
- accept start, resume, and cancel requests
- accept operator steering messages for active or continuable Sessions when the selected adapter supports them
- emit heartbeats, logs, checkpoints, and terminal outcome
- report active Session inventory and terminal facts after reconnect so Stoneforge can distinguish temporary control-plane loss from stopped execution for connectionful adapters
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
3. filter Agents by Dispatch Intent constraints, policy, and health
4. filter remaining Agents by available concurrency
5. resolve one concrete Runtime from the Agent's acceptable Runtime set using numeric priority scores
6. confirm the selected Runtime path is healthy, has capacity, and is policy-allowed
7. lease the selected Agent and Runtime
8. create the Assignment and start the first Session

Important rules:

- explicit RoleDefinition selection is the normal path
- RoleDefinitions do not express Agent or Runtime preference
- any RoleDefinition may be combined with any Agent for an Assignment
- dispatch must resolve to one concrete RoleDefinition before execution
- Agent tags and Runtime tags are hard constraints, not preference weights
- provider/model routing, such as Codex vs Claude, is expressed through Agent tags and required Agent tags on Tasks, Automations, or one-off Dispatch Intent constraints
- preferred Agent tags and tag scoring are out of scope for the first slice
- specific-Agent pinning should be modeled as a Required Agent Tag, such as an Agent-id-style tag, rather than a separate scheduler constraint type
- every Agent should have a stable system-managed Agent-id tag that is visible/selectable in advanced routing UI
- system-managed tags are not user-editable or removable; deleting the Agent removes its Agent-id tag and can make queued work requiring that tag unplaceable
- first-class provider, model-family, model, and agent scoped tags on Agents are system-derived from Agent configuration and updated when the Agent configuration changes
- Agent configuration changes that remove system-derived tags required by queued or ready work, and Agent disables that would block queued or ready work, require UI confirmation and leave affected work blocked with repair actions after save
- running Assignments keep their resolved Agent, Runtime, RoleDefinition, and provider Session context; Agent edits, disabling, availability changes, and system-derived tag changes affect future dispatch only unless explicit operator or policy action stops, cancels, or resumes the work
- Agent Runtime priority is a numeric score on each acceptable Runtime, not a dynamic Host-pool placement algorithm
- when multiple eligible acceptable Runtimes have the same priority, deterministic tie-breaking is sufficient; first-slice load-balancing is not required
- if no acceptable Runtime is currently healthy, policy-allowed, and below capacity, the Dispatch Intent remains queued until health/capacity changes, backoff expires, or policy escalates
- the Scheduler must not silently escape the Agent's acceptable Runtime set
- the selection strategy among multiple equally eligible Agents is intentionally not frozen yet

## Concurrency Model

Concurrency rules for the first slice:

- Runtime and Host or provider limits are the primary execution capacity constraints
- Agent-level concurrency, if configured, is a throttle or quota on Sessions launched through that Agent for token/cost control, model/provider rollout, or A/B testing rather than protection for Agent-local state
- one active Assignment-level Lease consumes the selected Runtime/Host or provider capacity and any configured Agent throttle
- Sessions run under the Assignment-level Lease rather than acquiring independent capacity
- recoverable Session endings, Contact Loss, and `resume_pending` keep the Assignment capacity reservation so recovery can proceed without competing for placement again
- Assignment capacity reservations release on Assignment success, cancellation, escalation, explicit abandonment, or after a configurable stale timeout for unreachable or lost work
- multiple RoleDefinitions may share the same Agent over time, subject to Runtime/Host/provider capacity and any configured Agent throttle

## Session Connectivity Model

A Session is the provider execution context under an Assignment, not always a
live network connection. Many providers expose durable provider-side conversation
or session records that can be continued later by provider Session ID and a new
prompt. For those adapters, a gap between prompts is normal and must not be
treated as disconnect.

Some adapters are connectionful. Codex App Server is the first-slice example:
the Session requires an active connection to the app server while work is being
observed or controlled, and it may enter reconnect/contact-loss behavior if that
connection drops. Adapter capabilities must declare Session connectivity as
`connectionless` or `connectionful` so the Scheduler applies Contact Loss and
reconnect reconciliation only where meaningful. `connectionless` Sessions are
continued by provider Session ID and prompt; `connectionful` Sessions require an
active provider or app-server connection for observation or control.

For `connectionless` adapters, one Stoneforge Session corresponds to one
provider Session ID. Continuation prompts, responses, steering messages, logs,
and checkpoint facts are Session events or messages, not new Stoneforge
Sessions. A new Stoneforge Session is created only when Stoneforge switches to a
different provider Session ID, recovers from a non-continuable failure, or
deliberately starts a replacement execution context under the same Assignment.

For `connectionful` Sessions, Contact Loss pauses both operator
observation/control and autonomous Assignment progress. Stoneforge must not send
new prompts or commands into a Session whose state is unknown. Reconnect
reconciliation either returns the Session to active progress or confirms the
Session is lost/stopped, moving the Assignment to `resume_pending` or escalation
according to policy.

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
- operator steering message delivery when supported by the provider
- validated checkpoint update capture and final summary extraction
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

Checkpoint updates should be submitted by agents through the broader
Stoneforge agent CLI/tool surface rather than inferred from arbitrary transcript
prose. This is an agent action inside the general Stoneforge command surface,
not a checkpoint-specific tool. The action should validate the update
immediately: referenced todo or Acceptance Criteria items must exist, except
that implementing agents may add small task-local todo items when they discover
implementation substeps needed to finish the approved Task. Implementing agents
must not add or change Acceptance Criteria; Acceptance Criteria are part of the
Task contract set on creation and require Director or human task-edit/review
flows to change. Notes/key insights must stay bounded, key files must be valid
workspace paths, and the update must link to the responsible Assignment and
Session. Validation errors are returned to the agent so it can correct and
retry during the Session.

The broader first-slice Agent Command Surface is a controlled API, CLI, and
tool surface for Stoneforge control-plane/data actions agents need during
assigned work. It may expose reading assigned context, updating task progress
and Checkpoints, adding task-local todos, reporting outcomes, requesting
escalation, starting/stopping/inspecting previews, and invoking secret-backed
capabilities through Stoneforge proxies for GitHub, package registries,
artifacts, runtime providers, and similar integrations. Every command must be
policy-checked and recorded in Execution Lineage, with AuditEvents for
sensitive operations. It must not let agents bypass Scheduler or Policy, change
Acceptance Criteria, mutate unrelated workflow objects, access raw secrets,
manage users or policy, or directly merge/administer provider resources outside
controlled Stoneforge operations.

The Agent Command Surface is distinct from general agent tool use, such as file
read/write tools, shell access inside the Runtime, provider-native coding tools,
or custom tools supplied to an agent. RoleDefinitions may constrain those
general tools, skills, and hooks even though they do not partition first-slice
Agent Command Surface categories.

GitHub Actions local verification is general Runtime tool use, not a remote
provider control-plane action. Agents may run GitHub Actions locally through the
`act` CLI when the resolved Runtime supports it, so they can validate likely CI
repairs before pushing commits. Local `act` verification targets the failed
required Provider Check's corresponding workflow or job when the mapping is
clear. When the mapping is unclear, agents choose the smallest relevant workflow
or job from changed files and failure context rather than running every workflow
by default. Stoneforge does not require a dedicated task-progress entry solely
for local verification coverage. Managed Runtimes should include `act` by
default when Docker/container execution is available. Customer-managed Runtimes
report whether `act` is installed and usable as a Runtime capability. When
`act` is unavailable, agents fall back to project-local tests and then rely on
GitHub Actions rerunning after push. Local `act` verification uses the same
low-risk preview/dev secret boundary as previews by default. Injected values are
agent-observable and may appear in agent-visible logs; production credentials
must not be injected. If a workflow needs secrets that are unavailable or not
approved for preview/dev use, local verification is partial and GitHub Actions
after push remains authoritative for those portions. Local `act` verification is
best-effort and does not promise parity with GitHub-hosted runners, service
containers, matrix behavior, hosted runner images, or every GitHub Actions
feature. When local `act` behavior is unsupported or divergent, agents fall back
to project-local tests and GitHub Actions after push. Local `act` output remains
session-local agent working context only. Stoneforge does not create UI
artifacts, lineage records, repair-context items, Provider Checks, Verification
Runs, or GitHub checks/statuses from local `act` results. Only GitHub-observed
checks can satisfy required Provider Checks. Stoneforge does not expose GitHub
Actions rerun, workflow dispatch, or arbitrary remote workflow execution
controls in the first slice; remote Actions rerun through normal GitHub
push-trigger behavior after repair commits.

Agents authenticate to this surface with a short-lived Session Command
Credential minted by Stoneforge for the Assignment/Session. The credential is
scoped to the Workspace, target Task or MergeRequest, resolved branch/worktree
and Runtime, and command categories allowed by effective Policy and target
context. RoleDefinitions do not request or restrict command categories in the
first slice; all RoleDefinitions receive the same command surface shape until
useful separation boundaries are known. The credential may expire, rotate, and
be revoked when the Assignment or Session is canceled or stopped. It is not a
human user credential and not a provider secret. Command lineage records the
selected Agent and Session plus the service-actor path; human lineage is added
only for commands caused by human Session steering.

## Credentials And Repository Access

The default first-slice repository credential path is scoped, short-lived GitHub App installation credentials.

Rules:

- issue credentials per assignment or per short execution window
- prefer capability-based access through Stoneforge-controlled provider APIs, CLIs, tools, or proxies rather than exposing raw credentials to an LLM-visible agent process
- inject credentials only into the Runtime or brokered operation that needs them
- code-changing Assignments may use ordinary `git` inside the resolved Runtime worktree and branch with short-lived GitHub App installation credentials, because coding tools expect ordinary repository operations
- GitHub App installation access tokens can be scoped to repositories and permissions, but they are not a per-assignment branch credential sandbox
- use the minimum necessary GitHub App repository permissions, short token lifetime, branch naming and lease ownership, GitHub branch protection or rulesets where configured, provider event observation, and Agent Command Surface helpers for common controlled operations such as push or opening a MergeRequest
- merge, branch protection bypass, provider administration, and cross-target branch mutation must remain Stoneforge-controlled policy-checked operations rather than raw agent `git` authority
- unauthorized mutation of a GitHub branch outside the Assignment's scoped branch/worktree is a recoverable policy violation and Branch Health/Repair Trigger; Stoneforge should attach Repair Context to the Task and follow the normal repair-trigger path by creating a new task-owned repair Assignment and Session to undo the unauthorized mutation and determine whether useful changes should be moved onto the originally scoped branch by cherry-pick, rebase, or equivalent
- human escalation for unauthorized branch mutation is reserved for failed or unsafe self-healing, or policy-defined sensitive cases
- avoid long-lived human PATs as the primary mechanism
- record credential issuance and sensitive use in audit logs
- do not require a customer-managed Host to have broad preinstalled Git credentials

Secret-backed runtime operations should return sanitized results to the agent.
Examples include GitHub fetch/push/PR operations, private package installation
into a workspace path, artifact access, runtime-provider calls, and webhook
signature verification. Raw secret injection into an agent-visible shell or
filesystem is a high-risk escape hatch, not the default contract.

Preview processes are different from provider operations. Preview env vars may
be supplied to an app process so users and agents can exercise the app, but app
code can deliberately render or log those values. Stoneforge must not present
split process or container placement as a complete protection boundary for
sensitive preview secrets. First-slice preview env vars should be treated and
messaged as low-risk dev-preview values that may be exposed to an adversarial
or compromised LLM agent. Stoneforge should rely on explicit user/workspace
configuration to mark secrets as allowed for preview use, with provider-specific
warnings only where a live/test distinction is obvious. A single explicit user
approval may cover multiple Preview Secrets configured together when the UI
clearly applies the warning to the full batch.

## Retries, Recovery, And Escalation

Stoneforge must treat retry and recovery as first-class control-plane behavior.

Recovery categories:

- no eligible Agent yet
- unsatisfiable required Agent tags
- Agent throttle exhausted
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

Unsatisfiable required Agent tags are placement blockers, not ordinary capacity
waits. The Scheduler should mark affected Dispatch Intents as unplaceable and
surface repair actions: edit required tags, restore or create an Agent with the
tag, or cancel the work. Escalation and notifications follow Workspace policy.

## Code-First Automation

Code-first automations run explicit workflow code rather than an agent session.

Platform-defined code-first automations may run inside the Stoneforge control
plane for built-in workflow behavior such as merge evaluation and failure
escalation. User-defined code-first automations are external in the first slice.

Both platform-defined and user-defined code-first automations should share the
same conceptual boundary: trigger context, target object, policy context,
correlation identifier, idempotency key, and a bounded action result.
Platform-defined handlers may call internal control-plane operations directly.
User-hosted handlers receive the context over a signed outbound webhook and
use the Stoneforge API for workflow actions they need during execution. API
calls from user-hosted handlers authenticate with a short-lived scoped
AutomationRun Credential minted by Stoneforge and included or retrievable from
the outbound webhook context. Neither path may mutate workflow state outside
policy-checked and audit-recorded control-plane operations. Completion callbacks
finalize AutomationRuns only; they report `succeeded` or `failed`, bounded
result metadata, linked objects, and error details.

Required first-slice behavior:

- Stoneforge hosts inbound signed webhook triggers that may create automation intent
- Stoneforge may run platform-defined code-first automation handlers for built-in workflow actions
- Stoneforge may invoke user-hosted outbound automation webhook handlers when a configured user-defined code-first automation fires
- outbound webhook requests must include an idempotency key and a signed authenticity mechanism
- outbound webhook delivery treats `2xx` as success, `408`, `429`, and `5xx` as retryable, and other `4xx` responses as terminal failure
- outbound webhook retries use exponential backoff with a bounded retry count
- a successful outbound delivery moves to `running` only when the response indicates accepted/async long-running work; otherwise a bounded synchronous `2xx` may complete the AutomationRun as `succeeded`
- outbound handler responses use an explicit typed response contract, such as accepted, succeeded, or failed, rather than status-code inference alone
- Stoneforge should provide a recommended but not required TypeScript-first Stoneforge SDK for interacting with the Stoneforge API, including Automation handler support for signature verification, typed responses, callbacks, AutomationRun Credential API client setup, and thin helpers for common workflow API actions
- the outbound automation webhook protocol is language-agnostic; the first-slice Stoneforge SDK ships TypeScript first
- the TypeScript Stoneforge SDK is in first-slice scope with a limited required surface: auth/client setup, Automation webhook signature verification, typed responses, callback helpers, and first-slice common API wrappers
- external handlers should acknowledge quickly and perform long-running work asynchronously
- long-running user-defined code-first automation completion returns through signed callbacks only; Stoneforge does not poll external status endpoints in the first slice
- callback receipt returns 200 only after the callback is authenticated, idempotently accepted, and durably recorded, allowing external handlers to retry missed or failed callbacks
- completion callbacks are not a general workflow mutation surface
- user-defined code-first automation uses the Stoneforge API for workflow actions with a scoped AutomationRun Credential
- AutomationRun Credentials are usable from outbound delivery through `running`, including final API calls before completion callback, and are revoked on any terminal AutomationRun state
- user-defined code-first automation may create Tasks and Plans through the Stoneforge API when credential scope allows; dispatchability or activation of created work is controlled by Workspace policy or Automation configuration, defaulting to accepting created work and moving it forward
- Workspace policy is the ceiling for automation-created Task/Plan behavior; Automation configuration can only narrow it
- if automation-created work requires Director triage, the automation requests triage through an explicit Stoneforge API action that creates scheduler-evaluated Director Dispatch Intent unless policy requires human approval first
- Director triage requests may target objects created by the same AutomationRun or existing Tasks, Plans, and imported Issues, constrained by AutomationRun Credential scope
- repeated Director triage requests are deduped by target object, triage purpose or reason, source Automation/AutomationRun, and unresolved Director Dispatch Intent status; matching active or queued triage returns the existing Dispatch Intent
- manual re-run of an AutomationRun from any terminal state creates a new linked AutomationRun and never mutates the old run
- manual re-run defaults to the original trigger context; run-with-edited-inputs records the input diff and requires Automation edit/create authorization

This keeps code-first automation extensibility without turning Stoneforge into a general-purpose workflow-code host before the main agent workflow is proven.
