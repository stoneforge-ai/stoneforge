# Stoneforge V2 System Model

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for the first Stoneforge V2 slice. It translates the README's product model into implementation-driving nouns, ownership boundaries, associations, tags, and invariants without replacing the charter.

## Scope And Status

First-slice scope:

- one Org containing one or more repo-scoped Workspaces
- one GitHub repository per Workspace
- Claude Code and OpenAI Codex as first-class agent backends
- customer-managed hosts plus one managed sandbox path
- Task, Plan, Assignment, Session, MergeRequest, and Verification Run modeled separately

Frozen in this doc:

- Workspace is the default operational boundary and maps to one repo in the first slice
- Task is the planning unit
- Assignment is the durable dispatch envelope
- Session is the concrete provider execution thread/process under an Assignment
- Session is not a human-visible work grouping
- MergeRequest is the provider-neutral internal review and merge artifact
- Host, Runtime, Agent, RoleDefinition, Automation, and Scheduler stay separate concerns

Working assumptions:

- Org is the top-level tenant, identity, and membership boundary
- Workspace policy is the main enforcement context, with Org policy supplying defaults and guardrails
- tags are supported on Runtime, Agent, RoleDefinition, Task, and Automation for matching and reporting
- a code-changing Task usually has one primary open MergeRequest at a time, but repair loops may update the same provider PR or replace the internal artifact if needed

Intentionally not specified yet:

- database schema
- storage tables or document layouts
- API routes or wire payloads
- UI screens or navigation
- exact tag serialization
- exact provider payloads

## System Overview

Stoneforge V2 has three main model layers:

- tenant and operational boundaries: Org, Workspace, Policy
- planning and context objects: Task, Plan, Document, Automation
- execution and capacity objects: Assignment, Session, MergeRequest, Verification Run, Host, Runtime, Agent, RoleDefinition, AuditEvent

The important separation is between planning intent and execution history. Tasks and Plans describe intended work. Assignments, Sessions, MergeRequests, and Verification Runs describe what actually happened while the system tried to perform that work.

## Tenant And Operational Boundaries

### Org

Purpose:

- top-level tenant and administration boundary
- owns human membership, groups, identity integration, and org-wide defaults

Owned by:

- the Stoneforge deployment

Key associations:

- contains Workspaces
- contains human users and groups
- may define org-wide Policy defaults and limits

Frozen semantics:

- a Workspace belongs to exactly one Org
- cross-Org execution or audit linking is out of scope for the first slice

### Workspace

Purpose:

- primary operational boundary in V2
- owns repository linkage, execution capabilities, runtime defaults, automations, and audit partitioning

Owned by:

- one Org

Key associations:

- maps to one GitHub repository in the first slice
- owns Tasks, Plans, Documents, Assignments, Sessions, MergeRequests, Verification Runs, Hosts, Runtimes, Agents, RoleDefinitions, Automations, and workspace Policy

Frozen semantics:

- one repository per Workspace by default
- dispatch, review, merge, policy, and audit are evaluated within the Workspace boundary

### Policy

Purpose:

- describes what may happen automatically, what requires review, and what requires approval

Owned by:

- Org or Workspace

Key associations:

- effective Workspace policy is derived from org-level defaults plus workspace-level preset and overrides
- evaluated during dispatch, review, approval, merge, secret use, and sensitive administrative actions

Frozen semantics:

- there is one policy system with multiple presets
- supervised automation is the default preset for the first slice
- autonomous is also supported in the first slice to prove the policy model

## Planning And Context Objects

### Task

Purpose:

- primary planning unit for intended work

Owned by:

- one Workspace

Key associations:

- may belong to zero or one Plan
- may depend on other Tasks
- may reference Documents
- may accumulate many Assignments over time
- may accumulate one or more MergeRequests across repair loops
- may reference one prior terminal source Task, source outcome, and optionally one source MergeRequest when created as a Follow-Up Task

Frozen semantics:

- Tasks carry title, intent, acceptance criteria, priority, dependencies, and structured task progress state
- Task Progress Record lives on the Task, not in hidden prompt state and not in a required per-task Document
- a Task is not execution history

### Plan

Purpose:

- groups related Tasks into one coordinated execution scope

Owned by:

- one Workspace

Key associations:

- contains multiple Tasks
- may own one plan-level MergeRequest when aggregation is enabled

Frozen semantics:

- a Plan is an execution-supervision grouping object, not a second task engine
- Tasks in a Plan are not dispatchable until the Plan is activated
- in the first slice, planned code-changing Tasks follow the workspace Merge Topology, which may aggregate through a Plan Branch and plan PR or merge directly to the Workspace Target Branch
- a Plan may own a plan-level MergeRequest, but implementation, repair, review, and merge-evaluation execution attach to Tasks or MergeRequests rather than directly to the Plan

### Document

Purpose:

- durable shared context layer for the Workspace

Owned by:

- one Workspace

Key associations:

- may be referenced by Tasks, Plans, Assignments, MergeRequests, or Automations

Frozen semantics:

- Documents hold reusable context such as specs, runbooks, and review notes worth preserving beyond one assignment
- Documents are not the hidden memory system for agent progress handoff

### Automation

Purpose:

- user-facing durable workflow trigger

Owned by:

- one Workspace in the first slice

Key associations:

- may listen to task, plan, MergeRequest, Verification Run, schedule, or inbound webhook events
- may create Dispatch Intent for implementation, review, repair, merge evaluation, or escalation, or may create an outbound automation webhook call

Frozen semantics:

- Automations do not own scheduling, leasing, or direct provider execution
- Agent Automations create Dispatch Intent for a concrete RoleDefinition plus optional runtime and agent constraints
- code-first automations call external user-hosted handlers through signed outbound webhooks with idempotency keys and async acknowledgement

## Execution Records

### Assignment

Purpose:

- durable dispatch envelope for one implementation, repair, review, or merge-evaluation job

Owned by:

- exactly one Task or exactly one MergeRequest in one Workspace

Key associations:

- binds exactly one execution owner, one selected RoleDefinition, one selected Agent, and one selected Runtime
- contains one or more Sessions
- may reference one related Task or one related MergeRequest depending on the workflow stage

Frozen semantics:

- a new Assignment is created for each new dispatch attempt such as initial implementation, repair after a repair trigger, or review pass
- crash recovery and context-exhaustion recovery stay within the same Assignment by creating a new Session
- Task-owned Assignments are used for implementation and repair work
- MergeRequest-owned Assignments are used for review or merge-evaluation work
- Plans do not directly own Assignments

### Session

Purpose:

- concrete provider execution thread or process

Owned by:

- one Assignment

Key associations:

- has one adapter/provider identity
- emits heartbeats, transcripts, checkpoints, and final outcome

Frozen semantics:

- a Session is the concrete Claude Code or Codex execution instance
- a Session is provider execution only; operator-visible grouping should use Assignment, Task activity, or Execution Lineage
- Sessions may end and be resumed by creating a new Session under the same Assignment when checkpoint-based recovery is allowed

### MergeRequest

Purpose:

- provider-neutral internal artifact for review and merge flow

Owned by:

- one Workspace

Key associations:

- belongs to exactly one source owner: one Task or one Plan
- maps to a provider PR in GitHub for the first slice
- may contain many Verification Runs and review outcomes over time
- has observed Mergeability from provider/source-control state
- may be affected by Branch Health signals from its source branch, target branch, or integration branch

Frozen semantics:

- `MergeRequest` is the canonical product term
- `PR` is the GitHub-facing and user-facing term in the first slice
- Mergeability feeds Stoneforge policy evaluation but is separate from Verification Run
- Branch Health is broader than Mergeability and may require repair before immediate merge evaluation

### Verification Run

Purpose:

- aggregate verification record for one MergeRequest head SHA

Owned by:

- one MergeRequest in one Workspace

Key associations:

- scoped to one MergeRequest head SHA
- contains one or more Provider Checks observed from GitHub checks and statuses in the first slice
- records whether each Provider Check is required by Stoneforge policy

Frozen semantics:

- Stoneforge derives Verification Run state from required Provider Checks and uses it for review and merge decisions
- provider required-check settings may seed defaults or observations, but Stoneforge policy remains canonical
- when the MergeRequest head SHA changes, prior Verification Runs become `stale`
- Stoneforge does not become a native CI authoring or execution platform in the first slice

### AuditEvent

Purpose:

- immutable compliance, lineage, and operator-observability record

Owned by:

- one Workspace, with Org context attached

Key associations:

- may reference Task, Plan, Assignment, Session, MergeRequest, Verification Run, Host, Runtime, Agent, RoleDefinition, Automation, Policy, secret references, and external provider identifiers

Frozen semantics:

- sensitive actions must emit AuditEvents
- AuditEvents capture actor, action, target, outcome, and policy context

## Execution Capability Objects

### Host

Purpose:

- capacity source for customer-managed execution

Owned by:

- one Workspace

Key associations:

- exposes one or more Runtimes

Frozen semantics:

- customer-managed Hosts connect outbound to Stoneforge through a host agent
- inbound SSH is not part of the primary first-slice architecture

### Runtime

Purpose:

- reusable execution environment contract

Owned by:

- one Workspace

Key associations:

- references one Host or one managed provider path
- may be reused by multiple Agents

Frozen semantics:

- a Runtime is the combination of an execution location and an execution mode
- first-slice execution modes may include local worktree, container, or managed sandbox
- Daytona is the first managed sandbox vendor under a provider-neutral runtime contract

### Agent

Purpose:

- dispatchable executable worker capability

Owned by:

- one Workspace

Key associations:

- binds one harness/model pairing to one Runtime
- may execute many Assignments over time with different RoleDefinitions

Frozen semantics:

- an Agent combines harness, model, runtime, concurrency limit, and launcher path or adapter configuration
- concurrency belongs to the Agent because the same Agent may serve many Roles

### RoleDefinition

Purpose:

- describes the job a Session should perform

Owned by:

- one Workspace

Key associations:

- attached to an Assignment at dispatch time
- may be reused across many Assignments and many compatible Agents

Frozen semantics:

- a RoleDefinition contains role prompt, tool access, skill access, and lifecycle hooks
- explicit role selection is the default path
- role tags remain supported as constrained capability labels, not as a free-form scheduling language

## Tag And Matching Contract

Tags are short labels used for capability and routing constraints.

First-slice rules:

- Runtime tags express environment constraints such as `sandbox`, `customer-host`, or `frontend`
- Agent tags express pool or capability constraints such as `high-context` or `fast-review`
- RoleDefinition tags express constrained capability labels such as `director`, `review`, or `frontend-worker`
- Task and Automation tags express required constraints, not preference scoring
- all required tags must match for an object to remain eligible
- tags narrow eligibility; they do not bypass policy
- tags do not replace explicit RoleDefinition selection before execution begins

## Association Contracts

| Association | Contract |
| --- | --- |
| Org -> Workspace | One Org owns many Workspaces. A Workspace belongs to one Org. |
| Workspace -> repository | One Workspace maps to one GitHub repository in the first slice. |
| Plan -> Task | A Task belongs to zero or one Plan. A Plan contains many Tasks. |
| Task -> Assignment | A Task may have many Assignments. A Task-owned Assignment belongs to one Task. |
| MergeRequest -> Assignment | A MergeRequest may have many Assignments. A MergeRequest-owned Assignment belongs to one MergeRequest. |
| Assignment -> Session | An Assignment may contain many Sessions. A Session belongs to one Assignment. |
| Task/Plan -> MergeRequest | A MergeRequest belongs to exactly one Task or exactly one Plan. |
| MergeRequest -> Verification Run | A MergeRequest may have many Verification Runs. A Verification Run belongs to one MergeRequest. |
| Host -> Runtime | A Host may expose many Runtimes. A customer-managed Runtime belongs to one Host. |
| Runtime -> Agent | A Runtime may be reused by many Agents. An Agent is bound to one Runtime. |
| RoleDefinition -> Assignment | A RoleDefinition may be reused by many Assignments. Each Assignment resolves exactly one RoleDefinition. |
| Automation -> execution intent | Automations create scheduler-evaluated intent; they do not directly start Sessions. |

## Invariants

- planning intent and execution history are separate model layers
- a Task never substitutes for an Assignment, Session, MergeRequest, or Verification Run
- a Plan does not replace the Task model
- a Task inside an inactive Plan is not dispatchable
- dispatch must resolve one concrete RoleDefinition, one Agent, and one Runtime before execution starts
- an Assignment belongs to exactly one Task or exactly one MergeRequest
- one Session belongs to exactly one Assignment
- resumed work after crash or context exhaustion creates a new Session under the same Assignment when policy allows
- repair work after a repair trigger creates a new Task-owned Assignment on the same Task
- Follow-Up Context creates a Follow-Up Task from prior terminal work rather than reopening the source Task
- a MergeRequest belongs to one Task or one Plan, never both
- review or merge-evaluation work may use MergeRequest-owned Assignments; coding repair still updates or creates Tasks
- GitHub-first terminology may say `PR`, but the product model keeps `MergeRequest` as the canonical internal noun
- Documents are reusable workspace context; task-local checkpoints, remaining work, and repair context belong on the Task
- AuditEvents are required for sensitive actions and must capture actor, target, and outcome
- policies constrain what automation, scheduler, agents, and humans may do; none of those subsystems bypass policy

## Semantic Events

These are semantic event names for reasoning and docs. They are not frozen API or queue payload names.

| Event | Meaning |
| --- | --- |
| `workspace.ready` | workspace has repo connectivity, policy, and at least one runnable execution path |
| `task.readiness_changed` | a task's dispatch eligibility changed due to dependency, plan, policy, or review state |
| `dispatch.intent_created` | an automation or human action requested scheduler evaluation |
| `assignment.started` | a durable dispatch envelope has entered live execution |
| `session.checkpoint_created` | a Session persisted a resumable Checkpoint into the Task Progress Record |
| `merge_request.opened` | a provider PR now exists for a task or plan |
| `verification_run.observed` | new verification status/check information was recorded |
| `repair.trigger_recorded` | review, verification, mergeability, policy, or branch health requires task or plan repair |
| `policy.decision_recorded` | a policy-sensitive action was evaluated and its decision stored |
| `audit.event_emitted` | a required audit record was persisted |

## Intent Example

Intent example only. This is not final implementation code.

```yaml
org:
  name: "Acme Engineering"
  workspaces:
    - repo: "github.com/acme/api"
      policyPreset: "supervised"
      runtimes:
        - name: "host-worktree"
          tags: ["customer-host"]
        - name: "daytona-sandbox"
          tags: ["sandbox"]
      agents:
        - name: "codex-worker"
          runtime: "daytona-sandbox"
          tags: ["high-context"]
      roleDefinitions:
        - name: "worker-default"
          tags: ["worker"]
        - name: "review-default"
          tags: ["review"]
      task:
        title: "Add retry visibility"
        plan: "scheduler-hardening"
        progressRecord:
          checkpoints:
            - completedWork: ["added retry counters"]
              remainingWork: ["wire PR review summary"]
              importantContext: ["retry visibility spans scheduler and PR review summary"]
          repairContext: []
        assignments:
          - role: "worker-default"
            agent: "codex-worker"
            sessions:
              - provider: "openai-codex"
                status: "ended"
              - provider: "openai-codex"
                status: "active"
```
