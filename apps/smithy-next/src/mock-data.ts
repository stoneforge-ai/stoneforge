// ── Team-mode types ──

export type AppMode = 'solo' | 'team'
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export interface StoneforgeUser {
  id: string
  name: string
  avatar: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  presence: 'online' | 'away' | 'offline'
}

export interface StoneforgeOrg {
  id: string
  name: string
  plan: 'free' | 'team' | 'enterprise'
  members: StoneforgeUser[]
  teams: StoneforgeTeam[]
}

export interface StoneforgeTeam {
  id: string
  name: string
  memberIds: string[]
  workspaceIds: string[]
}

export interface PresenceEntry {
  userId: string
  workspaceId: string
  activeView?: string
  lastSeen: number
}

export interface IncomingChange {
  id: string
  userId: string
  action: string
  timestamp: string
  entityType: 'task' | 'mr' | 'ci' | 'automation'
  entityId: string
}

export interface ConflictItem {
  id: string
  entityType: 'task' | 'mr'
  entityId: string
  property: string
  localValue: string
  remoteValue: string
  remoteUserId: string
  timestamp: string
}

// ── Dispatch daemon state ──

export interface WorkspaceDaemonState {
  hostId: string               // which Host the daemon runs on
  status: 'running' | 'stopped' | 'error'
  startedAt?: string
  uptimeSeconds?: number
}

export const mockDaemonState: WorkspaceDaemonState = {
  hostId: 'host-macbook',
  status: 'running',
  startedAt: '30 min ago',
  uptimeSeconds: 1800,
}

// ── Current user & team roster ──

export const currentUser: StoneforgeUser = {
  id: 'user-adam', name: 'Adam King', avatar: 'AK',
  email: 'adam@acme.dev', role: 'admin', presence: 'online',
}

export const TEAM_MEMBERS: StoneforgeUser[] = [
  currentUser,
  { id: 'user-sarah', name: 'Sarah Chen', avatar: 'SC', email: 'sarah@acme.dev', role: 'member', presence: 'online' },
  { id: 'user-james', name: 'James Wright', avatar: 'JW', email: 'james@acme.dev', role: 'member', presence: 'away' },
  { id: 'user-maria', name: 'Maria Lopez', avatar: 'ML', email: 'maria@acme.dev', role: 'member', presence: 'offline' },
]

export const mockOrg: StoneforgeOrg = {
  id: 'org-acme', name: 'Acme', plan: 'team',
  members: TEAM_MEMBERS,
  teams: [
    { id: 'team-platform', name: 'Platform', memberIds: ['user-adam', 'user-james'], workspaceIds: ['ws-1', 'ws-4', 'ws-8'] },
    { id: 'team-frontend', name: 'Frontend', memberIds: ['user-sarah', 'user-maria'], workspaceIds: ['ws-2', 'ws-5'] },
  ],
}

export const mockPresence: PresenceEntry[] = [
  { userId: 'user-adam', workspaceId: 'ws-1', activeView: 'kanban', lastSeen: Date.now() },
  { userId: 'user-sarah', workspaceId: 'ws-1', activeView: 'merge-requests', lastSeen: Date.now() - 60000 },
  { userId: 'user-james', workspaceId: 'ws-4', activeView: 'kanban', lastSeen: Date.now() - 300000 },
]

export const mockIncomingChanges: IncomingChange[] = [
  { id: 'ic-1', userId: 'user-sarah', action: 'moved SF-139 to In Review', timestamp: '2 min ago', entityType: 'task', entityId: 'SF-139' },
  { id: 'ic-2', userId: 'user-james', action: 'approved MR-42', timestamp: '5 min ago', entityType: 'mr', entityId: 'MR-42' },
]

export const mockConflicts: ConflictItem[] = [
  { id: 'cf-1', entityType: 'task', entityId: 'SF-142', property: 'priority', localValue: 'high', remoteValue: 'urgent', remoteUserId: 'user-sarah', timestamp: 'just now' },
]

/** Returns the right assignee list depending on app mode */
export function getAssignees(mode: AppMode): { name: string; avatar: string }[] {
  const base = [
    { name: 'Agent Alpha', avatar: 'AA' },
    { name: 'Agent Beta', avatar: 'AB' },
    { name: 'Agent Gamma', avatar: 'AG' },
    { name: currentUser.name, avatar: currentUser.avatar },
  ]
  if (mode === 'team') {
    const others = TEAM_MEMBERS.filter(m => m.id !== currentUser.id)
    return [...base, ...others.map(m => ({ name: m.name, avatar: m.avatar }))]
  }
  return base
}

// ── Core data types ──

export interface AcceptanceCriterion {
  id: string
  text: string
  checked: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
  priority: 'urgent' | 'high' | 'medium' | 'low'
  assignee?: { name: string; avatar: string }
  labels: string[]
  estimate?: 1 | 2 | 3 | 4 | 5
  dueDate?: string
  parentId?: string
  subTaskIds?: string[]
  acceptanceCriteria?: AcceptanceCriterion[]
  sessionStatus?: 'running' | 'idle' | 'error'
  ciStatus?: 'pass' | 'fail' | 'pending' | 'none'
  mrStatus?: 'open' | 'merged' | 'needs_review' | 'none'
  branch?: string
  agentName?: string
  agentSessionId?: string
  reviewAgentName?: string
  reviewAgentSessionId?: string
  blocked?: boolean
  activeDuration?: string
  updatedAt: string
  planId?: string
  planName?: string
  whiteboardId?: string
  dependencyIds?: string[]
  // Compute requirements (match agent tags)
  requiredAgentTags?: string[]
  // Specialization requirements
  roleDefinitionId?: string
  requiredRoleDefinitionTags?: string[]
  // Team-mode fields
  creatorId?: string
  assigneeUserId?: string
  watchers?: string[]
  launchedBy?: string
  claimedBy?: { agentName: string; launchedByUserId?: string }
}

export interface DirectorSession {
  id: string
  name: string
  agentId: string               // which compute agent is running this session
  roleDefinitionId: string      // which role definition prompt is attached
  status: 'running' | 'idle' | 'error' | 'connecting'
  unreadCount: number
  lastMessage?: string
  // Team-mode fields
  ownerId: string
  connectionType: 'local' | 'remote' | 'ssh'
  runtimeId?: string
  viewers?: string[]
  locked?: boolean
}

// ── Workspace data for multi-workspace awareness ──
export interface WorkspaceInfo {
  id: string
  name: string
  icon: string
  description?: string
  repo?: string
  status: 'active' | 'idle' | 'needs-attention' | 'error'
  agentCount: number
  runningAgents: number
  lastOpened: number
  // Task metrics for pip indicators
  tasksRunning: number
  tasksInReview: number
  tasksBlocked: number
  completedSinceLastVisit: number
  // Team-mode fields
  teamId?: string
  accessUserIds?: string[]
}

export interface WorkspaceThread {
  id: string
  workspaceId: string
  title: string
  preview: string
  createdAt: string
  duration: string
  status: 'completed' | 'running' | 'error'
  agentName: string
  tasksAdded: number
  tasksModified: number
  tasksDeleted: number
  launchedByUserId?: string
}

export interface NotificationItem {
  id: string
  workspaceId: string
  type: 'agent-completed' | 'agent-error' | 'mr-review' | 'ci-failed' | 'ci-passed' | 'agent-needs-input' | 'mention' | 'assignment' | 'review-request' | 'deployment-approval'
  message: string
  timestamp: string
  read: boolean
  actorId?: string
  mentionedUserId?: string
}

export const mockWorkspaces: WorkspaceInfo[] = [
  { id: 'ws-1', name: 'Stoneforge', icon: 'S', repo: 'toolco/stoneforge', status: 'active', agentCount: 3, runningAgents: 2, lastOpened: Date.now(), tasksRunning: 2, tasksInReview: 2, tasksBlocked: 0, completedSinceLastVisit: 0 },
  { id: 'ws-2', name: 'Marketing Site', icon: 'M', repo: 'toolco/website', status: 'needs-attention', agentCount: 2, runningAgents: 0, lastOpened: Date.now() - 300000, tasksRunning: 0, tasksInReview: 1, tasksBlocked: 0, completedSinceLastVisit: 3 },
  { id: 'ws-3', name: 'Mobile App', icon: 'A', repo: 'toolco/mobile', status: 'error', agentCount: 1, runningAgents: 0, lastOpened: Date.now() - 600000, tasksRunning: 0, tasksInReview: 0, tasksBlocked: 1, completedSinceLastVisit: 1 },
  { id: 'ws-4', name: 'API Gateway', icon: 'G', repo: 'toolco/gateway', status: 'active', agentCount: 2, runningAgents: 1, lastOpened: Date.now() - 1200000, tasksRunning: 1, tasksInReview: 1, tasksBlocked: 0, completedSinceLastVisit: 2 },
  { id: 'ws-5', name: 'Design System', icon: 'D', repo: 'toolco/design-system', status: 'idle', agentCount: 1, runningAgents: 0, lastOpened: Date.now() - 3600000, tasksRunning: 0, tasksInReview: 0, tasksBlocked: 0, completedSinceLastVisit: 0 },
  { id: 'ws-6', name: 'Data Pipeline', icon: 'P', repo: 'toolco/pipeline', status: 'active', agentCount: 3, runningAgents: 2, lastOpened: Date.now() - 7200000, tasksRunning: 2, tasksInReview: 0, tasksBlocked: 1, completedSinceLastVisit: 4 },
  { id: 'ws-7', name: 'Admin Dashboard', icon: 'B', repo: 'toolco/admin', status: 'idle', agentCount: 0, runningAgents: 0, lastOpened: Date.now() - 86400000, tasksRunning: 0, tasksInReview: 0, tasksBlocked: 0, completedSinceLastVisit: 0 },
  { id: 'ws-8', name: 'Auth Service', icon: 'H', repo: 'toolco/auth-service', status: 'idle', agentCount: 0, runningAgents: 0, lastOpened: Date.now() - 172800000, tasksRunning: 0, tasksInReview: 0, tasksBlocked: 0, completedSinceLastVisit: 0 },
]

export const mockWorkspaceThreads: WorkspaceThread[] = [
  // Stoneforge threads (current workspace)
  { id: 'wt-1', workspaceId: 'ws-1', title: 'Implement OAuth2 PKCE flow', preview: 'Working on PKCE challenge generation and token exchange...', createdAt: '2 min ago', duration: '14m', status: 'running', agentName: 'Agent Alpha', tasksAdded: 2, tasksModified: 1, tasksDeleted: 0 },
  { id: 'wt-2', workspaceId: 'ws-1', title: 'SQLite WAL migration setup', preview: 'Setting up database migration scripts...', createdAt: '5 min ago', duration: '3m', status: 'running', agentName: 'Agent Alpha', tasksAdded: 1, tasksModified: 0, tasksDeleted: 0 },
  { id: 'wt-3', workspaceId: 'ws-1', title: 'Refactor agent pool connections', preview: 'Extracted ConnectionManager pattern with health checks', createdAt: '1 day ago', duration: '45m', status: 'completed', agentName: 'Agent Alpha', tasksAdded: 1, tasksModified: 3, tasksDeleted: 1 },
  // Marketing Site threads
  { id: 'wt-4', workspaceId: 'ws-2', title: 'Hero section redesign', preview: 'New hero with animated gradient background and CTA', createdAt: '8 min ago', duration: '22m', status: 'completed', agentName: 'Agent Bravo', tasksAdded: 1, tasksModified: 2, tasksDeleted: 0 },
  { id: 'wt-5', workspaceId: 'ws-2', title: 'SEO meta tag optimization', preview: 'Updating Open Graph and Twitter Card meta tags across all pages', createdAt: '25 min ago', duration: '8m', status: 'completed', agentName: 'Agent Charlie', tasksAdded: 0, tasksModified: 12, tasksDeleted: 0 },
  { id: 'wt-6', workspaceId: 'ws-2', title: 'Contact form validation', preview: 'Adding client-side validation with error messages', createdAt: '1 hr ago', duration: '15m', status: 'completed', agentName: 'Agent Bravo', tasksAdded: 0, tasksModified: 1, tasksDeleted: 0 },
  // Mobile App threads
  { id: 'wt-7', workspaceId: 'ws-3', title: 'Push notification integration', preview: 'FCM setup failed — missing google-services.json configuration', createdAt: '12 min ago', duration: '18m', status: 'error', agentName: 'Agent Delta', tasksAdded: 0, tasksModified: 0, tasksDeleted: 0 },
  { id: 'wt-8', workspaceId: 'ws-3', title: 'Biometric auth flow', preview: 'Face ID and Touch ID authentication implemented', createdAt: '2 hr ago', duration: '35m', status: 'completed', agentName: 'Agent Delta', tasksAdded: 1, tasksModified: 3, tasksDeleted: 0 },
  // API Gateway threads
  { id: 'wt-9', workspaceId: 'ws-4', title: 'Rate limiting middleware', preview: 'Implementing sliding window rate limiter with Redis backend', createdAt: '3 min ago', duration: '11m', status: 'running', agentName: 'Agent Echo', tasksAdded: 1, tasksModified: 0, tasksDeleted: 0 },
  { id: 'wt-10', workspaceId: 'ws-4', title: 'Request tracing headers', preview: 'Adding X-Request-ID propagation through all middleware layers', createdAt: '45 min ago', duration: '19m', status: 'completed', agentName: 'Agent Foxtrot', tasksAdded: 0, tasksModified: 4, tasksDeleted: 0 },
  // Data Pipeline threads
  { id: 'wt-11', workspaceId: 'ws-6', title: 'Kafka consumer group rebalancing', preview: 'Fixing consumer lag during rebalancing events', createdAt: '6 min ago', duration: '25m', status: 'running', agentName: 'Agent Golf', tasksAdded: 0, tasksModified: 2, tasksDeleted: 0 },
  { id: 'wt-12', workspaceId: 'ws-6', title: 'Dead letter queue processing', preview: 'Added retry logic with exponential backoff for failed messages', createdAt: '1 hr ago', duration: '32m', status: 'completed', agentName: 'Agent Hotel', tasksAdded: 1, tasksModified: 1, tasksDeleted: 0 },
]

export const mockNotifications: NotificationItem[] = [
  { id: 'n-1', workspaceId: 'ws-2', type: 'agent-completed', message: 'Agent Bravo completed "Hero section redesign"', timestamp: '8 min ago', read: false },
  { id: 'n-2', workspaceId: 'ws-3', type: 'agent-error', message: 'Agent Delta failed on "Push notification integration"', timestamp: '12 min ago', read: false },
  { id: 'n-3', workspaceId: 'ws-2', type: 'agent-completed', message: 'Agent Charlie completed "SEO meta tag optimization"', timestamp: '25 min ago', read: false },
  { id: 'n-4', workspaceId: 'ws-4', type: 'mr-review', message: 'MR #34 "Rate limiting middleware" ready for review', timestamp: '30 min ago', read: true },
  { id: 'n-5', workspaceId: 'ws-3', type: 'ci-passed', message: 'CI passed for "Biometric auth flow" on mobile/main', timestamp: '1 hr ago', read: true },
  { id: 'n-6', workspaceId: 'ws-6', type: 'agent-completed', message: 'Agent Hotel completed "Dead letter queue processing"', timestamp: '1 hr ago', read: true },
  { id: 'n-7', workspaceId: 'ws-4', type: 'ci-failed', message: 'CI failed for "Request tracing headers" — 2 test failures', timestamp: '2 hr ago', read: true },
  { id: 'n-8', workspaceId: 'ws-6', type: 'agent-needs-input', message: 'Agent Golf needs input on Kafka partition strategy', timestamp: '3 hr ago', read: true },
  // Team-only notification types (filtered out in solo mode)
  { id: 'n-9', workspaceId: 'ws-1', type: 'mention', message: 'Sarah Chen mentioned you in SF-142: "@Adam King can you review the migration plan?"', timestamp: '15 min ago', read: false, actorId: 'user-sarah' },
  { id: 'n-10', workspaceId: 'ws-1', type: 'assignment', message: 'James Wright assigned SF-155 "Rate limiter edge cases" to you', timestamp: '45 min ago', read: false, actorId: 'user-james' },
  { id: 'n-11', workspaceId: 'ws-1', type: 'review-request', message: 'Sarah Chen requested your review on MR #42 "WebSocket reconnection"', timestamp: '1 hr ago', read: true, actorId: 'user-sarah' },
  { id: 'n-12', workspaceId: 'ws-4', type: 'deployment-approval', message: 'Deploy to production requires your approval — "API v2.3 release"', timestamp: '2 hr ago', read: true, actorId: 'user-james' },
]

// ── Mock workspace activity for Mission Control ──
export interface WorkspaceActivity {
  id: string
  workspaceId: string
  type: 'agent-completed' | 'agent-started' | 'mr-opened' | 'ci-passed' | 'ci-failed' | 'agent-error'
  message: string
  timestamp: string
}

export const mockWorkspaceActivity: WorkspaceActivity[] = [
  { id: 'wa-1', workspaceId: 'ws-1', type: 'agent-started', message: 'Director Alpha started "OAuth2 PKCE flow"', timestamp: '2 min ago' },
  { id: 'wa-2', workspaceId: 'ws-1', type: 'agent-started', message: 'Director Alpha started "SQLite WAL migration"', timestamp: '5 min ago' },
  { id: 'wa-3', workspaceId: 'ws-1', type: 'mr-opened', message: 'MR #42 opened for WebSocket reconnection', timestamp: '15 min ago' },
  { id: 'wa-4', workspaceId: 'ws-2', type: 'agent-completed', message: 'Agent Bravo completed "Hero section redesign"', timestamp: '8 min ago' },
  { id: 'wa-5', workspaceId: 'ws-2', type: 'agent-completed', message: 'Agent Charlie completed "SEO meta tags"', timestamp: '25 min ago' },
  { id: 'wa-6', workspaceId: 'ws-3', type: 'agent-error', message: 'Agent Delta failed — missing FCM config', timestamp: '12 min ago' },
  { id: 'wa-7', workspaceId: 'ws-3', type: 'ci-passed', message: 'CI passed for biometric auth flow', timestamp: '1 hr ago' },
  { id: 'wa-8', workspaceId: 'ws-4', type: 'agent-started', message: 'Agent Echo started "Rate limiting middleware"', timestamp: '3 min ago' },
  { id: 'wa-9', workspaceId: 'ws-4', type: 'agent-completed', message: 'Agent Foxtrot completed "Request tracing"', timestamp: '45 min ago' },
  { id: 'wa-10', workspaceId: 'ws-4', type: 'ci-failed', message: 'CI failed — 2 test failures in tracing', timestamp: '40 min ago' },
  { id: 'wa-11', workspaceId: 'ws-6', type: 'agent-started', message: 'Agent Golf started "Kafka rebalancing fix"', timestamp: '6 min ago' },
  { id: 'wa-12', workspaceId: 'ws-6', type: 'agent-completed', message: 'Agent Hotel completed "DLQ processing"', timestamp: '1 hr ago' },
]

// ── Director chat messages ──
export type DirectorMessageType = 'user' | 'agent' | 'tool' | 'system' | 'cross-agent'

export interface DirectorMessage {
  id: string
  type: DirectorMessageType
  content: string
  timestamp: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  toolStatus?: 'running' | 'completed' | 'error'
  toolDuration?: string
  planTitle?: string
  planItems?: { label: string; checked: boolean }[]
  whiteboardId?: string
  // Cross-agent message fields
  fromAgent?: string
  toAgent?: string
  channelId?: string
  channelName?: string
}

export const mockDirectorMessages: Record<string, DirectorMessage[]> = {
  'dir-1': [
    { id: 'dm-1', type: 'user', content: 'Implement OAuth2 PKCE flow for CLI authentication', timestamp: '14m ago' },
    { id: 'dm-2', type: 'agent', content: "I'll start implementing the OAuth2 PKCE flow. Let me first review the existing auth module to understand the current architecture.", timestamp: '14m ago' },
    { id: 'dm-3', type: 'tool', content: '', timestamp: '14m ago', toolName: 'Read', toolInput: 'packages/smithy/src/auth/', toolResult: 'Found 4 files in auth module:\n  session.ts (auth session management)\n  types.ts (AuthConfig, SessionToken interfaces)\n  middleware.ts (auth middleware)\n  index.ts (barrel exports)', toolStatus: 'completed', toolDuration: '0.2s' },
    { id: 'dm-4', type: 'agent', content: "I can see the current session-based auth. I'll create a new PKCE handler alongside it. The flow needs: 1) code verifier + challenge generation, 2) browser-based authorization, 3) callback handler for token exchange.", timestamp: '13m ago' },
    { id: 'dm-5', type: 'tool', content: '', timestamp: '13m ago', toolName: 'Write', toolInput: 'packages/smithy/src/auth/pkce.ts', toolResult: 'Created packages/smithy/src/auth/pkce.ts (42 lines)\n  - generatePKCEChallenge(): PKCEChallenge\n  - exchangeCodeForToken(): Promise<SessionToken>', toolStatus: 'completed', toolDuration: '0.8s' },
    { id: 'dm-6', type: 'tool', content: '', timestamp: '12m ago', toolName: 'Write', toolInput: 'packages/smithy/src/auth/pkce-callback.ts', toolResult: 'Created packages/smithy/src/auth/pkce-callback.ts (28 lines)\n  - handlePKCECallback(url: URL): Promise<SessionToken>', toolStatus: 'completed', toolDuration: '0.5s' },
    { id: 'dm-7', type: 'tool', content: '', timestamp: '12m ago', toolName: 'Edit', toolInput: 'packages/smithy/src/auth/index.ts', toolResult: 'Modified packages/smithy/src/auth/index.ts (+3 -1 lines)\n  Added exports for PKCE functions and types', toolStatus: 'completed', toolDuration: '0.3s' },
    { id: 'dm-8', type: 'tool', content: '', timestamp: '11m ago', toolName: 'Bash', toolInput: 'cd packages/smithy && pnpm test -- --filter auth', toolResult: '✓ src/auth/pkce.test.ts (4 tests)\n✓ src/auth/session.test.ts (6 tests)\n\nTests: 10 passed, 10 total\nTime: 2.1s', toolStatus: 'completed', toolDuration: '3.2s' },
    { id: 'dm-9', type: 'agent', content: "The PKCE flow is implemented and all tests pass. Here's what I built:\n\n• **pkce.ts** — Generates S256 code challenges and handles token exchange\n• **pkce-callback.ts** — Processes the OAuth callback URL\n• **index.ts** — Updated barrel exports\n\nThe implementation uses `crypto.randomBytes` for the code verifier and `sha256` for the challenge. All existing auth tests still pass.", timestamp: '11m ago' },
    { id: 'dm-10', type: 'tool', content: '', timestamp: '10m ago', toolName: 'Bash', toolInput: 'git add -A && git commit -m "feat: implement OAuth2 PKCE flow"', toolResult: '[feat/oauth-pkce a3f2c1d] feat: implement OAuth2 PKCE flow\n 3 files changed, 73 insertions(+), 1 deletion(-)', toolStatus: 'completed', toolDuration: '1.1s' },

    { id: 'dm-10b', type: 'system', content: 'Created whiteboard: OAuth2 PKCE Flow', timestamp: '10m ago', whiteboardId: 'wb-1' },
    { id: 'dm-10c', type: 'cross-agent', content: 'Agent Alpha, I reviewed the PKCE implementation. The code verifier should use URL-safe base64 encoding per RFC 7636 §4.1. Currently using standard base64 — this will break with some OAuth providers.', timestamp: '10m ago', fromAgent: 'Agent Beta', toAgent: 'Agent Alpha', channelId: 'ch-review', channelName: 'Security Review' },

    // ── Second user message: token refresh ──
    { id: 'dm-11', type: 'user', content: 'Now add token refresh support — the access token expires after 1 hour and we need silent refresh using the refresh token', timestamp: '9m ago' },
    { id: 'dm-12', type: 'agent', content: "I'll add automatic token refresh. The flow will intercept 401 responses, use the stored refresh token to get a new access token, and retry the original request.", timestamp: '9m ago' },
    { id: 'dm-13', type: 'tool', content: '', timestamp: '9m ago', toolName: 'Read', toolInput: 'packages/smithy/src/auth/pkce.ts', toolResult: 'Read 42 lines — found exchangeCodeForToken function returns { accessToken, refreshToken, expiresIn }', toolStatus: 'completed', toolDuration: '0.1s' },
    { id: 'dm-14', type: 'tool', content: '', timestamp: '8m ago', toolName: 'Write', toolInput: 'packages/smithy/src/auth/token-refresh.ts', toolResult: 'Created token-refresh.ts (56 lines)\n  - TokenRefreshManager class\n  - Mutex-based refresh to prevent concurrent refresh races\n  - Auto-refresh 5 minutes before expiry', toolStatus: 'completed', toolDuration: '0.7s' },
    { id: 'dm-15', type: 'tool', content: '', timestamp: '8m ago', toolName: 'Edit', toolInput: 'packages/smithy/src/auth/middleware.ts', toolResult: 'Modified middleware.ts (+18 -3 lines)\n  - Integrated TokenRefreshManager into auth middleware\n  - 401 responses trigger silent refresh and retry', toolStatus: 'completed', toolDuration: '0.4s' },
    { id: 'dm-16', type: 'tool', content: '', timestamp: '7m ago', toolName: 'Write', toolInput: 'packages/smithy/src/auth/token-store.ts', toolResult: 'Created token-store.ts (34 lines)\n  - SecureTokenStore using system keychain\n  - Fallback to encrypted file storage', toolStatus: 'completed', toolDuration: '0.6s' },
    { id: 'dm-17', type: 'tool', content: '', timestamp: '7m ago', toolName: 'Bash', toolInput: 'cd packages/smithy && pnpm test -- --filter auth', toolResult: '✓ src/auth/pkce.test.ts (4 tests)\n✓ src/auth/token-refresh.test.ts (6 tests)\n✓ src/auth/token-store.test.ts (3 tests)\n✓ src/auth/session.test.ts (6 tests)\n\nTests: 19 passed, 19 total\nTime: 3.4s', toolStatus: 'completed', toolDuration: '4.1s' },
    { id: 'dm-18', type: 'agent', content: "Token refresh is implemented:\n\n• **token-refresh.ts** — `TokenRefreshManager` with mutex-based concurrent refresh prevention and pre-emptive refresh 5 minutes before expiry\n• **token-store.ts** — `SecureTokenStore` using system keychain with encrypted file fallback\n• **middleware.ts** — Updated to intercept 401s, refresh, and retry\n\nAll 19 tests pass.", timestamp: '6m ago' },
    { id: 'dm-19a', type: 'tool', content: '', timestamp: '6m ago', toolName: 'Bash', toolInput: 'git add -A && git commit -m "feat: add silent token refresh with secure storage"', toolResult: '[feat/oauth-pkce b7e4d2f] feat: add silent token refresh with secure storage\n 4 files changed, 108 insertions(+), 3 deletions(-)', toolStatus: 'completed', toolDuration: '0.9s' },

    // ── Third user message: CLI login command ──
    { id: 'dm-40', type: 'user', content: 'Create the actual CLI login command that ties this all together — `sf auth login` should open the browser, handle the callback, and store the tokens', timestamp: '5m ago' },
    { id: 'dm-41', type: 'agent', content: "I'll create the CLI command that orchestrates the full PKCE flow. It will: 1) start a local HTTP server for the callback, 2) open the browser to the authorization URL, 3) exchange the code for tokens, 4) store them securely.", timestamp: '5m ago' },
    { id: 'dm-42', type: 'tool', content: '', timestamp: '5m ago', toolName: 'Read', toolInput: 'packages/smithy/src/cli/commands/', toolResult: 'Found 8 command files:\n  init.ts, serve.ts, deploy.ts, config.ts, status.ts, sync.ts, task.ts, index.ts', toolStatus: 'completed', toolDuration: '0.1s' },
    { id: 'dm-43', type: 'tool', content: '', timestamp: '4m ago', toolName: 'Write', toolInput: 'packages/smithy/src/cli/commands/auth.ts', toolResult: 'Created auth.ts (94 lines)\n  - `sf auth login` — full PKCE browser flow\n  - `sf auth logout` — clear tokens\n  - `sf auth status` — show current auth state\n  - Local callback server on port 9876', toolStatus: 'completed', toolDuration: '1.0s' },
    { id: 'dm-44', type: 'tool', content: '', timestamp: '4m ago', toolName: 'Edit', toolInput: 'packages/smithy/src/cli/commands/index.ts', toolResult: 'Modified index.ts (+2 -0 lines)\n  - Registered auth command group', toolStatus: 'completed', toolDuration: '0.2s' },
    { id: 'dm-45', type: 'tool', content: '', timestamp: '3m ago', toolName: 'Bash', toolInput: 'cd packages/smithy && pnpm test -- --filter cli', toolResult: '✓ src/cli/commands/auth.test.ts (5 tests)\n✓ src/cli/commands/init.test.ts (3 tests)\n\nTests: 8 passed, 8 total\nTime: 2.8s', toolStatus: 'completed', toolDuration: '3.5s' },
    { id: 'dm-46', type: 'agent', content: "The `sf auth` command group is ready:\n\n• `sf auth login` — Opens browser for OAuth2 PKCE flow, starts local callback server on port 9876, exchanges code for tokens, stores in system keychain\n• `sf auth logout` — Clears stored tokens\n• `sf auth status` — Shows current authentication state (logged in/out, token expiry)\n\nAll CLI tests pass.", timestamp: '3m ago' },

    // ── Fourth user message: error handling ──
    { id: 'dm-47', type: 'user', content: 'Add proper error handling — what happens if the user closes the browser before completing auth? Or if the callback server port is already in use?', timestamp: '2m ago' },
    { id: 'dm-48', type: 'agent', content: "Good catch. I'll add timeout handling, port conflict detection, and user cancellation support.", timestamp: '2m ago' },
    { id: 'dm-49', type: 'tool', content: '', timestamp: '2m ago', toolName: 'Edit', toolInput: 'packages/smithy/src/cli/commands/auth.ts', toolResult: 'Modified auth.ts (+32 -6 lines)\n  - 120s timeout with user-friendly message\n  - Port conflict detection with fallback to random port\n  - Ctrl+C handler for graceful cleanup\n  - Spinner with status updates during flow', toolStatus: 'completed', toolDuration: '0.5s' },
    { id: 'dm-50', type: 'tool', content: '', timestamp: '1m ago', toolName: 'Edit', toolInput: 'packages/smithy/src/auth/pkce.ts', toolResult: 'Modified pkce.ts (+8 -2 lines)\n  - AbortController support for cancellation\n  - Custom AuthTimeoutError and AuthCancelledError', toolStatus: 'completed', toolDuration: '0.3s' },
    { id: 'dm-51', type: 'tool', content: '', timestamp: '1m ago', toolName: 'Bash', toolInput: 'cd packages/smithy && pnpm test -- --filter auth --filter cli', toolResult: '✓ src/auth/pkce.test.ts (6 tests)\n✓ src/auth/token-refresh.test.ts (6 tests)\n✓ src/auth/token-store.test.ts (3 tests)\n✓ src/auth/session.test.ts (6 tests)\n✓ src/cli/commands/auth.test.ts (8 tests)\n\nTests: 29 passed, 29 total\nTime: 4.2s', toolStatus: 'completed', toolDuration: '5.0s' },
    { id: 'dm-52', type: 'agent', content: "Error handling is in place:\n\n• **Browser timeout** — 120s timeout with clear message suggesting `sf auth login` retry\n• **Port conflict** — Detects EADDRINUSE, falls back to random available port\n• **User cancellation** — Ctrl+C cleanly shuts down callback server and clears partial state\n• **Network errors** — Token exchange failures show actionable error messages\n\nAll 29 tests pass including the new error scenarios.", timestamp: '1m ago' },
    { id: 'dm-53', type: 'agent', content: 'Here\'s what remains for the auth system:', timestamp: '30s ago', planTitle: 'Plan', planItems: [
      { label: 'Implement OAuth2 PKCE flow', checked: true },
      { label: 'Add token refresh support', checked: true },
      { label: 'Create CLI login command', checked: true },
      { label: 'Add error handling', checked: true },
      { label: 'Write integration tests for full auth flow', checked: false },
      { label: 'Add token revocation endpoint', checked: false },
      { label: 'Update CLI help docs', checked: false },
    ]},
  ],
  'dir-2': [
    { id: 'dm-20', type: 'user', content: 'Fix the WebSocket reconnection — it drops silently on network changes', timestamp: '28m ago' },
    { id: 'dm-21', type: 'agent', content: "I'll implement automatic reconnection with exponential backoff and jitter to prevent thundering herd on reconnect.", timestamp: '28m ago' },
    { id: 'dm-22', type: 'tool', content: '', timestamp: '27m ago', toolName: 'Read', toolInput: 'packages/smithy/src/ws/', toolResult: 'Found 3 files:\n  client.ts, types.ts, index.ts', toolStatus: 'completed', toolDuration: '0.1s' },
    { id: 'dm-23', type: 'tool', content: '', timestamp: '26m ago', toolName: 'Write', toolInput: 'packages/smithy/src/ws/reconnect.ts', toolResult: 'Created reconnect.ts (78 lines) — WebSocketReconnect class with configurable backoff', toolStatus: 'completed', toolDuration: '0.9s' },
    { id: 'dm-24', type: 'tool', content: '', timestamp: '25m ago', toolName: 'Edit', toolInput: 'packages/smithy/src/ws/client.ts', toolResult: 'Modified client.ts (+12 -8 lines) — integrated reconnect manager', toolStatus: 'completed', toolDuration: '0.4s' },
    { id: 'dm-25', type: 'agent', content: "Done. The WebSocket client now automatically reconnects with exponential backoff (1.5x multiplier, max 30s delay, configurable max retries). Jitter is added to prevent thundering herd.", timestamp: '24m ago' },
    { id: 'dm-25b', type: 'system', content: 'Created whiteboard: WebSocket Reconnection Strategy', timestamp: '24m ago', whiteboardId: 'wb-3' },
  ],
  'dir-3': [
    { id: 'dm-30', type: 'user', content: 'Set up SSH tunnel to cloud worker for remote execution', timestamp: '30m ago' },
    { id: 'dm-31', type: 'agent', content: "I'll establish an SSH connection to the cloud worker. Let me check the connection configuration.", timestamp: '30m ago' },
    { id: 'dm-32', type: 'tool', content: '', timestamp: '29m ago', toolName: 'Bash', toolInput: 'ssh -o ConnectTimeout=10 worker@cloud.stoneforge.dev', toolResult: 'ssh: connect to host cloud.stoneforge.dev port 22: Connection timed out', toolStatus: 'error', toolDuration: '10.2s' },
    { id: 'dm-33', type: 'agent', content: "The SSH connection timed out. The cloud worker may be down or the firewall rules may need updating. I'll retry with verbose output to diagnose.", timestamp: '28m ago' },
    { id: 'dm-34', type: 'tool', content: '', timestamp: '28m ago', toolName: 'Bash', toolInput: 'ssh -vvv -o ConnectTimeout=10 worker@cloud.stoneforge.dev 2>&1 | tail -20', toolResult: 'debug1: Connecting to cloud.stoneforge.dev port 22.\ndebug1: connect to address 203.0.113.42 port 22: Connection timed out\nssh: connect to host cloud.stoneforge.dev port 22: Connection timed out', toolStatus: 'error', toolDuration: '10.1s' },
  ],
}

export interface MergeRequest {
  id: string
  title: string
  branch: string
  author: string
  status: 'open' | 'merged' | 'closed'
  ciStatus: 'pass' | 'fail' | 'pending'
  reviewers: string[]
  additions: number
  deletions: number
  filesChanged: number
  createdAt: string
}

// CIJob interface removed — CI types now in components/overlays/ci/ci-types.ts
// Automation/Workflow types now in components/overlays/automations/wf-types.ts

export const mockTasks: Task[] = [
  { id: 'SF-142', title: 'Implement OAuth2 PKCE flow for CLI authentication', description: 'Add PKCE-based OAuth2 flow so CLI users can authenticate without exposing client secrets. Should support the authorization code flow with S256 code challenge method.', status: 'in_progress', priority: 'high', assignee: { name: 'Agent Alpha', avatar: 'AA' }, labels: ['auth', 'security'], estimate: 4, dueDate: 'Apr 5', subTaskIds: ['SF-142-1', 'SF-142-2'], sessionStatus: 'running', ciStatus: 'pending', mrStatus: 'none', branch: 'feat/oauth-pkce', agentName: 'Agent Delta', agentSessionId: 'a4', activeDuration: '14m 22s', updatedAt: '2 min ago', planId: 'plan-1', planName: 'CLI Authentication System', whiteboardId: 'wb-1', requiredRoleDefinitionTags: ['auth', 'security'], creatorId: 'user-adam', assigneeUserId: 'user-adam', claimedBy: { agentName: 'Agent Alpha', launchedByUserId: 'user-adam' }, watchers: ['user-adam', 'user-sarah', 'user-james'], acceptanceCriteria: [
    { id: 'ac-142-1', text: 'Generate code verifier + challenge', checked: true },
    { id: 'ac-142-2', text: 'Open browser for auth', checked: false },
    { id: 'ac-142-3', text: 'Handle callback with token exchange', checked: false },
    { id: 'ac-142-4', text: 'Store refresh token securely', checked: false },
  ] },
  { id: 'SF-142-1', title: 'Generate PKCE challenge and verifier', status: 'done', priority: 'medium', assignee: { name: 'Agent Alpha', avatar: 'AA' }, labels: ['auth'], estimate: 1, parentId: 'SF-142', updatedAt: '30 min ago', whiteboardId: 'wb-1' },
  { id: 'SF-142-2', title: 'Implement token exchange callback handler', status: 'in_progress', priority: 'medium', assignee: { name: 'Agent Alpha', avatar: 'AA' }, labels: ['auth'], estimate: 3, parentId: 'SF-142', sessionStatus: 'running', branch: 'feat/oauth-pkce', agentName: 'Agent Delta', agentSessionId: 'a4', activeDuration: '4m 51s', updatedAt: '5 min ago', whiteboardId: 'wb-1' },
  { id: 'SF-139', title: 'Add WebSocket reconnection with exponential backoff', description: 'The WebSocket connection drops silently on network changes. Implement automatic reconnection with exponential backoff and jitter to prevent thundering herd.', status: 'in_review', priority: 'medium', assignee: { name: 'Agent Beta', avatar: 'AB' }, labels: ['networking'], estimate: 3, dueDate: 'Apr 3', sessionStatus: 'idle', ciStatus: 'pass', mrStatus: 'needs_review', branch: 'fix/ws-reconnect', agentName: 'Agent Beta', agentSessionId: 'a5', reviewAgentName: 'Agent Zeta', reviewAgentSessionId: 'a6', activeDuration: '42m 08s', updatedAt: '15 min ago', whiteboardId: 'wb-3', planId: 'plan-3', planName: 'WebSocket Reliability', creatorId: 'user-sarah', assigneeUserId: 'user-sarah', claimedBy: { agentName: 'Agent Beta', launchedByUserId: 'user-sarah' }, watchers: ['user-sarah', 'user-adam'], acceptanceCriteria: [
    { id: 'ac-139-1', text: 'Reconnects automatically after network drop', checked: true },
    { id: 'ac-139-2', text: 'Uses exponential backoff with jitter', checked: true },
    { id: 'ac-139-3', text: 'Caps retry delay at 30 seconds', checked: true },
    { id: 'ac-139-4', text: 'Emits connection state events to subscribers', checked: false },
    { id: 'ac-139-5', text: 'Queues messages sent while disconnected', checked: false },
  ] },
  { id: 'SF-145', title: 'Migrate task storage to SQLite with WAL mode', description: 'Replace the JSON file-based task store with SQLite using WAL mode for better concurrent read performance. Include migration script for existing data.', status: 'in_progress', priority: 'high', assignee: { name: 'Agent Alpha', avatar: 'AA' }, labels: ['database', 'performance'], estimate: 3, dueDate: 'Apr 8', sessionStatus: 'running', ciStatus: 'none', mrStatus: 'none', branch: 'feat/sqlite-wal', agentName: 'Agent Delta', agentSessionId: 'a4', activeDuration: '5m 12s', updatedAt: '5 min ago', planId: 'plan-2', planName: 'Storage Migration', requiredRoleDefinitionTags: ['database'], claimedBy: { agentName: 'Agent Alpha', launchedByUserId: 'user-adam' }, watchers: ['user-adam'] },
  { id: 'SF-137', title: 'Fix terminal resize event not propagating to PTY', description: 'When the terminal panel is resized, the PTY dimensions are not updated, causing line wrapping issues. The resize handler needs to propagate cols/rows to the PTY subprocess.', status: 'in_review', priority: 'urgent', assignee: { name: 'Agent Beta', avatar: 'AB' }, labels: ['bug', 'terminal'], estimate: 1, sessionStatus: 'idle', ciStatus: 'fail', mrStatus: 'open', branch: 'fix/pty-resize', agentName: 'Agent Beta', agentSessionId: 'a5', reviewAgentName: 'Agent Zeta', reviewAgentSessionId: 'a7', activeDuration: '1h 03m', updatedAt: '1 hr ago', planId: 'plan-6', planName: 'Terminal PTY Fixes', acceptanceCriteria: [
    { id: 'ac-137-1', text: 'PTY cols/rows update on terminal panel resize', checked: true },
    { id: 'ac-137-2', text: 'Line wrapping correct after resize', checked: true },
    { id: 'ac-137-3', text: 'No visual glitch on rapid resize', checked: true },
    { id: 'ac-137-4', text: 'Works with split terminal panes', checked: true },
  ] },
  { id: 'SF-150', title: 'Design system: migrate to Inter font + new token scale', description: 'Update the design system to use Inter as the primary typeface and condense the color token palette for the Linear-inspired redesign.', status: 'todo', priority: 'medium', assignee: { name: 'Agent Beta', avatar: 'AB' }, labels: ['design', 'ui'], estimate: 3, dueDate: 'Apr 10', blocked: true, updatedAt: '3 hr ago', dependencyIds: ['SF-142', 'SF-155'], requiredRoleDefinitionTags: ['frontend', 'react'], planId: 'plan-4', planName: 'Design System Refresh', creatorId: 'user-james', assigneeUserId: 'user-james' },
  { id: 'SF-151', title: 'Add diff viewer with syntax highlighting', status: 'todo', priority: 'high', assignee: { name: 'Agent Beta', avatar: 'AB' }, labels: ['editor', 'ui'], estimate: 4, blocked: true, updatedAt: '4 hr ago', dependencyIds: ['SF-145'], planId: 'plan-4', planName: 'Design System Refresh' },
  { id: 'SF-148', title: 'Implement agent session resume from checkpoint', status: 'todo', priority: 'medium', labels: ['agents'], estimate: 3, updatedAt: '5 hr ago', requiredRoleDefinitionTags: ['implementation', 'coding'], requiredAgentTags: ['thorough'], planId: 'plan-5', planName: 'Agent Session Management' },
  { id: 'SF-153', title: 'Add CI/CD pipeline visualization', status: 'backlog', priority: 'low', labels: ['ci-cd', 'ui'], estimate: 3, updatedAt: '1 day ago' },
  { id: 'SF-154', title: 'Support custom workflow triggers via webhooks', status: 'backlog', priority: 'medium', labels: ['automations'], estimate: 4, updatedAt: '1 day ago' },
  { id: 'SF-155', title: 'Add dark mode contrast accessibility audit', status: 'backlog', priority: 'low', labels: ['a11y'], estimate: 1, updatedAt: '2 days ago' },
  { id: 'SF-136', title: 'Refactor agent pool connection management', status: 'done', priority: 'medium', assignee: { name: 'Agent Alpha', avatar: 'AA' }, labels: ['agents', 'refactor'], estimate: 3, ciStatus: 'pass', mrStatus: 'merged', updatedAt: '1 day ago' },
  { id: 'SF-134', title: 'Add rate limit banner with wake timer', status: 'todo', priority: 'high', assignee: { name: 'Agent Beta', avatar: 'AB' }, labels: ['ui'], estimate: 3, updatedAt: '2 days ago' },
]

export const mockDirectors: DirectorSession[] = [
  { id: 'dir-1', name: 'Agent Alpha', agentId: 'a1', roleDefinitionId: 'rd-director', status: 'running', unreadCount: 3, lastMessage: 'Working on OAuth PKCE implementation...', ownerId: currentUser.id, connectionType: 'local', runtimeId: 'rt-local-1', viewers: ['user-sarah'] },
  { id: 'dir-2', name: 'Agent Beta', agentId: 'a2', roleDefinitionId: 'rd-bugfix', status: 'idle', unreadCount: 0, lastMessage: 'Session paused. Waiting for review feedback.', ownerId: currentUser.id, connectionType: 'remote', runtimeId: 'rt-docker-1' },
  { id: 'dir-3', name: 'Agent Gamma', agentId: 'a3', roleDefinitionId: 'rd-director', status: 'error', unreadCount: 1, lastMessage: 'Error: SSH connection timeout to cloud worker.', ownerId: 'user-sarah', connectionType: 'ssh', runtimeId: 'rt-ssh-1', locked: true },
]

// ── Last agent message per task (for active tasks) ──
export const mockTaskAgentMessages: Record<string, string> = {
  'SF-142': 'Implementing the token exchange endpoint with PKCE code verifier validation',
  'SF-142-2': 'Writing the callback HTTP handler to capture the authorization code',
  'SF-145': 'Creating the SQLite schema and WAL mode configuration',
  'SF-139': 'Reviewing diff: exponential backoff implementation looks correct, checking jitter logic',
  'SF-137': 'CI failure in resize handler — investigating PTY dimension propagation',
}

export const mockMergeRequests: MergeRequest[] = [
  { id: 'MR-42', title: 'feat: Add WebSocket reconnection with exponential backoff', branch: 'fix/ws-reconnect', author: 'Agent Beta', status: 'open', ciStatus: 'pass', reviewers: [currentUser.name], additions: 245, deletions: 32, filesChanged: 6, createdAt: '15 min ago' },
  { id: 'MR-41', title: 'fix: Terminal resize event not propagating to PTY', branch: 'fix/pty-resize', author: 'Agent Beta', status: 'open', ciStatus: 'fail', reviewers: [], additions: 42, deletions: 11, filesChanged: 5, createdAt: '1 hr ago' },
  { id: 'MR-40', title: 'refactor: Agent pool connection management', branch: 'refactor/agent-pool', author: 'Agent Alpha', status: 'merged', ciStatus: 'pass', reviewers: [currentUser.name], additions: 432, deletions: 189, filesChanged: 11, createdAt: '1 day ago' },
  { id: 'MR-39', title: 'feat: Rate limit banner with wake timer', branch: 'feat/rate-limit-banner', author: 'Agent Beta', status: 'merged', ciStatus: 'pass', reviewers: [currentUser.name], additions: 156, deletions: 0, filesChanged: 4, createdAt: '2 days ago' },
]

// ── Extended MR data (for redesigned MR overlay) ──
import type { MergeRequestExtended, MRTimelineEvent, MRCommit, MRCheck } from './components/overlays/mr/mr-types'

export const mockMergeRequestsExtended: MergeRequestExtended[] = [
  {
    id: 'MR-43', title: 'feat: Migrate task storage to SQLite with WAL mode', description: 'Replace the JSON file-based task store with SQLite using WAL mode for better concurrent read performance. Includes migration script for existing data.', branch: 'feat/sqlite-wal', targetBranch: 'main', author: 'Agent Alpha', status: 'open', isDraft: true, ciStatus: 'pending', reviewers: [], additions: 0, deletions: 0, filesChanged: 0, createdAt: '5 min ago',
    createdByAgent: 'Agent Alpha', agentSessionId: 'dir-1', linkedTaskId: 'SF-145',
    mergeStrategy: 'squash', autoMergeEnabled: false, hasConflicts: false,
    mergeGates: [
      { label: 'CI checks pass', passed: false, required: true },
      { label: 'At least 1 approval', passed: false, required: true },
      { label: 'No merge conflicts', passed: true, required: true },
    ],
    labels: ['database', 'performance'],
  },
  {
    id: 'MR-42', title: 'feat: Add WebSocket reconnection with exponential backoff', description: 'The WebSocket connection drops silently on network changes. This implements automatic reconnection with exponential backoff and jitter to prevent thundering herd.', branch: 'fix/ws-reconnect', targetBranch: 'main', author: 'Agent Beta', status: 'open', isDraft: false, ciStatus: 'pass',
    reviewers: [
      { name: currentUser.name, avatar: currentUser.avatar, state: 'approved', reviewedAt: '5 min ago' },
      { name: 'Agent Alpha', avatar: 'AA', state: 'pending' },
    ],
    additions: 245, deletions: 32, filesChanged: 6, createdAt: '15 min ago',
    createdByAgent: 'Agent Beta', agentSessionId: 'dir-2', linkedTaskId: 'SF-139',
    previewUrl: 'https://preview-mr42.stoneforge.dev', previewStatus: 'ready',
    reviewAgentStatus: 'approved', reviewAgentName: 'Agent Zeta', reviewAgentSessionId: 's7',
    mergeStrategy: 'squash', autoMergeEnabled: false, hasConflicts: false,
    mergeGates: [
      { label: 'CI checks pass', passed: true, required: true },
      { label: 'At least 1 approval', passed: true, required: true },
      { label: 'No merge conflicts', passed: true, required: true },
      { label: 'Review agent approved', passed: true, required: false },
    ],
    labels: ['networking'],
  },
  {
    id: 'MR-41', title: 'fix: Terminal resize event not propagating to PTY', description: 'When the terminal panel is resized, the PTY dimensions are not updated, causing line wrapping issues.', branch: 'fix/pty-resize', targetBranch: 'main', author: 'Agent Beta', status: 'open', isDraft: false, ciStatus: 'fail',
    reviewers: [
      { name: currentUser.name, avatar: currentUser.avatar, state: 'changes_requested', reviewedAt: '45 min ago' },
    ],
    additions: 42, deletions: 11, filesChanged: 5, createdAt: '1 hr ago',
    createdByAgent: 'Agent Beta', agentSessionId: 'dir-2', linkedTaskId: 'SF-137',
    previewUrl: 'https://preview-mr41.stoneforge.dev', previewStatus: 'failed',
    reviewAgentStatus: 'changes_requested', reviewAgentName: 'Agent Zeta', reviewAgentSessionId: 's7',
    mergeStrategy: 'squash', autoMergeEnabled: false, hasConflicts: true,
    mergeGates: [
      { label: 'CI checks pass', passed: false, required: true },
      { label: 'At least 1 approval', passed: false, required: true },
      { label: 'No merge conflicts', passed: false, required: true },
    ],
    labels: ['bug', 'terminal'],
  },
  {
    id: 'MR-40', title: 'refactor: Agent pool connection management', description: 'Refactored the agent pool to use a connection manager pattern with automatic health checks and reconnection.', branch: 'refactor/agent-pool', targetBranch: 'main', author: 'Agent Alpha', status: 'merged', isDraft: false, ciStatus: 'pass',
    reviewers: [
      { name: currentUser.name, avatar: currentUser.avatar, state: 'approved', reviewedAt: '1 day ago' },
    ],
    additions: 432, deletions: 189, filesChanged: 11, createdAt: '1 day ago',
    createdByAgent: 'Agent Alpha', agentSessionId: 'dir-1', linkedTaskId: 'SF-136',
    reviewAgentStatus: 'approved', reviewAgentName: 'Agent Zeta', reviewAgentSessionId: 's7',
    mergeStrategy: 'squash', autoMergeEnabled: false, hasConflicts: false,
    mergeGates: [
      { label: 'CI checks pass', passed: true, required: true },
      { label: 'At least 1 approval', passed: true, required: true },
      { label: 'No merge conflicts', passed: true, required: true },
    ],
    labels: ['agents', 'refactor'],
  },
  {
    id: 'MR-39', title: 'feat: Rate limit banner with wake timer', description: 'Adds a banner that appears when API rate limits are hit, showing a countdown timer until the limit resets.', branch: 'feat/rate-limit-banner', targetBranch: 'main', author: 'Agent Beta', status: 'merged', isDraft: false, ciStatus: 'pass',
    reviewers: [
      { name: currentUser.name, avatar: currentUser.avatar, state: 'approved', reviewedAt: '2 days ago' },
    ],
    additions: 156, deletions: 0, filesChanged: 4, createdAt: '2 days ago',
    createdByAgent: 'Agent Beta', agentSessionId: 'dir-2', linkedTaskId: 'SF-134',
    reviewAgentStatus: 'approved', reviewAgentName: 'Agent Zeta', reviewAgentSessionId: 's7',
    mergeStrategy: 'merge', autoMergeEnabled: false, hasConflicts: false,
    mergeGates: [
      { label: 'CI checks pass', passed: true, required: true },
      { label: 'At least 1 approval', passed: true, required: true },
      { label: 'No merge conflicts', passed: true, required: true },
    ],
    labels: ['ui'],
  },
]

// ── MR Timelines ──
export const mockMRTimelines: Record<string, MRTimelineEvent[]> = {
  'MR-42': [
    { id: 'ev-1', type: 'agent_activity', author: 'Agent Beta', avatar: 'DB', createdAt: '15 min ago', agentActivity: { action: 'opened this merge request', sessionId: 'dir-2' } },
    { id: 'ev-2', type: 'commit_push', author: 'Agent Beta', avatar: 'DB', createdAt: '14 min ago', commitCiStatus: 'pass', commitCiRunId: 'chk-1', commits: [
      { sha: 'a1b2c3d4e5f6', shortSha: 'a1b2c3d', message: 'feat: add WebSocket reconnect manager' },
      { sha: 'b2c3d4e5f6a7', shortSha: 'b2c3d4e', message: 'feat: implement exponential backoff with jitter' },
      { sha: 'c3d4e5f6a7b8', shortSha: 'c3d4e5f', message: 'test: add reconnection integration tests' },
    ]},
    { id: 'ev-5', type: 'agent_review', author: 'Agent Zeta', avatar: 'AZ', createdAt: '11 min ago', agentReview: {
      state: 'changes_requested',
      summary: 'The reconnection logic looks solid overall. Two issues need addressing: the backoff multiplier should be configurable, and the max retry count needs a bound to prevent infinite reconnection attempts in permanently-down scenarios.',
      comments: [
        { file: 'packages/smithy/src/ws/reconnect.ts', line: 24, content: 'The backoff multiplier is hardcoded to 1.5. Consider making this configurable via the WebSocket options.', suggestion: 'constructor(options: WSOptions = {}) {\n  this.backoffMultiplier = options.backoffMultiplier ?? 1.5\n  this.maxRetries = options.maxRetries ?? 10\n}' },
        { file: 'packages/smithy/src/ws/reconnect.ts', line: 47, content: 'No upper bound on retry attempts. This could cause infinite reconnection loops if the server is permanently down.' },
      ],
    }},
    { id: 'ev-6', type: 'agent_activity', author: 'Agent Beta', avatar: 'DB', createdAt: '9 min ago', agentActivity: { action: 'pushed 1 commit addressing review feedback', sessionId: 'dir-2', details: 'Added configurable backoff multiplier and max retry bound' } },
    { id: 'ev-7', type: 'commit_push', author: 'Agent Beta', avatar: 'DB', createdAt: '9 min ago', commitCiStatus: 'pass', commitCiRunId: 'chk-1', commits: [
      { sha: 'd4e5f6a7b8c9', shortSha: 'd4e5f6a', message: 'fix: add configurable backoff and max retries' },
    ]},
    { id: 'ev-8', type: 'agent_review', author: 'Agent Zeta', avatar: 'AZ', createdAt: '8 min ago', agentReview: {
      state: 'approved',
      summary: 'Changes look great. The configurable backoff and retry bound address the previous concerns. LGTM.',
    }},
    { id: 'ev-9', type: 'comment', author: currentUser.name, avatar: currentUser.avatar, createdAt: '6 min ago', comment: { content: 'Nice work on the jitter implementation. Can we also add a connection status callback so the UI can show reconnection state?', file: 'packages/smithy/src/ws/reconnect.ts', line: 18 } },
    { id: 'ev-10', type: 'comment', author: 'Agent Beta', avatar: 'DB', createdAt: '5 min ago', comment: { content: 'Good point. I\'ll add an onStatusChange callback in the next commit.', file: 'packages/smithy/src/ws/reconnect.ts', line: 18 } },
    { id: 'ev-11', type: 'review', author: currentUser.name, avatar: currentUser.avatar, createdAt: '5 min ago', review: { state: 'approved', body: 'Looks good. The reconnection strategy is solid and the tests cover the key edge cases.' } },
  ],
  'MR-41': [
    { id: 'ev-20', type: 'agent_activity', author: 'Agent Beta', avatar: 'DB', createdAt: '1 hr ago', agentActivity: { action: 'opened this merge request', sessionId: 'dir-2' } },
    { id: 'ev-21', type: 'commit_push', author: 'Agent Beta', avatar: 'DB', createdAt: '1 hr ago', commitCiStatus: 'fail', commitCiRunId: 'chk-5', commits: [
      { sha: 'e5f6a7b8c9d0', shortSha: 'e5f6a7b', message: 'fix: propagate resize events to PTY subprocess' },
    ]},
    { id: 'ev-23', type: 'agent_review', author: 'Agent Zeta', avatar: 'AZ', createdAt: '50 min ago', agentReview: {
      state: 'changes_requested',
      summary: 'The resize propagation approach is correct, but the test is failing because the mock PTY doesn\'t implement the resize method. The fix also needs to handle the edge case where cols/rows are zero.',
      comments: [
        { file: 'src/terminal/resize.ts', line: 42, content: 'Missing null check — if cols or rows is 0, this will cause the PTY to crash.', suggestion: 'if (cols > 0 && rows > 0) {\n  this.pty.resize(cols, rows)\n}' },
      ],
    }},
    { id: 'ev-24', type: 'review', author: currentUser.name, avatar: currentUser.avatar, createdAt: '45 min ago', review: {
      state: 'changes_requested',
      body: 'Agree with the Merge Steward — the zero-dimension guard is needed. Also, we should debounce the resize events to avoid spamming the PTY.',
      comments: [
        { file: 'src/terminal/resize.ts', line: 38, content: 'Consider debouncing resize events (100ms) to avoid excessive PTY calls during continuous drag resizing.' },
      ],
    }},
  ],
  'MR-40': [
    { id: 'ev-30', type: 'agent_activity', author: 'Agent Alpha', avatar: 'DA', createdAt: '1 day ago', agentActivity: { action: 'opened this merge request', sessionId: 'dir-1' } },
    { id: 'ev-31', type: 'commit_push', author: 'Agent Alpha', avatar: 'DA', createdAt: '1 day ago', commitCiStatus: 'pass', commitCiRunId: 'chk-7', commits: [
      { sha: 'f6a7b8c9d0e1', shortSha: 'f6a7b8c', message: 'refactor: extract ConnectionManager from AgentPool' },
      { sha: 'a7b8c9d0e1f2', shortSha: 'a7b8c9d', message: 'refactor: add health check heartbeat to connections' },
      { sha: 'b8c9d0e1f2a3', shortSha: 'b8c9d0e', message: 'test: add connection manager unit tests' },
      { sha: 'c9d0e1f2a3b4', shortSha: 'c9d0e1f', message: 'refactor: cleanup old pool code' },
    ]},
    { id: 'ev-33', type: 'agent_review', author: 'Agent Zeta', avatar: 'AZ', createdAt: '22 hr ago', agentReview: { state: 'approved', summary: 'Clean refactoring. The ConnectionManager pattern is well-structured and the health check implementation is robust. No concerns.' } },
    { id: 'ev-34', type: 'review', author: currentUser.name, avatar: currentUser.avatar, createdAt: '20 hr ago', review: { state: 'approved', body: 'Great refactor. The health check heartbeat is a nice addition.' } },
    { id: 'ev-35', type: 'status_change', author: currentUser.name, avatar: currentUser.avatar, createdAt: '20 hr ago', statusChange: { from: 'open', to: 'merged' } },
  ],
  'MR-43': [
    { id: 'ev-40', type: 'agent_activity', author: 'Agent Alpha', avatar: 'DA', createdAt: '5 min ago', agentActivity: { action: 'opened this merge request as draft', sessionId: 'dir-1' } },
  ],
  'MR-39': [
    { id: 'ev-50', type: 'agent_activity', author: 'Agent Beta', avatar: 'DB', createdAt: '2 days ago', agentActivity: { action: 'opened this merge request', sessionId: 'dir-2' } },
    { id: 'ev-51', type: 'commit_push', author: 'Agent Beta', avatar: 'DB', createdAt: '2 days ago', commitCiStatus: 'pass', commitCiRunId: 'chk-10', commits: [
      { sha: 'd0e1f2a3b4c5', shortSha: 'd0e1f2a', message: 'feat: add rate limit detection and banner component' },
      { sha: 'e1f2a3b4c5d6', shortSha: 'e1f2a3b', message: 'feat: implement countdown timer until limit reset' },
    ]},
    { id: 'ev-53', type: 'agent_review', author: 'Agent Zeta', avatar: 'AZ', createdAt: '2 days ago', agentReview: { state: 'approved', summary: 'Simple and clean implementation. The countdown timer logic is correct.' } },
    { id: 'ev-54', type: 'review', author: currentUser.name, avatar: currentUser.avatar, createdAt: '2 days ago', review: { state: 'approved', body: 'Ship it.' } },
    { id: 'ev-55', type: 'status_change', author: currentUser.name, avatar: currentUser.avatar, createdAt: '2 days ago', statusChange: { from: 'open', to: 'merged' } },
  ],
}

// ── MR Commits ──
export const mockMRCommits: Record<string, MRCommit[]> = {
  'MR-42': [
    { sha: 'a1b2c3d4e5f6', shortSha: 'a1b2c3d', message: 'feat: add WebSocket reconnect manager', author: 'Agent Beta', avatar: 'DB', createdAt: '14 min ago', additions: 120, deletions: 0, filesChanged: 3 },
    { sha: 'b2c3d4e5f6a7', shortSha: 'b2c3d4e', message: 'feat: implement exponential backoff with jitter', author: 'Agent Beta', avatar: 'DB', createdAt: '13 min ago', additions: 85, deletions: 12, filesChanged: 2 },
    { sha: 'c3d4e5f6a7b8', shortSha: 'c3d4e5f', message: 'test: add reconnection integration tests', author: 'Agent Beta', avatar: 'DB', createdAt: '12 min ago', additions: 30, deletions: 0, filesChanged: 1 },
    { sha: 'd4e5f6a7b8c9', shortSha: 'd4e5f6a', message: 'fix: add configurable backoff and max retries', author: 'Agent Beta', avatar: 'DB', createdAt: '9 min ago', additions: 10, deletions: 20, filesChanged: 1 },
  ],
  'MR-41': [
    { sha: 'e5f6a7b8c9d0', shortSha: 'e5f6a7b', message: 'fix: propagate resize events to PTY subprocess', author: 'Agent Beta', avatar: 'DB', createdAt: '1 hr ago', additions: 18, deletions: 5, filesChanged: 2 },
  ],
  'MR-40': [
    { sha: 'f6a7b8c9d0e1', shortSha: 'f6a7b8c', message: 'refactor: extract ConnectionManager from AgentPool', author: 'Agent Alpha', avatar: 'DA', createdAt: '1 day ago', additions: 210, deletions: 145, filesChanged: 5 },
    { sha: 'a7b8c9d0e1f2', shortSha: 'a7b8c9d', message: 'refactor: add health check heartbeat to connections', author: 'Agent Alpha', avatar: 'DA', createdAt: '1 day ago', additions: 95, deletions: 12, filesChanged: 3 },
    { sha: 'b8c9d0e1f2a3', shortSha: 'b8c9d0e', message: 'test: add connection manager unit tests', author: 'Agent Alpha', avatar: 'DA', createdAt: '1 day ago', additions: 87, deletions: 0, filesChanged: 2 },
    { sha: 'c9d0e1f2a3b4', shortSha: 'c9d0e1f', message: 'refactor: cleanup old pool code', author: 'Agent Alpha', avatar: 'DA', createdAt: '1 day ago', additions: 40, deletions: 32, filesChanged: 4 },
  ],
  'MR-39': [
    { sha: 'd0e1f2a3b4c5', shortSha: 'd0e1f2a', message: 'feat: add rate limit detection and banner component', author: 'Agent Beta', avatar: 'DB', createdAt: '2 days ago', additions: 98, deletions: 0, filesChanged: 3 },
    { sha: 'e1f2a3b4c5d6', shortSha: 'e1f2a3b', message: 'feat: implement countdown timer until limit reset', author: 'Agent Beta', avatar: 'DB', createdAt: '2 days ago', additions: 58, deletions: 0, filesChanged: 2 },
  ],
  'MR-43': [],
}

// ── MR Checks ──
export const mockMRChecks: Record<string, MRCheck[]> = {
  'MR-42': [
    { id: 'chk-1', name: 'CI', status: 'success', duration: '9m 39s', required: true, jobs: [
      { id: 'job-1a', name: 'Build & Test', status: 'success', duration: '3m 42s', logs: ['▶ Starting Build & Test pipeline...', '⚡ Checking out fix/ws-reconnect @ d4e5f6a', '📦 Installing dependencies...', '   Done in 4.2s', '🔨 Building packages...', '   All packages built in 11.2s', '🧪 Running tests...', '   ✓ src/ws/reconnect.test.ts (8 tests)', '   ✓ src/ws/backoff.test.ts (5 tests)', '', '   Tests: 13 passed, 13 total', '   Time:  2m 38s', '', '✅ Pipeline passed'] },
      { id: 'job-1b', name: 'Lint & Typecheck', status: 'success', duration: '45s', logs: ['▶ Running lint & typecheck...', '   eslint: 0 errors, 0 warnings', '   tsc: 0 errors', '✅ All checks passed'] },
      { id: 'job-1c', name: 'E2E Tests', status: 'success', duration: '5m 12s', logs: ['▶ Starting E2E test suite...', '   ✓ WebSocket connect (2.1s)', '   ✓ WebSocket reconnect on drop (4.3s)', '   ✓ Backoff timing (1.2s)', '   ✓ Max retry limit (3.1s)', '', '   4 tests passed', '✅ E2E suite passed'] },
    ]},
    { id: 'chk-4', name: 'Deploy Preview', status: 'success', duration: '2m 10s', required: false, jobs: [
      { id: 'job-4a', name: 'Deploy Preview', status: 'success', duration: '2m 10s', logs: ['▶ Deploying preview...', '   Building for preview...', '   Uploading to CDN...', '   ✅ Preview deployed to https://preview-mr42.stoneforge.dev'] },
    ]},
  ],
  'MR-41': [
    { id: 'chk-5', name: 'CI', status: 'failure', duration: '1m 57s', required: true, jobs: [
      { id: 'job-5a', name: 'Build & Test', status: 'failure', duration: '1m 15s', logs: ['▶ Starting Build & Test pipeline...', '⚡ Checking out fix/pty-resize @ e5f6a7b', '📦 Installing dependencies...', '   Done in 3.8s', '🔨 Building packages...', '   All packages built in 12.4s', '🧪 Running tests...', '', '   ✓ src/terminal/pty.test.ts (4 tests)', '   ✗ src/terminal/resize.test.ts', '     FAIL resize event propagation', '       Expected: { cols: 120, rows: 40 }', '       Received: { cols: 80, rows: 24 }', '', '   Tests: 1 failed, 4 passed, 5 total', '', '❌ Pipeline failed — 1 test failure'] },
      { id: 'job-5b', name: 'Lint & Typecheck', status: 'success', duration: '42s' },
    ]},
  ],
  'MR-40': [
    { id: 'chk-7', name: 'CI', status: 'success', duration: '11m 23s', required: true, jobs: [
      { id: 'job-7a', name: 'Build & Test', status: 'success', duration: '4m 05s' },
      { id: 'job-7b', name: 'Lint & Typecheck', status: 'success', duration: '48s' },
      { id: 'job-7c', name: 'E2E Tests', status: 'success', duration: '6m 30s' },
    ]},
  ],
  'MR-39': [
    { id: 'chk-10', name: 'CI', status: 'success', duration: '3m 58s', required: true, jobs: [
      { id: 'job-10a', name: 'Build & Test', status: 'success', duration: '3m 18s' },
      { id: 'job-10b', name: 'Lint & Typecheck', status: 'success', duration: '40s' },
    ]},
  ],
  'MR-43': [
    { id: 'chk-12', name: 'CI', status: 'queued', required: true, jobs: [
      { id: 'job-12a', name: 'Build & Test', status: 'queued' },
      { id: 'job-12b', name: 'Lint & Typecheck', status: 'queued' },
    ]},
  ],
}

// ── MR Diff files (keyed by MR ID) ──
export const mockMRDiffFiles: Record<string, DiffFile[]> = {
  'MR-42': [
    {
      path: 'packages/smithy/src/ws/reconnect.ts', status: 'added', additions: 78, deletions: 0,
      hunks: [{ oldStart: 0, newStart: 1, lines: [
        { type: 'add', content: "import { EventEmitter } from 'events'" },
        { type: 'add', content: '' },
        { type: 'add', content: 'interface WSOptions {' },
        { type: 'add', content: '  backoffMultiplier?: number' },
        { type: 'add', content: '  maxRetries?: number' },
        { type: 'add', content: '  initialDelay?: number' },
        { type: 'add', content: '  onStatusChange?: (status: string) => void' },
        { type: 'add', content: '}' },
        { type: 'add', content: '' },
        { type: 'add', content: 'export class WebSocketReconnect extends EventEmitter {' },
        { type: 'add', content: '  private backoffMultiplier: number' },
        { type: 'add', content: '  private maxRetries: number' },
        { type: 'add', content: '  private retryCount = 0' },
        { type: 'add', content: '  private ws: WebSocket | null = null' },
        { type: 'add', content: '' },
        { type: 'add', content: '  constructor(private url: string, options: WSOptions = {}) {' },
        { type: 'add', content: '    super()' },
        { type: 'add', content: '    this.backoffMultiplier = options.backoffMultiplier ?? 1.5' },
        { type: 'add', content: '    this.maxRetries = options.maxRetries ?? 10' },
        { type: 'add', content: '  }' },
        { type: 'add', content: '' },
        { type: 'add', content: '  connect(): void {' },
        { type: 'add', content: '    this.ws = new WebSocket(this.url)' },
        { type: 'add', content: "    this.ws.onclose = () => this.scheduleReconnect()" },
        { type: 'add', content: '  }' },
        { type: 'add', content: '' },
        { type: 'add', content: '  private scheduleReconnect(): void {' },
        { type: 'add', content: '    if (this.retryCount >= this.maxRetries) {' },
        { type: 'add', content: "      this.emit('max_retries_reached')" },
        { type: 'add', content: '      return' },
        { type: 'add', content: '    }' },
        { type: 'add', content: '    const delay = Math.min(1000 * Math.pow(this.backoffMultiplier, this.retryCount), 30000)' },
        { type: 'add', content: '    const jitter = delay * (0.5 + Math.random() * 0.5)' },
        { type: 'add', content: '    this.retryCount++' },
        { type: 'add', content: '    setTimeout(() => this.connect(), jitter)' },
        { type: 'add', content: '  }' },
        { type: 'add', content: '}' },
      ]}],
    },
    {
      path: 'packages/smithy/src/ws/index.ts', status: 'modified', additions: 2, deletions: 1,
      hunks: [{ oldStart: 1, newStart: 1, lines: [
        { type: 'context', content: "export { createWSClient } from './client'" },
        { type: 'remove', content: "export type { WSConfig } from './types'" },
        { type: 'add', content: "export { WebSocketReconnect } from './reconnect'" },
        { type: 'add', content: "export type { WSConfig } from './types'" },
      ]}],
    },
    {
      path: 'packages/smithy/src/ws/reconnect.test.ts', status: 'added', additions: 45, deletions: 0,
      hunks: [{ oldStart: 0, newStart: 1, lines: [
        { type: 'add', content: "import { describe, it, expect, vi } from 'vitest'" },
        { type: 'add', content: "import { WebSocketReconnect } from './reconnect'" },
        { type: 'add', content: '' },
        { type: 'add', content: "describe('WebSocketReconnect', () => {" },
        { type: 'add', content: "  it('should connect on init', () => {" },
        { type: 'add', content: "    const ws = new WebSocketReconnect('ws://localhost:8080')" },
        { type: 'add', content: '    ws.connect()' },
        { type: 'add', content: '    expect(ws).toBeDefined()' },
        { type: 'add', content: '  })' },
        { type: 'add', content: '' },
        { type: 'add', content: "  it('should respect max retries', () => {" },
        { type: 'add', content: "    const ws = new WebSocketReconnect('ws://localhost:8080', { maxRetries: 3 })" },
        { type: 'add', content: "    const spy = vi.fn()" },
        { type: 'add', content: "    ws.on('max_retries_reached', spy)" },
        { type: 'add', content: '    // simulate reconnection attempts...' },
        { type: 'add', content: '  })' },
        { type: 'add', content: '})' },
      ]}],
    },
    {
      path: 'packages/smithy/src/ws/backoff.ts', status: 'added', additions: 28, deletions: 0,
      hunks: [{ oldStart: 0, newStart: 1, lines: [
        { type: 'add', content: 'export interface BackoffConfig {' },
        { type: 'add', content: '  multiplier: number' },
        { type: 'add', content: '  maxDelay: number' },
        { type: 'add', content: '  jitter: boolean' },
        { type: 'add', content: '}' },
        { type: 'add', content: '' },
        { type: 'add', content: 'export function calculateBackoff(attempt: number, config: BackoffConfig): number {' },
        { type: 'add', content: '  const delay = Math.min(1000 * Math.pow(config.multiplier, attempt), config.maxDelay)' },
        { type: 'add', content: '  return config.jitter ? delay * (0.5 + Math.random() * 0.5) : delay' },
        { type: 'add', content: '}' },
      ]}],
    },
    {
      path: 'packages/smithy/src/ws/client.ts', status: 'modified', additions: 12, deletions: 8,
      hunks: [{ oldStart: 15, newStart: 15, lines: [
        { type: 'context', content: 'export class WSClient {' },
        { type: 'context', content: '  private socket: WebSocket | null = null' },
        { type: 'remove', content: '  private reconnectTimer: number | null = null' },
        { type: 'add', content: '  private reconnectManager: WebSocketReconnect' },
        { type: 'context', content: '' },
        { type: 'context', content: '  constructor(private config: WSConfig) {' },
        { type: 'remove', content: '    this.url = config.url' },
        { type: 'add', content: '    this.reconnectManager = new WebSocketReconnect(config.url, {' },
        { type: 'add', content: '      backoffMultiplier: config.backoffMultiplier,' },
        { type: 'add', content: '      maxRetries: config.maxRetries,' },
        { type: 'add', content: '    })' },
        { type: 'context', content: '  }' },
      ]}],
    },
    {
      path: 'packages/smithy/src/ws/types.ts', status: 'modified', additions: 3, deletions: 0,
      hunks: [{ oldStart: 4, newStart: 4, lines: [
        { type: 'context', content: 'export interface WSConfig {' },
        { type: 'context', content: '  url: string' },
        { type: 'context', content: '  protocols?: string[]' },
        { type: 'add', content: '  backoffMultiplier?: number' },
        { type: 'add', content: '  maxRetries?: number' },
        { type: 'add', content: '  onStatusChange?: (status: string) => void' },
        { type: 'context', content: '}' },
      ]}],
    },
  ],
  'MR-41': [
    {
      path: 'src/terminal/resize.ts', status: 'modified', additions: 12, deletions: 5,
      hunks: [{ oldStart: 35, newStart: 35, lines: [
        { type: 'context', content: 'export class ResizeHandler {' },
        { type: 'context', content: '  private observer: ResizeObserver' },
        { type: 'context', content: '' },
        { type: 'remove', content: '  handleResize(entries: ResizeObserverEntry[]) {' },
        { type: 'remove', content: '    const { width, height } = entries[0].contentRect' },
        { type: 'remove', content: '    const cols = Math.floor(width / this.charWidth)' },
        { type: 'remove', content: '    const rows = Math.floor(height / this.charHeight)' },
        { type: 'remove', content: '    // TODO: propagate to PTY' },
        { type: 'add', content: '  handleResize(entries: ResizeObserverEntry[]): void {' },
        { type: 'add', content: '    const { width, height } = entries[0].contentRect' },
        { type: 'add', content: '    const cols = Math.floor(width / this.charWidth)' },
        { type: 'add', content: '    const rows = Math.floor(height / this.charHeight)' },
        { type: 'add', content: '    if (cols > 0 && rows > 0) {' },
        { type: 'add', content: '      this.pty.resize(cols, rows)' },
        { type: 'add', content: '    }' },
        { type: 'context', content: '  }' },
        { type: 'context', content: '}' },
      ]}],
    },
    {
      path: 'src/terminal/resize.test.ts', status: 'modified', additions: 6, deletions: 0,
      hunks: [{ oldStart: 12, newStart: 12, lines: [
        { type: 'context', content: "  it('propagates resize to PTY', () => {" },
        { type: 'context', content: '    handler.handleResize([mockEntry(120, 40)])' },
        { type: 'context', content: '    expect(mockPty.resize).toHaveBeenCalledWith(120, 40)' },
        { type: 'context', content: '  })' },
        { type: 'add', content: '' },
        { type: 'add', content: "  it('ignores zero dimensions', () => {" },
        { type: 'add', content: '    handler.handleResize([mockEntry(0, 0)])' },
        { type: 'add', content: '    expect(mockPty.resize).not.toHaveBeenCalled()' },
        { type: 'add', content: '  })' },
      ]}],
    },
    {
      path: 'src/terminal/pty.ts', status: 'modified', additions: 8, deletions: 3,
      hunks: [{ oldStart: 18, newStart: 18, lines: [
        { type: 'context', content: 'export class PTYProcess {' },
        { type: 'context', content: '  private process: ChildProcess' },
        { type: 'remove', content: '  private cols = 80' },
        { type: 'remove', content: '  private rows = 24' },
        { type: 'add', content: '  private cols: number' },
        { type: 'add', content: '  private rows: number' },
        { type: 'context', content: '' },
        { type: 'remove', content: '  resize(cols: number, rows: number) {' },
        { type: 'add', content: '  resize(cols: number, rows: number): void {' },
        { type: 'add', content: '    if (cols <= 0 || rows <= 0) return' },
        { type: 'context', content: '    this.cols = cols' },
        { type: 'context', content: '    this.rows = rows' },
        { type: 'add', content: "    this.process.send({ type: 'resize', cols, rows })" },
        { type: 'context', content: '  }' },
      ]}],
    },
    {
      path: 'packages/smithy/src/ui/TerminalPanel.tsx', status: 'modified', additions: 10, deletions: 3,
      hunks: [{ oldStart: 42, newStart: 42, lines: [
        { type: 'context', content: '  useEffect(() => {' },
        { type: 'remove', content: '    const observer = new ResizeObserver(() => {})' },
        { type: 'add', content: '    const handler = new ResizeHandler(containerRef.current!, pty)' },
        { type: 'add', content: '    const observer = new ResizeObserver((entries) => {' },
        { type: 'add', content: '      handler.handleResize(entries)' },
        { type: 'add', content: '    })' },
        { type: 'context', content: '    observer.observe(containerRef.current!)' },
        { type: 'remove', content: '    return () => observer.disconnect()' },
        { type: 'remove', content: '  }, [])' },
        { type: 'add', content: '    return () => {' },
        { type: 'add', content: '      observer.disconnect()' },
        { type: 'add', content: '      handler.destroy()' },
        { type: 'add', content: '    }' },
        { type: 'add', content: '  }, [pty])' },
      ]}],
    },
    {
      path: 'vitest.config.ts', status: 'modified', additions: 6, deletions: 0,
      hunks: [{ oldStart: 8, newStart: 8, lines: [
        { type: 'context', content: "  test: {" },
        { type: 'context', content: "    globals: true," },
        { type: 'add', content: "    coverage: {" },
        { type: 'add', content: "      include: ['src/terminal/**']," },
        { type: 'add', content: "      reporter: ['text', 'lcov']," },
        { type: 'add', content: "    }," },
        { type: 'context', content: '  },' },
        { type: 'context', content: '})' },
      ]}],
    },
  ],
  'MR-40': [], // populated after mockDiffFiles definition
  'MR-39': [
    {
      path: 'packages/smithy/src/ui/RateLimitBanner.tsx', status: 'added', additions: 56, deletions: 0,
      hunks: [{ oldStart: 0, newStart: 1, lines: [
        { type: 'add', content: "import { useState, useEffect } from 'react'" },
        { type: 'add', content: '' },
        { type: 'add', content: 'interface Props {' },
        { type: 'add', content: '  resetAt: number' },
        { type: 'add', content: '  onDismiss: () => void' },
        { type: 'add', content: '}' },
        { type: 'add', content: '' },
        { type: 'add', content: 'export function RateLimitBanner({ resetAt, onDismiss }: Props) {' },
        { type: 'add', content: '  const [remaining, setRemaining] = useState(resetAt - Date.now())' },
        { type: 'add', content: '' },
        { type: 'add', content: '  useEffect(() => {' },
        { type: 'add', content: '    const timer = setInterval(() => {' },
        { type: 'add', content: '      const r = resetAt - Date.now()' },
        { type: 'add', content: '      if (r <= 0) { onDismiss(); return }' },
        { type: 'add', content: '      setRemaining(r)' },
        { type: 'add', content: '    }, 1000)' },
        { type: 'add', content: '    return () => clearInterval(timer)' },
        { type: 'add', content: '  }, [resetAt, onDismiss])' },
        { type: 'add', content: '' },
        { type: 'add', content: '  const seconds = Math.ceil(remaining / 1000)' },
        { type: 'add', content: '  return <div className="rate-limit-banner">Resets in {seconds}s</div>' },
        { type: 'add', content: '}' },
      ]}],
    },
  ],
  'MR-43': [],
}

// ── CI Workflow mock data ──
import type { CIAction, CIRun } from './components/overlays/ci/ci-types'

export const mockCIActions: CIAction[] = [
  {
    id: 'wf-ci', name: 'CI', fileName: 'ci.yml', path: '.github/workflows/ci.yml',
    dispatchInputs: [
      { name: 'ref', description: 'Branch or tag to run against', type: 'string', required: false, default: 'main' },
      { name: 'skip_e2e', description: 'Skip E2E test suite', type: 'boolean', required: false, default: 'false' },
    ],
  },
  { id: 'wf-deploy', name: 'Deploy', fileName: 'deploy.yml', path: '.github/workflows/deploy.yml' },
  {
    id: 'wf-nightly', name: 'Nightly E2E', fileName: 'nightly.yml', path: '.github/workflows/nightly.yml',
    dispatchInputs: [
      { name: 'browser', description: 'Browser to test', type: 'choice', required: true, default: 'chromium', options: ['chromium', 'firefox', 'webkit'] },
    ],
  },
]

export const mockCIRuns: CIRun[] = [
  // ── Running: CI #142 ──
  {
    id: 'run-142', runNumber: 142,
    action: mockCIActions[0],
    status: 'running', event: 'push',
    branch: 'feat/oauth-pkce', commit: 'a3f2c1d', commitMessage: 'feat: implement OAuth2 PKCE flow',
    actor: 'Agent Alpha', actorAvatar: 'DA',
    actorUserId: 'user-adam',
    createdAt: '2 min ago',
    triggeredByAgent: 'Agent Alpha', triggeredByAgentId: 'agent-1',
    linkedTaskId: 'SF-142',
    jobs: [
      {
        id: 'j-142-1', name: 'Build', status: 'success', duration: '1m 12s', runnerName: 'ubuntu-latest',
        dependsOn: [],
        steps: [
          { id: 's-1', name: 'Checkout', status: 'success', duration: '2s', logs: ['⚡ Checking out feat/oauth-pkce @ a3f2c1d', '   Done'] },
          { id: 's-2', name: 'Install dependencies', status: 'success', duration: '18s', logs: ['📦 pnpm install --frozen-lockfile', '   Packages: +0 -0 (already up to date)', '   Done in 18s'] },
          { id: 's-3', name: 'Build packages', status: 'success', duration: '52s', logs: ['🔨 turbo run build', '   @stoneforge/core: build succeeded in 8.3s', '   @stoneforge/storage: build succeeded in 3.1s', '   @stoneforge/smithy: build succeeded in 11.2s', '   3 packages built in 52s'] },
        ],
      },
      {
        id: 'j-142-2', name: 'Lint & Typecheck', status: 'success', duration: '45s', runnerName: 'ubuntu-latest',
        dependsOn: ['j-142-1'],
        steps: [
          { id: 's-4', name: 'Run ESLint', status: 'success', duration: '22s', logs: ['▶ eslint . --max-warnings=0', '   No warnings or errors found'] },
          { id: 's-5', name: 'Run tsc', status: 'success', duration: '23s', logs: ['▶ tsc --noEmit', '   Found 0 errors'] },
        ],
      },
      {
        id: 'j-142-3', name: 'Unit Tests', status: 'running', runnerName: 'ubuntu-latest',
        dependsOn: ['j-142-1'],
        steps: [
          { id: 's-6', name: 'Run vitest', status: 'running', logs: ['🧪 vitest run --reporter=verbose', '', '   ✓ src/auth/session.test.ts (6 tests) 0.8s', '   ✓ src/auth/pkce.test.ts (4 tests) 0.3s', '   ⏳ src/ws/client.test.ts...'] },
        ],
      },
      {
        id: 'j-142-4', name: 'E2E Tests', status: 'queued', runnerName: 'ubuntu-latest',
        dependsOn: ['j-142-2', 'j-142-3'],
        steps: [
          { id: 's-7', name: 'Install Playwright', status: 'queued' },
          { id: 's-8', name: 'Run E2E suite', status: 'queued' },
        ],
      },
      {
        id: 'j-142-5', name: 'Upload Coverage', status: 'queued', runnerName: 'ubuntu-latest',
        dependsOn: ['j-142-3'],
        steps: [
          { id: 's-9', name: 'Upload to Codecov', status: 'queued' },
        ],
      },
    ],
    annotations: [],
    artifacts: [],
  },

  // ── Queued: CI #143 ──
  {
    id: 'run-143', runNumber: 143,
    action: mockCIActions[0],
    status: 'queued', event: 'push',
    branch: 'feat/sqlite-wal', commit: 'e2d8a1f', commitMessage: 'feat: add WAL mode for SQLite connections',
    actor: 'Agent Alpha', actorAvatar: 'DA',
    actorUserId: 'user-adam',
    createdAt: '1 min ago',
    triggeredByAgent: 'Agent Alpha', triggeredByAgentId: 'agent-1',
    linkedTaskId: 'SF-145',
    jobs: [
      { id: 'j-143-1', name: 'Build', status: 'queued', dependsOn: [], steps: [{ id: 's-10', name: 'Checkout', status: 'queued' }, { id: 's-11', name: 'Install dependencies', status: 'queued' }, { id: 's-12', name: 'Build packages', status: 'queued' }], runnerName: 'ubuntu-latest' },
      { id: 'j-143-2', name: 'Lint & Typecheck', status: 'queued', dependsOn: ['j-143-1'], steps: [{ id: 's-13', name: 'Run ESLint', status: 'queued' }, { id: 's-14', name: 'Run tsc', status: 'queued' }], runnerName: 'ubuntu-latest' },
      { id: 'j-143-3', name: 'Unit Tests', status: 'queued', dependsOn: ['j-143-1'], steps: [{ id: 's-15', name: 'Run vitest', status: 'queued' }], runnerName: 'ubuntu-latest' },
      { id: 'j-143-4', name: 'E2E Tests', status: 'queued', dependsOn: ['j-143-2', 'j-143-3'], steps: [{ id: 's-16', name: 'Run E2E suite', status: 'queued' }], runnerName: 'ubuntu-latest' },
    ],
    annotations: [],
    artifacts: [],
  },

  // ── Success: CI #141 ──
  {
    id: 'run-141', runNumber: 141,
    action: mockCIActions[0],
    status: 'success', event: 'push',
    branch: 'fix/ws-reconnect', commit: 'b7e4f2a', commitMessage: 'fix: WebSocket reconnection with exponential backoff',
    actor: 'Agent Beta', actorAvatar: 'DB',
    actorUserId: 'user-sarah',
    createdAt: '18 min ago', duration: '9m 39s',
    triggeredByAgent: 'Agent Beta', triggeredByAgentId: 'agent-2',
    linkedTaskId: 'SF-139', linkedMRId: 'MR-42',
    jobs: [
      { id: 'j-141-1', name: 'Build', status: 'success', duration: '1m 5s', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-20', name: 'Checkout', status: 'success', duration: '2s', logs: ['⚡ Checking out fix/ws-reconnect @ b7e4f2a'] },
        { id: 's-21', name: 'Install dependencies', status: 'success', duration: '15s', logs: ['📦 pnpm install --frozen-lockfile', '   Done in 15s'] },
        { id: 's-22', name: 'Build packages', status: 'success', duration: '48s', logs: ['🔨 turbo run build', '   3 packages built in 48s'] },
      ]},
      { id: 'j-141-2', name: 'Lint & Typecheck', status: 'success', duration: '42s', dependsOn: ['j-141-1'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-23', name: 'Run ESLint', status: 'success', duration: '20s', logs: ['▶ eslint . --max-warnings=0', '   No warnings or errors found'] },
        { id: 's-24', name: 'Run tsc', status: 'success', duration: '22s', logs: ['▶ tsc --noEmit', '   Found 0 errors'] },
      ]},
      { id: 'j-141-3', name: 'Unit Tests', status: 'success', duration: '2m 38s', dependsOn: ['j-141-1'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-25', name: 'Run vitest', status: 'success', duration: '2m 38s', logs: ['🧪 vitest run --reporter=verbose', '', '   ✓ src/ws/client.test.ts (8 tests) 1.2s', '   ✓ src/ws/reconnect.test.ts (6 tests) 0.9s', '   ✓ src/auth/session.test.ts (6 tests) 0.8s', '', '   Tests: 20 passed, 20 total', '   Time: 2m 38s'] },
      ]},
      { id: 'j-141-4', name: 'E2E Tests', status: 'success', duration: '5m 14s', dependsOn: ['j-141-2', 'j-141-3'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-26', name: 'Install Playwright', status: 'success', duration: '32s', logs: ['📦 npx playwright install chromium'] },
        { id: 's-27', name: 'Run E2E suite', status: 'success', duration: '4m 42s', logs: ['🧪 playwright test', '', '   ✓ auth.spec.ts (3 tests)', '   ✓ workspace.spec.ts (5 tests)', '   ✓ terminal.spec.ts (4 tests)', '', '   12 tests passed'] },
      ]},
    ],
    annotations: [],
    artifacts: [
      { id: 'art-1', name: 'test-results', size: '2.4 MB' },
      { id: 'art-2', name: 'coverage-report', size: '856 KB' },
    ],
  },

  // ── Failure: CI #140 ──
  {
    id: 'run-140', runNumber: 140,
    action: mockCIActions[0],
    status: 'failure', event: 'pull_request',
    branch: 'fix/pty-resize', commit: 'c9d1e3b', commitMessage: 'fix: PTY resize event propagation',
    actor: 'Agent Beta', actorAvatar: 'DB',
    actorUserId: 'user-james',
    createdAt: '1 hr ago', duration: '1m 57s',
    triggeredByAgent: 'Agent Beta', triggeredByAgentId: 'agent-2',
    linkedTaskId: 'SF-137', linkedMRId: 'MR-41',
    jobs: [
      { id: 'j-140-1', name: 'Build', status: 'success', duration: '58s', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-30', name: 'Checkout', status: 'success', duration: '2s', logs: ['⚡ Checking out fix/pty-resize @ c9d1e3b'] },
        { id: 's-31', name: 'Install dependencies', status: 'success', duration: '12s', logs: ['📦 pnpm install --frozen-lockfile', '   Done in 12s'] },
        { id: 's-32', name: 'Build packages', status: 'success', duration: '44s', logs: ['🔨 turbo run build', '   All packages built in 44s'] },
      ]},
      { id: 'j-140-2', name: 'Lint & Typecheck', status: 'success', duration: '40s', dependsOn: ['j-140-1'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-33', name: 'Run ESLint', status: 'success', duration: '18s', logs: ['▶ eslint . --max-warnings=0', '   No warnings or errors found'] },
        { id: 's-34', name: 'Run tsc', status: 'success', duration: '22s', logs: ['▶ tsc --noEmit', '   Found 0 errors'] },
      ]},
      { id: 'j-140-3', name: 'Unit Tests', status: 'failure', duration: '1m 15s', dependsOn: ['j-140-1'], runnerName: 'ubuntu-latest',
        annotations: [
          { level: 'error', message: 'resize event propagation: Expected { cols: 120, rows: 40 } but received { cols: 80, rows: 24 }', file: 'src/terminal/resize.test.ts', line: 42, jobName: 'Unit Tests', stepName: 'Run vitest' },
        ],
        steps: [
        { id: 's-35', name: 'Run vitest', status: 'failure', duration: '1m 15s', logs: [
          '🧪 vitest run --reporter=verbose',
          '',
          '   ✓ src/terminal/pty.test.ts (4 tests) 0.6s',
          '   ✗ src/terminal/resize.test.ts',
          '     FAIL resize event propagation',
          '       Expected: { cols: 120, rows: 40 }',
          '       Received: { cols: 80, rows: 24 }',
          '       at ResizeHandler.propagate (src/terminal/resize.ts:42)',
          '',
          '   Tests: 1 failed, 4 passed, 5 total',
          '   Time:  1m 15s',
          '',
          '❌ Pipeline failed — 1 test failure',
        ]},
      ]},
      { id: 'j-140-4', name: 'E2E Tests', status: 'skipped', dependsOn: ['j-140-2', 'j-140-3'], runnerName: 'ubuntu-latest', steps: [] },
    ],
    annotations: [
      { level: 'error', message: 'resize event propagation: Expected { cols: 120, rows: 40 } but received { cols: 80, rows: 24 }', file: 'src/terminal/resize.test.ts', line: 42, jobName: 'Unit Tests', stepName: 'Run vitest' },
      { level: 'warning', message: 'Deprecated API usage: ResizeObserver.disconnect() called without active observation', file: 'src/terminal/resize.ts', line: 67, jobName: 'Unit Tests' },
    ],
    artifacts: [],
  },

  // ── Cancelled: CI #138 ──
  {
    id: 'run-138', runNumber: 138,
    action: mockCIActions[0],
    status: 'cancelled', event: 'push',
    branch: 'feat/old-branch', commit: 'f1a2b3c', commitMessage: 'wip: experiment with new config format',
    actor: currentUser.name, actorAvatar: currentUser.avatar,
    actorUserId: currentUser.id,
    createdAt: '3 hrs ago', duration: '28s',
    linkedTaskId: 'SF-133', linkedMRId: 'MR-38',
    jobs: [
      { id: 'j-138-1', name: 'Build', status: 'cancelled', duration: '28s', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-40', name: 'Checkout', status: 'success', duration: '2s', logs: ['⚡ Checking out feat/old-branch @ f1a2b3c'] },
        { id: 's-41', name: 'Install dependencies', status: 'success', duration: '14s', logs: ['📦 pnpm install --frozen-lockfile', '   Done in 14s'] },
        { id: 's-42', name: 'Build packages', status: 'cancelled', duration: '12s', logs: ['🔨 turbo run build', '   @stoneforge/core: building...', '   ⚠ Cancelled by user'] },
      ]},
      { id: 'j-138-2', name: 'Lint & Typecheck', status: 'cancelled', dependsOn: ['j-138-1'], runnerName: 'ubuntu-latest', steps: [] },
      { id: 'j-138-3', name: 'Unit Tests', status: 'cancelled', dependsOn: ['j-138-1'], runnerName: 'ubuntu-latest', steps: [] },
    ],
    annotations: [],
    artifacts: [],
  },

  // ── Success: Deploy #27 ──
  {
    id: 'run-d27', runNumber: 27,
    action: mockCIActions[1],
    status: 'success', event: 'push',
    branch: 'fix/ws-reconnect', commit: 'b7e4f2a', commitMessage: 'fix: WebSocket reconnection with exponential backoff',
    actor: 'Agent Beta', actorAvatar: 'DB',
    actorUserId: 'user-sarah',
    createdAt: '15 min ago', duration: '2m 10s',
    triggeredByAgent: 'Agent Beta', triggeredByAgentId: 'agent-2',
    linkedTaskId: 'SF-139', linkedMRId: 'MR-42',
    approvalGates: { requiredApprovals: 2, approvedBy: ['user-sarah'], pending: true },
    jobs: [
      { id: 'j-d27-1', name: 'Build & Deploy', status: 'success', duration: '2m 10s', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-50', name: 'Checkout', status: 'success', duration: '2s', logs: ['⚡ Checking out fix/ws-reconnect @ b7e4f2a'] },
        { id: 's-51', name: 'Build', status: 'success', duration: '52s', logs: ['🔨 Building for production...', '   Output: dist/ (4.2 MB)'] },
        { id: 's-52', name: 'Deploy to preview', status: 'success', duration: '1m 16s', logs: ['🚀 Deploying to preview environment...', '   URL: https://preview-ws-reconnect.stoneforge.dev', '   ✅ Deployment successful'] },
      ]},
    ],
    annotations: [],
    artifacts: [{ id: 'art-3', name: 'dist', size: '4.2 MB' }],
  },

  // ── Running: Nightly E2E #89 ──
  {
    id: 'run-n89', runNumber: 89,
    action: mockCIActions[2],
    status: 'running', event: 'schedule',
    branch: 'main', commit: 'd4e5f6a', commitMessage: 'chore: merge fix/ws-reconnect into main',
    actor: 'System', actorAvatar: 'SY',
    createdAt: '5 min ago',
    linkedTaskId: 'SF-100',
    triggeredByWorkflowId: 'wf-3', triggeredByWorkflowName: 'Run E2E on merge to main', triggeredByWorkflowRunId: 'wr-6',
    jobs: [
      { id: 'j-n89-1', name: 'E2E — Chromium', status: 'success', duration: '6m 12s', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-60', name: 'Install Playwright', status: 'success', duration: '28s', logs: ['📦 npx playwright install chromium'] },
        { id: 's-61', name: 'Run E2E suite', status: 'success', duration: '5m 44s', logs: ['🧪 playwright test --project=chromium', '', '   ✓ 24 tests passed', '   Time: 5m 44s'] },
      ]},
      { id: 'j-n89-2', name: 'E2E — Firefox', status: 'running', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-62', name: 'Install Playwright', status: 'success', duration: '35s', logs: ['📦 npx playwright install firefox'] },
        { id: 's-63', name: 'Run E2E suite', status: 'running', logs: ['🧪 playwright test --project=firefox', '', '   ✓ 18/24 tests...'] },
      ]},
      { id: 'j-n89-3', name: 'E2E — WebKit', status: 'queued', dependsOn: [], runnerName: 'macos-latest', steps: [
        { id: 's-64', name: 'Install Playwright', status: 'queued' },
        { id: 's-65', name: 'Run E2E suite', status: 'queued' },
      ]},
    ],
    annotations: [],
    artifacts: [],
  },

  // ── Success: CI #137 (manual trigger) ──
  {
    id: 'run-137', runNumber: 137,
    action: mockCIActions[0],
    status: 'success', event: 'manual',
    branch: 'main', commit: '9a8b7c6', commitMessage: 'chore: release v0.12.0',
    actor: currentUser.name, actorAvatar: currentUser.avatar,
    actorUserId: currentUser.id,
    createdAt: '2 hrs ago', duration: '8m 55s',
    jobs: [
      { id: 'j-137-1', name: 'Build', status: 'success', duration: '1m 2s', dependsOn: [], runnerName: 'ubuntu-latest', steps: [
        { id: 's-70', name: 'Checkout', status: 'success', duration: '2s' },
        { id: 's-71', name: 'Install dependencies', status: 'success', duration: '16s' },
        { id: 's-72', name: 'Build packages', status: 'success', duration: '44s' },
      ]},
      { id: 'j-137-2', name: 'Lint & Typecheck', status: 'success', duration: '38s', dependsOn: ['j-137-1'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-73', name: 'Run ESLint', status: 'success', duration: '18s' },
        { id: 's-74', name: 'Run tsc', status: 'success', duration: '20s' },
      ]},
      { id: 'j-137-3', name: 'Unit Tests', status: 'success', duration: '2m 31s', dependsOn: ['j-137-1'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-75', name: 'Run vitest', status: 'success', duration: '2m 31s' },
      ]},
      { id: 'j-137-4', name: 'E2E Tests', status: 'success', duration: '4m 44s', dependsOn: ['j-137-2', 'j-137-3'], runnerName: 'ubuntu-latest', steps: [
        { id: 's-76', name: 'Install Playwright', status: 'success', duration: '30s' },
        { id: 's-77', name: 'Run E2E suite', status: 'success', duration: '4m 14s' },
      ]},
    ],
    annotations: [],
    artifacts: [
      { id: 'art-4', name: 'release-bundle', size: '12.1 MB' },
    ],
  },
]

// ── Workflow mock data (types in components/overlays/automations/wf-types.ts) ──
import type { Workflow, WFRun } from './components/overlays/automations/wf-types'
export type { Workflow, WFRun }

export const mockWorkflows: Workflow[] = [
  {
    id: 'wf-1', name: 'Daily standup summary', description: 'Fetches active PRs, summarizes them with AI, and posts to Slack every weekday morning.',
    status: 'active',
    steps: [
      { id: 's1', name: 'Fetch open PRs', type: 'script', runtime: 'nodejs', code: "const prs = await octokit.pulls.list({\n  owner: vars.org,\n  repo: vars.repo,\n  state: 'open'\n});\nreturn prs.data.map(p => ({\n  title: p.title,\n  author: p.user.login,\n  url: p.html_url\n}));", retryCount: 2, retryDelaySeconds: 30, timeoutSeconds: 60 },
      { id: 's2', name: 'Summarize for standup', type: 'agent', roleDefinitionId: 'rd-implementer', requiredAgentTags: ['fast'], tools: ['github'], retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 120 },
      { id: 's3', name: 'Post to Slack', type: 'script', runtime: 'nodejs', code: "await slack.chat.postMessage({\n  channel: vars.channel,\n  text: steps.s2.output,\n  unfurl_links: false\n});", retryCount: 3, retryDelaySeconds: 60, timeoutSeconds: 30 },
    ],
    trigger: { type: 'cron', cronExpression: '0 9 * * 1-5', cronHumanReadable: '9:00 AM weekdays' },
    variables: [
      { name: 'channel', type: 'string', default: '#engineering', description: 'Slack channel to post to', required: true },
      { name: 'format', type: 'enum', default: 'brief', description: 'Summary format', required: true, options: ['brief', 'detailed'] },
      { name: 'org', type: 'string', default: 'toolco', description: 'GitHub org', required: true },
      { name: 'repo', type: 'string', default: 'stoneforge', description: 'GitHub repo', required: true },
    ],
    totalRuns: 47, lastRunAt: '8 hrs ago', lastRunStatus: 'success', nextRunAt: 'Tomorrow 9:00 AM',
    createdAt: '2 months ago', updatedAt: '1 week ago', createdBy: currentUser.name, tags: ['daily', 'slack', 'standup'],
    createdByUserId: currentUser.id, scope: 'team',
  },
  {
    id: 'wf-2', name: 'Auto-assign reviewer on PR', description: 'When a PR is created, analyzes the changed files and assigns the most relevant reviewer.',
    status: 'active',
    steps: [
      { id: 's1', name: 'Get PR details', type: 'script', runtime: 'nodejs', code: "const pr = await octokit.pulls.get({\n  owner: event.repo.owner,\n  repo: event.repo.name,\n  pull_number: event.number\n});\nreturn { pr: pr.data, files: files.data };", retryCount: 1, retryDelaySeconds: 5, timeoutSeconds: 30 },
      { id: 's2', name: 'Select and assign reviewer', type: 'agent', roleDefinitionId: 'rd-reviewer', tools: ['github'], retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 90 },
    ],
    trigger: { type: 'event', eventType: 'pr_created' },
    variables: [
      { name: 'team_members', type: 'string', default: 'alice, bob, charlie', description: 'Comma-separated team members', required: true },
    ],
    totalRuns: 156, lastRunAt: '15 min ago', lastRunStatus: 'success',
    createdAt: '3 months ago', updatedAt: '2 weeks ago', createdBy: currentUser.name, tags: ['pr', 'review'],
    createdByUserId: currentUser.id, scope: 'team',
  },
  {
    id: 'wf-3', name: 'Run E2E on merge to main', description: 'Triggers full E2E test suite when code is merged to main and reports results. E2E tests and lint run in parallel after install.',
    status: 'active',
    steps: [
      { id: 's1', name: 'Checkout & install', type: 'script', runtime: 'shell', code: 'git clone --depth 1 $REPO_URL /tmp/e2e-run\ncd /tmp/e2e-run\ngit checkout $COMMIT_SHA\npnpm install --frozen-lockfile', retryCount: 2, retryDelaySeconds: 10, timeoutSeconds: 300 },
      { id: 's2', name: 'Run E2E tests', type: 'script', runtime: 'shell', code: 'cd /tmp/e2e-run\npnpm exec playwright test --reporter=json > /tmp/e2e-results.json\nexit $?', dependsOn: ['s1'], retryCount: 0, retryDelaySeconds: 0, timeoutSeconds: 600 },
      { id: 's3', name: 'Run lint & typecheck', type: 'script', runtime: 'shell', code: 'cd /tmp/e2e-run\npnpm run lint && pnpm run typecheck', dependsOn: ['s1'], retryCount: 0, retryDelaySeconds: 0, timeoutSeconds: 120 },
      { id: 's4', name: 'Report results', type: 'agent', roleDefinitionId: 'rd-implementer', tools: ['github', 'stoneforge'], dependsOn: ['s2', 's3'], retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 120 },
    ],
    trigger: { type: 'event', eventType: 'merge_to_main' },
    variables: [],
    totalRuns: 89, lastRunAt: '1 day ago', lastRunStatus: 'success',
    createdAt: '4 months ago', updatedAt: '1 month ago', createdBy: currentUser.name, tags: ['e2e', 'testing', 'ci'],
    linkedCIActionId: 'wf-nightly',
    createdByUserId: currentUser.id, scope: 'team', approvalRequired: true, approvalUsers: ['user-adam', 'user-sarah'],
  },
  {
    id: 'wf-4', name: 'Stale branch cleanup', description: 'Finds branches with no activity for 30+ days and cleans them up.',
    status: 'disabled',
    steps: [
      { id: 's1', name: 'Find stale branches', type: 'script', runtime: 'shell', code: 'git fetch --prune\ngit for-each-ref --sort=committerdate refs/remotes/origin | grep -v main | grep -v develop', retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 120 },
      { id: 's2', name: 'Evaluate and cleanup', type: 'agent', roleDefinitionId: 'rd-implementer', requiredAgentTags: ['thorough'], tools: ['github', 'stoneforge'], retryCount: 0, retryDelaySeconds: 0, timeoutSeconds: 180 },
    ],
    trigger: { type: 'cron', cronExpression: '0 2 * * 0', cronHumanReadable: 'Sunday 2:00 AM' },
    variables: [],
    totalRuns: 12, lastRunAt: '5 days ago', lastRunStatus: 'success',
    createdAt: '2 months ago', updatedAt: '2 months ago', createdBy: currentUser.name, tags: ['maintenance', 'git'],
    createdByUserId: currentUser.id, scope: 'personal',
  },
  {
    id: 'wf-5', name: 'Security scan on dependency update', description: 'Runs security scans on dependency PRs and creates issues for vulnerabilities.',
    status: 'error',
    steps: [
      { id: 's1', name: 'Run Snyk scan', type: 'script', runtime: 'shell', code: 'cd /workspace\nsnyk test --json > /tmp/snyk-results.json 2>&1\nexit 0', retryCount: 2, retryDelaySeconds: 30, timeoutSeconds: 300 },
      { id: 's2', name: 'Analyze findings', type: 'agent', roleDefinitionId: 'rd-implementer', requiredAgentTags: ['cloud'], tools: ['github'], retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 120 },
      { id: 's3', name: 'Create issues', type: 'script', runtime: 'nodejs', code: "const findings = JSON.parse(steps.s2.output);\nfor (const f of findings.critical) {\n  await octokit.issues.create({\n    owner: vars.org, repo: vars.repo,\n    title: `[Security] ${f.title}`,\n    labels: ['security', f.severity]\n  });\n}", retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 60 },
    ],
    trigger: { type: 'event', eventType: 'dependency_pr' },
    variables: [
      { name: 'org', type: 'string', default: 'toolco', description: 'GitHub org', required: true },
      { name: 'repo', type: 'string', default: 'stoneforge', description: 'GitHub repo', required: true },
    ],
    totalRuns: 34, lastRunAt: '3 days ago', lastRunStatus: 'failure',
    createdAt: '3 months ago', updatedAt: '3 days ago', createdBy: currentUser.name, tags: ['security', 'dependencies'],
    createdByUserId: 'user-sarah', scope: 'team',
  },
  {
    id: 'wf-6', name: 'Release notes generator', description: 'Summarizes commits since last tag and generates release notes for the changelog.',
    status: 'draft',
    steps: [
      { id: 's1', name: 'Generate release notes', type: 'agent', roleDefinitionId: 'rd-docs', tools: ['github'], retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 180 },
      { id: 's2', name: 'Update changelog', type: 'script', runtime: 'nodejs', code: "const fs = require('fs');\nconst changelog = fs.readFileSync('CHANGELOG.md', 'utf8');\nconst version = vars.version;\nconst date = new Date().toISOString().split('T')[0];\nconst entry = `## [${version}] - ${date}\\n\\n${steps.s1.output}\\n\\n`;\nfs.writeFileSync('CHANGELOG.md', entry + changelog);", retryCount: 0, retryDelaySeconds: 0, timeoutSeconds: 30 },
    ],
    trigger: { type: 'manual' },
    variables: [
      { name: 'version', type: 'string', description: 'Release version (e.g. 1.2.0)', required: true },
    ],
    totalRuns: 0,
    createdAt: '1 week ago', updatedAt: '1 week ago', createdBy: currentUser.name, tags: ['release'],
    createdByUserId: currentUser.id, scope: 'personal',
  },
]

export const mockWorkflowRuns: Record<string, WFRun[]> = {
  'wf-1': [
    {
      id: 'wr-1', runNumber: 47, runId: 'wfr-a1b2c3d4-e5f6-7890-abcd-ef1234567890', workflowId: 'wf-1', status: 'success', triggeredBy: 'schedule',
      startedAt: 'Today 9:00 AM', endedAt: 'Today 9:01:32 AM', duration: '1m 32s',
      result: 'Standup summary posted to #engineering. Covered 3 open PRs: OAuth PKCE flow, WebSocket reconnection, PTY resize fix.',
      steps: [
        { stepId: 's1', stepName: 'Fetch open PRs', stepType: 'script', status: 'success', startedAt: '9:00:00 AM', endedAt: '9:00:12 AM', duration: '12s', input: '{ org: "toolco", repo: "stoneforge", state: "open" }', output: 'Found 3 open PRs:\n- #42 WebSocket reconnection (Director Beta)\n- #41 PTY resize fix (Director Beta)\n- #43 SQLite WAL migration (Director Alpha)', retryAttempt: 0 },
        { stepId: 's2', stepName: 'Summarize for standup', stepType: 'agent', status: 'success', startedAt: '9:00:12 AM', endedAt: '9:01:17 AM', duration: '1m 05s', input: 'Summarize these open PRs for a daily standup update.\nFormat: brief\nFocus on what changed since yesterday.\n\nPRs:\n- #42 WebSocket reconnection\n- #41 PTY resize fix\n- #43 SQLite WAL migration', output: 'Generated standup summary for 3 PRs covering auth, WebSocket, and terminal fixes.', retryAttempt: 0 },
        { stepId: 's3', stepName: 'Post to Slack', stepType: 'script', status: 'success', startedAt: '9:01:17 AM', endedAt: '9:01:32 AM', duration: '15s', input: '{ channel: "#engineering", unfurl_links: false }', output: 'Posted to #engineering', retryAttempt: 0 },
      ],
      variables: { channel: '#engineering', format: 'brief', org: 'toolco', repo: 'stoneforge' },
    },
    {
      id: 'wr-2', runNumber: 46, runId: 'wfr-b2c3d4e5-f6a7-8901-bcde-f12345678901', workflowId: 'wf-1', status: 'success', triggeredBy: 'schedule',
      startedAt: 'Yesterday 9:00 AM', endedAt: 'Yesterday 9:01:28 AM', duration: '1m 28s',
      result: 'Standup summary posted to #engineering. Covered 5 open PRs.',
      steps: [
        { stepId: 's1', stepName: 'Fetch open PRs', stepType: 'script', status: 'success', startedAt: '9:00:00 AM', endedAt: '9:00:08 AM', duration: '8s', output: 'Found 5 open PRs', retryAttempt: 0 },
        { stepId: 's2', stepName: 'Summarize for standup', stepType: 'agent', status: 'success', startedAt: '9:00:08 AM', endedAt: '9:01:18 AM', duration: '1m 10s', output: 'Generated standup summary for 5 PRs.', retryAttempt: 0 },
        { stepId: 's3', stepName: 'Post to Slack', stepType: 'script', status: 'success', startedAt: '9:01:18 AM', endedAt: '9:01:28 AM', duration: '10s', output: 'Posted to #engineering', retryAttempt: 0 },
      ],
      variables: { channel: '#engineering', format: 'brief', org: 'toolco', repo: 'stoneforge' },
    },
    {
      id: 'wr-3', runNumber: 45, runId: 'wfr-c3d4e5f6-a7b8-9012-cdef-123456789012', workflowId: 'wf-1', status: 'failure', triggeredBy: 'schedule',
      startedAt: '2 days ago 9:00 AM', endedAt: '2 days ago 9:00:45 AM', duration: '45s',
      steps: [
        { stepId: 's1', stepName: 'Fetch open PRs', stepType: 'script', status: 'success', startedAt: '9:00:00 AM', endedAt: '9:00:10 AM', duration: '10s', output: 'Found 4 open PRs', retryAttempt: 0 },
        { stepId: 's2', stepName: 'Summarize for standup', stepType: 'agent', status: 'success', startedAt: '9:00:10 AM', endedAt: '9:00:42 AM', duration: '32s', output: 'Generated summary.', retryAttempt: 0 },
        { stepId: 's3', stepName: 'Post to Slack', stepType: 'script', status: 'failure', startedAt: '9:00:42 AM', endedAt: '9:00:45 AM', duration: '3s', error: 'Slack API rate limit exceeded. Attempted 2 retries with 60s backoff. Last error: 429 Too Many Requests.', retryAttempt: 2 },
      ],
      variables: { channel: '#engineering', format: 'brief', org: 'toolco', repo: 'stoneforge' },
      error: 'Step "Post to Slack" failed after 2 retries: Slack API rate limit exceeded',
    },
  ],
  'wf-2': [
    {
      id: 'wr-4', runNumber: 156, runId: 'wfr-d4e5f6a7-b8c9-0123-defa-234567890123', workflowId: 'wf-2', status: 'success', triggeredBy: 'event', triggeredByActor: 'Agent Beta',
      startedAt: '15 min ago', endedAt: '15 min ago', duration: '8s',
      result: 'Assigned reviewer "Adam King" to PR #42 based on networking expertise and git blame analysis.',
      steps: [
        { stepId: 's1', stepName: 'Get PR details', stepType: 'script', status: 'success', startedAt: '0s', endedAt: '2s', duration: '2s', input: '{ pull_number: 42, owner: "toolco", repo: "stoneforge" }', output: 'PR #42: WebSocket reconnection\nFiles: src/ws/client.ts, src/ws/reconnect.ts, tests/ws.test.ts', retryAttempt: 0 },
        { stepId: 's2', stepName: 'Select and assign reviewer', stepType: 'agent', status: 'success', startedAt: '2s', endedAt: '8s', duration: '6s', input: 'Analyze the PR files changed and select the most appropriate reviewer.\n\nPR: WebSocket reconnection\nFiles: src/ws/client.ts, src/ws/reconnect.ts\nTeam: alice, bob, charlie', output: 'Assigned reviewer "Adam King" to PR #42 based on networking expertise.', retryAttempt: 0 },
      ],
      variables: { team_members: 'alice, bob, charlie' },
      linkedCIRunIds: ['run-141'], linkedMRId: 'MR-42',
    },
    {
      id: 'wr-5', runNumber: 155, runId: 'wfr-e5f6a7b8-c9d0-1234-efab-345678901234', workflowId: 'wf-2', status: 'success', triggeredBy: 'event', triggeredByActor: 'Agent Alpha',
      startedAt: '1 hr ago', endedAt: '1 hr ago', duration: '5s',
      result: 'Assigned reviewer "Adam King" to PR #41 based on terminal domain knowledge.',
      steps: [
        { stepId: 's1', stepName: 'Get PR details', stepType: 'script', status: 'success', startedAt: '0s', endedAt: '1s', duration: '1s', output: 'PR #41: PTY resize fix', retryAttempt: 0 },
        { stepId: 's2', stepName: 'Select and assign reviewer', stepType: 'agent', status: 'success', startedAt: '1s', endedAt: '5s', duration: '4s', output: 'Assigned reviewer "Adam King" to PR #41.', retryAttempt: 0 },
      ],
      variables: { team_members: 'alice, bob, charlie' },
    },
  ],
  'wf-3': [
    {
      id: 'wr-6', runNumber: 89, runId: 'wfr-f6a7b8c9-d0e1-2345-fabc-456789012345', workflowId: 'wf-3', status: 'success', triggeredBy: 'event',
      startedAt: '1 day ago', endedAt: '1 day ago', duration: '8m 12s',
      result: 'E2E test suite passed. 142 tests passed, 0 failed. Lint clean. Results posted to commit abc1234.',
      steps: [
        { stepId: 's1', stepName: 'Checkout & install', stepType: 'script', status: 'success', startedAt: '0s', endedAt: '2m 45s', duration: '2m 45s', input: '{ repo: "toolco/stoneforge", commit: "abc1234" }', output: 'Checked out abc1234\nInstalled 847 packages', retryAttempt: 0 },
        { stepId: 's2', stepName: 'Run E2E tests', stepType: 'script', status: 'success', startedAt: '2m 45s', endedAt: '7m 37s', duration: '4m 52s', output: '142 tests passed, 0 failed\n\n  ✓ auth/login (2.1s)\n  ✓ auth/logout (1.3s)\n  ✓ tasks/create (3.2s)\n  ... 139 more tests', retryAttempt: 0 },
        { stepId: 's3', stepName: 'Run lint & typecheck', stepType: 'script', status: 'success', startedAt: '2m 45s', endedAt: '4m 15s', duration: '1m 30s', output: 'Lint: 0 errors, 0 warnings\nTypecheck: 0 errors', retryAttempt: 0 },
        { stepId: 's4', stepName: 'Report results', stepType: 'agent', status: 'success', startedAt: '7m 37s', endedAt: '8m 12s', duration: '35s', input: 'Analyze the E2E test results and lint output.\n\nE2E: 142 passed, 0 failed\nLint: clean\nCommit: abc1234', output: 'Posted success comment. All 142 E2E tests passed, lint clean.', retryAttempt: 0, linkedCIRunId: 'run-n89' },
      ],
      variables: {},
      linkedCIRunIds: ['run-n89'],
    },
  ],
  'wf-5': [
    {
      id: 'wr-7', runNumber: 34, runId: 'wfr-a7b8c9d0-e1f2-3456-abcd-567890123456', workflowId: 'wf-5', status: 'failure', triggeredBy: 'event',
      startedAt: '3 days ago', endedAt: '3 days ago', duration: '45s',
      steps: [
        { stepId: 's1', stepName: 'Run Snyk scan', stepType: 'script', status: 'failure', startedAt: '0s', endedAt: '45s', duration: '45s', input: '{ workspace: "/workspace", format: "json" }', error: 'snyk binary not found in runner environment.\n\nCommand: snyk test --json\nExit code: 127\n\nEnsure snyk is installed: npm install -g snyk', retryAttempt: 2 },
        { stepId: 's2', stepName: 'Analyze findings', stepType: 'agent', status: 'skipped', retryAttempt: 0 },
        { stepId: 's3', stepName: 'Create issues', stepType: 'script', status: 'skipped', retryAttempt: 0 },
      ],
      variables: { org: 'toolco', repo: 'stoneforge' },
      error: 'Step "Run Snyk scan" failed after 2 retries: snyk binary not found in runner environment',
    },
  ],
}

// ── Diff mock data ──
export interface DiffFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  hunks: { oldStart: number; newStart: number; lines: { type: 'add' | 'remove' | 'context'; content: string }[] }[]
}

export const mockDiffFiles: DiffFile[] = [
  {
    path: 'packages/smithy/src/auth/pkce.ts',
    status: 'added',
    additions: 42,
    deletions: 0,
    hunks: [{
      oldStart: 0, newStart: 1,
      lines: [
        { type: 'add', content: "import { randomBytes, createHash } from 'crypto'" },
        { type: 'add', content: '' },
        { type: 'add', content: 'interface PKCEChallenge {' },
        { type: 'add', content: '  codeVerifier: string' },
        { type: 'add', content: '  codeChallenge: string' },
        { type: 'add', content: "  method: 'S256'" },
        { type: 'add', content: '}' },
        { type: 'add', content: '' },
        { type: 'add', content: 'export function generatePKCEChallenge(): PKCEChallenge {' },
        { type: 'add', content: '  const codeVerifier = randomBytes(32)' },
        { type: 'add', content: "    .toString('base64url')" },
        { type: 'add', content: '    .slice(0, 128)' },
        { type: 'add', content: '' },
        { type: 'add', content: "  const codeChallenge = createHash('sha256')" },
        { type: 'add', content: '    .update(codeVerifier)' },
        { type: 'add', content: "    .digest('base64url')" },
        { type: 'add', content: '' },
        { type: 'add', content: '  return { codeVerifier, codeChallenge, method: "S256" }' },
        { type: 'add', content: '}' },
      ],
    }],
  },
  {
    path: 'packages/smithy/src/auth/index.ts',
    status: 'modified',
    additions: 3,
    deletions: 1,
    hunks: [{
      oldStart: 1, newStart: 1,
      lines: [
        { type: 'context', content: "export { createSession } from './session'" },
        { type: 'remove', content: "export type { AuthConfig } from './types'" },
        { type: 'add', content: "export { generatePKCEChallenge, exchangeCodeForToken } from './pkce'" },
        { type: 'add', content: "export type { AuthConfig } from './types'" },
        { type: 'add', content: "export type { PKCEChallenge } from './pkce'" },
      ],
    }],
  },
  {
    path: 'packages/smithy/src/auth/pkce-callback.ts',
    status: 'added',
    additions: 28,
    deletions: 0,
    hunks: [{
      oldStart: 0, newStart: 1,
      lines: [
        { type: 'add', content: "import { exchangeCodeForToken } from './pkce'" },
        { type: 'add', content: '' },
        { type: 'add', content: 'export async function handlePKCECallback(url: URL) {' },
        { type: 'add', content: "  const code = url.searchParams.get('code')" },
        { type: 'add', content: "  const state = url.searchParams.get('state')" },
        { type: 'add', content: '  if (!code || !state) throw new Error("Missing params")' },
        { type: 'add', content: '  return exchangeCodeForToken(code, state, url.origin)' },
        { type: 'add', content: '}' },
      ],
    }],
  },
]

export interface MRComment {
  id: string
  author: string
  avatar: string
  content: string
  file?: string
  line?: number
  createdAt: string
  isResolved?: boolean
}

export const mockMRComments: MRComment[] = [
  { id: 'c1', author: currentUser.name, avatar: currentUser.avatar, content: 'Looks good overall. Can we add error handling for the token exchange timeout case?', file: 'packages/smithy/src/auth/pkce.ts', line: 18, createdAt: '10 min ago' },
  { id: 'c2', author: 'Agent Beta', avatar: 'DB', content: 'Good point. I\'ll add a configurable timeout with a 30s default and proper error wrapping.', file: 'packages/smithy/src/auth/pkce.ts', line: 18, createdAt: '8 min ago' },
  { id: 'c3', author: currentUser.name, avatar: currentUser.avatar, content: 'Should we also export the callback handler from the barrel file?', file: 'packages/smithy/src/auth/index.ts', line: 2, createdAt: '5 min ago', isResolved: true },
]

// CI Job logs removed — logs now inline in mockCIRuns step data

// Automation run history removed — workflow run data now inline above as mockWorkflowRuns

export const KANBAN_COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
] as const

// ── Available assignees ──
export const ASSIGNEES = [
  { name: 'Agent Alpha', avatar: 'AA' },
  { name: 'Agent Beta', avatar: 'AB' },
  { name: 'Agent Gamma', avatar: 'AG' },
  { name: currentUser.name, avatar: currentUser.avatar },
]

// ── Available labels with colors ──
export const LABELS = [
  { name: 'auth', color: '#3b82f6' },
  { name: 'security', color: '#8b5cf6' },
  { name: 'networking', color: '#06b6d4' },
  { name: 'database', color: '#f59e0b' },
  { name: 'performance', color: '#ef4444' },
  { name: 'bug', color: '#ef4444' },
  { name: 'terminal', color: '#6b7280' },
  { name: 'design', color: '#ec4899' },
  { name: 'ui', color: '#8b5cf6' },
  { name: 'editor', color: '#10b981' },
  { name: 'agents', color: '#3b82f6' },
  { name: 'refactor', color: '#6b7280' },
  { name: 'ci-cd', color: '#f59e0b' },
  { name: 'automations', color: '#06b6d4' },
  { name: 'a11y', color: '#10b981' },
]

// Backfill MR-40 diff files now that mockDiffFiles is defined
mockMRDiffFiles['MR-40'] = mockDiffFiles

// ── Preview environment types + mock data ──

export interface PreviewEnvironment {
  id: string
  name: string
  url: string
  port: number
  startCommand?: string
  branchFilter?: string
}

export interface PreviewTab {
  id: string
  envId: string
  name: string
  url: string
  branch?: string
  linkedTaskId?: string
  linkedMRId?: string
  previewStatus: 'ready' | 'building' | 'failed'
}

export interface PreviewConsoleEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
}

export interface DevicePreset {
  name: string
  width: number
  height: number
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { name: 'Responsive', width: 0, height: 0 },
  { name: 'Desktop', width: 1440, height: 900 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 812 },
]

export const mockPreviewEnvironments: PreviewEnvironment[] = [
  { id: 'env-1', name: 'Frontend App', url: 'http://localhost:5174', port: 5174, startCommand: 'pnpm dev' },
  { id: 'env-2', name: 'API Server', url: 'http://localhost:3001', port: 3001, startCommand: 'pnpm start:api' },
  { id: 'env-3', name: 'Docs Site', url: 'http://localhost:4000', port: 4000, startCommand: 'pnpm docs:dev' },
]

export const mockPreviewTabs: PreviewTab[] = [
  { id: 'ptab-1', envId: 'env-1', name: 'Frontend App', url: 'https://preview-mr42.stoneforge.dev', branch: 'fix/ws-reconnect', linkedTaskId: 'SF-139', linkedMRId: 'MR-42', previewStatus: 'ready' },
  { id: 'ptab-2', envId: 'env-1', name: 'Frontend App', url: 'https://preview-mr41.stoneforge.dev', branch: 'fix/pty-resize', linkedTaskId: 'SF-137', linkedMRId: 'MR-41', previewStatus: 'failed' },
]

export const mockPreviewConsoleEntries: Record<string, PreviewConsoleEntry[]> = {
  'ptab-1': [
    { timestamp: '14:32:15', level: 'log', message: 'Page loaded in 142ms' },
    { timestamp: '14:32:15', level: 'warn', message: 'Warning: Each child in a list should have a unique "key" prop.' },
    { timestamp: '14:32:16', level: 'log', message: 'GET /api/dashboard 200 OK (23ms)' },
    { timestamp: '14:32:16', level: 'log', message: 'GET /api/metrics 200 OK (45ms)' },
    { timestamp: '14:32:18', level: 'error', message: 'Error: Failed to fetch /api/notifications - 503 Service Unavailable' },
    { timestamp: '14:32:22', level: 'log', message: 'WebSocket connected to wss://preview-mr42.stoneforge.dev/ws' },
    { timestamp: '14:32:25', level: 'info', message: 'HMR update: /src/components/Dashboard.tsx' },
  ],
  'ptab-2': [
    { timestamp: '14:30:01', level: 'log', message: 'Page loaded in 89ms' },
    { timestamp: '14:30:02', level: 'error', message: 'TypeError: Cannot read properties of undefined (reading \'resize\')' },
    { timestamp: '14:30:02', level: 'error', message: '    at PTYSession.handleResize (pty-session.ts:142)' },
    { timestamp: '14:30:03', level: 'warn', message: 'PTY connection lost, attempting reconnect...' },
    { timestamp: '14:30:05', level: 'error', message: 'Failed to reconnect PTY after 3 attempts' },
  ],
}

// ── Design Mode types ──

export type DesignAnnotationTool = 'select' | 'draw' | 'rectangle' | 'arrow' | 'comment'

export interface DesignAnnotation {
  id: string
  tool: DesignAnnotationTool
  comment: string
  timestamp: string
  points?: { x: number; y: number }[]
  rect?: { x: number; y: number; w: number; h: number }
  color?: string
  elementLabel?: string
}

export interface DesignFeedbackThread {
  id: string
  previewTabId: string
  annotations: DesignAnnotation[]
  status: 'draft' | 'sent'
  sentToAgent?: string
  sentAt?: string
}

// ── Whiteboard types ──

export interface WhiteboardEntry {
  id: string
  directorId: string
  title: string
  createdAt: string
  active: boolean
}

export const mockWhiteboards: WhiteboardEntry[] = [
  { id: 'wb-1', directorId: 'dir-1', title: 'OAuth2 PKCE Flow', createdAt: '2h ago', active: true },
  { id: 'wb-2', directorId: 'dir-1', title: 'Session Token Migration', createdAt: 'Yesterday', active: false },
  { id: 'wb-3', directorId: 'dir-2', title: 'WebSocket Reconnection Strategy', createdAt: '45m ago', active: true },
  { id: 'wb-4', directorId: 'dir-3', title: 'SSH Tunnel Architecture', createdAt: '1h ago', active: true },
]

// Helper to build TLRichText doc from plain string (line breaks → separate paragraphs)
function rt(text: string) {
  const lines = text.split('\n')
  return {
    type: 'doc' as const,
    content: lines.map(line => ({
      type: 'paragraph' as const,
      content: line ? [{ type: 'text' as const, text: line }] : [],
    })),
  }
}

export interface WhiteboardMockShapes {
  whiteboardId: string
  shapes: Array<{
    type: string
    x: number
    y: number
    props: Record<string, unknown>
  }>
}

export const mockWhiteboardShapes: WhiteboardMockShapes[] = [
  {
    whiteboardId: 'wb-1',
    shapes: [
      { type: 'text', x: 100, y: 60, props: { richText: rt('OAuth2 PKCE Flow — Implementation Plan'), scale: 2 } },
      { type: 'note', x: 100, y: 200, props: { richText: rt('1. Generate PKCE\ncode_verifier\n+ challenge (S256)') } },
      { type: 'note', x: 420, y: 200, props: { richText: rt('2. Open browser\nAuthorization URL\n+ challenge param') } },
      { type: 'note', x: 740, y: 200, props: { richText: rt('3. Callback handler\nExchange code\nfor tokens') } },
      { type: 'note', x: 1060, y: 200, props: { richText: rt('4. Store tokens\nSystem keychain\n+ encrypted fallback') } },
      { type: 'text', x: 100, y: 500, props: { richText: rt('Error Handling: 120s timeout | Port conflict fallback | Ctrl+C cleanup'), scale: 1 } },
      { type: 'geo', x: 100, y: 600, props: { w: 300, h: 180, geo: 'rectangle', richText: rt('Security Considerations\n• S256 only (no plain)\n• CSRF state param\n• Token rotation') } },
      { type: 'geo', x: 480, y: 600, props: { w: 300, h: 180, geo: 'rectangle', richText: rt('Testing Strategy\n• Mock OAuth server\n• Timeout scenarios\n• Multi-browser support') } },
    ],
  },
  {
    whiteboardId: 'wb-3',
    shapes: [
      { type: 'text', x: 100, y: 60, props: { richText: rt('WebSocket Reconnection Strategy'), scale: 2 } },
      { type: 'geo', x: 100, y: 180, props: { w: 280, h: 160, geo: 'rectangle', richText: rt('Connection\nManager\n\nSingleton service') } },
      { type: 'geo', x: 480, y: 180, props: { w: 280, h: 160, geo: 'rectangle', richText: rt('Backoff Engine\n\nExponential + jitter\nmax 30s cap') } },
      { type: 'geo', x: 860, y: 180, props: { w: 280, h: 160, geo: 'rectangle', richText: rt('Health Check\n\nHeartbeat every 15s\nping/pong frames') } },
      { type: 'text', x: 100, y: 420, props: { richText: rt('State Machine: CONNECTING → OPEN → CLOSING → CLOSED → RECONNECTING'), scale: 1 } },
      { type: 'note', x: 100, y: 500, props: { richText: rt('Edge case: If reconnect fires during page\nvisibility change, defer until tab is focused\nto avoid background throttling.') } },
    ],
  },
  {
    whiteboardId: 'wb-4',
    shapes: [
      { type: 'text', x: 200, y: 200, props: { richText: rt('SSH Tunnel Architecture\n(connection failed — draft incomplete)'), scale: 1.5 } },
      { type: 'note', x: 200, y: 350, props: { richText: rt('TODO: Map out tunnel topology\nLocal → Jump host → Target\nNeed to handle multiplexing') } },
    ],
  },
]

// ── Plan types ──

export interface Plan {
  id: string
  name: string
  description: string
  linkedTaskIds: string[]
  whiteboardId?: string
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  tags: string[]
  creator: string
  createdAt: string
  updatedAt: string
}

export const mockPlans: Plan[] = [
  {
    id: 'plan-1',
    name: 'CLI Authentication System',
    description: 'Implement full OAuth2 PKCE authentication flow for the CLI, including token refresh and secure storage.',
    linkedTaskIds: ['SF-142', 'SF-142-1', 'SF-142-2'],
    whiteboardId: 'wb-1',
    status: 'active',
    tags: ['auth', 'security'],
    creator: 'Agent Alpha',
    createdAt: 'Mar 28',
    updatedAt: '2 min ago',
  },
  {
    id: 'plan-2',
    name: 'Storage Migration',
    description: 'Migrate task storage from JSON files to SQLite with WAL mode for improved concurrent performance.',
    linkedTaskIds: ['SF-145'],
    status: 'active',
    tags: ['database', 'performance'],
    creator: 'Agent Alpha',
    createdAt: 'Apr 1',
    updatedAt: '5 min ago',
  },
  {
    id: 'plan-3',
    name: 'WebSocket Reliability',
    description: 'Harden WebSocket connections with automatic reconnection, exponential backoff, and jitter to prevent thundering herd on network changes.',
    linkedTaskIds: ['SF-139'],
    whiteboardId: 'wb-3',
    status: 'completed',
    tags: ['networking'],
    creator: 'Agent Beta',
    createdAt: 'Mar 20',
    updatedAt: '15 min ago',
  },
  {
    id: 'plan-4',
    name: 'Design System Refresh',
    description: 'Migrate the design system to Inter font with a condensed color token palette for the Linear-inspired redesign.',
    linkedTaskIds: ['SF-150', 'SF-151'],
    status: 'draft',
    tags: ['design', 'ui'],
    creator: 'Agent Beta',
    createdAt: 'Apr 5',
    updatedAt: '3 hr ago',
  },
  {
    id: 'plan-5',
    name: 'Agent Session Management',
    description: 'Implement session resume from checkpoints so agents can recover from interruptions without losing progress.',
    linkedTaskIds: ['SF-148'],
    status: 'draft',
    tags: ['agents'],
    creator: 'Agent Alpha',
    createdAt: 'Apr 8',
    updatedAt: '5 hr ago',
  },
  {
    id: 'plan-6',
    name: 'Terminal PTY Fixes',
    description: 'Fix terminal resize event propagation to PTY subprocess to resolve line wrapping issues.',
    linkedTaskIds: ['SF-137'],
    status: 'cancelled',
    tags: ['bug', 'terminal'],
    creator: 'Agent Beta',
    createdAt: 'Mar 15',
    updatedAt: '1 hr ago',
  },
]

export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
export const COMPLEXITY_LEVELS = [
  { value: 1, label: 'Trivial' },
  { value: 2, label: 'Simple' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Complex' },
  { value: 5, label: 'Very Complex' },
] as const

// ── Sessions ──

import type { Session, SessionAgent } from './components/overlays/sessions/session-types'

const agentMergesAndAcks: SessionAgent = {
  id: 'a8',
  name: 'p-worker-1',
  version: '177484654440517827',
  status: 'active',
  model: 'claude-opus-4-6',
  provider: 'Anthropic',
  rolePrompt: 'You are a senior M&A analyst specializing in retail sector transactions.\n    Assess whether a deal is worth pursuing based on financial statements,\n    operating data, and market context.\n\n## Framework\n\n### 1. Financial Health\n- Revenue trajectory (3-year CAGR, YoY trends)\n- Gross margin and EBITDA margin vs. retail comps\n- Free cash flow conversion\n- Net Debt / EBITDA; interest coverage ratio\n\n### 2. Retail-Specific Signals\n- Same-store sales growth (SSS)\n- Revenue per square foot\n- Store count trajectory\n- Inventory turnover and sell-through rate',
  recentSessions: [
    { id: 'sess-heC6T3Y', title: 'Build investment thesis for BuyCo', status: 'active', startedAt: '22 hours ago', duration: '5m 34s' },
    { id: 'sess-prev-1', title: 'Evaluate TargetCo acquisition', status: 'completed', startedAt: '3 days ago', duration: '12m 18s' },
    { id: 'sess-prev-2', title: 'Market comp analysis Q1 2026', status: 'completed', startedAt: '5 days ago', duration: '8m 42s' },
  ],
}

const agentFeatureBuilder: SessionAgent = {
  id: 'a4',
  name: 'e-worker-1',
  version: '177484654440517830',
  status: 'active',
  model: 'claude-sonnet-4-6',
  provider: 'Anthropic',
  rolePrompt: 'You are a senior software engineer. Implement features according to the task spec, following existing codebase patterns. Write clean, tested code.',
  recentSessions: [
    { id: 'sess-Kx9mP2R', title: 'Implement OAuth PKCE flow', status: 'completed', startedAt: '3 hours ago', duration: '14m 23s' },
    { id: 'sess-M3pQw9N', title: 'Fix CI pipeline timeout', status: 'completed', startedAt: '1 day ago', duration: '8m 56s' },
    { id: 'sess-P8mWn4Q', title: 'Add dark mode to settings', status: 'error', startedAt: '6 hours ago', duration: '1m 12s' },
    { id: 'sess-L2gYs6F', title: 'Generate API docs for v2', status: 'completed', startedAt: '3 days ago', duration: '11m 42s' },
  ],
}

const agentCodeReviewer: SessionAgent = {
  id: 'a6',
  name: 'm-steward-1',
  version: '177484654440517835',
  status: 'idle',
  model: 'claude-sonnet-4-6',
  provider: 'Anthropic',
  rolePrompt: 'You are a code review specialist. Review merge requests for correctness, performance, security, and adherence to project conventions.',
  recentSessions: [
    { id: 'sess-W4nLqZ8', title: 'Review MR #42: migration safety', status: 'completed', startedAt: '5 hours ago', duration: '3m 45s' },
    { id: 'sess-Q9jAu2H', title: 'Auth module coverage gaps', status: 'completed', startedAt: '1 day ago', duration: '6m 33s' },
  ],
}

const agentDirectorAlpha: SessionAgent = {
  id: 'a1',
  name: 'Agent Alpha',
  version: '177484654440517840',
  status: 'active',
  model: 'claude-opus-4-6',
  provider: 'Anthropic',
  rolePrompt: 'You are a senior software engineer directing implementation of features. Break down tasks, delegate to workers, and ensure quality.',
  recentSessions: [
    { id: 'sess-R7tBv5X', title: 'Orchestrate auth refactor', status: 'active', startedAt: '45 min ago', duration: '45m 12s' },
    { id: 'sess-prev-3', title: 'Coordinate payments redesign', status: 'completed', startedAt: '2 days ago', duration: '1h 23m' },
  ],
}

const agentDirectorBeta: SessionAgent = {
  id: 'a2',
  name: 'Agent Beta',
  version: '177484654440517841',
  status: 'idle',
  model: 'claude-sonnet-4-6',
  provider: 'Anthropic',
  rolePrompt: 'You are a senior software engineer focusing on bug fixes and stability improvements.',
  recentSessions: [
    { id: 'sess-BetaWS1', title: 'Fix WebSocket reconnection', status: 'completed', startedAt: '1 hr ago', duration: '45m' },
  ],
}

const agentMergeSteward: SessionAgent = {
  id: 'a6',
  name: 'm-steward-1',
  version: '177484654440517845',
  status: 'idle',
  model: 'claude-haiku-4-5',
  provider: 'Anthropic',
  rolePrompt: 'You are a merge steward. Monitor CI status, resolve merge conflicts, and ensure MRs are ready to merge.',
  recentSessions: [
    { id: 'sess-N5hZt8G', title: 'Monitor approved MRs', status: 'active', startedAt: '12 min ago', duration: '12m 8s' },
    { id: 'sess-J6kTr1V', title: 'Resolve conflicts on payments', status: 'completed', startedAt: '2 days ago', duration: '2m 18s' },
  ],
}

export const mockSessions: Session[] = [
  {
    id: 'sess-heC6T3Y',
    title: 'Build investment thesis for BuyCo',
    agent: agentMergesAndAcks,
    status: 'active',
    startedAt: '22 hours ago',
    duration: '5m 34s',
    activeDuration: '2m 44s',
    tokensIn: 71000,
    tokensOut: 5700,
    environment: 'ssh',
    files: ['/workspace/output/buyco_investment_thesis.md'],
    linkedTaskId: 'TASK-142',
    linkedBranch: 'feat/buyco-analysis',
    linkedDirectorId: 'dir-1',
    events: [
      { id: 'ev-1', type: 'session_start', title: 'Session start', content: 'Session initialized with merges-and-acks agent', timestamp: 0, duration: 1000 },
      { id: 'ev-2', type: 'user_message', title: 'Evaluate an acquisition of BuyCo', content: 'Evaluate an acquisition of BuyCo. Analyze their financial statements, operating metrics, and market position to determine if this deal is worth pursuing.', timestamp: 1000, duration: 1000, tokensIn: 780 },
      { id: 'ev-3', type: 'agent_message', title: 'Agent: Starting full acquisition analysis of BuyCo', content: 'I\'ll begin a comprehensive acquisition analysis of BuyCo. Let me start by examining the data room files to understand what financial and operational data we have available.', timestamp: 2000, duration: 3000, tokensIn: 1878, tokensOut: 100 },
      { id: 'ev-4', type: 'tool_call', title: 'Scanning data room file structure', content: 'Scanning /workspace/data-room/ for financial documents', timestamp: 5000, duration: 4000, toolName: 'Glob', toolInput: '*.{csv,pdf,xlsx}', toolResult: 'Found 8 files:\nincome_statement_FY2023-2025.csv\nbalance_sheet_FY2025.csv\ncash_flow_FY2023-2025.csv\nstore_performance_by_region.csv\ninventory_metrics_Q4_2025.csv\nlease_schedule.csv\nmanagement_presentation.pdf\ncustomer_demographics.csv', toolStatus: 'completed' },
      { id: 'ev-5', type: 'tool_call', title: 'Opening income statement FY2023-2025', content: 'Reading income statement for revenue and margin analysis', timestamp: 9000, duration: 3000, toolName: 'Read', toolInput: '/workspace/data-room/income_statement_FY2023-2025.csv', toolResult: 'Income statement loaded — Rev $421M, EBITDA $59M, Gross Margin 42.3%, Net Income $28M', toolStatus: 'completed', tokensIn: 2400, tokensOut: 0 },
      { id: 'ev-6', type: 'tool_call', title: 'Opening balance sheet FY2025', content: 'Reading balance sheet for leverage and liquidity analysis', timestamp: 9000, duration: 3000, toolName: 'Read', toolInput: '/workspace/data-room/balance_sheet_FY2025.csv', toolResult: 'Balance sheet loaded — Net Debt $124M, Total Assets $892M, Current Ratio 1.8x', toolStatus: 'completed', tokensIn: 1800, tokensOut: 0 },
      { id: 'ev-7', type: 'tool_call', title: 'Opening cash flow statement FY2023-2025', content: 'Reading cash flow statement for FCF analysis', timestamp: 12000, duration: 3000, toolName: 'Read', toolInput: '/workspace/data-room/cash_flow_FY2023-2025.csv', toolResult: 'Cash flow loaded — Operating CF $67M, CapEx $23M, FCF $44M, FCF Conversion 74.6%', toolStatus: 'completed', tokensIn: 2100, tokensOut: 0 },
      { id: 'ev-8', type: 'tool_call', title: 'Retail sector comp multiples', content: 'Searching for comparable transaction multiples in retail sector', timestamp: 12000, duration: 18000, toolName: 'Web_search', toolInput: 'retail sector M&A transaction multiples 2024 2025 EV/EBITDA', toolResult: 'Comp median 8.8x; 3 precedent transactions found:\n- RetailCorp acquired for 9.2x EV/EBITDA\n- ShopMax acquired for 8.1x EV/EBITDA\n- MartGroup acquired for 9.4x EV/EBITDA', toolStatus: 'completed', tokensIn: 3200, tokensOut: 450 },
      { id: 'ev-9', type: 'tool_call', title: 'BuyCo expansion article', content: 'Fetching recent news on BuyCo store expansion plans', timestamp: 12000, duration: 18000, toolName: 'Web_fetch', toolInput: 'https://retailnews.com/buyco-expansion-2025', toolResult: '187 stores, SSS +3.2%, $412 rev/sqft. BuyCo announced plans to open 22 new locations in FY2026, focusing on suburban markets in the Southeast.', toolStatus: 'completed', tokensIn: 4100, tokensOut: 200 },
      { id: 'ev-10', type: 'tool_call', title: 'Reading store performance data', content: 'Analyzing regional store performance metrics', timestamp: 30000, duration: 3000, toolName: 'Read', toolInput: '/workspace/data-room/store_performance_by_region.csv', toolResult: 'Southeast: +5.8% SSS, $445/sqft\nNortheast: +2.1% SSS, $398/sqft\nMidwest: +1.4% SSS, $371/sqft\nWest: -0.3% SSS, $389/sqft', toolStatus: 'completed', tokensIn: 1600, tokensOut: 0 },
      { id: 'ev-11', type: 'tool_call', title: 'Reading inventory metrics', content: 'Analyzing inventory efficiency metrics', timestamp: 33000, duration: 3000, toolName: 'Read', toolInput: '/workspace/data-room/inventory_metrics_Q4_2025.csv', toolResult: 'Inventory turnover: 4.2x (industry avg 3.8x)\nSell-through rate: 68%\nDays of supply: 87 days\nShrinkage: 1.4%', toolStatus: 'completed', tokensIn: 1200, tokensOut: 0 },
      { id: 'ev-12', type: 'tool_call', title: 'Reading lease schedule', content: 'Analyzing lease obligations and renewal schedule', timestamp: 36000, duration: 3000, toolName: 'Read', toolInput: '/workspace/data-room/lease_schedule.csv', toolResult: 'Total lease obligations: $312M\n47 leases expiring within 3 years\nAvg remaining term: 6.2 years\nWeighted avg rent: $28/sqft', toolStatus: 'completed', tokensIn: 1400, tokensOut: 0 },
      { id: 'ev-13', type: 'tool_call', title: 'Reading customer demographics', content: 'Analyzing customer base composition', timestamp: 39000, duration: 2000, toolName: 'Read', toolInput: '/workspace/data-room/customer_demographics.csv', toolResult: 'Core demo: 25-44 (52%), HHI $65-95K (41%)\nLoyalty program: 2.1M members, 34% of revenue\nDigital mix: 18% of total revenue, +42% YoY', toolStatus: 'completed', tokensIn: 1100, tokensOut: 0 },
      { id: 'ev-14', type: 'agent_message', title: 'Agent: Preliminary financial analysis complete', content: 'Based on my analysis of BuyCo\'s data room, here are the key findings:\n\n**Financial Health**\n- Revenue: $421M with 8.2% 3-year CAGR\n- EBITDA margin: 14.0% (above retail median of 11.5%)\n- FCF conversion: 74.6% — strong\n- Net Debt/EBITDA: 2.1x — manageable\n\n**Retail Metrics**\n- SSS: +3.2% (healthy, especially Southeast at +5.8%)\n- Rev/sqft: $412 (above average)\n- Inventory turnover: 4.2x (beats industry 3.8x)\n\n**Valuation**\n- At comp median 8.8x EV/EBITDA → implied EV ~$519M\n- Net of debt → equity value ~$395M\n\nLet me compile the full investment thesis document.', timestamp: 41000, duration: 8000, tokensIn: 8500, tokensOut: 1200 },
      { id: 'ev-15', type: 'tool_call', title: 'Writing investment thesis', content: 'Creating investment thesis document', timestamp: 49000, duration: 12000, toolName: 'Write', toolInput: '/workspace/output/buyco_investment_thesis.md', toolResult: 'File written: 4,231 bytes\nbuyco_investment_thesis.md created with executive summary, financial analysis, valuation range, risks, and recommendation.', toolStatus: 'completed', tokensIn: 0, tokensOut: 3800 },
      { id: 'ev-16', type: 'agent_message', title: 'Agent: Investment thesis complete', content: 'I\'ve completed the BuyCo investment thesis. The document includes:\n\n1. **Executive Summary** — Recommend proceeding to Phase 2 diligence\n2. **Financial Analysis** — Revenue, margins, cash flow, leverage\n3. **Operating Metrics** — Store performance, inventory, customer base\n4. **Valuation Range** — $480M-$560M EV (8.1x-9.5x EBITDA)\n5. **Key Risks** — West region weakness, lease concentration, digital transition\n6. **Recommendation** — Pursue with focus on management retention and digital strategy\n\nThe thesis is saved to `/workspace/output/buyco_investment_thesis.md`.', timestamp: 61000, duration: 5000, tokensIn: 6200, tokensOut: 890 },
      { id: 'ev-17', type: 'system_message', title: 'Session active — awaiting user input', content: 'Agent completed analysis. Session remains active for follow-up questions.', timestamp: 66000, duration: 0 },
    ],
  },
  {
    id: 'sess-Kx9mP2R',
    title: 'Implement OAuth PKCE flow for mobile app',
    agent: agentFeatureBuilder,
    status: 'completed',
    startedAt: '3 hours ago',
    duration: '14m 23s',
    activeDuration: '8m 12s',
    tokensIn: 42300,
    tokensOut: 18900,
    environment: 'local',
    files: ['src/auth/pkce.ts', 'src/auth/oauth.ts', 'src/auth/types.ts', 'src/auth/__tests__/pkce.test.ts', 'src/auth/__tests__/oauth.test.ts', 'src/config/auth.ts', 'package.json'],
    linkedTaskId: 'TASK-118',
    linkedMRId: 'MR-47',
    linkedBranch: 'feat/oauth-pkce',
    linkedDirectorId: 'dir-1',
    events: [
      { id: 'ev-20', type: 'session_start', title: 'Session start', content: 'Session initialized', timestamp: 0, duration: 500 },
      { id: 'ev-21', type: 'user_message', title: 'Implement PKCE flow per RFC 7636', content: 'Implement the OAuth PKCE flow for our mobile app. Follow RFC 7636 spec. Use the existing auth module.', timestamp: 500, duration: 800, tokensIn: 420 },
      { id: 'ev-22', type: 'agent_message', title: 'Agent: Planning PKCE implementation', content: 'I\'ll implement the PKCE flow with code_verifier generation, challenge computation, and token exchange.', timestamp: 1300, duration: 2000, tokensIn: 1200, tokensOut: 380 },
      { id: 'ev-23', type: 'tool_call', title: 'Reading existing auth module', content: 'Examining current auth implementation', timestamp: 3300, duration: 2500, toolName: 'Read', toolInput: 'src/auth/oauth.ts', toolResult: 'Found existing OAuth client class with authorization_code flow. Need to add PKCE extension.', toolStatus: 'completed', tokensIn: 3200, tokensOut: 0 },
      { id: 'ev-24', type: 'tool_call', title: 'Writing PKCE utilities', content: 'Creating code verifier and challenge functions', timestamp: 5800, duration: 4000, toolName: 'Write', toolInput: 'src/auth/pkce.ts', toolResult: 'Created pkce.ts with generateCodeVerifier(), computeCodeChallenge(), and PKCE state management', toolStatus: 'completed', tokensIn: 0, tokensOut: 2800 },
      { id: 'ev-25', type: 'tool_call', title: 'Editing OAuth client for PKCE', content: 'Adding PKCE params to authorization and token requests', timestamp: 9800, duration: 5000, toolName: 'Edit', toolInput: 'src/auth/oauth.ts', toolResult: 'Modified authorize() and exchangeToken() to include code_challenge and code_verifier params', toolStatus: 'completed', tokensIn: 2400, tokensOut: 1800 },
    ],
  },
  {
    id: 'sess-W4nLqZ8',
    title: 'Review MR #42: Database migration safety',
    agent: agentCodeReviewer,
    status: 'completed',
    startedAt: '5 hours ago',
    duration: '3m 45s',
    activeDuration: '2m 10s',
    tokensIn: 28400,
    tokensOut: 4200,
    environment: 'docker',
    files: ['db/migrations/20250407_add_session_table.sql', 'db/migrations/20250407_add_session_table_rollback.sql', 'src/db/schema.ts'],
    linkedMRId: 'MR-42',
    linkedBranch: 'fix/migration-safety',
    events: [
      { id: 'ev-30', type: 'session_start', title: 'Session start', content: 'Code review session initialized', timestamp: 0, duration: 500 },
      { id: 'ev-31', type: 'user_message', title: 'Review MR #42 for migration safety', content: 'Please review MR #42 focusing on database migration safety and backward compatibility.', timestamp: 500, duration: 600, tokensIn: 340 },
      { id: 'ev-32', type: 'tool_call', title: 'Reading migration file', content: 'Examining the database migration', timestamp: 1100, duration: 3000, toolName: 'Read', toolInput: 'db/migrations/20250407_add_session_table.sql', toolResult: 'Migration adds sessions table with proper indexes. Uses IF NOT EXISTS. Has rollback.', toolStatus: 'completed', tokensIn: 2800, tokensOut: 0 },
      { id: 'ev-33', type: 'agent_message', title: 'Agent: Migration looks safe with one concern', content: 'The migration is well-structured but the index on (user_id, created_at) should be CONCURRENTLY to avoid table locks in production.', timestamp: 4100, duration: 2000, tokensIn: 3200, tokensOut: 680 },
    ],
  },
  {
    id: 'sess-R7tBv5X',
    title: 'Orchestrate authentication refactor',
    agent: agentDirectorAlpha,
    status: 'active',
    startedAt: '45 min ago',
    duration: '45m 12s',
    activeDuration: '28m 30s',
    tokensIn: 156000,
    tokensOut: 42000,
    environment: 'local',
    files: ['src/auth/oidc.ts', 'src/auth/oidc-discovery.ts', 'src/auth/token-manager.ts', 'src/auth/session.ts'],
    linkedBranch: 'refactor/auth-system',
    linkedDirectorId: 'dir-1',
    linkedPreviewTabId: 'tab-1',
    events: [
      { id: 'ev-40', type: 'session_start', title: 'Session start', content: 'Director session initialized for auth refactor', timestamp: 0, duration: 1000 },
      { id: 'ev-41', type: 'user_message', title: 'Refactor the auth system to use OIDC', content: 'Refactor our authentication to use OpenID Connect. Break it into subtasks and delegate to workers.', timestamp: 1000, duration: 1500, tokensIn: 890 },
      { id: 'ev-42', type: 'agent_message', title: 'Agent: Planning auth refactor breakdown', content: 'I\'ll break this into 4 subtasks: OIDC discovery, token management, session handling, and migration.', timestamp: 2500, duration: 4000, tokensIn: 4200, tokensOut: 1100 },
      { id: 'ev-43', type: 'tool_call', title: 'Scanning auth directory', content: 'Understanding current auth structure', timestamp: 6500, duration: 2000, toolName: 'Glob', toolInput: 'src/auth/**/*', toolResult: 'Found 12 files in src/auth/', toolStatus: 'completed' },
      { id: 'ev-44', type: 'tool_call', title: 'Delegating OIDC discovery task', content: 'Spawning worker for OIDC discovery implementation', timestamp: 8500, duration: 15000, toolName: 'Bash', toolInput: 'stoneforge agent spawn feature-builder --task "Implement OIDC discovery endpoint"', toolResult: 'Worker session sess-sub-1 started for OIDC discovery', toolStatus: 'completed' },
      { id: 'ev-45', type: 'agent_message', title: 'Received message from Agent Beta', content: 'OIDC discovery endpoint implementation complete — ready for integration review. Found 3 non-standard claims that need mapping.', timestamp: 23500, duration: 2000, tokensIn: 1800, tokensOut: 400, crossAgent: { fromAgent: 'Agent Beta', toAgent: 'Agent Alpha', channelName: 'Auth Refactor' } },
      { id: 'ev-46', type: 'agent_message', title: 'Sent delegation request to Agent Delta', content: 'Begin token manager migration using new OIDC discovery module. Priority: complete before session handling refactor begins.', timestamp: 25500, duration: 2000, tokensIn: 500, tokensOut: 200, crossAgent: { fromAgent: 'Agent Alpha', toAgent: 'Agent Delta', channelName: 'Auth Refactor' } },
      { id: 'ev-47', type: 'agent_message', title: 'Received status update from Agent Delta', content: 'Token manager migration 60% complete. Encountered edge case with refresh token rotation — requesting guidance on backward compatibility.', timestamp: 33500, duration: 2000, tokensIn: 2100, tokensOut: 600, crossAgent: { fromAgent: 'Agent Delta', toAgent: 'Agent Alpha', channelName: 'Auth Refactor' } },
    ],
  },
  {
    id: 'sess-M3pQw9N',
    title: 'Fix CI pipeline timeout on E2E tests',
    agent: agentFeatureBuilder,
    status: 'completed',
    startedAt: '1 day ago',
    duration: '8m 56s',
    activeDuration: '5m 20s',
    tokensIn: 35600,
    tokensOut: 12100,
    environment: 'docker',
    files: ['.github/workflows/e2e.yml', 'playwright.config.ts', 'tests/e2e/setup.ts', 'tests/e2e/checkout.spec.ts'],
    linkedTaskId: 'TASK-131',
    linkedBranch: 'fix/ci-timeout',
    events: [
      { id: 'ev-50', type: 'session_start', title: 'Session start', content: 'Session initialized', timestamp: 0, duration: 500 },
      { id: 'ev-51', type: 'user_message', title: 'Fix E2E test timeout in CI', content: 'Our E2E tests are timing out in CI but pass locally. Debug and fix.', timestamp: 500, duration: 600, tokensIn: 280 },
      { id: 'ev-52', type: 'tool_call', title: 'Reading CI config', content: 'Examining CI pipeline configuration', timestamp: 1100, duration: 2000, toolName: 'Read', toolInput: '.github/workflows/e2e.yml', toolResult: 'Found: timeout-minutes: 10, no retry logic, using headed browser mode', toolStatus: 'completed', tokensIn: 1800, tokensOut: 0 },
      { id: 'ev-53', type: 'agent_message', title: 'Agent: Found root cause — headed mode in CI', content: 'The CI runs headed browser mode which requires a display server. Switching to headless and adding retry logic.', timestamp: 3100, duration: 3000, tokensIn: 2400, tokensOut: 620 },
    ],
  },
  {
    id: 'sess-J6kTr1V',
    title: 'Resolve merge conflicts on feature/payments',
    agent: agentMergeSteward,
    status: 'completed',
    startedAt: '2 days ago',
    duration: '2m 18s',
    activeDuration: '1m 45s',
    tokensIn: 15200,
    tokensOut: 3800,
    environment: 'local',
    linkedMRId: 'MR-39',
    linkedBranch: 'feature/payments',
    events: [
      { id: 'ev-60', type: 'session_start', title: 'Session start', content: 'Merge steward session initialized', timestamp: 0, duration: 500 },
      { id: 'ev-61', type: 'system_message', title: 'Conflict detected on feature/payments', content: 'Merge conflict detected between feature/payments and main on 3 files', timestamp: 500, duration: 0 },
      { id: 'ev-62', type: 'tool_call', title: 'Checking conflict files', content: 'Listing conflicted files', timestamp: 500, duration: 1500, toolName: 'Bash', toolInput: 'git diff --name-only --diff-filter=U', toolResult: 'src/payments/checkout.ts\nsrc/payments/types.ts\npackage.json', toolStatus: 'completed' },
      { id: 'ev-63', type: 'agent_message', title: 'Agent: Resolving 3 merge conflicts', content: 'Found 3 conflicted files. The checkout.ts conflict is a semantic merge — both branches added new payment methods. I\'ll combine them.', timestamp: 2000, duration: 2000, tokensIn: 3400, tokensOut: 890 },
    ],
  },
  {
    id: 'sess-P8mWn4Q',
    title: 'Add dark mode support to settings panel',
    agent: agentFeatureBuilder,
    status: 'error',
    startedAt: '6 hours ago',
    duration: '1m 12s',
    activeDuration: '0m 45s',
    tokensIn: 8900,
    tokensOut: 2100,
    environment: 'local',
    files: ['src/components/SettingsPanel.tsx', 'src/styles/theme.css'],
    linkedTaskId: 'TASK-156',
    linkedBranch: 'feat/dark-mode-settings',
    events: [
      { id: 'ev-70', type: 'session_start', title: 'Session start', content: 'Session initialized', timestamp: 0, duration: 500 },
      { id: 'ev-71', type: 'user_message', title: 'Add dark mode toggle to settings', content: 'Add a dark mode toggle to the settings panel with system preference detection.', timestamp: 500, duration: 600, tokensIn: 220 },
      { id: 'ev-72', type: 'tool_call', title: 'Reading settings component', content: 'Examining current settings panel', timestamp: 1100, duration: 2000, toolName: 'Read', toolInput: 'src/components/SettingsPanel.tsx', toolResult: 'Error: File not found — src/components/SettingsPanel.tsx does not exist', toolStatus: 'error' },
      { id: 'ev-73', type: 'system_message', title: 'Session errored — file not found', content: 'Agent encountered unrecoverable error: target file does not exist. Settings panel may have been moved or renamed.', timestamp: 3100, duration: 0 },
    ],
  },
  {
    id: 'sess-L2gYs6F',
    title: 'Generate API documentation for v2 endpoints',
    agent: agentFeatureBuilder,
    status: 'completed',
    startedAt: '3 days ago',
    duration: '11m 42s',
    activeDuration: '7m 15s',
    tokensIn: 52800,
    tokensOut: 24500,
    environment: 'ssh',
    files: ['docs/api/v2/openapi.yaml', 'docs/api/v2/auth.md', 'docs/api/v2/users.md', 'docs/api/v2/sessions.md'],
    linkedTaskId: 'TASK-108',
    linkedBranch: 'docs/api-v2',
    events: [
      { id: 'ev-80', type: 'session_start', title: 'Session start', content: 'Session initialized for API docs generation', timestamp: 0, duration: 500 },
      { id: 'ev-81', type: 'user_message', title: 'Generate OpenAPI docs for v2', content: 'Generate comprehensive OpenAPI 3.1 documentation for all v2 API endpoints.', timestamp: 500, duration: 800, tokensIn: 310 },
      { id: 'ev-82', type: 'tool_call', title: 'Scanning API routes', content: 'Finding all v2 route definitions', timestamp: 1300, duration: 3000, toolName: 'Grep', toolInput: 'router\\.(get|post|put|delete|patch)', toolResult: 'Found 34 route definitions across 8 files in src/api/v2/', toolStatus: 'completed', tokensIn: 1200, tokensOut: 0 },
    ],
  },
  {
    id: 'sess-N5hZt8G',
    title: 'Monitor and auto-merge approved MRs',
    agent: agentMergeSteward,
    status: 'active',
    startedAt: '12 min ago',
    duration: '12m 8s',
    activeDuration: '3m 22s',
    tokensIn: 18400,
    tokensOut: 2800,
    environment: 'local',
    linkedBranch: 'main',
    events: [
      { id: 'ev-90', type: 'session_start', title: 'Session start', content: 'Merge steward monitoring session started', timestamp: 0, duration: 500 },
      { id: 'ev-91', type: 'system_message', title: 'Watching 4 approved MRs for merge readiness', content: 'Monitoring MR-44, MR-45, MR-47, MR-48 for CI completion and merge readiness.', timestamp: 500, duration: 0 },
      { id: 'ev-92', type: 'tool_call', title: 'Checking CI status for MR-47', content: 'Polling CI pipeline status', timestamp: 60000, duration: 2000, toolName: 'Bash', toolInput: 'gh pr checks 47 --json name,state', toolResult: 'All 6 checks passed for MR-47', toolStatus: 'completed' },
      { id: 'ev-93', type: 'agent_message', title: 'Agent: MR-47 ready to merge', content: 'MR-47 (OAuth PKCE flow) has all checks passing and 2 approvals. Proceeding with squash merge.', timestamp: 62000, duration: 1500, tokensIn: 2200, tokensOut: 450 },
      { id: 'ev-94', type: 'agent_message', title: 'Notified Agent Alpha of merge completion', content: 'MR-47 merged to main. Auth refactor branch may need rebase.', timestamp: 64000, duration: 1000, tokensIn: 800, tokensOut: 200, crossAgent: { fromAgent: 'Merge Steward', toAgent: 'Agent Alpha' } },
    ],
  },
  {
    id: 'sess-Q9jAu2H',
    title: 'Analyze test coverage gaps in auth module',
    agent: agentCodeReviewer,
    status: 'completed',
    startedAt: '1 day ago',
    duration: '6m 33s',
    activeDuration: '4m 18s',
    tokensIn: 38900,
    tokensOut: 8700,
    environment: 'local',
    files: ['src/auth/oauth.ts', 'src/auth/pkce.ts', 'src/auth/session.ts', 'src/auth/__tests__/oauth.test.ts', 'src/auth/__tests__/pkce.test.ts'],
    linkedTaskId: 'TASK-139',
    events: [
      { id: 'ev-100', type: 'session_start', title: 'Session start', content: 'Coverage analysis session started', timestamp: 0, duration: 500 },
      { id: 'ev-101', type: 'user_message', title: 'Find untested code paths in auth', content: 'Analyze the auth module for test coverage gaps. Focus on edge cases and error paths.', timestamp: 500, duration: 700, tokensIn: 290 },
      { id: 'ev-102', type: 'tool_call', title: 'Running coverage report', content: 'Generating coverage report for auth module', timestamp: 1200, duration: 8000, toolName: 'Bash', toolInput: 'npx vitest --coverage --reporter=json src/auth/', toolResult: 'Coverage: 73.2% statements, 61.8% branches\nUncovered: token refresh error paths, PKCE edge cases, session expiry handling', toolStatus: 'completed', tokensIn: 4200, tokensOut: 0 },
    ],
  },
  {
    id: 'sess-BetaWS1',
    title: 'Fix WebSocket reconnection with exponential backoff',
    agent: agentDirectorBeta,
    status: 'completed',
    startedAt: '1 hour ago',
    duration: '45m 12s',
    activeDuration: '32m 08s',
    tokensIn: 52100,
    tokensOut: 14300,
    environment: 'local',
    files: ['src/ws/reconnect.ts', 'src/ws/backoff.ts', 'src/ws/__tests__/reconnect.test.ts'],
    linkedTaskId: 'SF-139',
    linkedMRId: 'MR-42',
    linkedBranch: 'fix/ws-reconnect',
    linkedDirectorId: 'dir-2',
    events: [
      { id: 'ev-110', type: 'session_start', title: 'Session start', content: 'Director Beta session initialized for WebSocket fix', timestamp: 0, duration: 500 },
      { id: 'ev-111', type: 'user_message', title: 'Fix the WebSocket reconnection', content: 'The WebSocket connection drops silently on network changes. Implement automatic reconnection with exponential backoff.', timestamp: 500, duration: 800, tokensIn: 320 },
      { id: 'ev-112', type: 'agent_message', title: 'Agent: Implementing reconnection logic', content: 'I\'ll implement exponential backoff with jitter for WebSocket reconnection. Starting with the reconnection manager.', timestamp: 1300, duration: 5000, tokensIn: 4500, tokensOut: 1200 },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Messages & Channels mock data
// ─────────────────────────────────────────────────────────────────────────────

import type { MsgEntity, MsgChannel, MsgMessage, MsgSessionCard } from './components/overlays/messages/message-types'

// ── Entities ──
const entityAdam: MsgEntity = { id: 'ent-adam', name: 'Adam King', entityType: 'human' }
const entityDelta: MsgEntity = { id: 'ent-delta', name: 'Director Delta', entityType: 'agent' }
const entityAlpha: MsgEntity = { id: 'ent-alpha', name: 'Agent Alpha', entityType: 'agent' }
const entityBeta: MsgEntity = { id: 'ent-beta', name: 'Agent Beta', entityType: 'agent' }
const entityGamma: MsgEntity = { id: 'ent-gamma', name: 'Agent Gamma', entityType: 'agent' }
const entitySys: MsgEntity = { id: 'ent-system', name: 'Stoneforge', entityType: 'system' }

export const mockMsgEntities: MsgEntity[] = [entityAdam, entityDelta, entityAlpha, entityBeta, entityGamma, entitySys]

// ── Channels ──
export const mockChannels: MsgChannel[] = [
  {
    id: 'ch-arch-review', name: 'Architecture Review', channelType: 'group',
    description: 'System architecture tradeoffs and design decisions',
    members: [entityDelta, entityAlpha, entityBeta],
    visibility: 'public',
    lastMessageAt: '5 min ago', lastMessagePreview: 'I still think event sourcing adds too much operational overhead for our scale',
    lastMessageSender: entityBeta, unreadCount: 4, unreadHumanCount: 0,
  },
  {
    id: 'ch-security-audit', name: 'Security Audit', channelType: 'group',
    description: 'Security posture review and vulnerability analysis',
    members: [entityAlpha, entityGamma, entitySys],
    visibility: 'private',
    lastMessageAt: '20 min ago', lastMessagePreview: 'The CORS policy on /api/webhooks is too permissive. Recommending origin allowlist.',
    lastMessageSender: entityGamma, unreadCount: 2, unreadHumanCount: 0,
  },
  {
    id: 'ch-perf-analysis', name: 'Performance Analysis', channelType: 'group',
    description: 'Performance bottleneck investigation and optimization',
    members: [entityDelta, entityBeta, entityGamma],
    visibility: 'public',
    lastMessageAt: '45 min ago', lastMessagePreview: 'Database query plan confirms the N+1 issue on the tasks endpoint',
    lastMessageSender: entityDelta, unreadCount: 0, unreadHumanCount: 0,
  },
  {
    id: 'ch-api-design', name: 'API Design Discussion', channelType: 'group',
    description: 'API contract design, versioning, and deprecation strategy',
    members: [entityAlpha, entityDelta],
    visibility: 'private',
    lastMessageAt: '1 hour ago', lastMessagePreview: 'GraphQL subscriptions would solve the polling problem but complicate the gateway',
    lastMessageSender: entityAlpha, unreadCount: 1, unreadHumanCount: 0,
  },
]

// ── Messages ──
export const mockMessages: MsgMessage[] = [
  // #Architecture Review
  { id: 'msg-1', channelId: 'ch-arch-review', sender: entityDelta, content: 'Starting the architecture review for the notification subsystem. We need to decide between a push-based event bus and a pull-based polling model. Current latency requirements are sub-500ms for critical alerts.', timestamp: '2026-04-13T09:00:00Z' },
  { id: 'msg-2', channelId: 'ch-arch-review', sender: entityAlpha, content: 'I\'ve been prototyping an event sourcing approach. Key benefits:\n- Full audit trail built-in\n- Temporal queries for free\n- Easy to add new consumers without schema changes\n\nThe tradeoff is operational complexity. We\'d need a dedicated event store and replay tooling.', timestamp: '2026-04-13T09:08:00Z', replyCount: 1 },
  { id: 'msg-3', channelId: 'ch-arch-review', sender: entityBeta, content: 'I ran the numbers on event sourcing storage. At our current write rate (~2k events/sec), we\'d accumulate roughly 170M events/day. That\'s manageable, but the replay time for rebuilding projections would be significant after a few months.', timestamp: '2026-04-13T09:15:00Z', threadId: 'msg-2' },
  { id: 'msg-4', channelId: 'ch-arch-review', sender: entityDelta, content: 'Good analysis. What about a hybrid approach? Use a simple message broker for real-time delivery and persist events to cold storage for the audit trail. We get sub-100ms latency without the full event sourcing overhead.', timestamp: '2026-04-13T09:22:00Z' },
  { id: 'msg-5', channelId: 'ch-arch-review', sender: entityAlpha, content: 'The hybrid model makes sense. We could use Redis Streams for the hot path and write-behind to Postgres for durability. I\'ll draft an ADR for this approach.', timestamp: '2026-04-13T09:30:00Z' },
  { id: 'msg-6', channelId: 'ch-arch-review', sender: entityBeta, content: 'I still think event sourcing adds too much operational overhead for our scale. The hybrid Redis + Postgres approach gives us 90% of the benefit with a fraction of the complexity. Let\'s go with that.', timestamp: '2026-04-13T09:40:00Z' },

  // #Security Audit
  { id: 'msg-10', channelId: 'ch-security-audit', sender: entityAlpha, content: 'Starting the security review for the v2.4 release. I\'ll cover auth and session management, @Agent Gamma handles network and CORS policies.', timestamp: '2026-04-13T10:00:00Z' },
  { id: 'msg-11', channelId: 'ch-security-audit', sender: entityGamma, content: 'Scanning the network configuration now. Initial finding: the `/api/webhooks` endpoint accepts requests from any origin. The CORS headers are set to `Access-Control-Allow-Origin: *` which is too permissive for a webhook receiver.', timestamp: '2026-04-13T10:15:00Z' },
  { id: 'msg-12', channelId: 'ch-security-audit', sender: entitySys, content: '**Security scan completed:** 3 findings (1 high, 2 medium)\n- HIGH: Permissive CORS on `/api/webhooks`\n- MEDIUM: Missing rate limiting on `/auth/token`\n- MEDIUM: Session cookie missing `SameSite=Strict`', timestamp: '2026-04-13T10:20:00Z' },
  { id: 'msg-13', channelId: 'ch-security-audit', sender: entityAlpha, content: 'The session cookie issue is already fixed in the auth rewrite branch. I\'ll verify the `SameSite` attribute is set correctly once it merges. For the rate limiting gap, I recommend a sliding window limiter at 10 req/min per IP on the token endpoint.', timestamp: '2026-04-13T10:25:00Z' },
  { id: 'msg-14', channelId: 'ch-security-audit', sender: entityGamma, content: 'The CORS policy on /api/webhooks is too permissive. Recommending origin allowlist. I\'ve drafted the allowlist config \u2014 it includes our known webhook providers: GitHub, Stripe, and our internal services.', timestamp: '2026-04-13T10:35:00Z' },

  // #Performance Analysis
  { id: 'msg-20', channelId: 'ch-perf-analysis', sender: entityBeta, content: 'P95 latency on the `/tasks` endpoint spiked to 1.2s after yesterday\'s deploy. Normal baseline is ~200ms. Investigating now.', timestamp: '2026-04-13T11:00:00Z' },
  { id: 'msg-21', channelId: 'ch-perf-analysis', sender: entityGamma, content: 'I profiled the hot path. The bottleneck is in `TaskRepository.findWithDependencies()`. It\'s running a separate query per dependency instead of a single JOIN. Classic N+1 pattern.', timestamp: '2026-04-13T11:10:00Z' },
  { id: 'msg-22', channelId: 'ch-perf-analysis', sender: entityDelta, content: 'Database query plan confirms the N+1 issue on the tasks endpoint. The `task_dependencies` table is being scanned 47 times per request for a workspace with 50 tasks. A single query with a lateral join would bring it down to 1 round trip.', timestamp: '2026-04-13T11:18:00Z' },
  { id: 'msg-23', channelId: 'ch-perf-analysis', sender: entityBeta, content: 'I\'ve benchmarked the lateral join approach locally. Results:\n- Before: 47 queries, 1180ms p95\n- After: 1 query, 38ms p95\n\nThat\'s a 31x improvement. Creating the MR now.', timestamp: '2026-04-13T11:30:00Z' },
  { id: 'msg-24', channelId: 'ch-perf-analysis', sender: entityGamma, content: 'We should also add a query complexity guard to prevent this from regressing. I\'ll wire up a middleware that logs a warning if any handler exceeds 5 DB round trips per request.', timestamp: '2026-04-13T11:38:00Z' },

  // #API Design Discussion
  { id: 'msg-30', channelId: 'ch-api-design', sender: entityDelta, content: 'We need to solve the real-time update problem for the dashboard. Currently clients poll every 5 seconds, which generates ~12k requests/min across all active users. Options:\n1. Server-Sent Events (SSE)\n2. WebSockets\n3. GraphQL subscriptions', timestamp: '2026-04-13T12:00:00Z' },
  { id: 'msg-31', channelId: 'ch-api-design', sender: entityAlpha, content: 'SSE is the simplest option and covers our primary use case (server-to-client pushes). However, the dashboard also needs bidirectional communication for the command palette. That rules out pure SSE.', timestamp: '2026-04-13T12:08:00Z' },
  { id: 'msg-32', channelId: 'ch-api-design', sender: entityDelta, content: 'What about SSE for the data feed plus a lightweight RPC endpoint for commands? Keeps the architecture simpler than a full WebSocket layer.', timestamp: '2026-04-13T12:15:00Z' },
  { id: 'msg-33', channelId: 'ch-api-design', sender: entityAlpha, content: 'GraphQL subscriptions would solve the polling problem but complicate the gateway. We\'d need to add WebSocket support to the API gateway, handle connection multiplexing, and deal with subscription lifecycle management. The SSE + RPC approach is cleaner for our current needs.', timestamp: '2026-04-13T12:22:00Z' },
]

// ── Session Summary Cards ──
export const mockSessionCards: MsgSessionCard[] = [
  {
    id: 'sc-1', channelId: 'ch-arch-review', agentEntity: entityAlpha, sessionId: 'sess-1',
    status: 'completed', taskTitle: 'Draft ADR for hybrid event architecture', taskId: 'SF-160',
    branch: 'docs/adr-event-architecture', duration: '12m 45s', filesChanged: 3, testsAdded: 0,
    timestamp: '2026-04-13T09:35:00Z',
  },
  {
    id: 'sc-2', channelId: 'ch-security-audit', agentEntity: entityGamma, sessionId: 'sess-2',
    status: 'completed', taskTitle: 'Scan network CORS policies', taskId: 'SF-161',
    branch: 'audit/cors-scan', duration: '6m 18s', filesChanged: 0,
    timestamp: '2026-04-13T10:18:00Z',
  },
  {
    id: 'sc-3', channelId: 'ch-security-audit', agentEntity: entityAlpha, sessionId: 'sess-3',
    status: 'completed', taskTitle: 'Verify SameSite cookie attribute', taskId: 'SF-162',
    branch: 'fix/session-cookie-samesite', duration: '4m 20s', filesChanged: 1, testsAdded: 2,
    timestamp: '2026-04-13T10:30:00Z',
  },
  {
    id: 'sc-4', channelId: 'ch-perf-analysis', agentEntity: entityGamma, sessionId: 'sess-4',
    status: 'completed', taskTitle: 'Profile TaskRepository hot path', taskId: 'SF-163',
    branch: 'perf/task-query-profile', duration: '8m 12s', filesChanged: 0,
    timestamp: '2026-04-13T11:12:00Z',
  },
  {
    id: 'sc-5', channelId: 'ch-perf-analysis', agentEntity: entityBeta, sessionId: 'sess-5',
    status: 'running', taskTitle: 'Implement lateral join for task dependencies', taskId: 'SF-164',
    branch: 'fix/task-n-plus-one', duration: '15m 30s', filesChanged: 4, testsAdded: 3,
    timestamp: '2026-04-13T11:32:00Z',
  },
  {
    id: 'sc-6', channelId: 'ch-api-design', agentEntity: entityDelta, sessionId: 'sess-6',
    status: 'completed', taskTitle: 'Prototype SSE data feed', taskId: 'SF-165',
    branch: 'feat/sse-data-feed', duration: '22m 08s', filesChanged: 6, testsAdded: 4,
    timestamp: '2026-04-13T12:10:00Z',
  },
]
