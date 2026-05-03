# Stoneforge V2 First-Slice PRD

Status: first-slice product requirements

## Problem Statement

Engineering leads, platform leads, operators, and reviewers need a dependable way to turn engineering intent into supervised agent-executed software work without losing control of context, review, verification, policy, audit, or recovery. Today, agent coding workflows are too easy to run as disconnected chats, one-off scripts, or brittle automation loops where it is hard to understand what work is ready, what is blocked, what an agent changed, why a merge is allowed, or how to recover after review, CI, branch health, host, runtime, or context failures.

Stoneforge V2 must prove that agent-driven development can be operated as a coherent control-plane workflow for one real GitHub-backed repository. The first slice must cover the full path from workspace onboarding and intent intake through planning, dispatch, agent execution, review, verification, repair, merge, documents, automations, observability, human intervention, and audit.

## Solution

Stoneforge V2 will provide a GitHub-first control plane for supervised, agent-driven software-engineering execution. A user connects one repository to a Workspace, configures policy and execution paths, captures or imports engineering intent, lets Director Agents decompose work into Tasks and Plans, dispatches Worker and Reviewer Agents through the Scheduler, observes MergeRequests and Provider Checks from GitHub, repairs failures through task-owned repair loops, and merges only when Stoneforge policy, verification, review, mergeability, and branch-health conditions are satisfied.

The first-slice user experience follows the approved Stoneforge V2 UI/workflow prototype for onboarding, operational lists, tasks, plans, merge requests, diffs, sessions, automations, agents, runtimes, role definitions, documents, workspaces, notifications, and intervention surfaces. The product must prioritize operator visibility, control, recoverability, durable context, policy clarity, and auditability over chat-first coding or editor-first workflows.

Stoneforge V2 will ship the same first-slice product through two app shells: a TanStack Start web app and an Electron desktop app. The web app must support local/single-user operation in a browser against a local control-plane server on localhost, plus team operation against a remote control plane. The desktop app must support local/single-user operation by launching or connecting to a local control plane, plus team operation by connecting to a remote Workspace. Both shells use the same product model, command/API contract, route and component system where practical, policy behavior, GitHub-backed workflow semantics, and operator experience.

## User Stories

1. As an Org owner, I want to create or select an Org, so that Workspaces and membership have a clear tenant boundary.
2. As a repo admin, I want to create a Workspace for one GitHub repository, so that Stoneforge has a concrete operational boundary.
3. As a repo admin, I want guided onboarding based on the approved prototype flow, so that I can configure the first Workspace without guessing the required setup order.
4. As a repo admin, I want to install or connect the GitHub App during onboarding, so that Stoneforge can observe and act on repository branches, PRs, checks, and Issues.
5. As a repo admin, I want onboarding to verify repository permissions, target branch, and merge topology, so that merge and review flows do not fail later due to missing setup.
6. As a platform lead, I want default Director, Worker, Reviewer, and docs-focused Reviewer RoleDefinitions to be bootstrapped, so that the golden path works before I author custom roles.
7. As a platform lead, I want RoleDefinitions to be editable with simple version history, so that I can change future execution behavior without rewriting historical sessions.
8. As a platform lead, I want to configure one customer-managed Host or managed sandbox Runtime, so that Stoneforge has a healthy execution path.
9. As a platform lead, I want to configure Claude Code and OpenAI Codex Agents with acceptable Runtimes and concurrency limits, so that the Scheduler can place work under known capacity constraints.
10. As an operator, I want Workspace readiness to show repository, policy, runtime, agent, role, provider-check, preview, and secret blockers, so that I know what prevents the golden path.
11. As an operator, I want workflow-level readiness blockers for broken Director, Worker, or Reviewer paths, so that one broken role category does not hide the rest of Workspace health.
12. As a repo admin, I want to choose a supervised or autopilot policy preset, so that automation and Required Review behavior matches the team’s risk posture.
13. As a repo admin, I want a simple policy configuration surface for documented first-slice settings, so that I can change important behavior without using a generic rule language.
14. As an operator, I want to create engineering intent directly in Stoneforge, so that new work can enter the planning workflow.
15. As an operator, I want GitHub Issues to import as policy-controlled intent or issue-backed Draft Tasks, so that external requests do not become executable work accidentally.
16. As a repo admin, I want trusted maintainer labels to trigger auto-triage or auto-dispatch only when applied by eligible linked GitHub users, so that public or untrusted labels cannot start work.
17. As an operator, I want ignored reserved GitHub labels to show quiet Stoneforge warnings and lineage, so that suspicious intake signals are visible without noisy public comments.
18. As an operator, I want linked Stoneforge Tasks and GitHub Issues to sync essential metadata and status comments, so that GitHub users can see Stoneforge progress.
19. As an operator, I want one GitHub Issue to decompose into many Tasks when needed, so that complex requests can become executable work without losing source context.
20. As an operator, I want Director Agents to clarify intent before execution, so that Tasks have enough scope and acceptance criteria to be run responsibly.
21. As an operator, I want Director Agents to create Tasks, dependencies, and optional Plans, so that related work can be coordinated.
22. As an operator, I want Plans to remain inactive until the Plan graph is coherent, so that Tasks do not dispatch before planning is complete.
23. As an operator, I want Plan activation to be policy-controlled, so that larger coordinated work can require human confirmation when appropriate.
24. As an operator, I want Tasks to become ready only when dependencies, Plan activation, policy, routing, and active-execution constraints allow it, so that readiness is not a manual toggle.
25. As an operator, I want Automations to create workflow intent and the Scheduler to own placement, queueing, leasing, retry, resume, and escalation, so that dispatch is durable and recoverable.
26. As an operator, I want dispatch intent to stay queued when capacity is unavailable, so that work is not dropped during temporary resource shortages.
27. As an operator, I want unsatisfiable required Agent tags or invalid routing constraints to become visible placement blockers, so that I can repair configuration instead of waiting on impossible dispatch.
28. As a platform lead, I want Agent routing to use system-derived scoped tags for provider, model family, model, and agent identity, so that placement rules are explicit and validated.
29. As an operator, I want running Assignments to keep their resolved Agent, Runtime, RoleDefinition, and provider Session context after later configuration edits, so that active work is not silently mutated.
30. As a Worker Agent, I want bounded Task context, selected Documents, Acceptance Criteria, and command credentials for my Assignment, so that I can work within the intended scope.
31. As a Worker Agent, I want to update Checkpoints and task-local todos through the Agent Command Surface, so that resumed sessions can restart efficiently.
32. As an operator, I want Checkpoints to be bounded restart context rather than long hidden memory, so that task progress stays readable and durable.
33. As an operator, I want task progress summaries generated on demand from Checkpoints and Repair Context, so that resumed or repair Assignments get concise context with citations.
34. As an operator, I want code-changing Tasks to open or update task PRs automatically, so that implementation work enters the standard review and merge flow.
35. As a reviewer, I want Stoneforge MergeRequests to map to GitHub PRs while preserving provider-neutral internal records, so that the product can reason about review and merge consistently.
36. As a reviewer, I want Review Agents to run after required Provider Checks pass or fail by default, so that review uses relevant verification context and avoids wasted work.
37. As a reviewer, I want optional Provider Check failures to create non-blocking Director triage context, so that useful signals are visible without blocking merge by default.
38. As a reviewer, I want Review Agents to approve or request changes through canonical Stoneforge Review Outcomes and GitHub PR reviews, so that review is visible in both systems.
39. As a Human Reviewer, I want my Stoneforge review to post to GitHub through my linked eligible OAuth identity, so that GitHub attribution and reviewer eligibility are correct.
40. As a Human Reviewer, I want just-in-time GitHub OAuth linking when I take a review or merge action, so that onboarding is not blocked by every reviewer linking up front.
41. As a repo admin, I want imported GitHub reviews to satisfy Required Human Review only when the GitHub identity is linked and eligible, so that unverified provider signals do not bypass policy.
42. As an operator, I want Stoneforge to publish a single `stoneforge/policy` status for the current PR head SHA, so that GitHub branch protection can consume Stoneforge policy decisions.
43. As an operator, I want Provider Checks to be observed from GitHub checks and statuses, so that Stoneforge integrates with GitHub Actions and other GitHub-visible CI without owning CI workflows.
44. As an operator, I want missing required Provider Checks to remain pending during a fresh observation window and then become a policy blocker, so that configuration issues are distinct from code failures.
45. As an operator, I want terminal failing required Provider Checks to create Repair Triggers with bounded failure context, so that the system can attempt targeted self-healing.
46. As a Worker Agent, I want access to bounded CI failure context and controlled full log retrieval when available through GitHub APIs, so that repair can use enough evidence without eagerly storing every log.
47. As a Worker Agent, I want to run local `act` verification when the Runtime supports it, so that likely GitHub Actions fixes can be checked before pushing repair commits.
48. As an operator, I want local `act` results to remain session-local and never satisfy Provider Checks, so that only GitHub-observed checks decide required verification.
49. As an operator, I want Change Requests, failing required verification, mergeability failures, policy blockers, and branch-health problems to enter repair-required flow, so that recovery stays attached to the same Task.
50. As an operator, I want repair work to create a new task-owned repair Assignment and Session, so that repair history is distinct from the original Assignment but colocated with Task progress.
51. As an operator, I want Repair Context items to have stable IDs, immutable provenance, deduplication, and audited status transitions, so that repeated or related failures remain understandable.
52. As an operator, I want one running repair Assignment to receive new related Repair Context rather than starting parallel repairs by default, so that repair work does not conflict with itself.
53. As an operator, I want unsafe or exhausted repair loops to escalate to human-review-required, so that autonomous work does not loop indefinitely.
54. As an operator, I want direct task PRs to merge to the Workspace target branch when ready, so that simple work has a short path to completion.
55. As an operator, I want optional Plan aggregation through task PRs, a plan branch, and a plan PR, so that coordinated work can be integrated and reviewed as a unit.
56. As a reviewer, I want plan PRs to stay draft or not-ready until required Tasks are complete, so that plan-level review happens only when integration is meaningful.
57. As a reviewer, I want Required Review freshness to follow GitHub branch protection and ruleset semantics, so that Stoneforge does not contradict GitHub review rules.
58. As an operator, I want branch protection and ruleset changes to re-evaluate merge readiness without creating repair work, so that configuration changes are treated as policy inputs.
59. As an operator, I want preview environments for supported Runtime and Host paths, so that humans and agents can inspect task or plan branches interactively.
60. As a repo admin, I want Preview Secrets to be explicitly marked as low-risk agent-observable values, so that users do not mistake previews for a hard secret boundary.
61. As a platform lead, I want customer-managed Hosts to register outbound, report health and capacity, and support disable/remove/reconnect flows, so that execution can run in controlled infrastructure.
62. As an operator, I want Contact Loss to pause connectionful Sessions until reconciliation, so that Stoneforge does not issue commands while execution state is unknown.
63. As an operator, I want recoverable Session crashes, context exhaustion, or confirmed host execution loss to resume under the same Assignment when possible, so that work continues from checkpoint context.
64. As an operator, I want Sessions to show live status, event timeline, transcript/logs, checkpoints, steering messages, cancel/force-stop, and resume controls, so that humans can intervene in active or continuable work.
65. As a human team member, I want to steer an active Session when the adapter supports it, so that I can correct direction without losing lineage.
66. As a human editor, I want lightweight file inspection, diff review, manual edits, and commits across Workspace branches when provider permissions allow, so that I can intervene directly when needed.
67. As an operator, I want unlinked editor commits to be allowed but audited and observed when they affect Workspace branches or PRs, so that human intervention does not need synthetic Tasks.
68. As a user, I want searchable and filterable lists for operational objects, so that I can quickly find blocked, risky, stale, or action-required work.
69. As an operator, I want in-app notification surfaces for blockers, review needs, verification failures, repair escalation, AutomationRun failures, Host/Runtime disconnects, and missing configuration, so that I do not have to poll every page.
70. As an operator, I want product observability through Execution Lineage, Audit Trail, transcripts/logs, AutomationRun history, Host/Runtime health, Verification Runs, policy blockers, and lists, so that I can understand why work is blocked.
71. As a workspace member, I want durable Documents for reusable context, so that agents and humans share knowledge beyond one Assignment.
72. As a workspace member, I want a Workspace Documentation Library and a separate Operational Docs Library, so that team documentation and Stoneforge-maintained operational metadata stay distinct.
73. As a repo admin, I want mirrored Documents to be the default for repository-linked Workspaces with one selected docs root, so that durable documentation can live in Git while staying usable in Stoneforge.
74. As a docs editor, I want Stoneforge-only, repo-backed, mirrored, Markdown/plain text, and URL/reference Document modes, so that different context types can be represented without overbuilding binary or rich-document support.
75. As a docs editor, I want relative Markdown Document Links to work across source modes, so that Documents remain portable and easy to author.
76. As a user, I want keyword Document Search with metadata filters and BM25 ranking, so that I can find relevant workspace context without semantic/vector search.
77. As an agent, I want explicit selected Documents, Document Browsing, Document Search, and materially-used Document markers, so that my context use is visible and reviewable.
78. As a reviewer, I want materially-used Documents and Code References with short reasons, so that I can see what evidence influenced an agent’s decisions.
79. As a workspace member, I want a hybrid managed/editable Documentation Directory and three-level Documentation Methodology, so that important context stays reachable by browsing.
80. As an operator, I want default documentation Acceptance Criteria on code-changing or concept-changing Tasks, so that implementing agents update relevant Documents or record why no docs change is needed.
81. As a reviewer, I want Review Agents to verify documentation Acceptance Criteria, Document Links, Code References, and no-docs-needed rationales, so that docs quality is part of normal review.
82. As an operator, I want daily scoped and weekly deep Docs Drift Automations, so that repository/documentation drift is periodically inspected and repaired through normal PR flow.
83. As an operator, I want weekly deep docs drift to use a plan-shaped workflow and a stable Docs Drift Section Map, so that broad scans are split into manageable sections.
84. As a repo admin, I want docs-drift PRs and docs-only PRs to use the normal MergeRequest framework with docs-only policy classification, so that documentation changes are reviewed and merged consistently.
85. As a repo admin, I want docs-only classification based on configured documentation file extensions, so that docs policy does not rely on path guesses.
86. As an automation builder, I want platform Automations and user-defined Automations to share curated triggers, AutomationRuns, idempotency, versioning, and policy controls, so that custom workflows are durable and inspectable.
87. As an automation builder, I want inbound webhook triggers and outbound code-first automation webhooks to be signed and idempotent, so that external automation does not become a broad trusted backdoor.
88. As an automation builder, I want short-lived AutomationRun Credentials for external code-first automation, so that automation code can call Stoneforge APIs without receiving human credentials.
89. As an operator, I want AutomationRuns to show blocked, delivering, retry, running, succeeded, failed, canceled, and rerun states, so that automation behavior is debuggable.
90. As a security-conscious admin, I want delegated OIDC/OAuth team authentication and clearly marked single-user local mode, so that Stoneforge does not own passwords while local development stays simple.
91. As a repo admin, I want RBAC and reviewer eligibility to mirror GitHub org and repository permissions for GitHub-backed Workspaces, so that Stoneforge cannot grant review or merge authority GitHub would deny.
92. As a security-conscious admin, I want secrets exposed through scoped capabilities, proxies, or explicit preview/dev injection boundaries, so that agents do not receive raw sensitive values by default.
93. As a security-conscious admin, I want Session Command Credentials to be short-lived, scoped, rotatable, and revocable, so that agent command access is bounded to the Assignment and policy context.
94. As a security-conscious admin, I want automatic redaction of known secret patterns before transcript/log storage and authorized irreversible manual redaction after storage, so that raw records reduce accidental sensitive exposure.
95. As an auditor, I want AuditEvents and Workflow Events to be append-only with long retention by default, so that sensitive actions and workflow lineage remain reconstructable.
96. As a workspace admin, I want configurable retention for raw transcripts, provider logs, CI logs, Automation payloads, preview logs, and runtime logs, so that high-volume raw data can expire without deleting durable lineage.
97. As an operator, I want basic cost-control configuration through Agent concurrency, model/provider selection, Runtime selection, and active Assignment/Session counts, so that first-slice cost exposure is controllable without analytics.
98. As a keyboard user, I want primary workflows to be keyboard navigable with visible focus states and accessible labels, so that the UI meets the practical accessibility baseline.
99. As a screen-reader user, I want blockers, review state, verification, and progress to expose screen-reader-friendly status text, so that workflow state is not only visual.
100. As a team evaluating the first slice, I want a repeatable real GitHub-backed proving scenario from onboarding through repair and merge, so that the product demonstrates the whole control-plane loop.
101. As a local web user, I want to run the TanStack Start web app on localhost against a local control-plane server, so that I can use Stoneforge locally in a browser without a remote team deployment.
102. As a team web user, I want the TanStack Start web app to connect to a remote control plane and Workspace, so that I can supervise Stoneforge workflows from a browser.
103. As a desktop user, I want the Electron app to launch or connect to a local control plane, so that I can run local/single-user Stoneforge from my desktop.
104. As a desktop team user, I want the Electron app to connect to a remote team Workspace, so that I can use the desktop app for shared team workflows.
105. As an operator, I want local web, desktop local, and remote team modes to expose the same workflow behavior, so that app shell choice does not fork the product.
106. As a platform lead, I want app connection mode to be explicit, so that local, desktop-managed local, and remote control-plane connections are configured and diagnosed predictably.

## Implementation Decisions

- Build around the active V2 boundaries: core domain primitives, Workspace readiness and policy, execution and Scheduler behavior, MergeRequest/review/verification policy, and the control-plane application that wires persistence, providers, diagnostics, and command-shaped operation handlers.
- Treat application delivery mode as a first-slice product boundary. Stoneforge ships a TanStack Start web shell and an Electron desktop shell over the same control-plane workflows.
- Support three Control Plane Connection Modes: `local` for an app connecting to a local control-plane server, `managed-by-desktop` for Electron launching and supervising a local control-plane process before connecting to it, and `remote` for connecting to a remote team control plane.
- The TanStack Start web app supports `local` and `remote` connection modes. Local web mode runs in the browser on localhost against a local control-plane server.
- The Electron desktop app supports `managed-by-desktop`, `local`, and `remote` connection modes. Desktop mode must not duplicate domain logic in the Electron shell.
- Define a shared typed command/client contract used by TanStack Start server functions, web clients, Electron preload/IPC bridges, and desktop-controlled local control-plane connections.
- Keep shared routes, UI components, domain language, and workflow behavior common across web and desktop where practical. Differences are allowed only for OS lifecycle, deployment, identity, local process access, and secure local storage.
- Treat the Electron main process as an OS/app lifecycle, window, update, local-process, and secure bridge boundary. Electron renderer code should use the shared UI surface and should not receive unrestricted Node.js or secret access.
- Treat the Workspace as the first-slice operational boundary. Each Workspace links to one primary GitHub repository. Cross-repository Workspaces are deferred.
- Include a minimal Org container for create/select Org, Workspace management, basic membership and roles, and GitHub org/repo permission projection. Advanced org administration is deferred.
- Implement guided onboarding as a product requirement, covering Org selection, Workspace creation, GitHub repository connection, default RoleDefinitions, Runtime path, Agent setup, policy preset, docs root selection, secrets/readiness, and visible blockers.
- Preserve the canonical separation of Task, Plan, Assignment, Session, MergeRequest, Verification Run, Automation, AutomationRun, Host, Runtime, Agent, RoleDefinition, Policy, AuditEvent, Workflow Event, Document, and Scheduler.
- Model Tasks as planning units. Assignments, Sessions, MergeRequests, Verification Runs, AutomationRuns, AuditEvents, and Workflow Events record execution and observation facts.
- Use semantic state machines for Workspace, Task, Plan, Dispatch Intent, AutomationRun, Assignment, Session, MergeRequest, Verification Run, Repair Context, and cancellation/resume flows without requiring exact storage enum strings to match documentation strings.
- Keep Automations as durable user-facing triggers and the Scheduler as the internal owner of readiness evaluation, queueing, leasing, placement, retries, resume, escalation, and cancellation propagation.
- Support platform Automations for core flows: ready-task dispatch, PR review dispatch, repair dispatch, merge evaluation, failure escalation, docs drift, and workflow maintenance.
- Support bounded user-defined Automations through curated triggers, schedule triggers with explicit timezones, signed inbound webhooks, Agent Automation actions, and code-first outbound webhook actions.
- Version or snapshot Automation definitions for each AutomationRun. Edits affect future runs only, disabling affects new runs only, and historical runs remain inspectable.
- Use durable Dispatch Intent and capacity leases as scheduler internals. Dispatch Intent records requested work and constraints; leases reserve capacity before stable Assignment execution.
- Implement Agent routing with hard Required Agent Tags, system-managed Agent identity tags, system-derived scoped tags for provider/model-family/model/agent, smart Plan-default-to-Task tag merging, and creation/edit plus dispatch-time validation.
- Resolve Runtime selection from an eligible Agent’s acceptable Runtime set using numeric priority and deterministic tie-breaking. Do not add dynamic Host pools or load-balancing in the first slice.
- Keep RoleDefinitions independent from Runtime and Agent routing. Roles define job content, tools, skills, and hooks, not placement preference.
- Support customer-managed Hosts through outbound connectivity, registration, heartbeat, capacity advertisement, reconnect, disable, remove, contact-loss reconciliation, and safe handling of running work.
- Support Daytona as the first managed sandbox path under a provider-neutral managed Runtime contract.
- Support Claude Code and OpenAI Codex as first-class execution backends under a shared control-plane model. Do not make golden workflow acceptance depend on live LLM quality for every CI run.
- Use `reference/t3code/` as implementation reference material for provider-driver, provider-instance, Claude Code, OpenAI Codex, OpenCode, ACP, Codex app-server, provider event normalization, runtime-event ingestion, provider health probing, and provider session resume/cancel behavior. Useful reference areas include `reference/t3code/apps/server/src/provider/`, `reference/t3code/apps/server/src/provider/acp/`, `reference/t3code/packages/effect-acp/`, `reference/t3code/packages/effect-codex-app-server/`, `reference/t3code/packages/contracts/`, and `reference/t3code/docs/providers/`.
- Treat `reference/t3code/` as adapter and protocol reference material only. Stoneforge's Scheduler, Dispatch Intent, Lease, Assignment, Session, Runtime, Agent, RoleDefinition, Agent Command Surface, policy, audit, GitHub MergeRequest, Verification Run, and repair models remain the authoritative V2 architecture and must not be replaced by t3code's thread-first orchestration model.
- Classify adapter Session connectivity as connectionless or connectionful. Use one Stoneforge Session per provider Session ID unless a replacement provider execution context is needed.
- Implement the Agent Command Surface as the scoped Stoneforge control-plane/API/CLI/tool boundary for assigned work: read assigned context, update Checkpoints, add task-local todos, report outcomes, request escalation, manage previews, inspect allowed context, and invoke secret-backed capabilities.
- Authenticate agent command access with short-lived Session Command Credentials scoped to Workspace, target object, resolved branch/worktree/runtime, and allowed command categories.
- Prevent the Agent Command Surface from changing Acceptance Criteria, bypassing Scheduler or policy, mutating unrelated workflow objects, exposing raw secrets, administering users/policy, or merging outside controlled Stoneforge operations.
- Store Task Progress Records as structured bounded Checkpoints and Repair Context with references to Assignments, Sessions, transcripts, logs, and lineage. Do not copy full transcripts into task progress state.
- Generate Task Progress Summaries on demand for prompt assembly and UI overview, citing underlying Checkpoints and Repair Context. Do not persist summaries as first-slice source of truth.
- Allow implementing agents to add task-local todo items via checkpoint updates but never add or change Acceptance Criteria. Acceptance Criteria remain created by Directors or edited through human task-edit/review flows.
- Implement Repair Context items with stable IDs, immutable provenance, append-only content, status history, deduplication by source and semantic key, and audited status changes.
- Dispatch repair from `repair_required` without cycling through non-repair readiness. Repair creates a new task-owned Assignment and Session on the same Task.
- Use remaining Repair Context status to decide the next Task state after repair: awaiting review, completed, ready, repair required, or human review required.
- Support direct task PRs to the Workspace target branch and optional plan-branch/plan-PR aggregation. Staging workflows are achieved by setting the Workspace target branch to staging and managing upstream promotion outside Stoneforge.
- Use `MergeRequest` as the internal noun and `PR` in GitHub-facing UI and provider language.
- Implement GitHub-first repository, Issue, PR, review, branch, check/status, and merge integration through a GitHub App installation and linked human GitHub identities where needed.
- Implement GitHub Issue intake as policy-controlled intent, Director triage, Draft Task creation, or ready Task promotion for trusted sources. Default supervised intake creates non-dispatchable draft Tasks; default autopilot intake sends imported Issues to Director triage.
- Support bidirectional Issue sync for essential fields and status comments without requiring one-to-one Issue-to-Task mapping. Treat Stoneforge as the workflow source of truth for reserved status, priority, and complexity labels.
- Generate GitHub PR references to linked Issues. Use issue-closing keywords for task PRs only when exactly one Task is linked to the Issue; use plan-level closure for decomposed Issues.
- Observe GitHub PR reviews and top-level/review comments enough to support review and repair context, while deferring full bidirectional threaded comment parity and complex conflict resolution.
- Publish only the normal Stoneforge Policy Check to GitHub in the first slice. Do not create dedicated docs checks or local `act` statuses.
- Aggregate GitHub checks and statuses into Verification Runs. Workspace policy marks observed Provider Checks as required or optional for Stoneforge merge readiness.
- Treat missing required Provider Checks as pending during a fresh observation window, then as policy blockers when confirmed missing. Treat terminal failing required Provider Checks as Repair Triggers.
- Support bounded Provider Check failure context and GitHub Actions log retrieval through documented GitHub APIs. Do not eagerly store all full CI logs.
- Let agents run local `act` where Runtime capability and low-risk preview/dev secret boundaries allow it. Keep local `act` results out of Verification Runs and provider-visible checks.
- Dispatch optional Provider Check triage in parallel with review and persist its reviewer context as Stoneforge-only MergeRequest context by default.
- Align Required Review freshness with GitHub branch protection and rulesets for GitHub-backed Workspaces. Refresh observed settings during PR observation and merge evaluation, show last observation time, and allow manual refresh.
- Post Human Review Outcomes back to GitHub only through the eligible linked human OAuth identity. Do not imply the GitHub App can impersonate human reviewers.
- Post Review Agent outcomes back to GitHub as PR reviews where provider rules allow while preserving Stoneforge Review Outcomes as canonical.
- Implement policy presets `supervised` and `autopilot` only. Supervised defaults to Required Human Review for code-changing merge unless explicitly exempted. Autopilot defaults to Required Agent Review before automatic merge.
- Implement docs-only policy as explicit extension-based classification after changed-file verification. Allow Workspace-configurable docs-only extensions with conservative defaults.
- Implement Documents as Workspace-owned durable context with title, workspace-relative path or filename, body/content, content type, category/tags, source mode, version history, attribution, links, visibility through Workspace policy, and explicit agent-context selection metadata.
- Provide Workspace Documentation and Operational Docs libraries. Operational Docs default to Stoneforge-only source mode.
- Support Stoneforge-only, repo-backed, and mirrored Document source modes. Mirrored is the default for repository-linked Workspaces, with one selected primary docs root.
- Route mirrored Document UI edits through docs PRs or existing docs PR branches; repository PR merge is the authoritative write path for mirrored content.
- Use relative Markdown file links as the canonical Document linking method across source modes.
- Implement keyword/full-text Document Search across title and body with metadata filters and BM25 ranking in SQLite and Postgres.
- Implement the Documentation Directory, three-level Documentation Methodology, Code References, materially-used Document markers, materially-used Code Reference markers, and lightweight reference validation.
- Add default documentation Acceptance Criteria to code-changing or concept-changing Tasks unless Documentation Methodology is disabled by policy.
- Implement daily scoped and weekly deep Docs Drift Automations. Weekly deep docs drift uses a plan-shaped workflow and a system-managed, human-editable Docs Drift Section Map in the Operational Docs Library.
- Route docs drift changes through dedicated docs-drift branches and PRs, using the normal MergeRequest review and merge framework.
- Implement first-slice UI workflow and interaction fidelity to the approved prototype: information architecture, page coverage, primary workflows, navigation shape, and review/diff interaction direction. Pixel-perfect styling and component internals may change if behavior and workflow fidelity are preserved.
- Provide operator UI surfaces for Workspaces, Tasks, Plans, MergeRequests, Sessions, Automations, AutomationRuns, Agents, Runtimes, RoleDefinitions, Documents, policy blockers, audit/lineage, previews, and human intervention.
- Provide practical searchable and filterable Operational Lists for first-slice objects using state, status, owner/actor, linked object, branch, PR, risk, tags, updated time, and blocker presence.
- Provide in-app Notification Surfaces for blocked or action-required work. Email, Slack, digest preferences, escalation schedules, and notification routing are deferred unless implemented through user-defined Automations.
- Provide lightweight code inspection and manual editing/commit intervention. Human commits are attributed through provider identity where possible, recorded in lineage/audit, and trigger provider observation and policy re-evaluation when relevant.
- Provide product-visible observability through Execution Lineage, Audit Trail, Session transcripts/logs, AutomationRun history, Host/Runtime health, Verification Run and Provider Check status, policy blockers, notifications, and operational filters. Do not build first-slice analytics dashboards or tracing UI as product features.
- Implement delegated human authentication for self-hosted/team use and clearly marked single-user local mode. Do not build custom passwords, MFA, or a full identity provider.
- Align first-slice RBAC and reviewer eligibility with GitHub org/repo permission semantics for GitHub-backed Workspaces. Stoneforge may add workflow policy requirements but cannot authorize GitHub-equivalent review or merge actions GitHub would deny.
- Use secrets through boundary-specific storage and controlled secret-backed capabilities. Raw secret injection into agent-visible shells/filesystems is an explicit high-risk escape hatch if supported at all.
- Mark Preview Secrets as user-declared low-risk agent-observable values; do not present preview env injection as a secure production-secret boundary.
- Store AuditEvents and Workflow Events as append-only records retained indefinitely by default in local and self-hosted deployments unless configured otherwise.
- Provide raw record retention controls for Session transcripts, provider logs, CI logs, Automation payloads, preview logs, and runtime logs. Retain durable summaries, lineage, object state, review outcomes, and merge decisions longer than raw logs.
- Apply best-effort automatic redaction for known secret patterns before storing/displaying raw transcripts/logs, and support authorized irreversible manual redaction with audit metadata.
- Move production-oriented persistence toward normalized SQL tables with a typed SQL layer at the control-plane infrastructure boundary. Domain packages remain independent of SQL drivers, query builders, filesystem APIs, process environment, CLI parsing, and app frameworks.
- Keep local OSS/dev product acceptance real enough to exercise GitHub App integration, SQLite or local Postgres, single-user principal, local filesystem/dev secret storage, and the first-slice workflow. Fake providers remain implementation and test scaffolding, not product acceptance.

## Testing Decisions

- Test external behavior through the same interfaces production callers use. Domain tests should exercise package-level behavior; control-plane tests should exercise command/API-shaped operation handlers; UI tests should exercise user-visible workflows.
- Test every vertical workflow first through the shared control-plane command/client contract, then through the app shells that have been introduced by that slice.
- Test TanStack Start local web mode against a local control-plane server on localhost and remote web mode against a remote/team control-plane configuration.
- Test Electron local modes for launching or connecting to a local control plane, safe preload/IPC behavior, renderer use of the shared UI, and remote Workspace connection.
- Cover the golden path with repeatable end-to-end or integration tests: real GitHub-backed Workspace onboarding, Runtime/Agent/RoleDefinition/policy configuration, intent creation or import, Director Task/Plan creation, Worker execution, PR creation, Provider Check observation, Review Outcome, at least one repair loop, merge/policy evaluation, audit/lineage, Documents context, and GitHub sync visibility.
- Use deterministic test Agents or adapters for stable CI coverage of state machines, Scheduler behavior, GitHub PR flow, policy, review, repair, and merge. Complement that with release smoke coverage against real Claude Code and OpenAI Codex launch, resume, cancel, provider Session identity, progress, and outcome paths.
- When implementing or testing live provider paths, compare expected launch, resume, cancel, approval, user-input, event-normalization, and provider-log behavior against the relevant `reference/t3code/` adapter tests and protocol packages. Port useful test cases only through Stoneforge's Assignment/Session and Agent Command Surface interfaces.
- Test Workspace readiness and onboarding through repository connection, policy, Runtime, Agent, RoleDefinition, docs root, and blocker cases.
- Test GitHub Issue intake policy for supervised and autopilot defaults, trusted maintainer labels, untrusted label warnings, external-origin Draft Tasks, triage approval, sync metadata, PR issue references, and label writeback reconciliation.
- Test Task, Plan, Assignment, Session, Dispatch Intent, AutomationRun, MergeRequest, Verification Run, Repair Context, and cancellation/resume state transitions at semantic boundaries.
- Test Scheduler placement, queueing, capacity leases, retry, unplaceable placement blockers, scoped tag validation, Runtime priority selection, Agent edits, Runtime disable/remove, Host disconnect/reconnect, and non-mutation of running Assignments.
- Test Agent Command Surface authorization, scoped credentials, checkpoint validation, task-local todo updates, escalation requests, preview commands, and denial of unrelated object mutation or Acceptance Criteria changes.
- Test Checkpoint, Repair Context, task progress summary generation, repair deduplication, repair status validation, unsafe/superseded transitions, and same-Task repair dispatch.
- Test MergeRequest policy for direct task PRs, plan aggregation, Required Agent Review, Required Human Review, review freshness, branch protection/ruleset refresh, mergeability, `stoneforge/policy`, and policy blockers.
- Test Verification Run aggregation for passing, failing, pending, missing, stale, optional, neutral, skipped, and required Provider Check cases, including missing-check timeout behavior and repair-trigger creation for required failures.
- Test GitHub review mapping for linked/unlinked human reviewers, eligible/ineligible reviewer identity, Review Agent provider reviews, just-in-time OAuth requirements, and imported GitHub review signals.
- Test Documents through CRUD, source modes, mirrored docs PR write path, version history, relative links, Document Search, category/tags, Document Library separation, Documentation Directory behavior, Code References, materially-used lineage, and policy-disabled Documentation Methodology.
- Test Docs Drift Automations for daily scoped runs, weekly plan-shaped runs, Docs Drift Section Map reuse/revision, in-flight PR handling, docs-only classification, docs-focused review, and mixed code/docs review behavior.
- Test Automations for curated triggers, schedules, missed-run behavior, manual runs, signed inbound webhooks, outbound webhook signing, idempotency, chain-depth blocking, run version snapshots, blocked-run re-evaluation, callbacks, reruns, disabling, and archive/soft-delete semantics.
- Test Host, Runtime, preview, and secret boundaries for registration, capacity, health, contact loss, reconnect reconciliation, preview secret warnings, low-risk preview/dev injection, controlled provider-log access, and local `act` capability reporting.
- Test auth, RBAC, and audit for delegated identity, single-user local principal, GitHub permission projection, linked GitHub identity requirements, sensitive actions, policy-bypass attempts, AuditEvent creation, Workflow Event creation, retention controls, and transcript/log redaction.
- Expand security coverage for app shells to include Electron IPC/preload isolation, desktop local secret storage, local process spawning, update/download trust boundaries, open-url/file-system access, and browser/server trust boundaries for TanStack Start.
- Test UI workflows with browser automation where user-visible behavior changes: onboarding, readiness blockers, operational lists, task detail, Plan graph/activation, MergeRequest diff review, sessions, automations, documents, policy blockers, notifications, and human intervention.
- Include accessibility checks for semantic structure, keyboard navigation, visible focus, accessible labels, contrast, and screen-reader-friendly status text in primary workflows.
- Maintain package coverage thresholds and mutation-strength expectations for critical policy, state-machine, parser, authorization, persistence, and dispatch logic.

## Out of Scope

- V1 or Smithy data migration.
- Editing frozen historical reference implementations or using the prototype as active implementation code.
- Treating `reference/t3code/` as active implementation code, copying t3code's thread-first orchestration model into Stoneforge, or letting t3code provider abstractions override the V2 Scheduler/Assignment/Session/Agent/Runtime/RoleDefinition contracts.
- Cross-repository Workspaces.
- Non-GitHub source-control providers.
- GitHub Projects sync, issue forms/schema mapping, field-perfect Issue sync, perfect bidirectional comment editing/deletion sync, threaded-resolution parity, and complex Issue sync conflict resolution.
- Stoneforge-authored CI/CD workflows, GitHub branch protection/ruleset administration, GitHub Actions rerun controls, workflow dispatch controls, direct CI provider integrations, and provider-specific rerun APIs.
- Dedicated docs-specific GitHub checks or statuses.
- Staging branch topology as a first-class Stoneforge merge model beyond configuring the Workspace target branch to staging.
- Dynamic Host pools, fleet autoscaling, complex host scheduling, and Runtime-level interchangeable Host placement.
- Advanced provider/model routing beyond hard required tags and first-class scoped tag dimensions.
- Fully public REST or GraphQL APIs for every object.
- General policy rule builders, scripting policy languages, policy simulation, policy version diffing, org-wide inheritance UI, and bulk policy management.
- Custom human passwords, MFA, or Stoneforge as a full identity provider.
- Advanced org billing, SSO enforcement, audit export, cross-Workspace policy inheritance, org-wide analytics, cloud SaaS operations, Kubernetes/high availability, managed upgrades, backup/restore automation, and broad Workspace export/import.
- Email, Slack, digest preferences, escalation schedules, notification routing rules, and webhook notification delivery as first-class notification channels.
- Product metrics dashboards, tracing UI, performance analytics, usage analytics, cost analytics, per-task token accounting, budget alerts, invoices, chargeback, pricing plans, and model-cost analytics.
- Separate product behavior, domain rules, policy semantics, or workflow state machines per app shell.
- Treating Electron as a separate backend implementation or allowing renderer code unrestricted Node.js, filesystem, process, or secret access.
- Pixel-perfect reproduction of the prototype when workflow, page coverage, and user-visible behavior remain faithful.
- Full formal WCAG audit, advanced screen-reader certification, localization, and comprehensive keyboard shortcut customization.
- Document-specific ACLs, rich binary uploads, rendered PDF management, Google Docs import, Google Docs-style real-time coauthoring, rich redlines, complex block-editor documents, and automatic external page crawling.
- Semantic/vector Document Search unless it becomes trivial without distracting from core workflow search.
- Cross-repository Code References.
- A per-code-change docs-updater Automation separate from task-local documentation Acceptance Criteria.
- Raw production secret injection into agent-visible environments as a normal path.
- Future forensic raw-retention mode in normal product flows.
- Formal SOC2/compliance certification, penetration testing, and a full threat-model program.

## Further Notes

- The first-slice PRD uses the completed grilling decision log as the latest product decision source when it sharpens or extends the canonical V2 documents.
- The approved UI prototype is a workflow and interaction reference, not an implementation target. Do not edit the reference prototype for this first-slice implementation.
- The first-slice acceptance metric is operational completion: one real repository can be onboarded to ready, receive or create intent, produce a valid Task or Plan, run Worker execution, open a PR, evaluate verification and review gates, recover from at least one failure through repair, and merge with policy, audit/lineage, Documents context, and GitHub sync visible.
- A core success condition is that an operator can quickly understand why work is blocked and which action can unblock it.
- Remaining implementation details that may be decided during build: exact database schema, exact API routes and wire payloads, exact branch naming, exact webhook payload mapping, exact lease timeout values, exact provider SDK usage, exact UI component internals, exact app package layout, exact Electron packaging/updater choice, exact TanStack Start deployment adapter, and exact storage backend for secrets/log artifacts.
- These assumptions materially affect implementation but do not add product scope: normalized SQL should be established early for production-oriented paths; deterministic adapters can support CI; real provider smoke tests are still required for release acceptance; local/dev single-user mode still emits audit and lineage; and mirrored Documents should use one primary docs root in the first slice.
