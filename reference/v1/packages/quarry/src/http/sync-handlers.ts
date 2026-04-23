/**
 * HTTP Sync Handlers - Browser sync support via HTTP endpoints
 *
 * Provides framework-agnostic handlers for browser sync operations.
 * These can be integrated with any HTTP framework (Bun.serve, Express, Hono, etc.)
 *
 * Implements the browser sync protocol from api/sync.md:
 * 1. Browser exports local changes
 * 2. HTTP POST to server with JSONL
 * 3. Server merges with its state
 * 4. Server exports current state
 * 5. HTTP response with JSONL
 * 6. Browser imports and merges
 */

import type { StorageBackend } from '@stoneforge/storage';
import { SyncService, createSyncService } from '../sync/service.js';
import type { ImportResult, SyncStatus } from '../sync/types.js';
import { createTimestamp, ValidationError, ErrorCode } from '@stoneforge/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Request body for browser sync pull (export from server)
 */
export interface SyncPullRequest {
  /** Include ephemeral elements in export */
  includeEphemeral?: boolean;
  /** Include dependencies in export */
  includeDependencies?: boolean;
}

/**
 * Response for browser sync pull
 */
export interface SyncPullResponse {
  /** JSONL string of elements */
  elements: string;
  /** JSONL string of dependencies (if requested) */
  dependencies?: string;
  /** Element count */
  elementCount: number;
  /** Dependency count (if included) */
  dependencyCount?: number;
  /** Export timestamp */
  exportedAt: string;
}

/**
 * Request body for browser sync push (import to server)
 */
export interface SyncPushRequest {
  /** JSONL string of elements to import */
  elements: string;
  /** JSONL string of dependencies to import */
  dependencies?: string;
  /** Dry run - validate without applying changes */
  dryRun?: boolean;
  /** Force - remote always wins conflicts */
  force?: boolean;
}

/**
 * Response for browser sync push
 */
export interface SyncPushResponse {
  /** Import result with counts and conflicts */
  result: ImportResult;
  /** Server's current state after merge (for client to sync) */
  serverState?: SyncPullResponse;
}

/**
 * Request/Response for full bidirectional sync
 */
export interface SyncExchangeRequest {
  /** Client's elements to import */
  elements: string;
  /** Client's dependencies to import */
  dependencies?: string;
  /** Force - remote always wins conflicts */
  force?: boolean;
}

export interface SyncExchangeResponse {
  /** Import result from processing client data */
  importResult: ImportResult;
  /** Server's current state (for client to import) */
  serverElements: string;
  /** Server's dependencies (for client to import) */
  serverDependencies: string;
  /** Counts for client reference */
  serverElementCount: number;
  serverDependencyCount: number;
  /** Sync timestamp */
  syncedAt: string;
}

/**
 * HTTP response envelope
 */
export interface HttpResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Handler Class
// ============================================================================

/**
 * HTTP handlers for browser sync operations
 */
export class SyncHttpHandlers {
  private syncService: SyncService;

  constructor(private backend: StorageBackend) {
    this.syncService = createSyncService(backend);
  }

  /**
   * Handle GET /api/sync/status
   *
   * Returns current sync status including dirty element count
   */
  getStatus(): HttpResponse<SyncStatus> {
    try {
      const dirtyElements = this.backend.getDirtyElements();
      const status: SyncStatus = {
        dirtyElementCount: dirtyElements.length,
        dirtyDependencyCount: 0, // Not tracked separately currently
        hasPendingChanges: dirtyElements.length > 0,
      };

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handle GET /api/sync/pull or POST /api/sync/pull
   *
   * Exports server state as JSONL for client to import
   */
  pull(request?: SyncPullRequest): HttpResponse<SyncPullResponse> {
    try {
      const includeEphemeral = request?.includeEphemeral ?? false;
      const includeDependencies = request?.includeDependencies !== false;

      const result = this.syncService.exportToString({
        includeEphemeral,
        includeDependencies,
      });

      const elementCount = result.elements
        ? result.elements.trim().split('\n').filter(Boolean).length
        : 0;
      const dependencyCount =
        includeDependencies && result.dependencies
          ? result.dependencies.trim().split('\n').filter(Boolean).length
          : undefined;

      return {
        success: true,
        data: {
          elements: result.elements,
          dependencies: includeDependencies ? result.dependencies : undefined,
          elementCount,
          dependencyCount,
          exportedAt: createTimestamp(),
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handle POST /api/sync/push
   *
   * Imports client JSONL data to server
   */
  push(request: SyncPushRequest): HttpResponse<SyncPushResponse> {
    try {
      // Validate request
      if (typeof request.elements !== 'string') {
        throw new ValidationError('elements field is required and must be a string', ErrorCode.MISSING_REQUIRED_FIELD, {
          field: 'elements',
        });
      }

      const result = this.syncService.importFromStrings(
        request.elements,
        request.dependencies ?? '',
        {
          dryRun: request.dryRun ?? false,
          force: request.force ?? false,
        }
      );

      // Optionally include server state after merge
      let serverState: SyncPullResponse | undefined;
      if (!request.dryRun) {
        // After push, client may want to pull updated state
        const exported = this.syncService.exportToString({ includeDependencies: true });
        const elementCount = exported.elements
          ? exported.elements.trim().split('\n').filter(Boolean).length
          : 0;
        const dependencyCount = exported.dependencies
          ? exported.dependencies.trim().split('\n').filter(Boolean).length
          : 0;

        serverState = {
          elements: exported.elements,
          dependencies: exported.dependencies,
          elementCount,
          dependencyCount,
          exportedAt: createTimestamp(),
        };
      }

      return {
        success: true,
        data: {
          result,
          serverState,
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handle POST /api/sync/exchange
   *
   * Bidirectional sync in a single request:
   * 1. Import client data
   * 2. Export server state
   * 3. Return both results
   */
  exchange(request: SyncExchangeRequest): HttpResponse<SyncExchangeResponse> {
    try {
      // Validate request
      if (typeof request.elements !== 'string') {
        throw new ValidationError('elements field is required and must be a string', ErrorCode.MISSING_REQUIRED_FIELD, {
          field: 'elements',
        });
      }

      // Step 1: Import client data
      const importResult = this.syncService.importFromStrings(
        request.elements,
        request.dependencies ?? '',
        {
          dryRun: false,
          force: request.force ?? false,
        }
      );

      // Step 2: Export server state (after merge)
      const exported = this.syncService.exportToString({ includeDependencies: true });
      const serverElementCount = exported.elements
        ? exported.elements.trim().split('\n').filter(Boolean).length
        : 0;
      const serverDependencyCount = exported.dependencies
        ? exported.dependencies.trim().split('\n').filter(Boolean).length
        : 0;

      return {
        success: true,
        data: {
          importResult,
          serverElements: exported.elements,
          serverDependencies: exported.dependencies ?? '',
          serverElementCount,
          serverDependencyCount,
          syncedAt: createTimestamp(),
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handle errors and return appropriate HTTP response
   */
  private handleError(error: unknown): HttpResponse<never> {
    if (error instanceof ValidationError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unknown error occurred',
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create sync HTTP handlers for a storage backend
 */
export function createSyncHttpHandlers(backend: StorageBackend): SyncHttpHandlers {
  return new SyncHttpHandlers(backend);
}

// ============================================================================
// HTTP Status Helpers
// ============================================================================

/**
 * Map response to HTTP status code
 */
export function getHttpStatus(response: HttpResponse<unknown>): number {
  if (response.success) {
    return 200;
  }

  switch (response.error?.code) {
    case ErrorCode.MISSING_REQUIRED_FIELD:
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.INVALID_ID:
      return 400;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.ALREADY_EXISTS:
    case ErrorCode.CYCLE_DETECTED:
    case ErrorCode.SYNC_CONFLICT:
      return 409;
    case ErrorCode.DATABASE_ERROR:
      return 500;
    default:
      return 500;
  }
}

// ============================================================================
// Content-Type Helpers
// ============================================================================

/**
 * Supported content types for sync endpoints
 */
export const SYNC_CONTENT_TYPES = {
  JSON: 'application/json',
  JSONL: 'application/jsonl',
  NDJSON: 'application/x-ndjson',
} as const;

/**
 * Parse request body based on content type
 */
export function parseRequestBody<T>(body: string, _contentType?: string): T {
  // Default to JSON parsing (contentType reserved for future JSONL streaming support)
  return JSON.parse(body) as T;
}

/**
 * Serialize response based on accept header
 */
export function serializeResponse<T>(response: HttpResponse<T>): string {
  return JSON.stringify(response);
}
