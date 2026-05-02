# Stoneforge V2 Integrations And First Slice

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for the first buildable Stoneforge V2 slice. It defines the GitHub-first integration boundary, supported merge topologies, execution-provider adapters, proving scenarios, explicit exclusions, and milestone order without broadening the charter into a larger platform plan.

## Scope And Status

First-slice scope:

- GitHub-first repository onboarding and PR flow
- GitHub Issue import/sync as a policy-controlled engineering-intent source
- Claude Code and OpenAI Codex worker backends
- real Director, Worker, and Reviewer Agent workflows without promising perfect
  decomposition, code generation, review accuracy, or zero human intervention
- customer-managed host execution plus Daytona managed sandbox execution
- task and plan workflows through review, merge, recovery, and audit
- platform-provided workflow automations plus bounded user-defined automation paths
- operator UI direction based on `reference/smithy-next`, including Tasks,
  Plans, MergeRequests, diff review, Sessions, Automations, Agents, Runtimes,
  RoleDefinitions, Documents, Workspaces, and intervention surfaces
- workflow and interaction fidelity to `reference/smithy-next`, not
  pixel-perfect implementation; the prototype is the approved target for
  information architecture, page coverage, primary workflows, navigation shape,
  and review/diff interaction direction, while exact styling, spacing,
  component internals, and implementation details may change unless they alter
  workflow, page coverage, or user-visible behavior
- practical accessibility baseline: semantic HTML where applicable, keyboard
  navigability for primary workflows, visible focus states, accessible labels for
  controls and icons, readable contrast, and screen-reader-friendly status text
  for blockers, review state, verification, and progress
- in-app notification and action-required surfaces for blocked or
  action-required work, including readiness blockers, human review needed,
  policy-required approval or activation, failed required verification, repair
  escalation, blocked or failed AutomationRuns, Host or Runtime disconnects, and
  missing configuration
- searchable and filterable list views for Tasks, Plans, MergeRequests,
  Sessions, Automations, AutomationRuns, Agents, Runtimes, RoleDefinitions,
  Documents, and Workspaces, using obvious operator-triage fields such as state,
  status, owner or actor, linked object, branch, PR, risk, tags, updated time,
  and blocker presence
- product-facing observability limited to operator workflow visibility:
  Execution Lineage, Audit Trail, Session transcripts and logs, AutomationRun
  history, Host and Runtime health, Verification Run and Provider Check status,
  policy blockers, in-app notification surfaces, and operational list filters
- cost-control configuration such as Agent concurrency limits, model/provider
  selection, Runtime selection, and basic active Assignment/Session counts,
  without token accounting, per-task cost reporting, budget alerts, invoices,
  chargeback, pricing plans, or model-cost analytics
- lightweight Monaco-style editing for inspecting files and committing human
  changes on any branch when provider permissions and branch protections allow
  it; Task, Plan, and MergeRequest contexts may preselect relevant branches but
  must not be the only editable branches
- unlinked editor commits are allowed as repository branch edits without
  automatically creating a Task or review workflow; if a branch has an observed
  PR, normal provider observation, Verification Run, Required Review freshness,
  Mergeability, and Stoneforge policy re-evaluation apply
- agent-assisted commit message generation may be offered in the editor as a
  human-reviewed suggestion
- Documents for reusable Workspace context, with Markdown/plain text editing,
  URL/reference documents, and clickable relative Markdown file links between
  Workspace Documents
- separate first-slice Document libraries for standard Workspace documentation
  and system-managed operational docs
- Documents UI library selection/filtering that defaults to Workspace
  documentation while keeping Operational/System docs visible but separated
- Operational Docs Library Documents defaulting to Stoneforge-only source mode
  so system metadata does not pollute repository docs or create PR churn
- URL/reference Documents that participate in the Documentation Methodology as
  metadata plus optional summaries or notes, without automatic external page
  crawling in the first slice
- normal Markdown Documents for external knowledge the team relies on long
  term, including summary, rationale, and source link
- Document source modes for Stoneforge-only, repo-backed, and mirrored docs,
  with mirrored docs as the default for repository-linked Workspaces and docs
  folder selection during onboarding
- source-mode-aware Document version history: Stoneforge-owned content history
  for Stoneforge-only Documents and Git-derived content history for
  repo-backed or mirrored Documents
- one primary docs root per Workspace in the first slice, selected during
  onboarding from detected common docs paths or created as `docs/` when absent
- mirrored Document UI edits routed through docs PRs, with repository PR merge
  as the authoritative write path and pending PR changes viewable from the
  Documents UI
- lightweight Document organization through one optional system category and
  freeform Workspace-scoped tags
- Document search across title and body with metadata filters, BM25 ranking in
  SQLite and Postgres, and Postgres support through the `pg_textsearch`
  extension
- a Workspace Documentation Directory and three-level Documentation Methodology
  for browse-first Document discovery by humans and agents
- distinct agent Document Browsing and Document Search behaviors, where
  browsing means open-ended full-Document reading/link traversal and search
  means targeted topic, concept, keyword, or filtered lookup
- two-tier Document lineage, with automatic read/search/browse events and
  explicit materially-used Document markers from agents when Documents inform
  decisions or implementation direction, including short reasons visible during
  review
- materially-used Code References when code files or line ranges inform agent
  decisions, implementation direction, or docs-drift findings/fixes
- bounded mandatory Document use in Director, Worker, and Review Agent
  workflows, with lineage for materially used Documents
- a hybrid managed/editable Documentation Directory with validation, warnings,
  and special Docs Drift Automation attention
- Code References as Layer 4 Documentation Methodology targets, allowing docs at
  any level to link directly to source-of-truth code files or line ranges
- commit-backed materially-used Code References in lineage, with
  repository-relative path/range display in the UI
- lightweight Code Reference validation for file existence and stale line-range
  warnings, with deeper semantic drift handled by review and Docs Drift
  Automation
- first-slice Code References limited to the Workspace primary repository;
  cross-repository code references remain URL/reference Documents or ordinary
  external links
- task-local documentation Acceptance Criteria, Review Agent validation, and
  default RoleDefinition guidance to keep Documents current without a
  per-change docs-updater Automation
- default documentation Acceptance Criteria on code-changing or
  concept-changing Tasks, satisfied by updating relevant Documents or recording
  a short no-docs-needed rationale
- platform-defined daily scoped and weekly deep docs-drift/docs-quality
  Automations, plus optional manually scoped runs after human Document edits
- weekly deep docs-drift scanning that may shard the codebase into sections and
  dispatch multiple agents to avoid context overload
- weekly deep docs-drift plan-shaped workflow: Director-style sectioning creates
  a Plan with one section Task each, normal dispatch runs the Tasks, and task
  PRs aggregate into a plan branch/plan PR by default
- weekly deep docs-drift Plans use the same Workspace Plan activation policy as
  every other Plan, with no docs-specific activation policy
- a stable docs-drift section map Document maintained by the weekly deep Docs
  Drift Director in the system-managed operational docs library and revised when
  repository or docs topology changes
- human-editable Markdown Docs Drift Section Map with no first-slice schema
  validation; Director sectioning interprets and repairs it as needed
- docs-drift Automation work that fixes found issues on a dedicated docs-drift
  branch and draft PR, then marks the PR ready for the standard MergeRequest
  review and merge flow
- docs-only docs-drift Tasks; code issues found during docs-drift work are
  reported to Director triage rather than patched by docs-drift Workers
- docs-drift Tasks may create missing Level 2 or Level 3 Documents, update the
  Documentation Directory, add Code References, and update links through the
  docs PR/review process
- daily scoped docs drift uses one docs PR per run; weekly deep docs drift
  aggregates section task PRs through one plan branch and plan PR by default
- docs-drift PRs use the standard MergeRequest framework with policy able to
  distinguish docs-only changes and defaults requiring Review Agent review
- platform-created docs-focused Reviewer RoleDefinition for docs-only and
  docs-drift PRs, still using the normal reviewer category and Review Outcome
  model
- mixed code/docs PRs keep the normal code Review Agent as the sole automatic
  Review Agent, with docs-focused review pointers in the normal code Reviewer
  RoleDefinition prompt rather than a second automatic docs-focused review
- docs-only Human Review exemptions are explicit Workspace policy toggles, with
  supervised defaulting to Human Review unless the exemption is enabled
- docs-only classification uses extension-based changed-file verification for
  recognized Markdown or text documentation files, not docs-root path
- Workspace-configurable docs-only extension set, defaulting to `.md`, `.mdx`,
  `.txt`, and `.rst`
- config-like extensions such as `.json`, `.yaml`, and `.yml` excluded from
  docs-only defaults unless deliberately configured
- creates, edits, and deletions of recognized docs-only extensions treated
  consistently for docs-only classification
- warning and confirmation when docs-only extension changes would reclassify open
  MergeRequests
- no dedicated Stoneforge docs-specific GitHub check/status in the first slice;
  docs-only PRs use the normal Stoneforge Policy Check and observed
  GitHub/provider checks, while docs quality/link/reference findings appear in
  Stoneforge UI and Review Agent output
- docs-drift in-flight PR handling so later periodic runs treat open unmerged
  docs-drift PR changes as pending context and avoid duplicate fixes
- lightweight code inspection and manual-edit intervention tied to existing
  Tasks, Plans, Sessions, or MergeRequests
- preview environments for all supported first-slice Runtime and Host paths,
  launched from task or plan-specific branches and usable for interactive QA

Frozen in this doc:

- GitHub is the only repository and PR provider for the first slice
- simple Org administration covers create/select Org, Workspace management, basic membership and roles, and GitHub org/repo permission projection
- advanced org billing, SSO enforcement, audit export, cross-Workspace policy inheritance, and org-wide analytics are out of scope
- GitHub Issues are a required first-slice engineering-intent source
- `MergeRequest` is the internal term and `PR` is the GitHub-facing term
- planned code-changing tasks follow the workspace Merge Topology, which may aggregate through a plan branch and plan PR or merge directly to the workspace target branch
- unplanned code-changing tasks use direct task PRs to the workspace target branch
- Provider Checks are observed from GitHub checks and statuses, then aggregated into Verification Runs; they are not run natively by Stoneforge
- GitHub remains where CI/CD workflows, branch protection, rulesets, and provider-side required checks are configured; Stoneforge only marks observed checks as required or optional for Stoneforge merge readiness under Workspace policy

Working assumptions:

- one real team and one real repo should be able to prove the whole model end to end
- each first-slice Workspace links to one primary GitHub repository; cross-repository Workspaces are out of scope
- task-level and plan-level PR naming, branch naming, and comments may begin simple
- GitHub reviews may be imported as signals when identities are linked
- GitHub branch protection/rulesets are the source of truth for Required Review freshness in GitHub-backed Workspaces, including stale approval dismissal and most-recent-reviewable-push requirements
- GitHub branch protection/ruleset changes for open MergeRequests re-evaluate merge readiness and may republish `stoneforge/policy`, but do not create repair work
- GitHub branch protection/ruleset settings are refreshed during PR observation and merge evaluation rather than continuously monitored; UI shows last observed settings and refresh time with manual refresh
- Stoneforge imports enough GitHub review, reviewer identity, and branch protection/ruleset data to decide Required Review satisfaction, without fully mirroring GitHub reviewer requests, CODEOWNERS assignment, or team notification workflows
- Human Review Outcomes recorded in Stoneforge are posted back to GitHub as PR reviews only through the Human Reviewer's linked eligible GitHub OAuth identity
- GitHub OAuth linking for humans is just-in-time for review or merge actions that require GitHub attribution, not a Workspace onboarding blocker
- Review Agent outcomes are posted back to GitHub as PR reviews while remaining canonical Stoneforge Review Outcomes
- Review Agent GitHub PR reviews may satisfy GitHub-side required review rules when accepted by GitHub branch protection/rulesets; unmet human, CODEOWNER, team, or latest-push eligible reviewer requirements are provider-side merge blockers
- GitHub Issue sync may be bidirectional without forcing a strict one-Issue-to-one-Task mapping
- minimum GitHub Issue sync includes title, body, author, labels, assignees, milestone, state, URL/number, timestamps, and comments needed for Director triage
- GitHub PR review comments and top-level PR comments are visible enough in Stoneforge to support review and repair context
- full bidirectional comment sync, threaded resolution parity, and perfect comment editing/deletion sync are out of scope
- Stoneforge writes back a linked-task comment or status comment, with optional label or status updates when policy enables them
- PRs created from linked Tasks reference the primary linked Issue and relevant secondary Issues; task PRs may close a linked Issue only when that Issue has exactly one linked Task
- when one GitHub Issue decomposes into multiple Tasks, task PRs use non-closing references and the plan PR links back to the source Issue for plan-level closure
- policy-enabled label writeback may manage reserved labels such as `stoneforge:status:*`, `stoneforge:priority:*`, and `stoneforge:complexity:*`
- status, priority, and complexity labels are Stoneforge-owned projections, not GitHub-side commands; direct GitHub edits are reconciled back or surfaced as quiet conflicts
- Issue Intake Policy defaults depend on policy preset: autopilot sends imported Issues to Director triage, while supervised imports Issues as non-dispatchable draft Tasks that may appear in backlog/intake UI
- trusted maintainer labels `stoneforge:auto-dispatch` and `stoneforge:auto-triage` can override the normal intake path unless policy disables label overrides
- `stoneforge:*` labels are set directly on GitHub Issues, but Stoneforge honors them only when applied by a linked trusted maintainer with sufficient GitHub-backed repository permission
- ignored `stoneforge:*` labels surface as Stoneforge UI warnings and lineage events, not public GitHub comments by default
- externally created Issues default to imported non-dispatchable draft state with an external-origin indicator visible to humans in backlog/intake UI and to Directors
- Imported Issue Triage Approval policy defaults to no Issues for autopilot and externally created Issues for supervised

Intentionally not specified yet:

- final Git branch naming scheme
- exact GitHub webhook payload mapping
- field-perfect GitHub Issue sync, GitHub Projects sync, issue forms/schema mapping, and complex sync conflict resolution
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
- imports GitHub Issues as policy-controlled engineering intent or issue-backed Draft Tasks
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
- under plan aggregation, each completed code-changing task creates a task PR that merges into the plan branch
- the plan PR is the plan-level integration MergeRequest; it may remain draft/not-ready while required tasks are incomplete and should be updated to active/ready-for-review when all required task PRs have merged into the plan branch
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
- seed required-check suggestions from GitHub branch protection or rulesets when available, without managing those GitHub settings
- use observed verification state in review, Required Review, merge, repair, and escalation logic
- wait for required Provider Checks to pass or fail before Review Agent dispatch by default, with policy able to allow early Review Agent dispatch before required verification completes
- trigger repair before Review Agent dispatch when required Provider Checks fail, and suppress Review Agent dispatch when missing required checks become policy blockers
- satisfy required Provider Checks only on explicit provider success by default: GitHub check-run `success` or commit status `success`
- keep Verification pending or stale for pending, running, missing, or stale observations; fail required checks for terminal non-success states
- treat `neutral` and `skipped` as not satisfying required checks by default, unless Workspace policy allows either for specific check names
- keep missing required Provider Checks pending while the PR/check observation window is fresh, using a Workspace policy value such as `requiredProviderCheckMissingTimeoutMinutes` that defaults to 10 minutes after PR head observation
- convert missing required Provider Checks to policy blockers rather than Repair Triggers after that timeout, or immediately after GitHub reports all current checks complete and the required check is still missing
- keep `stoneforge/policy` pending during the fresh missing-check observation window, then republish it as failing with a clear missing-check reason once the policy blocker is confirmed
- automatically create a Repair Trigger for the source Task or Plan MergeRequest when a required Provider Check reaches a terminal failing state
- attach provider-check Repair Context with the failing check name, head SHA, provider URL and log summary when available, and whether this is a first or repeated failure
- report failed optional Provider Checks to a Director Agent for triage while keeping them visible as MergeRequest/provider context without creating Repair Triggers or blocking merge unless Workspace policy marks the check required
- run optional-provider-check Director triage in parallel with Review Agent dispatch rather than making review wait for optional triage
- group optional-provider-check Director triage by MergeRequest head SHA, deduping multiple optional failures on the same head into one unresolved triage dispatch and starting a new group for a new head SHA
- limit optional-provider-check Director triage outcomes to non-blocking no-op with rationale, reviewer context, or follow-up Task creation
- persist reviewer context from optional-provider-check Director triage as first-class MergeRequest reviewer context with provenance to the Director Assignment/Session and failed optional Provider Checks
- keep optional-provider-check reviewer context Stoneforge-only by default, visible in Stoneforge review UI and supplied to Review Agents and human reviewers without posting GitHub comments by default
- automatically ingest bounded provider-check failure context rather than full CI logs by default
- show full CI logs inside Stoneforge only when they can be fetched through documented GitHub APIs; GitHub Actions workflow/job logs are required, while other CI provider logs are supported only if GitHub exposes retrievable log data without provider-specific integration
- avoid depending on undocumented GitHub live-log streaming; in-progress checks use refreshed check/job/step metadata until downloadable logs are available
- allow agents to run GitHub Actions locally through the `act` CLI inside capable Runtimes before pushing repair commits
- choose the failed required Provider Check's corresponding workflow/job for local `act` verification when the mapping is clear, otherwise choose the smallest relevant workflow/job from changed files and failure context
- avoid running every workflow by default or requiring a dedicated task-progress entry solely for local verification coverage
- include `act` in managed Runtimes by default when Docker/container execution is available
- report customer-managed Runtime `act` availability as a Runtime capability, with fallback to project-local tests when unavailable
- use the same low-risk preview/dev secret boundary for local `act` verification; injected values are agent-observable and may appear in logs
- treat local `act` verification as partial when required workflow secrets are unavailable or not approved for preview/dev use
- treat local `act` verification as best-effort rather than parity with GitHub-hosted runners, service containers, matrix behavior, hosted runner images, or every Actions feature
- keep local `act` output as session-local agent working context only, without creating Stoneforge UI artifacts, lineage records, repair-context items, Provider Checks, Verification Runs, or GitHub checks/statuses
- require GitHub-observed checks to satisfy required Provider Checks
- rely on normal GitHub Actions push-trigger behavior after repair commits instead of exposing remote rerun controls
- publish only the required `stoneforge/policy` status or check to GitHub from Stoneforge itself
- treat Provider Checks as coming from GitHub Actions or other GitHub-integrated CI providers, not Stoneforge-created auxiliary statuses
- treat any observed GitHub check/status as a Provider Check regardless of whether it originated from GitHub Actions, Buildkite, CircleCI, Jenkins, or another GitHub-integrated CI provider
- make a missing required Provider Check visible as a policy blocker and allow authorized users to disable that policy through a warning-confirmation flow when the Workspace intentionally does not use provider checks

Unsupported in the first slice:

- authoring, hosting, or editing CI/CD workflows
- managing GitHub branch protection or repository rulesets
- using Stoneforge as the provider-side required-check configuration surface
- exposing GitHub Actions rerun, workflow dispatch, or arbitrary remote workflow execution controls
- direct CI provider integrations, provider-specific log APIs, provider-specific log fetching, and provider-specific rerun controls
- relying on undocumented GitHub live-log streaming APIs

Not a first-slice goal:

- authoring GitHub Actions workflows
- running Stoneforge-native CI jobs
- owning deployment promotion or rollback

## Preview Environments

Preview is a first-slice runtime capability, not only a link to an external
provider artifact.

Supported behavior:

- spin up a preview from a task or plan-specific branch on any supported
  first-slice Runtime or Host path
- launch or connect to the app process for the selected task or plan branch
- expose a reachable preview URL or embedded preview surface for operator QA
- allow users to interact with the preview from the Stoneforge UI
- report basic lifecycle status: `starting`, `ready`, `failed`, or `stopped`
- allow authorized users to stop and restart the preview
- associate preview status and links with the relevant Task, Plan, or
  MergeRequest
- support the `reference/smithy-next` Preview direction, including device
  framing and design/annotation handoff where practical

Optional first-slice behavior:

- observe provider-supplied preview URLs or statuses when they are easy to
  integrate

Not a first-slice goal:

- owning deployment promotion or rollback
- becoming a general environment-management platform
- scaling preview infrastructure, custom domains, or production-like environment
  management

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
- validated checkpoint update capture
- cancellation hooks

### OpenAI Codex Adapter

Owns:

- Codex Session invocation and resume
- transcript and log collection
- validated checkpoint update capture
- cancellation hooks

Shared adapter rule:

- provider adapters report execution facts upward; they do not decide planning or merge outcomes

### GitHub App MergeRequest Flow

The first-slice MergeRequest provider path is GitHub-backed, including local
OSS/dev mode. Local development should use the real GitHub App provider
boundary for product acceptance; fake MergeRequest providers are not part of
the local first-slice contract.

The GitHub mode uses App ID plus private key material to mint a GitHub App JWT, discovers or accepts an installation ID, exchanges that identity for installation access tokens, and refreshes tokens behind a small token-provider boundary. The adapter creates or updates the configured working branch, commits a small task change marker, opens or reuses a PR, publishes the `stoneforge/policy` status to the current provider PR head SHA, posts Review Agent outcomes as PR reviews, observes provider PR state, reviews, and checks/statuses, and merges only when explicitly enabled for a sandbox repository/branch.

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

- Director-intent decomposition dispatch
- ready-task dispatch
- PR-created review dispatch
- change-request repair dispatch
- optional-provider-check Director triage dispatch
- platform code-first merge evaluation
- platform code-first failure escalation

First-slice automations have only two action families:

- agent-based actions that create scheduler-evaluated intent for a concrete RoleDefinition
- code-first actions that run explicit workflow code, either as platform-defined handlers inside Stoneforge or as signed outbound webhook calls to user-hosted handlers

Every automation trigger evaluation should create a durable AutomationRun. The
run records the trigger source, evaluated policy, idempotency key, target
object, action type, status, attempts, timestamps, result, and linked follow-up
objects. Agent-based AutomationRuns may create Dispatch Intent that later
produces Assignments and Sessions. Code-first AutomationRuns record platform
handler or outbound webhook attempts and results without pretending to be agent
execution.

AutomationRun states should be unified across action families: `created`,
`blocked`, `delivering`, `retry_wait`, `running`, `succeeded`, `failed`, and
`canceled`. `succeeded` means the automation action itself succeeded; created
Dispatch Intents or other follow-up objects are outputs and linked records.
`blocked` is resumable when policy, eligibility, idempotency, or configuration
facts change. `running` is reserved for long-running code-first workflows
awaiting callback completion.

Long-running code-first AutomationRuns complete through signed callbacks only in
the first slice. Stoneforge should not poll external status endpoints. Callback
receipt returns 200 only after the callback is authenticated, idempotently
accepted, and durably recorded, so the external handler can retry missed or
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
Stoneforge API when credential scope allows. The first slice should not force
those objects to start as drafts. Workspace policy or Automation configuration
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

The first-slice Automations UI should include Automation list/detail views and
AutomationRun history. Run history should be searchable and filterable by
Automation, target or linked object, trigger type, action type, state, source
actor/provider, time window, and correlation or idempotency key.
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

Blocked AutomationRun re-evaluation is controlled by Workspace policy. The
default policy re-evaluates platform automations and non-external user-defined
automations when blocking facts change, but not externally triggered
automations. Alternative policy modes re-evaluate all blocked automations or no
blocked automations.

User-defined automations are also part of the first slice, but within controlled boundaries:

- curated event triggers: Task state changed, Plan state changed, MergeRequest opened or updated, Review Outcome recorded, VerificationRun changed, and AutomationRun changed
- time-based triggers using simple intervals or cron expressions with explicit required timezone
- inbound signed webhook triggers using one unique endpoint per Automation
- agent automation actions using explicit RoleDefinitions
- outbound signed automation webhooks to user-hosted handlers
- no arbitrary "any object changed" triggers until event schemas and loop-prevention rules are stronger
- AutomationRun changed triggers require explicit filters for AutomationRun state, action, and source; no direct self-triggering by default; idempotency keys; and chain-depth caps per root correlation ID
- exceeding the chain-depth cap creates a blocked AutomationRun with reason `automation_chain_depth_exceeded`, root correlation ID and parent-run lineage, and Automations UI visibility; it is not silently dropped
- the user-defined automation chain-depth cap is Workspace policy, defaulting conservatively to `3`; platform automations may use separate internal safeguards
- schedule triggers record evaluated next-run time and timezone in AutomationRun/source metadata
- missed schedule runs after downtime are not backfilled in the first slice; Stoneforge records missed-run visibility, evaluates the next future run, and lets users manually run if recovery is needed
- manual runs of schedule-based Automations create separate AutomationRuns and do not move or reset the next scheduled run time
- inbound webhook endpoints require signed requests and idempotency keys; shared Workspace endpoints are out of scope for the first slice
- inbound webhook signing supports per-webhook signing secrets or a workspace-wide signing secret; policy may disable workspace-wide signing-secret use for stricter isolation
- inbound webhook signing secrets support rotation with an overlap window and last-used metadata
- outbound automation webhook signing supports per-destination signing secrets or a workspace-wide outbound signing secret; policy may require per-destination secrets for stricter isolation
- outbound automation webhook signing secrets support rotation with an overlap window and last-used metadata
- outbound webhook delivery treats `2xx` as success, `408`, `429`, and `5xx` as retryable, and other `4xx` responses as terminal failure
- outbound webhook retries use exponential backoff with a bounded retry count
- `2xx` delivery moves to `running` only when the handler indicates accepted/async long-running work; bounded synchronous `2xx` can complete the run as `succeeded`
- outbound handler responses use an explicit typed response contract: accepted, succeeded, or failed, rather than status-code inference alone
- Stoneforge should provide a recommended but not required TypeScript-first Stoneforge SDK for interacting with the Stoneforge API, including Automation handler support for signature verification, typed responses, callbacks, AutomationRun Credential API client setup, and thin helpers for common workflow API actions such as create Task, create Plan, request Director triage, link objects, complete or fail an AutomationRun, and read scoped context
- the outbound automation webhook protocol is language-agnostic; the first-slice Stoneforge SDK ships for TypeScript first, with other languages left for later or manual implementation
- the TypeScript Stoneforge SDK is in first-slice scope, but its required surface is limited to auth/client setup, Automation webhook signature verification, typed accepted/succeeded/failed responses, callback helpers, and the common API wrappers needed by first-slice workflows
- first-slice product-level API scope is required only where external actors depend on stable contracts: the Agent Command Surface, Stoneforge SDK and Automation handler APIs, GitHub webhook/provider integration boundaries, and minimal UI/backend private APIs needed by the app. A fully public REST or GraphQL API for every object is out of scope. Internal domain and persistence APIs remain implementation detail, with type-driven contracts and normalized data model expectations documented for engineering.

## First Build Entrypoint

The first vertical proving scenario should use the simplest full path that exercises the real control plane:

The first-slice setup path should be a guided onboarding wizard based on the
`reference/smithy-next` prototype onboarding flow. The wizard may add steps for
missing first-slice requirements, but should not remove setup steps already
present in the prototype direction.

A seeded local demo or sandbox Workspace may be included for local OSS/dev mode
if it is cheap, but it is not part of core MVP acceptance criteria. The required
path is real GitHub-backed onboarding through the onboarding wizard.

The first slice must have documented local OSS/dev and self-hosted deployment
paths. Local dev should run with SQLite or local Postgres, a clearly marked
single-user principal, local filesystem/dev secret storage, and real GitHub App
configuration for repository testing. Self-hosted team deployments should use
Postgres, durable object or file storage for logs and artifacts as needed, a
configured GitHub App, OAuth or OIDC human authentication, secret storage,
worker and Host connectivity, and clear environment readiness checks.
Kubernetes, high availability, backup/restore automation, managed upgrades,
billing, multitenant SaaS operations, and a Stoneforge-hosted cloud service are
out of scope for the first slice.

Release acceptance should prove local/self-hosted operability, not only document
it. Require repeatable local OSS/dev setup and repeatable self-hosted team setup
with documented environment variables, GitHub App setup, database/storage setup,
secret storage expectations, Host/Runtime connectivity checks,
health/readiness checks, and troubleshooting for common misconfiguration.
One-click installers, Kubernetes manifests, HA topology, backup automation,
managed upgrades, and production SRE runbooks are out of scope.

1. create an Org and Workspace
2. connect one GitHub repository through the GitHub App
3. configure one policy preset, one Runtime, and one Agent while Stoneforge bootstraps default Director, Worker, and Reviewer RoleDefinitions
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
- it proves dispatch, Assignment, Session, PR, Verification Run, review, Required Review, merge, and repair on one narrow path
- it avoids plan aggregation complexity until the direct task path is stable

## Implementation Slices

### Slice 1: Workspace Ready Path

Exact outcome:

- a Workspace can move from `draft` to `ready` against one real GitHub repo and one valid execution capability path

Touched subsystems:

- Org and Workspace model
- GitHub App onboarding
- Workspace policy preset selection
- Runtime and Agent configuration
- platform-created default Director, Worker, and Reviewer RoleDefinitions
- workspace validation and audit

Dependencies:

- none; this is the foundation slice

Acceptance criteria:

- a Workspace can be created under an Org
- GitHub App installation links exactly one repository
- one Runtime and one Agent can be configured successfully
- default Director, Worker, and Reviewer RoleDefinitions are auto-created for the Workspace and can later be modified or deleted by authorized users
- RoleDefinitions can be created, edited, disabled, deleted, and tracked with simple version/history records; Assignments snapshot or reference the RoleDefinition version they start with
- onboarding wizard completes the first Org/Workspace/repository/runtime/agent/policy/default-role setup path or shows clear readiness blockers
- the Workspace enters `ready` only when repo connectivity and execution capability validation both pass
- deleting or breaking a default RoleDefinition surfaces a workflow readiness blocker for the affected Director, Worker, or Reviewer path rather than making the entire Workspace not ready when repo connectivity and an execution path remain valid
- first-slice success is measured by operational completion, not growth: repo onboarded to `ready`, intent created/imported, Director Task/Plan created, Worker code change completed, PR opened, verification/review gates evaluated, at least one repair loop handled, merge completed with `stoneforge/policy`, audit/lineage, Documents context, and GitHub sync visible
- first-slice acceptance includes automated product coverage for the golden workflow through end-to-end or integration tests: onboarding a real GitHub-backed Workspace, configuring Runtime/Agent/RoleDefinition/policy, creating or importing intent, Director Task/Plan creation, Worker execution, PR creation, Verification Run observation, Review Outcome, at least one repair loop, and merge/policy evaluation; exact test tooling is not prescribed beyond repo standards, but the proving scenario must exercise real GitHub integration rather than fake providers
- automated golden-workflow acceptance may use a deterministic test Agent/adapter for stable CI coverage of Stoneforge workflow state machines, GitHub PR flow, policy, review, repair, and merge behavior; separate release smoke coverage should prove real Claude Code and OpenAI Codex adapter launch, resume, cancel, Session identity, progress, and outcome paths against real providers or supported local app-server integration, without making every golden-path test depend on live LLM quality, latency, or cost
- first-slice acceptance includes a lightweight security checklist for GitHub App permissions and token lifetime, OAuth identity linking, RBAC/reviewer eligibility, Session Command Credentials, AutomationRun Credentials, webhook signing and idempotency, secret-backed provider and registry proxies, preview/dev secret warnings, policy-bypass paths, AuditEvents for sensitive actions, and raw log/payload retention and redaction; formal SOC2/compliance certification, penetration testing, and a full threat-model program are out of scope
- operators can understand why work is blocked from the relevant UI surfaces
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
- validated checkpoint update and heartbeat capture
- Effect runtime and OpenTelemetry spans for dispatch, lease, Assignment, Session, adapter, and recovery boundaries

Dependencies:

- Slice 1

Acceptance criteria:

- creating or updating a Task can transition it into `ready`
- the Scheduler persists and retries dispatch intent instead of dropping work
- Runtime/Host or provider capacity and any configured Agent throttle are leased and released correctly
- a provider Session starts and reports heartbeats, progress events, or provider status facts appropriate to its adapter
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

- Session crash or context exhaustion preserves usable bounded checkpoint progress
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
- each completed code-changing planned task creates a task PR
- under plan aggregation, task PRs merge into the plan branch and Stoneforge updates the plan PR from draft to active/ready-for-review when all required tasks are complete
- the plan PR can observe verification and review state
- plan-level review supports Review Agent outcomes and any policy-required Human Reviews
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
- collect validated checkpoint updates, logs, and outcome

### Managed Sandbox Execution

- configure Daytona as a managed sandbox Runtime
- dispatch a ready task through that Runtime
- create a PR and observe verification

### Repair And Recovery

- resume after Session crash or context exhaustion
- require task repair from review feedback
- redispatch repair work as a new Assignment

### Review And Merge

- move task work through PR, Verification Run observation, automated review, Required Review when configured, Stoneforge policy check, and merge

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
- become a general-purpose CI/CD platform
- own deployment promotion, rollback, or environment management
- become a general-purpose IDE or editor-centered product
- support multi-repo Workspaces
- support non-GitHub source-control providers
- support GitHub Projects sync
- support full GitHub comment sync, threaded resolution parity, or perfect comment editing/deletion sync
- support provider-specific CI integrations beyond GitHub checks/statuses and logs available through documented GitHub APIs
- host CI natively or expose remote GitHub Actions rerun/workflow-dispatch controls
- support semantic or vector Document search
- support rich binary Document editing or complex block-editor Documents
- operate a Stoneforge-hosted cloud service, billing system, multitenant SaaS operations, SSO enforcement, high availability, or backup/restore automation
- expose an arbitrary public REST or GraphQL API for every object
- build mobile apps
- build advanced analytics or reporting
- build saved-query systems, custom dashboards, or cross-workspace operational
  reporting beyond pragmatic list filtering for operator triage
- build product-facing metrics dashboards, tracing UI, performance analytics,
  cost analytics, usage analytics, or Workspace/Org reporting
- build token accounting, per-task cost reporting, budget alerts, invoices,
  chargeback, pricing plans, or model-cost analytics
- build advanced marketplace roles, role-template libraries, multi-version role
  rollout controls, role A/B testing, or cross-workspace role sharing
- build broad Workspace export/import, audit export, portable project archives,
  backup/restore automation, or migration tooling as product requirements
- build one-click installers, Kubernetes manifests, HA topology, backup
  automation, managed upgrades, or production SRE runbooks
- require a full formal WCAG audit, advanced screen-reader workflow
  certification, localization, or comprehensive keyboard shortcut customization
- build email, Slack, digest preferences, escalation schedules, notification
  routing rules, or webhook notification delivery as first-class notification
  channels outside user-defined Automations
- migrate or import existing Stoneforge V1 or Smithy production data into V2
- make agent quality or autonomy guarantees beyond bounded task quality,
  recoverable failures, visible blockers, review and verification gates, repair
  loops, and audit/lineage
- support arbitrary in-process user workflow code hosting

First-slice scope should stay limited to the paths required for the golden
workflow, onboarding, review, repair, merge, Automations, Documents, and
local/self-hosted operation.

Preview support should include a Stoneforge-controlled API, CLI, or tool path
for starting, stopping, restarting, and inspecting preview processes for task
or plan branches. Preview environment variables are allowed only as low-risk
dev-preview inputs: because app code can render or log env values, the first
slice must not imply that container or process separation fully protects
sensitive secrets from an adversarial agent.

## Build Milestone Order

Implementation should cluster in this order:

1. Org and Workspace foundation with GitHub App onboarding
2. Runtime, Host, Agent, and RoleDefinition configuration
3. Scheduler queueing, leasing, Assignment, Session, and validated checkpoint flow
4. Task PR, Verification Run observation, review, Required Review, and merge path
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
