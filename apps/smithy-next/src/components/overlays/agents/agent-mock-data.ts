import type { AgentExtended, RoleDefinition } from './agent-types'
import { currentUser } from '../../../mock-data'

// ── Role Definitions ──

export const mockRoleDefinitions: RoleDefinition[] = [
  {
    id: 'rd-director', name: 'Director', category: 'orchestrator', builtIn: true,
    description: 'Orchestrates task decomposition, delegates to workers, and reviews results.',
    rolePrompt: 'You are a senior software engineer directing implementation of features. Break down tasks, assign to workers, and review results. Coordinate across multiple work streams and ensure quality.',
    tags: ['orchestration', 'planning'],
    defaultTools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'agent'],
    skills: [
      { name: 'Director Guidelines', path: '.stoneforge/skills/director-guidelines.md', description: 'Task decomposition and delegation patterns' },
    ],
    hooks: [
      { event: 'agent:start', path: '.stoneforge/hooks/director-init.ts', name: 'Director Init' },
    ],
    createdAt: '2 weeks ago', updatedAt: '2 weeks ago',
  },
  {
    id: 'rd-implementer', name: 'Code Implementer', category: 'executor', builtIn: true,
    description: 'Executes coding tasks efficiently — writes, tests, and iterates on code.',
    rolePrompt: 'You are a code implementation agent. Execute assigned tasks efficiently, write clean code, add tests, and report back when complete.',
    tags: ['implementation', 'coding'],
    defaultTools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'],
    createdAt: '2 weeks ago', updatedAt: '2 weeks ago',
  },
  {
    id: 'rd-reviewer', name: 'Code Reviewer', category: 'reviewer', builtIn: true,
    description: 'Reviews code changes for correctness, style, security, and test coverage.',
    rolePrompt: 'You are a code reviewer. Review code changes for correctness, style, security concerns, and test coverage. Approve clean PRs and request changes with specific feedback.',
    tags: ['code-review', 'merge-review'],
    defaultTools: ['read', 'grep', 'glob', 'bash'],
    skills: [
      { name: 'Review Checklist', path: '.stoneforge/skills/review-checklist.md', description: 'Standard code review criteria and patterns' },
    ],
    customTools: [
      { name: 'Lint Check', path: '.stoneforge/tools/lint-check.ts', description: 'Runs project linter and returns structured results' },
    ],
    hooks: [
      { event: 'tool:before', path: '.stoneforge/hooks/readonly-guard.ts', name: 'Readonly Guard' },
      { event: 'task:completed', path: '.stoneforge/hooks/post-review-summary.ts', name: 'Post-Review Summary' },
    ],
    createdAt: '2 weeks ago', updatedAt: '2 weeks ago',
  },
  {
    id: 'rd-bugfix', name: 'Bug Fixer', category: 'executor', builtIn: true,
    description: 'Diagnoses and fixes bugs with focused, minimal-impact changes.',
    rolePrompt: 'You are a bug fix agent. Diagnose issues, identify root causes, and implement minimal, targeted fixes. Write regression tests for each fix.',
    tags: ['bugfix', 'debugging'],
    defaultTools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'],
    createdAt: '2 weeks ago', updatedAt: '2 weeks ago',
  },
  {
    id: 'rd-docs', name: 'Documentation Writer', category: 'executor', builtIn: true,
    description: 'Reviews, updates, and maintains project documentation and API references.',
    rolePrompt: 'You are a documentation agent. Review, update, and maintain workspace documentation. Generate API references and keep changelogs current.',
    tags: ['docs', 'api'],
    defaultTools: ['read', 'write', 'edit', 'grep', 'glob'],
    createdAt: '2 weeks ago', updatedAt: '2 weeks ago',
  },
  {
    id: 'rd-recovery', name: 'Recovery Agent', category: 'executor', builtIn: true,
    description: 'Diagnoses and recovers tasks left in a broken state by other agents.',
    rolePrompt: 'You are a recovery agent. Diagnose and recover tasks left in a broken state. Clean up orphaned worktrees, fix broken branches, and resume interrupted work.',
    tags: ['recovery', 'debugging'],
    defaultTools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'],
    createdAt: '2 weeks ago', updatedAt: '2 weeks ago',
  },
  // Custom role definitions (user-created)
  {
    id: 'rd-frontend', name: 'Frontend Specialist', category: 'executor',
    description: 'Specializes in React, TypeScript, and CSS implementation tasks.',
    rolePrompt: 'You are a frontend specialist. Implement UI components, handle state management, write CSS, and ensure accessibility. Use React best practices and TypeScript strict mode.',
    tags: ['frontend', 'react', 'typescript'],
    defaultTools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'],
    skills: [
      { name: 'Frontend Standards', path: '.stoneforge/skills/frontend-standards.md', description: 'React patterns, TypeScript conventions, and CSS guidelines' },
    ],
    createdAt: '5 days ago', updatedAt: '3 days ago',
  },
  {
    id: 'rd-auth', name: 'Auth Specialist', category: 'executor',
    description: 'Handles authentication, authorization, and security implementation.',
    rolePrompt: 'You are an authentication specialist. Implement OAuth flows, token management, session handling, and security best practices. Follow OWASP guidelines.',
    tags: ['auth', 'security', 'backend'],
    defaultTools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'],
    createdAt: '4 days ago', updatedAt: '4 days ago',
  },
]

// ── Runtimes ──

// Canonical runtime mock data — re-exported from runtimes module
export { mockRuntimes, mockHosts } from '../runtimes/runtime-mock-data'

// ── Agents (typeless compute resources) ──

export const mockAgentsExtended: AgentExtended[] = [
  {
    id: 'a1', name: 'Agent Alpha', tags: ['local', 'fast'],
    ownerUserId: currentUser.id,
    model: 'sonnet-4.6', provider: 'claude-code', environment: 'local', runtimeId: 'rt-local-1', status: 'running',
    lastActiveAt: '25 min ago', totalUptime: '47h 32m', totalTasksCompleted: 42, errorRate: 2,
    maxConcurrentTasks: 2, spawnPriority: 10, enabled: true,
    config: { maxTokens: 8192, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'agent'] },
    sessions: [
      { id: 's1', agentId: 'a1', roleDefinitionId: 'rd-director', status: 'active', startedAt: '25 min ago', duration: '25m', tasksCompleted: 2, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-142', title: 'Implement OAuth2 PKCE flow for CLI authentication', status: 'in-progress', timeSpent: '18m', branch: 'feat/oauth-pkce' },
        { id: 'SF-142-1', title: 'Generate PKCE challenge and verifier', status: 'done', timeSpent: '7m', branch: 'feat/oauth-pkce' },
      ]},
      { id: 's2', agentId: 'a1', roleDefinitionId: 'rd-director', status: 'completed', startedAt: '2 hrs ago', duration: '1h 32m', tasksCompleted: 4, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-136', title: 'Refactor agent pool connection management', status: 'done', timeSpent: '45m', branch: 'refactor/auth' },
        { id: 'SF-145', title: 'Migrate task storage to SQLite with WAL mode', status: 'done', timeSpent: '22m', branch: 'refactor/auth' },
        { id: 'SF-134', title: 'Add rate limit banner with wake timer', status: 'done', timeSpent: '15m', branch: 'refactor/auth' },
        { id: 'SF-148', title: 'Implement agent session resume from checkpoint', status: 'done', timeSpent: '10m', branch: 'refactor/auth' },
      ]},
      { id: 's3', agentId: 'a1', roleDefinitionId: 'rd-director', status: 'completed', startedAt: 'Yesterday', duration: '3h 15m', tasksCompleted: 7, errors: 1, launchedByUserId: currentUser.id, tasks: [] },
    ],
    recentActivity: [
      { id: 'e1', type: 'task_started', message: 'Started working on "Implement OAuth2 PKCE flow"', timestamp: '25 min ago' },
      { id: 'e2', type: 'task_completed', message: 'Completed "Add session token migration"', timestamp: '18 min ago' },
      { id: 'e3', type: 'session_started', message: 'Session started', timestamp: '25 min ago' },
      { id: 'e4', type: 'session_stopped', message: 'Previous session completed (4 tasks)', timestamp: '2 hrs ago' },
      { id: 'e5', type: 'task_completed', message: 'Completed "Write auth integration tests"', timestamp: '2 hrs ago' },
    ],
  },
  {
    id: 'a2', name: 'Agent Beta', tags: ['local', 'fast'],
    ownerUserId: currentUser.id,
    model: 'sonnet-4.6', provider: 'claude-code', environment: 'local', runtimeId: 'rt-local-1', status: 'idle',
    lastActiveAt: '1 hr ago', totalUptime: '12h 15m', totalTasksCompleted: 18, errorRate: 0,
    maxConcurrentTasks: 2, spawnPriority: 10, enabled: true,
    config: { maxTokens: 8192, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'agent'] },
    sessions: [
      { id: 's4', agentId: 'a2', roleDefinitionId: 'rd-bugfix', status: 'completed', startedAt: '1 hr ago', duration: '45m', tasksCompleted: 2, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-139', title: 'Add WebSocket reconnection with exponential backoff', status: 'done', timeSpent: '30m', branch: 'fix/ws-reconnect' },
        { id: 'SF-137', title: 'Fix terminal resize event not propagating to PTY', status: 'done', timeSpent: '15m', branch: 'fix/pty-resize' },
      ]},
    ],
    recentActivity: [
      { id: 'e6', type: 'session_stopped', message: 'Session completed (2 tasks)', timestamp: '1 hr ago' },
      { id: 'e7', type: 'task_completed', message: 'Completed "Add connection retry logic"', timestamp: '1 hr ago' },
    ],
  },
  {
    id: 'a3', name: 'Agent Gamma', tags: ['cloud', 'gpu', 'thorough'],
    ownerUserId: 'user-sarah',
    model: 'opus-4.6', provider: 'claude-code', environment: 'cloud', runtimeId: 'rt-ssh-2', status: 'error',
    lastActiveAt: '30 min ago', totalUptime: '5h 10m', totalTasksCompleted: 8, errorRate: 12,
    maxConcurrentTasks: 1, spawnPriority: 5, enabled: false,
    config: { maxTokens: 16384, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'web_search', 'agent'] },
    sessions: [
      { id: 's5', agentId: 'a3', roleDefinitionId: 'rd-director', status: 'error', startedAt: '30 min ago', duration: '2m', tasksCompleted: 0, errors: 1, launchedByUserId: 'user-sarah', tasks: [] },
    ],
    recentActivity: [
      { id: 'e8', type: 'error', message: 'SSH connection timeout to cloud worker', timestamp: '30 min ago' },
      { id: 'e9', type: 'session_started', message: 'Session started', timestamp: '32 min ago' },
    ],
  },
  {
    id: 'a4', name: 'Agent Delta', tags: ['local', 'fast'],
    ownerUserId: currentUser.id,
    model: 'sonnet-4.6', provider: 'claude-code', environment: 'local', runtimeId: 'rt-local-1', status: 'running',
    lastActiveAt: '10 min ago', totalUptime: '22h 45m', totalTasksCompleted: 31, errorRate: 3,
    maxConcurrentTasks: 3, spawnPriority: 8, enabled: true,
    config: { maxTokens: 4096, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'] },
    sessions: [
      { id: 's6', agentId: 'a4', roleDefinitionId: 'rd-auth', status: 'active', startedAt: '10 min ago', duration: '10m', tasksCompleted: 1, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-142-2', title: 'Implement token exchange callback handler', status: 'in-progress', timeSpent: '10m', branch: 'feat/oauth-pkce' },
      ]},
      { id: 's6b', agentId: 'a4', roleDefinitionId: 'rd-implementer', status: 'completed', startedAt: '1 hr ago', duration: '28m', tasksCompleted: 2, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-142-1', title: 'Generate PKCE challenge and verifier', status: 'done', timeSpent: '15m', branch: 'feat/oauth-pkce' },
        { id: 'SF-142', title: 'Implement OAuth2 PKCE flow for CLI authentication', status: 'done', timeSpent: '13m', branch: 'feat/oauth-pkce' },
      ]},
    ],
    recentActivity: [
      { id: 'e10', type: 'task_started', message: 'Started "Implement OAuth2 PKCE flow — token exchange"', timestamp: '10 min ago' },
      { id: 'e11', type: 'session_started', message: 'Spawned by dispatch for task SF-142-2', timestamp: '10 min ago' },
    ],
  },
  {
    id: 'a5', name: 'Agent Epsilon', tags: ['cloud', 'docker'],
    ownerUserId: currentUser.id,
    model: 'sonnet-4.6', provider: 'claude-code', environment: 'cloud', runtimeId: 'rt-docker-1', status: 'idle',
    lastActiveAt: '3 hrs ago', totalUptime: '8h 20m', totalTasksCompleted: 12, errorRate: 0,
    maxConcurrentTasks: 2, spawnPriority: 6, enabled: false,
    config: { maxTokens: 4096, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'] },
    sessions: [
      { id: 's7a', agentId: 'a5', roleDefinitionId: 'rd-frontend', status: 'completed', startedAt: '3 hrs ago', duration: '35m', tasksCompleted: 2, errors: 0, launchedByUserId: 'user-sarah', tasks: [
        { id: 'SF-150', title: 'Design system: migrate to Inter font + new token scale', status: 'done', timeSpent: '20m', branch: 'feat/design-system' },
        { id: 'SF-155', title: 'Add dark mode contrast accessibility audit', status: 'done', timeSpent: '15m', branch: 'feat/design-system' },
      ]},
    ],
    recentActivity: [
      { id: 'e12', type: 'session_stopped', message: 'Session completed (2 tasks)', timestamp: '3 hrs ago' },
    ],
  },
  {
    id: 'a6', name: 'Agent Zeta', tags: ['local', 'fast'],
    ownerUserId: currentUser.id,
    model: 'sonnet-4.6', provider: 'claude-code', environment: 'local', runtimeId: 'rt-local-1', status: 'running',
    lastActiveAt: '12 min ago', totalUptime: '18h 30m', totalTasksCompleted: 24, errorRate: 0,
    maxConcurrentTasks: 2, spawnPriority: 7, enabled: true,
    config: { maxTokens: 8192, temperature: 0, tools: ['read', 'grep', 'glob', 'bash'] },
    sessions: [
      { id: 's7', agentId: 'a6', roleDefinitionId: 'rd-reviewer', status: 'active', startedAt: '12 min ago', duration: '12m', tasksCompleted: 1, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-142', title: 'Review: Implement OAuth2 PKCE flow', status: 'in-progress', timeSpent: '12m' },
      ]},
      { id: 's8', agentId: 'a6', roleDefinitionId: 'rd-reviewer', status: 'completed', startedAt: '3 hrs ago', duration: '45m', tasksCompleted: 3, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-136', title: 'Review: Refactor agent pool connection management', status: 'done', timeSpent: '20m' },
        { id: 'SF-139', title: 'Review: WebSocket reconnection', status: 'done', timeSpent: '15m' },
        { id: 'SF-137', title: 'Review: Fix terminal resize event', status: 'done', timeSpent: '10m' },
      ]},
    ],
    recentActivity: [
      { id: 'e15', type: 'task_started', message: 'Reviewing PR #42: OAuth PKCE implementation', timestamp: '12 min ago' },
      { id: 'e16', type: 'session_started', message: 'Triggered by PR review automation', timestamp: '12 min ago' },
    ],
  },
  {
    id: 'a7', name: 'Agent Eta', tags: ['cloud', 'ssh'],
    ownerUserId: currentUser.id,
    model: 'sonnet-4.6', provider: 'claude-code', environment: 'cloud', runtimeId: 'rt-ssh-2', status: 'idle',
    lastActiveAt: '6 hrs ago', totalUptime: '4h 15m', totalTasksCompleted: 8, errorRate: 0,
    maxConcurrentTasks: 2, spawnPriority: 4, enabled: true,
    config: { maxTokens: 8192, temperature: 0, tools: ['read', 'write', 'edit', 'grep', 'glob'] },
    sessions: [
      { id: 's9', agentId: 'a7', roleDefinitionId: 'rd-docs', status: 'completed', startedAt: '6 hrs ago', duration: '35m', tasksCompleted: 3, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-151', title: 'Update API reference for diff viewer', status: 'done', timeSpent: '15m' },
        { id: 'SF-153', title: 'Update CI/CD pipeline docs', status: 'done', timeSpent: '10m' },
        { id: 'SF-136', title: 'Add changelog for agent pool refactor', status: 'done', timeSpent: '10m' },
      ]},
    ],
    recentActivity: [
      { id: 'e17', type: 'session_stopped', message: 'Docs automation run completed (3 tasks)', timestamp: '6 hrs ago' },
    ],
  },
  {
    id: 'a8', name: 'Agent Theta', tags: ['local', 'docker', 'thorough'],
    ownerUserId: currentUser.id,
    model: 'opus-4.6', provider: 'claude-code', environment: 'local', runtimeId: 'rt-docker-1', status: 'running',
    lastActiveAt: '5 min ago', totalUptime: '36h 10m', totalTasksCompleted: 55, errorRate: 1,
    maxConcurrentTasks: 3, spawnPriority: 9, enabled: true,
    config: { maxTokens: 8192, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'web_search'] },
    sessions: [
      { id: 's8a', agentId: 'a8', roleDefinitionId: 'rd-implementer', status: 'active', startedAt: '2 hrs ago', duration: '2h', tasksCompleted: 3, errors: 0, launchedByUserId: 'user-james', tasks: [
        { id: 'SF-145', title: 'Migrate task storage to SQLite with WAL mode', status: 'in-progress', timeSpent: '45m', branch: 'feat/sqlite-wal' },
        { id: 'SF-153', title: 'Add CI/CD pipeline visualization', status: 'done', timeSpent: '35m', branch: 'feat/sqlite-wal' },
        { id: 'SF-154', title: 'Support custom workflow triggers via webhooks', status: 'done', timeSpent: '40m', branch: 'feat/sqlite-wal' },
      ]},
    ],
    recentActivity: [
      { id: 'e13', type: 'task_started', message: 'Started "Migrate database schema v4→v5"', timestamp: '5 min ago' },
      { id: 'e14', type: 'task_completed', message: 'Completed "Update ORM model definitions"', timestamp: '20 min ago' },
    ],
  },
  {
    id: 'a9', name: 'Agent Iota', tags: ['local', 'ssh'],
    ownerUserId: currentUser.id,
    model: 'opus-4.6', provider: 'claude-code', environment: 'local', runtimeId: 'rt-ssh-1', status: 'idle',
    lastActiveAt: '1 day ago', totalUptime: '2h 45m', totalTasksCompleted: 4, errorRate: 0,
    maxConcurrentTasks: 1, spawnPriority: 3, enabled: true,
    config: { maxTokens: 16384, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'] },
    sessions: [
      { id: 's10', agentId: 'a9', roleDefinitionId: 'rd-recovery', status: 'completed', startedAt: '1 day ago', duration: '25m', tasksCompleted: 1, errors: 0, launchedByUserId: currentUser.id, tasks: [
        { id: 'SF-148', title: 'Recover broken worktree from agent crash', status: 'done', timeSpent: '25m', branch: 'recovery/agent-crash' },
      ]},
    ],
    recentActivity: [
      { id: 'e18', type: 'session_stopped', message: 'Recovery automation completed', timestamp: '1 day ago' },
    ],
  },
]
