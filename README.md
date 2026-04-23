# Stoneforge

Stoneforge V2 is a clean-room rebuild of Stoneforge around one core job: turning engineering intent into supervised, agent-driven software-engineering execution.

During the clean-room V2 build, this repository is V2-first:

- active V2 work lives at the root
- the canonical V2 charter lives in [`docs/v2/README.md`](docs/v2/README.md)
- `reference/v1/` and `reference/smithy-next/` exist only as reference material

## Current Status

Stoneforge is currently in active V2 clean-room development.

The root README is the repository front page. The canonical product and platform charter is [`docs/v2/README.md`](docs/v2/README.md), and the subordinate build-shaping docs in `docs/v2/` define the first buildable slice without expanding the platform prematurely.

## What Stoneforge V2 Is

Stoneforge V2 is a control plane for agent-driven software engineering.

It is built to help an engineering lead, platform lead, or operator:

- capture engineering intent
- clarify that intent
- decompose it into executable tasks
- dispatch those tasks to agents
- preserve durable context across sessions
- run review and approval loops
- move validated work through repository workflows
- detect failures, loops, and stalls
- keep policy, audit, and execution lineage coherent in one place

It is not:

- an AI chat app for coding
- a project tracker with agent features bolted on
- a GitHub replacement
- primarily a code editor product

## Who It Is For

Primary users:

- engineering leads
- platform leads
- operators supervising software-engineering workflows

The platform is optimized first for:

- visibility
- control
- dependability
- recoverability
- auditability
- durable context
- orchestration across many agent sessions

## Primary Workflow

The default workflow Stoneforge V2 is being built around is:

1. A workspace defines execution capabilities: runtimes, agents, and role definitions.
2. A human brings an engineering intent to a director agent.
3. The director clarifies the request and decomposes it into tasks, optionally grouped into a plan.
4. Ready tasks are dispatched by scheduler-owned durable queueing and leasing.
5. Each dispatch creates an `Assignment`, under which one or more concrete agent `Session`s may run.
6. Task-local continuity and workspace documents preserve durable context across crashes, restarts, and context exhaustion.
7. Completed code-changing work opens a GitHub-first PR.
8. Review agents and, when required, humans approve or request changes.
9. Change requests reopen the task and create a new repair loop with full lineage.
10. Approved work merges, or optionally aggregates through a plan branch and plan PR first.

The workflow is orchestration-first, but manual operation and human intervention are core product behaviors, not edge cases.

## Execution Model

Stoneforge V2 keeps several execution concepts intentionally separate:

- `Workspace`: primary operational boundary, repo-scoped by default in the first slice
- `Task`: planning unit
- `Plan`: grouping and execution-supervision unit
- `Assignment`: durable dispatch record for a task or merge request
- `Session`: concrete Claude Code or Codex execution thread/process under an assignment
- `Document`: durable shared context layer for the workspace
- `Runtime`: where and how work executes
- `Agent`: executable worker capability with harness, model, runtime, and concurrency
- `RoleDefinition`: the job the agent session is being asked to perform
- `Scheduler`: internal durable dispatch and capacity-management system
- `Automation`: user-facing workflow trigger that creates controlled intent

That separation is frozen early because Stoneforge needs clean dispatch, resumability, policy enforcement, auditability, and operator visibility.

## Hard Decisions Already Frozen

The main early decisions locked by the V2 charter are:

- V2 is one unified Stoneforge platform
- tasks remain the planning unit, while assignments, sessions, PRs, and CI runs are first-class execution records
- one repository maps to one workspace by default in the first slice
- the first slice is GitHub-first
- customer-managed hosts connect outbound to Stoneforge; inbound SSH is not the primary architecture
- host, runtime, agent, role definition, automation, and scheduler remain separate concerns
- authentication is delegated to upstream identity systems, while authorization and policy remain explicit Stoneforge subsystems
- SQLite is the OSS local-first baseline; PostgreSQL is the cloud and enterprise baseline
- the first supported merge topologies are narrow: direct task PR to target, or task PRs into a plan branch and plan PR

If a detail is not stated in the V2 charter or subordinate docs, assume it is not frozen yet.

## What The First Slice Must Prove

The first buildable V2 slice must prove that Stoneforge can:

- onboard one real GitHub repository into one repo-scoped workspace
- configure runtimes, agents, role definitions, and dispatch tags clearly
- execute work on both customer-managed hosts and a managed sandbox path
- move one task through `Task -> Assignment -> Session -> PR -> CI -> review -> merge or reopen`
- support both Claude Code and OpenAI Codex through the same control-plane model
- enforce policy and produce audit traces for real actions
- resume work cleanly after crashes or context exhaustion
- keep review, retry, reopen, and escalation loops coherent

The default proving scenario is the narrow direct-task path first, with plan aggregation added after that vertical slice is working.

## What We Are Not Trying To Build Yet

Stoneforge V2 is intentionally not trying to do all of this in the first slice:

- replace GitHub end to end
- own deployment promotion or rollback
- build native preview lifecycle management
- build deep diff-heavy review UX as the main product investment
- become a full CI/CD authoring platform
- build rich messaging as a core surface
- design multi-repo workspaces before repo-scoped workspaces clearly break

## V2 Docs

Start here for active V2 work:

- [`docs/v2/README.md`](docs/v2/README.md) — canonical V2 charter
- [`docs/v2/system-model.md`](docs/v2/system-model.md) — core nouns, ownership boundaries, invariants
- [`docs/v2/state-machines.md`](docs/v2/state-machines.md) — lifecycle transitions and failure paths
- [`docs/v2/runtime-architecture.md`](docs/v2/runtime-architecture.md) — runtime, scheduler, adapter, and recovery model
- [`docs/v2/policy-auth-audit.md`](docs/v2/policy-auth-audit.md) — auth, authorization, policy, secrets, and audit requirements
- [`docs/v2/integrations-and-first-slice.md`](docs/v2/integrations-and-first-slice.md) — GitHub-first boundaries, proving scenario, and slice order

## Repository Layout

```text
docs/v2/                 Canonical V2 charter and build-shaping specs
apps/                    Active V2 applications only
packages/                Active V2 packages only
reference/v1/            Frozen V1 workspace kept for code and behavior reference
reference/smithy-next/   UI/UX prototype kept for product and interaction reference
```

The root workspace intentionally excludes `reference/`. If code lives under `apps/` or `packages/`, it is part of active V2 work. If it lives under `reference/`, treat it as reference material unless a task explicitly says otherwise.

## Working In This Repo

Use the root for V2 work:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Until V2 packages land under `apps/` or `packages/`, these commands intentionally no-op after validating the root workspace shape.

Use the reference workspaces only when you need to inspect prior behavior or UI patterns:

```bash
pnpm reference:v1:install
pnpm reference:v1:dev:smithy
pnpm reference:v1:dev:platform

npm --prefix reference/smithy-next install
npm --prefix reference/smithy-next run dev
```

## Build Priorities

The immediate build priorities remain:

1. workspace and GitHub foundation
2. execution capability model and scheduler path
3. task and execution-record flow
4. policy and audit enforcement
5. task continuity and durable context
6. plan activation and aggregation behavior
7. automation-triggered dispatch and review loops
8. end-to-end proving scenario and recovery hardening

That sequence comes from the V2 charter and should drive early implementation work.
