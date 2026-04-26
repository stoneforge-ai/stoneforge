# Stoneforge V2 Integrations And First Slice

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for the first buildable Stoneforge V2 slice. It defines the GitHub-first integration boundary, supported merge topologies, execution-provider adapters, proving scenarios, explicit exclusions, and milestone order without broadening the charter into a larger platform plan.

## Scope And Status

First-slice scope:

- GitHub-first repository onboarding and PR flow
- Claude Code and OpenAI Codex worker backends
- customer-managed host execution plus Daytona managed sandbox execution
- task and plan workflows through review, approval, merge, recovery, and audit
- platform-provided workflow automations plus bounded user-defined automation paths

Frozen in this doc:

- GitHub is the only repository and PR provider for the first slice
- `MergeRequest` is the internal term and `PR` is the GitHub-facing term
- planned code-changing tasks follow the workspace Merge Topology, which may aggregate through a plan branch and plan PR or merge directly to the workspace target branch
- unplanned code-changing tasks use direct task PRs to the workspace target branch
- Provider Checks are observed from GitHub checks and statuses, then aggregated into Verification Runs; they are not run natively by Stoneforge

Working assumptions:

- one real team and one real repo should be able to prove the whole model end to end
- task-level and plan-level PR naming, branch naming, and comments may begin simple
- GitHub reviews may be imported as signals when identities are linked

Intentionally not specified yet:

- final Git branch naming scheme
- exact GitHub webhook payload mapping
- provider-specific UI design
- generalized non-GitHub source-control support
- broader Phase 2 integrations

## GitHub-First Boundary

The first slice is GitHub-first in three concrete ways:

- repository onboarding happens through a GitHub App installation
- provider review and merge artifacts are GitHub PRs
- Provider Checks and mergeability are observed from GitHub checks, statuses, and PR state

What GitHub does in the first slice:

- hosts the source repository
- hosts the provider PR artifact
- runs or reports verification checks
- enforces branch protections and required checks

What Stoneforge does in the first slice:

- owns the task, plan, run, session, policy, and audit model
- decides when work is ready and where it should run
- records review, repair, approval, and recovery lineage
- publishes a Stoneforge-owned policy check to GitHub

## Terminology Boundary

- `MergeRequest` is the internal product model noun
- `PR` is the default user-facing term in GitHub-backed flows
- implementation docs and code should preserve the provider-neutral internal noun even when GitHub-specific adapters talk about PRs

## Supported Branch Topologies

The first slice officially supports only two merge topologies.

### Unplanned Task Flow

- task branch -> workspace target branch PR

Use this when:

- work does not belong to a coordinated plan
- a single task can be reviewed and merged independently

### Planned Task Flow

- task branch -> plan branch PR
- plan branch -> workspace target branch PR

Use this when:

- tasks belong to one coordinated plan
- grouped integration should be reviewed at the plan level

First-slice default:

- if a code-changing task belongs to an active Plan, use the workspace Merge Topology to decide whether it aggregates through a plan branch or merges directly to the workspace target branch
- if a code-changing task is unplanned, create a direct task PR to the workspace target branch
- plan-level review may use the normal review path, but code repair still flows back into Tasks rather than turning the Plan into a coding surface

Out of scope for the first slice:

- native staging-branch orchestration as a separate supported topology
- multi-stage promotion owned by Stoneforge

## Verification And Status Actions

Stoneforge is verification-aware in the first slice, not CI-native.

Supported behavior:

- observe GitHub checks and statuses for task and plan PRs
- record those observations as Provider Checks inside Verification Runs scoped to each MergeRequest head SHA
- observe Mergeability separately from Verification Runs using provider/source-control PR state
- observe Branch Health separately from Mergeability when branch drift, stale base, or unsafe integration risk appears before immediate merge evaluation
- determine required versus optional Provider Checks from Stoneforge policy, optionally seeded from provider required-check settings
- use observed verification state in review, approval, merge, repair, and escalation logic
- publish a required `stoneforge/policy` status or check to GitHub

Not a first-slice goal:

- authoring GitHub Actions workflows
- running Stoneforge-native CI jobs
- owning deployment promotion or rollback

## Adapter Boundaries

### GitHub Adapter

Owns:

- repo onboarding through GitHub App installation
- branch creation, fetch, push, PR creation, status publication, merge, and provider state observation

Does not own:

- task readiness
- scheduling
- policy evaluation
- checkpoint or resume logic

### Claude Code Adapter

Owns:

- Claude Code Session invocation and resume
- transcript and log collection
- checkpoint extraction
- cancellation hooks

### OpenAI Codex Adapter

Owns:

- Codex Session invocation and resume
- transcript and log collection
- checkpoint extraction
- cancellation hooks

Shared adapter rule:

- provider adapters report execution facts upward; they do not decide planning or merge outcomes

### GitHub App MergeRequest Flow

The control-plane flow now has two MergeRequest provider modes:

- `fake`, the default local mode, keeps all provider behavior deterministic and network-free.
- `github`, an opt-in GitHub App installation mode, exercises the first real provider boundary.

The GitHub mode uses App ID plus private key material to mint a GitHub App JWT, discovers or accepts an installation ID, exchanges that identity for installation access tokens, and refreshes tokens behind a small token-provider boundary. The adapter creates or updates the configured working branch, commits a small task change marker, opens or reuses a PR, publishes the `stoneforge/policy` status to the current provider PR head SHA, observes provider PR state and checks/statuses, and merges only when explicitly enabled for a sandbox repository/branch.

Required first-slice GitHub App repository grants:

- Metadata read
- Contents read/write
- Pull requests read/write
- Commit statuses read/write
- Checks read

Required control-plane config for the GitHub mode:

- GitHub App ID
- GitHub App private key or private key path
- GitHub installation ID, or owner/repo for installation discovery
- owner
- repo
- base branch
- source branch prefix
- explicit merge enablement when merge should be attempted

The provider PR id, number, URL, head SHA, source branch, and target branch are persisted only as provider facts needed to resume and reconcile the MergeRequest flow. Stoneforge policy does not delegate approval, verification, review, or merge readiness decisions to the provider artifact. GitHub mode records Provider Checks only from observed provider checks/statuses and aggregates them into Verification Runs; if no passing provider check/status is observed, the control-plane flow remains pending or fails with a clear provider-check message instead of injecting local verification.

Deferred from this first GitHub flow:

- webhook ingestion and replay
- provider PR comments
- imported GitHub review identity mapping
- generalized non-GitHub source-control providers
- native Stoneforge verification execution

### Daytona Runtime Adapter

Owns:

- provisioning managed sandbox execution environments
- launching the selected agent adapter inside that environment
- returning health and execution outcomes to Stoneforge

Does not own:

- policy
- scheduling
- PR review logic

## First-Slice Platform Automations

The platform should ship with a narrow but useful automation set:

- ready-task dispatch
- PR-created review dispatch
- change-request repair dispatch
- merge-evaluation dispatch
- failure-escalation dispatch

User-defined automations are also part of the first slice, but within controlled boundaries:

- event, time-based, and inbound webhook triggers
- agent automation actions using explicit RoleDefinitions
- outbound signed automation webhooks to user-hosted handlers

## First Build Entrypoint

The first vertical proving scenario should use the simplest full path that exercises the real control plane:

1. create an Org and Workspace
2. connect one GitHub repository through the GitHub App
3. configure one policy preset, one Runtime, one Agent, and one RoleDefinition
4. validate the Workspace into `ready`
5. create one unplanned code-changing Task
6. dispatch the Task through the Scheduler
7. run one worker Session on a real execution path
8. open one task PR in GitHub
9. observe verification and run review
10. either merge successfully or require Task repair and redispatch

Why this is the build entrypoint:

- it proves the repo-scoped Workspace boundary
- it proves the Runtime, Agent, and RoleDefinition separation
- it proves dispatch, Assignment, Session, PR, Verification Run, review, approval, merge, and repair on one narrow path
- it avoids plan aggregation complexity until the direct task path is stable

## Implementation Slices

### Slice 1: Workspace Ready Path

Exact outcome:

- a Workspace can move from `draft` to `ready` against one real GitHub repo and one valid execution capability path

Touched subsystems:

- Org and Workspace model
- GitHub App onboarding
- Workspace policy preset selection
- Runtime, Agent, and RoleDefinition configuration
- workspace validation and audit

Dependencies:

- none; this is the foundation slice

Acceptance criteria:

- a Workspace can be created under an Org
- GitHub App installation links exactly one repository
- one Runtime, one Agent, and one RoleDefinition can be configured successfully
- the Workspace enters `ready` only when repo connectivity and execution capability validation both pass
- sensitive setup actions emit audit records

### Slice 2: Dispatch To Live Session

Exact outcome:

- a ready unplanned Task can become dispatch intent, receive a lease, create an Assignment, and start a real Claude Code or Codex Session on one Runtime

Touched subsystems:

- Task readiness logic
- Scheduler queueing and leasing
- Assignment and Session records
- Agent adapter launch path
- host or managed-sandbox execution path
- checkpoint and heartbeat capture
- Effect runtime and OpenTelemetry spans for dispatch, lease, Assignment, Session, adapter, and recovery boundaries

Dependencies:

- Slice 1

Acceptance criteria:

- creating or updating a Task can transition it into `ready`
- the Scheduler persists and retries dispatch intent instead of dropping work
- one Agent slot is leased and released correctly
- a live Session starts and reports heartbeats
- a recoverable Session failure can create a replacement Session under the same Assignment
- placement failures remain queued or escalate according to policy
- dispatch, lease, Assignment, Session, and provider-adapter work emits sanitized OpenTelemetry spans with Stoneforge correlation identifiers

### Slice 3: Task PR, Review, And Merge Loop

Exact outcome:

- a completed code-changing Task Assignment opens a task PR, and subsequent MergeRequest-owned Assignments observe verification, record review outcomes, and either merge or require Task repair

Touched subsystems:

- GitHub branch and PR integration
- MergeRequest and Verification Run records
- MergeRequest-owned review Assignments
- review automation
- approval and policy evaluation
- merge execution
- repair and redispatch logic

Dependencies:

- Slice 2

Acceptance criteria:

- a completed Task Assignment can create or update a GitHub PR
- GitHub checks and statuses are recorded as Provider Checks inside Verification Runs
- review can run through a MergeRequest-owned Assignment and record approve or changes-requested outcomes
- `stoneforge/policy` is published and gates merge correctly
- successful approval and verification allow merge
- change request or verification failure requires Task repair and creates a new repair Assignment on redispatch

### Slice 4: Failure And Recovery Hardening

Exact outcome:

- the direct task flow remains recoverable and auditable under crash, context exhaustion, no-placement, and repeated failure conditions

Touched subsystems:

- Session resume path
- failure counters and escalation policy
- human-review-required transitions
- audit coverage
- operator intervention actions

Dependencies:

- Slice 3

Acceptance criteria:

- Session crash or context exhaustion preserves usable checkpoint progress
- repeated no-eligible-agent or exhausted-concurrency loops escalate to human review
- repeated review or verification loops escalate instead of continuing indefinitely
- operators can cancel, resume, or reauthorize work through the documented state model
- all sensitive recovery and override actions emit audit records

### Slice 5: Plan Aggregation Extension

Exact outcome:

- planned tasks can aggregate through a plan branch and plan PR after the direct task path is already proven

Touched subsystems:

- Plan activation
- plan-branch and plan-PR integration
- plan-level MergeRequest-owned review or merge-evaluation Assignments
- task repair-from-plan-feedback behavior

Dependencies:

- Slice 3

Acceptance criteria:

- tasks inside an inactive Plan do not dispatch
- active planned tasks use the workspace Merge Topology, either merging into a plan branch or directly to the workspace target branch
- the plan PR can observe verification and review state
- plan-level repair triggers update or create Tasks rather than dispatching coding directly on the Plan
- plan PR merge completes the Plan cleanly

## Proving Scenarios

The first slice is successful only if a new engineer or agent can map these scenarios directly onto the product model.

### Workspace And Capability Setup

- create an Org and Workspace
- install the GitHub App on one real repository
- configure policy preset, Runtimes, Agents, RoleDefinitions, and tags

### Customer-Managed Execution

- register a Host through outbound connectivity
- dispatch a ready task onto a customer-managed Runtime
- collect checkpoints, logs, and outcome

### Managed Sandbox Execution

- configure Daytona as a managed sandbox Runtime
- dispatch a ready task through that Runtime
- create a PR and observe verification

### Repair And Recovery

- resume after Session crash or context exhaustion
- require task repair from review feedback
- redispatch repair work as a new Assignment

### Review, Approval, And Merge

- move task work through PR, Verification Run observation, automated review, approval when required, Stoneforge policy check, and merge

### Plan Aggregation

- group related tasks into a Plan
- keep them blocked from dispatch until the Plan is active
- merge task PRs into a plan branch
- review and merge the plan PR

### Failure Handling

- handle no eligible Agent
- handle exhausted concurrency
- handle repeated failure loops
- escalate to human review with audit traces

## Explicit Exclusions

The first slice should not try to do the following:

- replace GitHub as the system of record for repos and PRs
- build deep diff-centric review UX as a primary investment
- become a general-purpose CI/CD platform
- own deployment promotion, rollback, or environment management
- support multi-repo workspaces
- support arbitrary in-process user workflow code hosting
- broaden source-control support beyond GitHub

## Build Milestone Order

Implementation should cluster in this order:

1. Org and Workspace foundation with GitHub App onboarding
2. Runtime, Host, Agent, and RoleDefinition configuration
3. Scheduler queueing, leasing, Assignment, Session, and checkpoint flow
4. Task PR, Verification Run observation, review, approval, and merge path
5. Plan activation, plan-branch aggregation, and plan PR review flow
6. Failure escalation, policy hardening, and audit completeness
7. User-defined automations within the bounded first-slice trigger and action model

## Intent Example

Intent example only. This is not final implementation code.

```text
Workspace onboarded to GitHub
  -> task created
  -> task ready
  -> scheduler dispatches Worker Agent
  -> Codex Session runs in Daytona
  -> task PR opens in GitHub
  -> Verification Run passes
  -> Review Agent approves
  -> Stoneforge approval recorded
  -> stoneforge/policy check passes
  -> GitHub PR merges
```
