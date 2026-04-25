# Stoneforge V2 Build Brief

Status: Canonical V2 planning document

This is the only planning document that should be treated as canonical for Stoneforge V2.

Its purpose is simple:

- explain what Stoneforge V2 is
- explain who it is for
- explain the primary workflow we are building around
- lock the small number of hard decisions that should be made early
- give any new engineer or coding agent enough context to work on the product without guessing what the platform is supposed to become

If a detail is not stated here, assume it is not frozen yet.

This brief is organized in a simple order:

- what Stoneforge V2 is
- the primary workflow it is built around
- the operating modes that must fit around that workflow
- the core product model implied by that workflow
- the hard decisions frozen early
- the proving slice the team should build first

## Subordinate Build-Shaping Docs

These docs are subordinate to this README. They translate the charter into first-slice implementation guidance and should not be treated as replacement planning docs.

- [system-model.md](system-model.md)
- [state-machines.md](state-machines.md)
- [runtime-architecture.md](runtime-architecture.md)
- [policy-auth-audit.md](policy-auth-audit.md)
- [integrations-and-first-slice.md](integrations-and-first-slice.md)
- [typescript-type-driven-apis.md](typescript-type-driven-apis.md)

## What Stoneforge V2 Is

Stoneforge V2 is a clean-room rebuild of Stoneforge around one core job: turning engineering intent into supervised, agent-driven software-engineering execution.

Stoneforge V2 is a next-generation development environment: a control plane for agent-driven software engineering.

It is not:

- an AI chat app for coding
- a project tracker with agent features bolted on
- a GitHub replacement
- primarily a code editor product

It is a system that helps an engineering lead, platform lead, or operator:

- capture work intent
- clarify that intent
- decompose it into executable tasks
- dispatch those tasks to agents
- preserve durable context between sessions
- run review and approval loops
- move validated changes through repository workflows
- detect failures, loops, and stalls
- keep policy, audit, and execution lineage coherent in one place

## Who It Is For

Primary users:

- engineering leads
- platform leads
- operators supervising software-engineering workflows

Secondary users:

- reviewers
- human approvers
- developers who need to intervene in live or past work
- agents acting within controlled execution paths

This means the platform should optimize first for:

- visibility
- control
- dependability
- recoverability
- auditability
- durable context
- orchestration of work across many agent sessions

It should not optimize first for:

- solo chat-first coding
- deep editor parity
- broad social collaboration features

## Product Thesis

The core belief behind Stoneforge V2 is:

Software development environments are shifting away from humans directly writing every line and toward humans orchestrating, supervising, reviewing, and steering agent-executed work.

Stoneforge exists to be the system that manages that loop well.

The product is not just "how do we prompt a coding agent?"

The real product problem is:

How do we reliably run a multi-step engineering workflow where intent, task decomposition, execution, continuity, review, approval, CI, merge flow, and recovery all remain understandable and governable?

## The Primary Workflow We Are Building Around

This is the expected default workflow for the platform.

### Before work starts: the workspace defines execution capabilities

Before a user asks a Director Agent to scope work, the workspace needs the execution capabilities that Stoneforge can dispatch against.

The workspace should define:

- runtimes
- agents
- role definitions

This separation matters.

A runtime defines where and how agent work can execute. An agent defines which harness and model can run on a runtime. A role definition defines what job that agent session is being asked to perform.

Because those are separate concepts:

- the same runtime can be reused across multiple agents
- multiple runtimes can exist in one workspace at the same time
- the same agent can be reused with different role definitions
- Director Agent, Worker Agent, Review Agent, and specialized automation sessions can use the same underlying Agent differently
- scheduler decisions can consider runtime capacity, agent concurrency, role requirements, policy, and tags independently

Agents and role definitions should both support tags so tasks and automations can target a specific group of eligible agents or roles.

### 1. A human brings an engineering intent

The user has an idea, request, or plan for a codebase. Examples:

- new feature
- bug fix
- refactor
- simplification
- code-quality cleanup
- documentation update

That intent may be rough and newly formed, or already fleshed out by a team and ready for implementation.

### 2. A Director Agent clarifies the request

The human explains the intent to a Director Agent.

The Director Agent should ask meaningful questions until the path forward is clear enough to execute responsibly.

The Director Agent's job is not to immediately start coding. Its first job is to create clarity.

### 3. The Director Agent decomposes the work

Once the request is clear, the Director Agent creates one or more tasks.

The Director Agent may also:

- define acceptance criteria
- create dependencies between tasks
- identify which tasks can run in parallel
- determine whether the work belongs inside a larger coordinated plan

### 4. The Director Agent optionally creates a plan

If there are multiple related tasks or dependencies that belong to a larger scope, the Director Agent creates a plan.

A plan is an execution-supervision grouping object, not a second task engine.

Plans exist so that Stoneforge can:

- coordinate related tasks
- preserve larger-scope intent
- track grouped progress
- optionally aggregate merge flow according to workspace policy

### 5. The Director Agent activates the plan when the graph is ready

Tasks can be created, linked, and dependency-shaped before they are eligible for dispatch.

If tasks belong to a plan, that plan should typically be activated only after:

- the relevant tasks exist
- dependencies are correct
- the intended execution order is coherent

Tasks inside a plan should not be dispatched before the plan is activated.

This is important because planning and execution are separate phases.

### 6. Ready tasks are dispatched

Once tasks are ready, Stoneforge dispatches them to agents.

The default expected mechanism is:

- automations trigger on task creation, task readiness, or related state changes
- those automations create dispatch intent
- the scheduler owns durable readiness evaluation, queueing, capacity matching, leasing, retries, and resume-after-failure behavior
- dispatch resolves an eligible agent and role definition based on task requirements, automation rules, policy, tags, runtime availability, and concurrency limits

Key rules:

- unresolved dependencies block readiness
- a task must not dispatch until its dependency constraints are satisfied
- if no agent is available when dispatch is triggered, the system must queue and retry instead of dropping the work

Important terminology:

- `Automations` are the user-facing durable workflow triggers
- `Scheduler` is the internal durable dispatch and capacity-management component

We are intentionally preferring `scheduler` over `daemon` as the core internal concept. There may still be per-workspace orchestration processes, but the important internal responsibility is durable scheduling, not a vague daemon abstraction.

### 7. Worker Agent sessions execute with checkpointed continuity

When a task is dispatched, Stoneforge creates an assignment for that work.

One or more agent sessions may work under that assignment.

Sessions must be resumable.

If a Worker Agent session:

- crashes
- restarts
- times out
- or exhausts its context window

then a new session should be able to continue from a durable checkpoint rather than starting blind.

That resumed session should receive:

- a concise checklist of what has already been completed
- what remains to do
- the relevant task context
- any important prior review or failure feedback

Stoneforge documents are the durable shared context layer for the workspace. Task-local continuity such as checkpoints, remaining work, and review-driven repair context should live on the task itself as structured state.

Hidden prompt state is not the memory model.

### 8. Completed work opens a PR

> This brief uses `PR` as the default term because the first slice is GitHub-first. Internally, Stoneforge should still model this as a provider-neutral review and merge artifact called a Merge Request.

When a code-changing task is completed, Stoneforge automatically creates a PR for that task branch.

This PR is where CI and review usually begin.

### 9. A Review Agent evaluates the PR

When a PR is created, Stoneforge can automatically assign a Review Agent.

This is typically driven by automation on PR creation.

The Review Agent may:

- approve the PR
- request changes

Reasons to request changes include:

- failing CI or tests
- unmet acceptance criteria
- merge conflicts
- branch drift that cannot be fast-forwarded cleanly
- obvious correctness or quality problems

Workspaces may disable agent review. In those workspaces, review outcomes may depend only on CI and/or humans.

### 10. Repair triggers require task repair

If a change request or other repair trigger occurs before task completion:

- the task enters a repair-required path
- the repair context is attached as task context
- the task is dispatched to a new agent session

This creates a repair loop that stays attached to the same planning and execution history.

### 11. Optional human review and QA happens after agent review

Some workspaces require one or more humans to provide final approval.

Others may skip human review entirely depending on policy.

When human approval is required:

- the relevant humans should be notified
- they can review the PR
- they may manually QA the branch using the preview experience if one exists
- they may approve or request changes

While reviewing, humans may also need to:

- inspect prior agent sessions
- send messages to active sessions
- resume past sessions
- inspect complex logic in the in-platform code view
- optionally make edits themselves and commit them

This is where editing exists in the product:

as a human intervention and inspection surface inside a broader orchestration workflow.

That is very different from making the whole product fundamentally an editor.

### 12. Final approval leads to merge

When the required review path is satisfied, the PR is automatically merged to its target branch.

As part of that merge logic:

- the branch may be automatically fast-forwarded if possible
- if it cannot be cleanly updated, changes are requested instead of forcing an unsafe merge

### 13. Optional plan aggregation flow

Some workspaces may choose to aggregate tasks under a plan branch and plan PR before merging to the workspace target branch.

In that model:

- task branches merge into the plan branch
- when the plan is complete, the plan PR becomes the reviewable integration unit
- review and approval logic then repeats at the plan level

### 14. Optional staging branch strategy

There are several valid merge topologies in the long run, including staging-based flows.

However, for the first slice we are keeping the official product-supported topologies narrow:

- direct task PR -> target branch
- task PRs -> plan branch / plan PR -> target branch

If a team wants a staging-oriented workflow in the first slice, the practical way to achieve that is to configure the workspace target branch to be a staging branch and manage subsequent upstream promotion outside Stoneforge.

Everything after this point translates that workflow into the operating modes, core concepts, frozen decisions, and first-slice boundaries that the product needs.

## Operating Modes Around The Core Workflow

The orchestration-first workflow above is the primary expected flow, but it is not the only valid one.

The same product model must still support manual operation, bespoke automations, and direct human intervention without turning into a different system.

### Manual operation is valid

Humans must be able to run Stoneforge with reduced automation or even no automation at all.

That means:

- tasks can be created manually
- tasks can be assigned manually
- dispatch can be initiated manually
- review and approval loops can still happen without always-on automation

Stoneforge should not require full autonomy to be useful.

### User-defined automation is part of the product

Many automations will be bespoke to a team's workflow.

Examples:

- daily standup summaries
- documentation-drift detection and repair
- simplification or refactoring passes that preserve behavior
- review-assignment rules
- stale-task escalation
- branch-health checks

Some automations may be platform-provided or platform-suggested, but many will be user-defined and workflow-specific.

For the first slice, automations may be triggered by product events, time-based schedules, or inbound webhooks. Their actions should create controlled Stoneforge workflow intent or call user-hosted code-first handlers through signed outbound webhooks; they should not bypass scheduler, policy, or audit.

### Human Intervention Is Core, Not An Edge Case

At any point in the workflow, a human may:

- inspect current sessions
- inspect past sessions
- send a message to a session
- resume a past session
- manually steer an agent
- manually review a PR
- request changes
- approve work
- intervene directly in code when needed

Stoneforge should treat this as a normal part of operation, not as a failure of the system.

## Failure Handling Is A Core Product Requirement

Stoneforge is not trustworthy if it can only model the happy path.

Failure handling is part of the operating model, not a later implementation detail.

The platform must detect and escalate failure conditions such as:

- repeated repair loops with the same reason
- repeated CI failure without meaningful progress
- session crashes or repeated restarts
- stalled work
- scheduler inability to place work
- merge conflicts that cannot be resolved automatically

When failure patterns like this are detected, the task should move into a human-review-required state and the appropriate humans should be notified.

Dependability requires escalation, not infinite autonomous looping.

## Core Product Concepts

These concepts are foundational.

They are not abstract architecture exercises. They exist because the workflow above needs them.

### Workspace

A workspace is the primary operational boundary in V2.

- repo-scoped by default
- owns runtime defaults, policies, execution context, and audit partitioning
- maps to one repository in the proving slice

### Task

A task is the planning unit.

- it represents intended work
- it is where prioritization, sequencing, acceptance criteria, and dependencies live
- it should carry structured operational continuity such as checkpoints, remaining work, and repair context
- it is not the same thing as execution history

### Plan

A plan groups related tasks.

- plans help coordinate multi-task scopes
- plans may control whether execution is allowed to begin through activation
- plans may optionally participate in branch and PR aggregation depending on workspace policy
- plans do not replace the task model

### Execution Records

Execution history is first-class and separate from planning intent.

Core execution records include:

- assignment
- session
- PR
- CI run

This separation matters because planning intent and execution reality are different things.

### Document

Documents are the durable context layer for the workspace.

They hold things like:

- specs
- runbooks
- design context
- cross-task reference material
- review notes worth preserving beyond a single task loop

Documents should not require a separate visible document per task just to track progress. Task-local continuity belongs on the task itself as structured state.

### Host

A host is the connected customer-managed machine or provider attachment point that can supply execution capacity.

Customer-managed hosts should connect back to Stoneforge through outbound connectivity. Managed sandbox providers may instead expose provider APIs for creating per-agent execution environments.

### Runtime

A runtime is the combination of a host and an execution mode.

Execution modes may include:

- local worktrees
- Docker
- sandbox or VM environments

Runtimes define the environment an agent executes within. The same runtime can be reused across multiple agents, and a workspace can use multiple runtimes at the same time.

### Agent

An agent is an executable worker capability that Stoneforge can dispatch work to.

An agent combines:

- agent harness
- model
- runtime
- concurrency limit
- executable path or harness binary

The concurrency limit belongs on the agent because the same harness, model, and runtime combination may be reused by multiple roles at the same time.

Agents should support tags so tasks and automations can scope dispatch to a subset of eligible agents.

### Role Definition

A role definition describes what job an agent session should perform.

A role definition combines:

- role-defining prompt
- tool access, including built-in tools, custom tools, and MCP servers
- skill access, including Claude and Codex skills
- session hooks, such as startup, shutdown, pre-tool-call, and post-tool-call hooks

The same Agent can be reused with different role definitions. For example, one Agent may run as a Director Agent, Worker Agent, Review Agent, frontend-specialist Worker Agent, or custom automation agent depending on which role definition is attached at dispatch.

Role definitions should support tags so tasks and automations can request specialized roles without hard-coding a specific agent.

### Scheduler

The scheduler is the durable internal system that decides when and where ready work runs.

It considers:

- task readiness
- dependencies
- automation-triggered dispatch intent
- policy
- eligible role definitions
- eligible agents
- runtime availability
- concurrency limits
- retry and resume requirements

Do not collapse host, runtime, agent, role definition, and scheduler into one fuzzy concept.

### Automation

Automations are durable user-facing workflow triggers.

They may respond to:

- task changes
- PR changes
- CI changes
- time-based schedules
- other product events

Automations should reinforce the core model rather than bypass it.

### Policy

Policy determines what is allowed to happen automatically, what requires review, and what requires human approval.

There is one policy system with multiple workspace presets layered on top of it.

## Hard Decisions Frozen Early

These are the decisions we are intentionally locking now because changing them later would be expensive.

This is the smallest set of early constraints needed to protect the first real slice from avoidable churn.

### 1. Unified Product

Decision:

- V2 is one unified Stoneforge platform

Why:

- splitting planning, execution, runtime, audit, and orchestration into separate products would create artificial boundaries and duplicated logic

### 2. Dual-Anchor Domain Model

Decision:

- tasks remain the planning unit
- assignments, sessions, PRs, and CI runs are first-class execution records

Why:

- planning objects should not pretend to be execution history objects
- lineage, recovery, and audit are cleaner when execution is modeled explicitly

### 3. Repo-Scoped Workspace By Default

Decision:

- one repository per workspace by default

Why:

- this keeps permissions, runtime defaults, audit boundaries, and operator reasoning simple for the first real slice
- multi-repo abstractions can wait until real evidence proves they are necessary

### 4. GitHub-First

Decision:

- the first slice is GitHub-first

Why:

- we need one real source-control and delivery substrate to build against
- broad provider support too early adds drag without proving the thesis

### 5. Outbound Host Connectivity And Managed Sandbox Execution

Decision:

- no inbound SSH in the primary architecture
- customer-managed hosts use outbound connectivity back to Stoneforge
- managed sandbox providers may use provider APIs for per-agent execution environments

Why:

- it fits laptops, private networks, and enterprise environments better
- it gives us a cleaner reliability and security model

### 6. Execution Capability Separation

Decision:

- host, runtime, agent, role definition, and scheduler are separate concerns

Why:

- the same runtime can be reused across multiple agents
- the same agent can be reused with multiple role definitions
- scheduling, recovery, capacity management, and operator visibility require these concerns to remain distinct

### 7. Delegated Authentication And Explicit Authorization Boundary

Decision:

- users log into Stoneforge, but human authentication is delegated to an upstream or integrated identity provider
- Stoneforge does not aim to own passwords, MFA, or SSO as a custom credential system
- authorization is an explicit subsystem
- product policy remains inside Stoneforge

Why:

- we need an enterprise-capable trust boundary from the beginning
- integrating with established identity systems is better than building human auth from scratch

### 8. Relational Durability Baseline

Decision:

- SQLite for OSS local-first
- PostgreSQL for cloud and self-hosted

Why:

- local use should remain lightweight
- cloud and enterprise need a stronger relational backbone

### 9. Stoneforge-Owned Durable Workflow Layer

Decision:

- Stoneforge owns a narrow durable workflow and scheduling subsystem

Why:

- the control plane needs durable orchestration semantics
- the workflow model should fit Stoneforge's own execution, approval, and recovery needs

### 10. One Policy System

Decision:

- workspaces define multiple policy presets on top of one policy system

Why:

- we want one enforcement architecture, not several different products disguised as modes

### 11. First-Slice Merge Topology Boundary

Decision:

- the first slice officially supports:
  - direct task PR -> target
  - task PRs -> plan branch / plan PR -> target

Why:

- these two paths prove the main orchestration value without exploding merge-topology complexity too early
- staging-oriented teams can still use a staging branch as the workspace target branch in the first slice if they want that operational model

## What The First Slice Must Prove

The first slice should prove:

1. one team can onboard one real repository into Stoneforge
2. workspace agents, role definitions, and runtimes can be configured clearly
3. customer-managed hosts and at least one managed sandbox path can execute real work
4. a task can become a real execution chain: task -> assignment -> session -> PR -> CI
5. the same control-plane model can drive at least Claude Code and OpenAI Codex
6. policy and audit work on real actions, not only mocked flows
7. task-native continuity and documents together improve resumability across sessions and assignments
8. plans and automations add value without creating competing systems
9. review, change-request, and retry loops remain coherent
10. failure escalation works

If we cannot prove those things, we should not expand the platform surface.

## What Stoneforge Should Do In The First Slice

Everything in this section is about proving the model in production, not describing the final platform.

Stoneforge should:

- onboard a repo-scoped workspace cleanly
- define workspace runtimes, agents, role definitions, and dispatch tags
- connect customer-managed hosts and a first-class managed sandbox predictably
- let a Director Agent decompose work into tasks and plans
- preserve dependencies and activation boundaries
- dispatch and supervise real agent work by matching tasks to eligible roles, agents, runtimes, and capacity
- support Claude Code and OpenAI Codex as first-class Worker Agent backends
- checkpoint and resume sessions cleanly
- correlate tasks, sessions, PRs, and CI into one coherent operator view
- enforce policy on sensitive actions
- produce reliable audit trails
- preserve durable shared context through documents and task-native continuity state
- support narrow but useful automations
- support direct human intervention throughout the flow
- make failures visible and recoverable

## What Stoneforge Should Not Try To Do Yet

Stoneforge should not, in the first slice:

- become a full GitHub replacement
- own deployment promotion or rollback
- own native preview lifecycle
- build deep diff-heavy review UX as a primary product investment
- build a full CI/CD authoring platform
- build rich messaging as a core surface
- build cross-workspace portfolio analytics
- design multi-repo workspaces before repo-scoped workspaces clearly break
- over-design Phase 2 before the first slice is real

## How To Think About Editing

Editing is important, but it is not the center of gravity.

The right stance is:

- Stoneforge is not primarily an editor product
- Stoneforge may include code inspection and editing surfaces
- those surfaces exist to support supervision, debugging, QA, review, and intervention inside a broader orchestration workflow

That is why the product can still be thought of internally as a next-generation development environment, while still being described more concretely in this brief as a control plane for agent-driven software engineering.

## What Should Be Learned By Building

These are real questions, but they should be answered through implementation and usage rather than by writing a large pile of speculative planning docs:

- how much document retrieval and pinned context is actually useful
- how lightweight or heavy plans should be
- what automation patterns matter most in practice
- what the practical default execution path becomes between customer-managed hosts and managed sandbox providers
- how much autonomy different teams actually want
- when deployment and release control deserves first-class product ownership instead of GitHub-first handoff
- when cross-workspace oversight matters more than deeper single-workspace execution tooling

## Guidance For Any Agent Dropped Into This Project

If you are working on Stoneforge V2, assume the following unless explicitly told otherwise:

- do not casually re-open the hard decisions listed above
- do not design broad Phase 2 surfaces up front
- optimize for the proving slice, not the imagined final platform
- keep the model coherent: task is not execution history
- keep the workspace boundary simple
- keep execution auditable and recoverable
- keep task-local continuity on the task; use documents for broader durable context
- treat documents as explicit durable context, not hidden memory
- treat plans and automations as supporting orchestration layers, not replacements for the core task model
- treat human intervention as core, not exceptional
- prefer a narrower working control plane over a broader hypothetical one

If you need to make a decision not covered here:

- freeze it only if it is expensive to reverse now
- otherwise treat it as a working assumption and move forward

## Immediate Build Priorities

In practical order, the next work should cluster around:

1. workspace and GitHub foundation
2. execution capability model and scheduler path
3. task and execution-record flow
4. policy and audit enforcement
5. task continuity and durable context
6. plan activation and aggregation behavior
7. automation-triggered dispatch and review loops
8. end-to-end proving scenario and recovery hardening

That is the plan.
