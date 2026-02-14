/**
 * Shared Routes Package
 *
 * Route factories for collaborate features that can be used by multiple servers.
 */

// Types
export type { CollaborateServices, CollaborateServicesWithBroadcast, BroadcastInboxEventFn, QuarryLikeAPI, InboxLikeService } from './types.js';

// Route factories
export { createElementsRoutes } from './elements.js';
export { createEntityRoutes } from './entities.js';
export { createChannelRoutes } from './channels.js';
export { createMessageRoutes } from './messages.js';
export { createLibraryRoutes } from './libraries.js';
export { createDocumentRoutes } from './documents.js';
export { createInboxRoutes } from './inbox.js';
export { createPlanRoutes } from './plans.js';

// WebSocket types, broadcaster, and handler utilities
export * from './ws/index.js';
