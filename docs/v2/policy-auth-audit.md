# Stoneforge V2 Policy, Auth, And Audit

Parent charter: [README.md](README.md)

This document is a subordinate build-shaping spec for trust boundaries in the first Stoneforge V2 slice. It defines delegated human authentication, authorization boundaries, policy shape, approval requirements, secrets handling, and audit expectations without freezing a final RBAC schema or identity-provider implementation.

## Scope And Status

First-slice scope:

- delegated human authentication for cloud and self-hosted deployments
- dev single-user mode for local or OSS development
- Org and Workspace authorization boundaries
- workspace policy presets and approval behavior
- GitHub App service-actor model
- sensitive-action controls, secrets boundaries, and audit requirements

Frozen in this doc:

- Stoneforge does not own human passwords, MFA, or a custom credential system
- Org is the tenant and membership boundary
- Workspace is the main operational and enforcement boundary
- GitHub access uses a GitHub App installation model in the first slice
- Stoneforge owns policy decisions and audit records even when provider systems participate
- the first-slice merge gate includes a Stoneforge-owned policy check/status in GitHub

Working assumptions:

- delegated human auth will be OIDC or OAuth style depending on deployment environment
- a local or OSS dev mode may run as a clearly marked single-user environment
- GitHub human review signals may be imported and mapped to Stoneforge users when identities are linked
- some policy defaults may be org-wide while task dispatch and merge decisions are evaluated at workspace scope

Intentionally not specified yet:

- final RBAC tables or ACL storage
- exact identity-provider integrations
- UI for admin or approval flows
- exact secret storage backend
- enterprise-specific retention windows beyond first-slice defaults

First-slice acceptance should include a lightweight security checklist for the
concrete trust surfaces in scope: GitHub App permissions and token lifetime,
OAuth identity linking, RBAC and reviewer eligibility, Session Command
Credentials, AutomationRun Credentials, webhook signing and idempotency,
secret-backed provider and registry proxies, preview/dev secret warnings,
policy-bypass paths, AuditEvents for sensitive actions, and raw log/payload
retention and redaction. Formal SOC2/compliance certification, penetration
testing, and a full threat-model program are out of scope for the first slice.

## Trust Model

There are four distinct trust subjects in the first slice:

- human users authenticated into Stoneforge through an upstream identity system
- Stoneforge service actors, including the GitHub App and scheduler-owned control-plane actions
- Host Agents and managed-provider adapters acting on behalf of a Workspace
- external automation webhooks, both inbound triggers and outbound automation webhook handlers

The important product rule is that authentication, authorization, policy evaluation, and audit are separate responsibilities:

- authentication proves who the human or service is
- authorization determines what that actor may do
- policy determines whether a requested workflow action is allowed automatically or requires review
- audit records what happened and why

## Human Authentication

Cloud and self-hosted first-slice expectation:

- human auth is delegated to an upstream identity provider
- Stoneforge receives identity assertions and session context from that provider
- Stoneforge does not store human passwords or implement custom MFA

Dev and OSS expectation:

- a clearly marked single-user mode may exist for local development
- dev mode is a convenience escape hatch, not the enterprise trust model
- single-user mode still attributes actions to a local human principal for audit and lineage

## Authorization Boundaries

### Org Scope

Org is the top-level tenant and admin boundary.

Org-scoped concerns:

- membership and group management
- identity-provider linkage
- org-wide defaults and guardrails
- access to create or archive Workspaces

First-slice Org administration should stay minimal: create or select Org, manage
Workspaces, basic membership and roles, and GitHub org/repo permission
projection. Advanced org billing, SSO enforcement, audit export,
cross-Workspace policy inheritance, and org-wide analytics are out of scope.

### Workspace Scope

Workspace is the main operational boundary.

Workspace-scoped concerns:

- repository onboarding
- host, runtime, agent, and role configuration
- task, plan, and automation management
- dispatch, review, approval, merge, and cancellation decisions
- secrets used by that Workspace
- audit partitioning for day-to-day execution and review actions

## Authorization Subjects

The first slice should support these semantic subject classes even if the final RBAC schema differs:

| Subject class   | Typical responsibilities                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Org owner/admin | membership, org defaults, workspace creation, org-level policy, aligned with GitHub organization administration concepts       |
| Repo admin      | repository connection, hosts, runtimes, agents, roles, automations, workspace policy, secrets, aligned with GitHub repo admin |
| Operator        | task and plan creation, dispatch, steering, resume, cancel, failure handling                                                  |
| Reviewer        | inspect execution, review MergeRequests, record Review Approved, or request changes                                           |

One human may belong to multiple subject classes.

First-slice RBAC should mirror GitHub's organization and repository permission
model wherever possible. Org membership should align with GitHub organization
concepts such as owner/admin and member. Repository/workspace permissions should
align with GitHub repository roles such as read, triage, write, maintain, and
admin. Required review rules should align with GitHub required PR reviewers,
including repository-specific reviewer and team requirements. Stoneforge may
add workflow policy on top, but it should not introduce a separate Approver role
distinct from Reviewer.

For GitHub-backed Workspaces, GitHub is the source of truth for repository
access and human reviewer eligibility in the first slice. Stoneforge may store
cached projections for UI, policy evaluation, and audit, and may add workflow
requirements such as Required Agent Review or Director activation review. It
must not contradict GitHub repository permissions or allow a human to review or
merge through Stoneforge when GitHub would not allow the equivalent repository
action.

In self-hosted team mode, delegated OIDC or OAuth authentication proves the
Stoneforge Human User, but GitHub-backed review and merge actions require a
linked GitHub identity whose repository permissions satisfy the relevant
GitHub-style rule. Stoneforge org or Workspace membership alone may authorize
Stoneforge-only actions such as viewing, task creation, steering, and policy
administration, but it must not satisfy Required Human Review or authorize
merge requests into GitHub without an eligible linked GitHub identity.

In local OSS/dev single-user mode, GitHub org and repository membership may be
unavailable. Stoneforge should treat the local human principal as repo admin,
operator, and reviewer for the connected Workspace, and clearly mark the UI as
local/single-user mode. Required Human Review may be satisfied by that local
principal unless the Workspace is explicitly connected to GitHub identity and
configured to enforce GitHub reviewer eligibility.

## Policy Shape

Policy is one system with Org defaults and Workspace-effective evaluation.

The first slice should define policy decisions for:

- how GitHub Issues are imported, ignored, triaged, converted to Draft Tasks, or promoted for trusted sources
- whether imported GitHub Issues require human approval before Director triage, with modes for no Issues, externally created Issues only, or all Issues
- whether trusted-maintainer labels such as `stoneforge:auto-dispatch` or `stoneforge:auto-triage` may override normal GitHub Issue intake and triage-approval policy
- which linked GitHub identities and repository permissions qualify as trusted maintainers for honoring `stoneforge:*` labels
- whether ignored `stoneforge:*` labels notify maintainers beyond Stoneforge UI and lineage; public GitHub comments are off by default
- whether Stoneforge may write reserved `stoneforge:*` labels for status, priority, or complexity back to GitHub Issues
- how Stoneforge reconciles direct GitHub edits to Stoneforge-owned mirror labels such as status, priority, or complexity; these labels are not first-slice command inputs
- whether PRs created from linked Tasks may use issue-closing keywords, with the first-slice default allowing closure only when the linked Issue has exactly one linked Task
- whether plan PRs may close source Issues when those Issues decompose into multiple linked Tasks
- which blocked AutomationRuns may be automatically re-evaluated when blocking facts change: platform and non-external user-defined automations only, all automations, or no automations
- the user-defined automation chain-depth cap, defaulting conservatively to `3`
- whether inbound webhook signing may use a workspace-wide signing secret or must use per-webhook signing secrets
- whether outbound automation webhook signing may use a workspace-wide signing secret or must use per-destination signing secrets
- whether the Workspace Documentation Methodology is enabled; disabling it removes or hides default RoleDefinition documentation-update instructions, prevents default documentation Acceptance Criteria from being added to Tasks, disables Docs Drift Automations, and disables manual docs-drift trigger suggestions on Document edits
- the Workspace Document Source Mode, with mirrored docs as the default for repository-linked Workspaces and Stoneforge-only or repo-backed modes available when policy/configuration chooses them
- Document visibility and access inherits Workspace policy in the first slice; document-specific ACLs are out of scope
- whether user-defined code-first automations may create Tasks or Plans, and whether those created objects move forward by default, require Director triage, become draft/non-dispatchable, or become ready/active
- whether an AutomationRun Credential may request Director triage for automation-created Tasks or Plans
- whether an AutomationRun Credential may request Director triage for existing Tasks, Plans, or imported Issues
- Workspace policy is the ceiling for automation-created Task/Plan behavior; Automation configuration can only narrow it
- whether a Task or Plan may dispatch automatically
- which RoleDefinitions or Agent pools may be used
- whether automated review is allowed
- whether required review is needed before merge
- whether docs-only MergeRequests are exempt from Required Human Review; this is an explicit Workspace policy toggle, not an implicit supervised-preset exemption
- docs-only policy applies only after extension-based changed-file verification confirms every changed file is a recognized Markdown or text documentation file, such as `README.md`, `.md`, `.mdx`, `.txt`, or another configured text-doc extension
- the Workspace-configurable docs-only extension set, defaulting to `.md`, `.mdx`, `.txt`, and `.rst`
- config-like files such as `.json`, `.yaml`, and `.yml` are excluded from docs-only defaults unless deliberately added by Workspace policy
- docs-only classification treats creates, edits, and deletions the same way when all changed files have recognized docs-only extensions; deletion risk is handled by review policy, not code reclassification
- changing the docs-only extension set requires warning and authorized confirmation when open MergeRequests would be reclassified; open MergeRequests are re-evaluated and terminal or merged MergeRequests keep historical classification
- which humans or groups may review specific categories of work
- whether sensitive administrative actions require elevated authorization
- what failure loops trigger automatic escalation

First-slice preset expectations:

- `supervised` is the default preset
- `autopilot` also exists to prove the policy space
- the first-slice UI should provide a simple Workspace policy configuration surface, not a general policy language or editor
- the policy surface should support selecting `autopilot` or `supervised`, configuring the first-slice policy values identified in these docs, and showing effective policy and readiness consequences
- a generic rule builder, scripting policy language, org-wide inheritance UI, policy simulation, policy version diffing, and bulk policy management are out of scope

`supervised` means:

- automated dispatch and review are allowed
- code-changing merge requires at least one qualifying Required Human Review by default unless explicitly exempted by policy
- agent review is optional by default, but policy may require Required Agent Review before merge
- human Review Approved outcomes may be recorded before Verification Runs or agent review pass unless policy specifically requires those conditions first
- human Review Approved outcomes may be recorded while required Provider Checks are pending by default, but they do not satisfy merge readiness until policy-required verification and other gates pass
- policy may optionally require verification before a Human Review Approved outcome may be recorded or counted
- Required Review freshness follows GitHub-compatible semantics in the first slice
- for GitHub-backed Workspaces, GitHub branch protection/rulesets are the source of truth for stale-approval dismissal and most-recent-reviewable-push requirements
- Stoneforge may cache and display observed GitHub Required Review freshness settings, but should not allow conflicting local overrides for GitHub-backed repos in the first slice
- local and non-GitHub modes may use equivalent Workspace policy settings for stale-approval dismissal and most-recent-reviewable-push behavior
- stale-approval dismissal makes prior Review Approved outcomes stale for Required Review satisfaction after a diff-changing push or merge-base change, while preserving them in history
- when stale-approval dismissal is not enabled, prior approvals may remain eligible across later commits unless a most-recent-reviewable-push rule requires approval after the latest reviewable push by someone other than the pusher
- GitHub branch protection/ruleset changes while a MergeRequest is open are merge-readiness input changes; Stoneforge should refresh or observe provider settings, re-evaluate Required Review satisfaction, and republish `stoneforge/policy` if the decision changes
- GitHub branch protection/ruleset changes do not create repair work because they are policy/merge-readiness changes rather than code defects
- the first slice refreshes GitHub branch protection/ruleset settings during PR observation and merge evaluation rather than continuously monitoring them
- the UI should show the last observed GitHub Required Review freshness settings and refresh time, with a manual refresh action when needed
- Review Agent dispatch waits for required Provider Checks to pass or fail by default; policy may allow early Review Agent dispatch before required verification completes
- if required checks fail, repair triggers before Review Agent dispatch; if a missing required check becomes a policy blocker, Review Agent dispatch should not run because merge is blocked by configuration
- Review Agent dispatch does not wait for optional-provider-check Director triage, which runs in parallel and adds reviewer context to the MergeRequest when available
- GitHub Issue intake defaults to import/sync as non-dispatchable draft Tasks that may appear in backlog/intake UI, and externally created Issues require human approval before Director triage
- trusted-maintainer labels may override normal Issue intake by default unless policy disables that override, but labels from unlinked users or external contributors are ignored for Stoneforge intake automation

`autopilot` means:

- the system may merge automatically when policy, verification, mergeability, and review conditions are satisfied
- the default autopilot preset requires Required Agent Review for code-changing merge
- GitHub Issue intake defaults to import/sync plus Director triage, with no imported Issues requiring human approval before Director triage
- trusted-maintainer labels may override normal Issue intake by default unless policy disables that override, but labels from unlinked users or external contributors are ignored for Stoneforge intake automation

## Merge And Review Boundary

The first-slice GitHub merge gate should work as follows:

- GitHub remains the repository and PR substrate
- Stoneforge publishes a required `stoneforge/policy` check or status to GitHub
- the published provider status targets the current PR head SHA observed through the provider boundary
- Stoneforge policy evaluation determines whether the policy check is passing
- Stoneforge publishes only the normal `stoneforge/policy` GitHub check/status in the first slice
- Provider Checks come from GitHub Actions or other GitHub-integrated CI providers, not Stoneforge-created auxiliary statuses
- any observed GitHub check/status may become a Provider Check regardless of whether it originated from GitHub Actions, Buildkite, CircleCI, Jenkins, or another provider
- direct CI provider integrations, provider-specific log APIs, provider-specific log fetching, and provider-specific rerun controls are out of scope
- GitHub verification checks remain required according to workspace and repository rules
- imported GitHub reviews may contribute signals, but Stoneforge policy is the canonical required-review decision-maker
- Stoneforge imports enough GitHub review, reviewer identity, and branch protection/ruleset data to decide Required Review satisfaction
- Stoneforge does not fully mirror GitHub's reviewer request UI, CODEOWNERS assignment behavior, or team notification workflow in the first slice beyond displaying useful context
- imported GitHub Review Approved outcomes may satisfy Stoneforge Required Reviews only when the provider reviewer identity is linked to a Stoneforge human user who is authorized for that requirement
- unlinked GitHub reviews may be displayed or recorded as provider context, but they do not satisfy Stoneforge Required Reviews
- Human Review Outcomes recorded in Stoneforge are posted back to GitHub as PR reviews only through the Human Reviewer's linked eligible GitHub OAuth identity
- Human Review Approved maps to a GitHub approve review, and Human Change Request maps to a GitHub request-changes review
- without an eligible linked GitHub OAuth identity, a Stoneforge human review may be recorded as context but does not satisfy GitHub-side or Stoneforge Required Human Review for that repo
- Stoneforge should not imply that the GitHub App can impersonate a human reviewer
- GitHub OAuth linking for humans is just-in-time, not a Workspace onboarding blocker
- Workspace onboarding may install the GitHub App and connect repositories without every human linking OAuth
- when a human attempts a review or merge action that must be attributed to them in GitHub, Stoneforge prompts them to link GitHub OAuth and then returns them to the action
- Review Agent outcomes are posted back to GitHub as PR reviews while remaining canonical Stoneforge Review Outcomes
- Review Approved maps to a GitHub approve review, and Change Request maps to a GitHub request-changes review
- provider PR reviews created from Review Agent outcomes are linked back to the Stoneforge Review Outcome, Assignment, and Session for audit and lineage
- Review Agent GitHub PR reviews may satisfy GitHub-side required review rules when GitHub branch protection/rulesets accept the GitHub App or bot review
- if GitHub requires a human, CODEOWNER, team, or latest-push eligible reviewer that the Review Agent cannot satisfy, Stoneforge shows a provider-side merge blocker rather than treating the agent review as sufficient
- GitHub branch protection or rulesets are the source of truth for Required Review freshness policy in GitHub-backed Workspaces
- when GitHub Required Review freshness settings change, Stoneforge should re-evaluate open MergeRequests and republish provider policy status if needed

Required Provider Checks:

- Workspace policy owns the list of Provider Checks required for Verification Runs.
- GitHub branch protection or repository rulesets may seed default required-check policy during onboarding, but provider configuration is not the source of truth for Stoneforge policy.
- Stoneforge may mark observed GitHub checks/statuses as required or optional for Stoneforge merge readiness, but GitHub remains where CI/CD workflows, branch protection, rulesets, and provider-side required checks are configured.
- Stoneforge does not manage GitHub branch protection or repository rulesets in the first slice.
- The supervised preset should default to requiring at least one passing Provider Check for code-changing merge.
- Workspaces may explicitly disable the required-provider-check policy when they do not use provider checks.
- When a MergeRequest has no observed Provider Checks and policy requires one, the MergeRequest UI should make the blocker obvious and offer a short disable flow with a warning and confirmation.
- Required Provider Checks are satisfied only by explicit provider success by default: GitHub check-run `success` or commit status `success`.
- Pending, running, missing, or stale observations keep Verification pending or stale; terminal non-success states fail required checks.
- `neutral` and `skipped` do not satisfy required Provider Checks by default, but Workspace policy may allow either for specific check names.
- Missing required Provider Checks start as pending while the PR/check observation window is fresh.
- The observation window is controlled by a Workspace policy value such as `requiredProviderCheckMissingTimeoutMinutes`, defaulting to 10 minutes after PR head observation.
- After the timeout, or immediately after GitHub reports that all current checks are complete and the required check is still missing, a missing required check becomes a policy blocker, not a Repair Trigger.
- The MergeRequest UI should show the missing required check name and offer the existing disable/warning-confirmation path for authorized users.
- `stoneforge/policy` remains pending while the missing required check is still inside the fresh observation window, then is republished as failing with a clear missing-check reason once the policy blocker is confirmed.
- A terminal failing required Provider Check automatically creates a Repair Trigger for the source Task or Plan MergeRequest.
- Provider-check Repair Context includes the failing check name, head SHA, provider URL and log summary when available, and whether this is a first or repeated failure.
- Failed optional Provider Checks do not create Repair Triggers or block merge by default, but they are reported to a Director Agent for triage; they remain visible MergeRequest/provider context unless Workspace policy marks the check required.
- Optional-provider-check Director triage is grouped per MergeRequest head SHA. Multiple optional failures on the same head create or update one unresolved Director triage dispatch with all failed optional checks as context; a new head SHA starts a new triage group.
- Optional-provider-check Director triage outcomes are non-blocking: no-op with rationale, add reviewer context, or create non-blocking follow-up Tasks.
- Reviewer context produced by optional-provider-check Director triage is persisted as first-class MergeRequest reviewer context with provenance to the Director Assignment/Session and failed optional Provider Checks.
- Optional-provider-check reviewer context is Stoneforge-only by default and should not be posted as GitHub comments unless a later policy explicitly enables provider-side visibility.
- The first slice should not add a human-approval exception for provider-check repair based on high-risk or sensitive targets.
- Provider-check repair automatically stores bounded failure context, not full CI logs by default.
- Full CI logs are fetched for UI review only when available through documented GitHub APIs. GitHub Actions workflow/job logs are required, while other CI provider logs are supported only if GitHub exposes retrievable log data without provider-specific integration. Fetched logs may be cached with retention limits.
- The first slice should not depend on undocumented GitHub live-log streaming behavior.
- Agents may run GitHub Actions locally through the `act` CLI inside capable Runtimes to validate likely repairs before pushing commits.
- Managed Runtimes include `act` by default when Docker/container execution is available; customer-managed Runtimes report `act` availability as a Runtime capability.
- When `act` is unavailable, agents fall back to project-local tests and then rely on GitHub Actions rerunning after push.
- Local `act` verification uses the same low-risk preview/dev secret boundary as previews by default.
- Secrets injected into local Actions verification are agent-observable and may appear in agent-visible logs; production credentials must not be injected.
- When a workflow needs secrets that are unavailable or not approved for preview/dev use, local Actions verification is partial and GitHub Actions after push remains authoritative for those portions.
- Local `act` verification is best-effort and does not promise parity with GitHub-hosted runners, service containers, matrix behavior, hosted runner images, or every GitHub Actions feature.
- When local `act` behavior is unsupported or divergent, agents fall back to project-local tests and GitHub Actions after push.
- Local `act` output remains session-local agent working context only.
- Stoneforge does not create UI artifacts, lineage records, repair-context items, Provider Checks, Verification Runs, or GitHub checks/statuses from local `act` results.
- Only GitHub-observed checks can satisfy required Provider Checks.
- Stoneforge does not expose GitHub Actions rerun, workflow dispatch, or arbitrary remote workflow execution controls in the first slice; remote Actions rerun through normal provider push-trigger behavior after repair commits.

Review model:

- Review Approved outcomes are recorded by authenticated human users or authorized Review Agents
- those Review Approved outcomes are checked against Org and Workspace policy to satisfy eligible Required Reviews
- Review Approved is the approval event in Stoneforge; there is no separate standalone approval record, Approval Gate record, or Approver role in the current model
- policy determines whether a Review Approved outcome may be recorded before other gates pass and whether it can satisfy merge readiness before verification, mergeability, or other review requirements pass
- policy should distinguish Review Approved outcome recording from Required Review satisfaction; recording is usually permissive, while required-review satisfaction is evaluated only when all policy-required conditions for that requirement are met
- review and Required Review attribution is recorded in Stoneforge audit
- Stoneforge may mirror or annotate provider review state, but the required merge gate is the Stoneforge policy check

## GitHub App Service Actor

The first-slice GitHub actor model is service-actor based.

Rules:

- repository access is granted through a GitHub App installation
- Stoneforge performs repo operations through that app identity
- branch creation, PR creation, status publication, comments, and merge actions run through the service actor
- approval attribution is recorded separately in Stoneforge rather than being reduced to provider bot behavior

This keeps automation durable and auditable while preserving a clear boundary between provider operations and Stoneforge policy decisions.

Tracer-bullet implementation notes:

- GitHub App JWT creation and installation-token exchange live in the control-plane infrastructure layer.
- App private keys are loaded from explicit config or environment values and are not part of domain snapshots.
- Installation access tokens are short-lived and refreshed behind the token-provider boundary.
- Missing App ID, private key, installation access, repository grants, branch update failures, PR failures, unavailable checks, disabled merge, and rejected merge are reported as human-readable control-plane errors.
- PAT authentication is not the primary integration path; any future PAT use must be clearly marked dev-only.

## Sensitive Actions

Sensitive actions must be policy-checked and auditable.

First-slice sensitive actions include:

- onboarding or disconnecting a repository
- creating, rotating, or deleting integration credentials or secrets
- registering, reconnecting, or removing a Host
- creating or editing Runtime, Agent, RoleDefinition, Automation, or Policy objects
- dispatching, resuming, canceling, or force-stopping execution
- approving, merging, closing, or overriding MergeRequest flow
- configuring inbound webhook triggers or outbound automation webhook destinations
- changing failure thresholds or escalation behavior

The exact approval chain for each sensitive action does not need to be frozen here, but the requirement that these actions flow through authorization, policy, and audit is frozen.

## Secrets Boundaries

Secrets must be treated as boundary-specific, not global ambient state.

Platform Secrets:

- identity-provider credentials
- GitHub App credentials
- outbound webhook signing secrets
- inbound webhook signing secret rotation and old-secret retirement
- outbound automation webhook signing secret rotation and old-secret retirement
- managed-provider integration credentials

Org Secrets:

- org-owned integration credentials available only through Org and Workspace policy
- org-owned provider credentials shared with approved Workspaces

Workspace Secrets:

- repository access tokens issued for a specific assignment
- runtime-scoped environment variables needed for execution
- preview environment variables for low-risk dev-preview use

Boundary rules:

- inject the minimum secret set needed for the current assignment
- prefer capability-based secret use over raw secret exposure to an LLM-visible process
- use Stoneforge-controlled APIs, CLIs, tools, or proxies for routine secret-backed operations such as GitHub access, package registry access, artifact access, runtime provider access, cloud/provider operations, and webhook signing
- expose secret-backed operations to agents only through the policy-checked Agent Command Surface, with lineage and audit records for sensitive operations
- authenticate agent calls to the Agent Command Surface with short-lived Session Command Credentials scoped to the Assignment/Session, Workspace, target, resolved branch/worktree/runtime, and allowed command categories
- do not use human user credentials or provider secrets as Session Command Credentials
- allow code-changing Assignments to use short-lived GitHub App installation credentials for ordinary `git` operations inside the resolved Runtime worktree and branch
- treat GitHub repository access as repository/permission-scoped rather than branch-scoped at the credential layer; Stoneforge policy and GitHub branch protection/rulesets provide the branch-level control boundary
- keep merge, branch protection bypass, provider administration, and cross-target branch mutation behind Stoneforge-controlled policy checks
- treat unauthorized branch mutation as a recoverable policy violation that emits AuditEvents and creates repair work by default, rather than immediately requiring human repair
- return sanitized operation results to agents rather than secret values
- prefer short-lived credentials, especially for repository access
- treat runtime injection as a permitted use of Platform Secrets, Org Secrets, or Workspace Secrets rather than a separate ownership scope
- treat raw secret injection into an agent-visible shell, filesystem, prompt, transcript, or checkpoint as a high-risk escape hatch, if supported at all
- Checkpoint and Repair Context redaction is not required in the first slice unless it can reuse the transcript/log redaction path with little added complexity
- treat preview environment variables as potentially exposable to the agent, because app code can render or log them through the preview surface
- clearly mark preview environment variables as low-risk/dev-preview secrets rather than protected production secrets
- require users to declare whether a Workspace Secret is allowed for preview use instead of relying on Stoneforge to infer production-vs-preview safety from the secret value
- allow one explicit approval to cover a batch of Preview Secrets configured together, as long as the UI clearly applies the exposure warning to the full batch
- use provider-specific secret-shape heuristics only as warnings or guardrails where the distinction is obvious; do not treat heuristics as the source of truth
- do not expose org-global secrets to arbitrary Workspaces or Hosts
- do not require customer-managed Hosts to keep long-lived repo credentials by default
- audit secret issuance and sensitive secret use without logging secret values

## Session Command Credentials

A Session Command Credential is a Stoneforge-issued credential for agent access
to the Agent Command Surface. It is minted for one Assignment/Session and scoped
to that execution context: Workspace, target Task or MergeRequest, resolved
branch/worktree/runtime, and command categories allowed by effective Policy and
target context. RoleDefinitions do not request or restrict Agent Command Surface
categories in the first slice; all RoleDefinitions receive the same command
surface shape until useful separation boundaries are known.

Session Command Credentials must be short-lived, rotatable, and revocable on
Assignment or Session cancel/stop. They are not human user credentials and are
not provider secrets. Commands authenticated this way record actor attribution
as the selected Agent and Session plus the service-actor execution path. Human
lineage is attached only when an authenticated human steers the Session.

## AutomationRun Credentials

An AutomationRun Credential is a Stoneforge-issued credential for user-defined
code-first automation access to the Stoneforge API. It is minted for one
AutomationRun and scoped to the Workspace, AutomationRun, configured target
objects, allowed API action categories, and expiry. It may be included in or
retrievable from the outbound webhook context.

AutomationRun Credentials are usable from outbound delivery through the
`running` state, including final API calls before completion callback. They must
be short-lived, rotatable, and revoked when the AutomationRun reaches any
terminal state such as `succeeded`, `failed`, or `canceled`, or when it expires.
They are not human user credentials and are not broad service tokens. API calls
authenticated this way record service-actor lineage with AutomationRun
correlation and emit AuditEvents for sensitive actions.

## Tenant And Workspace Isolation Assumptions

First-slice isolation assumptions:

- each Workspace is an isolated operational partition for tasks, runs, merge flow, secrets usage, and audit
- Workspaces in the same Org may inherit policy defaults but do not share execution state by default
- Host and Runtime registration is scoped to the Workspace they serve unless an explicit shared-capacity model is designed later
- automation webhooks are scoped to one Workspace and one configured automation path
- workflow triggers, outbound automation requests, and callbacks must not contain secrets; AutomationRun detail may show those raw payloads without special first-slice redaction or permissions
- Stoneforge may warn on obvious secret-looking automation payload field names such as `secret`, `token`, `password`, `apiKey`, or `privateKey`; heavy DLP for automation payloads is out of scope

## Audit Requirements

Audit is not optional bookkeeping. It is part of the product contract.

OpenTelemetry spans, logs, and metrics are required diagnostic signals for backend execution, but they are not audit records. Effect-based backend internals should attach trace context and Stoneforge correlation identifiers to policy-sensitive work so operators can move from telemetry to the corresponding AuditEvent and Execution Lineage record.

Product-facing observability in the first slice stays limited to operator
workflow visibility: Execution Lineage, Audit Trail, Session transcripts and
logs, AutomationRun history, Host and Runtime health, Verification Run and
Provider Check status, policy blockers, in-app notification surfaces, and
operational list filters. Metrics dashboards, tracing UI, performance
analytics, cost analytics, usage analytics, and Workspace or Org reporting are
out of scope.

AuditEvents and durable Workflow Events are append-only and retained
indefinitely by default in local and self-hosted deployments unless an
administrator configures retention. Workspace policy owns retention for raw
Session transcripts, provider logs, CI logs, Automation payloads, preview logs,
and runtime logs. Those raw records should have configurable retention with
conservative defaults, while bounded summaries, lineage, object state, review
outcomes, merge decisions, Checkpoints, and Repair Context remain longer-lived
because they are needed for continuity, compliance, and lineage. Deletion or
redaction should preserve audit tombstones and enough metadata to explain what
happened without retaining sensitive raw content.

Stoneforge should apply best-effort automatic redaction for known secret
patterns before storing or displaying raw transcripts/logs. Automatically
redacted transcript/log content is the canonical stored transcript/log content
in the first slice; Stoneforge does not retain an unredacted original by
default. Authorized users may also manually redact transcript/log ranges after
storage. Manual redaction emits an AuditEvent with actor, target range,
timestamp, outcome, and reason, but the redacted sensitive value must not be
logged in the audit path.

Repair Context status transitions are policy-sensitive workflow events. When a
repair Assignment proposes `superseded` or `unsafe`, Stoneforge validates and
records the resulting transition with the source Assignment, Session, target
Repair Context item, source trigger type, source object, reason, and policy
decision. Human changes to Repair Context status also emit AuditEvents. `unsafe`
transitions must be visible in lineage because they can move a Task toward
`human_review_required`; `superseded` transitions must reference the newer
review, verification, branch-health, or policy fact that made the old context
obsolete. Repair Context item content is append-only; audit and workflow events
record status transitions rather than destructive edits.

Manual transcript/log redaction is irreversible in the product flow: the
stored/displayed content range is permanently replaced with a redaction marker
and metadata. Session and Execution Lineage views should keep visible
placeholders for redacted ranges, with authorized metadata such as actor,
timestamp, and reason. Restoring redacted content requires external
backup/restore outside normal Stoneforge UI and API flows. Any future forensic
raw-retention mode must be an explicit high-risk self-hosted policy with
separate access controls and audit.

Each required AuditEvent should capture enough information to answer:

- who initiated the action
- which service actor or adapter executed it
- what object was targeted
- what policy decision applied
- what the outcome was
- how the action correlates to Task, Assignment, Session, MergeRequest, Host, or provider activity

Recommended audit fields:

- audit event identifier
- timestamp
- org identifier
- workspace identifier when applicable
- actor kind and actor identifier
- effective human principal when a service acts on behalf of a human-approved flow
- action name
- target type and target identifier
- outcome and reason
- policy snapshot or policy decision reference
- correlation identifiers for AutomationRun, Dispatch Intent, Assignment, Session, MergeRequest, Verification Run, Host connection, or webhook call
- trace identifiers when an OpenTelemetry trace or span exists for the action
- external provider identifiers when relevant

## Required Audit Families

The first slice should emit audit records for at least:

- auth and session establishment
- repository onboarding and GitHub App linkage changes
- policy changes
- host registration, reconnection, and removal
- runtime, agent, and role-definition changes
- automation and webhook configuration changes
- automation trigger evaluation and AutomationRun outcomes when they create workflow intent, call code-first handlers, are blocked by policy, or fail after retries
- manual AutomationRun replays and run-with-edited-inputs actions, including the original run link and input diff for edited runs
- Automation definition version changes and the Automation version or effective definition snapshot used by each AutomationRun
- dispatch, resume, cancellation, and force-stop actions
- approval, change-request, merge, and override actions
- secret issuance and sensitive secret use
- code-first outbound webhook deliveries

## Intent Example

Intent example only. This is not final implementation code.

```json
{
  "actor": {
    "kind": "human",
    "id": "user_123"
  },
  "action": "merge_request.approve",
  "target": {
    "type": "MergeRequest",
    "id": "mr_456"
  },
  "workspaceId": "ws_789",
  "policyDecision": "approved_under_supervised_policy",
  "effectiveServiceActor": "github_app_installation_42",
  "correlation": {
    "taskId": "task_101",
    "runId": "run_202"
  }
}
```
