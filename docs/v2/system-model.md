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
- Session is the concrete provider execution context under an Assignment; it may be a durable provider conversation/session record rather than a live connection
- Session is not a human-visible work grouping
- MergeRequest is the provider-neutral internal review and merge artifact
- Host, Runtime, Agent, RoleDefinition, Automation, and Scheduler stay separate concerns

Working assumptions:

- Org is the top-level tenant, identity, and membership boundary
- Workspace policy is the main enforcement context, with Org policy supplying defaults and guardrails
- tags are supported on Runtime, Agent, Task, and Automation for matching, and on RoleDefinition for organization and role selection
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

- simple Org administration is in scope: create or select Org, manage Workspaces, basic membership and roles, and GitHub org/repo permission projection
- advanced org billing, SSO enforcement, audit export, cross-Workspace policy inheritance, and org-wide analytics are out of scope
- first-slice setup uses a guided onboarding wizard based on the `reference/smithy-next` prototype onboarding flow; additions are allowed for missing first-slice requirements, but existing prototype setup steps should not be removed
- a seeded local demo or sandbox Workspace may be included for local OSS/dev mode if cheap, but core MVP acceptance requires real GitHub-backed onboarding
- local OSS/dev product acceptance uses SQLite or local Postgres, a single-user principal, local filesystem/dev secret storage, and real GitHub App configuration; fake providers are not part of the local first-slice product contract
- self-hosted team deployments use Postgres, durable object or file storage for logs and artifacts as needed, a configured GitHub App, OAuth or OIDC human authentication, secret storage, worker and Host connectivity, and readiness checks; Kubernetes, high availability, backup/restore automation, managed upgrades, billing, multitenant SaaS operations, and a Stoneforge-hosted cloud service are out of scope
- V1 or Smithy data migration is out of scope; first-slice setup creates clean V2 Orgs, Workspaces, policies, Agents, Runtimes, Documents, Automations, Tasks, and Plans
- broad Workspace export/import, audit export, portable project archives, backup/restore automation, and migration tooling are out of scope as product requirements; minimal JSON or debug exports may exist as engineering conveniences only
- one primary GitHub repository per Workspace in the first slice; cross-repository Workspaces are out of scope
- dispatch, review, merge, policy, and audit are evaluated within the Workspace boundary
- Workspace `ready` means repository connectivity, policy, and at least one execution path are valid; individual workflow categories may still have workflow readiness blockers
- broken or deleted default Director, Worker, or Reviewer RoleDefinitions block only the affected workflow category by default, not the whole Workspace, as long as repo connectivity and one execution path remain valid

### Policy

Purpose:

- describes what may happen automatically, what requires review, and what requires approval

Owned by:

- Org or Workspace

Key associations:

- effective Workspace policy is derived from org-level defaults plus workspace-level preset and overrides
- evaluated during dispatch, review, Required Review, merge, secret use, and sensitive administrative actions
- includes raw record retention controls for Session transcripts, provider logs, CI logs, Automation payloads, preview logs, and runtime logs

Frozen semantics:

- there is one policy system with multiple presets
- supervised automation is the default preset for the first slice
- autopilot is also supported in the first slice to prove the policy model
- first-slice UI includes a simple Workspace policy configuration surface for choosing `autopilot` or `supervised`, configuring documented first-slice policy values, and showing effective policy and readiness consequences
- generic rule builders, scripting policy languages, org-wide inheritance UI, policy simulation, policy version diffing, and bulk policy management are out of scope

### Notification Surface

Purpose:

- helps operators notice blocked or action-required work inside Stoneforge

Owned by:

- Workspace

Key associations:

- readiness blockers
- policy decisions
- human review or activation requirements
- Verification Runs
- Repair Triggers
- AutomationRuns
- Host and Runtime health

Frozen semantics:

- first-slice notifications are in-app surfaces only
- in-app notifications should cover readiness blockers, human review needed, policy-required approval or activation, failed required verification, repair escalation, blocked or failed AutomationRuns, Host or Runtime disconnects, and missing configuration
- email, Slack, digest preferences, escalation schedules, notification routing rules, and webhook notification delivery are out of scope as first-class notification channels unless implemented by user-defined Automations

### Operational List

Purpose:

- helps operators find, filter, and triage first-slice objects without needing advanced analytics

Owned by:

- Workspace or Org, depending on object scope

Key associations:

- Tasks, Plans, MergeRequests, Sessions, Automations, AutomationRuns, Agents, Runtimes, RoleDefinitions, Documents, and Workspaces

Frozen semantics:

- first-slice operational object lists should be searchable and filterable using obvious fields such as state, status, owner or actor, linked object, branch, PR, risk, tags, updated time, and blocker presence
- operational lists support triage and visibility, not advanced analytics
- saved-query systems, custom dashboards, and cross-workspace reporting are out of scope for the first slice

### Product Observability

Purpose:

- gives operators enough product-visible evidence to understand and recover workflow state

Owned by:

- Workspace

Key associations:

- Execution Lineage
- Audit Trail
- Session transcripts and logs
- AutomationRun history
- Host and Runtime health
- Verification Runs and Provider Checks
- Policy blockers
- Notification Surfaces
- Operational Lists

Frozen semantics:

- product-facing observability is limited to operator workflow visibility in the first slice
- OpenTelemetry remains required for engineering diagnostics, but Stoneforge does not expose a first-slice tracing UI or metrics dashboard as product scope
- performance analytics, cost analytics, usage analytics, and Workspace or Org reporting are out of scope

### Accessibility Baseline

Purpose:

- ensures first-slice operator workflows remain usable without creating a separate compliance program

Owned by:

- UI implementation

Key associations:

- Navigation
- Operational Lists
- Notification Surfaces
- MergeRequest review
- policy blockers
- Verification Runs
- progress/status surfaces

Frozen semantics:

- first-slice UI should use semantic HTML where applicable, support keyboard navigation for primary workflows, show visible focus states, provide accessible labels for controls and icons, use readable contrast, and expose screen-reader-friendly status text for blockers, review state, verification, and progress
- a full formal WCAG audit, advanced screen-reader workflow certification, localization, and comprehensive keyboard shortcut customization are out of scope

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
- may link to one primary GitHub Issue and optional secondary GitHub Issues when issue sync is enabled
- may accumulate many Assignments over time
- may accumulate one or more MergeRequests across repair loops
- may reference one prior terminal source Task, source outcome, and optionally one source MergeRequest when created as a Follow-Up Task

Frozen semantics:

- Tasks carry title, intent, acceptance criteria, priority, dependencies, and structured task progress state
- GitHub Issues are first-slice engineering-intent sources, but they are not automatically dispatchable Tasks
- workspace policy controls whether imported Issues are ignored, imported as intent, queued for Director triage, converted to Draft Tasks, or automatically promoted for trusted authors, teams, labels, milestones, or repositories
- `backlog` is UI/product grouping language for non-dispatchable Tasks, not a separate canonical Task state
- Issue Intake Policy defaults are preset-driven: autopilot imports and syncs Issues into Director triage; supervised imports and syncs Issues as non-dispatchable draft Tasks that may appear in backlog/intake UI
- draft or otherwise non-dispatchable Tasks created from GitHub Issues cannot become ready without a human status change or a human instruction to send them to Director triage
- trusted maintainer labels `stoneforge:auto-dispatch` and `stoneforge:auto-triage` may override the normal intake path unless policy disables trusted-maintainer label overrides
- `stoneforge:*` labels are provider facts on GitHub Issues, but Stoneforge honors their intake effects only when the label was applied by a linked trusted maintainer with sufficient GitHub-backed repository permission
- `stoneforge:*` labels applied by unlinked users, external contributors, or actors without sufficient permission are ignored for Stoneforge intake automation
- ignored `stoneforge:*` labels produce quiet UI warnings and workflow/audit lineage, not public GitHub comments by default
- externally created Issues default to imported non-dispatchable draft state with an external-origin indicator visible to humans in backlog/intake UI and included in Director context
- Imported Issue Triage Approval policy controls whether no Issues, only externally created Issues, or all Issues require human approval before Director triage; defaults are no Issues for autopilot and externally created Issues for supervised
- bidirectional GitHub Issue sync may create or update linked Issues from Stoneforge Tasks and update Stoneforge intent or task metadata from linked Issues, without requiring a strict one-Issue-to-one-Task mapping
- minimum imported Issue context includes title, body, author, labels, assignees, milestone, open/closed state, URL/number, timestamps, and comments needed for Director triage
- GitHub PR review comments and top-level PR comments should be visible enough in Stoneforge to support review and repair context
- Stoneforge may write linked-task or status comments back to GitHub Issues, and may update labels or status when policy enables it; field-perfect sync, full bidirectional comment sync, threaded resolution parity, perfect comment editing/deletion sync, and complex conflict resolution are out of scope
- PRs created from linked Tasks reference the primary linked GitHub Issue and relevant secondary Issues; task PRs may use issue-closing keywords only when the linked Issue has exactly one linked Task
- when one GitHub Issue decomposes into multiple Tasks, task PRs use non-closing references and the plan PR links back to the source Issue for plan-level closure
- policy-enabled Stoneforge label writeback may mirror status, priority, and complexity onto reserved `stoneforge:*` GitHub Issue labels, while Stoneforge remains the workflow source of truth
- status, priority, and complexity labels are Stoneforge-owned projections in the first slice, not GitHub-side commands; GitHub-side edits are reconciled back or surfaced as quiet conflicts
- Task Progress Record lives on the Task, not in hidden prompt state and not in a required per-task Document
- first-slice Checkpoints are bounded restart-context updates to Task todo or Acceptance Criteria status, with optional short notes, key files, and key insights
- Checkpoint updates are submitted through the broader Stoneforge agent CLI/tool surface, not a checkpoint-specific tool; the action validates input immediately and reports errors to the agent
- implementing agents may add small task-local todo items through checkpoint updates, but they must not add or change Acceptance Criteria; Acceptance Criteria are part of the Task contract set on creation and require Director or human task-edit/review flows to change
- entering `repair_required` records the Repair Trigger and attaches the best available Repair Context immediately, while the failure, review, verification, policy, mergeability, or branch-health information is freshest
- `repair_required` is itself the scheduler-dispatchable state for repair work; it does not need to transition through `ready` to launch a repair Assignment
- `ready` is reserved for non-repair Task-owned dispatch when no unresolved Repair Context exists
- a repair Assignment may target one or more unresolved Repair Context items and mark each targeted item `resolved`, `unresolved`, `superseded`, or `unsafe`
- each Repair Context item has a stable ID and immutable provenance, including source trigger type, source object, relevant Assignment, Session, MergeRequest, head SHA, creator or service actor, created time, current status, and status history
- Repair Context item content is append-only; resolution, supersession, and unsafe decisions are validated status transitions rather than destructive edits
- repeated Repair Triggers update or refresh an existing unresolved Repair Context item when the source and semantic key match; materially different sources create new Repair Context items
- material Repair Context differences include a new head SHA, different failing Provider Check, new reviewer Change Request, new branch-health condition, or policy decision with different required action
- new Repair Triggers that arrive while a repair Assignment is running on the same Task attach or deduplicate Repair Context immediately, but do not start a second parallel repair Assignment for that Task by default
- running repair Assignments receive updated Repair Context at command/context refresh or checkpoint boundaries; Stoneforge interrupts or escalates only when the current repair direction becomes unsafe or an authorized operator explicitly intervenes
- Stoneforge validates Repair Context status transitions; repair Assignments may propose `superseded` or `unsafe`, and authorized humans may mark items superseded or unsafe with AuditEvents
- `superseded` requires newer review, verification, branch-health, or policy facts that make the old context obsolete; `unsafe` moves the Task toward `human_review_required` unless policy allows another autonomous repair attempt
- repair Assignment outcome drives the next Task state based on remaining unresolved or unsafe Repair Context: no remaining unresolved or unsafe context plus code ready for review moves to `awaiting_review`, no remaining unresolved or unsafe context plus non-code completion moves to `completed`, no remaining unresolved or unsafe context with task work remaining moves to `ready`, unresolved context with autonomous retry allowed returns to `repair_required`, and unsafe context or exhausted retry moves to `human_review_required`
- Task Progress Summary is generated on demand from the Task Progress Record for agent prompt assembly and UI overview; it cites source Checkpoints and Repair Context and is not persisted as an MVP source of truth
- same-Task resumed Assignments and repair Assignments automatically include a generated Task Progress Summary in prompt assembly
- Follow-Up Tasks use explicit Follow-Up Context rather than automatically inheriting the source Task Progress Summary
- Task Progress Record stores structured Checkpoints and Repair Context, with references to relevant Assignment, Session, transcript, log, and event records
- full provider transcripts belong to Session or Execution Lineage storage, not Task Progress Record content
- AuditEvents and durable Workflow Events are append-only and retained indefinitely by default in local and self-hosted deployments unless an administrator configures retention
- Checkpoints, Repair Context, bounded summaries, lineage, object state, review outcomes, and merge decisions are retained longer than raw transcripts/logs
- a Task is not execution history

### Plan

Purpose:

- groups related Tasks into one coordinated execution scope

Owned by:

- one Workspace

Key associations:

- contains multiple Tasks
- may own one plan-level MergeRequest when aggregation is enabled
- when aggregation is enabled, the plan-level MergeRequest may be created or held as draft/not-ready while required Tasks are still incomplete, then updated to active/ready-for-review when required task PRs have merged into the plan branch

Frozen semantics:

- a Plan is an execution-supervision grouping object, not a second task engine
- Tasks in a Plan are not dispatchable until the Plan is activated
- in the first slice, planned code-changing Tasks follow the workspace Merge Topology, which may aggregate through a Plan Branch and plan PR or merge directly to the Workspace Target Branch
- code-changing Tasks create task-level MergeRequests; under plan aggregation those task PRs merge into the plan branch before the plan PR is reviewed and merged to the Workspace Target Branch
- a Plan may own a plan-level MergeRequest, but implementation, repair, review, and merge-evaluation execution attach to Tasks or MergeRequests rather than directly to the Plan

### Editor Commit

Purpose:

- records a human-authored repository branch edit made through a Stoneforge code or Document editing surface

Owned by:

- Workspace

Key associations:

- authenticated Human User
- Source-Control Provider branch and commit SHA
- optional Task, Plan, MergeRequest, Document, or docs PR context

Frozen semantics:

- the first-slice editor is a supporting intervention surface, not the core workflow
- authorized humans may edit files on any Workspace branch and commit through the UI when provider permissions and branch protections allow it
- Task, Plan, MergeRequest, or Document contexts may preselect relevant branches but do not restrict the editor to those branches
- unlinked editor commits do not automatically create a Task, Plan, MergeRequest review workflow, or agent dispatch
- if an editor commit affects an observed MergeRequest or workflow branch, normal provider observation, Verification Run, Required Review freshness, Mergeability, and Stoneforge policy re-evaluation apply
- direct target-branch commits are governed by GitHub permissions and branch protection, not by a synthetic Stoneforge merge workflow
- Stoneforge may offer agent-assisted commit message generation; generated messages are human-reviewed suggestions, not autonomous commits

### Document

Purpose:

- durable shared context layer for the Workspace

Owned by:

- one Workspace

Key associations:

- may be referenced by Tasks, Plans, Assignments, MergeRequests, or Automations
- has title, workspace-relative document path or filename, body/content, content type, category/tags, version history, creator/editor attribution, linked workflow objects, visibility according to Workspace policy, and explicit agent-context selection metadata
- belongs to a Document library, such as the standard Workspace documentation library or the system-managed operational docs library
- has a source mode: Stoneforge-only, repo-backed, or mirrored
- may have first-class relative Markdown file links to other Documents in the same Workspace
- may have one optional primary system category and many freeform Workspace-scoped tags
- may be indexed for full-text search by title and body
- may be part of the Workspace Documentation Methodology as the Documentation Directory, a Level 2 entry point Document, or a Level 3 deep-dive Document

Frozen semantics:

- Documents hold reusable context such as specs, runbooks, and review notes worth preserving beyond one assignment
- first-slice Documents are organized into at least two libraries: standard Workspace documentation rooted at the Documentation Directory, and a separate system-managed operational docs library
- system-managed operational Documents are visible operational metadata for Stoneforge-maintained workflows, not normal product or engineering documentation by default
- the Documents UI defaults to the Workspace Documentation Library and exposes the Operational Docs Library through a clear library selector or filter such as "Operational/System"
- operational docs are visible but separated, not hidden behind a deep admin-only path
- Operational Docs Library Documents default to Stoneforge-only source mode in the first slice
- first-slice operational docs are not mirrored into the repository docs root and should not create repository PR churn by default
- Documents are not the hidden memory system for agent progress handoff
- Documents are not task progress records or raw transcripts
- Document visibility and access inherit Workspace policy in the first slice
- document-specific ACLs are out of scope
- sensitive operational knowledge that requires different access belongs in a separate Workspace or future document-level controls
- first-slice Documents support durable workspace context CRUD, viewing, editing, version history, and explicit links from Tasks, Plans, Assignments, MergeRequests, Automations, and RoleDefinitions
- first-slice Documents use Markdown/plain text as the primary editable type and support URL/reference documents for external resources
- URL/reference Documents may participate in the Documentation Directory and Level 2/Level 3 Documentation Methodology like other Documents
- URL/reference Document content is metadata plus optional human- or agent-written summaries and notes
- first-slice URL/reference Documents do not automatically crawl or ingest arbitrary external pages by default
- agents may open referenced URLs only when their RoleDefinition and tool access allow it
- durable knowledge learned from an external source should be summarized into a normal Document when it matters long term
- external knowledge becomes a normal Markdown Document when the team will rely on it without always revisiting the external source; the Document should include summary, rationale, and source link
- URL/reference Documents are used when the external page itself remains the thing to consult and Stoneforge only needs a pointer plus notes
- default repository-linked Workspaces use mirrored docs, with the repository docs folder selected during onboarding
- mirrored-doc onboarding detects common documentation paths such as `docs/`, `documentation/`, `.github/`, and root Markdown docs, then asks the user to confirm or choose one primary docs root
- if no docs folder exists, onboarding offers to create `docs/` with the Documentation Directory
- multiple docs roots are out of scope for the first slice
- Stoneforge Documents are the Workspace context surface for agents and UI; repository docs files are source-controlled artifacts for teams that want docs in Git
- for repo-backed or mirrored docs, docs-drift PRs change repository files and Stoneforge updates or reindexes corresponding Document objects from the merged source
- Stoneforge-only Documents use Stoneforge-owned content version history
- repo-backed and mirrored Documents derive content history from Git commits and PRs
- Stoneforge records Document indexing events, metadata changes, category/tag changes, link-resolution changes, and agent-context selection events across all source modes
- in mirrored mode, repository PR merge is the authoritative write path
- Stoneforge UI edits to mirrored Documents create a new docs PR or add a commit to an existing docs PR; those edits are imported into the mirrored Document object after merge
- the Documents UI may show or hide pending PR changes, or let users select a branch or docs PR context for viewing and editing pending Document changes
- conflicting pending Document edits are handled through normal source-control merge conflict handling rather than a separate document conflict system
- internal Document Links use normal relative Markdown file links across all Document source modes
- in mirrored or repo-backed modes, relative Document Links resolve to files under the primary docs root
- in Stoneforge-only mode, relative Document Links resolve through the Document's workspace-relative document path or filename
- the Documents UI makes relative Document Links clickable and may provide autocomplete or link insertion without requiring users to hand-author Stoneforge IDs or slugs
- first-slice Document categories are a small system set for UI and search facets, initially including `spec`, `runbook`, `design`, `decision`, `review-note`, and `reference`
- first-slice Document tags are freeform and Workspace-scoped
- nested document category trees are out of scope
- first-slice Document search supports keyword/full-text search across title and body with filters for category, tags, content type, linked workflow object, creator/editor, and updated time
- Document search ranking should use BM25 across SQLite and Postgres deployments; SQLite uses its native full-text search path, while Postgres uses the `pg_textsearch` extension
- semantic or vector Document search is out of scope unless it is trivial to add without distracting from core workflow search
- each Workspace maintains a top-level Documentation Directory Document that links to Level 2 entry point Documents and includes short descriptions and keyword lists
- the Documentation Directory is a hybrid managed/editable Document: users and agents may edit it, while Stoneforge recognizes it as the managed Workspace entry point
- Documentation Directory assistance includes link validation, missing Level 2 entry point warnings, stale keyword or description warnings, and special Docs Drift Automation attention
- the Documentation Directory is not fully generated and overwritten
- the Documentation Methodology has three levels: Level 1 Documentation Directory, Level 2 entry point Documents, and Level 3 deep-dive Documents
- Code References act as a Layer 4 reference target in the Documentation Methodology
- any Document level may link directly to code files or line ranges when code is clearer or more efficient than prose
- code remains the ultimate source of truth; Documents make context-building more efficient and explain why decisions were made
- Code References in Document content use repository-relative file paths with optional line anchors or ranges
- Stoneforge lineage resolves materially-used Code References to the relevant commit SHA when recorded
- the UI displays friendly path and line range while preserving the commit-backed reference for review and audit
- Code Reference validation checks that referenced files exist on the relevant branch and warns on missing paths or obviously stale line anchors/ranges
- first-slice Code Reference validation does not require perfect semantic validation that the referenced code still proves the documented claim
- Docs Drift Automation may flag suspected stale Code References during periodic checks
- first-slice Code References are limited to the Workspace primary repository
- cross-repository code references are represented as URL/reference Documents or ordinary external links until cross-repo validation, commit resolution, permissions, and review/audit scope are designed
- Document discovery for agents starts with explicit context selection, linked Documents, and Documentation Directory browsing; search is available through the Agent Command Surface but is not the only discovery path
- Document browsing is open-ended full-Document reading and relative-link traversal, usually starting from the Documentation Directory
- Document Search is targeted lookup for a specific topic, concept, keyword, or filtered set of Documents
- Document read, search, and browse actions are automatically recorded in lineage for observability
- agents may explicitly mark Documents as materially used when those Documents influenced the work
- agents should mark a Document as materially used immediately after relying on it for a decision or implementation direction
- materially-used Documents are decision and implementation lineage, distinct from documentation Acceptance Criteria
- materially-used Document markers require a short reason explaining why the Document mattered
- materially-used Document reasons are visible to Review Agents and humans inspecting the Task or MergeRequest
- agents may mark materially-used Code References when code files or specific line ranges influenced a decision, implementation direction, or docs-drift fix
- materially-used Code References are especially important for Docs Drift Automation because code is usually the evidence for code-to-docs drift
- broad Workspace document context is not injected into every Session by default
- Documents materially used by agents through search or browsing should be cited or linked in Execution Lineage
- Directors should consult the Documentation Directory when decomposing non-trivial or concept-changing work
- Workers should consult linked or selected Documents and the Documentation Directory when the Task has documentation Acceptance Criteria or touches documented concepts
- Review Agents should check relevant Documents when validating documentation Acceptance Criteria or reviewing concept changes
- agents are not forced to read every linked Document when a Document is clearly irrelevant
- agents should record which Documents materially informed their work in lineage
- Tasks should include Acceptance Criteria requiring documentation updates when their work adds, removes, or changes durable code or product concepts
- every code-changing or concept-changing Task should include a default documentation Acceptance Criteria to update relevant Documents or record why no documentation change is needed
- pure investigation, review, or administrative Tasks may omit the default documentation Acceptance Criteria when they do not affect durable code or product concepts
- task-completing agents are responsible for updating relevant Documents as part of task completion when documentation Acceptance Criteria apply
- task-completing agents may satisfy documentation Acceptance Criteria by recording a short no-docs-needed rationale when no documentation change is warranted
- Review Agents should verify documentation-update Acceptance Criteria during task review
- default Director, Worker, and Reviewer RoleDefinitions should include instructions to use and maintain the Documentation Directory and Documentation Methodology when creating, selecting, updating, or reviewing Documents
- default docs-drift and docs-quality Automations are periodic or manually scoped, not per-code-change updaters
- the daily scoped Docs Drift Automation runs every configurable X hours, defaulting to every 24 hours overnight, and inspects changed files since the last drift run, open or unmerged docs-drift PRs, existing Code References, and docs-linked areas from the Documentation Directory
- the weekly deep Docs Drift Automation periodically assesses broader codebase/documentation alignment
- deep docs-drift scanning may split the codebase into sections and dispatch multiple agents, each responsible for one section, to avoid context overload and quality decay
- weekly deep Docs Drift Automation starts with a Director-style sectioning run that inspects repository structure and Documentation Directory topology
- the sectioning run creates a Plan with one docs-drift Task per section it defines
- weekly deep docs-drift Plans follow the same Workspace Plan activation policy as all other Plans; there is no docs-specific human activation policy
- the weekly deep Docs Drift Director creates and maintains a stable docs-drift section map Document in Stoneforge
- the Docs Drift Section Map belongs in the system-managed operational docs library by default, not in the standard Documentation Directory library
- the Director reuses the stable section map when possible and revises it when repository structure or Documentation Directory topology changes
- section-boundary change rationale is not a separate required record because normal agent Session lineage captures Director reasoning
- the Docs Drift Section Map is an authorized human-editable Markdown Document without schema validation in the first slice
- human edits to the Docs Drift Section Map are versioned and visible in normal Document lineage
- the next Director sectioning run interprets the map and may preserve, repair, or revise it when it is unclear, stale, or inconsistent with repository or documentation topology
- normal scheduler dispatch handles section Tasks, with each Worker responsible for its section
- docs-drift Task outputs follow the standard task PR flow and aggregate into a single plan branch and plan PR by default
- Docs Drift Automations dispatch agents to fix issues they find, accumulating changes on a dedicated docs-drift branch and draft PR
- docs-drift agents record materially-used Code References when code evidence drives a finding or fix; materially-used Document markers are used only when existing Documents influenced the fix
- docs-drift Tasks are docs-only in the first slice
- code issues found during docs-drift work are reported to a Director for triage or follow-up Task creation rather than patched by the docs-drift Worker
- docs-drift Tasks may create new Documents when the Documentation Methodology calls for it
- section Workers may create missing Level 2 or Level 3 Documents, update the Documentation Directory, add Code References, and update relevant links
- in mirrored mode, new or edited Documents created by docs-drift work flow through the docs PR and standard review process
- daily scoped Docs Drift Automation uses one docs-drift PR per run
- weekly deep docs drift aggregates section task PRs into one plan branch and one plan PR by default
- risky or unrelated section changes may be split into follow-up Plans or Tasks by the Director or policy
- docs-drift PRs use the same MergeRequest framework as code PRs, while policy may distinguish docs-only changes
- default docs-only PR review requires Review Agent review
- Stoneforge creates a default docs-focused Reviewer RoleDefinition for docs-only and docs-drift PRs
- the docs-focused Reviewer RoleDefinition stays in the reviewer role category and uses the normal Review Outcome model
- its prompt/checklist focuses on clarity, correctness, link and Code Reference quality, Documentation Methodology fit, and whether doc deletions are justified
- Workspaces may edit or delete the docs-focused Reviewer RoleDefinition like other default RoleDefinitions
- code PRs that include documentation changes keep the normal code Review Agent as the sole automatic Review Agent
- Stoneforge does not add a second docs-focused review automatically for mixed code/docs PRs
- normal code Reviewer RoleDefinitions include docs-focused review pointers for documentation Acceptance Criteria, Document Link quality, Code Reference quality, and no-docs-needed rationales
- Human Review for docs-only PRs follows the Workspace policy preset and any docs-only exemptions
- docs-only Human Review exemptions are explicit Workspace policy toggles
- `supervised` defaults to Human Review for docs-only PRs unless the Workspace enables a docs-only exemption
- `autopilot` defaults to agent-only review for docs-only PRs, subject to applicable Provider Checks, Mergeability, and policy checks
- docs-only classification is determined by changed file extensions, not docs-root path
- docs-drift Tasks and PRs may be tagged as docs-only intent
- docs-only policy applies only after extension-based changed-file verification confirms every changed file is a recognized Markdown or text documentation file, such as `README.md`, `.md`, `.mdx`, `.txt`, or another configured text-doc extension
- the docs-only extension set is Workspace-configurable and defaults to a small list such as `.md`, `.mdx`, `.txt`, and `.rst`
- config-like files such as `.json`, `.yaml`, and `.yml` are excluded from docs-only defaults because they may affect runtime behavior
- Workspaces may deliberately add structured documentation extensions to docs-only classification if needed
- docs-only classification treats creates, edits, and deletions the same way: if every changed file has a recognized docs-only extension, the PR remains docs-only
- risky docs deletions are handled by review policy and Review Agent output rather than reclassifying them as code
- changing the docs-only extension set warns when open MergeRequests would be reclassified and requires authorized confirmation
- open MergeRequests are re-evaluated under the new docs-only extension policy; terminal or merged MergeRequests keep historical classification
- Stoneforge does not publish a dedicated docs-specific GitHub check/status for docs-only PRs in the first slice
- docs-only PRs use the normal Stoneforge Policy Check and observed GitHub/provider checks as Provider Checks inside Verification Runs
- docs quality, Document Link, and Code Reference findings appear in Stoneforge MergeRequest UI and Review Agent output rather than a separate GitHub check
- docs-drift runs account for open unmerged docs-drift PRs by treating their proposed changes as pending context and avoiding duplicate fixes
- when an open docs-drift PR already covers a finding, later runs skip it, append to the existing docs-drift branch when safe, or create only non-overlapping follow-up work according to policy
- when the docs-drift Automation completes, the docs-drift PR is marked ready and proceeds through the standard MergeRequest review, verification, Required Review, and merge flow according to Workspace policy
- manual Document create/edit flows may offer an optional docs-drift AutomationRun scoped to the specific change
- Workspace policy can disable the Documentation Methodology; when disabled, default RoleDefinition documentation instructions are removed or hidden, the default documentation Acceptance Criteria is not added to Tasks, the periodic docs-drift Automation is disabled, and manual docs-drift trigger suggestions are disabled
- Documents may be selected as explicit agent context for Director, Worker, Review, or automation Sessions
- first-slice Documents do not require Google Docs-style real-time coauthoring, rich redlines, rendered PDF management, rich binary uploads, complex block editors, or a document-specific permission model beyond Workspace policy

### Automation

Purpose:

- user-facing durable workflow trigger

Owned by:

- one Workspace in the first slice

Key associations:

- may listen to curated first-slice triggers: Task state changed, Plan state changed, MergeRequest opened or updated, Review Outcome recorded, VerificationRun changed, AutomationRun changed, schedule, or inbound signed webhook
- may create agent-based Dispatch Intent for implementation, review, repair, or Director work
- may run platform-defined code-first workflow actions such as merge evaluation or failure escalation
- may create an outbound automation webhook call for user-defined code-first automation

Frozen semantics:

- Automations do not own scheduling, leasing, or direct provider execution
- Automation definitions are versioned; edits create a new effective version rather than changing historical run interpretation
- AutomationRun changed triggers require explicit filters for AutomationRun state, action, and source, prevent direct self-triggering by default, enforce idempotency keys, and cap chain depth per root correlation ID
- exceeding the Automation chain-depth cap creates a blocked AutomationRun with reason `automation_chain_depth_exceeded`, root correlation ID and parent-run lineage, and UI visibility
- user-defined automation chain-depth cap is Workspace policy with a conservative default of `3`; platform automations may use separate internal safeguards
- Agent Automations create Dispatch Intent for a concrete RoleDefinition plus optional runtime and agent constraints
- code-first automations run explicit workflow code rather than an agent session
- platform-defined code-first automations may run inside Stoneforge
- user-defined code-first automations call external user-hosted handlers through signed outbound webhooks with idempotency keys and async acknowledgement
- arbitrary "any object changed" triggers are out of scope for the first slice
- schedule triggers support simple intervals and cron expressions with explicit required timezone and next-run metadata
- missed schedule runs after downtime are not backfilled in the first slice; record missed-run visibility, evaluate the next future run, and allow manual run for recovery
- manual runs of schedule-based Automations create separate AutomationRuns and do not move or reset the next scheduled run time
- inbound webhook triggers use one unique endpoint per Automation and require signed requests plus idempotency keys
- inbound webhook signing supports per-webhook signing secrets or a workspace-wide signing secret; policy may disable workspace-wide signing-secret use
- inbound webhook signing secrets support rotation with an overlap window and last-used metadata
- outbound automation webhook signing supports per-destination signing secrets or a workspace-wide outbound signing secret; policy may require per-destination secrets
- outbound automation webhook signing secrets support rotation with an overlap window and last-used metadata
- outbound webhook delivery treats `2xx` as success, `408`, `429`, and `5xx` as retryable, and other `4xx` responses as terminal failure
- outbound webhook retries use exponential backoff with a bounded retry count
- `2xx` delivery moves to `running` only when the response indicates accepted/async long-running work; bounded synchronous `2xx` may complete the run as `succeeded`
- outbound handler responses use an explicit typed response contract for accepted, succeeded, or failed outcomes; Stoneforge should provide a recommended but not required TypeScript-first Stoneforge SDK for interacting with the Stoneforge API, including Automation handler support and thin helpers for common workflow API actions
- the outbound automation webhook protocol is language-agnostic; the first-slice Stoneforge SDK ships TypeScript first
- the TypeScript Stoneforge SDK is in first-slice scope with a limited required surface: auth/client setup, Automation webhook signature verification, typed responses, callback helpers, and first-slice common API wrappers

### AutomationRun

Purpose:

- durable record of one automation trigger evaluation and action attempt

Owned by:

- one Workspace in the first slice

Key associations:

- belongs to one Automation or platform automation definition
- snapshots the effective Automation definition or references an immutable Automation version at run creation
- references the trigger source, target object, evaluated policy, idempotency key, action type, attempts, result, and linked follow-up objects
- agent-based AutomationRuns may create Dispatch Intent that later produces Assignments and Sessions
- code-first AutomationRuns may record platform handler execution or outbound webhook delivery attempts

Frozen semantics:

- an AutomationRun explains why automated workflow started or did not start
- later edits to the Automation definition do not change historical AutomationRun interpretation or exact manual replay behavior
- running, delivering, blocked, and retrying AutomationRuns keep the Automation version or snapshot they were created with; Automation edits affect future runs only
- using a newer Automation version for stuck or old work requires canceling or re-running to create a new linked AutomationRun
- disabling an Automation prevents new trigger-created AutomationRuns but does not stop existing runs by default; canceling active runs is an explicit operator action
- deleting an Automation uses archive or soft-delete semantics in the first slice; versions and historical AutomationRuns are preserved
- archived or soft-deleted Automations keep historical runs inspectable, but direct manual re-run requires restoring the Automation or creating a new Automation from the historical version
- an AutomationRun is not an Assignment, Session, or provider execution context
- code-first AutomationRuns record their own attempts and results without pretending to be agent execution
- AutomationRun lineage must be visible enough for operators to debug duplicate triggers, policy blocks, retries, and downstream work creation
- AutomationRun states use one success state across action types: `succeeded`
- action-specific outputs, such as Dispatch Intent creation, provider facts, workflow updates, or webhook acknowledgements, are recorded as results and linked follow-up objects rather than separate success states
- `blocked` means policy, eligibility, idempotency, or missing configuration currently prevents action and may be continued or re-evaluated when blocking facts change
- blocked AutomationRun re-evaluation is controlled by Workspace policy, defaulting to platform automations and non-external user-defined automations only
- `running` is reserved for long-running code-first workflows awaiting signed callback completion
- Stoneforge does not poll external status endpoints for first-slice AutomationRun completion; callback receipt returns 200 only after the callback is authenticated, idempotently accepted, and durably recorded
- completion callbacks finalize AutomationRuns only and are not a general workflow mutation surface; user-defined code-first automation uses the Stoneforge API for workflow actions
- external code-first automation API calls authenticate with short-lived AutomationRun Credentials scoped to the Workspace, AutomationRun, configured target objects, allowed API action categories, and expiry
- AutomationRun Credentials are not human credentials or broad service tokens, and calls authenticated this way emit service-actor lineage
- AutomationRun Credentials are usable from outbound delivery through `running`, including final API calls before completion callback, and are revoked on terminal AutomationRun states
- user-defined code-first automation may create Tasks and Plans through the Stoneforge API when credential scope allows; whether created work moves forward, requires Director triage, becomes draft/non-dispatchable, or becomes ready/active is controlled by Workspace policy or Automation configuration
- Workspace policy is the ceiling for automation-created Task/Plan behavior, and Automation configuration can only narrow it
- Director triage for automation-created work is requested through an explicit Stoneforge API action that creates scheduler-evaluated Director Dispatch Intent when policy allows
- Director triage requests may target objects created by the same AutomationRun or existing Tasks, Plans, and imported Issues, constrained by AutomationRun Credential scope
- repeated Director triage requests are deduped by target object, triage purpose or reason, source Automation/AutomationRun, and unresolved Director Dispatch Intent status
- manual re-run from any terminal AutomationRun state creates a new AutomationRun linked to the original and never mutates the old run
- manual re-run defaults to replaying the original trigger context exactly; edited-input reruns create a new manual AutomationRun with the input diff recorded and require Automation edit/create authorization
- AutomationRun history should be queryable by Automation, target or linked object, trigger type, action type, state, source actor/provider, time window, and correlation or idempotency key
- AutomationRun detail shows raw trigger, outbound request, and callback payloads; those payloads must not contain secrets and do not require special first-slice redaction or permissions, but they remain raw records subject to Workspace retention policy
- AutomationRun payload validation may warn on obvious secret-looking field names but should not become a heavy DLP system in the first slice

### Agent Command Surface

Purpose:

- controlled API, CLI, and tool surface available to agents during assigned work

Owned by:

- the Stoneforge control plane

Frozen semantics:

- every action is policy-checked and recorded in Execution Lineage, with AuditEvents for sensitive operations
- first-slice actions include reading assigned context, updating task progress and Checkpoints, adding task-local todos, reporting outcomes, requesting escalation, starting/stopping/inspecting previews, and invoking secret-backed capabilities through Stoneforge proxies
- first-slice actions must not bypass Scheduler or Policy, change Acceptance Criteria, mutate unrelated workflow objects, access raw secrets, manage users or policy, or directly merge/administer provider resources outside controlled Stoneforge operations
- Agent Command Surface access is distinct from general agent tool use such as file read/write tools, shell access inside the Runtime, provider-native coding tools, or custom tools supplied to an agent
- agents authenticate to the Agent Command Surface with a short-lived Session Command Credential minted by Stoneforge for the Assignment/Session
- the Session Command Credential is scoped to the Workspace, target Task or MergeRequest, resolved branch/worktree/runtime, and command categories allowed by effective Policy and target context
- RoleDefinitions do not request or restrict Agent Command Surface categories in the first slice; all RoleDefinitions receive the same command surface shape until useful separation boundaries are known
- Session Command Credentials can expire, rotate, and be revoked on cancel or stop; they are never human user credentials or provider secrets
- command lineage records the selected Agent and Session plus the service-actor execution path; human lineage appears only when a human steers the Session

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
- an Assignment may end as `repair_triggered` when it records or encounters a Repair Trigger; repair continues through a new task-owned repair Assignment on the same Task
- an Assignment keeps the resolved Agent, Runtime, RoleDefinition, and provider Session context selected when it started
- later Agent configuration or system-derived tag changes affect future dispatch only and do not implicitly mutate, stop, cancel, or migrate running Assignments
- Task-owned Assignments are used for implementation and repair work
- MergeRequest-owned Assignments are used for review or merge-evaluation work
- Plans do not directly own Assignments

### Session

Purpose:

- concrete provider execution context under an Assignment

Owned by:

- one Assignment

Key associations:

- has one adapter/provider identity
- emits heartbeats, transcripts, checkpoints, and final outcome

Frozen semantics:

- a Session is the concrete Claude Code or Codex execution context
- not every Session is a live connection; many providers expose a durable provider-side session or conversation that can be continued later by provider Session ID
- connection/reconnect semantics apply only for connectionful adapters, such as Codex App Server
- for connectionless adapters, one Stoneforge Session corresponds to one provider Session ID; continuation prompts are Session events/messages rather than new Sessions
- a new Stoneforge Session is created only when the provider Session ID changes, a non-continuable failure requires replacement, or Stoneforge deliberately starts a replacement execution context under the same Assignment
- provider Session IDs are scoped external identifiers, not primary keys; Stoneforge `SessionId` is the canonical global identifier
- provider Session identity should include Workspace, adapter/provider, provider account or installation when relevant, and provider Session ID
- a Session is provider execution only; operator-visible grouping should use Assignment, Task activity, or Execution Lineage
- Sessions may end and be resumed by creating a new Session under the same Assignment when checkpoint-based recovery is allowed
- active or continuable Sessions may receive steering messages from authorized human team members when the adapter supports it
- provider-facing agent chat may present all human steering messages as coming from `User`; Stoneforge still records the authenticated human sender in Execution Lineage and AuditEvents where required

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
- Human Review Approved outcomes may be recorded while required Provider Checks are pending by default, but they do not satisfy merge readiness until policy-required verification and other gates pass; policy may require verification before recording or counting them
- Required Review freshness follows GitHub-compatible semantics in the first slice; for GitHub-backed Workspaces, GitHub branch protection/rulesets are the source of truth for stale-approval dismissal and most-recent-reviewable-push requirements, while local and non-GitHub modes may use equivalent Workspace policy settings
- Stoneforge may cache and display observed GitHub Required Review freshness settings, but should not allow conflicting local overrides for GitHub-backed repos in the first slice
- stale-approval dismissal makes prior Review Approved outcomes stale for Required Review satisfaction after a diff-changing push or merge-base change, while most-recent-reviewable-push policy can require a qualifying approval after the latest reviewable push without dismissing all prior reviews
- GitHub branch protection/ruleset changes while a MergeRequest is open are merge-readiness input changes; Stoneforge refreshes or observes provider settings, re-evaluates Required Review satisfaction, and republishes `stoneforge/policy` if the decision changes without creating repair work
- the first slice refreshes GitHub branch protection/ruleset settings during PR observation and merge evaluation rather than continuously monitoring them; UI shows last observed settings and refresh time with a manual refresh action
- Stoneforge imports enough GitHub review, reviewer identity, and branch protection/ruleset data to decide Required Review satisfaction, without fully mirroring GitHub's reviewer request UI, CODEOWNERS assignment behavior, or team notification workflow beyond useful context
- Human Review Outcomes recorded in Stoneforge are posted back to GitHub as PR reviews only through the Human Reviewer's linked eligible GitHub OAuth identity; without that identity, the review is context only and does not satisfy GitHub-side or Stoneforge Required Human Review for that repo, and Stoneforge should not imply that the GitHub App can impersonate a human reviewer
- GitHub OAuth linking for humans is just-in-time rather than a Workspace onboarding blocker; when a human attempts a review or merge action requiring GitHub attribution, Stoneforge prompts OAuth linking and returns them to the action
- Review Agent outcomes are posted back to GitHub as PR reviews while remaining canonical Stoneforge Review Outcomes; Review Approved maps to GitHub approve, Change Request maps to GitHub request changes, and the provider review links back to the Stoneforge Review Outcome, Assignment, and Session
- Review Agent GitHub PR reviews may satisfy GitHub-side required review rules when GitHub branch protection/rulesets accept the GitHub App or bot review; if GitHub requires a human, CODEOWNER, team, or latest-push eligible reviewer that the Review Agent cannot satisfy, Stoneforge shows a provider-side merge blocker
- Review Agent dispatch waits for required Provider Checks to pass or fail by default; failed required checks trigger repair before review, missing required-check policy blockers suppress Review Agent dispatch, and policy may allow early Review Agent dispatch before required verification completes
- Review Agent dispatch does not wait for optional-provider-check Director triage; optional triage runs in parallel and adds reviewer context to the MergeRequest when available
- an unauthorized mutation to a GitHub branch outside an Assignment's scoped branch/worktree is modeled as a Branch Health/Repair Trigger, not as immediate human-only escalation
- default unauthorized branch mutation recovery follows the normal repair-trigger path: attach Repair Context to the Task, create a new task-owned repair Assignment and Session, undo the mutation, and decide whether useful changes should move to the originally scoped branch by cherry-pick, rebase, or equivalent
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
- Workspace policy may mark observed GitHub checks/statuses as required or optional for Stoneforge merge readiness
- GitHub remains where CI/CD workflows, branch protection, rulesets, and provider-side required checks are configured
- Stoneforge may seed required-check suggestions from GitHub branch protection or rulesets when available, but does not manage those provider settings in the first slice
- required Provider Checks are satisfied only by explicit provider success by default: GitHub check-run `success` or commit status `success`; pending, running, missing, or stale observations keep Verification pending or stale, while terminal non-success states fail required checks
- `neutral` and `skipped` do not satisfy required Provider Checks by default, but Workspace policy may allow either for specific check names
- missing required Provider Checks begin as pending while the observation window is fresh; the observation window is controlled by a Workspace policy value such as `requiredProviderCheckMissingTimeoutMinutes`, defaulting to 10 minutes after PR head observation
- after the missing-check timeout, or immediately after GitHub reports all current checks complete and the required check is still missing, a missing required check becomes a policy blocker rather than a Repair Trigger
- `stoneforge/policy` remains pending during the fresh observation window for a missing required Provider Check, then is republished as failing with a clear missing-check reason once the blocker is confirmed
- a terminal failing required Provider Check automatically creates a Repair Trigger for the source Task or Plan MergeRequest
- provider-check Repair Context includes the failing check name, head SHA, provider URL and log summary when available, and whether this is a first or repeated failure
- failed optional Provider Checks do not create Repair Triggers or block merge by default, but they are reported to a Director Agent for triage; they remain visible MergeRequest/provider context unless Workspace policy marks the check required
- optional-provider-check Director triage is grouped per MergeRequest head SHA, deduping multiple optional failures on the same head into one unresolved triage dispatch and starting a new group for a new head SHA
- optional-provider-check Director triage outcomes are non-blocking: no-op with rationale, add reviewer context, or create non-blocking follow-up Tasks
- reviewer context produced by optional-provider-check Director triage is persisted as first-class MergeRequest reviewer context with provenance to the Director Assignment/Session and the failed optional Provider Checks that caused it
- optional-provider-check reviewer context is Stoneforge-only by default, visible in the Stoneforge MergeRequest review UI and supplied to Review Agents and human reviewers without posting GitHub comments by default
- provider-check repair defaults to self-healing dispatch; the first slice does not add a human-approval exception based on high-risk or sensitive targets
- provider-check repair automatically ingests bounded failure context rather than full CI logs by default
- bounded failure context includes check name, conclusion, timestamps, provider URL, job and step names when available, and a failure excerpt or summary when GitHub exposes it cheaply
- full CI logs are fetched for UI review only when available through documented GitHub APIs; GitHub Actions workflow/job logs are required, while other CI provider logs are supported only if GitHub exposes retrievable log data without provider-specific integration
- first-slice CI log support does not depend on undocumented GitHub live-log streaming behavior
- agents may run GitHub Actions locally through the `act` CLI inside the resolved Runtime when the Runtime supports it
- local `act` verification targets the failed required Provider Check's corresponding workflow or job when the mapping is clear
- when the failed check to workflow/job mapping is unclear, agents choose the smallest relevant workflow or job from changed files and failure context
- agents do not run every workflow by default, and Stoneforge does not require a dedicated task-progress entry solely for local verification coverage
- managed Runtimes include `act` by default when Docker/container execution is available
- customer-managed Runtimes report whether `act` is installed and usable as a Runtime capability
- when `act` is unavailable, agents fall back to project-local tests and then rely on GitHub Actions rerunning after push
- local `act` verification uses the same low-risk preview/dev secret boundary as previews by default
- secrets injected into local Actions verification are agent-observable and may appear in agent-visible logs; production credentials must not be injected
- when a workflow needs secrets that are unavailable or not approved for preview/dev use, local Actions verification is partial and GitHub Actions after push remains authoritative for those portions
- local `act` verification is best-effort and does not promise parity with GitHub-hosted runners, service containers, matrix behavior, hosted runner images, or every GitHub Actions feature
- when local `act` behavior is unsupported or divergent, agents fall back to project-local tests and GitHub Actions after push
- local `act` output remains session-local agent working context only
- Stoneforge does not create UI artifacts, lineage records, repair-context items, Provider Checks, Verification Runs, or GitHub checks/statuses from local `act` results
- only GitHub-observed checks can satisfy required Provider Checks
- Stoneforge publishes only the normal `stoneforge/policy` GitHub check/status in the first slice
- Provider Checks come from GitHub Actions or other GitHub-integrated CI providers, not Stoneforge-created auxiliary statuses
- any observed GitHub check/status may become a Provider Check regardless of whether it originated from GitHub Actions, Buildkite, CircleCI, Jenkins, or another provider
- direct CI provider integrations, provider-specific log APIs, provider-specific log fetching, and provider-specific rerun controls are out of scope
- Stoneforge does not expose GitHub Actions rerun, workflow dispatch, or arbitrary remote workflow execution controls in the first slice
- GitHub Actions rerun through normal provider push-trigger behavior after Stoneforge pushes repair commits to the task or plan branch
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
- Host registration belongs to one Workspace and records name, host type, reachability and heartbeat state, supported Runtime labels and capabilities, capacity limits, and a scoped enrollment token
- first-slice Host operations include reconnect, disable, and remove; fleet autoscaling and complex host scheduling are out of scope
- disabling a Host stops new dispatch and leases to that Host; queued or ready work becomes blocked if no acceptable placement remains
- running Assignments may continue on a disabled Host while the Host remains connected
- removing or force-disconnecting a Host with running Assignments requires confirmation and must either wait for the work to stop or explicitly stop and mark those Assignments interrupted
- unexpected Host disconnect makes affected Session status uncertain until timeout or reconnect reconciliation
- reconnect reconciliation may return Sessions to active if the underlying process is still healthy, or mark them interrupted/crashed and move the Assignment through resume or redispatch policy if host-wide failure stopped execution
- the control plane owns authoritative Session and Assignment state changes after reconciliation, based on Host Agent facts and provider adapter validation

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
- a first-slice customer-managed Runtime is statically bound to one specific Host plus one execution mode
- first-slice execution modes may include local worktree, container, or managed sandbox
- Daytona is the first managed sandbox vendor under a provider-neutral runtime contract
- later slices may add dynamic Host placement through Runtime-level Host capability requirements
- Runtime disable and capacity/config edits affect future placement only by default; new dispatch stops for affected Runtimes and queued or ready work is blocked if no acceptable Runtime remains
- running Assignments keep their resolved Runtime unless an explicit operator or policy action stops them
- destructive Runtime removal requires confirmation when running or queued work depends on it and should produce placement blockers and repair actions for affected queued work

### Agent

Purpose:

- dispatchable executable worker capability

Owned by:

- one Workspace

Key associations:

- binds one harness/model pairing to a set of acceptable Runtimes with optional numeric priority scores
- may execute many Assignments over time with different RoleDefinitions

Frozen semantics:

- an Agent combines harness, model, acceptable Runtime set, numeric Runtime priority scores, optional concurrency throttle, and launcher path or adapter configuration
- Agents are stateless configuration and capability records; Session state lives in Sessions
- Agent-level concurrency, if configured, is a policy throttle or quota for token/cost control, model/provider rollout, or A/B testing rather than protection for Agent-local mutable state
- first-slice cost visibility is limited to configuration that helps control cost, such as Agent concurrency limits, model/provider selection, Runtime selection, and basic active Assignment/Session counts
- token accounting, per-task cost reporting, budget alerts, invoices, chargeback, pricing plans, and model-cost analytics are out of scope
- Director, Worker, and Reviewer Agent workflows must be real durable workflows, but the first slice does not promise perfect task decomposition, perfect code generation, perfect review accuracy, zero human intervention, or ideal work on the first attempt
- first-slice acceptance focuses on bounded task quality, clear acceptance criteria, recoverable failures, visible blockers, review and verification gates, repair loops, and audit/lineage
- Agent edits, disabling, and availability changes affect future dispatch and queued/ready placement only
- running Assignments keep the Agent, Runtime, RoleDefinition, and provider Session context they resolved at dispatch unless an explicit operator or policy action stops, cancels, or resumes the work

### RoleDefinition

Purpose:

- describes the job a Session should perform

Owned by:

- one Workspace

Key associations:

- attached to an Assignment at dispatch time
- may be reused across many Assignments and any Agent

Frozen semantics:

- a RoleDefinition contains role prompt, tool access, skill access, and lifecycle hooks
- Stoneforge auto-creates default Director, Worker, and Reviewer RoleDefinitions during Workspace bootstrap
- platform-created default RoleDefinitions are editable or deletable by authorized Workspace users after creation
- authorized Workspace users may create, edit, disable, or delete RoleDefinitions
- RoleDefinitions use simple version and history tracking
- Assignments snapshot or reference the RoleDefinition version they start with, so later edits do not rewrite historical execution
- advanced marketplace roles, role-template libraries, multi-version rollout controls, role A/B testing, and cross-workspace role sharing are out of scope
- deleting or breaking a platform-created default RoleDefinition creates workflow readiness blockers for affected Director, Worker, or Reviewer dispatch paths rather than automatically making the Workspace not ready
- RoleDefinitions may constrain general agent tools, file/shell/tool access, skills, and hooks
- explicit role selection is the default path
- RoleDefinitions do not express Agent or Runtime preference
- RoleDefinitions do not constrain first-slice Agent Command Surface categories
- any RoleDefinition may be combined with any Agent for an Assignment
- RoleDefinition tags may organize and select RoleDefinitions, but must not constrain Agent or Runtime placement

## Tag And Matching Contract

Tags are short labels used for capability constraints, routing constraints, organization, and reporting.

First-slice rules:

- Runtime tags express environment constraints such as `sandbox`, `customer-host`, or `frontend`
- Agent tags express pool, provider/model, or capability constraints such as `codex`, `claude`, `high-context`, or `fast-review`
- RoleDefinition tags express role organization or role-selection labels such as `director`, `review`, or `frontend-worker`
- Task and Automation tags may include required Agent tags used to constrain provider/model or Agent capability routing; they are hard requirements, not preference scoring
- Agent tags may be unscoped capability tags or scoped routing tags
- scoped tag syntax is `scope:value`; the text before the first colon is the scope and the text after it is the value
- tags without a colon are unscoped additive tags
- first-slice first-class scoped Agent tag dimensions are `provider`, `model-family`, `model`, and `agent`
- `provider` selects provider/harness family, `model-family` selects a broad model family, `model` pins an exact model ID, and `agent` pins to the system-managed Agent-id tag
- first-class `provider`, `model-family`, `model`, and `agent` tags on Agents are system-derived from Agent configuration, visible in Agent creation/edit UI, and non-modifiable by users
- changing an Agent's provider, model family, model, or identity updates the corresponding system-derived scoped Agent tags
- if an Agent edit removes a system-derived tag required by queued or ready work, or disabling an Agent would block queued or ready work, the UI shows the affected work count and requires confirmation before saving
- confirmed Agent edits or disables may proceed, but affected work receives placement blockers and repair actions rather than silent cancellation
- running Assignments are unaffected by Agent edits, disabling, availability changes, or system-derived tag changes unless an operator or policy explicitly stops, cancels, or resumes the work
- unscoped capability tags are additive hard requirements
- scoped routing tags have one effective value per scope; Task-level scoped tags override Plan defaults for the same scope
- mutually exclusive routing dimensions such as provider, model family, and Agent-id pinning should use scoped tags
- a Task with conflicting scoped tags in the same scope is invalid for dispatch until repaired
- scoped tag validation happens at creation/edit time and again at dispatch time
- dispatch-time validation failures create an `invalid_routing_constraints` placement blocker
- Plan-default scoped tags and Task-level scoped tags merge with smart override behavior; Task-level scoped values override Plan defaults for the same scope
- Plan-level required Agent tags are creation defaults for newly created Tasks, not live inherited constraints
- each Task stores the effective required Agent tags used for dispatch; changing Plan defaults later requires an explicit apply action to update existing Tasks
- preferred Agent tags and tag scoring are out of scope for the first slice
- specific-Agent pinning is represented by requiring an Agent-id-style Agent tag, not by a separate direct Agent constraint
- each Agent has a stable system-managed Agent-id tag for advanced routing; normal routing should use human-readable capability tags
- system-managed tags are visible/selectable but not user-editable or removable; user-defined tags remain editable according to policy/RBAC
- deleting an Agent removes its system-managed Agent-id tag and may make queued work requiring that tag unplaceable until edited or escalated
- unsatisfiable required Agent tags create an `unplaceable` placement blocker on affected queued work; repair requires editing tags, restoring or creating an eligible Agent, or canceling the work
- all required tags must match for an object to remain eligible
- tags narrow eligibility; they do not bypass policy
- tags do not replace explicit RoleDefinition selection before execution begins

## Association Contracts

| Association                      | Contract                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Org -> Workspace                 | One Org owns many Workspaces. A Workspace belongs to one Org.                                            |
| Workspace -> repository          | One Workspace maps to one GitHub repository in the first slice.                                          |
| Plan -> Task                     | A Task belongs to zero or one Plan. A Plan contains many Tasks.                                          |
| Task -> Assignment               | A Task may have many Assignments. A Task-owned Assignment belongs to one Task.                           |
| MergeRequest -> Assignment       | A MergeRequest may have many Assignments. A MergeRequest-owned Assignment belongs to one MergeRequest.   |
| Assignment -> Session            | An Assignment may contain many Sessions. A Session belongs to one Assignment.                            |
| Task/Plan -> MergeRequest        | A MergeRequest belongs to exactly one Task or exactly one Plan.                                          |
| MergeRequest -> Verification Run | A MergeRequest may have many Verification Runs. A Verification Run belongs to one MergeRequest.          |
| Host -> Runtime                  | A Host may expose many Runtimes. A customer-managed Runtime belongs to one Host.                         |
| Runtime -> Agent                 | A Runtime may be reused by many Agents. An Agent may allow one or more Runtimes, with numeric priority.  |
| RoleDefinition -> Assignment     | A RoleDefinition may be reused by many Assignments. Each Assignment resolves exactly one RoleDefinition. |
| Automation -> execution intent   | Automations create scheduler-evaluated intent; they do not directly start Sessions.                      |

## Invariants

- planning intent and execution history are separate model layers
- a Task never substitutes for an Assignment, Session, MergeRequest, or Verification Run
- a Plan does not replace the Task model
- a Task inside an inactive Plan is not dispatchable
- dispatch must resolve one concrete RoleDefinition, one Agent, and one Runtime before execution starts
- dispatch must not resolve a Runtime outside the selected Agent's acceptable Runtime set
- dispatch must not reject an Agent because of the selected RoleDefinition
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

First-slice product-level API scope is required only where external actors
depend on stable contracts: the Agent Command Surface, Stoneforge SDK and
Automation handler APIs, GitHub webhook/provider integration boundaries, and
minimal UI/backend private APIs needed by the app. A fully public REST or
GraphQL API for every object is out of scope. Internal domain and persistence
APIs remain implementation detail, with type-driven contracts and normalized
data model expectations documented for engineering.

| Event                        | Meaning                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `workspace.ready`            | workspace has repo connectivity, policy, and at least one runnable execution path         |
| `task.readiness_changed`     | a task's dispatch eligibility changed due to dependency, plan, policy, or review state    |
| `dispatch.intent_created`    | an automation or human action requested scheduler evaluation                              |
| `assignment.started`         | a durable dispatch envelope has entered live execution                                    |
| `session.checkpoint_created` | a Session persisted a resumable Checkpoint into the Task Progress Record                  |
| `merge_request.opened`       | a provider PR now exists for a task or plan                                               |
| `verification_run.observed`  | new verification status/check information was recorded                                    |
| `repair.trigger_recorded`    | review, verification, mergeability, policy, or branch health requires task or plan repair |
| `policy.decision_recorded`   | a policy-sensitive action was evaluated and its decision stored                           |
| `audit.event_emitted`        | a required audit record was persisted                                                     |

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
            - acceptanceCriteria:
                - text: "retry visibility spans scheduler and PR review summary"
                  status: "in_progress"
              note: "Added retry counters; PR review summary wiring remains."
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
