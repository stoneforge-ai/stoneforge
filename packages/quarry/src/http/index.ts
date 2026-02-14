/**
 * HTTP Module - HTTP handlers for browser sync
 *
 * Provides framework-agnostic HTTP handlers that can be integrated
 * with any HTTP server (Bun.serve, Express, Hono, etc.)
 */

export {
  // Handler class
  SyncHttpHandlers,
  createSyncHttpHandlers,
  // Types
  type SyncPullRequest,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncExchangeRequest,
  type SyncExchangeResponse,
  type HttpResponse,
  // Helpers
  getHttpStatus,
  parseRequestBody,
  serializeResponse,
  SYNC_CONTENT_TYPES,
} from './sync-handlers.js';
