# Ubiquitous Language

This glossary captures the canonical domain language for Stoneforge V2 work. It is subordinate to the V2 charter in [README.md](README.md) and should evolve with the rest of the V2 docs.

## Product frame

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Stoneforge V2** | A control plane for supervised, agent-driven software-engineering execution. | Chat app, project tracker, code editor |
| **Control Plane** | The Stoneforge system of record for intent, planning, dispatch, policy, execution lineage, review, approval, and recovery. | Orchestrator app, daemon, editor |
| **Engineering Intent** | A human's request, idea, or plan for changing or understanding a codebase. | Prompt, ticket text, vague ask |
| **Execution Lineage** | The recorded chain of planning objects, dispatch attempts, Sessions, review outcomes, CI observations, approvals, and merge actions for a piece of work. | Timeline, history, logs, transcript |
| **Audit Trail** | The compliance-oriented subset of Execution Lineage made from required AuditEvents for sensitive actions. | Timeline, activity feed, full history |
| **Human Intervention** | A normal operator action that inspects, steers, resumes, cancels, reviews, approves, or directly repairs work; the broad umbrella for human control inside automated flows. | Manual fallback, failure mode, escape hatch |

## People and actors

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Human User** | A person authenticated into Stoneforge through an upstream identity system. | Account, login |
| **Engineering Lead** | A primary user who supervises engineering work across tasks, plans, agents, and reviews. | Manager, project owner |
| **Platform Lead** | A primary user who owns execution capabilities, integrations, policy, and operational reliability. | Infra owner, admin |
| **Operator** | A human who creates, dispatches, steers, resumes, cancels, or escalates work inside a Workspace. | Dispatcher, controller |
| **Human Reviewer** | A human authorized to inspect a MergeRequest and record approval or a Change Request. | QA, approver, reviewer role |
| **Approver** | A human authorized by policy to satisfy a human approval gate. | Reviewer, GitHub reviewer |
| **Service Actor** | A non-human actor such as the scheduler, GitHub App, host agent, provider adapter, or webhook handler acting within Stoneforge policy. | Bot, system user |

## Tenant and operational boundaries

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Org** | The top-level tenant, membership, identity, and administration boundary. | Organization account, company |
| **Workspace** | The primary operational boundary for one repository, its policies, execution capabilities, tasks, plans, documents, and audit partition. | Project, repo, tenant |
| **Repository** | The source-control repository linked to a Workspace, with GitHub as the first-slice provider. | Codebase, project |
| **Policy** | The system that determines what may happen automatically, what requires review, and what requires human approval. | Permissions, settings, rules |
| **Policy Preset** | A named bundle of workspace policy defaults that supplies a coherent automation and approval posture while still allowing specific policy values to be changed. | Mode, profile |
| **Supervised Policy** | The default preset that allows automated dispatch and review while requiring human approval for code-changing merge unless exempted. | Manual mode, safe mode |
| **Autonomous Policy** | A preset that allows automatic merge when policy, CI, and review conditions are satisfied. | Full auto, hands-off mode |

## Planning and context

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Task** | The primary planning unit for intended work. | Job, ticket, run |
| **Plan** | A coordinated execution-supervision grouping for related tasks. | Epic, project, second task engine |
| **Plan Graph** | The shaped set of planned tasks and dependency relationships that must be coherent before activation. | Task list, roadmap |
| **Dependency** | A blocking relationship that prevents a task from becoming ready until another task or constraint is satisfied. | Link, prerequisite note |
| **Acceptance Criteria** | The concrete conditions that define whether a task's intended work is complete. | Requirements, checklist |
| **Priority** | A task ordering signal used for planning and scheduler decisions. | Rank, severity |
| **Document** | Durable shared workspace context such as specs, runbooks, design notes, and reusable review knowledge. | Hidden memory, task progress note |
| **Task Progress Record** | The task-owned durable progress state and first-class MVP model that stores Checkpoints and Repair Context so later Sessions can resume with accurate context. | Task-Local Continuity, document, prompt memory, transcript |
| **Task Progress Summary** | A bounded on-demand projection of the Task Progress Record that tells an agent what progress context exists and where to inspect more detail. | Hidden memory, transcript summary, generic blob |
| **Checkpoint** | A meaningful resumable task progress snapshot containing completed work, remaining work, and important continuation context. | Heartbeat, log update, session status, savepoint, memory |
| **Repair Context** | Additional task-owned progress context inside the Task Progress Record, attached after a Repair Trigger to steer the next repair assignment and distinct from Checkpoints. | Follow-Up Context, comment, failure text |
| **Follow-Up Context** | Additional context used to create and steer a Follow-Up Task from prior terminal work that needs additional action; not part of the source Task Progress Record. | Reopen context, repair context, bug report |
| **Follow-Up Task** | A new task created from prior terminal work that needs additional action and linked to its source task. | Reopened task, continuation task |
| **Follow-Up Source** | The first-class provenance link from a Follow-Up Task to the prior terminal source Task, explicit source outcome, and, when relevant, source MergeRequest. | Document link, prose reference, follow-up context |

## Execution and capacity

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Host** | A customer-managed capacity source that connects outbound to Stoneforge and exposes runtimes. | Machine, runner, server |
| **Host Agent** | The customer-managed service that maintains outbound connectivity, advertises capacity, and launches or controls execution on a Host. | Runner daemon, SSH agent |
| **Managed Sandbox** | A provider-created execution environment for per-assignment agent work. | VM, container, Daytona |
| **Runtime** | A reusable execution environment contract combining an execution location and execution mode. | Environment, runner, sandbox |
| **Execution Mode** | The way a runtime executes work, such as local worktree, container, sandbox, or VM. | Runtime type, backend |
| **Agent** | A dispatchable executable worker capability that binds a harness and model to one runtime with a concurrency limit. | Bot, role, session |
| **Director Agent** | An Agent acting under a director-category RoleDefinition to clarify intent, decompose work, shape plans, or supervise execution. | Director role, planning bot |
| **Worker Agent** | An Agent acting under a worker-category RoleDefinition to implement, repair, or otherwise execute task work. | Worker role, coding bot |
| **Review Agent** | An Agent acting under a reviewer-category RoleDefinition to evaluate MergeRequests, produce Review Outcomes, or perform merge evaluation work. | Reviewer role, merge evaluator |
| **RoleDefinition** | The concrete prompt, tools, skills, hooks, category, and behavioral contract selected for a session. | Role, prompt, agent type |
| **Role Category** | A required controlled classification for a RoleDefinition, currently director, worker, reviewer, or custom. | Role tag, agent type |
| **Director Role Category** | The Role Category for RoleDefinitions intended for Director Agent work. | Director Agent type, planning tag |
| **Worker Role Category** | The Role Category for RoleDefinitions intended for Worker Agent work. | Worker Agent type, coding tag |
| **Reviewer Role Category** | The Role Category for RoleDefinitions intended for Review Agent work. | Review Agent type, merge evaluator category |
| **Custom Role Category** | The Role Category for RoleDefinitions that do not fit director, worker, or reviewer categories; configuration-only until a product workflow needs a named actor phrase. | Custom Agent, automation actor |
| **Default RoleDefinition** | The concrete RoleDefinition an Automation selects when no task-specific or one-off override is supplied. | Default role, automation role |
| **Role Override** | A task-specific or one-off replacement for an Automation's Default RoleDefinition. | Role tag, role preference |
| **Tag** | A short hard constraint label used to narrow eligible runtimes, agents, role definitions, tasks, or automations. | Label, preference, score |
| **Dispatch Intent** | A durable request for the scheduler to evaluate a workflow action such as implement, review, merge evaluation, or escalation. | Queue item, job request |
| **Qualified Dispatch Intent Phrase** | A descriptive phrase such as review Dispatch Intent, repair Dispatch Intent, merge-evaluation Dispatch Intent, or escalation Dispatch Intent used to clarify requested action without creating a separate canonical intent object. | Review Intent, Merge Evaluation Intent, Repair Intent |
| **Scheduler** | The durable internal system that evaluates readiness, queues work, leases capacity, places execution, retries, resumes, escalates, and propagates cancellation. | Daemon, automation, runner |
| **Lease** | A scheduler-owned, time-bound reservation of agent, runtime, and host or provider capacity for one dispatch attempt. | Lock, assignment, slot |
| **Assignment** | The durable dispatch envelope for one implementation, repair, review, or merge-evaluation job. | Run, task execution, session |
| **Qualified Assignment Phrase** | A descriptive phrase such as implementation Assignment, repair Assignment, review Assignment, or merge-evaluation Assignment used to clarify workflow purpose without creating a separate canonical object. | Assignment subtype, job type object |
| **Session** | The concrete provider execution thread or process under an Assignment; not a human-visible work grouping. | Assignment, run, agent, work session |
| **Adapter** | A provider-specific boundary that launches, resumes, cancels, observes, and reports execution facts without owning planning or policy decisions. | Integration, driver |
| **Concurrency Limit** | The maximum number of live assignments an agent may serve at one time. | Capacity, rate limit |

## Review and delivery

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **MergeRequest** | The provider-neutral internal artifact for review and merge flow. | PR, pull request, branch |
| **PR** | The GitHub-facing and first-slice user-facing representation of a MergeRequest. | MergeRequest in internal model |
| **Merge Topology** | The policy-selected branch and MergeRequest shape used to integrate Task and Plan work. | Branch strategy, PR mode |
| **Task Branch** | The source branch for work produced by a code-changing task. | Feature branch, worker branch |
| **Plan Branch** | An optional integration branch used when the Merge Topology aggregates task work at the plan level. | Staging branch, aggregate branch |
| **Workspace Target Branch** | The branch configured as the merge target for completed workspace work. | Main, default branch |
| **Staging Branch** | A future first-class branch concept for requiring task and plan work to merge into a staging integration branch before policy-gated promotion to the Workspace Target Branch. In the current MVP, teams can approximate this by configuring the staging branch as the Workspace Target Branch. | Parent branch, plan branch |
| **Unplanned Task Flow** | The Merge Topology where a task branch opens a PR directly to the Workspace Target Branch. | Direct PR flow |
| **Planned Task Flow** | A Merge Topology where planned task branches either merge directly to the Workspace Target Branch or aggregate through an optional Plan Branch before merging onward. | Aggregation flow |
| **CIRun** | An execution record for observed CI state associated with a MergeRequest. | Build, check run, status |
| **Review Outcome** | The recorded result of Human Reviewer or Review Agent evaluation, usually approval or a Change Request. | Review comment, PR state |
| **Repair Trigger** | Any review, CI, mergeability, policy, or branch-health condition that requires task repair before completion. | Failure, rejection, reopen |
| **Change Request** | A repair trigger produced by a Human Reviewer or Review Agent. | Rejection, failure |
| **Gate Failure** | A repair trigger produced by CI, mergeability, branch drift, or policy evaluation. | Change request, broken check |
| **Human Approval Gate** | A narrow policy requirement that a qualified human approve before merge or another sensitive action. | Manual review, GitHub approval, human intervention |
| **Stoneforge Policy Check** | The Stoneforge-owned GitHub status or check that represents the canonical policy decision for merge readiness. | CI check, approval check |
| **Merge Evaluation** | The workflow action that determines whether a MergeRequest satisfies policy, CI, review, and mergeability requirements. | Merge check, final review |

## Automation and workflow triggers

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Automation** | A durable user-facing workflow trigger that creates controlled Stoneforge workflow intent. | Scheduler, bot, daemon |
| **Platform Automation** | A Stoneforge-provided automation for core flows such as ready-task dispatch, PR review, repair dispatch, merge evaluation, or failure escalation. | Built-in job, system rule |
| **User-Defined Automation** | A workspace automation configured by users through product events, schedules, inbound webhooks, pure-agent actions, or outbound code-first webhooks. | Custom daemon, plugin |
| **Pure-Agent Automation** | An automation action that requests execution through a Default RoleDefinition and optional agent or runtime constraints. | Agent script, prompt automation |
| **Code-First Automation** | An automation action that calls a user-hosted outbound webhook handler through a signed request. | In-process workflow code, custom code host |
| **Inbound Webhook Trigger** | A signed workspace-scoped external request that may create automation intent. | Webhook endpoint, callback |
| **Outbound Code-First Webhook** | A signed Stoneforge request to an external user-hosted handler for code-first automation. | Webhook callback, plugin call |
| **Idempotency Key** | A correlation key used to make repeated webhook deliveries safe to process once. | Request ID, dedupe token |

## Policy, auth, secrets, and audit

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Authentication** | The process that proves the identity of a human or service actor. | Login, authorization |
| **Authorization** | The actor permission decision about what an authenticated human or service actor may do at all. | Auth, policy, workflow gate |
| **Policy Evaluation** | The workflow decision about whether an authorized requested action may happen automatically, is blocked, requires review, or requires human approval. | Authorization, permission check, validation |
| **AuditEvent** | An immutable record of actor, action, target, outcome, and policy context for compliance, lineage, and operator observability. | Log, event, transcript |
| **Secret** | Boundary-specific sensitive material used by the platform, orgs, workspaces, integrations, or assignment-scoped runtime execution. | Credential, token |
| **Platform Secret** | A secret owned by the Stoneforge platform operator and used to operate the control plane or platform-level integrations. | Control-plane secret, global secret, admin token |
| **Org Secret** | A secret owned at the Org boundary and made available to Workspaces or integrations only through Org and Workspace policy. | Global secret, platform secret |
| **Workspace Secret** | A secret owned by one Workspace and usable only within that Workspace boundary, including runtime injection when policy permits it. | Workspace-runtime secret, host credential, repo PAT |
| **Provider Installation** | An installed or configured external provider identity or integration grant that Stoneforge can use under policy. | Integration account, provider config |
| **GitHub App Installation** | The GitHub-specific Provider Installation used for repository access and PR operations in the first slice. | OAuth app, bot account, PAT |
| **Provider Identifier** | An external ID from GitHub, Claude Code, Codex, Daytona, or another provider that is correlated with Stoneforge records. | Foreign key, external ref |

## Recovery and escalation

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Readiness** | The evaluated condition that work is dispatchable because dependencies, plan activation, policy, and capacity constraints allow the next action. | Ready flag, manual toggle |
| **Queueing** | The scheduler behavior that keeps dispatch intent durable while work awaits eligibility or capacity. | Waiting, backlog |
| **Retry** | A scheduler-controlled repeated placement or launch attempt after a transient failure or unavailable capacity. | Loop, rerun |
| **Resume** | Recovery that starts a new session under the same assignment using checkpoint context. | Restart, reopen |
| **Repair** | Follow-up implementation work on the same task after a Repair Trigger. | Retry, fixup |
| **Escalation** | A policy-controlled transition that stops or downgrades autonomous progress because risk, stall, or loop thresholds require human attention. | Failure, alert, human intervention |
| **Human Review Required** | The task state indicating that automated flow has stopped until a human reauthorizes, cancels, or otherwise resolves the work; Escalation is the transition or cause, not the task state name. | Escalated, stuck, failed |
| **Cancellation** | An intentional stop of a task, plan, dispatch intent, assignment, session, or MergeRequest flow by an authorized human or policy decision. | Abort, stop, kill, close |
| **Session Stop** | The qualified phrase for intentionally stopping provider execution inside a Session. | Session cancellation, kill |
| **Stall** | An observed lack of heartbeat, progress, placement, or repair improvement that may trigger recovery or Escalation after policy thresholds are crossed. | Hang, timeout, escalation |

## State names

These state names are semantic product contracts, not required storage enum strings.

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Workspace `ready`** | The workspace has repository connectivity, policy, and at least one healthy runnable execution path. | Configured, active |
| **Task `draft`** | The task is still being clarified and should not dispatch. | New, unsorted |
| **Task `planned`** | The task definition is accepted but not yet dispatchable. | Backlog, queued |
| **Task `ready`** | The task is eligible for scheduler dispatch. | Selected, assigned |
| **Task `in_progress`** | At least one live assignment or session is executing task work. | Running, active |
| **Task `awaiting_review`** | Implementation or repair work is complete and review or CI gates are pending. | Done, review |
| **Task `repair_required`** | A Repair Trigger requires task repair work. | Changes requested, failed, rejected |
| **Task `human_review_required`** | Escalation has stopped autonomous task progress and a human must reauthorize, cancel, or otherwise resolve the task. | Escalated, stuck, failed |
| **Task `merge_ready`** | The task-level MergeRequest satisfies required checks and approval conditions. | Approved, shippable |
| **Plan `active`** | The plan graph is coherent and its tasks may dispatch when individually ready. | Started, open |
| **Assignment `resume_pending`** | The prior session ended unexpectedly and the assignment is waiting to resume from checkpoint. | Paused, failed |
| **Session `checkpointed`** | A resumable handoff snapshot has been persisted and execution may continue. | Saved, paused |
| **MergeRequest `policy_pending`** | Technical checks passed but Stoneforge policy approval is still outstanding. | Waiting for approval |
| **MergeRequest `repair_required`** | A Repair Trigger requires MergeRequest repair work. | Changes requested, failed, rejected |
| **CIRun `stale`** | A previous CI result no longer applies to the current MergeRequest head. | Old, obsolete |

## Relationships

- An **Org** owns one or more **Workspaces**; a **Workspace** belongs to exactly one **Org**.
- A **Workspace** maps to exactly one **Repository** in the first slice.
- A **Workspace** owns its **Tasks**, **Plans**, **Documents**, **Hosts**, **Runtimes**, **Agents**, **RoleDefinitions**, **Automations**, **Assignments**, **Sessions**, **MergeRequests**, **CIRuns**, **Policy**, and **AuditEvents**.
- A **Task** belongs to zero or one **Plan**; a **Plan** contains many **Tasks**.
- A **Task** may depend on many other **Tasks**; unresolved **Dependencies** block **Readiness**.
- A **Plan** must be **active** before its **Tasks** may become dispatchable.
- A **Document** may be referenced by many **Tasks**, **Plans**, **Assignments**, **MergeRequests**, or **Automations**.
- **Task Progress Record** belongs on the **Task** and may reference the relevant **Assignment** and checkpoint event.
- A **Task Progress Summary** is an on-demand projection of the **Task Progress Record**, not a second source of truth; it should cite or point to the relevant Checkpoints, repair context, remaining work, and other structured details.
- The MVP **Task Progress Record** stores only **Checkpoints** and **Repair Context**; **Task Progress Summary** is generated outside the persisted record on demand.
- An **Automation** creates **Dispatch Intent** or outbound code-first webhook calls; it does not directly start **Sessions**.
- A **Dispatch Intent** may request implementation, review, repair, merge evaluation, or escalation through its action/type and target; those are not separate canonical intent objects unless their ownership, lifecycle, or scheduler behavior diverge later.
- The **Scheduler** resolves exactly one **RoleDefinition**, one **Agent**, and one **Runtime** before execution starts.
- A **RoleDefinition** has exactly one **Role Category**; **Tags** further constrain capability inside that category.
- **Director Agent**, **Worker Agent**, and **Review Agent** are product actor phrases derived from the resolved **Agent** and **RoleDefinition** category; they are not separate persisted actor types.
- **Custom Role Category** is configuration-only; do not introduce a **Custom Agent** product actor phrase until a concrete workflow requires it.
- An **Automation** has one **Default RoleDefinition**, unless a task-specific or one-off **Role Override** supersedes it.
- A **Runtime** belongs to one **Host** or one managed provider path; a **Runtime** may be reused by many **Agents**.
- An **Agent** is bound to exactly one **Runtime** and may execute many **Assignments** over time.
- A **Lease** reserves execution capacity before or during launch; an **Assignment** records the durable execution envelope after dispatch starts.
- A **Lease** may expire or be released without becoming an **Assignment**; an **Assignment** may reference the **Lease** that reserved its capacity.
- An **Assignment** belongs to exactly one **Task** or exactly one **MergeRequest**.
- **Qualified Assignment Phrases** describe why an **Assignment** exists; they are not separate persisted types unless their lifecycle or invariants diverge later.
- An **Assignment** contains one or more **Sessions**; a **Session** belongs to exactly one **Assignment**.
- A **Session** is provider execution only; use **Assignment**, **Task** activity, or **Execution Lineage** for human-visible work grouping.
- A **Session** may emit checkpoint events, but **Checkpoint** content is saved into the **Task Progress Record** rather than owned by the **Session**.
- A **Checkpoint** should be saved when task-resumption context changes; heartbeats, logs, transcripts, and routine session status changes remain Session or Execution Lineage telemetry.
- **Checkpoint** is the canonical domain term; `TaskProgressCheckpoint` is a code/storage-shape type for a Checkpoint enriched with Assignment and Session references.
- A recoverable crash or context exhaustion creates a new **Session** under the same **Assignment**.
- A **Repair Trigger** attaches **Repair Context** and creates a new task-owned **Assignment** on the same **Task** before completion.
- **Repair Context** belongs inside the **Task Progress Record**, but remains distinct from **Checkpoints** because it comes from **Repair Triggers** rather than Session progress snapshots.
- **Follow-Up Context** creates and seeds a **Follow-Up Task** when prior terminal work needs additional action; it does not resume the source **Task** and does not belong to the source **Task Progress Record**.
- A **Follow-Up Task** has exactly one **Follow-Up Source**.
- A **Follow-Up Source** references exactly one prior terminal source **Task**, records one source outcome such as `completed`, `canceled`, or `closed_unmerged`, and may reference one source **MergeRequest**.
- **Follow-Up Source** is provenance and lineage; **Follow-Up Context** is steering context for the new **Follow-Up Task**.
- A **MergeRequest** belongs to exactly one **Task** or exactly one **Plan**.
- A **MergeRequest** may contain many **CIRuns** and many review outcomes over time.
- **CIRuns** are observed from GitHub checks and statuses; Stoneforge does not author native CI in the first slice.
- **Policy** constrains actions by humans, agents, automations, adapters, and the scheduler.
- **Authorization** decides whether an actor may request or perform an action at all; **Policy Evaluation** decides the workflow outcome for an authorized action in its Workspace context.
- A **Policy Preset** supplies defaults rather than locking a Workspace into an immutable mode; specific policy values may override preset defaults.
- **Platform Secrets**, **Org Secrets**, and **Workspace Secrets** are ownership scopes; runtime injection is a use of an allowed secret, not a separate top-level ownership category.
- A **Provider Installation** is the umbrella integration grant; a **GitHub App Installation** is the GitHub-specific Provider Installation used in the first slice.
- Sensitive actions must emit **AuditEvents** with actor, target, outcome, and policy context.
- **Execution Lineage** is the canonical domain term for operator-visible history; "timeline" is UI presentation language unless it gains separate ownership, persistence, and lifecycle.
- An **Audit Trail** is a compliance-focused subset of **Execution Lineage**, not the full operator-visible history.
- **Human Intervention** is the broad operator-action umbrella; a **Human Approval Gate** is only the policy gate where an **Approver** satisfies required approval.
- **Escalation** may create or require **Human Intervention**, but ordinary operator actions, automated **Retry**, automated **Resume**, and task **Repair** are not Escalation unless policy thresholds stop or downgrade autonomous progress.
- **Escalation** is the transition or cause that stops or downgrades autonomous progress; **Task `human_review_required`** is the resulting task state.
- **Cancellation** is the umbrella term across Task, Plan, Dispatch Intent, Assignment, Session, and MergeRequest flows; use qualified phrases such as task cancellation, plan cancellation, or **Session Stop** when layer-specific clarity is needed.
- **Stall** is the observed condition; **Escalation** is the policy response if recovery does not restore acceptable progress.

## Example dialogue

> **Dev:** "A user asks the director to add retry visibility. Should I create an **Assignment** immediately?"
>
> **Domain expert:** "No. First capture the **Engineering Intent** as a **Task**, clarify the **Acceptance Criteria**, and add it to a **Plan** only if it belongs to a coordinated scope."
>
> **Dev:** "Once the **Task** is `ready`, can the **Automation** start a Codex process?"
>
> **Domain expert:** "No. The **Automation** creates **Dispatch Intent** with its **Default RoleDefinition**, unless a **Role Override** supersedes it. The **Scheduler** then resolves the **RoleDefinition**, **Agent**, **Runtime**, and **Lease**, creates the **Assignment**, and starts a **Session**."
>
> **Dev:** "If that **Session** runs out of context, do we require task repair?"
>
> **Domain expert:** "No. A recoverable context limit starts a new **Session** under the same **Assignment** from a **Checkpoint**; the **Task** requires repair only when review, CI, mergeability, policy, or branch health creates a **Repair Trigger**."
>
> **Dev:** "And in GitHub we call the review artifact a PR?"
>
> **Domain expert:** "Yes, but internally it is a **MergeRequest**; the GitHub **PR** is the provider-facing representation, and the **Stoneforge Policy Check** is the canonical merge gate."

## Flagged ambiguities

- "Agent" can mean **Agent**, **Host Agent**, **Director Agent**, **Worker Agent**, **Review Agent**, a role category, or **Session**; use **Agent** only for the dispatchable harness/model/runtime capability, use **Director Agent**, **Worker Agent**, or **Review Agent** for product actor phrases, use **RoleDefinition** or **Role Category** for configuration, and use **Session** for concrete provider execution.
- **Director Agent**, **Worker Agent**, and **Review Agent** should not become duplicated persisted types; persist **Agent**, **RoleDefinition**, **Role Category**, **Assignment**, and **Session**, then derive the product actor phrase from that combination.
- "Custom Agent" is not canonical language; use **Custom Role Category** for configuration and wait for a real product workflow before naming a custom actor phrase.
- "Run" is too overloaded; use **Assignment** for the durable dispatch envelope, **Session** for the concrete provider execution, and **CIRun** for observed CI state.
- "Session" must not describe a human-visible work period, supervision period, or UI grouping; use **Session** only for concrete provider execution, and use **Assignment**, **Task** activity, or **Execution Lineage** for operator-visible grouping.
- "Timeline" is not canonical domain language for now; use **Execution Lineage** for the model and timeline only for UI presentation.
- "Audit Trail" should not replace **Execution Lineage**; it names the compliance slice backed by required **AuditEvents**.
- "Implementation Assignment", "repair Assignment", "review Assignment", and "merge-evaluation Assignment" are acceptable **Qualified Assignment Phrases** in prose, but **Assignment** remains the canonical object.
- "Lease" must not be collapsed into **Assignment** capacity fields; use **Lease** for scheduler reservation and **Assignment** for durable execution history.
- "Review Intent", "Repair Intent", "Merge Evaluation Intent", and "Escalation Intent" are not canonical object names; use **Dispatch Intent** with action/type qualifiers or **Qualified Dispatch Intent Phrases** in prose.
- "PR" is acceptable in GitHub-facing UI and prose, but internal model discussions and code should use **MergeRequest** unless they are inside a GitHub adapter boundary.
- "Parent branch" should not be used as canonical language; use **Workspace Target Branch** for the configured workspace merge target and **Merge Topology** for intermediate branch shapes.
- "Automation" and "Scheduler" must stay separate; **Automation** creates **Dispatch Intent** or outbound code-first webhook calls, while the **Scheduler** owns readiness evaluation, queueing, leasing, placement, retry, resume, and escalation.
- "Runtime", "Host", and "Agent" must stay separate; a **Host** supplies capacity, a **Runtime** defines the execution environment contract, and an **Agent** binds a harness/model pair to a runtime.
- "Role" should not replace **RoleDefinition** or **Role Category**; a **RoleDefinition** is the concrete prompt, tools, skills, hooks, category, and behavioral contract attached at dispatch time, while **Role Category** is only the required broad classification.
- "Ready" must not be treated as a manual flag; **Readiness** is computed from dependencies, plan activation, policy, active execution, and evaluable capability constraints.
- "Document" must not be used as the default place for task progress; reusable context belongs in **Documents**, while Checkpoints, remaining work, and Repair Context belong in the **Task Progress Record**.
- "Task-Local Continuity" is not canonical; use **Task Progress Record** for task-owned resumable progress state.
- "Task Progress Summary" should not become hidden prompt memory or a cached source of truth in the MVP; generate it on demand as an overview that helps agents navigate the structured **Task Progress Record**.
- "Task Progress Record" should not grow a stored summary field in the MVP; add one only if real summary-generation behavior needs persisted cache semantics.
- "Checkpoint" should not describe every heartbeat, log update, transcript entry, or session status change; use **Checkpoint** only for meaningful resumable task progress snapshots.
- "Task Progress Checkpoint" is not separate product language; use **Checkpoint** unless discussing the enriched code/storage shape.
- "Repair Context" should not be collapsed into **Checkpoint**; use **Repair Context** for trigger-driven correction context and **Checkpoint** for session-produced progress snapshots.
- "Reopen" should not describe task correction flows; use **Repair Trigger** and **Repair Context** before terminal states, and use **Follow-Up Context** when new work is created from prior terminal work.
- "Follow-Up Context" should not be stored as source-task progress; use it to create and steer the new **Follow-Up Task**.
- "Follow-Up Source" should not be buried in prose; store lineage as **Follow-Up Source** and guidance as **Follow-Up Context**.
- "Reviewer" can mean a person, product actor, or configuration category; use **Human Reviewer** for people, **Review Agent** for the agent actor, and **Reviewer Role Category** for RoleDefinition classification.
- "Review" and "approval" are distinct; **Review Outcome** evaluates work quality or correctness, while a **Human Approval Gate** satisfies policy.
- "Human intervention" and "human approval" are distinct; use **Human Intervention** for broad operator steering or unblocking, and **Human Approval Gate** only for policy-required approval.
- "Authorization" and "Policy Evaluation" are distinct; do not use actor permission checks as a substitute for workspace workflow policy, and do not use policy gates to imply the actor was authorized.
- "Policy mode" is acceptable casual UI language, but **Policy Preset** is canonical when discussing configuration because preset values can be overridden.
- "Escalation" should not be used for every failure or manual action; reserve **Escalation** for policy-controlled cases where Stoneforge requires human attention because autonomous progress is no longer considered safe or productive.
- "Escalated" should not replace the task state name; use **Task `human_review_required`** for task state and **Escalation** for the transition or cause.
- "Stall" should not be used as the lifecycle response; use **Stall** for the observed lack of progress and **Escalation**, **Retry**, **Resume**, or **Repair** for the response selected by policy.
- "Abort", "stop", and "close" are not canonical lifecycle terms unless a future workflow gives one distinct policy or state-machine meaning; use **Cancellation** and qualified cancellation phrases instead.
- "Session cancellation" is not the preferred phrase; use **Session Stop** for intentionally stopping provider execution inside a **Session**.
- "Changes requested" is broader than the noun **Change Request** in many workflow tools; use **Task `repair_required`** or **MergeRequest `repair_required`** for the state, **Repair Trigger** for the umbrella cause, **Change Request** for reviewer feedback, and **Gate Failure** for CI, mergeability, branch drift, or policy failures.
- "Credentials" should be narrowed to **Secrets** and then to **Platform Secrets**, **Org Secrets**, or **Workspace Secrets** so boundary-specific ownership stays explicit.
- "Workspace-Runtime Secret" is not canonical ownership language; describe runtime injection as a permitted use of a **Workspace Secret** or **Org Secret**.
- "Provider Installation" should be used for the umbrella integration grant; use **GitHub App Installation** only for the GitHub-specific first-slice subtype.
