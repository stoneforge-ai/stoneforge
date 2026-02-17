/**
 * Service Initialization
 *
 * Creates and exports all orchestrator services.
 */

import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import { createQuarryAPI, createInboxService, createSyncService, createAutoExportService, loadConfig } from '@stoneforge/quarry';
import type { QuarryAPI, InboxService, SyncService, AutoExportService } from '@stoneforge/quarry';
import { createSessionMessageService, type SessionMessageService } from './services/session-messages.js';
import type { EntityId } from '@stoneforge/core';
import {
  createOrchestratorAPI,
  createAgentRegistry,
  createSessionManager,
  createSpawnerService,
  createWorktreeManager,
  createTaskAssignmentService,
  createDispatchService,
  createRoleDefinitionService,
  createWorkerTaskService,
  createStewardScheduler,
  createStewardExecutor,
  createPluginExecutor,
  createDispatchDaemon,
  createAgentPoolService,
  createMergeStewardService,
  createHealthStewardService,
  createDocsStewardService,
  GitRepositoryNotFoundError,
  type OrchestratorAPI,
  type AgentRegistry,
  type SessionManager,
  type SpawnerService,
  type WorktreeManager,
  type TaskAssignmentService,
  type DispatchService,
  type RoleDefinitionService,
  type WorkerTaskService,
  type StewardScheduler,
  type PluginExecutor,
  type DispatchDaemon,
  type AgentPoolService,
  type MergeStewardService,
  type HealthStewardService,
  type DocsStewardService,
  type OnSessionStartedCallback,
  trackListeners,
} from '../index.js';
import { attachSessionEventSaver } from './routes/sessions.js';
import { notifySSEClientsOfNewSession } from './routes/events.js';
import { DB_PATH as DEFAULT_DB_PATH, PROJECT_ROOT as DEFAULT_PROJECT_ROOT, getClaudePath } from './config.js';
import { getDaemonConfigOverrides } from './daemon-state.js';

export interface ServicesOptions {
  dbPath?: string;
  projectRoot?: string;
}

export interface Services {
  api: QuarryAPI;
  orchestratorApi: OrchestratorAPI;
  agentRegistry: AgentRegistry;
  sessionManager: SessionManager;
  spawnerService: SpawnerService;
  worktreeManager: WorktreeManager | undefined;
  taskAssignmentService: TaskAssignmentService;
  dispatchService: DispatchService;
  roleDefinitionService: RoleDefinitionService;
  workerTaskService: WorkerTaskService;
  stewardScheduler: StewardScheduler;
  pluginExecutor: PluginExecutor;
  poolService: AgentPoolService | undefined;
  inboxService: InboxService;
  syncService: SyncService;
  autoExportService: AutoExportService;
  mergeStewardService: MergeStewardService;
  healthStewardService: HealthStewardService;
  docsStewardService: DocsStewardService;
  dispatchDaemon: DispatchDaemon | undefined;
  sessionInitialPrompts: Map<string, string>;
  sessionMessageService: SessionMessageService;
  storageBackend: StorageBackend;
}

export async function initializeServices(options: ServicesOptions = {}): Promise<Services> {
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  const projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;

  if (dbPath !== ':memory:') {
    const { mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const storageBackend = createStorage({ path: dbPath });
  initializeSchema(storageBackend);

  const api = createQuarryAPI(storageBackend);
  const orchestratorApi = createOrchestratorAPI(storageBackend);
  const agentRegistry = createAgentRegistry(api);

  const claudePath = getClaudePath();
  console.log(`[orchestrator] Using Claude CLI at: ${claudePath}`);

  const spawnerService = createSpawnerService({
    workingDirectory: projectRoot,
    stoneforgeRoot: projectRoot,
    claudePath,
  });

  const sessionManager = createSessionManager(spawnerService, api, agentRegistry);
  const sessionInitialPrompts = new Map<string, string>();

  // Load session state for all agents to restore session history after restart
  const agents = await agentRegistry.listAgents();
  for (const agent of agents) {
    try {
      await sessionManager.loadSessionState(agent.id as unknown as EntityId);
    } catch (err) {
      console.warn(`[orchestrator] Failed to load session state for agent ${agent.name}:`, err);
    }
  }
  console.log(`[orchestrator] Loaded session state for ${agents.length} agents`);

  const taskAssignmentService = createTaskAssignmentService(api);
  const dispatchService = createDispatchService(api, taskAssignmentService, agentRegistry);
  const roleDefinitionService = createRoleDefinitionService(api);

  let worktreeManager: WorktreeManager | undefined;
  try {
    worktreeManager = createWorktreeManager({ workspaceRoot: projectRoot });
    // Initialize the worktree manager (creates .stoneforge/.worktrees directory, validates git repo)
    // This is synchronous initialization - consider making services async if this becomes slow
    await worktreeManager.initWorkspace();
  } catch (err) {
    if (err instanceof GitRepositoryNotFoundError) {
      console.warn('[orchestrator] Git repository not found - worktree features disabled');
      worktreeManager = undefined;
    } else {
      throw err;
    }
  }

  const workerTaskService = createWorkerTaskService(
    api,
    taskAssignmentService,
    agentRegistry,
    dispatchService,
    spawnerService,
    sessionManager,
    worktreeManager
  );

  // Create steward services (before executor/scheduler so they can be passed to the executor)
  const mergeStewardService = createMergeStewardService(
    api,
    taskAssignmentService,
    dispatchService,
    agentRegistry,
    { workspaceRoot: projectRoot },
    worktreeManager
  );

  const healthStewardService = createHealthStewardService(
    api,
    agentRegistry,
    sessionManager,
    taskAssignmentService,
    dispatchService
  );

  const docsStewardService = createDocsStewardService({
    workspaceRoot: projectRoot,
  });

  const stewardExecutor = createStewardExecutor({
    mergeStewardService,
    healthStewardService,
    docsStewardService,
    sessionManager,
    projectRoot,
  });
  const stewardScheduler = createStewardScheduler(agentRegistry, stewardExecutor, {
    maxHistoryPerSteward: 100,
    defaultTimeoutMs: 5 * 60 * 1000,
    startImmediately: false,
  });

  const pluginExecutor = createPluginExecutor({
    api,
    workspaceRoot: projectRoot,
  });

  // Create pool service for agent concurrency limiting
  const poolService = createAgentPoolService(api, sessionManager, agentRegistry);

  const inboxService = createInboxService(storageBackend);
  const sessionMessageService = createSessionMessageService(storageBackend);

  // Create sync and auto-export services
  const { resolve } = await import('node:path');
  const syncService = createSyncService(storageBackend);
  const config = loadConfig();
  const autoExportService = createAutoExportService({
    syncService,
    backend: storageBackend,
    syncConfig: config.sync,
    outputDir: resolve(projectRoot, '.stoneforge/sync'),
  });
  autoExportService.start().catch((err: Error) => {
    console.error('[orchestrator] Failed to start auto-export:', err);
  });

  // DispatchDaemon requires worktreeManager, so only create if available
  let dispatchDaemon: DispatchDaemon | undefined;
  if (worktreeManager) {
    // Callback to attach event saver and save initial prompt when daemon starts a session
    const onSessionStarted: OnSessionStartedCallback = (session, events, agentId, initialPrompt) => {
      // Attach event saver to capture all agent events
      attachSessionEventSaver(events, session.id, agentId, sessionMessageService);

      // Notify SSE stream clients so they dynamically subscribe to this session's events
      notifySSEClientsOfNewSession({
        sessionId: session.id,
        agentId: agentId as EntityId,
        agentRole: session.agentRole || 'worker',
        events,
      });

      // Store initial prompt for SSE clients
      sessionInitialPrompts.set(session.id, initialPrompt);

      // Save initial prompt to database
      const initialMsgId = `user-${session.id}-initial`;
      sessionMessageService.saveMessage({
        id: initialMsgId,
        sessionId: session.id,
        agentId: agentId as EntityId,
        type: 'user',
        content: initialPrompt,
        isError: false,
      });

      // Auto-terminate sessions when they emit a 'result' event
      // This handles ephemeral worker sessions completing their tasks
      const onResultEvent = (event: { type: string }) => {
        if (event.type === 'result') {
          console.log(`[orchestrator] Session ${session.id} emitted result, auto-terminating`);
          sessionManager.stopSession(session.id, {
            graceful: true,
            reason: 'Completed with result',
          }).catch(() => {
            // Session may already be terminated - ignore errors
          });
          cleanup();
        }
      };

      // Clean up onResultEvent listener on session exit to prevent leaks
      // This handles sessions that terminate without emitting a 'result' event
      const onExit = () => {
        cleanup();
      };

      const cleanup = trackListeners(events, {
        'event': onResultEvent,
        'exit': onExit,
      });
    };

    const configOverrides = getDaemonConfigOverrides();
    dispatchDaemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignmentService,
      stewardScheduler,
      inboxService,
      { pollIntervalMs: 5000, onSessionStarted, ...configOverrides },
      poolService
    );
  } else {
    console.warn('[orchestrator] DispatchDaemon disabled - no git repository');
  }

  console.log(`[orchestrator] Connected to database: ${dbPath}`);

  return {
    api,
    orchestratorApi,
    agentRegistry,
    sessionManager,
    spawnerService,
    worktreeManager,
    taskAssignmentService,
    dispatchService,
    roleDefinitionService,
    workerTaskService,
    mergeStewardService,
    healthStewardService,
    docsStewardService,
    stewardScheduler,
    pluginExecutor,
    poolService,
    inboxService,
    syncService,
    autoExportService,
    dispatchDaemon,
    sessionInitialPrompts,
    sessionMessageService,
    storageBackend,
  };
}
