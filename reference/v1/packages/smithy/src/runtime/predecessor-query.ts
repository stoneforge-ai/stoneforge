/**
 * Predecessor Query Service
 *
 * This service enables agents to consult previous sessions for context and guidance.
 * It implements the predecessor query pattern from the orchestration spec:
 *
 * 1. Find most recent session for a given role
 * 2. Resume that previous session using Claude Code's --resume flag
 * 3. Send a message to the predecessor
 * 4. Capture the response
 * 5. Suspend the predecessor session again
 * 6. Return the response to the current agent
 *
 * This allows collaborative problem-solving between agents by enabling new sessions
 * to query previous session holders for historical context.
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type { EntityId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { AgentRole } from '../types/agent.js';
import type { SessionManager } from './session-manager.js';
import type { SpawnedSessionEvent } from './spawner.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for querying a predecessor
 */
export interface PredecessorQueryOptions {
  /** Maximum time to wait for a response in milliseconds (default: 60000) */
  readonly timeout?: number;
  /** Whether to suspend the predecessor after getting a response (default: true) */
  readonly suspendAfterResponse?: boolean;
  /** Additional context to provide to the predecessor */
  readonly context?: string;
  /** Working directory for the resumed session */
  readonly workingDirectory?: string;
}

/**
 * Result of a predecessor query
 */
export interface PredecessorQueryResult {
  /** Whether the query was successful */
  readonly success: boolean;
  /** The response message from the predecessor */
  readonly response?: string;
  /** The predecessor session information */
  readonly predecessor?: PredecessorInfo;
  /** Error message if the query failed */
  readonly error?: string;
  /** Timestamp when the query completed */
  readonly completedAt: Timestamp;
  /** Duration of the query in milliseconds */
  readonly durationMs: number;
}

/**
 * Information about the predecessor session
 */
export interface PredecessorInfo {
  /** The agent ID of the predecessor */
  readonly agentId: EntityId;
  /** The agent name */
  readonly agentName?: string;
  /** The role of the predecessor */
  readonly role: AgentRole;
  /** The provider session ID used for resume */
  readonly providerSessionId: string;
  /** The internal session ID */
  readonly sessionId: string;
  /** The working directory of the predecessor session */
  readonly workingDirectory: string;
  /** When the predecessor session was originally started */
  readonly originalStartedAt?: Timestamp;
  /** When the predecessor session was suspended */
  readonly suspendedAt?: Timestamp;
}

/**
 * Status of a predecessor query
 */
export type PredecessorQueryStatus =
  | 'pending'
  | 'resuming'
  | 'waiting_response'
  | 'completed'
  | 'failed'
  | 'timed_out';

/**
 * Active predecessor query tracking
 */
export interface ActivePredecessorQuery {
  /** Unique query ID */
  readonly id: string;
  /** The requesting agent ID */
  readonly requestingAgentId: EntityId;
  /** The role being queried */
  readonly targetRole: AgentRole;
  /** The message sent to the predecessor */
  readonly message: string;
  /** Current status of the query */
  status: PredecessorQueryStatus;
  /** The predecessor session ID (once resumed) */
  predecessorSessionId?: string;
  /** Query started timestamp */
  readonly startedAt: Timestamp;
  /** Query completed timestamp */
  completedAt?: Timestamp;
  /** Accumulated response text */
  responseAccumulator: string;
  /** Event emitter for query events */
  readonly events: EventEmitter;
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Predecessor Query Service interface.
 *
 * This service enables agents to consult previous sessions of a given role
 * for context, guidance, or to understand historical decisions.
 */
export interface PredecessorQueryService {
  /**
   * Queries a predecessor session of a given role.
   *
   * This method:
   * 1. Finds the most recent suspended/terminated session for the role
   * 2. Resumes that session using Claude Code's --resume flag
   * 3. Sends the provided message to the predecessor
   * 4. Waits for and captures the response
   * 5. Suspends the predecessor session again
   * 6. Returns the response
   *
   * @param requestingAgentId - The agent making the query
   * @param role - The role to query (e.g., 'director', 'worker')
   * @param message - The message/question to send to the predecessor
   * @param options - Query options
   * @returns The query result with the predecessor's response
   */
  consultPredecessor(
    requestingAgentId: EntityId,
    role: AgentRole,
    message: string,
    options?: PredecessorQueryOptions
  ): Promise<PredecessorQueryResult>;

  /**
   * Gets information about the most recent predecessor for a role.
   *
   * This is useful for checking if a predecessor exists before querying,
   * or for getting context about who held the role previously.
   *
   * @param role - The role to find the predecessor for
   * @returns The predecessor info or undefined if none exists
   */
  getPredecessorInfo(role: AgentRole): Promise<PredecessorInfo | undefined>;

  /**
   * Checks if a predecessor exists and can be queried for a given role.
   *
   * A predecessor is queryable if:
   * - A previous session exists for the role
   * - The session was suspended (not terminated) OR has a Claude session ID
   *
   * @param role - The role to check
   * @returns True if a queryable predecessor exists
   */
  hasPredecessor(role: AgentRole): Promise<boolean>;

  /**
   * Gets the status of an active predecessor query.
   *
   * @param queryId - The query ID
   * @returns The active query or undefined if not found
   */
  getActiveQuery(queryId: string): ActivePredecessorQuery | undefined;

  /**
   * Lists all active predecessor queries.
   *
   * @returns Array of active queries
   */
  listActiveQueries(): ActivePredecessorQuery[];

  /**
   * Cancels an active predecessor query.
   *
   * This will attempt to gracefully stop the resumed predecessor session
   * and clean up resources.
   *
   * @param queryId - The query ID to cancel
   */
  cancelQuery(queryId: string): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for predecessor queries (60 seconds) */
export const DEFAULT_QUERY_TIMEOUT_MS = 60000;

/** Minimum timeout for predecessor queries (10 seconds) */
export const MIN_QUERY_TIMEOUT_MS = 10000;

/** Maximum timeout for predecessor queries (5 minutes) */
export const MAX_QUERY_TIMEOUT_MS = 300000;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Implementation of the Predecessor Query Service.
 */
export class PredecessorQueryServiceImpl implements PredecessorQueryService {
  private readonly activeQueries: Map<string, ActivePredecessorQuery> = new Map();
  private queryCounter = 0;

  constructor(private readonly sessionManager: SessionManager) {}

  async consultPredecessor(
    requestingAgentId: EntityId,
    role: AgentRole,
    message: string,
    options?: PredecessorQueryOptions
  ): Promise<PredecessorQueryResult> {
    const startTime = Date.now();
    const timeout = this.normalizeTimeout(options?.timeout);

    // Find the predecessor
    const predecessor = await this.getPredecessorInfo(role);
    if (!predecessor) {
      return {
        success: false,
        error: `No predecessor found for role: ${role}`,
        completedAt: createTimestamp(),
        durationMs: Date.now() - startTime,
      };
    }

    // Create the active query record
    const queryId = this.generateQueryId();
    const query: ActivePredecessorQuery = {
      id: queryId,
      requestingAgentId,
      targetRole: role,
      message,
      status: 'pending',
      startedAt: createTimestamp(),
      responseAccumulator: '',
      events: new EventEmitter(),
    };
    this.activeQueries.set(queryId, query);

    try {
      // Build the prompt with context if provided
      let prompt = message;
      if (options?.context) {
        prompt = `Context: ${options.context}\n\nQuestion: ${message}`;
      }

      // Resume the predecessor session
      query.status = 'resuming';
      const { session, events } = await this.sessionManager.resumeSession(
        predecessor.agentId,
        {
          providerSessionId: predecessor.providerSessionId,
          workingDirectory: options?.workingDirectory ?? predecessor.workingDirectory,
          resumePrompt: prompt,
          checkReadyQueue: false, // Don't check UWP for predecessor queries
        }
      );

      query.predecessorSessionId = session.id;
      query.status = 'waiting_response';

      // Set up response capture
      const responsePromise = this.captureResponse(query, events, timeout);

      // Wait for response with timeout
      const response = await responsePromise;

      // Suspend the predecessor session if requested (default: true)
      if (options?.suspendAfterResponse !== false && session.id) {
        await this.sessionManager.suspendSession(session.id, 'Predecessor query completed');
      }

      // Mark query as completed
      query.status = 'completed';
      query.completedAt = createTimestamp();

      return {
        success: true,
        response,
        predecessor,
        completedAt: query.completedAt,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Mark query as failed
      query.status = error instanceof TimeoutError ? 'timed_out' : 'failed';
      query.completedAt = createTimestamp();

      // Try to clean up the predecessor session if it was started
      if (query.predecessorSessionId) {
        try {
          await this.sessionManager.suspendSession(
            query.predecessorSessionId,
            `Predecessor query ${query.status}`
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        predecessor,
        completedAt: query.completedAt,
        durationMs: Date.now() - startTime,
      };
    } finally {
      // Remove from active queries after a short delay to allow status checks
      setTimeout(() => {
        this.activeQueries.delete(queryId);
      }, 5000);
    }
  }

  async getPredecessorInfo(role: AgentRole): Promise<PredecessorInfo | undefined> {
    const previousSession = await this.sessionManager.getPreviousSession(role);
    if (!previousSession) {
      return undefined;
    }

    // Must have a provider session ID to be resumable
    if (!previousSession.providerSessionId) {
      return undefined;
    }

    return {
      agentId: previousSession.agentId,
      agentName: previousSession.agentName,
      role: previousSession.role,
      providerSessionId: previousSession.providerSessionId,
      sessionId: previousSession.id,
      workingDirectory: previousSession.workingDirectory,
      originalStartedAt: previousSession.startedAt,
      suspendedAt: previousSession.endedAt,
    };
  }

  async hasPredecessor(role: AgentRole): Promise<boolean> {
    const info = await this.getPredecessorInfo(role);
    return info !== undefined;
  }

  getActiveQuery(queryId: string): ActivePredecessorQuery | undefined {
    return this.activeQueries.get(queryId);
  }

  listActiveQueries(): ActivePredecessorQuery[] {
    return Array.from(this.activeQueries.values());
  }

  async cancelQuery(queryId: string): Promise<void> {
    const query = this.activeQueries.get(queryId);
    if (!query) {
      return;
    }

    // Mark as failed
    query.status = 'failed';
    query.completedAt = createTimestamp();

    // Emit cancel event
    query.events.emit('cancelled');

    // Try to suspend the predecessor session if it was started
    if (query.predecessorSessionId) {
      try {
        await this.sessionManager.suspendSession(
          query.predecessorSessionId,
          'Predecessor query cancelled'
        );
      } catch {
        // Ignore cleanup errors
      }
    }

    // Remove from active queries
    this.activeQueries.delete(queryId);
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private generateQueryId(): string {
    this.queryCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.queryCounter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).slice(2, 6);
    return `pq-${timestamp}-${counter}-${random}`;
  }

  private normalizeTimeout(timeout?: number): number {
    if (timeout === undefined) {
      return DEFAULT_QUERY_TIMEOUT_MS;
    }
    return Math.min(Math.max(timeout, MIN_QUERY_TIMEOUT_MS), MAX_QUERY_TIMEOUT_MS);
  }

  private captureResponse(
    query: ActivePredecessorQuery,
    events: EventEmitter,
    timeout: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new TimeoutError(`Predecessor query timed out after ${timeout}ms`));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        events.off('event', onEvent);
        events.off('exit', onExit);
        events.off('error', onError);
        query.events.off('cancelled', onCancelled);
      };

      const onEvent = (event: SpawnedSessionEvent) => {
        // Accumulate assistant messages
        if (event.type === 'assistant' && event.message) {
          query.responseAccumulator += event.message;
        }

        // Check for result event (indicates completion)
        if (event.type === 'result') {
          cleanup();
          resolve(query.responseAccumulator.trim());
        }

        // Check for error event
        if (event.type === 'error') {
          cleanup();
          reject(new Error(event.raw.error ?? 'Unknown error from predecessor'));
        }
      };

      const onExit = (code: number | null, _signal: string | null) => {
        cleanup();
        if (query.responseAccumulator.trim()) {
          resolve(query.responseAccumulator.trim());
        } else {
          reject(new Error(`Predecessor session exited with code ${code} before responding`));
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onCancelled = () => {
        cleanup();
        reject(new Error('Query was cancelled'));
      };

      events.on('event', onEvent);
      events.on('exit', onExit);
      events.on('error', onError);
      query.events.on('cancelled', onCancelled);
    });
  }
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when a predecessor query times out
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when no predecessor is found for a role
 */
export class NoPredecessorError extends Error {
  constructor(role: AgentRole) {
    super(`No predecessor found for role: ${role}`);
    this.name = 'NoPredecessorError';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a PredecessorQueryService instance
 */
export function createPredecessorQueryService(
  sessionManager: SessionManager
): PredecessorQueryService {
  return new PredecessorQueryServiceImpl(sessionManager);
}
