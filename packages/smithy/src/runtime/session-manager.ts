/**
 * Session Manager Service
 *
 * This service manages agent sessions with provider session ID support for
 * resumable sessions and cross-restart persistence.
 *
 * Key features:
 * - Track active sessions with process metadata
 * - Persist session state to database via Agent entity metadata
 * - Start, resume, stop, and suspend sessions
 * - Message running sessions via agent channels
 * - Query session history per agent
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type { EntityId, Timestamp, MessageId, DocumentId } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';
import type { AgentRole, WorkerMode } from '../types/agent.js';
import type { AgentEntity } from '../api/orchestrator-api.js';
import { getAgentMetadata } from '../api/orchestrator-api.js';
import type {
  SpawnerService,
  SpawnOptions,
  SpawnResult,
  SessionStatus,
  UWPTaskInfo,
} from './spawner.js';
import type { AgentRegistry } from '../services/agent-registry.js';
import type { AgentProvider } from '../providers/types.js';
import { getProviderRegistry } from '../providers/registry.js';
import { ClaudeAgentProvider } from '../providers/claude/index.js';
import { OpenCodeAgentProvider } from '../providers/opencode/index.js';
import { CodexAgentProvider } from '../providers/codex/index.js';
import type { SettingsService } from '../services/settings-service.js';
import type { OperationLogService } from '../services/operation-log-service.js';
import { trackListeners } from './event-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Session record with persistence metadata
 */
export interface SessionRecord {
  /** Internal session ID (unique per spawn) */
  readonly id: string;
  /** Provider session ID (for resume) */
  readonly providerSessionId?: string;
  /** Agent entity ID this session belongs to */
  readonly agentId: EntityId;
  /** Agent role */
  readonly agentRole: AgentRole;
  /** Worker mode (for workers) */
  readonly workerMode?: WorkerMode;
  /** Spawn mode: headless or interactive */
  readonly mode: 'headless' | 'interactive';
  /** Process ID (if running) */
  readonly pid?: number;
  /** Current status */
  readonly status: SessionStatus;
  /** Working directory */
  readonly workingDirectory: string;
  /** Git worktree path (for workers) */
  readonly worktree?: string;
  /** Session created timestamp */
  readonly createdAt: Timestamp;
  /** Session started timestamp (when running state entered) */
  readonly startedAt?: Timestamp;
  /** Last activity timestamp */
  readonly lastActivityAt: Timestamp;
  /** Session ended timestamp (when terminated/suspended) */
  readonly endedAt?: Timestamp;
  /** Reason for termination (if applicable) */
  readonly terminationReason?: string;
}

/**
 * Options for starting a new session
 */
export interface StartSessionOptions {
  /** Working directory for the session */
  readonly workingDirectory?: string;
  /** Git worktree path */
  readonly worktree?: string;
  /** Initial prompt to send to the agent */
  readonly initialPrompt?: string;
  /** Additional environment variables */
  readonly environmentVariables?: Record<string, string>;
  /** Whether to use interactive mode (PTY) */
  readonly interactive?: boolean;
  /** Terminal columns (for interactive mode) */
  readonly cols?: number;
  /** Terminal rows (for interactive mode) */
  readonly rows?: number;
  /** LLM model to use for this session (overrides agent metadata) */
  readonly model?: string;
  /** Executable path override for rate limit fallback (takes highest priority in path resolution) */
  readonly executablePathOverride?: string;
}

/**
 * Options for resuming a session
 */
export interface ResumeSessionOptions {
  /** The provider session ID to resume */
  readonly providerSessionId: string;
  /** Working directory for the session */
  readonly workingDirectory?: string;
  /** Git worktree path */
  readonly worktree?: string;
  /** Additional prompt to send after resume */
  readonly resumePrompt?: string;
  /**
   * Whether to check the ready queue before resuming (UWP compliance).
   * If true (default), the session will check for assigned tasks before
   * continuing with the previous context.
   */
  readonly checkReadyQueue?: boolean;
  /**
   * Callback to get ready tasks - allows integration without circular deps.
   * If not provided and checkReadyQueue is true, UWP check will be skipped.
   */
  readonly getReadyTasks?: (agentId: EntityId, limit: number) => Promise<UWPTaskInfo[]>;
}

/**
 * Options for stopping a session
 */
export interface StopSessionOptions {
  /** Whether to attempt graceful shutdown (default: true) */
  readonly graceful?: boolean;
  /** Reason for stopping */
  readonly reason?: string;
}

/**
 * Options for sending a message to a session
 */
export interface MessageSessionOptions {
  /** Document ID containing the message content */
  readonly contentRef?: DocumentId;
  /** Message content (if contentRef not provided) */
  readonly content?: string;
  /** Entity ID of the sender */
  readonly senderId?: EntityId;
  /** Additional metadata for the message */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of sending a message to a session
 */
export interface MessageSessionResult {
  /** Whether the message was sent successfully */
  readonly success: boolean;
  /** The message ID if sent via channel */
  readonly messageId?: MessageId;
  /** Error message if failed */
  readonly error?: string;
}

/**
 * Filter options for listing sessions
 */
export interface SessionFilter {
  /** Filter by agent ID */
  readonly agentId?: EntityId;
  /** Filter by agent role */
  readonly role?: AgentRole;
  /** Filter by status */
  readonly status?: SessionStatus | SessionStatus[];
  /** Filter by sessions started after this time */
  readonly startedAfter?: Timestamp;
  /** Filter by sessions started before this time */
  readonly startedBefore?: Timestamp;
  /** Include only sessions with provider session IDs (resumable) */
  readonly resumable?: boolean;
}

/**
 * Session history entry stored in database
 */
export interface SessionHistoryEntry {
  /** Internal session ID */
  readonly id: string;
  /** Provider session ID */
  readonly providerSessionId?: string;
  /** Session status when entry was created */
  readonly status: SessionStatus;
  /** Working directory */
  readonly workingDirectory: string;
  /** Worktree path */
  readonly worktree?: string;
  /** Session started timestamp */
  readonly startedAt?: Timestamp;
  /** Session ended timestamp */
  readonly endedAt?: Timestamp;
  /** Termination reason */
  readonly terminationReason?: string;
}

/**
 * Role-based session history entry - includes agent context
 */
export interface RoleSessionHistoryEntry extends SessionHistoryEntry {
  /** Agent role for this session */
  readonly role: AgentRole;
  /** Agent entity ID */
  readonly agentId: EntityId;
  /** Agent name at time of session */
  readonly agentName?: string;
}

/**
 * Result of the UWP check performed during session resume
 */
export interface ResumeUWPCheckResult {
  /** Whether a ready task was found during the UWP check */
  readonly hasReadyTask: boolean;
  /** The task ID if a ready task was found */
  readonly taskId?: string;
  /** The task title if a ready task was found */
  readonly taskTitle?: string;
  /** The task priority if a ready task was found */
  readonly taskPriority?: number;
  /**
   * Whether the resumed session should process this task first.
   * If true, the resume prompt includes instructions to process the task.
   */
  readonly shouldProcessFirst: boolean;
}

// ============================================================================
// Session Manager Interface
// ============================================================================

/**
 * Session Manager interface for agent session lifecycle management.
 *
 * The manager provides methods for:
 * - Starting new agent sessions
 * - Resuming previous sessions with context preservation
 * - Stopping and suspending sessions
 * - Messaging running sessions
 * - Querying session history
 */
export interface SessionManager {
  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  /**
   * Starts a new session for an agent.
   *
   * @param agentId - The agent entity ID
   * @param options - Start options
   * @returns The session record and event emitter
   */
  startSession(
    agentId: EntityId,
    options?: StartSessionOptions
  ): Promise<{ session: SessionRecord; events: EventEmitter }>;

  /**
   * Resumes a previous session using its provider session ID.
   *
   * When `checkReadyQueue` is true (default), implements the Universal Work Principle (UWP):
   * - Before continuing with the previous context, checks if any tasks were assigned during suspension
   * - If tasks are found, the session will be instructed to process them first
   *
   * @param agentId - The agent entity ID
   * @param options - Resume options including the provider session ID
   * @returns The resumed session record, event emitter, and UWP check result
   */
  resumeSession(
    agentId: EntityId,
    options: ResumeSessionOptions
  ): Promise<{ session: SessionRecord; events: EventEmitter; uwpCheck?: ResumeUWPCheckResult }>;

  /**
   * Stops a running session.
   *
   * @param sessionId - The internal session ID
   * @param options - Stop options
   */
  stopSession(sessionId: string, options?: StopSessionOptions): Promise<void>;

  /**
   * Suspends a session (marks it for later resume).
   * The session can be resumed later using its provider session ID.
   *
   * @param sessionId - The internal session ID
   * @param reason - Optional reason for suspension
   */
  suspendSession(sessionId: string, reason?: string): Promise<void>;

  /**
   * Interrupts a running session (sends interrupt signal to stop current operation).
   * This is like pressing Escape in the Claude Code CLI - it stops the current
   * operation but keeps the session running.
   *
   * @param sessionId - The internal session ID
   */
  interruptSession(sessionId: string): Promise<void>;

  // ----------------------------------------
  // Session Queries
  // ----------------------------------------

  /**
   * Gets a session by internal ID.
   *
   * @param sessionId - The internal session ID
   * @returns The session record or undefined if not found
   */
  getSession(sessionId: string): SessionRecord | undefined;

  /**
   * Gets the active session for an agent.
   *
   * @param agentId - The agent entity ID
   * @returns The active session or undefined if none
   */
  getActiveSession(agentId: EntityId): SessionRecord | undefined;

  /**
   * Lists sessions matching the filter.
   *
   * @param filter - Filter options
   * @returns Array of matching session records
   */
  listSessions(filter?: SessionFilter): SessionRecord[];

  /**
   * Gets the most recent session for an agent that can be resumed.
   *
   * @param agentId - The agent entity ID
   * @returns The most recent resumable session or undefined
   */
  getMostRecentResumableSession(agentId: EntityId): SessionRecord | undefined;

  /**
   * Gets the session history for an agent from the database.
   *
   * @param agentId - The agent entity ID
   * @param limit - Maximum number of entries to return
   * @returns Array of session history entries
   */
  getSessionHistory(agentId: EntityId, limit?: number): Promise<SessionHistoryEntry[]>;

  /**
   * Gets the session history for a role across all agents.
   *
   * This aggregates session history from all agents with the specified role,
   * sorted by most recent first.
   *
   * @param role - The agent role to filter by
   * @param limit - Maximum number of entries to return (default 10)
   * @returns Array of role-based session history entries
   */
  getSessionHistoryByRole(role: AgentRole, limit?: number): Promise<RoleSessionHistoryEntry[]>;

  /**
   * Gets the most recent previous session for a role.
   *
   * Returns the most recently ended (suspended or terminated) session for
   * agents with the specified role. This is useful for predecessor queries
   * where a new agent needs to consult the previous session holder for context.
   *
   * @param role - The agent role to find previous session for
   * @returns The most recent previous session, or undefined if none found
   */
  getPreviousSession(role: AgentRole): Promise<RoleSessionHistoryEntry | undefined>;

  // ----------------------------------------
  // Session Communication
  // ----------------------------------------

  /**
   * Sends a message to a running session via its agent channel.
   *
   * For headless sessions, messages are queued for the agent to process.
   * For interactive sessions, messages appear in the agent's inbox.
   *
   * @param sessionId - The internal session ID
   * @param options - Message options
   * @returns Result of the send operation
   */
  messageSession(
    sessionId: string,
    options: MessageSessionOptions
  ): Promise<MessageSessionResult>;

  /**
   * Gets the event emitter for a session.
   *
   * Events emitted:
   * - 'event' (SpawnedSessionEvent) - Parsed stream-json event
   * - 'status' (SessionStatus) - Session status change
   * - 'error' (Error) - Session error
   * - 'exit' (code: number | null, signal: string | null) - Process exit
   *
   * @param sessionId - The internal session ID
   * @returns The event emitter or undefined if session not found
   */
  getEventEmitter(sessionId: string): EventEmitter | undefined;

  // ----------------------------------------
  // User Idle Tracking
  // ----------------------------------------

  /**
   * Records that the human user typed into a session's PTY.
   * Used for idle-based debouncing of message forwarding.
   *
   * @param sessionId - The internal session ID
   */
  recordUserInput(sessionId: string): void;

  /**
   * Gets how long (ms) the user has been idle in the agent's active session.
   * Returns undefined if the agent has no active session or no input has been recorded.
   *
   * @param agentId - The agent entity ID
   * @returns Milliseconds since last user input, or undefined
   */
  getSessionUserIdleMs(agentId: EntityId): number | undefined;

  // ----------------------------------------
  // Persistence
  // ----------------------------------------

  /**
   * Persists the current session state to the database.
   * Called automatically on state changes but can be called manually.
   *
   * @param sessionId - The internal session ID
   */
  persistSession(sessionId: string): Promise<void>;

  /**
   * Loads session state from the database for an agent.
   * Used to recover sessions after restart.
   *
   * @param agentId - The agent entity ID
   */
  loadSessionState(agentId: EntityId): Promise<void>;

  /**
   * Reconciles in-memory state with database on startup.
   * Finds agents marked as 'running' whose processes are no longer alive
   * and resets them to 'idle'.
   *
   * @returns Summary of reconciliation results
   */
  reconcileOnStartup(): Promise<{ reconciled: number; errors: string[] }>;

  /**
   * Sets the operation log service for persistent event logging.
   * Called after construction to avoid circular dependency issues.
   */
  setOperationLog(log: OperationLogService): void;
}

// ============================================================================
// Internal Session State
// ============================================================================

/**
 * Internal session state tracking
 */
interface InternalSessionState extends SessionRecord {
  /** Event emitter for session events */
  events: EventEmitter;
  /** Whether the session state has been persisted */
  persisted: boolean;
  /** Timestamp of last user input (Date.now()) for idle detection */
  lastUserInputAt?: number;
}

// ============================================================================
// Session Manager Implementation
// ============================================================================

/**
 * Implementation of the Session Manager.
 */
export class SessionManagerImpl implements SessionManager {
  private readonly sessions: Map<string, InternalSessionState> = new Map();
  private readonly agentSessions: Map<EntityId, string> = new Map(); // agentId -> active sessionId
  private readonly sessionHistory: Map<EntityId, SessionHistoryEntry[]> = new Map();
  private readonly sessionCleanupFns: Map<string, () => void> = new Map(); // sessionId -> cleanup function

  private operationLog: OperationLogService | undefined;

  constructor(
    private readonly spawner: SpawnerService,
    private readonly api: QuarryAPI, // Used for message operations in messageSession
    private readonly registry: AgentRegistry,
    private readonly settingsService?: SettingsService
  ) {
    // Subscribe to spawner events to track session state
    this.setupSpawnerEventHandlers();
  }

  /**
   * Gets the API instance for direct operations
   */
  getApi(): QuarryAPI {
    return this.api;
  }

  /**
   * Sets the operation log service for persistent event logging.
   * Called after construction to avoid circular dependency issues.
   */
  setOperationLog(log: OperationLogService): void {
    this.operationLog = log;
  }

  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  async startSession(
    agentId: EntityId,
    options?: StartSessionOptions
  ): Promise<{ session: SessionRecord; events: EventEmitter }> {
    // Get agent to determine role and mode
    const agent = await this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const meta = getAgentMetadata(agent);
    if (!meta) {
      throw new Error(`Entity is not a valid agent: ${agentId}`);
    }

    // Check if agent already has an active session
    const existingSessionId = this.agentSessions.get(agentId);
    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession && existingSession.status === 'running') {
        throw new Error(`Agent ${agentId} already has an active session: ${existingSessionId}`);
      }
    }

    // Determine interactive mode based on agent role if not explicitly specified
    // Directors and persistent workers use interactive mode (PTY)
    // Ephemeral workers and stewards use headless mode (stream-json)
    const isInteractiveByRole = meta.agentRole === 'director' ||
      (meta.agentRole === 'worker' && (meta as { workerMode?: WorkerMode }).workerMode === 'persistent');
    const useInteractive = options?.interactive ?? isInteractiveByRole;

    // Resolve provider from agent metadata, with executable path resolution.
    // executablePathOverride (from rate limit fallback) takes highest priority.
    const providerName = (meta as { provider?: string }).provider;
    const agentExecutablePath = options?.executablePathOverride ?? (meta as { executablePath?: string }).executablePath;
    const providerOverride = await this.resolveProvider(providerName, agentExecutablePath);

    // Resolve model: use options override, or fall back to agent metadata
    const modelOverride = options?.model ?? (meta as { model?: string }).model;

    // Build spawn options
    const spawnOptions: SpawnOptions = {
      workingDirectory: options?.workingDirectory,
      initialPrompt: options?.initialPrompt,
      environmentVariables: options?.environmentVariables,
      mode: useInteractive ? 'interactive' : 'headless',
      cols: options?.cols,
      rows: options?.rows,
      provider: providerOverride,
      model: modelOverride,
    };

    const resolvedPath = this.resolveExecutablePath(providerName ?? 'claude-code', agentExecutablePath);
    console.log('[session-manager] Starting session for agent', agentId, 'mode:', spawnOptions.mode, 'provider:', providerName ?? 'claude-code', 'model:', modelOverride ?? 'default', 'executablePath:', resolvedPath ?? 'default', 'prompt length:', options?.initialPrompt?.length ?? 0);

    // Spawn the session
    const result = await this.spawner.spawn(agentId, meta.agentRole, spawnOptions);

    // Create internal session state
    const sessionState = this.createSessionState(result, agentId, meta, options);

    // Track the session
    this.sessions.set(sessionState.id, sessionState);
    this.agentSessions.set(agentId, sessionState.id);

    // Forward events from spawner BEFORE any awaits to avoid missing
    // early exit events (e.g. when provider uses `exec` and the process
    // terminates before the awaits below complete).
    this.setupSessionEventForwarding(sessionState, result.events);

    // Update agent's session status in database
    await this.registry.updateAgentSession(agentId, result.session.providerSessionId, 'running');

    // Persist session state
    await this.persistSession(sessionState.id);

    // Log session spawn
    this.operationLog?.write('info', 'session', `Session started for agent ${agentId} (${meta.agentRole})`, { agentId, sessionId: sessionState.id });

    return {
      session: this.toPublicSession(sessionState),
      events: sessionState.events,
    };
  }

  async resumeSession(
    agentId: EntityId,
    options: ResumeSessionOptions
  ): Promise<{ session: SessionRecord; events: EventEmitter; uwpCheck?: ResumeUWPCheckResult }> {
    // Get agent to determine role and mode
    const agent = await this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const meta = getAgentMetadata(agent);
    if (!meta) {
      throw new Error(`Entity is not a valid agent: ${agentId}`);
    }

    // Check if agent already has an active session
    const existingSessionId = this.agentSessions.get(agentId);
    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession && existingSession.status === 'running') {
        throw new Error(`Agent ${agentId} already has an active session: ${existingSessionId}`);
      }
    }

    // Perform UWP check before resuming (if enabled)
    // This implements the Universal Work Principle: check queue before continuing previous context
    let uwpCheck: ResumeUWPCheckResult | undefined;
    const shouldCheckQueue = options.checkReadyQueue !== false; // Default to true

    if (shouldCheckQueue && options.getReadyTasks) {
      const readyTasks = await options.getReadyTasks(agentId, 1);

      if (readyTasks.length > 0) {
        const task = readyTasks[0];
        uwpCheck = {
          hasReadyTask: true,
          taskId: task.id,
          taskTitle: task.title,
          taskPriority: task.priority,
          shouldProcessFirst: true,
        };
      } else {
        uwpCheck = {
          hasReadyTask: false,
          shouldProcessFirst: false,
        };
      }
    }

    // Build the resume prompt, prepending task instructions if UWP found a task
    let effectivePrompt = options.resumePrompt;
    if (uwpCheck?.hasReadyTask && uwpCheck.shouldProcessFirst) {
      const taskInstructions = this.buildUWPTaskPrompt(uwpCheck);
      effectivePrompt = effectivePrompt
        ? `${taskInstructions}\n\n${effectivePrompt}`
        : taskInstructions;
    }

    // Look up the original session's working directory from history if not provided
    let workingDirectory = options.workingDirectory;
    if (!workingDirectory) {
      const history = await this.getSessionHistory(agentId, 20);
      const previousSession = history.find(h => h.providerSessionId === options.providerSessionId);
      if (previousSession?.workingDirectory) {
        workingDirectory = previousSession.workingDirectory;
      }
    }

    // Resolve provider from agent metadata, with executable path resolution
    const providerName = (meta as { provider?: string }).provider;
    const agentExecutablePath = (meta as { executablePath?: string }).executablePath;
    const providerOverride = await this.resolveProvider(providerName, agentExecutablePath);

    // Resolve model from agent metadata (resume doesn't allow model override)
    const modelFromMeta = (meta as { model?: string }).model;

    // Build spawn options with resume
    const spawnOptions: SpawnOptions = {
      workingDirectory,
      resumeSessionId: options.providerSessionId,
      initialPrompt: effectivePrompt,
      provider: providerOverride,
      model: modelFromMeta,
    };

    // Spawn the session with resume
    const result = await this.spawner.spawn(agentId, meta.agentRole, spawnOptions);

    // Create internal session state
    const sessionState = this.createSessionState(result, agentId, meta, {
      workingDirectory: options.workingDirectory,
      worktree: options.worktree,
    });

    // Track the session
    this.sessions.set(sessionState.id, sessionState);
    this.agentSessions.set(agentId, sessionState.id);

    // Forward events from spawner BEFORE any awaits to avoid missing
    // early exit events (e.g. when provider uses `exec` and the process
    // terminates before the awaits below complete).
    this.setupSessionEventForwarding(sessionState, result.events);

    // Update agent's session status in database
    await this.registry.updateAgentSession(agentId, options.providerSessionId, 'running');

    // Persist session state
    await this.persistSession(sessionState.id);

    return {
      session: this.toPublicSession(sessionState),
      events: sessionState.events,
      uwpCheck,
    };
  }

  async stopSession(sessionId: string, options?: StopSessionOptions): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Clean up event listeners to prevent leaks
    this.cleanupSessionEventListeners(sessionId);

    // Update session state BEFORE terminating to prevent race with exit event handler
    const updatedSession: InternalSessionState = {
      ...session,
      status: 'terminated',
      endedAt: createTimestamp(),
      terminationReason: options?.reason,
      persisted: false,
    };
    this.sessions.set(sessionId, updatedSession);

    // Clear active session for agent
    if (this.agentSessions.get(session.agentId) === sessionId) {
      this.agentSessions.delete(session.agentId);
    }

    // Add to history (do this before terminate to avoid race with exit handler)
    this.addToHistory(session.agentId, updatedSession);

    // Now terminate via spawner (may trigger exit event, but status already terminated)
    await this.spawner.terminate(sessionId, options?.graceful ?? true);

    // Update agent's session status in database
    await this.registry.updateAgentSession(session.agentId, undefined, 'idle');

    // Persist session state
    await this.persistSession(sessionId);

    // Schedule cleanup of terminated session from memory (M-1)
    this.scheduleTerminatedSessionCleanup(sessionId);

    // Emit status change
    session.events.emit('status', 'terminated');

    // Log session termination
    this.operationLog?.write('info', 'session', `Session terminated for agent ${session.agentId}${options?.reason ? `: ${options.reason}` : ''}`, { agentId: session.agentId, sessionId });
  }

  async interruptSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot interrupt session in status: ${session.status}`);
    }

    // Interrupt via spawner
    await this.spawner.interrupt(sessionId);

    // Emit interrupt event
    session.events.emit('interrupt');
  }

  async suspendSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Clean up event listeners to prevent leaks
    this.cleanupSessionEventListeners(sessionId);

    // Update session state BEFORE suspending to prevent race with exit event handler
    const updatedSession: InternalSessionState = {
      ...session,
      status: 'suspended',
      endedAt: createTimestamp(),
      terminationReason: reason,
      persisted: false,
    };
    this.sessions.set(sessionId, updatedSession);

    // Clear active session for agent (but keep in sessions map for resume)
    if (this.agentSessions.get(session.agentId) === sessionId) {
      this.agentSessions.delete(session.agentId);
    }

    // Now suspend via spawner (may trigger exit event, but status already 'suspended')
    try {
      await this.spawner.suspend(sessionId);
    } catch (error) {
      // Revert status on failure
      this.sessions.set(sessionId, session);
      if (this.agentSessions.get(session.agentId) !== sessionId) {
        this.agentSessions.set(session.agentId, sessionId);
      }
      throw error;
    }

    // Add to history
    this.addToHistory(session.agentId, updatedSession);

    // Update agent's session status in database
    await this.registry.updateAgentSession(session.agentId, session.providerSessionId, 'suspended');

    // Persist session state
    await this.persistSession(sessionId);

    // Emit status change
    updatedSession.events.emit('status', 'suspended');
  }

  // ----------------------------------------
  // Session Queries
  // ----------------------------------------

  getSession(sessionId: string): SessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toPublicSession(session) : undefined;
  }

  getActiveSession(agentId: EntityId): SessionRecord | undefined {
    const sessionId = this.agentSessions.get(agentId);
    if (!sessionId) {
      return undefined;
    }
    const session = this.sessions.get(sessionId);
    // Allow both 'starting' and 'running' status - 'starting' is needed for SSE
    // connections that happen before the Claude CLI emits its init event
    if (!session || (session.status !== 'running' && session.status !== 'starting')) {
      return undefined;
    }

    // Validate that the process/session is actually alive
    if (session.pid) {
      // Interactive sessions: check OS process liveness
      if (!this.isProcessAlive(session.pid)) {
        this.cleanupDeadSession(session);
        return undefined;
      }
    } else {
      // Headless sessions (no PID): cross-reference with spawner
      const spawnerSession = this.spawner.getSession(sessionId);
      if (!spawnerSession || spawnerSession.status === 'terminated') {
        this.cleanupDeadSession(session);
        return undefined;
      }
    }

    return this.toPublicSession(session);
  }

  listSessions(filter?: SessionFilter): SessionRecord[] {
    let sessions = Array.from(this.sessions.values());

    // Validate liveness for sessions in active states.
    // This catches sessions whose processes exited without the exit handler firing.
    const activeStatuses: SessionStatus[] = ['starting', 'running', 'terminating'];
    let didCleanup = false;
    for (const session of sessions) {
      if (!activeStatuses.includes(session.status)) continue;

      if (session.pid) {
        // Interactive sessions: check if the OS process is still alive
        if (!this.isProcessAlive(session.pid)) {
          this.cleanupDeadSession(session);
          didCleanup = true;
        }
      } else {
        // Headless sessions (no PID): cross-reference with the spawner.
        // If the spawner no longer tracks this session, the process has exited
        // and the exit event was lost or already processed by the spawner.
        const spawnerSession = this.spawner.getSession(session.id);
        if (!spawnerSession || spawnerSession.status === 'terminated') {
          this.cleanupDeadSession(session);
          didCleanup = true;
        }
      }
    }
    // Re-read after potential cleanups
    if (didCleanup) {
      sessions = Array.from(this.sessions.values());
    }

    if (filter) {
      if (filter.agentId !== undefined) {
        sessions = sessions.filter((s) => s.agentId === filter.agentId);
      }
      if (filter.role !== undefined) {
        sessions = sessions.filter((s) => s.agentRole === filter.role);
      }
      if (filter.status !== undefined) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        sessions = sessions.filter((s) => statuses.includes(s.status));
      }
      if (filter.startedAfter !== undefined) {
        const afterTime = this.getTimestampMs(filter.startedAfter);
        sessions = sessions.filter((s) => {
          if (!s.startedAt) return false;
          return this.getTimestampMs(s.startedAt) >= afterTime;
        });
      }
      if (filter.startedBefore !== undefined) {
        const beforeTime = this.getTimestampMs(filter.startedBefore);
        sessions = sessions.filter((s) => {
          if (!s.startedAt) return false;
          return this.getTimestampMs(s.startedAt) <= beforeTime;
        });
      }
      if (filter.resumable !== undefined) {
        sessions = sessions.filter((s) =>
          filter.resumable ? s.providerSessionId !== undefined : s.providerSessionId === undefined
        );
      }
    }

    return sessions.map((s) => this.toPublicSession(s));
  }

  getMostRecentResumableSession(agentId: EntityId): SessionRecord | undefined {
    const agentSessions = Array.from(this.sessions.values())
      .filter((s) => s.agentId === agentId && s.providerSessionId !== undefined)
      .sort((a, b) => {
        const aTime = this.getTimestampMs(a.createdAt);
        const bTime = this.getTimestampMs(b.createdAt);
        return bTime - aTime;
      });

    return agentSessions.length > 0 ? this.toPublicSession(agentSessions[0]) : undefined;
  }

  async getSessionHistory(agentId: EntityId, limit = 10): Promise<SessionHistoryEntry[]> {
    // First, check in-memory history
    const inMemoryHistory = this.sessionHistory.get(agentId) ?? [];

    // Load from agent metadata if needed
    const agent = await this.registry.getAgent(agentId);
    if (!agent) {
      return inMemoryHistory.slice(0, limit);
    }

    const meta = getAgentMetadata(agent);
    if (!meta) {
      return inMemoryHistory.slice(0, limit);
    }

    // Get persisted history from agent metadata
    const persistedHistory = this.getPersistedHistory(agent);

    // Merge and dedupe
    const allHistory = this.mergeHistory(inMemoryHistory, persistedHistory);

    return allHistory.slice(0, limit);
  }

  async getSessionHistoryByRole(role: AgentRole, limit = 10): Promise<RoleSessionHistoryEntry[]> {
    // Get all agents with the specified role
    const agents = await this.registry.getAgentsByRole(role);

    // Collect all session history entries from all agents with this role
    const allRoleHistory: RoleSessionHistoryEntry[] = [];

    for (const agent of agents) {
      // Agent.id is ElementId but we need EntityId for session history
      const agentId = agent.id as unknown as EntityId;
      const agentHistory = await this.getSessionHistory(agentId, limit);
      const agentMeta = getAgentMetadata(agent);

      // Convert to role-based entries
      for (const entry of agentHistory) {
        allRoleHistory.push({
          ...entry,
          role: agentMeta?.agentRole ?? role,
          agentId: agentId,
          agentName: agent.name,
        });
      }
    }

    // Sort by ended or started time, most recent first
    allRoleHistory.sort((a, b) => {
      const aTime = a.endedAt
        ? this.getTimestampMs(a.endedAt)
        : a.startedAt
          ? this.getTimestampMs(a.startedAt)
          : 0;
      const bTime = b.endedAt
        ? this.getTimestampMs(b.endedAt)
        : b.startedAt
          ? this.getTimestampMs(b.startedAt)
          : 0;
      return bTime - aTime;
    });

    return allRoleHistory.slice(0, limit);
  }

  async getPreviousSession(role: AgentRole): Promise<RoleSessionHistoryEntry | undefined> {
    // Get session history for the role
    const roleHistory = await this.getSessionHistoryByRole(role, 100);

    // Find the most recent session that has ended (suspended or terminated)
    const previousSession = roleHistory.find(
      (entry) => entry.status === 'suspended' || entry.status === 'terminated'
    );

    return previousSession;
  }

  // ----------------------------------------
  // Session Communication
  // ----------------------------------------

  async messageSession(
    sessionId: string,
    options: MessageSessionOptions
  ): Promise<MessageSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }

    // Validate options
    if (!options.contentRef && !options.content) {
      return { success: false, error: 'Either contentRef or content must be provided' };
    }

    // Get agent's channel
    const agent = await this.registry.getAgent(session.agentId);
    if (!agent) {
      return { success: false, error: `Agent not found: ${session.agentId}` };
    }

    const meta = getAgentMetadata(agent);
    const channelId = meta?.channelId;
    if (!channelId) {
      return { success: false, error: `Agent has no channel: ${session.agentId}` };
    }

    try {
      // Resolve message content
      let messageContent = options.content;
      if (!messageContent && options.contentRef) {
        const doc = await this.api.get(options.contentRef as unknown as Parameters<typeof this.api.get>[0]);
        if (doc && 'content' in doc) {
          messageContent = (doc as { content?: string }).content;
        }
      }

      if (!messageContent) {
        return { success: false, error: 'Could not resolve message content' };
      }

      // Format the message with sender context
      const senderId = options.senderId ?? 'system';
      const formattedMessage = `[Message from ${senderId}]: ${messageContent}`;

      // Forward to the running process via spawner
      if (session.mode === 'interactive') {
        // Write the message content first
        await this.spawner.writeToPty(sessionId, formattedMessage);
        // Wait for the terminal to process the pasted content before sending Enter.
        // The carriage return must be sent as a separate message to ensure proper submission.
        // A longer delay (1500ms) is needed to ensure large messages are fully received
        // by the PTY before the Enter key is sent.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await this.spawner.writeToPty(sessionId, '\r');
      } else {
        await this.spawner.sendInput(sessionId, formattedMessage);
      }

      // Update session activity
      const updatedSession: InternalSessionState = {
        ...session,
        lastActivityAt: createTimestamp(),
        persisted: false,
      };
      this.sessions.set(sessionId, updatedSession);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  getEventEmitter(sessionId: string): EventEmitter | undefined {
    const session = this.sessions.get(sessionId);
    return session?.events;
  }

  // ----------------------------------------
  // User Idle Tracking
  // ----------------------------------------

  recordUserInput(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastUserInputAt = Date.now();
    }
  }

  getSessionUserIdleMs(agentId: EntityId): number | undefined {
    const sessionId = this.agentSessions.get(agentId);
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session || !session.lastUserInputAt) return undefined;
    return Date.now() - session.lastUserInputAt;
  }

  // ----------------------------------------
  // Persistence
  // ----------------------------------------

  async persistSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Get current agent state
    const agent = await this.registry.getAgent(session.agentId);
    if (!agent) {
      return;
    }

    // Get the current in-memory session history for this agent
    const inMemoryHistory = this.sessionHistory.get(session.agentId) ?? [];

    // Update agent metadata with session info and history
    // This persists session history to database for cross-restart recovery
    await this.registry.updateAgentMetadata(session.agentId, {
      sessionId: session.providerSessionId,
      sessionStatus: session.status === 'running' ? 'running' : session.status === 'suspended' ? 'suspended' : 'idle',
      lastActivityAt: session.lastActivityAt,
      // Persist session history (limited to 20 entries to avoid bloat)
      sessionHistory: inMemoryHistory.slice(0, 20),
    } as Record<string, unknown>);

    // Mark as persisted
    const updatedSession: InternalSessionState = {
      ...session,
      persisted: true,
    };
    this.sessions.set(sessionId, updatedSession);
  }

  async loadSessionState(agentId: EntityId): Promise<void> {
    const agent = await this.registry.getAgent(agentId);
    if (!agent) {
      return;
    }

    const meta = getAgentMetadata(agent);
    if (!meta) {
      return;
    }

    // Load history from agent metadata
    const persistedHistory = this.getPersistedHistory(agent);
    if (persistedHistory.length > 0) {
      this.sessionHistory.set(agentId, persistedHistory);
    }

    // Check if there's a suspended session that can be resumed
    if (meta.sessionId && meta.sessionStatus === 'suspended') {
      // Create a placeholder session record for the suspended session
      const suspendedSession = persistedHistory.find(
        (h) => h.providerSessionId === meta.sessionId && h.status === 'suspended'
      );

      if (suspendedSession) {
        // Determine mode based on agent role - directors and persistent workers use interactive
        const isInteractive = meta.agentRole === 'director' ||
          (meta.agentRole === 'worker' && (meta as { workerMode?: WorkerMode }).workerMode === 'persistent');

        const sessionState: InternalSessionState = {
          id: suspendedSession.id,
          providerSessionId: suspendedSession.providerSessionId,
          agentId,
          agentRole: meta.agentRole,
          workerMode: meta.agentRole === 'worker' ? (meta as { workerMode?: WorkerMode }).workerMode : undefined,
          mode: isInteractive ? 'interactive' : 'headless',
          status: 'suspended',
          workingDirectory: suspendedSession.workingDirectory,
          worktree: suspendedSession.worktree,
          createdAt: suspendedSession.startedAt ?? createTimestamp(),
          startedAt: suspendedSession.startedAt,
          lastActivityAt: suspendedSession.endedAt ?? createTimestamp(),
          endedAt: suspendedSession.endedAt,
          terminationReason: suspendedSession.terminationReason,
          events: new EventEmitter(),
          persisted: true,
        };

        this.sessions.set(sessionState.id, sessionState);
      }
    }
  }

  async reconcileOnStartup(): Promise<{ reconciled: number; errors: string[] }> {
    let reconciled = 0;
    const errors: string[] = [];

    try {
      // Find all agents that are marked as 'running' in the database
      const agents = await this.registry.listAgents({ sessionStatus: 'running' });

      for (const agent of agents) {
        const agentId = agent.id as unknown as EntityId;
        const meta = getAgentMetadata(agent);
        if (!meta) continue;

        // Check if there's a live in-memory session for this agent
        const activeSessionId = this.agentSessions.get(agentId);
        if (activeSessionId) {
          const activeSession = this.sessions.get(activeSessionId);
          if (activeSession && activeSession.status === 'running') {
            // Session exists in memory and is running — check PID
            if (activeSession.pid && this.isProcessAlive(activeSession.pid)) {
              continue; // Process is alive, nothing to reconcile
            }
          }
        }

        // No live session — this agent is stale, reset to idle
        try {
          await this.registry.updateAgentSession(agentId, undefined, 'idle');
          reconciled++;
        } catch (error) {
          const msg = `Failed to reset agent ${agent.name} (${agentId}): ${error instanceof Error ? error.message : String(error)}`;
          errors.push(msg);
        }
      }
    } catch (error) {
      errors.push(`Failed to list agents: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { reconciled, errors };
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Resolves the executable path for a provider using the priority chain:
   * 1. Agent-specific executablePath from metadata
   * 2. Workspace-wide defaultExecutablePaths[providerName] from settings service
   * 3. undefined (provider will use its built-in default)
   */
  private resolveExecutablePath(
    providerName: string,
    agentExecutablePath?: string
  ): string | undefined {
    // Priority 1: Agent-specific override
    if (agentExecutablePath) {
      return agentExecutablePath;
    }

    // Priority 2: Workspace-wide default from settings
    if (this.settingsService) {
      const defaults = this.settingsService.getAgentDefaults();
      const workspacePath = defaults.defaultExecutablePaths[providerName];
      if (workspacePath) {
        return workspacePath;
      }
    }

    // Priority 3: No custom path — provider will use its built-in default
    return undefined;
  }

  /**
   * Creates a fresh provider instance with a custom executable path.
   * Returns undefined if no custom path is needed (use registry singleton instead).
   */
  private createProviderWithPath(
    providerName: string,
    executablePath: string
  ): AgentProvider {
    switch (providerName) {
      case 'claude-code':
      case 'claude': // backward compatibility
        return new ClaudeAgentProvider(executablePath);
      case 'opencode':
        return new OpenCodeAgentProvider({ executablePath });
      case 'codex':
        return new CodexAgentProvider({ executablePath });
      default:
        throw new Error(`Unknown provider '${providerName}' — cannot create with custom executable path`);
    }
  }

  /**
   * Resolves the provider for a session, creating a custom instance if a non-default
   * executable path is configured (agent-specific or workspace-wide).
   * Falls back to the registry singleton when no custom path is needed.
   */
  private async resolveProvider(
    providerName: string | undefined,
    agentExecutablePath?: string
  ): Promise<AgentProvider | undefined> {
    const effectiveProvider = providerName ?? 'claude-code';
    const resolvedPath = this.resolveExecutablePath(effectiveProvider, agentExecutablePath);

    if (resolvedPath) {
      // Custom path configured — create a fresh provider instance with it
      return this.createProviderWithPath(effectiveProvider, resolvedPath);
    }

    // No custom path — use registry singleton for non-default providers
    if (effectiveProvider !== 'claude-code') {
      const registry = getProviderRegistry();
      return registry.getOrThrow(effectiveProvider);
    }

    // Default claude-code provider — no override needed (spawner uses claude by default)
    return undefined;
  }

  private scheduleTerminatedSessionCleanup(sessionId: string): void {
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session && session.status === 'terminated') {
        this.sessions.delete(sessionId);
      }
    }, 5000);
  }

  /**
   * Checks whether a process with the given PID is still alive.
   * Uses signal 0 which doesn't kill — just checks existence.
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleans up a session whose process is no longer alive.
   * Transitions it to 'terminated' and schedules memory cleanup.
   */
  private cleanupDeadSession(session: InternalSessionState): void {
    const updated: InternalSessionState = {
      ...session,
      status: 'terminated',
      endedAt: createTimestamp(),
      terminationReason: 'Process no longer alive (PID check)',
      persisted: false,
    };
    this.sessions.set(session.id, updated);
    if (this.agentSessions.get(session.agentId) === session.id) {
      this.agentSessions.delete(session.agentId);
    }
    this.addToHistory(session.agentId, updated);
    this.registry.updateAgentSession(session.agentId, undefined, 'idle').catch(() => {});
    this.persistSession(session.id).then(() => {
      this.scheduleTerminatedSessionCleanup(session.id);
    }).catch(() => {});
  }

  private setupSpawnerEventHandlers(): void {
    // Note: The spawner emits events per-session via the session's event emitter
    // We don't need global event handlers here
  }

  private setupSessionEventForwarding(
    session: InternalSessionState,
    spawnerEvents: EventEmitter
  ): void {
    // Create named handler functions so we can remove them later
    const onEvent = (event: unknown) => {
      const current = this.sessions.get(session.id);
      if (!current) return;
      current.events.emit('event', event);
      // Update last activity
      this.sessions.set(session.id, {
        ...current,
        lastActivityAt: createTimestamp(),
        persisted: false,
      });
    };

    const onPtyData = (data: unknown) => {
      const current = this.sessions.get(session.id);
      if (!current) return;
      current.events.emit('pty-data', data);
      // Update last activity
      this.sessions.set(session.id, {
        ...current,
        lastActivityAt: createTimestamp(),
        persisted: false,
      });
    };

    const onError = (error: unknown) => {
      const current = this.sessions.get(session.id);
      if (!current) return;
      current.events.emit('error', error);
    };

    const onStderr = (data: unknown) => {
      const current = this.sessions.get(session.id);
      if (!current) return;
      current.events.emit('stderr', data);
    };

    const onRaw = (data: unknown) => {
      const current = this.sessions.get(session.id);
      if (!current) return;
      current.events.emit('raw', data);
    };

    const onRateLimited = (data: unknown) => {
      const current = this.sessions.get(session.id);
      if (!current) return;
      current.events.emit('rate_limited', data);
    };

    const onExit = async (code: number | null, signal: string | null) => {
      console.log(`[session-manager] Exit event received for session ${session.id}, agent ${session.agentId}, code=${code}, signal=${signal}`);

      // Clean up all spawner event listeners immediately to prevent leaks
      this.cleanupSessionEventListeners(session.id, spawnerEvents);

      const exitingSession = this.sessions.get(session.id);
      if (exitingSession) {
        exitingSession.events.emit('exit', code, signal);
      }

      // Update session status if not already updated
      const currentSession = this.sessions.get(session.id);
      if (currentSession && currentSession.status !== 'terminated' && currentSession.status !== 'suspended') {
        console.log(`[session-manager] Cleaning up ${currentSession.status} session ${session.id} for agent ${session.agentId}`);

        // Log unexpected session exits (non-zero exit code or signal)
        if (code !== null && code !== 0) {
          this.operationLog?.write('error', 'session', `Session ${session.id} exited with code ${code}`, { agentId: session.agentId, sessionId: session.id, exitCode: code });
        } else if (signal) {
          this.operationLog?.write('warn', 'session', `Session ${session.id} killed by signal ${signal}`, { agentId: session.agentId, sessionId: session.id, signal });
        }

        const updatedSession: InternalSessionState = {
          ...currentSession,
          status: 'terminated',
          endedAt: createTimestamp(),
          persisted: false,
        };
        this.sessions.set(session.id, updatedSession);

        // Clear active session mapping
        if (this.agentSessions.get(session.agentId) === session.id) {
          this.agentSessions.delete(session.agentId);
          console.log(`[session-manager] Cleared active session mapping for agent ${session.agentId}`);
        }

        // Add to history
        this.addToHistory(session.agentId, updatedSession);

        // Update agent status in registry to 'idle'
        try {
          await this.registry.updateAgentSession(session.agentId, undefined, 'idle');
          console.log(`[session-manager] Updated agent ${session.agentId} status to idle in registry`);
        } catch (error) {
          console.error(`[session-manager] Failed to update agent ${session.agentId} status:`, error);
        }

        // Persist session state
        try {
          await this.persistSession(session.id);
        } catch (error) {
          console.error(`[session-manager] Failed to persist session ${session.id}:`, error);
        }

        // Schedule cleanup of terminated session from memory (M-1)
        this.scheduleTerminatedSessionCleanup(session.id);

        updatedSession.events.emit('status', 'terminated');
      } else {
        console.log(`[session-manager] Session ${session.id} already in status: ${currentSession?.status ?? 'not found'}`);
      }
    };

    // Update providerSessionId when discovered by the spawner
    const onProviderSessionId = (providerSessionId: string) => {
      const current = this.sessions.get(session.id);
      if (!current || current.providerSessionId) return;
      this.sessions.set(session.id, {
        ...current,
        providerSessionId,
        persisted: false,
      });
      // Persist session so providerSessionId survives a server restart
      this.registry.updateAgentSession(session.agentId, providerSessionId, 'running').catch((err) => {
        console.error(`[session-manager] Failed to persist providerSessionId for ${session.id}:`, err);
      });
      this.persistSession(session.id).catch((err) => {
        console.error(`[session-manager] Failed to persist session after providerSessionId for ${session.id}:`, err);
      });
    };

    // Attach all event listeners with tracked maxListeners
    const cleanup = trackListeners(spawnerEvents, {
      'event': onEvent,
      'pty-data': onPtyData,
      'error': onError,
      'stderr': onStderr,
      'raw': onRaw,
      'rate_limited': onRateLimited,
      'exit': onExit,
      'provider-session-id': onProviderSessionId,
    });
    this.sessionCleanupFns.set(session.id, cleanup);
  }

  /**
   * Cleans up event listeners for a session.
   * Called when a session exits to prevent listener leaks.
   */
  private cleanupSessionEventListeners(sessionId: string, _spawnerEvents?: EventEmitter): void {
    const cleanup = this.sessionCleanupFns.get(sessionId);
    if (cleanup) {
      cleanup();
      this.sessionCleanupFns.delete(sessionId);
      console.log(`[session-manager] Cleaned up event listeners for session ${sessionId}`);
    }
  }

  private createSessionState(
    result: SpawnResult,
    agentId: EntityId,
    meta: { agentRole: AgentRole; workerMode?: WorkerMode },
    options?: { workingDirectory?: string; worktree?: string }
  ): InternalSessionState {
    return {
      id: result.session.id,
      providerSessionId: result.session.providerSessionId,
      agentId,
      agentRole: meta.agentRole,
      workerMode: meta.agentRole === 'worker' ? (meta as { workerMode?: WorkerMode }).workerMode : undefined,
      mode: result.session.mode,
      pid: result.session.pid,
      status: result.session.status,
      workingDirectory: result.session.workingDirectory,
      worktree: options?.worktree,
      createdAt: result.session.createdAt,
      startedAt: result.session.startedAt,
      lastActivityAt: result.session.lastActivityAt,
      events: new EventEmitter(),
      persisted: false,
    };
  }

  private toPublicSession(session: InternalSessionState): SessionRecord {
    return {
      id: session.id,
      providerSessionId: session.providerSessionId,
      agentId: session.agentId,
      agentRole: session.agentRole,
      workerMode: session.workerMode,
      mode: session.mode,
      pid: session.pid,
      status: session.status,
      workingDirectory: session.workingDirectory,
      worktree: session.worktree,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      endedAt: session.endedAt,
      terminationReason: session.terminationReason,
    };
  }

  private addToHistory(agentId: EntityId, session: InternalSessionState): void {
    const historyEntry: SessionHistoryEntry = {
      id: session.id,
      providerSessionId: session.providerSessionId,
      status: session.status,
      workingDirectory: session.workingDirectory,
      worktree: session.worktree,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      terminationReason: session.terminationReason,
    };

    const history = this.sessionHistory.get(agentId) ?? [];
    this.sessionHistory.set(
      agentId,
      [historyEntry, ...history.filter((h) => h.id !== session.id)].slice(0, 20)
    );
  }

  private getPersistedHistory(agent: AgentEntity): SessionHistoryEntry[] {
    // Session history is stored under metadata.agent.sessionHistory
    const agentMeta = agent.metadata?.agent as unknown as Record<string, unknown> | undefined;
    const sessionHistory = agentMeta?.sessionHistory;
    if (!Array.isArray(sessionHistory)) {
      return [];
    }
    // Validate and type-cast
    return sessionHistory.filter((entry): entry is SessionHistoryEntry => {
      if (typeof entry !== 'object' || entry === null) return false;
      const e = entry as Record<string, unknown>;
      return (
        typeof e.id === 'string' &&
        typeof e.status === 'string' &&
        typeof e.workingDirectory === 'string'
      );
    });
  }

  private mergeHistory(
    inMemory: SessionHistoryEntry[],
    persisted: SessionHistoryEntry[]
  ): SessionHistoryEntry[] {
    const seen = new Set<string>();
    const merged: SessionHistoryEntry[] = [];

    // In-memory history takes precedence (more recent)
    for (const entry of inMemory) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    // Add persisted entries not in memory
    for (const entry of persisted) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    // Sort by start time descending
    return merged.sort((a, b) => {
      const aTime = a.startedAt ? this.getTimestampMs(a.startedAt) : 0;
      const bTime = b.startedAt ? this.getTimestampMs(b.startedAt) : 0;
      return bTime - aTime;
    });
  }

  private getTimestampMs(timestamp: Timestamp): number {
    return typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  }

  /**
   * Builds the UWP task prompt to instruct the agent to process the assigned task first.
   * This ensures compliance with the Universal Work Principle: "If there is work on your anchor, YOU MUST RUN IT"
   */
  private buildUWPTaskPrompt(uwpCheck: ResumeUWPCheckResult): string {
    const parts = [
      '**IMPORTANT: Task Assigned During Suspension**',
      '',
      'Before continuing with any previous context, you must first process the following assigned task:',
      '',
      `- Task ID: ${uwpCheck.taskId}`,
    ];

    if (uwpCheck.taskTitle) {
      parts.push(`- Title: ${uwpCheck.taskTitle}`);
    }

    if (uwpCheck.taskPriority !== undefined) {
      parts.push(`- Priority: ${uwpCheck.taskPriority}`);
    }

    parts.push(
      '',
      'Please check the task details and begin working on it immediately.',
      'Use `sf task get ' + uwpCheck.taskId + '` to retrieve full task details.',
    );

    return parts.join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a SessionManager instance
 */
export function createSessionManager(
  spawner: SpawnerService,
  api: QuarryAPI,
  registry: AgentRegistry,
  settingsService?: SettingsService
): SessionManager {
  return new SessionManagerImpl(spawner, api, registry, settingsService);
}
