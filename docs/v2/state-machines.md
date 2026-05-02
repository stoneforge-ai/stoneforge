# Stoneforge V2 State Machines

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for lifecycle semantics in the first Stoneforge V2 slice. It defines semantic states and allowed transitions for the default workflow without freezing database enums, API names, or queue payloads.

## Scope And Status

First-slice scope:

- workspace onboarding and execution readiness
- task readiness, dispatch, execution, review, merge, repair, escalation, and cancellation
- plan activation and plan-level aggregation
- scheduler queueing and leasing
- Assignment and Session checkpoint/resume behavior

Frozen in this doc:

- semantic state names are part of the product model
- readiness is gated by dependencies, plan activation, policy, and active execution
- repair work creates a new Task-owned Assignment on the same Task
- session crash, confirmed host execution loss, and context-exhaustion recovery create a new Session under the same Assignment when possible
- failure escalation routes work into a human-review-required path instead of infinite autonomous loops

Working assumptions:

- tasks summarize workflow position while Assignments, Sessions, MergeRequests, and Verification Runs record execution facts
- MergeRequest and Verification Run states may be driven by GitHub observations in the first slice
- failure thresholds are policy-configurable with conservative defaults

Intentionally not specified yet:

- database enum values
- event bus payloads
- scheduler storage schema
- UI state labels
- provider-specific status mappings beyond the semantic states below

## State Naming Rule

These state names are semantic contracts for product behavior. They are not a requirement that storage, APIs, or adapters use the same strings.

## Workspace Setup Lifecycle

| State                  | Meaning                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `draft`                | workspace record exists but repository integration is not complete                           |
| `repo_connected`       | GitHub App installation and repository linkage are valid                                     |
| `execution_configured` | at least one policy preset, Runtime, Agent, and execution path has been configured, with default RoleDefinitions bootstrapped |
| `ready`                | repository integration, policy, and at least one runnable execution path are healthy         |
| `degraded`             | workspace was previously ready but now lacks a required dependency or healthy execution path |
| `archived`             | workspace no longer accepts new work                                                         |

Key transitions:

- `draft -> repo_connected`: GitHub App installation succeeds and repository ownership is verified.
- `repo_connected -> execution_configured`: required execution capabilities and policy preset are saved.
- `execution_configured -> ready`: validation confirms at least one dispatchable path exists.

Broken or deleted default Director, Worker, or Reviewer RoleDefinitions should
create workflow readiness blockers for the affected workflow category rather
than moving the whole Workspace out of `ready`, as long as repository
connectivity, policy, and at least one execution path remain valid.
- `ready -> degraded`: repo auth breaks, no eligible execution path remains, or required policy/runtime configuration becomes unhealthy.
- `degraded -> ready`: the missing capability or integration is restored.
- `any nonterminal -> archived`: an authorized human archives the workspace.

## Task Lifecycle

| State                   | Meaning                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `draft`                 | task is still being clarified and should not dispatch                                  |
| `planned`               | task definition is accepted but not yet dispatchable                                   |
| `ready`                 | task is eligible for non-repair task dispatch                                          |
| `leased`                | scheduler reserved capacity for an assignment but execution has not fully started yet  |
| `in_progress`           | at least one live Assignment/Session is executing task work                            |
| `awaiting_review`       | implementation or repair work is complete and review or verification gates are pending |
| `repair_required`       | a Repair Trigger and Repair Context have been recorded and the task is eligible for repair dispatch when policy and capacity allow |
| `review_pending`        | automated gates passed but one or more Required Reviews remain                         |
| `merge_ready`           | the task-level MergeRequest satisfies required checks and review conditions            |
| `completed`             | task work is finished, including merge when code changes were required                 |
| `human_review_required` | automated flow stopped and human intervention is required                              |
| `canceled`              | task was explicitly stopped                                                            |

Key transitions:

- `draft -> planned`: intent, scope, and acceptance criteria are sufficient to keep the task.
- `planned -> ready`: dependencies are satisfied, plan activation allows execution, no active assignment exists, no unresolved Repair Context exists, and policy allows non-repair dispatch.
- `ready -> leased`: scheduler grants a lease for a new Task-owned implementation Assignment.
- `leased -> in_progress`: the selected Agent starts a Session and heartbeats confirm execution.
- `leased -> ready`: the lease expires or launch fails before execution starts.
- `in_progress -> awaiting_review`: work completes and a task MergeRequest is opened or updated for review.
- `in_progress -> completed`: non-code task finishes without needing MergeRequest flow.
- `awaiting_review -> repair_required`: agent review, human review, verification, mergeability checks, policy evaluation, or branch health requires repair; this transition records the Repair Trigger and attaches the best available Repair Context while the information is freshest.
- `repair_required -> leased`: scheduler grants a lease for a new Task-owned repair Assignment when policy permits automated repair and no active lease or live Assignment blocks dispatch.
- `leased -> repair_required`: a repair lease expires or launch fails before execution starts and the Repair Context remains unresolved.
- `in_progress -> awaiting_review`: a repair Assignment resolves or supersedes all targeted/remaining Repair Context items and code work is ready for review.
- `in_progress -> completed`: a repair Assignment resolves or supersedes all targeted/remaining Repair Context items and non-code task work is complete.
- `in_progress -> ready`: a repair Assignment resolves or supersedes targeted Repair Context items, no Repair Context remains unresolved or unsafe, and non-repair task work remains.
- `in_progress -> repair_required`: one or more Repair Context items remain unresolved or unsafe, and autonomous retry remains allowed.
- `in_progress -> human_review_required`: one or more Repair Context items are marked unsafe or autonomous repair retry is exhausted.
- `awaiting_review -> review_pending`: automated review passes but a Required Review remains.
- `awaiting_review -> merge_ready`: all required automated gates pass and no Required Review is required.
- `review_pending -> merge_ready`: Required Reviews are satisfied by qualifying Review Approved outcomes.
- `merge_ready -> completed`: merge succeeds or equivalent completion action is recorded.
- `planned`, `ready`, `leased`, `in_progress`, `awaiting_review`, `repair_required`, `review_pending`, or `merge_ready -> human_review_required`: repeated failure, stall, no-placement loop, or other escalation threshold is reached.
- `human_review_required -> ready`: a human explicitly reauthorizes continued automated work.
- `human_review_required -> canceled`: a human stops the task.
- `any nonterminal -> canceled`: an authorized human cancels the task.

## Task Dispatchability Gate

`ready` and `repair_required` are not manual toggles. A task is dispatchable only when all of the following are true:

- task is not `draft`, `completed`, or `canceled`
- there are no unresolved blocking dependencies
- if the task belongs to a Plan, that Plan is `active`
- no active lease or live Assignment already owns the next assignment
- policy allows the next action
- required RoleDefinition and capability constraints can be evaluated
- if unresolved Repair Context exists, the task remains in `repair_required` and the next Task-owned dispatch purpose is repair
- if no unresolved Repair Context exists, the task may enter `ready` for non-repair dispatch

Whenever those conditions move from false to true, Stoneforge should emit a dispatchability event and transition the task to `ready` for non-repair work or keep it in `repair_required` for repair work.

## Repair Context Status Authority

Repair Assignments report outcomes for targeted Repair Context items, but
Stoneforge owns the validated status transition. Agents may propose
`superseded` or `unsafe`; Stoneforge accepts `superseded` only when newer
review, verification, branch-health, or policy facts make the old context
obsolete. Agent-reported `unsafe` is accepted as a safety signal and moves the
task toward `human_review_required` unless policy permits another autonomous
repair attempt. Authorized humans may also mark Repair Context items
`superseded` or `unsafe`, with audit.

Each Repair Context item has a stable ID and immutable provenance. Item content
is append-only; status changes such as `resolved`, `unresolved`, `superseded`,
and `unsafe` are explicit transitions with status history.

Repeated Repair Triggers should update or refresh the same unresolved Repair
Context item when the source and semantic key match. Materially different
sources, such as a new head SHA, different failing Provider Check, new reviewer
Change Request, new branch-health condition, or different required policy
action, create new Repair Context items.

If a new Repair Trigger arrives while a repair Assignment is already running on
the same Task, Stoneforge attaches or deduplicates the Repair Context
immediately, but does not start a second parallel repair Assignment for that
Task by default. Stoneforge interrupts or escalates only when the current repair
direction becomes unsafe or an authorized operator explicitly intervenes.

## Plan Lifecycle

| State                         | Meaning                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `draft`                       | plan graph is still being assembled                                |
| `active`                      | tasks may dispatch when individually ready                         |
| `integration_in_review`       | plan-level aggregation branch/PR is under review                   |
| `integration_repair_required` | a plan-level repair trigger requires more task or integration work |
| `completed`                   | plan work and plan-level merge are complete                        |
| `canceled`                    | plan execution is intentionally stopped                            |

Key transitions:

- `draft -> active`: the plan graph is coherent and an authorized human or director activates it.
- `active -> integration_in_review`: all required planned task work is complete and the plan PR is opened.
- `integration_in_review -> integration_repair_required`: plan-level review, verification, mergeability checks, policy evaluation, or branch health requires more work.
- `integration_repair_required -> active`: the plan returns to active so underlying tasks or integration work can continue.
- `integration_in_review -> completed`: the plan PR merges to the workspace target branch.
- `any nonterminal -> canceled`: an authorized human stops the plan.

Plan repair rule:

- plan-level review or merge evaluation attaches to the plan MergeRequest rather than the Plan itself
- if plan-level feedback requires code changes, repair work must update or create Tasks within the Plan rather than dispatching general coding directly on the Plan

## Dispatch Intent And Lease Lifecycle

This is an internal scheduler lifecycle, not a user-facing planning object.

| State        | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `created`    | a human action or Automation requested scheduler evaluation       |
| `queued`     | intent is durable and waiting for eligibility or capacity         |
| `leased`     | scheduler reserved agent/runtime capacity for execution           |
| `starting`   | launch request has been handed to the host or provider            |
| `running`    | an Assignment is active and heartbeating                          |
| `retry_wait` | transient failure occurred and the scheduler will try again later |
| `completed`  | the dispatch intent reached a terminal success outcome            |
| `escalated`  | retry policy stopped autonomous placement or relaunch             |
| `canceled`   | intent was withdrawn due to cancellation or superseding action    |

Key transitions:

- `created -> queued`: intent is persisted after dedupe and policy precheck.
- `queued -> leased`: readiness and eligible capacity are both present.
- `leased -> starting`: host or provider accepted the launch order.
- `starting -> running`: first heartbeat or provider session identifier arrives.
- `queued -> retry_wait`: no eligible agent, no capacity, or a temporary policy or integration issue exists.
- `leased` or `starting -> retry_wait`: launch failed before a stable Assignment could begin.
- `running -> completed`: associated Assignment finishes successfully.
- `retry_wait -> queued`: retry delay expires and the intent is reevaluated.
- `queued`, `retry_wait`, `leased`, `starting`, or `running -> escalated`: retry or stall thresholds are exceeded.
- `any nonterminal -> canceled`: task, plan, or workspace cancellation invalidates the intent.

## AutomationRun Lifecycle

AutomationRuns record automation trigger evaluation and action execution. They
do not replace Dispatch Intent, Assignment, Session, or provider execution
lifecycles.

| State        | Meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `created`    | run exists and is accepted for evaluation or action                      |
| `blocked`    | policy, eligibility, idempotency, or missing configuration currently prevents action |
| `delivering` | an outbound code-first webhook delivery attempt is in progress           |
| `retry_wait` | transient delivery or action failure occurred and retry is scheduled     |
| `running`    | a long-running code-first workflow was accepted and awaits signed callback completion |
| `succeeded`  | the automation action itself succeeded                                  |
| `failed`     | the automation action reached terminal failure                           |
| `canceled`   | a human or policy decision canceled the AutomationRun                    |

Key transitions:

- `created -> blocked`: policy, eligibility, idempotency, or configuration prevents action for now.
- `blocked -> created`: blocking facts change and Workspace policy allows the run to be continued or re-evaluated.
- `created -> succeeded`: an agent-based automation creates Dispatch Intent, or platform code-first work completes synchronously.
- `created -> delivering`: an outbound code-first webhook delivery begins.
- `delivering -> running`: the outbound handler returns a typed accepted/async response, such as `202` with `{ "status": "accepted" }`.
- `delivering -> succeeded`: the outbound handler returns a typed synchronous success response, such as `200` with `{ "status": "succeeded" }`.
- `delivering -> failed`: the outbound handler returns a typed synchronous failure response, such as `200` with `{ "status": "failed" }`.
- `delivering -> retry_wait`: delivery returns `408`, `429`, or `5xx`, and retry policy allows another attempt.
- `retry_wait -> delivering`: retry delay expires and delivery is attempted again.
- `running -> succeeded`: a signed completion callback is authenticated, idempotently accepted, and durably recorded as success.
- `running -> failed`: a signed completion callback is authenticated, idempotently accepted, and durably recorded as failure.
- `created`, `delivering`, `retry_wait`, or `running -> failed`: non-retryable error, non-retryable outbound response such as `4xx` other than `408` or `429`, or retry exhaustion.
- `any nonterminal -> canceled`: authorized cancellation or parent cancellation propagates.
- any terminal state -> new linked AutomationRun: authorized manual re-run creates a new AutomationRun linked to the original rather than mutating the old run.
- manual re-run defaults to replaying the original trigger context exactly; run-with-edited-inputs creates a new manual AutomationRun with the input diff recorded.

Successful AutomationRuns record action-specific results and linked follow-up
objects. Dispatch Intent creation, webhook acknowledgement, provider facts, or
workflow updates are results, not separate success states.

Completion callbacks finalize AutomationRuns only. They may report `succeeded`
or `failed`, bounded result metadata, linked objects, and error details. They
are not a general workflow mutation surface; user-defined code-first automation
uses the Stoneforge API for workflow actions.

Blocked-run re-evaluation is policy-controlled. The first-slice policy modes
are: re-evaluate platform and non-external user-defined automations only,
re-evaluate all automations, or re-evaluate none. The default re-evaluates
platform automations and non-external user-defined automations, but not
externally triggered automations.

Stoneforge does not poll external status endpoints for first-slice
AutomationRun completion. Callback receipt returns 200 only after the callback
is authenticated, idempotently accepted, and durably recorded, so the external
handler can safely retry missed or failed callbacks.

Outbound automation webhook delivery uses exponential backoff with a bounded
retry count. `2xx` is delivery success, `408`, `429`, and `5xx` are retryable,
and other `4xx` responses are terminal failures.

Outbound handler responses use an explicit typed response contract, not
status-code inference alone. Stoneforge should provide a small package or SDK
with helper functions for accepted, succeeded, and failed responses.

## Assignment Lifecycle

| State            | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `created`        | assignment record exists and owns one dispatch                                           |
| `running`        | the Assignment has a current usable Session or execution attempt                         |
| `resume_pending` | the Assignment remains recoverable but has no usable current Session and is waiting for continuation or replacement from checkpoint |
| `succeeded`      | the assignment completed successfully                                                    |
| `repair_triggered` | the Assignment ended because it recorded or encountered a Repair Trigger that must continue through a new repair Assignment on the same Task |
| `escalated`      | autonomous recovery stopped and human review is required                                 |
| `canceled`       | the assignment was stopped intentionally                                                 |

Key transitions:

- `created -> running`: first Session becomes active.
- `running -> resume_pending`: the active Session crashes, is confirmed lost after contact-loss reconciliation, or exhausts context and the Assignment remains recoverable.
- `resume_pending -> running`: a new Session is started with checkpoint context.
- `running -> succeeded`: the assignment reaches its intended outcome.
- `running -> repair_triggered`: the assignment records or encounters a Repair Trigger and the owning Task enters `repair_required`.
- `running` or `resume_pending -> escalated`: recovery thresholds are exceeded or the failure is not considered safe to retry.
- `created`, `running`, or `resume_pending -> canceled`: a human or policy decision stops the Assignment.

## Session Lifecycle

| State          | Meaning                                         |
| -------------- | ----------------------------------------------- |
| `launching`    | provider execution context is being created or connected |
| `active`       | the Session is usable for provider execution or continuation |
| `contact_lost` | a connectionful adapter lost contact and execution state is not yet known |
| `checkpointed` | a resumable handoff snapshot has been persisted |
| `ended`        | the Session ended cleanly                       |
| `crashed`      | the Session ended unexpectedly                  |
| `expired`      | the Session hit time, token, or context limits  |
| `canceled`     | the Session was explicitly stopped              |

Key transitions:

- `launching -> active`: provider confirms live execution.
- `active -> checkpointed`: explicit checkpoint capture succeeds after meaningful task-resumption context changes.
- `checkpointed -> active`: execution continues after a checkpoint.
- `active` or `checkpointed -> contact_lost`: for connectionful adapters, Host or provider contact is lost and Stoneforge cannot yet determine whether the execution context is still usable.
- `contact_lost -> active`: reconnect reconciliation confirms the same Session is still healthy.
- `contact_lost -> crashed`: reconnect reconciliation or timeout confirms the Session stopped unexpectedly or can no longer be observed safely.
- while `contact_lost`, Stoneforge pauses operator steering and autonomous prompts/commands for the owning Assignment.
- `active` or `checkpointed -> ended`: session hands off cleanly.
- `active` or `checkpointed -> crashed`: abnormal process or transport failure occurs.
- `active` or `checkpointed -> expired`: configured provider limits are reached.
- `launching`, `active`, or `checkpointed -> canceled`: operator, policy, or task cancellation stops the session.

## Checkpoint And Resume Semantics

- checkpoints are bounded restart-context updates for todo or Acceptance Criteria status, with optional short notes, key files, and key insights
- checkpoint updates are submitted through the broader Stoneforge agent CLI/tool surface, not a checkpoint-specific tool; the action validates input immediately and reports actionable errors to the agent
- implementing agents may add small task-local todo items through checkpoint updates, but must not add or change Acceptance Criteria
- checkpoints are not heartbeats, logs, transcripts, or routine session status updates
- checkpoint state is stored in the Task Progress Record, with links back to the relevant Assignment and Session
- Task Progress Records store structured Checkpoints and Repair Context, not full provider transcripts
- full transcripts remain Session or Execution Lineage records with separate redaction and retention policy
- Checkpoint and Repair Context redaction is optional in the first slice unless it can reuse transcript/log redaction simply
- `crashed` or `expired` Sessions do not automatically create a new Task state
- if the Assignment remains recoverable, Stoneforge moves the Assignment to `resume_pending`, creates a new Session, and returns the owning Task or MergeRequest workflow to its active state
- if the recovery loop repeats beyond policy thresholds, the Assignment and owning workflow escalate to human review

## MergeRequest Lifecycle

| State             | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `draft`           | internal MergeRequest exists but the provider PR is not yet open for normal review |
| `open`            | provider PR is open and collecting verification or review signals                  |
| `repair_required` | a repair trigger requires more work                                                |
| `policy_pending`  | technical checks passed but Stoneforge policy-required review is still outstanding |
| `merge_ready`     | all required checks, Required Reviews, and mergeability conditions are satisfied   |
| `merged`          | provider PR merged successfully                                                    |
| `closed_unmerged` | provider PR closed without merge                                                   |

Key transitions:

- `draft -> open`: provider PR is created and visible for review.
- `open -> repair_required`: verification fails, reviewer requests changes, Branch Health fails, policy evaluation fails, or Mergeability fails.
- `repair_required -> open`: repair work updates the PR and review restarts.
- `open -> policy_pending`: technical checks and mergeability pass and only a Required Review remains.
- `open -> merge_ready`: all required checks and mergeability pass and no Required Review is required.
- `policy_pending -> merge_ready`: Required Reviews are satisfied by qualifying Review Approved outcomes.
- `merge_ready -> merged`: merge succeeds.
- `any nonterminal -> closed_unmerged`: PR is abandoned or replaced without merge.

## Verification Run Lifecycle

| State      | Meaning                                                         |
| ---------- | --------------------------------------------------------------- |
| `queued`   | at least one Provider Check is waiting to start                 |
| `running`  | at least one Provider Check is actively running                 |
| `passed`   | all required Provider Checks succeeded                          |
| `failed`   | one or more required Provider Checks failed                     |
| `canceled` | verification was canceled by the provider                       |
| `stale`    | prior Verification Run no longer applies to the current PR head |

Key transitions:

- `queued -> running`: provider starts one or more checks.
- `running -> passed`: required Provider Checks finish with explicit provider
  success by default: GitHub check-run `success` or commit status `success`.
- `running -> failed`: one or more required Provider Checks fail. A terminal
  failing required Provider Check automatically creates a Repair Trigger for the
  source Task or Plan MergeRequest, with Repair Context containing the failing
  check name, head SHA, provider URL and log summary when available, and whether
  this is a first or repeated failure.
- `queued` or `running -> canceled`: provider cancels verification.
- `passed` or `failed -> stale`: a new commit makes the old result obsolete.

Review Agent dispatch waits for required Provider Checks to pass or fail by
default. Failed required checks trigger repair before Review Agent dispatch; a
missing required-check policy blocker suppresses Review Agent dispatch. Policy
may allow early Review Agent dispatch before required verification completes.
Review Agent outcomes are posted back to GitHub as PR reviews while remaining
canonical Stoneforge Review Outcomes. Review Approved maps to a GitHub approve
review, and Change Request maps to a GitHub request-changes review.
Review Agent GitHub PR reviews may satisfy GitHub-side required review rules
when accepted by GitHub branch protection/rulesets. Unmet human, CODEOWNER,
team, or latest-push eligible reviewer requirements are provider-side merge
blockers.
Human Review Outcomes recorded in Stoneforge are posted back to GitHub as PR
reviews only through the Human Reviewer's linked eligible GitHub OAuth identity.
Without that identity, the review remains context only and does not satisfy
GitHub-side or Stoneforge Required Human Review for that repo. Stoneforge should
not imply that the GitHub App can impersonate a human reviewer.
GitHub OAuth linking for humans is just-in-time rather than a Workspace
onboarding blocker. When a human attempts a review or merge action requiring
GitHub attribution, Stoneforge prompts OAuth linking and returns them to the
action.
Human Review Approved outcomes may be recorded while required Provider Checks
are pending by default, but they do not satisfy merge readiness until
policy-required verification and other gates pass. Policy may require
verification before recording or counting them.
Required Review freshness follows GitHub-compatible semantics in the first slice.
For GitHub-backed Workspaces, GitHub branch protection/rulesets are the source of
truth for stale-approval dismissal and most-recent-reviewable-push requirements.
Stoneforge may cache and display those settings, but should not allow conflicting
local overrides for GitHub-backed repos in the first slice. Local and non-GitHub
modes may use equivalent Workspace policy settings. When stale-approval
dismissal is enabled, a diff-changing push or merge-base change after a Review
Approved outcome makes that approval stale for Required Review satisfaction while
preserving it in history. When most-recent-reviewable-push policy applies, merge
readiness requires a qualifying approval after the latest reviewable push by
someone other than the pusher.
GitHub branch protection/ruleset changes while a MergeRequest is open are
merge-readiness input changes. Stoneforge refreshes or observes provider
settings, re-evaluates Required Review satisfaction, and republishes
`stoneforge/policy` if the decision changes. These changes do not create repair
work because they are not code defects.
The first slice refreshes GitHub branch protection/ruleset settings during PR
observation and merge evaluation rather than continuously monitoring them. The UI
shows last observed settings and refresh time, with a manual refresh action when
needed.
Stoneforge imports enough GitHub review, reviewer identity, and branch
protection/ruleset data to decide Required Review satisfaction, without fully
mirroring GitHub reviewer requests, CODEOWNERS assignment, or team notification
workflows beyond useful context.

Failed optional Provider Checks do not move the Verification Run to `failed`,
create Repair Triggers, or block merge by default, but they are reported to a
Director Agent for triage. They remain provider context for the MergeRequest
unless Workspace policy marks the check required.
Review Agent dispatch does not wait for optional-provider-check Director triage.
Optional triage runs in parallel and adds reviewer context to the MergeRequest
when available.
Optional-provider-check Director triage is grouped per MergeRequest head SHA:
multiple optional failures on the same head create or update one unresolved
triage dispatch, while a new head SHA starts a new triage group.
Optional-provider-check Director triage outcomes are non-blocking: no-op with
rationale, add reviewer context, or create non-blocking follow-up Tasks.
Reviewer context from optional-provider-check Director triage is persisted as
first-class MergeRequest reviewer context with provenance to the Director
Assignment/Session and failed optional Provider Checks.
Optional-provider-check reviewer context is Stoneforge-only by default: visible
in the Stoneforge MergeRequest review UI and supplied to Review Agents and human
reviewers without posting GitHub comments by default.

Pending, running, missing, or stale Provider Check observations keep Verification
pending or stale. Terminal non-success states fail required checks. `neutral` and
`skipped` do not satisfy required checks by default, but Workspace policy may
allow either for specific check names.

Missing required Provider Checks start as pending while the PR/check observation
window is fresh. The observation window is controlled by a Workspace policy value
such as `requiredProviderCheckMissingTimeoutMinutes`, defaulting to 10 minutes
after PR head observation. After that timeout, or immediately after GitHub
reports that all current checks are complete and the required check is still
missing, a missing required check becomes a policy blocker rather than a Repair
Trigger.

The `stoneforge/policy` check/status remains pending during the fresh
missing-check observation window, then is republished as failing with a clear
missing-check reason once the policy blocker is confirmed.

## Failure Escalation

Failure escalation is a product requirement, not an implementation detail.

Conditions that should route work into `human_review_required` or `escalated` paths:

- repeated `repair_required` loops with the same reason
- repeated verification failure without meaningful progress
- repeated Session crashes or expirations
- no eligible Agent or exhausted concurrency beyond policy thresholds
- host disconnect or provider instability that repeatedly prevents execution
- stalled work with no heartbeat or no meaningful progress
- merge conflicts or branch drift that the system cannot resolve safely

The first slice should ship with configurable default thresholds rather than hard-coded universal limits.

## Cancellation Semantics

- canceling a Task cancels active dispatch intent, active Assignments, and active Sessions for that Task
- canceling a Plan blocks further planned-task dispatch and cancels plan-level aggregation flow
- canceling a Session does not implicitly cancel the owning Task or MergeRequest if the Assignment can still be retried or resumed by policy
- canceling a MergeRequest does not automatically cancel the Task unless policy or a human explicitly does so

## Intent Example

Intent example only. This is not final implementation code.

```text
Task planned
  -> ready
  -> leased
  -> in_progress
  -> awaiting_review
  -> repair_required
  -> ready
  -> leased
  -> in_progress
  -> awaiting_review
  -> review_pending
  -> merge_ready
  -> completed

Assignment created
  -> running
  -> resume_pending
  -> running
  -> succeeded
```
