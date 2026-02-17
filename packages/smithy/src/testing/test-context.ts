/**
 * Test Context for Orchestration E2E Tests
 *
 * Provides isolated test workspace setup and teardown for orchestration tests.
 * Each test run gets a completely isolated temporary directory with:
 * - Fresh git repository
 * - Minimal project structure
 * - Temporary SQLite database
 * - All required services configured
 *
 * @module
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import type { EntityId, ElementId, Task, Priority } from '@stoneforge/core';
import { createTimestamp, createTask as coreCreateTask, ElementType, asEntityId, asElementId } from '@stoneforge/core';
import type { QuarryAPI, InboxService } from '@stoneforge/quarry';
import { createStorage, initializeSchema, createInboxService } from '@stoneforge/quarry';

import type { OrchestratorAPI, AgentEntity } from '../api/index.js';
import { createOrchestratorAPI } from '../api/index.js';
import type { AgentRegistry } from '../services/agent-registry.js';
import { createAgentRegistry } from '../services/agent-registry.js';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';
import type { DispatchDaemon } from '../services/dispatch-daemon.js';
import { createDispatchDaemon } from '../services/dispatch-daemon.js';
import type { WorktreeManager } from '../git/worktree-manager.js';
import { createWorktreeManager } from '../git/worktree-manager.js';
import type { TaskAssignmentService } from '../services/task-assignment-service.js';
import { createTaskAssignmentService } from '../services/task-assignment-service.js';
import type { DispatchService } from '../services/dispatch-service.js';
import { createDispatchService } from '../services/dispatch-service.js';
import type { StewardScheduler } from '../services/steward-scheduler.js';
import { createStewardScheduler, createDefaultStewardExecutor } from '../services/steward-scheduler.js';
import type { AgentRole } from '../types/agent.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Test context providing access to all services and utilities
 */
export interface TestContext {
  /** OrchestratorAPI for agent and task operations */
  readonly api: OrchestratorAPI;
  /** Underlying QuarryAPI */
  readonly stoneforgeApi: QuarryAPI;
  /** Dispatch daemon for task assignment */
  readonly daemon: DispatchDaemon;
  /** Session manager for agent sessions */
  readonly sessionManager: SessionManager;
  /** Agent registry for agent management */
  readonly agentRegistry: AgentRegistry;
  /** Worktree manager for git operations */
  readonly worktreeManager: WorktreeManager;
  /** Task assignment service */
  readonly taskAssignment: TaskAssignmentService;
  /** Dispatch service for task dispatch */
  readonly dispatchService: DispatchService;
  /** Steward scheduler for scheduled executions */
  readonly stewardScheduler: StewardScheduler;
  /** Inbox service for message handling */
  readonly inboxService: InboxService;
  /** Path to the temporary workspace */
  readonly tempWorkspace: string;
  /** Path to the database file */
  readonly dbPath: string;
  /** System entity ID for creating test data */
  readonly systemEntityId: EntityId;
  /** Log a message to the test output */
  readonly log: (message: string) => void;
  /** Whether verbose logging is enabled */
  readonly verbose: boolean;
  /** Test mode: 'mock' uses mock sessions, 'real' spawns Claude processes */
  readonly mode: 'mock' | 'real';
  /** Cleanup function - call when tests are done */
  readonly cleanup: () => Promise<void>;
}

/**
 * Options for creating a test context
 */
export interface TestContextOptions {
  /** Enable verbose logging (default: false) */
  readonly verbose?: boolean;
  /** Custom temp directory prefix (default: 'orchestration-test-') */
  readonly tempPrefix?: string;
  /** Poll interval for daemon in ms (default: 2000) */
  readonly pollIntervalMs?: number;
  /** Skip daemon startup (default: false) */
  readonly skipDaemonStart?: boolean;
  /** Test mode: 'mock' (default) or 'real' (spawns Claude processes) */
  readonly mode?: 'mock' | 'real';
}

/**
 * Mock session manager for testing without real Claude processes
 */
export interface MockSessionManager extends SessionManager {
  /** Tracked mock sessions */
  readonly mockSessions: Map<string, MockSession>;
  /** Create a mock session for an agent */
  createMockSession(agentId: EntityId, options?: MockSessionOptions): MockSession;
  /** Complete a mock session */
  completeMockSession(sessionId: string): void;
}

/**
 * Mock session for testing
 */
export interface MockSession {
  readonly id: string;
  readonly agentId: EntityId;
  readonly workingDirectory: string;
  readonly worktree?: string;
  readonly status: 'running' | 'terminated';
  readonly events: EventEmitter;
}

/**
 * Options for creating a mock session
 */
export interface MockSessionOptions {
  readonly workingDirectory?: string;
  readonly worktree?: string;
}

// ============================================================================
// Test Context Creation
// ============================================================================

/**
 * Sets up an isolated test context for orchestration tests.
 *
 * Creates:
 * - Temporary directory with git repo
 * - Minimal project structure
 * - Fresh SQLite database
 * - All required services
 *
 * @param options - Setup options
 * @returns The test context
 *
 * @example
 * ```typescript
 * const ctx = await setupTestContext({ verbose: true });
 * try {
 *   // Run tests...
 * } finally {
 *   await ctx.cleanup();
 * }
 * ```
 */
export async function setupTestContext(
  options: TestContextOptions = {}
): Promise<TestContext> {
  const verbose = options.verbose ?? false;
  const tempPrefix = options.tempPrefix ?? 'orchestration-test-';
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const mode = options.mode ?? 'mock';

  const log = (message: string) => {
    if (verbose) {
      console.log(`    ${message}`);
    }
  };

  // 1. Create isolated temp workspace
  const tempWorkspace = await mkdtemp(join(tmpdir(), tempPrefix));
  log(`Created temp workspace: ${tempWorkspace}`);

  try {
    // 2. Initialize git repo
    await initializeGitRepo(tempWorkspace);
    log('Initialized git repository');

    // 3. Create minimal project structure
    await createProjectStructure(tempWorkspace);
    log('Created project structure');

    // 4. Create initial commit
    execSync('git add -A && git commit -m "Initial commit"', {
      cwd: tempWorkspace,
      stdio: 'pipe',
    });
    log('Created initial commit');

    // 4b. Create bare repo as fake remote (allows workers to push branches)
    const bareRepoPath = join(tempWorkspace, '.test-remote.git');
    execSync(`git init --bare "${bareRepoPath}"`, { stdio: 'pipe' });
    execSync(`git remote add origin "${bareRepoPath}"`, { cwd: tempWorkspace, stdio: 'pipe' });
    const defaultBranch = execSync('git branch --show-current', { cwd: tempWorkspace, encoding: 'utf-8' }).trim();
    execSync(`git push -u origin ${defaultBranch}`, { cwd: tempWorkspace, stdio: 'pipe' });
    log('Created local bare remote');

    // 5. Initialize Stoneforge database
    const stoneforgeDir = join(tempWorkspace, '.stoneforge');
    await mkdir(stoneforgeDir, { recursive: true });
    const dbPath = join(stoneforgeDir, 'stoneforge.db');

    const storage = createStorage({ path: dbPath, create: true });
    initializeSchema(storage);
    log(`Initialized database: ${dbPath}`);

    // 6. Create API and system entity
    const api = createOrchestratorAPI(storage);
    const stoneforgeApi = api as unknown as QuarryAPI;
    const systemEntity = await createSystemEntity(stoneforgeApi);
    log(`Created system entity: ${systemEntity}`);

    // 7. Create all services
    const agentRegistry = createAgentRegistry(api);
    const taskAssignment = createTaskAssignmentService(api);
    const inboxService = createInboxService(storage);
    const dispatchService = createDispatchService(api, taskAssignment, agentRegistry);

    const worktreeManager = createWorktreeManager({
      workspaceRoot: tempWorkspace,
      worktreeDir: '.stoneforge/.worktrees',
    });
    await worktreeManager.initWorkspace();
    log('Initialized worktree manager');

    const stewardScheduler = createStewardScheduler(
      agentRegistry,
      createDefaultStewardExecutor()
    );

    // 8. Create session manager (mock or real)
    let sessionManager: SessionManager;
    if (mode === 'real') {
      const { createSpawnerService } = await import('../runtime/spawner.js');
      const { createSessionManager: createRealSessionManager } = await import('../runtime/session-manager.js');

      const elBinDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '.bin');

      const spawner = createSpawnerService({
        workingDirectory: tempWorkspace,
        stoneforgeRoot: tempWorkspace,
        environmentVariables: {
          PATH: `${elBinDir}${delimiter}${process.env.PATH ?? ''}`,
        },
      });
      sessionManager = createRealSessionManager(spawner, stoneforgeApi, agentRegistry);
      log('Created real session manager (spawner-backed)');
    } else {
      sessionManager = createMockSessionManager(agentRegistry);
      log('Created mock session manager');
    }

    // 8b. Write test prompt overrides for real mode
    if (mode === 'real') {
      await writeTestPromptOverrides(tempWorkspace);
      log('Wrote test prompt overrides');
    }

    // 9. Create dispatch daemon
    // In real mode, enforce a max session duration so stuck workers
    // get reaped and don't block subsequent test dispatches.
    const daemon = createDispatchDaemon(
      stoneforgeApi,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignment,
      stewardScheduler,
      inboxService,
      {
        pollIntervalMs,
        maxSessionDurationMs: mode === 'real' ? 180_000 : 0,
      }
    );

    // 10. Start daemon if not skipped
    if (!options.skipDaemonStart) {
      await daemon.start();
      log('Started dispatch daemon');
    }

    // 11. Cleanup function
    const cleanup = async () => {
      log('Cleaning up test context...');

      // Stop daemon
      await daemon.stop();
      log('Stopped daemon');

      // Stop any running sessions with grace period for real mode
      const running = sessionManager.listSessions({ status: 'running' });
      const starting = sessionManager.listSessions({ status: 'starting' });
      const sessionsToStop = [...running, ...starting];

      for (const session of sessionsToStop) {
        try {
          if (mode === 'real') {
            // Give real sessions a grace period before force-terminating
            const gracefulStop = sessionManager.stopSession(session.id, { graceful: true });
            const forceStop = new Promise<void>((resolve) =>
              setTimeout(async () => {
                try {
                  await sessionManager.stopSession(session.id, { graceful: false });
                } catch { /* ignore */ }
                resolve();
              }, 5000)
            );
            await Promise.race([gracefulStop, forceStop]);
          } else {
            await sessionManager.stopSession(session.id, { graceful: false });
          }
        } catch { /* ignore */ }
      }
      log(`Terminated ${sessionsToStop.length} sessions`);

      // Clean up worktrees
      try {
        const worktrees = await worktreeManager.listWorktrees();
        for (const wt of worktrees) {
          try {
            await worktreeManager.removeWorktree(wt.path, { force: true });
          } catch { /* ignore */ }
        }
        log(`Cleaned up ${worktrees.length} worktrees`);
      } catch { /* ignore */ }

      // Delete temp workspace
      if (existsSync(tempWorkspace)) {
        await rm(tempWorkspace, { recursive: true, force: true });
        log('Deleted temp workspace');
      }
    };

    // Safety net: clean up on process termination
    const sigintHandler = () => {
      cleanup().catch(() => {}).finally(() => process.exit(1));
    };
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigintHandler);

    return {
      api,
      stoneforgeApi,
      daemon,
      sessionManager,
      agentRegistry,
      worktreeManager,
      taskAssignment,
      dispatchService,
      stewardScheduler,
      inboxService,
      tempWorkspace,
      dbPath,
      systemEntityId: systemEntity,
      log,
      verbose,
      mode,
      cleanup,
    };
  } catch (error) {
    // Cleanup on setup failure
    if (existsSync(tempWorkspace)) {
      await rm(tempWorkspace, { recursive: true, force: true });
    }
    throw error;
  }
}

// ============================================================================
// Git Repository Setup
// ============================================================================

/**
 * Initializes a git repository in the given directory.
 */
async function initializeGitRepo(dir: string): Promise<void> {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@orchestration-test.local"', {
    cwd: dir,
    stdio: 'pipe',
  });
  execSync('git config user.name "Orchestration Test"', {
    cwd: dir,
    stdio: 'pipe',
  });
}

/**
 * Creates a minimal project structure for testing.
 */
async function createProjectStructure(dir: string): Promise<void> {
  // Create directories
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, '.stoneforge'), { recursive: true });

  // Create package.json
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
        scripts: {
          test: 'echo "No tests configured"',
          build: 'echo "No build configured"',
        },
      },
      null,
      2
    )
  );

  // Create src/index.ts
  await writeFile(
    join(dir, 'src/index.ts'),
    `/**
 * Test project entry point
 * Agents can modify this file during tests.
 */

export function hello(): string {
  return 'Hello, World!';
}

export function add(a: number, b: number): number {
  return a + b;
}
`
  );

  // Create README.md
  await writeFile(
    join(dir, 'README.md'),
    `# Test Project

This is a minimal test project for orchestration E2E testing.
Agents can modify files in this project during tests.
`
  );

  // Create .gitignore
  await writeFile(
    join(dir, '.gitignore'),
    `node_modules/
dist/
.stoneforge/.worktrees/
.test-remote.git/
*.db
*.db-journal
`
  );
}

/**
 * Creates a system entity for test operations.
 */
async function createSystemEntity(api: QuarryAPI): Promise<EntityId> {
  const { createEntity, EntityTypeValue } = await import('@stoneforge/core');
  const entity = await createEntity({
    name: 'test-system',
    entityType: EntityTypeValue.SYSTEM,
    createdBy: 'system:test' as EntityId,
    tags: ['test', 'system'],
    metadata: { description: 'System entity for orchestration tests' },
  });
  const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
  return asEntityId(saved.id);
}

// ============================================================================
// Test Prompt Overrides (Real Mode)
// ============================================================================

/**
 * Writes constrained prompt overrides into the workspace for real-mode testing.
 * These instruct agents to work fast, skip exploration, and use the `sf` CLI.
 */
async function writeTestPromptOverrides(workspacePath: string): Promise<void> {
  const {
    buildTestWorkerOverride,
    buildTestDirectorOverride,
    buildTestStewardOverride,
  } = await import('./test-prompts.js');

  const promptsDir = join(workspacePath, '.stoneforge', 'prompts');
  await mkdir(promptsDir, { recursive: true });

  await writeFile(join(promptsDir, 'worker.md'), buildTestWorkerOverride());
  await writeFile(join(promptsDir, 'director.md'), buildTestDirectorOverride());
  await writeFile(join(promptsDir, 'steward.md'), buildTestStewardOverride());
}

// ============================================================================
// Mock Session Manager
// ============================================================================

/**
 * Creates a mock session manager that simulates agent sessions
 * without actually spawning Claude processes.
 */
export function createMockSessionManager(
  agentRegistry: AgentRegistry
): MockSessionManager {
  const sessions = new Map<string, SessionRecord>();
  const agentSessions = new Map<EntityId, string>();
  const mockSessions = new Map<string, MockSession>();
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  let sessionCounter = 0;

  const manager: MockSessionManager = {
    mockSessions,

    createMockSession(
      agentId: EntityId,
      options: MockSessionOptions = {}
    ): MockSession {
      const id = `mock-session-${++sessionCounter}-${Date.now()}`;
      const events = new EventEmitter();

      const mockSession: MockSession = {
        id,
        agentId,
        workingDirectory: options.workingDirectory ?? process.cwd(),
        worktree: options.worktree,
        status: 'running',
        events,
      };

      mockSessions.set(id, mockSession);

      // Also create a session record
      const record: SessionRecord = {
        id,
        agentId,
        agentRole: 'worker',
        mode: 'headless',
        status: 'running',
        workingDirectory: mockSession.workingDirectory,
        worktree: mockSession.worktree,
        createdAt: createTimestamp(),
        lastActivityAt: createTimestamp(),
      };

      sessions.set(id, record);
      agentSessions.set(agentId, id);

      return mockSession;
    },

    completeMockSession(sessionId: string): void {
      const mock = mockSessions.get(sessionId);
      if (mock) {
        (mock as { status: string }).status = 'terminated';
        mock.events.emit('exit', 0, null);
      }

      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, {
          ...session,
          status: 'terminated',
          endedAt: createTimestamp(),
        });
        agentSessions.delete(session.agentId);
      }
    },

    async startSession(
      agentId: EntityId,
      options?: Parameters<SessionManager['startSession']>[1]
    ): Promise<{ session: SessionRecord; events: EventEmitter }> {
      const existing = agentSessions.get(agentId);
      if (existing && sessions.get(existing)?.status === 'running') {
        throw new Error(`Agent ${agentId} already has an active session`);
      }

      const agent = await agentRegistry.getAgent(agentId);
      const agentMeta = agent?.metadata?.agent as { agentRole?: AgentRole } | undefined;
      const agentRole = agentMeta?.agentRole ?? 'worker';

      const id = `mock-session-${++sessionCounter}-${Date.now()}`;
      const events = new EventEmitter();

      const session: SessionRecord = {
        id,
        agentId,
        agentRole,
        mode: 'headless',
        status: 'running',
        workingDirectory: options?.workingDirectory ?? process.cwd(),
        worktree: options?.worktree,
        createdAt: createTimestamp(),
        startedAt: createTimestamp(),
        lastActivityAt: createTimestamp(),
      };

      sessions.set(id, session);
      agentSessions.set(agentId, id);

      const mockSession: MockSession = {
        id,
        agentId,
        workingDirectory: session.workingDirectory,
        worktree: session.worktree,
        status: 'running',
        events,
      };
      mockSessions.set(id, mockSession);

      // Simulate Claude session ID
      const providerSessionId = `claude-${id}`;
      sessions.set(id, { ...session, providerSessionId });

      // Update agent status
      await agentRegistry.updateAgentSession(agentId, providerSessionId, 'running');

      return { session: sessions.get(id)!, events };
    },

    async resumeSession(
      agentId: EntityId,
      options: Parameters<SessionManager['resumeSession']>[1]
    ): Promise<{ session: SessionRecord; events: EventEmitter }> {
      return this.startSession(agentId, {
        workingDirectory: options.workingDirectory,
        worktree: options.worktree,
      });
    },

    async stopSession(
      sessionId: string,
      options?: Parameters<SessionManager['stopSession']>[1]
    ): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      sessions.set(sessionId, {
        ...session,
        status: 'terminated',
        endedAt: createTimestamp(),
        terminationReason: options?.reason,
      });

      agentSessions.delete(session.agentId);

      const mock = mockSessions.get(sessionId);
      if (mock) {
        (mock as { status: string }).status = 'terminated';
        mock.events.emit('exit', 0, null);
      }

      await agentRegistry.updateAgentSession(session.agentId, undefined, 'idle');
    },

    async suspendSession(sessionId: string, reason?: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      sessions.set(sessionId, {
        ...session,
        status: 'suspended',
        endedAt: createTimestamp(),
        terminationReason: reason,
      });

      agentSessions.delete(session.agentId);
      await agentRegistry.updateAgentSession(
        session.agentId,
        session.providerSessionId,
        'suspended'
      );
    },

    async interruptSession(sessionId: string): Promise<void> {
      const mock = mockSessions.get(sessionId);
      if (mock) {
        mock.events.emit('interrupt');
      }
    },

    getSession(sessionId: string): SessionRecord | undefined {
      return sessions.get(sessionId);
    },

    getActiveSession(agentId: EntityId): SessionRecord | undefined {
      const sessionId = agentSessions.get(agentId);
      if (!sessionId) return undefined;
      const session = sessions.get(sessionId);
      if (!session || session.status !== 'running') return undefined;
      return session;
    },

    listSessions(filter?: Parameters<SessionManager['listSessions']>[0]): SessionRecord[] {
      let result = Array.from(sessions.values());

      if (filter) {
        if (filter.agentId) {
          result = result.filter(s => s.agentId === filter.agentId);
        }
        if (filter.role) {
          result = result.filter(s => s.agentRole === filter.role);
        }
        if (filter.status) {
          const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
          result = result.filter(s => statuses.includes(s.status));
        }
      }

      return result;
    },

    getMostRecentResumableSession(agentId: EntityId): SessionRecord | undefined {
      const agentSessionList = Array.from(sessions.values())
        .filter(s => s.agentId === agentId && s.providerSessionId)
        .sort((a, b) => {
          const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
          const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
      return agentSessionList[0];
    },

    async getSessionHistory(agentId: EntityId, limit = 10) {
      return Array.from(sessions.values())
        .filter(s => s.agentId === agentId)
        .slice(0, limit)
        .map(s => ({
          id: s.id,
          providerSessionId: s.providerSessionId,
          status: s.status,
          workingDirectory: s.workingDirectory,
          worktree: s.worktree,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          terminationReason: s.terminationReason,
        }));
    },

    async getSessionHistoryByRole(role: AgentRole, limit = 10) {
      return Array.from(sessions.values())
        .filter(s => s.agentRole === role)
        .slice(0, limit)
        .map(s => ({
          id: s.id,
          providerSessionId: s.providerSessionId,
          status: s.status,
          workingDirectory: s.workingDirectory,
          worktree: s.worktree,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          terminationReason: s.terminationReason,
          role: s.agentRole,
          agentId: s.agentId,
          agentName: undefined,
        }));
    },

    async getPreviousSession(role: AgentRole) {
      const history = await this.getSessionHistoryByRole(role, 1);
      return history.find(s => s.status === 'suspended' || s.status === 'terminated');
    },

    async messageSession(
      sessionId: string,
      _options: Parameters<SessionManager['messageSession']>[1]
    ) {
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session not found: ${sessionId}` };
      }

      const mock = mockSessions.get(sessionId);
      if (mock) {
        mock.events.emit('message', _options);
      }

      return { success: true };
    },

    getEventEmitter(sessionId: string) {
      return mockSessions.get(sessionId)?.events;
    },

    recordUserInput(_sessionId: string): void {
      // No-op for mock
    },

    getSessionUserIdleMs(_agentId: EntityId): number | undefined {
      return undefined;
    },

    async persistSession(_sessionId: string): Promise<void> {
      // No-op for mock
    },

    async loadSessionState(_agentId: EntityId): Promise<void> {
      // No-op for mock
    },

    async reconcileOnStartup(): Promise<{ reconciled: number; errors: string[] }> {
      return { reconciled: 0, errors: [] };
    },
  };

  return manager;
}

// ============================================================================
// Test Data Helpers
// ============================================================================

/**
 * Creates a test worker agent.
 */
export async function createTestWorker(
  ctx: TestContext,
  name: string,
  options: { workerMode?: 'ephemeral' | 'persistent' } = {}
): Promise<AgentEntity> {
  return ctx.api.registerWorker({
    name,
    createdBy: ctx.systemEntityId,
    workerMode: options.workerMode ?? 'ephemeral',
    maxConcurrentTasks: 1,
    tags: ['test'],
  });
}

/**
 * Creates a test director agent.
 */
export async function createTestDirector(
  ctx: TestContext,
  name: string
): Promise<AgentEntity> {
  return ctx.api.registerDirector({
    name,
    createdBy: ctx.systemEntityId,
    maxConcurrentTasks: 5,
    tags: ['test'],
  });
}

/**
 * Creates a test steward agent.
 */
export async function createTestSteward(
  ctx: TestContext,
  name: string,
  options: {
    focus?: 'merge' | 'docs' | 'custom';
    triggers?: Array<{ type: 'cron'; schedule: string } | { type: 'event'; event: string }>;
  } = {}
): Promise<AgentEntity> {
  return ctx.api.registerSteward({
    name,
    createdBy: ctx.systemEntityId,
    stewardFocus: options.focus ?? 'merge',
    triggers: options.triggers ?? [],
    maxConcurrentTasks: 1,
    tags: ['test'],
  });
}

/**
 * Creates a test task.
 */
export async function createTestTask(
  ctx: TestContext,
  title: string,
  options: {
    priority?: number;
    description?: string;
    tags?: string[];
    acceptanceCriteria?: string;
  } = {}
): Promise<Task> {
  // Create task using core factory
  const task = await coreCreateTask({
    title,
    createdBy: ctx.systemEntityId,
    priority: (options.priority ?? 5) as Priority,
    tags: options.tags ?? ['test'],
    acceptanceCriteria: options.acceptanceCriteria,
  });

  // Save to database
  const saved = await ctx.api.create<Task>(
    task as unknown as Record<string, unknown> & { type: ElementType; createdBy: EntityId }
  );

  return saved;
}

/**
 * Sends a message to an agent's channel.
 */
export async function sendTestMessage(
  ctx: TestContext,
  agentId: EntityId,
  content: string
): Promise<void> {
  const channelId = await ctx.api.getAgentChannel(agentId);
  if (!channelId) {
    throw new Error(`Agent ${agentId} has no channel`);
  }

  // Create a document for the message content
  const doc = await ctx.stoneforgeApi.create({
    type: 'document',
    kind: 'document',
    subKind: 'message',
    title: 'Test Message',
    content,
    metadata: {},
    tags: ['test'],
    createdBy: ctx.systemEntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
  } as unknown as Parameters<QuarryAPI['create']>[0]);

  // Create the message
  await ctx.stoneforgeApi.create({
    type: 'message',
    kind: 'message',
    subKind: 'direct',
    channel: channelId,
    sender: ctx.systemEntityId,
    contentRef: asElementId(doc.id),
    metadata: {},
    tags: ['test'],
    createdBy: ctx.systemEntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
  } as unknown as Parameters<QuarryAPI['create']>[0]);
}
