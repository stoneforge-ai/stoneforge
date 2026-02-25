/**
 * Stoneforge Smithy Server
 *
 * HTTP and WebSocket server for agent orchestration.
 * Exports startSmithyServer() for programmatic usage.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { EntityId } from '@stoneforge/core';
import { getAgentMetadata } from '../index.js';
import { createLogger, getLogLevel } from '../utils/logger.js';
import { CORS_ORIGINS as DEFAULT_CORS_ORIGINS, PORT as DEFAULT_PORT, HOST as DEFAULT_HOST, PROJECT_ROOT as DEFAULT_PROJECT_ROOT, DB_PATH as DEFAULT_DB_PATH } from './config.js';
import { initializeServices, type Services } from './services.js';
import {
  createHealthRoutes,
  createTaskRoutes,
  createAgentRoutes,
  createSessionRoutes,
  createWorktreeRoutes,
  createSchedulerRoutes,
  createPluginRoutes,
  createEventRoutes,
  createUploadRoutes,
  createDaemonRoutes,
  createWorkflowRoutes,
  createPoolRoutes,
  createWorkspaceFilesRoutes,
  createExtensionsRoutes,
  createSettingsRoutes,
  createAssetRoutes,
  createMetricsRoutes,
  createDiagnosticsRoutes,
  createExternalSyncRoutes,
  markDaemonAsServerManaged,
} from './routes/index.js';
// Shared collaborate routes
import {
  createElementsRoutes,
  createEntityRoutes,
  createChannelRoutes,
  createMessageRoutes,
  createLibraryRoutes,
  createDocumentRoutes,
  createInboxRoutes,
  createPlanRoutes,
  createTaskRoutes as createSharedTaskRoutes,
} from '@stoneforge/shared-routes';
import { notifyClientsOfNewSession } from './websocket.js';
import { attachSessionEventSaver } from './routes/sessions.js';
import { notifySSEClientsOfNewSession } from './routes/events.js';
import { startServer } from './server.js';
import { shouldDaemonAutoStart, saveDaemonState } from './daemon-state.js';
import { createLspManager } from './services/lsp-manager.js';
import { createLspRoutes } from './routes/lsp.js';
import { initializeBroadcaster } from '@stoneforge/shared-routes';
import { registerStaticMiddleware } from './static.js';

const logger = createLogger('orchestrator');

export interface SmithyServerOptions {
  port?: number;
  host?: string;
  dbPath?: string;
  projectRoot?: string;
  webRoot?: string;
  corsOrigins?: string[];
}

export async function startSmithyServer(options: SmithyServerOptions = {}): Promise<Services> {
  logger.info('Log level: ' + getLogLevel());
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const corsOrigins = options.corsOrigins ?? [
    ...DEFAULT_CORS_ORIGINS,
    `http://${host}:${port}`,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  const projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;

  const services = await initializeServices({ dbPath, projectRoot });

  // Before reconciliation, capture director's session info if it was running
  // This allows us to auto-resume the director after server restart
  let directorSessionId: string | undefined;
  const director = await services.agentRegistry.getDirector();
  if (director) {
    const meta = getAgentMetadata(director);
    if (meta?.sessionStatus === 'running' && meta?.sessionId) {
      directorSessionId = meta.sessionId;
      logger.debug(`Director was running with session ${directorSessionId} before restart`);
    }
  }

  // Reconcile stale sessions: reset agents marked 'running' to 'idle' if process is dead
  const reconcileResult = await services.sessionManager.reconcileOnStartup();
  if (reconcileResult.reconciled > 0) {
    logger.info(`Reconciled ${reconcileResult.reconciled} stale agent session(s)`);
  }
  if (reconcileResult.errors.length > 0) {
    logger.warn('Reconciliation errors:', reconcileResult.errors);
  }

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
      credentials: true,
    })
  );

  // Register shared collaborate routes
  // NOTE: createSharedTaskRoutes registers PATCH /api/tasks/bulk and POST /api/tasks/bulk-delete
  // and MUST be registered before createTaskRoutes to avoid "bulk" matching as :id
  const collaborateServices = {
    api: services.api,
    inboxService: services.inboxService,
    storageBackend: services.storageBackend,
  };
  app.route('/', createSharedTaskRoutes(collaborateServices));

  app.route('/', createHealthRoutes(services));
  app.route('/', createTaskRoutes(services));
  app.route('/', createAgentRoutes(services));
  app.route('/', createSessionRoutes(services, notifyClientsOfNewSession));
  app.route('/', createWorktreeRoutes(services));
  app.route('/', createSchedulerRoutes(services));
  app.route('/', createPluginRoutes(services));
  app.route('/', createEventRoutes(services));
  app.route('/', createUploadRoutes());
  app.route('/', createDaemonRoutes(services));
  app.route('/', createWorkflowRoutes(services));
  app.route('/', createPoolRoutes(services));
  app.route('/', createWorkspaceFilesRoutes());
  app.route('/', createExtensionsRoutes());
  app.route('/', createSettingsRoutes(services));
  app.route('/', createAssetRoutes());
  app.route('/', createMetricsRoutes(services));
  app.route('/', createDiagnosticsRoutes(services));
  app.route('/', createExternalSyncRoutes(services));

  app.route('/', createElementsRoutes(collaborateServices));
  app.route('/', createEntityRoutes(collaborateServices));
  app.route('/', createChannelRoutes(collaborateServices));
  app.route('/', createMessageRoutes(collaborateServices));
  app.route('/', createLibraryRoutes(collaborateServices));
  app.route('/', createDocumentRoutes(collaborateServices));
  app.route('/', createInboxRoutes(collaborateServices));
  app.route('/', createPlanRoutes(collaborateServices));

  // Initialize LSP manager and routes
  const lspManager = createLspManager(projectRoot);
  await lspManager.checkAvailability();
  app.route('/', createLspRoutes(lspManager));

  // Serve pre-built web UI if webRoot is provided and exists
  if (options.webRoot) {
    registerStaticMiddleware(app, options.webRoot);
  }

  // Initialize and start the event broadcaster for real-time WebSocket events
  const broadcaster = initializeBroadcaster(services.api);
  await broadcaster.start();

  startServer(app, services, lspManager, { port, host });

  // Auto-resume director session if it was running before server restart
  // This must happen after startServer() so HTTP/WS infrastructure is ready for clients
  if (directorSessionId && director) {
    const directorId = director.id as unknown as EntityId;
    logger.debug(`Attempting to auto-resume director session ${directorSessionId}`);
    try {
      const { session, events } = await services.sessionManager.resumeSession(directorId, {
        providerSessionId: directorSessionId,
        resumePrompt: 'Server restarted. You have been automatically reconnected to your previous session. Check your inbox for any pending messages.',
      });

      // Attach event saver to capture all agent events
      attachSessionEventSaver(events, session.id, directorId, services.sessionMessageService);

      // Notify WebSocket clients of the resumed session
      notifyClientsOfNewSession(directorId, session, events);

      // Notify SSE stream clients of the resumed session
      notifySSEClientsOfNewSession({
        sessionId: session.id,
        agentId: directorId,
        agentRole: session.agentRole || 'director',
        events,
      });

      logger.info(`Director session auto-resumed successfully (session: ${session.id})`);
    } catch (error) {
      // Resume failed - director will stay idle and can be started manually via UI
      logger.warn('Failed to auto-resume director session:', error instanceof Error ? error.message : String(error));
      logger.info('Director will remain idle - can be started manually via UI');
    }
  }

  // Auto-start dispatch daemon based on persisted state and environment variable
  // Priority: DAEMON_AUTO_START=false disables auto-start entirely
  // Otherwise, check persisted state (remembers if user stopped it via UI/API)
  const envDisabled = process.env.DAEMON_AUTO_START === 'false';
  const persistedShouldRun = shouldDaemonAutoStart();

  if (!services.dispatchDaemon) {
    logger.info('Dispatch daemon not available (no git repository)');
  } else if (envDisabled) {
    logger.info('Dispatch daemon auto-start disabled (DAEMON_AUTO_START=false)');
  } else if (!persistedShouldRun) {
    logger.info('Dispatch daemon not started (was stopped by user, state persisted)');
  } else {
    services.dispatchDaemon.start();
    saveDaemonState(true, 'server-startup');
    markDaemonAsServerManaged();
    logger.info('Dispatch daemon auto-started');
  }

  // Conditionally start external sync daemon
  // The daemon is only created when externalSync.enabled AND a provider has a token.
  // If the daemon object exists, start it.
  if (services.externalSyncDaemon) {
    services.externalSyncDaemon.start().catch((err: Error) => {
      logger.error('Failed to start external sync daemon:', err);
    });
    logger.info('External sync daemon auto-started');
  }

  return services;
}
