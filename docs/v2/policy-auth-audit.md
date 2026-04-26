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
- exact audit retention policies

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

## Authorization Boundaries

### Org Scope

Org is the top-level tenant and admin boundary.

Org-scoped concerns:

- membership and group management
- identity-provider linkage
- org-wide defaults and guardrails
- access to create or archive Workspaces

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

| Subject class   | Typical responsibilities                                                                      |
| --------------- | --------------------------------------------------------------------------------------------- |
| Org admin       | membership, org defaults, workspace creation, org-level policy                                |
| Workspace admin | repository connection, hosts, runtimes, agents, roles, automations, workspace policy, secrets |
| Operator        | task and plan creation, dispatch, steering, resume, cancel, failure handling                  |
| Reviewer        | inspect execution, review MergeRequests, request changes                                      |
| Approver        | satisfy Approval Gates where policy allows that actor                                  |

One human may belong to multiple subject classes.

## Policy Shape

Policy is one system with Org defaults and Workspace-effective evaluation.

The first slice should define policy decisions for:

- whether a Task or Plan may dispatch automatically
- which RoleDefinitions or Agent pools may be used
- whether automated review is allowed
- whether approval is required before merge
- which humans or groups may approve specific categories of work
- whether sensitive administrative actions require elevated authorization
- what failure loops trigger automatic escalation

First-slice preset expectations:

- `supervised` is the default preset
- `autonomous` also exists to prove the policy space

`supervised` means:

- automated dispatch and review are allowed
- code-changing merge requires an Approval Gate unless explicitly exempted by policy
- policy may require both human and agent Approval Gates before merge

`autonomous` means:

- the system may merge automatically when policy, verification, and review conditions are satisfied

## Merge And Approval Boundary

The first-slice GitHub merge gate should work as follows:

- GitHub remains the repository and PR substrate
- Stoneforge publishes a required `stoneforge/policy` check or status to GitHub
- the published provider status targets the current PR head SHA observed through the provider boundary
- Stoneforge policy evaluation determines whether the policy check is passing
- GitHub verification checks remain required according to workspace and repository rules
- imported GitHub reviews may contribute signals, but Stoneforge policy is the canonical approval decision-maker

Review approval model:

- Review Approved outcomes are recorded by authenticated human users or authorized Review Agents
- those Review Approved outcomes are checked against Org and Workspace policy to satisfy eligible Approval Gates
- review and Approval Gate attribution is recorded in Stoneforge audit
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
- managed-provider integration credentials

Org Secrets:

- org-owned integration credentials available only through Org and Workspace policy
- org-owned provider credentials shared with approved Workspaces

Workspace Secrets:

- repository access tokens issued for a specific assignment
- runtime-scoped environment variables needed for execution

Boundary rules:

- inject the minimum secret set needed for the current assignment
- prefer short-lived credentials, especially for repository access
- treat runtime injection as a permitted use of Platform Secrets, Org Secrets, or Workspace Secrets rather than a separate ownership scope
- do not expose org-global secrets to arbitrary Workspaces or Hosts
- do not require customer-managed Hosts to keep long-lived repo credentials by default
- audit secret issuance and sensitive secret use without logging secret values

## Tenant And Workspace Isolation Assumptions

First-slice isolation assumptions:

- each Workspace is an isolated operational partition for tasks, runs, merge flow, secrets usage, and audit
- Workspaces in the same Org may inherit policy defaults but do not share execution state by default
- Host and Runtime registration is scoped to the Workspace they serve unless an explicit shared-capacity model is designed later
- automation webhooks are scoped to one Workspace and one configured automation path

## Audit Requirements

Audit is not optional bookkeeping. It is part of the product contract.

OpenTelemetry spans, logs, and metrics are required diagnostic signals for backend execution, but they are not audit records. Effect-based backend internals should attach trace context and Stoneforge correlation identifiers to policy-sensitive work so operators can move from telemetry to the corresponding AuditEvent and Execution Lineage record.

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
- correlation identifiers for dispatch intent, Assignment, Session, MergeRequest, Verification Run, Host connection, or webhook call
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
