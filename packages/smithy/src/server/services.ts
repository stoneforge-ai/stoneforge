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
import type { EntityId, ElementId, Playbook } from '@stoneforge/core';
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
  createDocsStewardService,
  createSettingsService,
  createMetricsService,
  createRateLimitTracker,
  createExternalSyncDaemon,
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
  type DocsStewardService,
  type SettingsService,
  type MetricsService,
  type MetricOutcome,
  type OnSessionStartedCallback,
  type ExternalSyncDaemon,
  trackListeners,
} from '../index.js';
import { createSyncEngine, createConfiguredProviderRegistry } from '@stoneforge/quarry';
import { attachSessionEventSaver } from './routes/sessions.js';
import { notifySSEClientsOfNewSession } from './routes/events.js';
import { DB_PATH as DEFAULT_DB_PATH, PROJECT_ROOT as DEFAULT_PROJECT_ROOT, getClaudePath } from './config.js';
import { getDaemonConfigOverrides } from './daemon-state.js';
import { createLogger } from '../utils/logger.js';
import { getFallbackResetTime } from '../utils/rate-limit-parser.js';

const logger = createLogger('orchestrator');

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
  docsStewardService: DocsStewardService;
  dispatchDaemon: DispatchDaemon | undefined;
  externalSyncDaemon: ExternalSyncDaemon | undefined;
  sessionInitialPrompts: Map<string, string>;
  sessionMessageService: SessionMessageService;
  settingsService: SettingsService;
  metricsService: MetricsService;
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
  logger.info(`Using Claude CLI at: ${claudePath}`);

  const spawnerService = createSpawnerService({
    workingDirectory: projectRoot,
    stoneforgeRoot: projectRoot,
    claudePath,
  });

  // Create settings service early so it can be injected into session manager
  const settingsService = createSettingsService(storageBackend);

  // Create metrics service for provider usage tracking
  const metricsService = createMetricsService(storageBackend);

  const sessionManager = createSessionManager(spawnerService, api, agentRegistry, settingsService);
  const sessionInitialPrompts = new Map<string, string>();

  // Load session state for all agents to restore session history after restart
  const agents = await agentRegistry.listAgents();
  for (const agent of agents) {
    try {
      await sessionManager.loadSessionState(agent.id as unknown as EntityId);
    } catch (err) {
      logger.warn(`Failed to load session state for agent ${agent.name}:`, err);
    }
  }
  logger.info(`Loaded session state for ${agents.length} agents`);

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
      logger.warn('Git repository not found - worktree features disabled');
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

  const docsStewardService = createDocsStewardService({
    workspaceRoot: projectRoot,
  });

  const rateLimitTracker = createRateLimitTracker();

  const stewardExecutor = createStewardExecutor({
    mergeStewardService,
    docsStewardService,
    sessionManager,
    projectRoot,
    rateLimitTracker,
    settingsService,
    resolvePlaybookContent: async (playbookId: string): Promise<string | undefined> => {
      const playbook = await api.get<Playbook>(playbookId as ElementId);
      if (!playbook) return undefined;

      // Convert playbook steps into a markdown description for the steward prompt
      const parts: string[] = [];
      if (playbook.title) {
        parts.push(`# ${playbook.title}`);
      }
      if (playbook.steps && playbook.steps.length > 0) {
        parts.push('\n## Steps\n');
        for (const step of playbook.steps) {
          parts.push(`### ${step.title}`);
          if (step.description) {
            parts.push(step.description);
          }
          if (step.dependsOn && step.dependsOn.length > 0) {
            parts.push(`_Depends on: ${step.dependsOn.join(', ')}_`);
          }
          parts.push('');
        }
      }
      return parts.join('\n') || playbook.title || undefined;
    },
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
    logger.error('Failed to start auto-export:', err);
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

      // Listen for rate_limited events from sessions and forward to trackers
      const onRateLimited = (data: { executablePath?: string; resetsAt?: Date; message?: string }) => {
        if (data.executablePath) {
          const resetTime = data.resetsAt ?? getFallbackResetTime(data.message ?? '');
          // Forward to dispatch daemon's internal tracker
          if (dispatchDaemon) {
            dispatchDaemon.handleRateLimitDetected(data.executablePath, resetTime);
          }
          // Forward to steward executor's tracker
          rateLimitTracker.markLimited(data.executablePath, resetTime);
        }
      };

      // Track metrics state for this session
      const sessionStartTime = Date.now();
      let metricsRecorded = false;
      let sessionOutcome: MetricOutcome = 'completed';
      let sessionInputTokens = 0;
      let sessionOutputTokens = 0;

      // Helper to record metrics once on session completion
      const recordSessionMetrics = () => {
        if (metricsRecorded) return;
        metricsRecorded = true;

        const durationMs = Date.now() - sessionStartTime;
        const provider = 'claude-code';

        // Look up the task ID from the agent's current assignment (best-effort)
        taskAssignmentService.getAgentTasks(agentId)
          .then(tasks => {
            const taskId = tasks.length > 0 ? tasks[0].taskId : undefined;
            metricsService.record({
              provider,
              sessionId: session.id,
              taskId,
              inputTokens: sessionInputTokens,
              outputTokens: sessionOutputTokens,
              durationMs,
              outcome: sessionOutcome,
            });
          })
          .catch(() => {
            // If task lookup fails, record without task ID
            metricsService.record({
              provider,
              sessionId: session.id,
              inputTokens: sessionInputTokens,
              outputTokens: sessionOutputTokens,
              durationMs,
              outcome: sessionOutcome,
            });
          });
      };

      // Auto-terminate sessions when they emit a 'result' event
      // This handles ephemeral worker sessions completing their tasks
      const onResultEvent = (event: { type: string; raw?: { usage?: { input_tokens?: number; output_tokens?: number } } }) => {
        if (event.type === 'result') {
          // Extract token counts from the result event if available
          const usage = event.raw?.usage;
          if (usage) {
            sessionInputTokens = usage.input_tokens ?? 0;
            sessionOutputTokens = usage.output_tokens ?? 0;
          }
          sessionOutcome = 'completed';
          recordSessionMetrics();

          logger.debug(`Session ${session.id} emitted result, auto-terminating`);
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
      const onExit = (code?: number) => {
        // If metrics haven't been recorded yet (no result event), record on exit
        if (!metricsRecorded) {
          sessionOutcome = (code && code !== 0) ? 'failed' : 'completed';
          recordSessionMetrics();
        }
        cleanup();
      };

      const cleanup = trackListeners(events, {
        'rate_limited': onRateLimited,
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
      poolService,
      settingsService
    );
  } else {
    logger.warn('DispatchDaemon disabled - no git repository');
  }

  // ExternalSyncDaemon — only instantiate when external sync is enabled
  // AND at least one provider has a configured token.
  // Zero-overhead guarantee: unconfigured workspaces pay no cost.
  let externalSyncDaemon: ExternalSyncDaemon | undefined;
  if (config.externalSync.enabled) {
    const externalSyncSettings = settingsService.getExternalSyncSettings();
    const hasConfiguredProvider = Object.values(externalSyncSettings.providers).some(
      (p) => p.token != null && p.token.length > 0
    );

    if (hasConfiguredProvider) {
      const providerConfigs = Object.values(externalSyncSettings.providers);
      const registry = createConfiguredProviderRegistry(providerConfigs);
      const syncEngine = createSyncEngine({
        api,
        registry,
        settings: settingsService,
        providerConfigs,
      });
      externalSyncDaemon = createExternalSyncDaemon(syncEngine, {
        pollIntervalMs: externalSyncSettings.pollIntervalMs ?? config.externalSync.pollInterval,
      });
      logger.info('External sync daemon created (will start when server starts)');
    } else {
      logger.info('External sync enabled but no providers configured with tokens — daemon not created');
    }
  }

  logger.info(`Connected to database: ${dbPath}`);

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
    docsStewardService,
    stewardScheduler,
    pluginExecutor,
    poolService,
    inboxService,
    syncService,
    autoExportService,
    dispatchDaemon,
    externalSyncDaemon,
    sessionInitialPrompts,
    sessionMessageService,
    settingsService,
    metricsService,
    storageBackend,
  };
}
