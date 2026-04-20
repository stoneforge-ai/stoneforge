# Team-Mode UI/UX Upgrade for Smithy-Next

## Context

The smithy-next prototype is currently designed for a single-operator workflow — one human managing multiple agent sessions locally. This plan extends it to support team-based collaborative workflows using **Progressive Disclosure**: solo mode remains the clean, focused experience (free OSS, local-first); team features appear as additive UI layers when connected to a Stoneforge Cloud org (cloud SaaS). A mode toggle in the prototype lets us evaluate both experiences side by side.

**Business model alignment:** Solo mode is entirely free and open-source with no cloud dependency. Team mode is offered as a managed cloud SaaS product. The UI is the same app — team features simply appear when relevant.

**Key decisions:**
- **Org model:** Org → Teams/Individuals → Workspace access grants
- **Agent sessions:** v1 observation-based sharing, creator can lock to read-only, eventually fully interactive
- **Concurrency:** Soft claims with warnings (not hard locks) — applies in both modes since even a solo user can have multiple agents that could collide
- **Scope:** All tiers implemented in tandem as one cohesive upgrade
- **Attribution model:** "Launched by [human]" was removed from the task-level data model. With the dispatch daemon model (see 11B.8), agents may be spawned by a team daemon not tied to any user, making per-task human attribution architecturally incorrect. Who prompted the work is tracked at the session level (Director sessions already know their initiator), not baked into the task. Task-level attribution is limited to Creator (who filed the task) and Assignee (the agent responsible).
- **Dispatch daemon:** One daemon per workspace. The daemon is an orchestration process that needs a machine to stay alive on, but does not need a worktree/sandbox/Docker — it reuses the Runtime's host connection only. The daemon and the agents it spawns can each run on different runtimes (daemon on a staging server, workers on GPU clusters, stewards on lightweight containers). Both solo and team users can run the daemon remotely to decouple autonomous workflows from their local machine. The daemon host is a workspace-level setting, visible in the TopBar and configurable from the Runtimes page. See Workstream 11B.8.

---

## Workstream 1: Data Model Foundation

**File:** `src/mock-data.ts`

### 1.1 New core interfaces (add before the existing `Task` interface)

- [x] Add `StoneforgeUser` interface — unified identity replacing all string-based name/"You" references:
  ```ts
  interface StoneforgeUser {
    id: string              // 'user-adam', 'user-sarah'
    name: string
    avatar: string          // two-letter initials 'AK'
    email: string
    role: 'admin' | 'member' | 'viewer'
    presence: 'online' | 'away' | 'offline'
  }
  ```

- [x] Add `StoneforgeOrg` interface:
  ```ts
  interface StoneforgeOrg {
    id: string
    name: string
    plan: 'free' | 'team' | 'enterprise'
    members: StoneforgeUser[]
    teams: StoneforgeTeam[]
  }
  ```

- [x] Add `StoneforgeTeam` interface:
  ```ts
  interface StoneforgeTeam {
    id: string
    name: string
    memberIds: string[]
    workspaceIds: string[]
  }
  ```

- [x] Add `PresenceEntry` interface:
  ```ts
  interface PresenceEntry {
    userId: string
    workspaceId: string
    activeView?: string    // 'kanban', 'merge-requests', etc.
    lastSeen: number
  }
  ```

- [x] Add `AppMode` type: `type AppMode = 'solo' | 'team'`

- [x] Add `SyncStatus` type: `type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'`

- [x] Add `IncomingChange` interface — for real-time change toasts:
  ```ts
  interface IncomingChange {
    id: string
    userId: string
    action: string          // "moved SF-139 to In Review"
    timestamp: string
    entityType: 'task' | 'mr' | 'ci' | 'automation'
    entityId: string
  }
  ```

- [x] Add `ConflictItem` interface — for conflict resolution UI:
  ```ts
  interface ConflictItem {
    id: string
    entityType: 'task' | 'mr'
    entityId: string
    property: string
    localValue: string
    remoteValue: string
    remoteUserId: string
    timestamp: string
  }
  ```

### 1.2 New mock data constants

- [x] Add `currentUser` constant:
  ```ts
  export const currentUser: StoneforgeUser = {
    id: 'user-adam', name: 'Adam King', avatar: 'AK',
    email: 'adam@toolco.dev', role: 'admin', presence: 'online',
  }
  ```

- [x] Add `TEAM_MEMBERS` array:
  ```ts
  export const TEAM_MEMBERS: StoneforgeUser[] = [
    { id: 'user-adam', name: 'Adam King', avatar: 'AK', email: 'adam@toolco.dev', role: 'admin', presence: 'online' },
    { id: 'user-sarah', name: 'Sarah Chen', avatar: 'SC', email: 'sarah@toolco.dev', role: 'member', presence: 'online' },
    { id: 'user-james', name: 'James Wright', avatar: 'JW', email: 'james@toolco.dev', role: 'member', presence: 'away' },
    { id: 'user-maria', name: 'Maria Lopez', avatar: 'ML', email: 'maria@toolco.dev', role: 'member', presence: 'offline' },
  ]
  ```

- [x] Add `mockOrg` constant:
  ```ts
  export const mockOrg: StoneforgeOrg = {
    id: 'org-toolco', name: 'Toolco', plan: 'team',
    members: TEAM_MEMBERS,
    teams: [
      { id: 'team-platform', name: 'Platform', memberIds: ['user-adam', 'user-james'], workspaceIds: ['ws-1', 'ws-4', 'ws-8'] },
      { id: 'team-frontend', name: 'Frontend', memberIds: ['user-sarah', 'user-maria'], workspaceIds: ['ws-2', 'ws-5'] },
    ],
  }
  ```

- [x] Add `mockPresence` array:
  ```ts
  export const mockPresence: PresenceEntry[] = [
    { userId: 'user-adam', workspaceId: 'ws-1', activeView: 'kanban', lastSeen: Date.now() },
    { userId: 'user-sarah', workspaceId: 'ws-1', activeView: 'merge-requests', lastSeen: Date.now() - 60000 },
    { userId: 'user-james', workspaceId: 'ws-4', activeView: 'kanban', lastSeen: Date.now() - 300000 },
  ]
  ```

- [x] Add `mockIncomingChanges` and `mockConflicts` arrays — small datasets for visual demo

### 1.3 Modifications to existing interfaces

- [x] `Task` interface — add fields: `creatorId?: string`, `assigneeUserId?: string`, `watchers?: string[]`, `launchedBy?: string`, `claimedBy?: { agentName: string; launchedByUserId?: string }`

- [x] `DirectorSession` interface — add fields: `ownerId: string`, `connectionType: 'local' | 'remote' | 'ssh'`, `viewers?: string[]`, `locked?: boolean`

- [x] `WorkspaceInfo` interface — add fields: `teamId?: string`, `accessUserIds?: string[]`

- [x] `NotificationItem` interface — extend `type` union with: `'mention'`, `'assignment'`, `'review-request'`, `'deployment-approval'`. Add fields: `actorId?: string`, `mentionedUserId?: string`

- [x] `WorkspaceThread` interface — add: `launchedByUserId?: string`

### 1.4 Update ASSIGNEES (line 1334)

- [x] Replace hardcoded `{ name: 'You', avatar: 'Y' }` with `{ name: currentUser.name, avatar: currentUser.avatar }`
- [x] Add `getAssignees(mode: AppMode)` helper that returns ASSIGNEES in solo mode, ASSIGNEES + other team members in team mode

### 1.5 Replace all hardcoded "You" in mock data (~30 occurrences)

- [x] MR reviewers (lines 308, 327, 344, 360): `{ name: currentUser.name, avatar: currentUser.avatar, ... }`
- [x] MR timeline events (lines 400, 402, 416, 433, 434, 446, 447): `author: currentUser.name, avatar: currentUser.avatar`
- [x] CI runs (lines 944, 1015): `actor: currentUser.name, actorAvatar: currentUser.avatar`
- [x] Workflows (lines 1063, 1077, 1091, 1104, 1120, 1134): `createdBy: currentUser.name`
- [x] Diff comments (lines 1316, 1318): `author: currentUser.name, avatar: currentUser.avatar`
- [x] Workflow run results (lines 1178, 1181, 1189, 1192): replace "You" in output strings
- [x] `App.tsx` line 811: `author: currentUser.name`
- [x] `PlanDetailView.tsx` line 35: `agent: currentUser.name`

### 1.6 Type additions in sub-module type files

- [x] `agents/agent-types.ts` — add to `AgentExtended`: `ownerUserId?: string`. Add to `AgentSession`: `launchedByUserId?: string`
- [x] `automations/wf-types.ts` — add to `Workflow`: `createdByUserId?: string`, `scope?: 'personal' | 'team'`, `approvalRequired?: boolean`, `approvalUsers?: string[]`. Add to `WFRun`: `triggeredByUserId?: string`
- [x] `ci/ci-types.ts` — add to `CIRun`: `actorUserId?: string`, `approvalGates?: { requiredApprovals: number; approvedBy: string[]; pending: boolean }`
- [x] `mr/mr-types.ts` — add to `MergeRequestExtended`: `authorUserId?: string`, `requestedReviewerIds?: string[]`. Add to `MRTimelineEvent`: `authorUserId?: string`

### 1.7 Update mock data instances

- [x] `mockDirectors`: add `ownerId: currentUser.id`, `connectionType: 'local'` to all three
- [x] `mockSessions`: add `ownerId`, `viewers` fields
- [x] `mockAgentsExtended` (in `agent-mock-data.ts`): add `ownerUserId: currentUser.id`
- [x] `mockWorkflows` / `mockWorkflowRuns`: add userId fields, set `scope: 'team'` on some and `scope: 'personal'` on others
- [x] `mockCIRuns`: add `actorUserId` fields, add `approvalGates` to one deploy run

---

## Workstream 2: App-Level Plumbing

### 2.1 New file: `src/TeamContext.tsx`

- [x] Create TeamContext with `TeamContextValue` interface:
  ```ts
  interface TeamContextValue {
    appMode: AppMode
    currentUser: StoneforgeUser
    org: StoneforgeOrg | null          // null in solo mode
    teamMembers: StoneforgeUser[]      // empty in solo mode
    presence: PresenceEntry[]          // empty in solo mode
    syncStatus: SyncStatus
    isTeamMode: boolean                // convenience: appMode === 'team'
    getUserById: (id: string) => StoneforgeUser | undefined
    getWorkspacePresence: (workspaceId: string) => StoneforgeUser[]
  }
  ```
- [x] Create `TeamContextProvider` component and `useTeamContext` hook

### 2.2 App.tsx state additions

- [x] Add `appMode` state with localStorage persistence (`sf-app-mode` key, default `'solo'`)
- [x] Add `syncStatus` state (default `'synced'`)
- [x] Add `incomingChanges` state (from `mockIncomingChanges`)
- [x] Add `conflicts` state (from `mockConflicts`)

### 2.3 Demo timers for team-mode visual effects

- [x] When `appMode === 'team'`, start useEffect timers:
  - 7s: set `syncStatus` to `'syncing'` → 2s later: back to `'synced'`
  - 12s: push an incoming change toast ("Sarah moved SF-139 to In Review")
  - 20s: push a conflict item to demonstrate conflict resolution UI
  - Timers clear on mode switch or unmount

### 2.4 Wrap layout in TeamContextProvider

- [x] Wrap entire App layout in `<TeamContextProvider>` with computed value based on `appMode`

### 2.5 "You" replacement in components

- [x] `MRTimelineEvent.tsx` line 47: `const isYou = author === 'You'` → `author === currentUser.name || authorUserId === currentUser.id`
- [x] `MRReviewSidebar.tsx` lines 40-41: `r.name === 'You'` → `r.name === currentUser.name`
- [x] `App.tsx` line 811: `author: 'You'` → `author: currentUser.name`
- [x] All components consume `currentUser` from TeamContext

---

## Workstream 3: Activity Rail Changes

**File:** `src/components/ActivityRail.tsx`

- [x] **3.1 Mode toggle** — Add between theme toggle and Settings icon: pill-shaped toggle (~40px wide, 18px tall), left=User icon (solo), right=Users icon (team), active side gets `var(--color-primary-muted)`, tooltip: "Switch to Solo/Team mode", calls `onToggleMode` prop

- [x] **3.2 User avatar at bottom** — Below Settings icon: 28x28 circle with `currentUser.avatar` initials. Solo: click opens simple dropdown (Settings, Keyboard Shortcuts). Team: adds presence dot (6px, bottom-right, green/amber/gray), click opens full user menu (name+email, status selector Online/Away/Offline, divider, "Org Settings" if admin, "Sign Out")

- [x] **3.3 Notification count badge on workspace pips** — In team mode, workspace pips with unread team notifications show small red dot (4px) at top-right

- [x] **3.4 Props interface update** — Add: `appMode`, `currentUser`, `onToggleMode`

---

## Workstream 4: TopBar Changes

**File:** `src/components/TopBar.tsx`

- [x] **4.1 Sync status indicator (team-mode only)** — Right side, before Autopilot buttons. `synced`: green dot + "Synced" 11px. `syncing`: spinner + "Syncing...". `offline`: gray dot + "Offline". `error`: red dot + "Sync error". Render: `{isTeamMode && <SyncIndicator />}`

- [x] **4.2 "Who's here" presence strip (team-mode only)** — Between workspace label and branch display: overlapping 22px avatar circles (-6px margin), each with presence dot, max 4 then "+N", tooltip "Sarah Chen — viewing Merge Requests", current user excluded. Render: `{isTeamMode && workspacePresence.length > 0 && <PresenceStrip />}`

- [x] **4.3 Enhanced NotificationInbox** — Add icons for new types: mention=AtSign, assignment=UserPlus, review-request=GitPullRequest, deployment-approval=Shield. Team mode: filter tabs "All" | "Mentions" | "Assigned" | "Reviews". Show actor avatar in team notifications. Solo: existing types only, no filter tabs.

- [x] **4.4 Props interface update** — Add: `appMode`, `syncStatus`, `workspacePresence` (resolved `StoneforgeUser[]`)

- [x] **4.5 Create `src/components/PresenceStrip.tsx`** — Overlapping avatar stack with presence dots
- [x] **4.6 Create `src/components/SyncIndicator.tsx`** — Dot + text + optional spinner

---

## Workstream 5: Kanban/Task Changes

**File:** `src/components/KanbanBoard.tsx`

- [x] **5.1 "Assigned to me" filter (team-mode only)** — Persistent toggle in filter bar: "My Tasks" (default on) / "All Tasks". Filters by `assigneeUserId === currentUser.id` or `assignee?.name === currentUser.name`. Hidden in solo mode. State: `showMine` boolean, default `true` team / `false` solo.

- [x] **5.2 Concurrency claim indicators on cards (both modes)** — When `task.claimedBy` set: amber `AlertTriangle` (12px) at top-right. Solo tooltip: "Director Alpha is already working on this task". Team tooltip: "Director Alpha (launched by Sarah) is working on this task"

- [x] **5.3 Presence dots on assignee avatars (team-mode only)** — On 22px assignee avatar circles: if human team member, show 4px presence dot (bottom-right), color from `StoneforgeUser.presence`

- [x] **5.4 Team members in assignee filter dropdown** — Team mode: show both agents AND team members with presence dots

- [x] **5.5 Team members in assignee change dropdown** — `AssigneeDropdown` (PropertyDropdowns.tsx) uses `getAssignees(appMode)` helper to include team members with presence indicators

---

## Workstream 6: Task Detail Changes

**File:** `src/components/overlays/TaskDetailOverlay.tsx`

- [x] **6.1 Watchers section (team-mode only)** — New property row: "Watchers" with Eye icon, avatar stack of subscribed users, "+" to add team members, quick "Watch" toggle for current user. Hidden in solo mode.

- [x] **6.2 Creator property row (property sidebar)** — Simple "Creator" property row (like Due Date) showing avatar+name from `creatorId`, only when a human created the task. Agent-created tasks rely on the Director Session link in the Stoneforge section. No separate "Ownership" section — Assignee remains the existing property pill, and the execution chain (Director/Worker/Reviewer sessions) is already in the Stoneforge section.

- [x] **6.3 Soft claim warning banner (both modes)** — When `task.claimedBy`: inline banner below header, amber subtle bg + left border. Solo: "Director Alpha is already working on this task. Assign another agent anyway?" Team: "Director Alpha (launched by Sarah Chen) is working on this task. Assign your agent anyway?" Buttons: "Assign Anyway" | "Dismiss"

- [x] **6.4 Activity attribution** — All entries show full user avatar+name resolved from userId. Team mode: agent actions show "launched by [human name]". Replace remaining "You" with `currentUser.name`.

- [x] **6.5 @mentions in comments (team-mode only)** — In comment input: `@` triggers autocomplete of team members, selected renders as blue pill, submitting creates notification for mentioned user.

---

## Workstream 7: Director Panel Changes

**File:** `src/components/DirectorPanel.tsx`

- [x] **7.1 Session list split (team-mode)** — Solo: header "Sessions" flat list. Team: two tabs "My Sessions" (ownerId === currentUser.id) / "Team Sessions" (ownerId !== currentUser.id), each with count badge.

- [x] **7.2 Session header enhancement** — Owner avatar (22px) + "Started by [name]". Connection type badge pill: "Local" (green) / "Remote" (blue) / "SSH" (amber). Team mode: "N watching" badge with avatar stack.

- [x] **7.3 Session lock control (team-mode, owner only)** — Lock/unlock toggle in header (Lock icon). Locked: shows lock icon + "Read-only for team" tooltip. Non-owners see disabled input with "This session is locked by [owner name]".

- [x] **7.4 Viewer indicator (team-mode)** — Avatar stack in header (up to 3, "+N"). Tooltip: "Sarah, James are watching"

- [x] **7.5 Read-only state for non-owner sessions (team-mode)** — Disabled input: "Observing [owner]'s session". If locked: "This session is locked — read only". If unlocked: "Request control" button (visual only).

---

## Workstream 8: MR System Changes

**Files:** `mr/mr-types.ts`, `mr/MRReviewSidebar.tsx`, `mr/MRConversationTab.tsx`, `mr/MRTimelineEvent.tsx`

- [x] **8.1 Replace "You" logic** — `MRReviewSidebar.tsx` lines 40-41: `r.name === 'You'` → `r.name === currentUser.name`. `MRTimelineEvent.tsx` line 47: `author === 'You'` → `author === currentUser.name || authorUserId === currentUser.id`. All avatar rendering uses `currentUser.avatar`.

- [x] **8.2 "Request review" flow (team-mode only)** — In MRReviewSidebar, below reviewers list: "Request review" button (UserPlus icon), opens team member dropdown with presence dots, selecting adds member with `'pending'` state, creates `'review-request'` notification.

- [x] **8.3 Timeline attribution** — All events show proper user avatars resolved from userId. Agent actions show "launched by [human]" in team mode.

---

## Workstream 9: CI/CD Changes

**Files:** `ci/ci-types.ts`, `ci/CIRunDetailView.tsx`

- [x] **9.1 Actor attribution** — Resolve `actorUserId` to full user object for avatar+name. Fall back to string `actor` field.

- [x] **9.2 Deployment approval gates (team-mode only)** — When `run.approvalGates`: section below run header "Deployment Approval", "Requires N approvals" + progress, list of who approved (avatar+name+timestamp), "Approve" button if currentUser hasn't approved. Only when `isTeamMode && run.approvalGates`.

---

## Workstream 10: Agents Overlay Changes

**Files:** `agents/agent-types.ts`, `agents/agent-mock-data.ts`, `AgentsOverlay.tsx`

- [x] **10.1 Owner/launcher attribution** — Agent detail header: "Launched by [avatar+name]" + connection type badge (Local/Remote/SSH)

- [x] **10.2 Session ownership** — Each session row shows owner avatar+name. Team mode: "Started by Sarah Chen"

- [x] **10.3 Agent pool team awareness (team-mode)** — Active session counts per team member: "2 active by Sarah, 1 by James"

---

## Workstream 11: Automations Overlay Changes

**Files:** `automations/wf-types.ts`, `AutomationsOverlay.tsx`

- [x] **11.1 Personal vs team automations (team-mode)** — Scope filter tabs: "Personal" (lock icon) | "Team" (people icon) | "All". Filters on `workflow.scope`. Solo: filter hidden.

- [x] **11.2 Approval workflows (team-mode)** — When `workflow.approvalRequired`: "Requires approval" badge, list of approvers, manual trigger shows confirmation.

- [x] **11.3 Audit attribution** — Run history shows triggering user avatar+name: "Triggered by Sarah Chen" or "Triggered by schedule"

---

## Workstream 11B: Runtimes Overlay Changes

**Files:** `runtimes/runtime-types.ts`, `runtimes/runtime-mock-data.ts`, `RuntimesOverlay.tsx`, `RuntimeListView.tsx`, `RuntimeDetailView.tsx`, `RuntimeCreateView.tsx`, `agents/AgentSettingsTab.tsx`, `onboarding/WorkerEnvironmentStep.tsx`

### 11B.1 Runtime type additions (runtime-types.ts)

- [x] Add to `Runtime` interface: `createdByUserId?: string` (who created this runtime), `scope?: 'personal' | 'shared'` (personal = creator's machine, shared = team infrastructure)

### 11B.2 Runtime mock data updates (runtime-mock-data.ts)

- [x] Add `createdByUserId: currentUser.id` to all mock runtimes
- [x] Set `scope: 'personal'` on `my-macbook` (local worktree on creator's machine)
- [x] Set `scope: 'shared'` on `docker-sandbox`, `staging-server`, `gpu-cluster` (team infrastructure)

### 11B.3 Runtime list view — team attribution and scope filter (RuntimeListView.tsx)

- [x] ~~**Scope filter (team-mode only)**~~ — Cut: personal/shared distinction not needed; all team runtimes are shared. Edit menu wired to open edit view.
- [x] ~~**Creator attribution (team-mode only)**~~ — Cut: belongs in audit logs, not the UI.
- [x] ~~**Edit/delete permissions (team-mode only)**~~ — Cut: permissions should be governed by RBAC, not creator-based UI restrictions.
- [x] **Daemon host change confirmation:** Warning dialog before moving the daemon to another runtime, explaining that it will interrupt running workflows.
- [x] **Edit from `...` menu:** Edit menu item now opens the runtime edit form.

### 11B.4 Runtime detail view — team features (RuntimeDetailView.tsx)

- [x] ~~**Created by display**~~ — Cut: not relevant enough for the detail UI.
- [x] ~~**Scope badge (team-mode only)**~~ — Cut: personal/shared distinction removed.
- [x] ~~**Edit restrictions (team-mode only)**~~ — Cut: governed by RBAC, not creator-based.
- [x] **Sidebar persists in edit mode:** Runtime sidebar stays visible when switching to edit, scroll is on the content area (not a nested container).
- [x] **Metadata layout fix:** Configuration section uses vertical flex layout to prevent data overlap on narrow viewports.

### 11B.5 Runtime create view — team features (RuntimeCreateView.tsx)

- [x] ~~**Scope selector (team-mode only)**~~ — Cut: personal/shared distinction removed.
- [x] ~~**Attribution on save**~~ — Cut: creator attribution not shown in UI.

### 11B.6 Agent settings runtime dropdown — team context (AgentSettingsTab.tsx)

- [x] ~~**Team-mode grouping**~~ — Cut: no personal/shared distinction means no grouping needed.
- [x] ~~**Presence awareness**~~ — Cut: scope badges removed.

### 11B.7 Onboarding — attribution (WorkerEnvironmentStep.tsx)

- [x] ~~**Team context**~~ — Cut: creator attribution not shown in UI, scope inference removed.

### 11B.8 Dispatch daemon model

The Stoneforge dispatch daemon orchestrates autonomous workflows — assigning tasks to directors, spawning workers, monitoring health. **One daemon runs per workspace.** The daemon needs a machine to stay alive on, but does not need a worktree, sandbox, or Docker container — it's an orchestration process, not a code execution environment.

**Key concepts:**
- A **runtime** is a configured execution environment where agents run code (worktree path, Docker image, SSH + sandbox). Runtimes were designed for agent execution.
- The **dispatch daemon** is a long-lived orchestration process. It needs a machine (local or remote), but ignores the runtime's execution config (worktree, Docker, sandbox). It reuses the Runtime's host connection (local machine or SSH) without the agent-specific configuration.
- **One daemon per workspace.** There is no scenario where multiple daemons run for the same workspace simultaneously. Failover (primary/standby) is a future concern, not concurrent daemons.
- **Both modes need this.** Solo users may want to run the daemon on a remote machine so they can close their laptop. Team users need the daemon on shared infrastructure. The daemon host setting is always visible.
- Each agent (director, worker, steward) can be dispatched to a *different* runtime than the daemon host — e.g. daemon on a staging server, workers on GPU clusters, stewards on lightweight containers.
- **Joining a team workspace:** Solo users joining a team workspace don't bring a daemon — the team workspace already has one. No conflict.
- **Offline local-only workflows:** v2 concern. For now, if disconnected from the team daemon, autonomous workflows pause.

**Data model additions:**

Files: `runtime-types.ts`, `mock-data.ts`

- [x] Add workspace-level daemon state (in `mock-data.ts` or a new `WorkspaceDaemonState` interface):
  ```ts
  interface WorkspaceDaemonState {
    hostRuntimeId: string        // which Runtime's host machine the daemon runs on
    status: 'running' | 'stopped' | 'error'
    startedAt?: string
    uptimeSeconds?: number
  }
  ```
- [x] Add `mockDaemonState` constant: `{ hostRuntimeId: 'my-macbook', status: 'running', startedAt: '30 min ago', uptimeSeconds: 1800 }`
- [x] The daemon host is a workspace-level setting, not a per-Runtime property — any Runtime's underlying machine can host the daemon

**TopBar — daemon host indicator (both modes):**

File: `TopBar.tsx`

- [x] **Daemon indicator in header** — Between sync indicator (or branch display in solo mode) and Autopilot buttons: small pill showing daemon host name + status dot. Examples: `● my-macbook` (green dot, local), `● staging-server` (green dot, remote), `○ staging-server` (gray dot, stopped/error). Clicking navigates to the Runtimes page. Tooltip: "Dispatch daemon running on [name] — click to manage"
- [x] **Daemon offline warning** — When `daemonState.status === 'error' || 'stopped'`: indicator turns red/gray with warning tooltip "Daemon offline — autonomous workflows paused". Consider whether this should also surface as a banner (like the conflict banner).

**Runtimes page — daemon host section:**

Files: `RuntimeListView.tsx`, `RuntimeDetailView.tsx`

- [x] **Daemon host section at top of RuntimeListView** — Above the runtime list, a dedicated section: "Dispatch Daemon" header, current host runtime name + status badge, "Change host" button (opens dropdown of available runtimes). Note text: "The daemon orchestrates agent lifecycles. It runs on the host machine but does not use the runtime's worktree or sandbox config." This is the primary place to change the daemon host.
- [x] **Daemon badge on host runtime** — In the runtime list, the runtime designated as daemon host gets a small "Daemon" badge (Cpu icon, green) to distinguish it from pure agent execution runtimes.
- [x] **Daemon status in RuntimeDetailView** — When viewing the daemon host runtime's detail, show a "Dispatch Daemon" info section: status, uptime, "Move daemon to another runtime" link. Clarify that the daemon uses only the host connection, not the execution config.

**Runtime create view — no daemon-specific options:**

- [x] No changes needed. The daemon host is a workspace-level setting changed from the Runtimes list page or TopBar, not a per-runtime creation option. Any runtime's underlying host can be designated as the daemon host after creation.

---

## Workstream 12: Settings Overlay (New Sections)

**File:** `src/components/overlays/SettingsOverlay.tsx`

- [x] **12.1 Team-mode sections** — When `isTeamMode`, add to sections array: `'organization'` (Building2 icon), `'members'` (Users icon), `'roles'` (Shield icon)

- [x] **12.2 Organization section** — Org name+icon, plan badge (Free/Team/Enterprise), org ID (monospace, copyable), teams list with member counts (expandable), workspace list with team access

- [x] **12.3 Members section** — Searchable member table: Avatar | Name | Email | Role | Presence | Actions. Role dropdown per member (admin/member/viewer). Remove button. "Invite member" button at top.

- [x] **12.4 Roles & Access section** — Workspace access matrix: rows=workspaces, columns=teams/members, cells=access checkboxes. Visual indicator of team ownership.

- [x] **12.5 Account section enhancement** — Large avatar (48px) + name + email. Mode indicator: "Solo Mode" or "Connected to Toolco (Team)". Team mode: link to org settings.

---

## Workstream 13: Notifications & Real-Time Feedback

### 13.1 NotificationInbox enhancements

**File:** `src/components/NotificationInbox.tsx`

- [x] Add type icons: mention=AtSign, assignment=UserPlus, review-request=GitPullRequest, deployment-approval=Shield
- [x] Team mode filter tabs: "All" | "Mentions" | "Assigned" | "Reviews"
- [x] Show actor avatar in team notifications
- [x] Solo mode: existing types only, no filter tabs

### 13.2 Incoming change toasts (team-mode only)

**File:** `src/components/ToastNotifications.tsx`

- [x] Add `'team-change'` to ToastItem type union
- [x] Add entry to `typeConfig` — renders team member avatar + action description, blue accent color
- [x] Auto-dismiss after 5s, only created when `isTeamMode`

### 13.3 Conflict resolution banner (team-mode only)

- [x] Create `src/components/ConflictBanner.tsx` — inline banner in App.tsx below TopBar. Amber left border + subtle bg. "Conflict: Sarah also changed the priority of SF-142 to Urgent. Keep your value (High) or use theirs?" Buttons: "Keep Mine" | "Use Theirs". Only when `conflicts.length > 0 && isTeamMode`.

### 13.4 @mentions autocomplete (team-mode only)

- [x] Create `src/components/MentionAutocomplete.tsx` — triggered on `@`, dropdown of team members (avatar+name+presence dot), filtered as user types, inserts `@Name` styled pill. Used in: TaskDetailOverlay comment input, MRConversationTab comment input, DirectorPanel chat input.

---

## Workstream 14: Shared Components & Design Tokens

### 14.1 New shared components

- [x] Create `src/components/PresenceDot.tsx` — Props: `status: 'online'|'away'|'offline'`, `size?: number` (default 6). Colored dot, absolutely positioned.

- [x] Create `src/components/ConnectionBadge.tsx` — Props: `type: 'local'|'remote'|'ssh'`. Pill with icon+text: "Local" (green), "Remote" (blue), "SSH" (amber).

- [x] Create `src/components/AvatarStack.tsx` — Props: `users: StoneforgeUser[]`, `max?: number` (default 4), `size?: number` (default 22), `showPresence?: boolean`. Overlapping -6px, "+N" overflow badge.

- [x] Create `src/components/UserAvatar.tsx` — Props: `user: StoneforgeUser`, `size?: number`, `showPresence?: boolean`. Initials circle + optional PresenceDot. Accent styling when `user.id === currentUser.id`.

### 14.2 Design token additions

**File:** `src/index.css`

- [x] Add presence tokens to both `.dark` and `:root:not(.dark)`:
  ```css
  --color-presence-online: #22c55e;
  --color-presence-away: #f59e0b;
  --color-presence-offline: #6b6b70;
  --color-presence-online-subtle: rgba(34, 197, 94, 0.15);
  --color-presence-away-subtle: rgba(245, 158, 11, 0.15);
  --color-presence-offline-subtle: rgba(107, 107, 112, 0.15);
  ```

- [x] Add sync/conflict/mention/connection tokens:
  ```css
  --color-sync-active: var(--color-success);
  --color-sync-syncing: var(--color-primary);
  --color-sync-offline: var(--color-text-tertiary);
  --color-sync-error: var(--color-danger);
  --color-conflict-bg: rgba(245, 158, 11, 0.06);
  --color-conflict-border: rgba(245, 158, 11, 0.3);
  --color-mention-bg: var(--color-primary-subtle);
  --color-mention-text: var(--color-text-accent);
  --color-connection-local: var(--color-success);
  --color-connection-remote: var(--color-primary);
  --color-connection-ssh: var(--color-warning);
  ```

---

## Progressive Disclosure Matrix

| Feature | Solo Mode | Team Mode |
|---------|-----------|-----------|
| Mode toggle in Activity Rail | Visible (current=solo) | Visible (current=team) |
| User avatar in Activity Rail | Simple, no presence dot, minimal menu | With presence dot, full user menu with status selector |
| Notification types | Agent/CI events only | + mentions, assignments, review requests, deployment approvals |
| Notification filter tabs | Hidden | All / Mentions / Assigned / Reviews |
| TopBar presence strip | Hidden | Shows team members in workspace |
| TopBar sync indicator | Hidden | Synced/Syncing/Offline/Error |
| Kanban "My Tasks" toggle | Hidden (all tasks shown) | Visible, defaults to My Tasks |
| Card concurrency warning | "Director Alpha is working..." | "Director Alpha (launched by Sarah)..." |
| Card assignee presence dots | Hidden | Green/amber/gray dot on human avatars |
| Task watchers | Hidden | Eye icon + watcher list in sidebar |
| Task creator property | Creator row (human-filed only) | + full user avatar with presence |
| Director session list | "Sessions" (flat) | "My Sessions" / "Team Sessions" tabs |
| Session owner display | Hidden | Avatar + "Started by [name]" |
| Session connection badge | Hidden | Local/Remote/SSH pill |
| Session viewer count | Hidden | "N watching" avatar stack |
| Session lock control | Hidden | Lock/unlock toggle for owner |
| Session read-only state | N/A | Disabled input for non-owner sessions |
| MR "Request review" | Hidden | Team member dropdown |
| CI approval gates | Hidden | Approval UI with progress |
| Automations scope filter | Hidden | Personal/Team/All tabs |
| Automation approvals | Hidden | Approval workflow UI |
| Runtime scope filter | Hidden | My Runtimes / Shared / All filter |
| Runtime creator attribution | Hidden | "Created by [user]" on list rows + detail |
| Runtime scope badge | Hidden | Personal/Shared badge on detail + dropdown |
| Runtime edit restrictions | Anyone can edit | Only creator or admin can edit/delete |
| Agent runtime dropdown grouping | Flat list | "Your Runtimes" / "Team Runtimes" sections |
| Settings org sections | Hidden | Organization, Members, Roles & Access |
| Incoming change toasts | Hidden | "Sarah moved TASK-4..." |
| Conflict resolution banner | Hidden | Inline conflict banner |
| @mentions autocomplete | Hidden | Triggered by @ in comments/chat |

---

## Implementation Sequence

**Phase 1 — Foundation (do first, everything depends on this):**
- Workstream 1 (data model)
- Workstream 2 (App plumbing + TeamContext)
- Workstream 14 (design tokens + shared components)

**Phase 2 — App Shell:**
- Workstream 3 (Activity Rail)
- Workstream 4 (TopBar)
- Workstream 13.3 (Conflict banner — rendered in App.tsx)

**Phase 3 — Core Views:**
- Workstream 5 (Kanban)
- Workstream 6 (Task Detail)
- Workstream 7 (Director Panel)

**Phase 4 — Supporting Views:**
- Workstream 8 (MRs)
- Workstream 9 (CI/CD)
- Workstream 10 (Agents)
- Workstream 11 (Automations)
- Workstream 11B (Runtimes)

**Phase 5 — New Systems:**
- Workstream 12 (Settings sections)
- Workstream 13 (Notifications, toasts, @mentions)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/TeamContext.tsx` | React context: appMode, currentUser, org, presence, helpers |
| `src/components/PresenceStrip.tsx` | "Who's here" avatar stack for TopBar |
| `src/components/SyncIndicator.tsx` | Sync status dot+text for TopBar |
| `src/components/ConflictBanner.tsx` | Conflict resolution inline banner |
| `src/components/PresenceDot.tsx` | Reusable presence dot component |
| `src/components/ConnectionBadge.tsx` | Local/Remote/SSH badge |
| `src/components/AvatarStack.tsx` | Overlapping avatar stack |
| `src/components/UserAvatar.tsx` | Avatar with optional presence dot |
| `src/components/MentionAutocomplete.tsx` | @mention dropdown for text inputs |

## Files to Modify

| File | Changes |
|------|---------|
| `src/mock-data.ts` | New interfaces, new constants, modify existing interfaces + data, replace "You" |
| `src/App.tsx` | Mode state, TeamContextProvider, demo timers, conflict banner, prop threading |
| `src/index.css` | Presence/sync/conflict/mention/connection design tokens |
| `src/components/ActivityRail.tsx` | Mode toggle, user avatar, notification badge |
| `src/components/TopBar.tsx` | Presence strip, sync indicator, enhanced props |
| `src/components/NotificationInbox.tsx` | New notification types, filter tabs, actor avatars |
| `src/components/ToastNotifications.tsx` | 'team-change' toast type |
| `src/components/KanbanBoard.tsx` | "My Tasks" filter, concurrency indicators, presence dots |
| `src/components/CreateTaskDialog.tsx` | Team member assignees via getAssignees() |
| `src/components/dropdowns/PropertyDropdowns.tsx` | Team members in assignee dropdown, presence dots |
| `src/components/DirectorPanel.tsx` | Session split, owner display, lock, viewers, connection badge |
| `src/components/overlays/TaskDetailOverlay.tsx` | Watchers, creator property row, claim banner, activity attribution, @mentions |
| `src/components/overlays/mr/mr-types.ts` | authorUserId, requestedReviewerIds |
| `src/components/overlays/mr/MRReviewSidebar.tsx` | Replace "You" check, request review flow |
| `src/components/overlays/mr/MRTimelineEvent.tsx` | Replace "You" check with currentUser |
| `src/components/overlays/mr/MRConversationTab.tsx` | @mentions in comment input |
| `src/components/overlays/ci/ci-types.ts` | actorUserId, approvalGates |
| `src/components/overlays/ci/CIRunDetailView.tsx` | Approval gate UI |
| `src/components/overlays/agents/agent-types.ts` | ownerUserId, launchedByUserId |
| `src/components/overlays/agents/agent-mock-data.ts` | Add userId fields |
| `src/components/overlays/AgentsOverlay.tsx` | Owner display, connection badges |
| `src/components/overlays/automations/wf-types.ts` | scope, approval fields |
| `src/components/overlays/AutomationsOverlay.tsx` | Scope filter, approval UI, audit attribution |
| `src/components/overlays/runtimes/runtime-types.ts` | createdByUserId, scope fields |
| `src/components/overlays/runtimes/runtime-mock-data.ts` | Add userId and scope to mock runtimes |
| `src/components/overlays/runtimes/RuntimeListView.tsx` | Scope filter, creator attribution, edit permissions |
| `src/components/overlays/runtimes/RuntimeDetailView.tsx` | Creator display, scope badge, edit restrictions |
| `src/components/overlays/runtimes/RuntimeCreateView.tsx` | Scope selector, attribution on save |
| `src/components/overlays/agents/AgentSettingsTab.tsx` | Runtime dropdown grouping (Your/Team), scope badges |
| `src/components/onboarding/WorkerEnvironmentStep.tsx` | Runtime attribution to currentUser |
| `src/components/overlays/SettingsOverlay.tsx` | Org/Members/Roles sections |
| `src/components/overlays/plans/PlanDetailView.tsx` | Replace "You" |

---

## Verification

1. **Start dev server** via `preview_start` (name: `smithy-next`, port 5180)
2. **Solo mode checks:**
   - Mode toggle shows solo active
   - No presence strip in TopBar, no sync indicator
   - No watchers in task detail, no "My Tasks" filter
   - Director panel shows flat "Sessions" list
   - Settings has 4 sections (no org/members/roles)
   - Notifications show agent/CI types only
   - All former "You" references now show "Adam King"
   - Concurrency warnings show agent-only attribution
3. **Team mode checks (toggle to team):**
   - Presence strip appears in TopBar with online team members
   - Sync indicator shows "Synced" → briefly "Syncing..." → back to "Synced"
   - Kanban shows "My Tasks" toggle, defaults to filtered
   - Task detail shows watchers section, creator row (on human-filed tasks only)
   - Director panel splits into "My Sessions" / "Team Sessions"
   - Session headers show owner, connection badge, viewer count
   - MR sidebar shows "Request review" button
   - Settings gains Org/Members/Roles sections
   - Notifications gain team types and filter tabs
   - Incoming change toast appears after ~12s
   - Conflict banner appears after ~20s
   - @mention autocomplete works in comment inputs
   - CI detail shows approval gate on deploy run
   - Automations show Personal/Team scope filter
   - Runtimes show scope filter (My Runtimes/Shared/All)
   - Runtime list rows show "by [creator]" attribution
   - Runtime detail shows "Created by" and scope badge
   - Agent settings runtime dropdown groups by Your/Team runtimes
   - Non-owner/non-admin users see disabled Edit/Delete on others' runtimes
4. **Mode toggle persistence:** Refresh page, mode should persist via localStorage
5. **Dark/light mode:** All new team UI elements respect both themes
