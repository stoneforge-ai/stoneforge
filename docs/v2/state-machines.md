# Stoneforge V2 State Machines

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for lifecycle semantics in the first Stoneforge V2 slice. It defines semantic states and allowed transitions for the default workflow without freezing database enums, API names, or queue payloads.

## Scope And Status

First-slice scope:

- workspace onboarding and execution readiness
- task readiness, dispatch, execution, review, approval, merge, repair, escalation, and cancellation
- plan activation and plan-level aggregation
- scheduler queueing and leasing
- Assignment and Session checkpoint/resume behavior

Frozen in this doc:

- semantic state names are part of the product model
- readiness is gated by dependencies, plan activation, policy, and active execution
- repair work creates a new Task-owned Assignment on the same Task
- session crash and context-exhaustion recovery create a new Session under the same Assignment when possible
- failure escalation routes work into a human-review-required path instead of infinite autonomous loops

Working assumptions:

- tasks summarize workflow position while Assignments, Sessions, MergeRequests, and CIRuns record execution facts
- MergeRequest and CIRun states may be driven by GitHub observations in the first slice
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

| State | Meaning |
| --- | --- |
| `draft` | workspace record exists but repository integration is not complete |
| `repo_connected` | GitHub App installation and repository linkage are valid |
| `execution_configured` | at least one policy preset, Runtime, Agent, and RoleDefinition path has been configured |
| `ready` | repository integration, policy, and at least one runnable execution path are healthy |
| `degraded` | workspace was previously ready but now lacks a required dependency or healthy execution path |
| `archived` | workspace no longer accepts new work |

Key transitions:

- `draft -> repo_connected`: GitHub App installation succeeds and repository ownership is verified.
- `repo_connected -> execution_configured`: required execution capabilities and policy preset are saved.
- `execution_configured -> ready`: validation confirms at least one dispatchable path exists.
- `ready -> degraded`: repo auth breaks, no eligible execution path remains, or required policy/runtime configuration becomes unhealthy.
- `degraded -> ready`: the missing capability or integration is restored.
- `any nonterminal -> archived`: an authorized human archives the workspace.

## Task Lifecycle

| State | Meaning |
| --- | --- |
| `draft` | task is still being clarified and should not dispatch |
| `planned` | task definition is accepted but not yet dispatchable |
| `ready` | task is eligible for dispatch |
| `leased` | scheduler reserved capacity for an assignment but execution has not fully started yet |
| `in_progress` | at least one live Assignment/Session is executing task work |
| `awaiting_review` | implementation or repair work is complete and review/CI gates are pending |
| `repair_required` | a repair trigger requires repair work |
| `awaiting_human_review` | automated gates passed but policy requires human review or approval |
| `merge_ready` | the task-level MergeRequest satisfies required checks and approval conditions |
| `completed` | task work is finished, including merge when code changes were required |
| `human_review_required` | automated flow stopped and human intervention is required |
| `canceled` | task was explicitly stopped |

Key transitions:

- `draft -> planned`: intent, scope, and acceptance criteria are sufficient to keep the task.
- `planned -> ready`: dependencies are satisfied, plan activation allows execution, no active assignment exists, and policy allows dispatch.
- `ready -> leased`: scheduler grants a lease for a new Task-owned Assignment.
- `leased -> in_progress`: the selected Agent starts a Session and heartbeats confirm execution.
- `leased -> ready`: the lease expires or launch fails before execution starts.
- `in_progress -> awaiting_review`: work completes and a task MergeRequest is opened or updated for review.
- `in_progress -> completed`: non-code task finishes without needing MergeRequest flow.
- `awaiting_review -> repair_required`: agent review, human review, CI, mergeability checks, policy evaluation, or branch health requires repair.
- `repair_required -> ready`: repair context is attached and the task becomes dispatchable again.
- `awaiting_review -> awaiting_human_review`: automated review passes but a human approval gate remains.
- `awaiting_review -> merge_ready`: all required automated gates pass and no human review is required.
- `awaiting_human_review -> merge_ready`: required human approvals are recorded.
- `merge_ready -> completed`: merge succeeds or equivalent completion action is recorded.
- `planned`, `ready`, `leased`, `in_progress`, `awaiting_review`, `repair_required`, `awaiting_human_review`, or `merge_ready -> human_review_required`: repeated failure, stall, no-placement loop, or other escalation threshold is reached.
- `human_review_required -> ready`: a human explicitly reauthorizes continued automated work.
- `human_review_required -> canceled`: a human stops the task.
- `any nonterminal -> canceled`: an authorized human cancels the task.

## Task Readiness Gate

`ready` is not a manual toggle. A task is dispatchable only when all of the following are true:

- task is not `draft`, `completed`, or `canceled`
- there are no unresolved blocking dependencies
- if the task belongs to a Plan, that Plan is `active`
- no active lease or live Assignment already owns the next assignment
- policy allows the next action
- required RoleDefinition and capability constraints can be evaluated

Whenever those conditions move from false to true, Stoneforge should emit a readiness event and transition the task into `ready`.

## Plan Lifecycle

| State | Meaning |
| --- | --- |
| `draft` | plan graph is still being assembled |
| `active` | tasks may dispatch when individually ready |
| `integration_in_review` | plan-level aggregation branch/PR is under review |
| `integration_repair_required` | a plan-level repair trigger requires more task or integration work |
| `completed` | plan work and plan-level merge are complete |
| `canceled` | plan execution is intentionally stopped |

Key transitions:

- `draft -> active`: the plan graph is coherent and an authorized human or director activates it.
- `active -> integration_in_review`: all required planned task work is complete and the plan PR is opened.
- `integration_in_review -> integration_repair_required`: plan-level review, CI, mergeability checks, policy evaluation, or branch health requires more work.
- `integration_repair_required -> active`: the plan returns to active so underlying tasks or integration work can continue.
- `integration_in_review -> completed`: the plan PR merges to the workspace target branch.
- `any nonterminal -> canceled`: an authorized human stops the plan.

Plan repair rule:

- plan-level review or merge evaluation attaches to the plan MergeRequest rather than the Plan itself
- if plan-level feedback requires code changes, repair work must update or create Tasks within the Plan rather than dispatching general coding directly on the Plan

## Dispatch Intent And Lease Lifecycle

This is an internal scheduler lifecycle, not a user-facing planning object.

| State | Meaning |
| --- | --- |
| `created` | a human action or Automation requested scheduler evaluation |
| `queued` | intent is durable and waiting for eligibility or capacity |
| `leased` | scheduler reserved agent/runtime capacity for execution |
| `starting` | launch request has been handed to the host or provider |
| `running` | an Assignment is active and heartbeating |
| `retry_wait` | transient failure occurred and the scheduler will try again later |
| `completed` | the dispatch intent reached a terminal success outcome |
| `escalated` | retry policy stopped autonomous placement or relaunch |
| `canceled` | intent was withdrawn due to cancellation or superseding action |

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

## Assignment Lifecycle

| State | Meaning |
| --- | --- |
| `created` | assignment record exists and owns one dispatch |
| `running` | one Session is live under the Assignment |
| `resume_pending` | prior Session ended unexpectedly and the Assignment is waiting to resume from checkpoint |
| `succeeded` | the assignment completed successfully |
| `escalated` | autonomous recovery stopped and human review is required |
| `canceled` | the assignment was stopped intentionally |

Key transitions:

- `created -> running`: first Session becomes active.
- `running -> resume_pending`: the active Session crashes, disconnects, or exhausts context and the Assignment remains recoverable.
- `resume_pending -> running`: a new Session is started with checkpoint context.
- `running -> succeeded`: the assignment reaches its intended outcome.
- `running` or `resume_pending -> escalated`: recovery thresholds are exceeded or the failure is not considered safe to retry.
- `created`, `running`, or `resume_pending -> canceled`: a human or policy decision stops the Assignment.

## Session Lifecycle

| State | Meaning |
| --- | --- |
| `launching` | provider process or thread is being created |
| `active` | the Session is running and may emit work output |
| `checkpointed` | a resumable handoff snapshot has been persisted |
| `ended` | the Session ended cleanly |
| `crashed` | the Session ended unexpectedly |
| `expired` | the Session hit time, token, or context limits |
| `canceled` | the Session was explicitly stopped |

Key transitions:

- `launching -> active`: provider confirms live execution.
- `active -> checkpointed`: explicit checkpoint capture succeeds after meaningful task-resumption context changes.
- `checkpointed -> active`: execution continues after a checkpoint.
- `active` or `checkpointed -> ended`: session hands off cleanly.
- `active` or `checkpointed -> crashed`: abnormal process or transport failure occurs.
- `active` or `checkpointed -> expired`: configured provider limits are reached.
- `launching`, `active`, or `checkpointed -> canceled`: operator, policy, or task cancellation stops the session.

## Checkpoint And Resume Semantics

- checkpoints summarize completed work, remaining work, and important context needed for continuation
- checkpoints are not heartbeats, logs, transcripts, or routine session status updates
- checkpoint state is stored in the Task Progress Record, with links back to the relevant Assignment and Session
- `crashed` or `expired` Sessions do not automatically create a new Task state
- if the Assignment remains recoverable, Stoneforge moves the Assignment to `resume_pending`, creates a new Session, and returns the owning Task or MergeRequest workflow to its active state
- if the recovery loop repeats beyond policy thresholds, the Assignment and owning workflow escalate to human review

## MergeRequest Lifecycle

| State | Meaning |
| --- | --- |
| `draft` | internal MergeRequest exists but the provider PR is not yet open for normal review |
| `open` | provider PR is open and collecting CI or review signals |
| `repair_required` | a repair trigger requires more work |
| `policy_pending` | technical checks passed but Stoneforge policy approval is still outstanding |
| `merge_ready` | all required checks and approvals are satisfied |
| `merged` | provider PR merged successfully |
| `closed_unmerged` | provider PR closed without merge |

Key transitions:

- `draft -> open`: provider PR is created and visible for review.
- `open -> repair_required`: CI fails, reviewer requests changes, branch drift cannot be resolved safely, policy evaluation fails, or mergeability fails.
- `repair_required -> open`: repair work updates the PR and review restarts.
- `open -> policy_pending`: technical checks pass and only human approval policy remains.
- `open -> merge_ready`: all required checks pass and no human approval is required.
- `policy_pending -> merge_ready`: required human approvals are recorded.
- `merge_ready -> merged`: merge succeeds.
- `any nonterminal -> closed_unmerged`: PR is abandoned or replaced without merge.

## CIRun Lifecycle

| State | Meaning |
| --- | --- |
| `queued` | provider reported that CI work is waiting to start |
| `running` | provider reported active CI execution |
| `passed` | required observed checks succeeded |
| `failed` | one or more required observed checks failed |
| `canceled` | CI execution was canceled |
| `stale` | prior CI result no longer applies to the current PR head |

Key transitions:

- `queued -> running`: provider starts the check suite or job.
- `running -> passed`: required observed checks finish successfully.
- `running -> failed`: one or more observed checks fail.
- `queued` or `running -> canceled`: provider cancels the CI execution.
- `passed` or `failed -> stale`: a new commit makes the old result obsolete.

## Failure Escalation

Failure escalation is a product requirement, not an implementation detail.

Conditions that should route work into `human_review_required` or `escalated` paths:

- repeated `repair_required` loops with the same reason
- repeated CI failure without meaningful progress
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
  -> awaiting_human_review
  -> merge_ready
  -> completed

Assignment created
  -> running
  -> resume_pending
  -> running
  -> succeeded
```
