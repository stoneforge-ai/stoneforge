/**
 * Routes Index
 *
 * Re-exports all route factories.
 */

export { createHealthRoutes } from './health.js';
export { createTaskRoutes } from './tasks.js';
export { createAgentRoutes } from './agents.js';
export { createSessionRoutes } from './sessions.js';
export { createWorktreeRoutes } from './worktrees.js';
export { createSchedulerRoutes } from './scheduler.js';
export { createPluginRoutes } from './plugins.js';
export { createEventRoutes, notifySSEClientsOfNewSession } from './events.js';
export { createUploadRoutes } from './upload.js';
export { createDaemonRoutes, markDaemonAsServerManaged } from './daemon.js';
export { createWorkflowRoutes } from './workflows.js';
export { createPoolRoutes } from './pools.js';
export { createLspRoutes } from './lsp.js';
export { createWorkspaceFilesRoutes } from './workspace-files.js';
export { createExtensionsRoutes } from './extensions.js';
export { createSettingsRoutes } from './settings.js';
export { createAssetRoutes } from './assets.js';
export { createMetricsRoutes } from './metrics.js';
export { createDiagnosticsRoutes } from './diagnostics.js';
export { createExternalSyncRoutes } from './external-sync.js';
export { createApprovalRoutes } from './approvals.js';
