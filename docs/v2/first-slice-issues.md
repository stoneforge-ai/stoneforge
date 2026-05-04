# Stoneforge V2 First-Slice Issue Plan

Status: active implementation issue tracker

Source PRD: [first-slice-prd.md](first-slice-prd.md)
Source issue: [#64](https://github.com/stoneforge-ai/stoneforge/issues/64)

This plan breaks the first-slice PRD into tracer-bullet vertical slices. Each
slice should leave the platform with a demoable workflow that runs through the
system end to end, then later slices add capability to one or both sides of that
core workflow.

The plan now treats application delivery mode as part of the vertical workflow:
the TanStack Start web app supports local/single-user operation against a local
control-plane server on localhost and remote team operation, while the Electron
desktop app supports desktop-managed local, local, and remote connection modes.
Both shells use the same product model and shared control-plane command/client
contract.

## Reference Material

Use `reference/t3code/` when implementing provider-backed execution paths. The
reference copy is useful for concrete Claude Code, OpenAI Codex, OpenCode, ACP,
Codex app-server, provider-instance, provider health, provider event
normalization, approval/user-input, resume, cancel, and provider-log handling.

Do not use t3code as the product architecture. Stoneforge's Scheduler, Dispatch
Intent, Lease, Assignment, Session, Runtime, Agent, RoleDefinition, Agent
Command Surface, policy, audit, GitHub MergeRequest, Verification Run, and
repair contracts remain the source of truth for first-slice issues.

## Issues

- [x] [#65: V2 Slice 01: Shared contract runs Claude and Codex no-code Tasks](https://github.com/stoneforge-ai/stoneforge/issues/65)
  - Blocked by: None - can start immediately
  - Use `reference/t3code/apps/server/src/provider/`,
    `reference/t3code/packages/contracts/`,
    `reference/t3code/packages/effect-acp/`, and
    `reference/t3code/packages/effect-codex-app-server/` to shape the
    provider-driver and adapter protocol reference points behind the Stoneforge
    Assignment/Session interface.
- [x] [#66: V2 Slice 02: TanStack Start local web runs no-code Tasks](https://github.com/stoneforge-ai/stoneforge/issues/66)
  - Blocked by: #65
- [ ] [#67: V2 Slice 03: Electron local desktop runs no-code Tasks](https://github.com/stoneforge-ai/stoneforge/issues/67)
  - Blocked by: #66
- [ ] [#68: V2 Slice 04: Remote team connection mode for both app shells](https://github.com/stoneforge-ai/stoneforge/issues/68)
  - Blocked by: #66, #67
- [ ] [#69: V2 Slice 05: Provider Worker checkpoints during Task execution](https://github.com/stoneforge-ai/stoneforge/issues/69)
  - Blocked by: #65
  - Use t3code's provider runtime-event normalization and approval/user-input
    handling as reference, but route checkpoint updates through Stoneforge's
    Agent Command Surface rather than inferred transcript text.
- [ ] [#70: V2 Slice 06: Provider Worker makes a task-branch code change](https://github.com/stoneforge-ai/stoneforge/issues/70)
  - Blocked by: #69
  - Use t3code's Claude/Codex/OpenCode adapter launch, turn, interrupt, and log
    handling as provider reference while keeping branch/worktree ownership in
    Stoneforge Runtime, Assignment, and MergeRequest flow.
- [ ] [#71: V2 Slice 07: Task branch opens a GitHub PR MergeRequest](https://github.com/stoneforge-ai/stoneforge/issues/71)
  - Blocked by: #70
- [ ] [#72: V2 Slice 08: Provider Review Agent reviews a GitHub PR](https://github.com/stoneforge-ai/stoneforge/issues/72)
  - Blocked by: #71
  - Use t3code adapter event streams and model/provider instance handling as
    reference for Review Agent execution, not for GitHub review policy or
    MergeRequest state decisions.
- [ ] [#73: V2 Slice 09: GitHub PR merge completes the direct Task workflow](https://github.com/stoneforge-ai/stoneforge/issues/73)
  - Blocked by: #72
- [ ] [#74: V2 Slice 10: Guided onboarding feeds the direct Task workflow](https://github.com/stoneforge-ai/stoneforge/issues/74)
  - Blocked by: #73
- [ ] [#75: V2 Slice 11: Supervised Human Review joins the GitHub workflow](https://github.com/stoneforge-ai/stoneforge/issues/75)
  - Blocked by: #74
- [ ] [#76: V2 Slice 12: Autopilot Agent Review merges without Human Review](https://github.com/stoneforge-ai/stoneforge/issues/76)
  - Blocked by: #74
- [ ] [#77: V2 Slice 13: GitHub Issue intake feeds the direct Task workflow](https://github.com/stoneforge-ai/stoneforge/issues/77)
  - Blocked by: #75
- [ ] [#78: V2 Slice 14: Director creates and runs a two-Task Plan](https://github.com/stoneforge-ai/stoneforge/issues/78)
  - Blocked by: #76, #77
- [ ] [#79: V2 Slice 15: Plan branch aggregation merges through a plan PR](https://github.com/stoneforge-ai/stoneforge/issues/79)
  - Blocked by: #78
- [ ] [#80: V2 Slice 16: Required Provider Check failure repairs and merges](https://github.com/stoneforge-ai/stoneforge/issues/80)
  - Blocked by: #76
- [ ] [#81: V2 Slice 17: Review Change Request repairs and merges](https://github.com/stoneforge-ai/stoneforge/issues/81)
  - Blocked by: #76
- [ ] [#82: V2 Slice 18: Provider Session resumes after crash or context exhaustion](https://github.com/stoneforge-ai/stoneforge/issues/82)
  - Blocked by: #69, #76
  - Use `reference/t3code` resume/cancel/session identity behavior as the main
    provider reference. Stoneforge still decides whether recovery creates a new
    Session under the same Assignment, escalates, or starts repair.
- [ ] [#83: V2 Slice 19: Placement blocker is repaired and work continues](https://github.com/stoneforge-ai/stoneforge/issues/83)
  - Blocked by: #74, #76
- [ ] [#84: V2 Slice 20: Customer-managed Host runs the direct Task workflow](https://github.com/stoneforge-ai/stoneforge/issues/84)
  - Blocked by: #83
  - Use t3code only for provider process/protocol behavior inside the resolved
    Runtime. Host registration, heartbeat, capacity, contact-loss
    reconciliation, and placement remain Stoneforge-specific.
- [ ] [#85: V2 Slice 21: Preview QA is part of review](https://github.com/stoneforge-ai/stoneforge/issues/85)
  - Blocked by: #76, #84
- [ ] [#86: V2 Slice 22: Documents are used in a code-changing Task](https://github.com/stoneforge-ai/stoneforge/issues/86)
  - Blocked by: #76
- [ ] [#87: V2 Slice 23: Docs Drift Automation produces a docs PR](https://github.com/stoneforge-ai/stoneforge/issues/87)
  - Blocked by: #86
- [ ] [#88: V2 Slice 24: Weekly deep Docs Drift uses Plan aggregation](https://github.com/stoneforge-ai/stoneforge/issues/88)
  - Blocked by: #79, #87
- [ ] [#89: V2 Slice 25: User-defined webhook Automation creates work](https://github.com/stoneforge-ai/stoneforge/issues/89)
  - Blocked by: #77
- [ ] [#90: V2 Slice 26: Manual editor intervention updates active PR](https://github.com/stoneforge-ai/stoneforge/issues/90)
  - Blocked by: #76, #85
- [ ] [#91: V2 Slice 27: Security, retention, and redaction in a real workflow](https://github.com/stoneforge-ai/stoneforge/issues/91)
  - Blocked by: #82, #85, #89
- [ ] [#92: V2 Slice 28: Operator observability and accessibility pass](https://github.com/stoneforge-ai/stoneforge/issues/92)
  - Blocked by: #80, #81, #82, #83, #84, #85, #86, #87, #88, #89, #90
  - Use t3code provider event and log shapes as reference inputs for
    Stoneforge's Execution Lineage, Session transcript/log, and operator
    observability surfaces.
- [ ] [#93: V2 Slice 29: First-slice release proving scenario](https://github.com/stoneforge-ai/stoneforge/issues/93)
  - Blocked by: #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75, #76, #77, #78, #79, #80, #81, #82, #83, #84, #85, #86, #87, #88, #89, #90, #91, #92
