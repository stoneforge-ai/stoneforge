/**
 * Service Initialization
 *
 * Creates and exports all orchestrator services.
 */

import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import { createQuarryAPI, createInboxService, createSyncService, createAutoExportService, loadConfig, setValue, getValue } from '@stoneforge/quarry';
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
  createCostService,
  createRateLimitTracker,
  createExternalSyncDaemon,
  createDemoModeService,
  createGitHubMergeProvider,
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
  type DemoModeService,
  type CostService,
  trackListeners,
  createApprovalService,
  type ApprovalService,
  createPermissionHook,
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
  costService: CostService;
  demoModeService: DemoModeService;
  approvalService: ApprovalService;
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

  // Create approval service early so the permission hook factory can use it
  const approvalService = createApprovalService(storageBackend);

  // Load config for permission model settings
  const config = loadConfig();

  const spawnerService = createSpawnerService({
    workingDirectory: projectRoot,
    stoneforgeRoot: projectRoot,
    claudePath,
    // Create a hook factory that injects permission enforcement into headless sessions
    sdkHookFactory: (agentId, _sessionId) => {
      const hook = createPermissionHook(agentId, {
        permissionModel: config.agents.permissionModel,
        allowedBashCommands: config.agents.allowedBashCommands,
        approvalService,
      });
      if (!hook) return undefined;
      return {
        PreToolUse: [{
          hooks: [hook],
        }],
      };
    },
  });

  // Create settings service early so it can be injected into session manager
  const settingsService = createSettingsService(storageBackend);

  // Create metrics service for provider usage tracking
  const metricsService = createMetricsService(storageBackend);

  // Create cost service for pricing calculations
  const costService = createCostService(storageBackend);

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
  const requireApproval = config.merge?.requireApproval ?? false;
  const mergeStewardService = createMergeStewardService(
    api,
    taskAssignmentService,
    dispatchService,
    agentRegistry,
    {
      workspaceRoot: projectRoot,
      requireApproval,
      mergeRequestProvider: requireApproval ? createGitHubMergeProvider() : undefined,
    },
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

      // Permission enforcement is handled via SDK PreToolUse hooks injected by
      // the spawner's sdkHookFactory (configured above during spawner creation).
      // This ensures restricted tools are blocked BEFORE execution, not just monitored.

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
      let sessionCacheReadTokens = 0;
      let sessionCacheCreationTokens = 0;
      let sessionModel: string | undefined;

      // Resolved task ID cache (looked up once, reused for all upserts)
      let resolvedTaskId: string | undefined;
      let taskIdResolved = false;

      // Helper to resolve the task ID once and cache it
      const resolveTaskId = async (): Promise<string | undefined> => {
        if (taskIdResolved) return resolvedTaskId;
        try {
          const tasks = await taskAssignmentService.getAgentTasks(agentId);
          resolvedTaskId = tasks.length > 0 ? tasks[0].taskId : undefined;
        } catch {
          // If task lookup fails, leave undefined
        }
        taskIdResolved = true;
        return resolvedTaskId;
      };

      // Helper to upsert metrics incrementally (called on each assistant event)
      const upsertSessionMetrics = () => {
        const durationMs = Date.now() - sessionStartTime;
        const provider = 'claude-code';

        resolveTaskId().then(taskId => {
          metricsService.upsert({
            provider,
            model: sessionModel,
            sessionId: session.id,
            taskId,
            inputTokens: sessionInputTokens,
            outputTokens: sessionOutputTokens,
            cacheReadTokens: sessionCacheReadTokens,
            cacheCreationTokens: sessionCacheCreationTokens,
            durationMs,
            outcome: sessionOutcome,
          });
        }).catch(() => {
          // Best-effort: upsert without task ID
          metricsService.upsert({
            provider,
            model: sessionModel,
            sessionId: session.id,
            inputTokens: sessionInputTokens,
            outputTokens: sessionOutputTokens,
            cacheReadTokens: sessionCacheReadTokens,
            cacheCreationTokens: sessionCacheCreationTokens,
            durationMs,
            outcome: sessionOutcome,
          });
        });
      };

      // Helper to record final metrics once on session completion
      const recordSessionMetrics = () => {
        if (metricsRecorded) return;
        metricsRecorded = true;
        upsertSessionMetrics();
      };

      // Auto-terminate sessions when they emit a 'result' event
      // This handles ephemeral worker sessions completing their tasks
      const onResultEvent = (event: { type: string; subtype?: string; raw?: Record<string, unknown> }) => {
        // Accumulate tokens from assistant events (each BetaMessage has usage)
        // This provides a running total in case the session exits without a result event
        if (event.type === 'assistant') {
          const rawMsg = event.raw?.message as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }; model?: string } | undefined;
          if (rawMsg?.usage) {
            sessionInputTokens += rawMsg.usage.input_tokens ?? 0;
            sessionOutputTokens += rawMsg.usage.output_tokens ?? 0;
            sessionCacheReadTokens += rawMsg.usage.cache_read_input_tokens ?? 0;
            sessionCacheCreationTokens += rawMsg.usage.cache_creation_input_tokens ?? 0;
          }
          // Capture model from the first assistant message that has it
          if (rawMsg?.model && !sessionModel) {
            sessionModel = rawMsg.model;
          }
          // Record metrics incrementally so in-progress sessions show accumulating token counts
          upsertSessionMetrics();
          return;
        }

        if (event.type === 'result') {
          // The SDK result event may contain cumulative totals for the entire session.
          // Take the MAX of accumulated vs result values to avoid undercounting.
          const usage = event.raw?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
          if (usage && (usage.input_tokens !== undefined || usage.output_tokens !== undefined)) {
            sessionInputTokens = Math.max(sessionInputTokens, usage.input_tokens ?? 0);
            sessionOutputTokens = Math.max(sessionOutputTokens, usage.output_tokens ?? 0);
          }

          // Extract model from modelUsage keys (Record<string, ModelUsage>)
          // Also reconcile cache tokens from modelUsage (SDK camelCase format)
          const modelUsage = event.raw?.modelUsage as Record<string, { cacheReadInputTokens?: number; cacheCreationInputTokens?: number } | unknown> | undefined;
          if (modelUsage) {
            const models = Object.keys(modelUsage);
            if (models.length > 0 && !sessionModel) {
              sessionModel = models[0];
            }
            // Sum cache tokens across all models in the result
            let resultCacheReadTokens = 0;
            let resultCacheCreationTokens = 0;
            for (const model of models) {
              const mu = modelUsage[model] as { cacheReadInputTokens?: number; cacheCreationInputTokens?: number } | undefined;
              if (mu) {
                resultCacheReadTokens += mu.cacheReadInputTokens ?? 0;
                resultCacheCreationTokens += mu.cacheCreationInputTokens ?? 0;
              }
            }
            sessionCacheReadTokens = Math.max(sessionCacheReadTokens, resultCacheReadTokens);
            sessionCacheCreationTokens = Math.max(sessionCacheCreationTokens, resultCacheCreationTokens);
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

  // Create demo mode service
  const demoModeService = createDemoModeService({
    agentRegistry,
    settingsService,
    persistConfigFlag: (enabled: boolean) => {
      try {
        setValue('demoMode', enabled);
      } catch (err) {
        logger.warn('Failed to persist demoMode config flag:', err);
      }
    },
    readConfigFlag: () => {
      try {
        return getValue('demoMode') as boolean;
      } catch {
        return false;
      }
    },
  });

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
    costService,
    demoModeService,
    approvalService,
    storageBackend,
  };
}
