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
- [control-plane.md](control-plane.md)
- [state-machines.md](state-machines.md)
- [runtime-architecture.md](runtime-architecture.md)
- [policy-auth-audit.md](policy-auth-audit.md)
- [integrations-and-first-slice.md](integrations-and-first-slice.md)
- [typescript-type-driven-apis.md](../engineering/typescript-type-driven-apis.md)
- [effect-typescript.md](../engineering/effect-typescript.md)

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
- run review loops
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

How do we reliably run a multi-step engineering workflow where intent, task decomposition, execution, progress tracking, review, verification, merge flow, and recovery all remain understandable and governable?

## The Primary Workflow We Are Building Around

This is the expected default workflow for the platform.

### Before work starts: the workspace defines execution capabilities

Before a user asks a Director Agent to scope work, the workspace needs the execution capabilities that Stoneforge can dispatch against.

The workspace should define:

- runtimes
- agents
- role definitions

Stoneforge should bootstrap default RoleDefinitions for Director, Worker, and
Reviewer workflows when a Workspace is created. Those defaults make the golden
path usable without manual role-authoring, while still allowing authorized
workspace users to modify or delete them later.

RoleDefinitions should be editable Workspace objects with simple version and
history tracking. Authorized users may modify, disable, delete, or create
RoleDefinitions. Assignments should snapshot or reference the RoleDefinition
version they started with so later edits do not rewrite historical execution.

This separation matters.

A runtime defines where and how agent work can execute. An agent defines which harness and model can run on a runtime. A role definition defines what job that agent session is being asked to perform.

Because those are separate concepts:

- the same runtime can be reused across multiple agents
- multiple runtimes can exist in one workspace at the same time
- the same agent can be reused with different role definitions
- Director Agent, Worker Agent, Review Agent, and specialized automation sessions can use the same underlying Agent differently
- scheduler decisions can consider runtime capacity, agent concurrency, role requirements, policy, and tags independently

Agents and role definitions should both support tags so tasks and automations can target a specific group of eligible agents or roles.

### 1. Engineering intent enters Stoneforge

The user has an idea, request, or plan for a codebase, or a GitHub Issue enters
the Workspace as an intent source. Examples:

- new feature
- bug fix
- refactor
- simplification
- code-quality cleanup
- documentation update

That intent may be rough and newly formed, externally reported through GitHub
Issues, or already fleshed out by a team and ready for implementation.

In the first slice, GitHub Issue import/sync is required. However, a GitHub
Issue is not automatically the same thing as a dispatchable Stoneforge Task.
Workspace policy decides whether an Issue is ignored, imported as intent,
queued for Director triage, converted to a Draft Task, or promoted into a
dispatchable Task for trusted authors, teams, labels, milestones, or
repositories.

Issue intake defaults depend on the Workspace policy preset. Stoneforge keeps
the first-slice preset set simple: `autopilot` and `supervised`. Autopilot
defaults to import/sync plus Director triage. Supervised defaults to importing
Issues as non-dispatchable draft Tasks, which may be shown in backlog or intake
UI. `backlog` is not a separate canonical Task state in the first slice; it is
UI/product grouping language for work that is not ready to dispatch. Draft or
otherwise non-dispatchable Tasks cannot become ready for dispatch unless a
human changes their status or instructs a Director to triage them.

Trusted maintainers may use reserved labels to override the normal intake path:
`stoneforge:auto-dispatch` may promote an imported Issue directly to a ready
Task, and `stoneforge:auto-triage` may send it directly to Director triage. A
separate policy can disable trusted-maintainer label overrides; by default that
override-prevention policy is off for all presets.

Reserved `stoneforge:*` labels are set directly on GitHub Issues, but
Stoneforge honors their intake effects only when the actor who applied the label
is a linked trusted maintainer with sufficient GitHub-backed repository
permission. Labels applied by unlinked users, external contributors, or actors
without sufficient permission remain visible provider facts, but Stoneforge
ignores them for intake automation.

When Stoneforge ignores a `stoneforge:*` label, it should show a quiet warning
on the imported Issue or Task intake record and record workflow/audit lineage.
It should not post a public GitHub comment by default. Workspaces may optionally
enable maintainer-only notifications.

Externally created Issues should default to imported non-dispatchable draft
state and carry a clear external-origin indicator in backlog/intake UI and
Director triage context. A separate Imported Issue Triage Approval policy
controls whether no Issues, only externally created Issues, or all Issues
require human approval before Director triage. The defaults are no Issues for
autopilot and externally created Issues for supervised.

When enabled by policy, linked Stoneforge Tasks may create or update GitHub
Issues, and linked GitHub Issues may update Stoneforge intent or task metadata.
This sync is bidirectional without requiring a strict one-Issue-to-one-Task
mapping.

Minimum first-slice Issue sync should capture title, body, author, labels,
assignees, milestone, open or closed state, URL and number, timestamps, and
comments needed for Director triage. Stoneforge should write back a linked-task
comment or status comment, and may update labels or status when policy enables
that. GitHub PR review comments and top-level PR comments should be visible
enough in Stoneforge to support review and repair context. Field-perfect
bidirectional sync, GitHub Projects sync, issue forms/schema mapping, full
bidirectional comment sync, threaded resolution parity, perfect comment
editing/deletion sync, and complex conflict resolution are out of scope.

PRs created from linked Stoneforge Tasks should reference the primary linked
Issue and any relevant secondary Issues. A task PR may use issue-closing
keywords only when the linked Issue has exactly one linked Task. When a GitHub
Issue decomposes into multiple Stoneforge Tasks, task PRs should use
non-closing references and the plan PR should link back to the source Issue for
plan-level closure.

When policy enables label writeback, Stoneforge may manage reserved labels on
ingested Issues, such as `stoneforge:status:backlog`,
`stoneforge:status:todo`, `stoneforge:status:in-progress`,
`stoneforge:status:review`, `stoneforge:status:done`,
`stoneforge:priority:{priority}`, and
`stoneforge:complexity:{complexity}`. These labels mirror Stoneforge state for
GitHub visibility; Stoneforge remains the workflow source of truth. Status,
priority, and complexity labels are Stoneforge-owned projections in the first
slice, not GitHub-side commands. If edited directly on GitHub, Stoneforge should
reconcile them back or surface a quiet conflict rather than treating GitHub
labels as a second workflow source of truth.

### 2. A Director Agent clarifies the request

A human or GitHub Issue intake flow provides intent to a Director Agent.

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

### 7. Worker Agent sessions execute with checkpointed progress

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

Stoneforge documents are the durable shared context layer for the workspace. Task progress such as checkpoints, remaining work, and review-driven repair context should live on the task itself as structured state.

Hidden prompt state is not the memory model.

### 8. Completed task work opens a task PR

> This brief uses `PR` as the default term because the first slice is GitHub-first. Internally, Stoneforge should still model this as a provider-neutral review and merge artifact called a Merge Request.

When a code-changing Task is completed, Stoneforge automatically creates a PR
for that task branch.

This task PR is where Verification Run observation and review usually begin.

### 9. Reviewers evaluate the PR

When a PR is created, Stoneforge can automatically assign a Review Agent.
Depending on policy, one or more Human Reviewers may also be required.

This is typically driven by automation on PR creation.

By default, Review Agent dispatch should wait for required Provider Checks to
pass or fail. If required checks fail, repair triggers before Review Agent
dispatch. If a missing required check becomes a policy blocker, Review Agent
dispatch should not run because merge is blocked by configuration. Policy may
allow early Review Agent dispatch before required verification completes, but
the default should conserve review work and include required verification
results as review context. If no required Provider Checks are configured, review
can dispatch once the MergeRequest is open and diff/context is ready.

Review Agent dispatch should not wait for optional-provider-check Director
triage. Optional-check triage runs in parallel; if it finishes first, its
reviewer context is included in the initial review context. If it finishes
later, the context is added to the MergeRequest for human review or a subsequent
or re-run Review Agent.

The Review Agent may:

- approve the PR
- request changes

Human Review Outcomes recorded in Stoneforge should be posted back to GitHub as
PR reviews only through the Human Reviewer's linked eligible GitHub OAuth
identity. Human Review Approved maps to a GitHub approve review and Human Change
Request maps to a GitHub request-changes review. Without an eligible linked
GitHub OAuth identity, the Stoneforge review may be recorded as context but does
not satisfy GitHub-side or Stoneforge Required Human Review for that repo.
Stoneforge should not imply that the GitHub App can impersonate a human
reviewer.
GitHub OAuth linking for humans should be just-in-time, not a Workspace
onboarding blocker. Workspace onboarding may install the GitHub App and connect
repositories without every human linking OAuth. When a human attempts a review
or merge action that must be attributed to them in GitHub, Stoneforge prompts
them to link GitHub OAuth and then returns them to the action.

Review Agent outcomes should be posted back to GitHub as PR reviews while
remaining canonical Stoneforge Review Outcomes. Review Approved maps to a GitHub
approve review and Change Request maps to a GitHub request-changes review, with
the provider review linked back to the Stoneforge Review Outcome, Assignment,
and Session.
Review Agent GitHub PR reviews may satisfy GitHub-side required review rules
when GitHub branch protection/rulesets accept the GitHub App or bot review.
Stoneforge policy remains canonical for Stoneforge merge readiness. If GitHub
requires a human, CODEOWNER, team, or latest-push eligible reviewer that the
Review Agent cannot satisfy, Stoneforge should show that as a provider-side
merge blocker rather than treating the agent review as sufficient.

Reasons to request changes include:

- failing Verification Runs or tests
- unmet acceptance criteria
- merge conflicts
- branch drift that cannot be fast-forwarded cleanly
- obvious correctness or quality problems

Workspaces may disable agent review. In those workspaces, review outcomes may depend only on Verification Runs and/or humans.

### 10. Repair triggers require task repair

If a change request or other repair trigger occurs before task completion:

- the task enters a repair-required path
- the repair context is attached as task context
- the task is dispatched to a new task-owned repair Assignment and Session

This creates a repair loop that stays attached to the same planning and execution history.

### 11. Optional approval and QA

Some workspaces require one or more humans or agents to provide qualifying
Review Approved outcomes before merge.

Others may skip Required Reviews entirely depending on policy.

When approval is required:

- the relevant Reviewers should be notified
- they can review the PR
- Human Review Approved outcomes may be recorded while required Provider Checks
  are pending by default, but they do not satisfy merge readiness until
  policy-required verification and other gates pass
- policy may optionally require verification before a Human Review Approved
  outcome may be recorded or counted
- they may manually QA the branch using the preview experience if one exists
- they may record Review Approved or request changes

Required Review freshness should follow GitHub-compatible semantics in the first
slice. For GitHub-backed Workspaces, GitHub branch protection/rulesets are the
source of truth for stale-approval dismissal and most-recent-reviewable-push
requirements. Stoneforge may cache and display the observed settings, but should
not allow conflicting local overrides for GitHub-backed repos in the first
slice. Local and non-GitHub modes may use equivalent Workspace policy settings.
When stale-approval dismissal is enabled, a diff-changing push or merge-base
change after a Review Approved outcome makes that approval stale for Required
Review satisfaction while preserving it in history. When stale-approval
dismissal is not enabled, prior approvals may remain eligible across later
commits unless a most-recent-reviewable-push rule requires approval after the
latest reviewable push by someone other than the pusher.
If GitHub branch protection or rulesets change while a MergeRequest is open,
Stoneforge should treat that as a merge-readiness input change. It should
refresh or observe the provider settings, re-evaluate Required Review
satisfaction, and republish `stoneforge/policy` if the decision changes. This
does not create repair work because it is a policy/merge-readiness change, not a
code defect.
The first slice should refresh GitHub branch protection/ruleset settings during
PR observation and merge evaluation rather than continuously monitoring them. The
UI should show the last observed settings and refresh time, with a manual
refresh action when needed.
Stoneforge should import enough GitHub review, reviewer identity, and branch
protection/ruleset data to decide Required Review satisfaction. It should not
attempt to fully mirror GitHub's reviewer request UI, CODEOWNERS assignment
behavior, or team notification workflow beyond displaying useful context.

Review Approved is the approval event in Stoneforge. Required Reviews determine
which Review Approved outcomes qualify for merge or another sensitive action.
There is no separate Approver role and no separate approval record.

Human approval does not have to wait for agent review or Verification Runs by
default. Policy may require agent review, passing Verification Runs, or other
conditions before a Review Approved outcome can be recorded or before it can
satisfy merge readiness, but those ordering constraints are policy choices.

While reviewing, humans may also need to:

- inspect prior agent sessions
- send messages to active sessions
- resume past sessions
- inspect complex logic in the in-platform code view
- optionally make edits themselves and commit them

This is where editing exists in the product:

as a human intervention and inspection surface inside a broader orchestration workflow.

That is very different from making the whole product fundamentally an editor.

### 12. Required review leads to merge

When the required review path is satisfied, the PR is automatically merged to its target branch.

As part of that merge logic:

- the branch may be automatically fast-forwarded if possible
- if it cannot be cleanly updated, changes are requested instead of forcing an unsafe merge

### 13. Optional plan aggregation flow

Some workspaces may choose to aggregate tasks under a plan branch and plan PR before merging to the workspace target branch.

In that model:

- each completed code-changing Task creates a task PR
- task PRs merge into the plan branch
- the plan PR exists as the plan-level integration MergeRequest and remains draft/not-ready while required Tasks are still incomplete
- when all required Tasks are complete and merged into the plan branch, Stoneforge updates the plan PR from draft to active/ready-for-review
- required review logic then repeats at the plan level through Review Agents and any policy-required Human Reviews

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
- review loops can still happen without always-on automation

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
- repeated verification failure without meaningful progress
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
- it should carry structured operational progress such as checkpoints, remaining work, and repair context
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
- Verification Run

This separation matters because planning intent and execution reality are different things.

### Document

Documents are the durable context layer for the workspace.

They hold things like:

- specs
- runbooks
- design context
- cross-task reference material
- review notes worth preserving beyond a single task loop

Documents should not require a separate visible document per task just to track progress. The Task Progress Record belongs on the task itself as structured state.

In the first slice, Documents should support create, view, edit, version
history, title, workspace-relative document path or filename, body/content,
content type, category/tags, creator/editor attribution, explicit linking to
workflow objects, Workspace-policy visibility, and explicit selection as agent
context. They should not become a full
collaborative document suite with
real-time coauthoring, rich redlines, or document-specific permissions beyond
Workspace policy.

Documents should be organized into at least two first-slice libraries: a
standard Workspace documentation library rooted at the Documentation Directory,
and a separate system-managed operational docs library for Stoneforge-maintained
operational Documents.

The Documents UI should show the Workspace Documentation Library by default and
expose the Operational Docs Library through a clear library selector or filter,
such as "Operational/System." Operational docs should be visible but separated,
not hidden behind a deep admin-only path.

Operational Docs Library Documents should default to Stoneforge-only source mode
in the first slice. They are Stoneforge operational metadata, not team
documentation intended to live in the repository docs root. Later slices may
allow export or repo-backed operational docs, but the first slice should avoid
polluting repository docs and creating unnecessary PR churn.

Document visibility and access should inherit Workspace policy in the first
slice. Document-specific ACLs are out of scope. Sensitive operational knowledge
that requires different access belongs in a separate Workspace or behind future
document-level controls, not an ad hoc first-slice exception.

The first-slice editable document format should be Markdown/plain text, with
URL/reference documents for external resources. Rich binary uploads, rendered
PDF management, Google Docs import, and complex block editors are out of scope
unless the approved UI prototype requires them.

URL/reference Documents may participate in the Documentation Directory and
Level 2/Level 3 Documentation Methodology like other Documents, but their
Stoneforge content should be metadata plus optional human- or agent-written
summaries and notes. The first slice should not automatically crawl or ingest
arbitrary external pages by default. Agents may open referenced URLs only when
their RoleDefinition and tool access allow it, and durable knowledge learned
from an external source should be summarized into a normal Document when it
matters long term.

External knowledge should become a normal Markdown Document when the team will
rely on that knowledge without always revisiting the external source. That
Document should include the summary, rationale, and source link. Use a
URL/reference Document when the external page itself remains the thing to
consult and Stoneforge only needs a pointer plus notes.

Documents may be Stoneforge-only, repo-backed, or mirrored according to
Workspace policy. The default for a Workspace linked to a repository should be
mirrored docs, with the repository docs folder selected during repository
onboarding. Stoneforge Documents are the Workspace context surface used by
agents and UI. Repository docs files are source-controlled artifacts when the
team wants durable docs in Git. For repo-backed or mirrored docs, docs-drift PRs
change repository files, and Stoneforge updates or reindexes corresponding
Document objects from the merged source.

Document version history should be source-mode aware. Stoneforge-only Documents
need Stoneforge-owned content version history. Repo-backed and mirrored
Documents derive content history from Git commits and PRs, while Stoneforge
still records indexing events, metadata changes, category/tag changes,
link-resolution changes, and agent-context selection events.

Repository onboarding should auto-detect common documentation paths such as
`docs/`, `documentation/`, `.github/`, and root Markdown docs, then ask the user
to confirm or choose one primary docs root. If no docs folder exists, onboarding
should offer to create `docs/` with the Documentation Directory. Multiple docs
roots are out of scope for the first slice.

In mirrored mode, repository PR merge is the authoritative write path.
Stoneforge UI edits should create a new docs PR or add a commit to an existing
docs PR, then import into the mirrored Document object only after merge. The
Documents UI may let users show or hide pending PR changes, or select a
branch/docs PR context to view and edit Documents with pending changes.
Conflicting pending changes should resolve through normal source-control merge
conflict handling rather than a separate document conflict system.

Documents should use one canonical internal linking method across all source
modes: normal relative Markdown file links. In mirrored or repo-backed modes
these resolve to files under the primary docs root; in Stoneforge-only mode they
resolve through the Document's workspace-relative document path or filename. The
Documents UI should make these links clickable and may offer autocomplete or
link insertion, but users should not need to hand-author Stoneforge IDs or
slugs.

Document organization should stay lightweight in the first slice. A Document may
have one optional primary system category, such as `spec`, `runbook`, `design`,
`decision`, `review-note`, or `reference`, plus many freeform Workspace-scoped
tags. Categories and tags support UI organization and search facets; nested
category trees are out of scope.

Document search should support keyword/full-text search across title and body,
with filters for category, tags, content type, linked workflow object,
creator/editor, and updated time. Search results should make linked Documents
easy to traverse. Ranking should use BM25 in both supported database modes:
SQLite through its native full-text search path and Postgres through the
`pg_textsearch` extension. Semantic or vector search is out of scope for the
first slice unless it becomes trivial without distracting from core workflow
search.

Search should not be the only Document discovery path. Each Workspace should
maintain a top-level Documentation Directory Document that acts as the table of
contents for reusable workspace knowledge. It should link to Level 2 entry point
Documents and include short descriptions and keyword lists for easier browsing by
humans and agents.

The Documentation Directory should be a hybrid managed/editable Document. Users
and agents may edit it like a normal Document, but Stoneforge recognizes it as
the Workspace's managed entry point and provides structured assistance such as
link validation, missing Level 2 entry point warnings, stale keyword or
description warnings, and special Docs Drift Automation attention. It should not
be fully generated and overwritten because teams will want curated descriptions
and organization.

Documents should follow a three-level Documentation Methodology:

- Level 1: the Workspace Documentation Directory
- Level 2: entry point Documents with high-level knowledge across topics and
  links to deeper material
- Level 3: focused deep-dive Documents for specific concepts

The goal is to keep important knowledge reachable within three steps without
overloading any single Document with context irrelevant to the reader's current
work.

The Documentation Methodology also supports Code References as a Layer 4
reference target. Code is the ultimate source of truth; Documents exist to make
building context on the codebase more efficient and to explain why decisions
were made. Any Document level may link directly to code files or line ranges
when that is clearer or more efficient than duplicating the concept in prose.

Code References in Document content should use repository-relative file paths
with optional line anchors or ranges for readability and portability. Stoneforge
lineage should resolve materially-used Code References to the relevant commit SHA
when recorded, preserving a stable review/audit target while the UI displays the
friendly path and line range.

Code References should be lightly validated in the first slice. Stoneforge
should validate that referenced files exist on the relevant branch and warn on
missing paths or obviously stale line anchors/ranges. It should not require
perfect semantic validation that referenced code still proves the documented
claim. Docs Drift Automation may flag suspected stale Code References during
periodic checks.

First-slice Code References should be limited to the Workspace primary
repository. Cross-repository code references should be represented as
URL/reference Documents or ordinary external links until cross-repo validation,
commit resolution, permissions, and review/audit scope are designed.

Agents should receive Documents through explicit context selection first: linked
Documents on the Task, Plan, MergeRequest, or Automation; Documents attached by a
human; and Documents selected by a Director during decomposition. Agents may use
Document Search or Documentation Directory browsing through the Agent Command
Surface when relevant, but broad Workspace document context should not be
injected into every Session by default. When an agent materially uses a searched
or browsed Document, that Document should be cited or linked in execution
lineage.

Document browsing and Document Search should be distinct agent behaviors.
Browsing is open-ended: the agent reads full Documents and traverses relative
links as it sees fit, usually starting from the Documentation Directory. Search
is targeted: the agent looks for a specific topic, concept, keyword, or filtered
set of Documents.

Document lineage should have two tiers. Stoneforge should automatically record
Document read, search, and browse events for observability. The Agent Command
Surface should also let agents explicitly mark Documents as materially used when
they influenced the work. Agents should mark a Document as materially used
immediately after relying on it for a decision or implementation direction, not
defer that marker until documentation updates. Materially-used Documents are
decision and implementation lineage. Documentation Acceptance Criteria are a
separate requirement about updating relevant Documents or recording why no
documentation change is needed.

Materially-used Document markers should require a short reason that explains why
the Document mattered, such as "used routing constraints from runtime
architecture" or "confirmed review policy terminology." The reason should be
visible to Review Agents and humans inspecting the Task or MergeRequest, but it
should stay lightweight and not become a report.

Agents may also mark materially-used Code References when code files or specific
line ranges influenced a decision, implementation direction, or docs-drift fix.
This is especially useful for Docs Drift Automation, where the relevant evidence
often comes from code rather than existing Documents.

Agent use of Documents should be mandatory in bounded workflows. Directors should
consult the Documentation Directory when decomposing non-trivial or
concept-changing work. Workers should consult linked or selected Documents and
the Documentation Directory when the Task has documentation Acceptance Criteria
or touches documented concepts. Review Agents should check relevant Documents
when validating documentation Acceptance Criteria or reviewing concept changes.
Agents should not be forced to read every linked Document when a Document is
clearly irrelevant; they should record which Documents materially informed the
work in lineage.

The primary first-slice docs-drift control should be task-local. Tasks should
include Acceptance Criteria requiring documentation updates when their code or
concept changes add, remove, or change durable knowledge. The task-completing
agent should update relevant Documents while the implementation context is still
fresh. Review Agents should verify that this documentation Acceptance Criteria
was satisfied during review.

Every code-changing or concept-changing Task should include a default
documentation Acceptance Criteria such as "Update relevant Documents or record
why no documentation change is needed." Pure investigation, review, or
administrative Tasks may omit it when they do not affect durable code or product
concepts. Workers satisfy the criterion by updating relevant Documents or
recording a short no-docs-needed rationale, and Review Agents verify that
decision during review.

Platform-created default RoleDefinitions should teach Director, Worker, and
Reviewer workflows to use and maintain the Documentation Directory and
Documentation Methodology when creating, selecting, updating, or reviewing
Documents.

Stoneforge should also provide two default docs-drift and docs-quality
Automations, but neither should run as a docs updater after every code change. A
daily scoped Docs Drift Automation should run every configurable X hours,
defaulting to every 24 hours overnight. It should inspect changed files since
the last drift run, open or unmerged docs-drift PRs, existing Code References,
and docs-linked areas from the Documentation Directory. A weekly deep Docs Drift
Automation should periodically assess broader codebase/documentation alignment.

Deep docs-drift scanning may split the codebase into sections and dispatch
multiple agents, each responsible for one section, to avoid context overload and
quality decay from one agent attempting to assess the entire codebase at once.

The weekly deep Docs Drift Automation should use a plan-shaped workflow. It
first dispatches a Director-style agent run to inspect repository structure and
Documentation Directory topology, create an appropriate section split, and create
a Plan with one docs-drift Task per section. Normal scheduler dispatch then
handles those Tasks, with each Worker responsible for its section. Code-changing
or docs-changing outputs follow the standard task PR flow and aggregate into a
single plan branch and plan PR by default.

Weekly deep docs-drift Plans follow the same Workspace Plan activation policy as
all other Plans. There should not be a docs-specific human activation policy: if
the Workspace requires human activation for Plans, the deep-scan Plan waits; if
it does not, the deep-scan Plan may proceed under normal scheduler and policy
rules.

The weekly deep Docs Drift Director should create and maintain a stable
docs-drift section map Document in Stoneforge. The Docs Drift Section Map
belongs in the separate system-managed operational docs library, not in the
standard Documentation Directory library by default. The Director should reuse
the stable section map when possible and revise it when repository structure or
Documentation Directory topology changes. A separate section-boundary change
rationale is not required because normal agent Session lineage already captures
the Director's reasoning.

The Docs Drift Section Map should be an authorized human-editable Markdown
Document without schema validation in the first slice. Human edits are versioned
and visible in normal Document lineage. The next Director sectioning run
interprets the map and may preserve, repair, or revise it when it is unclear,
stale, or inconsistent with repository or documentation topology.

Docs Drift agents that find issues should fix them while they still have the
relevant context, accumulating changes on a dedicated docs-drift branch and draft
PR. When the Automation completes, Stoneforge should mark that PR ready and run
the standard MergeRequest flow: Review Agent review, Verification Run
observation when relevant, and automatic merge or Required Human Review
according to Workspace policy.

Docs Drift Automations should record materially-used Code References when code
evidence drives a docs-drift finding or fix. Materially-used Document markers
remain useful when existing Documents influenced the fix, but they are not the
primary evidence path for code-to-docs drift.

Docs-drift Tasks should be docs-only in the first slice. If a docs-drift agent
finds code issues while reviewing drift, it should report them to a Director for
triage or follow-up Task creation, not patch code inside the docs-drift Task.

Docs-drift Tasks may create new Documents when the Documentation Methodology
calls for it. A section Worker may create missing Level 2 or Level 3 Documents,
update the Documentation Directory, add Code References, and update relevant
links. In mirrored mode, new or edited Documents still flow through the docs PR
and standard review process.

Daily scoped Docs Drift Automation should use one docs-drift PR per run. Weekly
deep docs drift should aggregate section task PRs into one plan branch and one
plan PR by default, matching the plan-shaped workflow. If a section produces
risky or unrelated doc changes, the Director or policy can split it into a
follow-up Plan or Task rather than mixing it into the shared PR.

Docs-drift PRs should use the same MergeRequest framework as code PRs, while
allowing policy to distinguish docs-only changes. Defaults should require Review
Agent review for docs-only PRs. Human Review follows the Workspace policy preset
and any docs-only exemptions: supervised may require Human Review unless
exempted; autopilot may merge after agent review plus observed Provider Checks,
Mergeability, and policy checks when applicable.

Stoneforge should create a default docs-focused Reviewer RoleDefinition for
docs-only and docs-drift PRs. It remains in the reviewer role category and uses
the same Review Outcome model, but its prompt and checklist focus on clarity,
correctness, link and Code Reference quality, Documentation Methodology fit, and
whether any doc deletion is justified. Workspaces can edit or delete it like
other default RoleDefinitions.

Code PRs that include documentation changes should keep the normal code Review
Agent as the sole automatic Review Agent. Stoneforge should not add a second
docs-focused review automatically for mixed code/docs PRs. Instead, normal code
Reviewer RoleDefinitions should include docs-focused review pointers for
documentation Acceptance Criteria, Document Link quality, Code Reference quality,
and no-docs-needed rationales.

Docs-only Human Review exemptions should be explicit Workspace policy toggles.
`supervised` should default to Human Review for docs-only PRs like other PRs
unless the Workspace enables a docs-only exemption. `autopilot` should default
to agent-only review for docs-only PRs, subject to applicable Provider Checks,
Mergeability, and policy checks.

Docs-only classification should be determined by changed file extensions, not by
docs-root path. A PR is docs-only when every changed file is a recognized
Markdown or text documentation file, such as `README.md`, `.md`, `.mdx`, `.txt`,
or other configured text-doc extensions. Docs-drift Tasks and PRs may still be
tagged as docs-only intent, but final docs-only policy applies only after
extension-based changed-file verification.

The docs-only extension set should be Workspace-configurable with a small
default list such as `.md`, `.mdx`, `.txt`, and `.rst`. This keeps the
first-slice default simple while supporting teams that use other text
documentation formats.

Config-like files such as `.json`, `.yaml`, and `.yml` should not count as
docs-only by default because they may affect runtime behavior. Workspaces may
deliberately add structured documentation extensions if needed.

Docs-only classification should treat creates, edits, and deletions the same
way: if every changed file has a recognized docs-only extension, the PR remains
docs-only. Deleting docs may still be risky, but review policy and Review Agent
output handle that risk rather than reclassifying it as code.

Changing the Workspace docs-only extension set should warn when open
MergeRequests would be reclassified and require confirmation from an authorized
user. Open MergeRequests are re-evaluated under the new policy; terminal or
merged MergeRequests keep their historical classification.

Stoneforge should not define, publish, or run a dedicated docs-specific GitHub
check or status for docs-only PRs in the first slice. It publishes the normal
Stoneforge Policy Check and observes GitHub/provider checks as Provider Checks
inside Verification Runs. Docs quality, Document Link, and Code Reference
findings belong in Stoneforge MergeRequest UI and Review Agent output, not a
separate GitHub check.

More generally, Stoneforge should publish only the normal `stoneforge/policy`
GitHub check or status in the first slice. Provider Checks come from GitHub
Actions or other GitHub-integrated CI providers. Local `act` stays inside the
agent session and does not produce a provider-visible status.

Non-GitHub CI providers are supported only through GitHub's checks/statuses
surface in the first slice. Stoneforge should treat any observed GitHub check or
status as a Provider Check regardless of whether it originated from GitHub
Actions, Buildkite, CircleCI, Jenkins, or another provider. Full in-app logs for
those providers are supported only when available through GitHub APIs; otherwise
Stoneforge shows the GitHub-observed status, details, and URL and leaves
provider-specific log viewing to the CI provider. Direct CI provider
integrations, provider-specific log APIs, provider-specific log fetching, and
provider-specific rerun controls are out of scope.

Docs Drift Automation must account for in-flight docs-drift PRs. If a prior
docs-drift PR is still open and unmerged, later runs should treat its proposed
changes as pending context, avoid repeating the same fixes, and either skip
overlapping findings, append to the existing docs-drift branch when safe, or
create only non-overlapping follow-up work according to Workspace policy.

When a human manually creates or edits a Document, the UI should offer an
optional manual trigger for a docs-drift AutomationRun scoped to that specific
change.

Workspace policy should provide an easy way to disable the Documentation
Methodology. When disabled, default RoleDefinition documentation-update
instructions should be removed or hidden, the default documentation Acceptance
Criteria should not be added to Tasks, the periodic docs-drift Automation should
be disabled, and manual docs-drift trigger suggestions on Document edits should
be disabled.

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

Advanced marketplace roles, role-template libraries, multi-version rollout
controls, role A/B testing, and cross-workspace role sharing are out of scope
for the first slice.

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

- curated product events such as Task state changed, Plan state changed,
  MergeRequest opened or updated, Review Outcome recorded, VerificationRun
  changed, and AutomationRun changed
- time-based schedules
- inbound signed webhooks

Inbound webhook triggers use one unique endpoint per Automation in the first
slice. The endpoint requires a signed request and idempotency key. A shared
Workspace endpoint may come later if needed.
Inbound webhook signing supports either per-webhook signing secrets or a
workspace-wide signing secret. Per-webhook secrets provide isolation, while a
workspace-wide secret avoids environment-variable sprawl. Workspace or Org
policy may disable workspace-wide signing-secret use.
Both per-webhook and workspace-wide signing secrets support rotation with an
overlap window where old and new secrets validate. Stoneforge should show
last-used metadata so operators can confirm clients have switched before
retiring the old secret.
Outbound automation webhook signing mirrors inbound: per-destination signing
secrets or a workspace-wide outbound signing secret are both supported. Workspace
or Org policy may require per-destination secrets for stricter isolation.
Outbound signing secret rotation also uses an overlap window and last-used
metadata.
Outbound webhook delivery treats `2xx` as success, `408`, `429`, and `5xx` as
retryable, and other `4xx` responses as terminal failure. Retries use
exponential backoff with a bounded retry count. A successful delivery moves to
`running` only when the response indicates accepted/async long-running work;
otherwise a bounded synchronous `2xx` can complete the AutomationRun as
`succeeded`.
Outbound handler responses should use an explicit typed response contract, such
as accepted, succeeded, or failed, rather than status-code inference alone.
Stoneforge should provide a small package or SDK with helper functions so
user-hosted handlers can return correct accepted/succeeded/failed responses
without memorizing status codes or payload shapes.
Stoneforge should provide a broader TypeScript-first Stoneforge SDK for
interacting with the Stoneforge API. The SDK is recommended, not required, and
the protocol should remain documented and simple enough to implement manually.
It should include Automation handler support: signature verification helpers,
typed response helpers, callback helpers, Stoneforge API client setup using the
AutomationRun Credential, and thin helpers for common API actions such as create
Task, create Plan, request Director triage, link objects, complete or fail an
AutomationRun, and read scoped context. These helpers are wrappers over the
documented API, not a separate workflow DSL.
The outbound automation webhook protocol should be language-agnostic. The
first-slice Stoneforge SDK ships for TypeScript first, with other
language SDKs left for later or manual protocol implementation.
The TypeScript Stoneforge SDK is in first-slice scope, but its required surface
should stay tight: auth/client setup, Automation webhook signature verification,
typed accepted/succeeded/failed responses, callback helpers, and common API
wrappers needed by first-slice workflows.
First-slice product-level API scope is required only where external actors
depend on stable contracts: the Agent Command Surface, Stoneforge SDK and
Automation handler APIs, GitHub webhook/provider integration boundaries, and
minimal UI/backend private APIs needed by the app. A fully public REST or
GraphQL API for every object is out of scope. Internal domain and persistence
APIs remain implementation detail, with type-driven contracts and normalized
data model expectations documented for engineering.

Arbitrary "any object changed" triggers are out of scope for the first slice
until event schemas and loop-prevention rules are stronger.
Schedule-based Automations support simple intervals and cron expressions. The
timezone is explicit and required, and each schedule trigger records evaluated
next-run time plus timezone in AutomationRun/source metadata.
Missed schedule runs after downtime are not backfilled in the first slice. Stoneforge
records a missed-run event or count for visibility and evaluates the next future
run. Users can manually run the Automation if they need to recover missed work.
Manual runs of schedule-based Automations create separate AutomationRuns and do
not move or reset the next scheduled run time.
AutomationRun changed triggers require explicit filters for AutomationRun state,
action, and source. An Automation should not trigger directly on its own runs by
default, idempotency keys are required, and automation chain depth should be
capped per root correlation ID.
When the chain-depth cap is exceeded, Stoneforge should create a blocked
AutomationRun with reason `automation_chain_depth_exceeded`, root correlation ID
and parent-run lineage, and Automations UI visibility. It must not silently drop
the event.
The user-defined automation chain-depth cap is Workspace policy, defaulting
conservatively to `3`. Platform Automations may use separate internal safeguards.

Automations should reinforce the core model rather than bypass it.

Each automation trigger evaluation should create an AutomationRun. The
AutomationRun is the durable explanation of why automation did or did not create
follow-up work: it records trigger source, evaluated policy, idempotency key,
target object, action type, status, attempts, timestamps, result, and linked
follow-up objects. Agent-based AutomationRuns may create Dispatch Intent that
later produces Assignments and Sessions. Code-first AutomationRuns record
platform handler or outbound webhook attempts and results without being modeled
as agent execution.

AutomationRuns should use one intuitive success state across action types:
`succeeded`. Dispatch Intent creation, webhook acknowledgement, provider facts,
or workflow updates are results and linked records, not separate success states.
`blocked` is resumable when policy, eligibility, idempotency, or configuration
facts change. Long-running code-first automations use `running` while awaiting
callback completion.

Long-running code-first automations complete through signed callbacks only in
the first slice. Stoneforge should not poll external status endpoints. Callback
receipt returns 200 only after the callback is authenticated, idempotently
accepted, and durably recorded, allowing the external handler to retry missed or
failed callbacks.

Completion callbacks finalize AutomationRuns only. They report `succeeded` or
`failed`, bounded result metadata, linked objects, and error details. They are
not a general workflow mutation surface; user-defined code-first automation uses
the Stoneforge API for workflow actions.

External code-first automation calls the Stoneforge API with a short-lived
AutomationRun Credential minted by Stoneforge and included or retrievable from
the outbound webhook context. It is scoped to the Workspace, AutomationRun,
configured target objects, allowed API action categories, and expiry, and emits
service-actor lineage for every call. The credential is usable from outbound
delivery through `running`, including final API calls before completion
callback, and is revoked on any terminal AutomationRun state.

User-defined code-first automations may create Tasks and Plans through the
Stoneforge API when credential scope allows. Those Tasks and Plans should not be
forced into draft by default. Workspace policy or Automation configuration
controls whether automation-created work moves forward, requires Director
triage, becomes draft/non-dispatchable, or becomes ready/active. The default
accepts automation-created Tasks and Plans and moves them forward.

Workspace policy is the ceiling for automation-created Task/Plan behavior, and
Automation configuration can only narrow it. If created work requires Director
triage, the automation requests triage through an explicit Stoneforge API action
that creates scheduler-evaluated Director Dispatch Intent unless policy requires
human approval first.

Director triage requests may target objects created by the same AutomationRun or
existing Tasks, Plans, and imported Issues. Eligibility is controlled by
AutomationRun Credential scope over target objects or object classes.
Repeated triage requests are deduped by target object, triage purpose or
reason, source Automation/AutomationRun, and unresolved Director Dispatch Intent
status. Matching queued or active triage returns the existing Dispatch Intent
instead of creating duplicate Director work.

Users may manually re-run an AutomationRun from any terminal state, including
`succeeded`, `failed`, or `canceled`, and may re-run blocked runs when
appropriate. Manual re-run always creates a new AutomationRun linked to the
original and never mutates the old run.
Manual re-run defaults to replaying the original trigger context exactly. A
separate run-with-edited-inputs path creates a new manual AutomationRun with the
input diff recorded and requires Automation edit/create authorization.

The Automations UI should include Automation list/detail views and AutomationRun
history. Run history should be searchable and filterable by Automation, target
or linked object, trigger type, action type, state, source actor/provider, time
window, and correlation or idempotency key.
AutomationRun detail should show raw trigger, outbound request, and callback
payloads in the first slice. Workflow triggers, outbound automation requests,
and callbacks must not contain secrets; no special payload redaction or
permission model is required for the first slice. Automation payloads remain
raw records subject to Workspace retention policy.
Stoneforge may warn on obvious secret-looking automation payload field names
such as `secret`, `token`, `password`, `apiKey`, or `privateKey`, but should not
build a heavy DLP system for automation payloads in the first slice.
Automation definitions should be versioned. Each AutomationRun should snapshot
the effective Automation definition or reference an immutable Automation version
at run creation. Later edits must not change historical run interpretation or
exact manual replay behavior.
Running, delivering, blocked, and retrying AutomationRuns keep the Automation
version or snapshot they were created with. Automation edits affect future runs
only. To use a newer version for stuck or old work, an operator cancels or
re-runs, creating a new linked AutomationRun.
Disabling an Automation prevents new trigger-created AutomationRuns but does not
stop existing runs by default. Existing runs continue on their pinned version
unless an operator explicitly cancels them. The UI should warn when disabling an
Automation with active runs and offer an optional cancel-active-runs action.
Automation hard delete is out of scope for the first slice. Use archive or
soft-delete semantics: hide the Automation from active lists, prevent new runs,
and preserve Automation versions plus historical AutomationRuns for audit,
replay, and debugging.
Archived or soft-deleted Automations keep historical runs inspectable, but do
not allow direct manual re-run by default. Re-run requires restoring the
Automation or explicitly creating a new Automation from the historical version.

Blocked AutomationRun re-evaluation is Workspace policy. The default
re-evaluates platform automations and non-external user-defined automations when
blocking facts change, but not externally triggered automations. Workspaces may
instead choose to re-evaluate all blocked automations or no blocked
automations.

### Policy

Policy determines what is allowed to happen automatically, what requires review, and what requires approval.

There is one policy system with multiple workspace presets layered on top of it.

AuditEvents and durable Workflow Events are append-only and retained
indefinitely by default in local and self-hosted deployments unless an
administrator configures retention. Workspace policy owns retention for raw
Session transcripts, provider logs, CI logs, Automation payloads, preview logs,
and runtime logs. Those raw records should have configurable retention with
conservative defaults, while bounded summaries, lineage, object state, review
outcomes, merge decisions, Checkpoints, and Repair Context remain longer-lived.
Deletion or redaction should preserve audit tombstones and enough metadata to
explain what happened without retaining sensitive raw content.

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
- assignments, sessions, PRs, and Verification Runs are first-class execution records

Why:

- planning objects should not pretend to be execution history objects
- lineage, recovery, and audit are cleaner when execution is modeled explicitly

### 3. Repo-Scoped Workspace By Default

Decision:

- one primary GitHub repository per Workspace in the first slice
- cross-repository Workspaces are out of scope and should be deferred to a later slice
- a simple Org container is in scope: create or select Org, manage Workspaces,
  basic membership and roles, and GitHub org/repo permission projection
- advanced org billing, SSO enforcement, audit export, cross-Workspace policy
  inheritance, and org-wide analytics are out of scope

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

A seeded local demo or sandbox Workspace may be included for local OSS/dev mode
if it is cheap, but it should not be part of core MVP acceptance criteria. The
required setup path is real GitHub-backed onboarding through the onboarding
wizard.

The first slice must document local OSS/dev and self-hosted deployment paths.
Local dev should run with SQLite or local Postgres, a clearly marked
single-user principal, local filesystem/dev secret storage, and real GitHub App
configuration for repository testing. Fake providers are not part of
first-slice product acceptance. Self-hosted team deployments should use
Postgres, durable object or file storage for logs and artifacts as needed, a
configured GitHub App, OAuth or OIDC human authentication, secret storage,
worker and Host connectivity, and clear environment readiness checks.
Kubernetes, high availability, backup/restore automation, managed upgrades,
billing, multitenant SaaS operations, and a Stoneforge-hosted cloud service are
out of scope for the first slice.

First-slice release acceptance should prove local and self-hosted operability,
not only describe it. The product should have a repeatable local OSS/dev setup
and a repeatable self-hosted team setup with documented environment variables,
GitHub App setup, database and storage setup, secret storage expectations,
Host/Runtime connectivity checks, health/readiness checks, and troubleshooting
for common misconfiguration. One-click installers, Kubernetes manifests, high
availability topology, backup automation, managed upgrades, and production SRE
runbooks are out of scope for the first slice.
- authorization is an explicit subsystem
- product policy remains inside Stoneforge

Why:

- we need an enterprise-capable trust boundary from the beginning
- integrating with established identity systems is better than building human auth from scratch

### 8. Relational Durability Baseline

Decision:

- SQLite for OSS local-first
- PostgreSQL for cloud and self-hosted
- local OSS/dev uses real GitHub App integration for product acceptance, not fake providers

Why:

- local use should remain lightweight
- cloud and enterprise need a stronger relational backbone
- first-slice behavior should prove the real GitHub provider boundary even in local development

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

The first-slice setup path should be a guided onboarding wizard based on the
`reference/smithy-next` prototype onboarding flow. The wizard may add setup for
missing first-slice requirements, but should not remove setup steps already
present in the prototype direction. It should make the Workspace ready for the
golden path or show clear readiness blockers.

1. one team can onboard one real repository into Stoneforge
2. workspace agents, role definitions, and runtimes can be configured clearly
3. customer-managed hosts and at least one managed sandbox path can execute real work

First-slice success metrics should be operational completion metrics, not growth
metrics:

- onboard one real repo to `ready`
- create or import intent
- have the Director create a valid Task or Plan
- have a Worker complete a code change
- open a PR
- evaluate required verification and review gates
- handle at least one failure through repair
- merge with `stoneforge/policy`, audit/lineage, Documents context, and GitHub
  sync visible
- let an operator understand why work is blocked

First-slice acceptance should include automated product coverage for the golden
workflow through end-to-end or integration tests: onboarding a real
GitHub-backed Workspace, configuring Runtime, Agent, RoleDefinition, and policy,
creating or importing intent, Director Task or Plan creation, Worker execution,
PR creation, Verification Run observation, Review Outcome, at least one repair
loop, and merge/policy evaluation. The exact test tooling is governed by the
repo's engineering standards, but acceptance requires a repeatable proving
scenario that exercises real GitHub integration rather than fake providers.
That repeatable workflow coverage may use a deterministic test Agent or adapter
so CI can prove Stoneforge state machines, GitHub PR flow, policy, review,
repair, and merge behavior without depending on live LLM quality, latency, or
cost.

Real provider release smoke coverage is still required for Claude Code and
OpenAI Codex. Those smoke paths should prove adapter launch, resume, cancel,
Session identity, progress, and outcome reporting against real providers or
their supported local app-server integration, without requiring every
golden-path test to run through live LLM execution.

First-slice acceptance should also include a lightweight security checklist for
the concrete trust surfaces in scope: GitHub App permissions and token lifetime,
OAuth identity linking, RBAC and reviewer eligibility, Session Command
Credentials, AutomationRun Credentials, webhook signing and idempotency,
secret-backed provider and registry proxies, preview/dev secret warnings,
policy-bypass paths, AuditEvents for sensitive actions, and raw log/payload
retention and redaction. Formal SOC2/compliance certification, penetration
testing, and a full threat-model program are out of scope for the first slice.
4. a task can become a real execution chain: task -> assignment -> session -> PR -> Verification Run
5. the same control-plane model can drive at least Claude Code and OpenAI Codex
6. policy and audit work on real actions, not only mocked flows
7. Task Progress Record and documents together improve resumability across sessions and assignments
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
- orchestrate real Director, Worker, and Reviewer Agents through durable
  workflows without promising perfect task decomposition, perfect code
  generation, perfect review accuracy, zero human intervention, or ideal work on
  the first attempt
- checkpoint and resume sessions cleanly
- correlate tasks, sessions, PRs, and Verification Runs into one coherent operator view
- enforce policy on sensitive actions
- provide a simple Workspace policy configuration surface for choosing
  `autopilot` or `supervised`, configuring documented first-slice policy values,
  and showing effective policy/readiness consequences
- produce reliable audit trails
- preserve durable shared context through documents and Task Progress Record state
- support narrow but useful automations
- support direct human intervention throughout the flow
- follow the first-slice UI direction represented by `reference/smithy-next/`,
  including operator surfaces for Tasks, Plans, MergeRequests, Sessions,
  Automations, Agents, Runtimes, RoleDefinitions, Documents, Workspaces, policy
  blockers, audit/lineage, and review/intervention workflows
- treat `reference/smithy-next` as the final-goal reference for initial page
  designs and workflows; modifications, additions, or removals from that
  direction require explicit product approval
- require workflow and interaction fidelity to `reference/smithy-next`, not
  pixel-perfect implementation. The prototype is the approved target for
  information architecture, page coverage, primary workflows, navigation shape,
  and review/diff interaction direction. Exact styling, spacing, component
  internals, and implementation details may change when needed for the active V2
  app, unless the change alters workflow, page coverage, or user-visible
  behavior.
- meet a practical accessibility baseline: semantic HTML where applicable,
  keyboard navigability for primary workflows, visible focus states, accessible
  labels for controls and icons, readable contrast, and screen-reader-friendly
  status text for blockers, review state, verification, and progress
- include in-app notification and action-required surfaces for operators to see
  blocked or action-required work, including readiness blockers, human review
  needed, policy-required approval or activation, failed required verification,
  repair escalation, blocked or failed AutomationRuns, Host or Runtime
  disconnects, and missing configuration
- provide pragmatic searchable and filterable list views for operational
  objects, including Tasks, Plans, MergeRequests, Sessions, Automations,
  AutomationRuns, Agents, Runtimes, RoleDefinitions, Documents, and Workspaces.
  Filters should use obvious fields such as state, status, owner or actor,
  linked object, branch, PR, risk, tags, updated time, and blocker presence.
- keep product-facing observability limited to operator workflow visibility:
  Execution Lineage, Audit Trail, Session transcripts and logs, AutomationRun
  history, Host and Runtime health, Verification Run and Provider Check status,
  policy blockers, in-app notification surfaces, and operational list filters.
- expose cost-control configuration such as Agent concurrency limits,
  model/provider selection, Runtime selection, and basic active
  Assignment/Session counts without becoming a billing or cost analytics
  product
- support preview environments for supported Runtimes and Hosts so users can
  spin up and interact with previews from task or plan-specific branches
- make failures visible and recoverable

CI/CD support in the first slice should be verification-observation first.
Stoneforge observes GitHub checks and statuses for task and plan PRs, records
them as Provider Checks inside Verification Runs scoped to the current
MergeRequest head SHA, and lets Workspace policy mark observed checks as
required or optional for Stoneforge merge readiness. GitHub branch protection or
rulesets may seed suggested required-check policy during onboarding when
available, but GitHub remains where CI/CD workflows, branch protection, rulesets,
and provider-side required checks are configured.

Stoneforge should not author CI/CD workflows, host CI jobs, manage GitHub branch
protection or rulesets, or become the provider-side required-check configuration
surface in the first slice.

Required Provider Checks should be satisfied only by explicit provider success by
default: GitHub check-run `success` or commit status `success`. Pending,
running, missing, or stale observations keep Verification pending or stale.
Terminal non-success states fail required checks. `neutral` and `skipped` do not
satisfy required checks by default, but Workspace policy may allow either for
specific check names.

Missing required Provider Checks should start as pending while the PR/check
observation window is fresh. The observation window should be controlled by a
Workspace policy value such as `requiredProviderCheckMissingTimeoutMinutes`,
defaulting to 10 minutes after PR head observation. After that timeout, or
immediately after GitHub reports that all current checks are complete and the
required check is still missing, a missing required check becomes a policy
blocker, not a Repair Trigger. The UI should show the missing check name and
offer the existing disable/warning-confirmation path for authorized users.
The `stoneforge/policy` provider check should remain pending during the fresh
observation window, then be republished as failing with a clear missing-check
reason once the missing check is confirmed as a policy blocker.

When a required Provider Check reaches a terminal failing state, Stoneforge
should automatically create a Repair Trigger for the source Task or Plan
MergeRequest. Repair Context should include the failing check name, head SHA,
provider URL and log summary when available, and whether this is a first or
repeated failure. The first slice should not add a human-approval exception for
provider-check repair based on high-risk or sensitive targets.

Failed optional Provider Checks should not create Repair Triggers or block merge
by default, but they should be reported to a Director Agent for triage. They
remain visible MergeRequest and provider context, and reviewers or agents may use
them as signal. If Workspace policy marks the check required, terminal failure
follows the required-check repair path instead.
Optional-provider-check Director triage should be grouped per MergeRequest head
SHA. Multiple optional failures on the same head should create or update one
unresolved Director triage dispatch with all failed optional checks as context. A
new head SHA starts a new triage group.
Optional-provider-check Director triage outcomes should stay simple and
non-blocking: no-op with rationale, add reviewer context, or create
non-blocking follow-up Tasks.
Reviewer context produced by optional-provider-check Director triage should be
persisted as first-class MergeRequest reviewer context, not only as Director run
output. It should keep provenance to the Director Assignment/Session and the
failed optional Provider Checks that caused it.
Optional-provider-check reviewer context should be Stoneforge-only by default.
It appears in the Stoneforge MergeRequest review UI and is supplied to Review
Agents and human reviewers there, but Stoneforge should not post GitHub comments
for optional-check triage by default.

Provider-check repair should automatically ingest bounded failure context rather
than full CI logs by default. Bounded context includes check name, conclusion,
timestamps, provider URL, job and step names when available, and a failure
excerpt or summary when GitHub exposes it cheaply.

Users should be able to review full CI logs inside Stoneforge only when those
logs can be fetched through documented GitHub APIs. GitHub Actions workflow and
job logs are the required supported path. Other CI provider logs are supported
only if GitHub exposes retrievable log data for that check or status without a
provider-specific integration. Stoneforge may cache fetched logs with retention
limits, but should not eagerly store every full log by default.

The first slice should not depend on undocumented GitHub live-log streaming
behavior. For in-progress checks, Stoneforge may refresh observed check, job,
and step metadata, then fetch downloadable logs when GitHub exposes them. Repair
Agents should receive bounded excerpts or summaries by default, with controlled
access to full logs when needed.

Agents should be able to run GitHub Actions locally through the `act` CLI inside
the resolved Runtime when that Runtime supports it. This gives Repair Agents a
pre-push way to verify likely CI fixes before committing or pushing changes.
Local `act` verification should default to the failed required Provider Check's
corresponding workflow or job when the mapping is clear. If the mapping is
unclear, agents should run the smallest relevant workflow or job based on
changed files and failure context. Agents should not run every workflow by
default, and Stoneforge should not require a dedicated task-progress entry
solely to explain local verification coverage.
Managed Runtimes should include `act` by default when Docker/container execution
is available. Customer-managed Runtimes should report whether `act` is installed
and usable as a Runtime capability. If `act` is unavailable, agents should fall
back to project-local tests and rely on GitHub Actions rerunning after push.
Local `act` verification should use the same low-risk preview/dev secret
boundary as previews by default. Any secrets injected into local Actions
verification must be clearly marked as agent-observable and may appear in
agent-visible logs; production credentials must not be injected. If a workflow
needs secrets that are unavailable or not approved for preview/dev use, the
agent should treat local Actions verification as partial and rely on GitHub
Actions after push for the unavailable portions.
Local `act` verification is best-effort. Stoneforge should not promise parity
with GitHub-hosted runners, service containers, matrix behavior, hosted runner
images, or every GitHub Actions feature. If local `act` behavior is unsupported
or divergent, agents should fall back to project-local tests and rely on GitHub
Actions after push.
Local `act` output should remain session-local agent working context only.
Stoneforge should not create UI artifacts, lineage records, repair-context
items, Provider Checks, Verification Runs, or GitHub checks/statuses from local
`act` results. Only GitHub-observed checks can satisfy required Provider Checks.

Stoneforge should not expose GitHub Actions rerun, workflow dispatch, or
arbitrary remote workflow execution controls to agents or humans in the first
slice. GitHub Actions should rerun through the normal provider behavior when
Stoneforge pushes repair commits to the task or plan branch.

## What Stoneforge Should Not Try To Do Yet

Stoneforge should not, in the first slice:

- become a full GitHub replacement
- own deployment promotion or rollback
- build a full CI/CD authoring platform
- manage GitHub branch protection or repository rulesets
- expose GitHub Actions rerun or workflow dispatch controls
- build rich messaging as a core surface
- build cross-workspace portfolio analytics
- design multi-repo workspaces before repo-scoped workspaces clearly break
- support non-GitHub source-control providers
- support GitHub Projects sync
- support full GitHub comment sync, threaded resolution parity, or perfect comment editing/deletion sync
- support provider-specific CI integrations beyond GitHub checks/statuses and logs available through documented GitHub APIs
- support semantic or vector Document search
- support rich binary Document editing or complex block-editor Documents
- operate a Stoneforge-hosted cloud service, billing system, multitenant SaaS operations, SSO enforcement, high availability, or backup/restore automation
- expose an arbitrary public REST or GraphQL API for every object
- build mobile apps
- build advanced analytics or reporting beyond the operator visibility needed for the golden workflow
- build saved-query systems, custom dashboards, or cross-workspace operational
  reporting beyond the pragmatic list filtering needed for operator triage
- build product-facing metrics dashboards, tracing UI, performance analytics,
  cost analytics, usage analytics, or Workspace/Org reporting
- build token accounting, per-task cost reporting, budget alerts, invoices,
  chargeback, pricing plans, or model-cost analytics
- build a generic policy rule builder, scripting policy language, org-wide
  inheritance UI, policy simulation, policy version diffing, or bulk policy
  management
- build advanced marketplace roles, role-template libraries, multi-version role
  rollout controls, role A/B testing, or cross-workspace role sharing
- build broad Workspace export/import, audit export, portable project archives,
  backup/restore automation, or migration tooling as product requirements
- build one-click installers, Kubernetes manifests, high availability topology,
  backup automation, managed upgrades, or production SRE runbooks
- require a full formal WCAG audit, advanced screen-reader workflow
  certification, localization, or comprehensive keyboard shortcut customization
- build email, Slack, digest preferences, escalation schedules, notification
  routing rules, or webhook notification delivery as first-class notification
  channels outside user-defined Automations
- migrate or import existing Stoneforge V1 or Smithy production data into V2
- make agent quality or autonomy guarantees beyond bounded task quality,
  recoverable failures, visible blockers, review and verification gates, repair
  loops, and audit/lineage
- over-design Phase 2 before the first slice is real

First-slice scope should stay limited to the paths required for the golden
workflow, onboarding, review, repair, merge, Automations, Documents, and
local/self-hosted operation.

## How To Think About Editing

Editing is important, but it is not the center of gravity.

The right stance is:

- Stoneforge is not primarily an editor product
- Stoneforge may include code inspection and editing surfaces
- those surfaces exist to support supervision, debugging, QA, review, and intervention inside a broader orchestration workflow
- diff-heavy MergeRequest review is in scope for the first slice because many users and teams will still review agent-written code line by line
- a lightweight Monaco-style editor may be integrated across Tasks,
  MergeRequests, diffs, and related views for following code paths, inspecting
  files, making small edits, and committing changes
- the editor should not artificially restrict humans to Task, Plan, or docs PR
  branches; authorized users may edit files on any branch and commit the
  changes through the UI when provider permissions and branch protections allow
  it
- editor commits should be attributed to the authenticated human where provider
  identity allows, shown in Stoneforge lineage when linked to Workspace objects,
  and should trigger the same provider observation and policy re-evaluation as
  other commits when they affect an observed MergeRequest or workflow branch
- unlinked editor commits are allowed as repository branch edits when the human
  has provider permission; Stoneforge should not automatically create a Task or
  review workflow for them, but should observe related provider checks or PR
  changes when a PR exists
- direct target-branch commits are governed by GitHub permissions and branch
  protection rather than a synthetic Stoneforge merge workflow
- the editor may offer agent-assisted commit message generation; generated
  messages are suggestions that the human reviews and submits with the commit
- the editor surface is not a core workflow or a general-purpose IDE
  replacement in the first slice

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
- keep Task Progress Record on the task; use documents for broader durable context
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
5. task progress and durable context
6. plan activation and aggregation behavior
7. automation-triggered dispatch and review loops
8. end-to-end proving scenario and recovery hardening

That is the plan.
