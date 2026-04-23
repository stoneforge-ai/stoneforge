# Stoneforge V2 Meta-Plan

## Summary

Create a decision-complete planning packet for a clean-room Stoneforge V2 before implementation begins. The packet must define not only product direction and architecture, but also the complete software stack, build-vs-buy choices, layered feature specs, and the decision log for why each major choice was made.

This planning effort is explicitly human-in-the-loop. The final deliverables must be a joint product of:

- Adam's domain knowledge, product judgment, ecosystem awareness, and operator experience
- the planning agent's analysis, synthesis, benchmarking, and specification work

The plan must not assume V1 boundaries or preserve the current Smithy/Quarry split by default; it must explicitly decide them. V2 is a clean break from V1, but the planning effort must include an exhaustive retain/redesign/remove/defer audit of V1 so nothing is carried forward by inertia.

## Planning Model

Planning runs on two synchronized tracks:

- Product track: extract the intended operator experience from `apps/smithy-next`, challenge it where needed, and turn it into canonical capability briefs and feature specs.
- Architecture + stack track: define the target control plane, domain model, runtime model, storage/eventing model, identity/tenancy/security model, operational architecture, and the concrete software stack that implements each layer.

The output must use a layered spec model:

1. Foundation packet
   Decision-complete docs for architecture, stack, build-vs-buy, domain model, runtime/control-plane model, auth/tenancy/audit model, deployment model, and phase roadmap.

2. Capability briefs for every major feature or subsystem
   Each major surface in `smithy-next`, each major V1 capability, and each major platform subsystem gets a concise spec covering purpose, users, workflows, data/entities touched, dependencies, tiering, and disposition: core, supporting, deferred, or rejected.

3. Implementation-grade specs for foundation-critical and Phase 1 features
   Any feature or subsystem needed to validate the architecture or build the first V2 slice must receive a full implementation-ready spec before coding begins.

4. Spec backlog
   A tracked list of later-phase capability briefs that still need promotion into full specs before implementation.

## Human Consultation Protocol

This is a required part of the meta-plan, not an optional collaboration style.

### Operator interview loop

- Before locking any major decision, the planning agent must consult Adam, the human operator, with focused questions and candidate options.
- The planning agent should explore local docs, prototype artifacts, and benchmark material first, then ask only the questions that materially affect the decision.
- Questions should be framed to extract:
  - product intent
  - operator pain points
  - ecosystem/tooling knowledge not likely to be in model memory
  - strategic preferences and constraints
  - acceptable tradeoffs

### Decisions that require operator consultation

The plan must require direct consultation with Adam or the human operator before finalizing decisions in these categories:

- product boundaries and system identity
- Smithy/Quarry convergence vs separation
- major domain-model and workflow choices
- build-vs-buy decisions for core infrastructure
- stack choices with meaningful vendor lock-in or operational burden
- agent harness, orchestration, and runtime connectivity choices
- identity, permissions, tenancy, audit, and compliance-capable foundations
- OSS vs cloud vs enterprise-self-hosted scope boundaries
- phase slicing and what enters Phase 1
- any rejection or major redesign of a prominent `smithy-next` capability
- any decision where the current tool ecosystem may have moved beyond model knowledge

### Decision record requirements

For each major decision, the planning packet must capture:

- the problem being decided
- options considered
- input and preferences from Adam or the human operator
- agent analysis and benchmark findings
- chosen option
- rejected options and why they lost
- downstream consequences
- follow-up questions or validation needed

### Default posture

- No major decision should be silently inferred when input from Adam or the human operator would materially improve it.
- If Adam or the human operator has newer market or tooling knowledge, that input should be treated as first-class planning evidence.
- Final deliverables should read as co-authored planning artifacts, not as standalone agent opinions.

## Required Deliverables

- V2 charter covering product thesis, non-goals, enterprise quality bar, deployment modes, and planning principles.
- Decision rubric covering user value, strategic differentiation, reliability, security/auditability, compliance impact, implementation complexity, operational burden, extensibility, cost, vendor lock-in, self-hostability, and exit cost.
- ADR index and decision log for all high-cost or hard-to-reverse choices.
- `smithy-next` surface packet covering feature inventory, workflow inventory, prototype gap matrix, and keep/refine/redesign/defer/reject decisions.
- V1 audit matrix for every major subsystem and workflow with retain/redesign/remove/defer decisions.
- North-star architecture packet covering system context, subsystem boundaries, domain model, data flow, runtime model, control-plane model, and operational architecture.
- Technology stack specification packet mapping every major capability and infrastructure concern to a concrete stack choice.
- Build-vs-buy ledger recording, per subsystem, whether Stoneforge will build in-house, adopt OSS, self-host OSS, or use a managed/off-the-shelf product.
- Capability briefs for every major feature area and subsystem.
- Implementation-grade specs for every foundation-critical and Phase 1 feature.
- Spec backlog for later-phase features that still need deep specs before implementation.
- Phase roadmap covering the north-star target and the first buildable V2 slice.

## Core Workstreams

### 1. Framing and Decision Discipline

- Write the V2 charter.
- Define planning principles and non-goals.
- Establish templates for ADRs, benchmark memos, stack-spec entries, build-vs-buy entries, capability briefs, and full feature specs.
- Define a strict rule: no major subsystem can remain at a vague placeholder like "database", "queue", "auth", or "runtime layer" by the end of planning. Each must either have a chosen stack or an explicitly gated unresolved decision with owner, options, and impact.

### 2. Product Surface Definition

- Turn `smithy-next` into a feature inventory by zone, overlay, workflow, and data surface.
- Produce a prototype gap matrix for each surface: keep as-is, refine, redesign, defer, or reject.
- Produce a V1 capability audit matrix across major subsystems and workflows with explicit retain/redesign/remove/defer decisions.
- Produce a capability brief for every major feature area or subsystem.
- Require dedicated decision docs for the highest-impact product questions:
  - whether tasks remain the primary work unit
  - whether Smithy and Quarry stay separate or converge
  - what is core vs supporting in the V2 product model
  - what belongs in OSS local-first, managed cloud team, and enterprise self-hosted

### 3. Architecture Packet

- Define the north-star system context and major subsystems for an AI control plane centered on task execution, orchestration, review, automation, and operator visibility.
- Specify the core domain model and relationship model: tasks, sessions, agents, runtimes, hosts, workspaces, users/orgs/teams, documents, messages, plans, CI, automations, and audit events.
- Specify runtime/execution architecture, including host/runtime separation, daemon placement, connectivity model, failure handling, scheduling/dispatch rules, and recovery behavior.
- Specify storage, eventing, and synchronization architecture, including source-of-truth strategy, consistency boundaries, versioning, and change propagation.
- Specify compliance-capable foundations from the start: authn, authz/RBAC, tenancy isolation, audit trails, secret boundaries, retention/deletion model, and deployment assumptions.
- Specify operational architecture: observability, SLOs, error budgets, upgrades, rollback/recovery, config management, and test strategy.

### 4. Technology Stack and Build-vs-Buy Packet

- For every major capability and infrastructure layer, produce a canonical stack entry that names the exact software or service planned for V2.
- Each stack entry must include:
  - capability or subsystem being served
  - exact product, library, service, or runtime being proposed
  - whether it is built in-house, OSS adopted, OSS self-hosted, or managed/off-the-shelf
  - why this choice fits Stoneforge better than the main alternatives
  - rejected alternatives and the reason they lost
  - integration boundaries and dependencies
  - operational ownership and expected failure modes
  - security and compliance implications
  - cost and licensing considerations
  - self-hosted vs cloud stance
  - exit or replacement strategy if the choice becomes a constraint later
- Minimum coverage must include:
  - frontend application stack
  - backend and service runtime stack
  - control-plane orchestration stack
  - workflow, queue, and scheduling stack
  - primary data stores and indexing/search
  - real-time transport and event delivery
  - identity, SSO boundary, and authorization/policy layer
  - secrets, key management, and sensitive-data handling
  - artifact and blob storage
  - agent harness, runtime connectivity, and sandboxing layer
  - CI/CD and release tooling
  - observability stack
  - deployment and environment management
  - documentation, spec, and ADR toolchain
- Where deployment variants differ, the packet must say so explicitly for:
  - OSS local-first
  - managed cloud team
  - enterprise self-hosted

### 5. External Benchmarks and Human-Guided Research

- Run targeted benchmark studies only for decisions that benefit from outside patterns.
- Treat modern agent harnesses, orchestration tooling, and automation systems as a human-guided research area rather than assuming the planning agent already knows the best current options.
- Add a recurring operator interview loop for this workstream:
  - gather tools, products, repos, papers, and examples supplied by Adam or the human operator
  - ask focused comparison questions when current ecosystem knowledge materially affects a decision
  - record what is confirmed from sources vs what is inferred
- Write a short benchmark memo for each researched topic with: problem being informed, candidate systems reviewed, input received from Adam or the human operator, relevant patterns to adopt/avoid, and resulting decision or open question.
- Allow targeted, disposable spikes only for high-risk unknowns, each with a written hypothesis, exit criteria, and outcome memo.

### 6. Full-Spec Promotion Rules

- Promote a capability brief into a full implementation-grade spec when any of the following are true:
  - it is part of Phase 1
  - it validates a foundational architecture decision
  - it introduces a new core domain boundary
  - it affects auth, tenancy, audit, or operational risk
  - it materially changes the operator experience in `smithy-next`
- Every full spec must include:
  - purpose and success criteria
  - user personas and operator roles
  - primary workflows
  - entities and data touched
  - APIs, events, and interfaces involved
  - state transitions and failure modes
  - permission and audit implications
  - tiering and deployment assumptions
  - acceptance criteria and test scenarios
  - dependencies and rollout order
- Maintain a spec backlog so no deferred deep-spec work is implicit or forgotten.

### 7. Phase Plan

- Produce both a north-star target and a phase roadmap.
- Define the first buildable V2 slice only after the architecture packet and stack packet are stable.
- Keep migration separate: V2 assumes a clean break, with optional import/migration tooling scoped afterward if justified.

## Interfaces and Decisions That Must Be Frozen Before Build

- Core task model and task relationship rules
- Workspace, org, team, user, and permission model
- Agent, session, host, runtime, and daemon contracts
- External API surface and event schema/versioning strategy
- Storage and synchronization contracts
- Plugin and integration boundaries
- Audit and policy enforcement boundaries
- Canonical stack choice for each major subsystem
- Build-vs-buy decision for each major subsystem
- Full specs for all foundation-critical and Phase 1 features

## Milestone Gates

1. Gate 0: Charter
   V2 charter, planning principles, evaluation rubric, ADR template, benchmark template, stack-spec template, capability-brief template, full-spec template, build-vs-buy template, and identified operator-interview topics.

2. Gate 1: Surface Audit
   `smithy-next` feature catalog, V1 audit matrix, open decision register, prototype gap matrix, and a first-pass capability brief list.

3. Gate 2: North-Star Architecture
   Domain model, control-plane architecture, runtime model, data/eventing model, deployment model, Smithy/Quarry boundary decision, and major architectural choices reviewed with Adam or the human operator.

4. Gate 3: Stack and Decision Packet
   Complete technology stack specification, build-vs-buy ledger, auth/tenancy/audit model, operational model, testing strategy, benchmark-driven decisions, and explicit decision records showing consultation with Adam or the human operator.

5. Gate 4: Spec Packet and Phase Plan
   Full specs for foundation-critical and Phase 1 features, spec backlog for later phases, first buildable slice, phased roadmap, spike outcomes, benchmark memos, operator-reviewed open questions, and readiness checklist.

## Completion Criteria

The planning effort is not complete unless:

- every major capability maps to a concrete stack choice
- every major subsystem has an explicit build-vs-buy decision
- every major feature area has at least a capability brief
- every foundation-critical and Phase 1 feature has a full implementation-grade spec
- every major choice has a recorded rationale and rejected alternatives
- every required subsystem has a clear stance for OSS local-first, managed cloud team, and enterprise self-hosted where relevant
- major decisions show explicit consultation with Adam or the human operator and resulting guidance
- unresolved decisions are few, explicit, owned, and non-blocking to the first build phase
- the packet is precise enough that a senior engineer or coding agent can implement from it without inventing major architecture, tooling, or product decisions

## Assumptions and Defaults

- `apps/smithy-next` is the primary product reference, but not immune from rejection.
- Planning is dual-track: product-spec and architecture/stack work proceed in parallel and reconcile at each gate.
- V2 is a clean break from V1.
- Docs are repo-native Markdown + ADRs and should be implementation-ready for humans and agents.
- The plan assumes compliance-capable foundations, not a full certification program before architecture can proceed.
- Modern agent harness and automation research is human-in-the-loop by default where current ecosystem knowledge materially affects decisions.
- Targeted spikes are allowed only to de-risk major unknowns; they do not replace written specs.
- Final deliverables should reflect Adam's expertise plus agent reasoning, not one replacing the other.
