/**
 * Approval Request Service
 *
 * Manages approval requests for restricted tool actions.
 * Stores requests in SQLite and provides an event-based mechanism
 * for agents to wait for approval/denial decisions.
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import { createTimestamp } from '@stoneforge/core';
import type { EntityId, Timestamp } from '@stoneforge/core';
import type { StorageBackend } from '@stoneforge/storage';
import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  CreateApprovalRequestInput,
  ResolveApprovalRequestInput,
  ApprovalRequestFilter,
} from './types.js';

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Service for managing tool approval requests.
 */
export interface ApprovalService {
  /**
   * Creates a new approval request and returns it.
   * Emits an 'approval_request' event.
   */
  createRequest(input: CreateApprovalRequestInput): Promise<ApprovalRequest>;

  /**
   * Resolves (approves or denies) an approval request.
   * Emits an 'approval_resolved' event.
   */
  resolveRequest(requestId: string, input: ResolveApprovalRequestInput): Promise<ApprovalRequest>;

  /**
   * Gets an approval request by ID.
   */
  getRequest(requestId: string): Promise<ApprovalRequest | undefined>;

  /**
   * Lists approval requests matching the given filter.
   */
  listRequests(filter?: ApprovalRequestFilter): Promise<ApprovalRequest[]>;

  /**
   * Waits for an approval request to be resolved.
   * Returns the resolved request.
   * Throws if the timeout is exceeded.
   */
  waitForResolution(requestId: string, timeoutMs?: number): Promise<ApprovalRequest>;

  /**
   * Gets the event emitter for approval events.
   *
   * Events:
   * - 'approval_request' (ApprovalRequest) - New request created
   * - 'approval_resolved' (ApprovalRequest) - Request resolved
   */
  getEventEmitter(): EventEmitter;
}

// ============================================================================
// SQLite Schema
// ============================================================================

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_args TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)
`;

const CREATE_SESSION_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_approval_requests_session ON approval_requests(session_id)
`;

// ============================================================================
// Implementation
// ============================================================================

let requestCounter = 0;

function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (requestCounter++).toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 6);
  return `apr-${timestamp}-${counter}-${random}`;
}

/**
 * Implementation of the ApprovalService backed by SQLite.
 */
export class ApprovalServiceImpl implements ApprovalService {
  private readonly storage: StorageBackend;
  private readonly events: EventEmitter;
  private initialized = false;

  constructor(storage: StorageBackend) {
    this.storage = storage;
    this.events = new EventEmitter();
    this.events.setMaxListeners(100);
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    this.storage.exec(CREATE_TABLE_SQL);
    this.storage.exec(CREATE_INDEX_SQL);
    this.storage.exec(CREATE_SESSION_INDEX_SQL);
    this.initialized = true;
  }

  async createRequest(input: CreateApprovalRequestInput): Promise<ApprovalRequest> {
    this.ensureInitialized();

    const request: ApprovalRequest = {
      id: generateRequestId(),
      agentId: input.agentId,
      sessionId: input.sessionId,
      toolName: input.toolName,
      toolArgs: input.toolArgs,
      status: 'pending',
      requestedAt: createTimestamp(),
    };

    this.storage.run(
      `INSERT INTO approval_requests (id, agent_id, session_id, tool_name, tool_args, status, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.agentId,
        request.sessionId,
        request.toolName,
        JSON.stringify(request.toolArgs),
        request.status,
        request.requestedAt,
      ]
    );

    this.events.emit('approval_request', request);
    return request;
  }

  async resolveRequest(requestId: string, input: ResolveApprovalRequestInput): Promise<ApprovalRequest> {
    this.ensureInitialized();

    const existing = await this.getRequest(requestId);
    if (!existing) {
      throw new Error(`Approval request not found: ${requestId}`);
    }
    if (existing.status !== 'pending') {
      throw new Error(`Approval request ${requestId} is already ${existing.status}`);
    }

    const resolvedAt = createTimestamp();

    this.storage.run(
      `UPDATE approval_requests SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`,
      [input.status, resolvedAt, input.resolvedBy, requestId]
    );

    const resolved: ApprovalRequest = {
      ...existing,
      status: input.status,
      resolvedAt,
      resolvedBy: input.resolvedBy,
    };

    this.events.emit('approval_resolved', resolved);
    return resolved;
  }

  async getRequest(requestId: string): Promise<ApprovalRequest | undefined> {
    this.ensureInitialized();

    const rows = this.storage.query<{
      id: string;
      agent_id: string;
      session_id: string;
      tool_name: string;
      tool_args: string;
      status: string;
      requested_at: string;
      resolved_at: string | null;
      resolved_by: string | null;
    }>('SELECT * FROM approval_requests WHERE id = ?', [requestId]);

    if (rows.length === 0) return undefined;
    return this.rowToRequest(rows[0]);
  }

  async listRequests(filter?: ApprovalRequestFilter): Promise<ApprovalRequest[]> {
    this.ensureInitialized();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.agentId) {
      conditions.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter?.sessionId) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }

    let sql = 'SELECT * FROM approval_requests';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY requested_at DESC';

    if (filter?.limit) {
      sql += ` LIMIT ${filter.limit}`;
    }
    if (filter?.offset) {
      sql += ` OFFSET ${filter.offset}`;
    }

    const rows = this.storage.query<{
      id: string;
      agent_id: string;
      session_id: string;
      tool_name: string;
      tool_args: string;
      status: string;
      requested_at: string;
      resolved_at: string | null;
      resolved_by: string | null;
    }>(sql, params);

    return rows.map((row) => this.rowToRequest(row));
  }

  async waitForResolution(requestId: string, timeoutMs = 300000): Promise<ApprovalRequest> {
    // Check if already resolved
    const existing = await this.getRequest(requestId);
    if (existing && existing.status !== 'pending') {
      return existing;
    }

    return new Promise<ApprovalRequest>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Approval request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const onResolved = (request: ApprovalRequest) => {
        if (request.id !== requestId) return;
        if (settled) return;
        settled = true;
        cleanup();
        resolve(request);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.events.off('approval_resolved', onResolved);
      };

      this.events.on('approval_resolved', onResolved);
    });
  }

  getEventEmitter(): EventEmitter {
    return this.events;
  }

  private rowToRequest(row: {
    id: string;
    agent_id: string;
    session_id: string;
    tool_name: string;
    tool_args: string;
    status: string;
    requested_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
  }): ApprovalRequest {
    return {
      id: row.id,
      agentId: row.agent_id as EntityId,
      sessionId: row.session_id,
      toolName: row.tool_name,
      toolArgs: JSON.parse(row.tool_args),
      status: row.status as ApprovalRequestStatus,
      requestedAt: row.requested_at as Timestamp,
      resolvedAt: row.resolved_at ? (row.resolved_at as Timestamp) : undefined,
      resolvedBy: row.resolved_by ?? undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates an ApprovalService instance.
 *
 * @param storage - The storage backend for persisting approval requests
 * @returns A new ApprovalService instance
 */
export function createApprovalService(storage: StorageBackend): ApprovalService {
  return new ApprovalServiceImpl(storage);
}
