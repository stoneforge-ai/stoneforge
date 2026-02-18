/**
 * Spawner Service
 *
 * This service manages spawning and lifecycle of agent processes
 * for AI agents in the orchestration system.
 *
 * Key features:
 * - Spawn headless agents (ephemeral workers, stewards) via provider abstraction
 * - Spawn interactive agents (Director, persistent workers) via provider abstraction
 * - Resume existing sessions with provider session IDs
 * - Parse stream-json events (assistant, tool_use, tool_result, error)
 * - Track session metadata for cross-restart resumption
 * - Provider-agnostic: supports Claude Code, OpenCode, and future providers
 *
 * @module
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { EntityId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { AgentRole, WorkerMode } from '../types/agent.js';
import type {
  AgentProvider,
  HeadlessSession,
  InteractiveSession,
  AgentMessage,
} from '../providers/types.js';
import { ClaudeAgentProvider } from '../providers/claude/index.js';
import { isRateLimitMessage, parseRateLimitResetTime } from '../utils/rate-limit-parser.js';

/**
 * Shell-quotes a string for safe inclusion in a bash command.
 * Wraps in single quotes and escapes internal single quotes.
 */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ============================================================================
// Types
// ============================================================================

/**
 * Mode for spawning an agent process
 */
export type SpawnMode = 'headless' | 'interactive';

/**
 * Configuration for spawn behavior
 */
export interface SpawnConfig {
  /** Agent provider to use (defaults to Claude) */
  readonly provider?: AgentProvider;
  /** @deprecated Use provider instead. The Claude Code executable path. */
  readonly claudePath?: string;
  /** Working directory for the agent */
  readonly workingDirectory?: string;
  /** Environment variables to pass to the process */
  readonly environmentVariables?: Record<string, string>;
  /** Timeout for process operations in milliseconds */
  readonly timeout?: number;
  /** Root directory for stoneforge (passed as STONEFORGE_ROOT) */
  readonly stoneforgeRoot?: string;
}

/**
 * Options for spawning an agent session
 */
export interface SpawnOptions extends SpawnConfig {
  /** Provider session ID to resume (if any) */
  readonly resumeSessionId?: string;
  /** Initial prompt to send to the agent */
  readonly initialPrompt?: string;
  /** Spawn mode: headless (stream-json) or interactive (PTY) */
  readonly mode?: SpawnMode;
  /** Terminal columns (for interactive mode, default 120) */
  readonly cols?: number;
  /** Terminal rows (for interactive mode, default 30) */
  readonly rows?: number;
  /** Model identifier to use (e.g., 'claude-sonnet-4-20250514'). If not set, uses provider default. */
  readonly model?: string;
}

/**
 * Stream-json event types from Claude Code
 */
export type StreamJsonEventType =
  | 'system'
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error';

/**
 * Stream-json event structure from Claude Code
 */
export interface StreamJsonEvent {
  /** Event type */
  readonly type: StreamJsonEventType;
  /** Event subtype (e.g., 'init', 'text', 'input_json_delta') */
  readonly subtype?: string;
  /** Session ID (from init event) */
  readonly session_id?: string;
  /** Tool information */
  readonly tool?: string;
  readonly tool_use_id?: string;
  readonly tool_input?: unknown;
  /** Content (for assistant/user messages) */
  readonly message?: string;
  readonly content?: string;
  /** Timestamp */
  readonly timestamp?: string;
  /** Error information */
  readonly error?: string;
  /** Result status */
  readonly result?: string;
  /** Raw event data */
  readonly [key: string]: unknown;
}

/**
 * Parsed event with typed data
 */
export interface SpawnedSessionEvent {
  /** Event type */
  readonly type: StreamJsonEventType;
  /** Event subtype */
  readonly subtype?: string;
  /** Timestamp when event was received */
  readonly receivedAt: Timestamp;
  /** Raw event data */
  readonly raw: StreamJsonEvent;
  /** Parsed message content (if any) */
  readonly message?: string;
  /** Tool information (if tool_use or tool_result) */
  readonly tool?: {
    readonly name?: string;
    readonly id?: string;
    readonly input?: unknown;
  };
}

/**
 * Status of a spawned session
 */
export type SessionStatus = 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';

/**
 * Session state machine transitions
 */
export const SessionStatusTransitions: Record<SessionStatus, SessionStatus[]> = {
  starting: ['running', 'terminated'],
  running: ['suspended', 'terminating', 'terminated'],
  suspended: ['running', 'terminated'],
  terminating: ['terminated'],
  terminated: [],
};

/**
 * Spawned session information
 */
export interface SpawnedSession {
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
  /** Spawn mode used */
  readonly mode: SpawnMode;
  /** Process ID */
  readonly pid?: number;
  /** Current status */
  status: SessionStatus;
  /** Working directory */
  readonly workingDirectory: string;
  /** Session created timestamp */
  readonly createdAt: Timestamp;
  /** Last activity timestamp */
  lastActivityAt: Timestamp;
  /** Session started timestamp (when running state entered) */
  startedAt?: Timestamp;
  /** Session ended timestamp (when terminated) */
  endedAt?: Timestamp;
}

/**
 * Internal session state tracking
 */
interface InternalSession extends SpawnedSession {
  /** Child process handle (for headless mode - legacy) */
  process?: ChildProcess;
  /** Provider headless session handle */
  headlessSession?: HeadlessSession;
  /** Provider interactive session handle */
  interactiveSession?: InteractiveSession;
  /** Event emitter for session events */
  events: EventEmitter;
  /** Buffer for incomplete JSON lines */
  jsonBuffer: string;
  /** Terminal columns (for interactive mode) */
  cols?: number;
  /** Terminal rows (for interactive mode) */
  rows?: number;
  /** Executable path used for this session's provider */
  executablePath?: string;
}

/**
 * Result of spawning an agent
 */
export interface SpawnResult {
  /** The spawned session */
  session: SpawnedSession;
  /** Event emitter for session events */
  events: EventEmitter;
}

/**
 * Options for sending input to a headless agent
 */
export interface SendInputOptions {
  /** Whether this is a user message (vs system command) */
  readonly isUserMessage?: boolean;
}

/**
 * Result of the UWP (Universal Work Principle) check
 */
export interface UWPCheckResult {
  /** Whether a ready task was found */
  hasReadyTask: boolean;
  /** The ready task ID if found */
  taskId?: string;
  /** The task title if found */
  taskTitle?: string;
  /** The task priority if found */
  taskPriority?: number;
  /** Whether the task was automatically started */
  autoStarted: boolean;
  /** Session ID if a task was auto-started */
  sessionId?: string;
}

// ============================================================================
// Spawner Service Interface
// ============================================================================

/**
 * Spawner Service interface for agent process management.
 *
 * The service provides methods for:
 * - Spawning new agent sessions (headless or interactive)
 * - Resuming previous sessions
 * - Managing session lifecycle
 * - Sending input to headless agents
 */
export interface SpawnerService {
  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  /**
   * Spawns a new agent session.
   *
   * @param agentId - The agent entity ID
   * @param agentRole - The agent's role
   * @param options - Spawn options
   * @returns The spawn result with session info and event emitter
   */
  spawn(
    agentId: EntityId,
    agentRole: AgentRole,
    options?: SpawnOptions
  ): Promise<SpawnResult>;

  /**
   * Terminates a running session.
   *
   * @param sessionId - The internal session ID
   * @param graceful - Whether to attempt graceful shutdown (default: true)
   */
  terminate(sessionId: string, graceful?: boolean): Promise<void>;

  /**
   * Suspends a session (marks it for later resume).
   *
   * @param sessionId - The internal session ID
   */
  suspend(sessionId: string): Promise<void>;

  /**
   * Interrupts a running session.
   * For headless sessions, this sends an interrupt signal.
   * For interactive sessions, this sends Escape key.
   *
   * @param sessionId - The internal session ID
   */
  interrupt(sessionId: string): Promise<void>;

  // ----------------------------------------
  // Session Queries
  // ----------------------------------------

  /**
   * Gets a session by internal ID.
   *
   * @param sessionId - The internal session ID
   * @returns The session or undefined if not found
   */
  getSession(sessionId: string): SpawnedSession | undefined;

  /**
   * Lists all active sessions.
   *
   * @param agentId - Optional filter by agent ID
   * @returns Array of active sessions
   */
  listActiveSessions(agentId?: EntityId): SpawnedSession[];

  /**
   * Lists all sessions (including terminated).
   *
   * @param agentId - Optional filter by agent ID
   * @returns Array of all sessions
   */
  listAllSessions(agentId?: EntityId): SpawnedSession[];

  /**
   * Gets the most recent session for an agent.
   *
   * @param agentId - The agent entity ID
   * @returns The most recent session or undefined
   */
  getMostRecentSession(agentId: EntityId): SpawnedSession | undefined;

  // ----------------------------------------
  // Headless Agent Communication
  // ----------------------------------------

  /**
   * Sends input to a headless agent's stdin.
   *
   * @param sessionId - The internal session ID
   * @param input - The input to send (will be formatted as stream-json)
   * @param options - Send options
   */
  sendInput(sessionId: string, input: string, options?: SendInputOptions): Promise<void>;

  /**
   * Writes data directly to an interactive PTY session.
   * This is for interactive sessions where input is sent character-by-character.
   *
   * @param sessionId - The internal session ID
   * @param data - The data to write to the PTY
   */
  writeToPty(sessionId: string, data: string): Promise<void>;

  /**
   * Resizes an interactive PTY session.
   *
   * @param sessionId - The internal session ID
   * @param cols - Number of columns
   * @param rows - Number of rows
   */
  resize(sessionId: string, cols: number, rows: number): Promise<void>;

  // ----------------------------------------
  // Event Subscription
  // ----------------------------------------

  /**
   * Gets the event emitter for a session.
   *
   * Events emitted:
   * - 'event' (SpawnedSessionEvent) - Parsed stream-json event
   * - 'error' (Error) - Process error
   * - 'exit' (code: number | null, signal: string | null) - Process exit
   *
   * @param sessionId - The internal session ID
   * @returns The event emitter or undefined if session not found
   */
  getEventEmitter(sessionId: string): EventEmitter | undefined;

  // ----------------------------------------
  // Universal Work Principle (UWP)
  // ----------------------------------------

  /**
   * Checks the ready queue for an agent and optionally auto-starts the first task.
   *
   * This implements the Universal Work Principle (UWP):
   * "If there is work on your anchor, YOU MUST RUN IT"
   *
   * On agent startup:
   * 1. Query tasks ready for this agent (assigned to them, status open/in_progress)
   * 2. If task exists → Optionally set task status to IN_PROGRESS, return task info
   * 3. If no task → Return empty result, agent should enter idle/polling mode
   *
   * @param agentId - The agent entity ID to check tasks for
   * @param options - Options for the check
   * @returns UWP check result with task info if found
   */
  checkReadyQueue(
    agentId: EntityId,
    options?: UWPCheckOptions
  ): Promise<UWPCheckResult>;
}

/**
 * Options for UWP ready queue check
 */
export interface UWPCheckOptions {
  /** Whether to automatically mark the task as started (default: false) */
  autoStart?: boolean;
  /** Maximum number of tasks to check (default: 1) */
  limit?: number;
  /** Callback to get task info - allows integration without circular deps */
  getReadyTasks?: (agentId: EntityId, limit: number) => Promise<UWPTaskInfo[]>;
}

/**
 * Task information for UWP check
 */
export interface UWPTaskInfo {
  id: string;
  title: string;
  priority: number;
  status: string;
}

// ============================================================================
// Argument Building (exported for testing)
// ============================================================================

/**
 * Options for building headless CLI arguments
 */
export interface HeadlessArgsOptions {
  /** Provider session ID to resume */
  resumeSessionId?: string;
  /** Initial prompt to send */
  initialPrompt?: string;
}

/**
 * Builds the CLI arguments for headless (non-interactive) Claude Code spawning.
 *
 * This function is exported to allow unit testing of the argument construction,
 * which is critical for ensuring Claude Code is invoked correctly.
 *
 * @param options - Options affecting argument construction
 * @returns Array of CLI arguments
 */
export function buildHeadlessArgs(options?: HeadlessArgsOptions): string[] {
  const args: string[] = [
    '-p', // Print mode (non-interactive)
    '--verbose', // Required for stream-json output in print mode
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
  ];

  if (options?.resumeSessionId) {
    args.push('--resume', options.resumeSessionId);
  }

  // Note: initialPrompt is NOT added as a CLI argument when using --input-format stream-json.
  // Instead, it must be sent via stdin in JSON format after the process starts.
  // This is handled in spawnHeadless().

  return args;
}

// ============================================================================
// Spawner Service Implementation
// ============================================================================

/**
 * Implementation of the Spawner Service.
 * Uses the provider abstraction to spawn and manage agent processes.
 */
export class SpawnerServiceImpl implements SpawnerService {
  private readonly sessions: Map<string, InternalSession> = new Map();
  private readonly defaultConfig: SpawnConfig;
  private readonly provider: AgentProvider;
  private sessionCounter = 0;

  constructor(config?: SpawnConfig) {
    this.defaultConfig = {
      claudePath: config?.claudePath ?? 'claude',
      workingDirectory: config?.workingDirectory ?? process.cwd(),
      timeout: config?.timeout ?? 120000, // 2 minutes default
      stoneforgeRoot: config?.stoneforgeRoot,
      environmentVariables: config?.environmentVariables,
    };

    // Use injected provider or default to Claude
    this.provider = config?.provider ?? new ClaudeAgentProvider(config?.claudePath ?? 'claude');
  }

  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  async spawn(
    agentId: EntityId,
    agentRole: AgentRole,
    options?: SpawnOptions
  ): Promise<SpawnResult> {
    const mode = this.determineSpawnMode(agentRole, options?.mode);
    const now = createTimestamp();
    const sessionId = this.generateSessionId();

    // Create session record
    const session: InternalSession = {
      id: sessionId,
      agentId,
      agentRole,
      workerMode: this.getWorkerMode(agentRole, options?.mode),
      mode,
      status: 'starting',
      workingDirectory: options?.workingDirectory ?? this.defaultConfig.workingDirectory!,
      createdAt: now,
      lastActivityAt: now,
      events: new EventEmitter(),
      jsonBuffer: '',
    };

    this.sessions.set(sessionId, session);

    try {
      if (mode === 'headless') {
        await this.spawnHeadless(session, options);
      } else {
        await this.spawnInteractive(session, options);
      }

      return {
        session: this.toPublicSession(session),
        events: session.events,
      };
    } catch (error) {
      // Clean up on failure — guard against double-termination since
      // spawnHeadless/spawnInteractive catch blocks may have already
      // transitioned the session to 'terminated'.
      if (session.status !== 'terminated') {
        session.status = 'terminated';
      }
      if (!session.endedAt) {
        session.endedAt = createTimestamp();
      }
      throw error;
    }
  }

  async terminate(sessionId: string, graceful = true): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'terminated' || session.status === 'terminating') {
      return;
    }

    this.transitionStatus(session, 'terminating');

    // Handle provider interactive sessions
    if (session.interactiveSession) {
      if (graceful) {
        session.interactiveSession.write('exit\r');

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            clearInterval(checkInterval);
            if (session.interactiveSession) {
              session.interactiveSession.kill();
            }
            resolve();
          }, 5000);

          const checkInterval = setInterval(() => {
            if ((session.status as SessionStatus) === 'terminated') {
              clearInterval(checkInterval);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });
      } else {
        session.interactiveSession.kill();
      }
    }

    // Handle provider headless sessions
    if (session.headlessSession) {
      session.headlessSession.close();
    }

    // Handle headless process sessions (legacy)
    if (session.process) {
      if (graceful) {
        session.process.kill('SIGTERM');

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (session.process && !session.process.killed) {
              session.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          session.process?.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } else {
        session.process.kill('SIGKILL');
      }
    }

    // Only transition if not already terminated
    if ((session.status as SessionStatus) !== 'terminated') {
      this.transitionStatus(session, 'terminated');
      session.endedAt = createTimestamp();
    }

    this.scheduleTerminatedSessionCleanup(sessionId);
  }

  async suspend(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot suspend session in status: ${session.status}`);
    }

    // For headless, close the session but mark as suspended
    // The providerSessionId can be used to resume later
    if (session.headlessSession) {
      session.headlessSession.close();
    }
    if (session.process) {
      session.process.kill('SIGTERM');
    }

    // For interactive, kill the PTY but mark as suspended
    if (session.interactiveSession) {
      session.interactiveSession.kill();
    }

    this.transitionStatus(session, 'suspended');
    session.lastActivityAt = createTimestamp();
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot interrupt session in status: ${session.status}`);
    }

    // For provider headless sessions, use interrupt
    if (session.headlessSession) {
      await session.headlessSession.interrupt();
    }
    // For legacy process-based headless sessions, send SIGINT
    else if (session.process) {
      session.process.kill('SIGINT');
    }

    // For interactive PTY sessions, send Escape key
    if (session.interactiveSession) {
      session.interactiveSession.write('\x1b');
    }

    session.lastActivityAt = createTimestamp();
  }

  // ----------------------------------------
  // Session Queries
  // ----------------------------------------

  getSession(sessionId: string): SpawnedSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toPublicSession(session) : undefined;
  }

  listActiveSessions(agentId?: EntityId): SpawnedSession[] {
    const sessions = Array.from(this.sessions.values())
      .filter((s) => s.status !== 'terminated');

    return this.filterAndMapSessions(sessions, agentId);
  }

  listAllSessions(agentId?: EntityId): SpawnedSession[] {
    const sessions = Array.from(this.sessions.values());
    return this.filterAndMapSessions(sessions, agentId);
  }

  getMostRecentSession(agentId: EntityId): SpawnedSession | undefined {
    const agentSessions = Array.from(this.sessions.values())
      .filter((s) => s.agentId === agentId)
      .sort((a, b) => {
        const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
        const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
        return bTime - aTime;
      });

    return agentSessions.length > 0 ? this.toPublicSession(agentSessions[0]) : undefined;
  }

  // ----------------------------------------
  // Headless Agent Communication
  // ----------------------------------------

  async sendInput(sessionId: string, input: string, _options?: SendInputOptions): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.mode !== 'headless') {
      throw new Error('sendInput is only supported for headless sessions');
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot send input to session in status: ${session.status}`);
    }

    // For provider headless sessions, use sendMessage
    if (session.headlessSession) {
      session.headlessSession.sendMessage(input);
      session.lastActivityAt = createTimestamp();
      return;
    }

    // For legacy process-based sessions, write to stdin
    if (!session.process?.stdin?.writable) {
      throw new Error('Session stdin is not writable');
    }

    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: input,
      },
    };

    session.process.stdin.write(JSON.stringify(message) + '\n');
    session.lastActivityAt = createTimestamp();
  }

  // ----------------------------------------
  // Interactive PTY Communication
  // ----------------------------------------

  async writeToPty(sessionId: string, data: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.mode !== 'interactive') {
      throw new Error('writeToPty is only supported for interactive sessions');
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot write to PTY in status: ${session.status}`);
    }

    if (!session.interactiveSession) {
      throw new Error('Session PTY is not available');
    }

    session.interactiveSession.write(data);
    session.lastActivityAt = createTimestamp();
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.mode !== 'interactive') {
      throw new Error('resize is only supported for interactive sessions');
    }

    if (!session.interactiveSession) {
      throw new Error('Session PTY is not available');
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot resize session in ${session.status} state`);
    }

    try {
      session.interactiveSession.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
      session.lastActivityAt = createTimestamp();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('EBADF') || errorMessage.includes('ioctl')) {
        console.warn(`[spawner] Resize failed for session ${sessionId} (PTY may be closed): ${errorMessage}`);
        return;
      }
      throw error;
    }
  }

  // ----------------------------------------
  // Event Subscription
  // ----------------------------------------

  getEventEmitter(sessionId: string): EventEmitter | undefined {
    const session = this.sessions.get(sessionId);
    return session?.events;
  }

  // ----------------------------------------
  // Universal Work Principle (UWP)
  // ----------------------------------------

  async checkReadyQueue(
    agentId: EntityId,
    options?: UWPCheckOptions
  ): Promise<UWPCheckResult> {
    const limit = options?.limit ?? 1;

    if (!options?.getReadyTasks) {
      return {
        hasReadyTask: false,
        autoStarted: false,
      };
    }

    const readyTasks = await options.getReadyTasks(agentId, limit);

    if (readyTasks.length === 0) {
      return {
        hasReadyTask: false,
        autoStarted: false,
      };
    }

    const task = readyTasks[0];

    const result: UWPCheckResult = {
      hasReadyTask: true,
      taskId: task.id,
      taskTitle: task.title,
      taskPriority: task.priority,
      autoStarted: false,
    };

    if (options.autoStart) {
      result.autoStarted = true;
    }

    return result;
  }

  // ----------------------------------------
  // Private Helpers - Spawning
  // ----------------------------------------

  private async spawnHeadless(session: InternalSession, options?: SpawnOptions): Promise<void> {
    const headlessProvider = options?.provider?.headless ?? this.provider.headless;

    // Track the executable path used for this session so rate limit events
    // can identify which executable was limited.
    session.executablePath = options?.claudePath ?? this.defaultConfig.claudePath;

    try {
      const headlessSession = await headlessProvider.spawn({
        workingDirectory: session.workingDirectory,
        initialPrompt: options?.initialPrompt,
        resumeSessionId: options?.resumeSessionId,
        environmentVariables: {
          ...this.defaultConfig.environmentVariables,
          ...options?.environmentVariables,
        },
        stoneforgeRoot: options?.stoneforgeRoot ?? this.defaultConfig.stoneforgeRoot,
        timeout: options?.timeout ?? this.defaultConfig.timeout,
        model: options?.model,
      });

      session.headlessSession = headlessSession;

      // Process messages from the provider in the background
      this.processProviderMessages(session, headlessSession);

      // Wait for the init event to get the provider session ID
      await this.waitForInit(session, options?.timeout ?? this.defaultConfig.timeout!);
    } catch (error) {
      if (session.status !== 'terminated') {
        this.transitionStatus(session, 'terminated');
      }
      if (!session.endedAt) {
        session.endedAt = createTimestamp();
      }
      throw error;
    }
  }

  /**
   * Process provider messages and emit them as session events.
   */
  private async processProviderMessages(
    session: InternalSession,
    headlessSession: HeadlessSession
  ): Promise<void> {
    let resumeErrorDetected = false;
    try {
      for await (const message of headlessSession) {
        if (session.status === 'terminated') {
          break;
        }

        // Check for resume failure
        if (message.type === 'result' && message.subtype === 'error_during_execution') {
          const raw = message.raw as { errors?: string[] };
          const errors = raw?.errors || [];
          const sessionNotFoundError = errors.find((e: string) => e.includes('No conversation found with session ID'));
          if (sessionNotFoundError) {
            resumeErrorDetected = true;
            session.events.emit('resume_failed', {
              reason: 'session_not_found',
              message: sessionNotFoundError,
            });
          }
        }

        // Check for rate limit
        if (message.content && isRateLimitMessage(message.content)) {
          const resetsAt = parseRateLimitResetTime(message.content);
          session.events.emit('rate_limited', {
            message: message.content,
            resetsAt,
            executablePath: session.executablePath,
          });
        }

        // Convert AgentMessage to SpawnedSessionEvent
        const event = this.convertAgentMessageToEvent(message);
        if (event) {
          session.events.emit('event', event);

          // Extract provider session ID from system init message
          if (message.type === 'system' && message.subtype === 'init' && message.sessionId) {
            (session as { providerSessionId: string }).providerSessionId = message.sessionId;
            session.events.emit('provider-session-id', message.sessionId);
          }
        }

        // Detect agent completion: when we receive a 'result' message that is
        // NOT an error, the agent has finished its work. For headless sessions
        // using streaming input mode (stewards, ephemeral workers), the SDK
        // stream won't close on its own because the input queue stays open.
        // Close the headless session to break the for-await loop and allow
        // the finally block to clean up.
        if (message.type === 'result' && message.subtype !== 'error_during_execution') {
          headlessSession.close();
          break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        session.events.emit('interrupt');
        return;
      }
      if (!resumeErrorDetected) {
        session.events.emit('error', error);
      }
    } finally {
      if (session.status !== 'suspended' && session.status !== 'terminated') {
        this.transitionStatus(session, 'terminated');
      }
      if (!session.endedAt) {
        session.endedAt = createTimestamp();
      }
      session.events.emit('exit', resumeErrorDetected ? 1 : 0, null);
      if (session.status === 'terminated') {
        this.scheduleTerminatedSessionCleanup(session.id);
      }
    }
  }

  /**
   * Convert a provider AgentMessage to a SpawnedSessionEvent.
   */
  private convertAgentMessageToEvent(message: AgentMessage): SpawnedSessionEvent | null {
    const receivedAt = createTimestamp();
    // Build a raw event from the AgentMessage
    const raw: StreamJsonEvent = {
      type: message.type,
      subtype: message.subtype,
      session_id: message.sessionId,
      message: message.content,
      ...(message.tool ? {
        tool: message.tool.name,
        tool_use_id: message.tool.id,
        tool_input: message.tool.input,
      } : {}),
    };

    return {
      type: message.type,
      subtype: message.subtype,
      receivedAt,
      raw,
      message: message.content,
      tool: message.tool,
    };
  }

  private async spawnInteractive(
    session: InternalSession,
    options?: SpawnOptions
  ): Promise<void> {
    const interactiveProvider = options?.provider?.interactive ?? this.provider.interactive;

    try {
      const interactiveSession = await interactiveProvider.spawn({
        workingDirectory: session.workingDirectory,
        initialPrompt: options?.initialPrompt,
        resumeSessionId: options?.resumeSessionId,
        environmentVariables: {
          ...this.defaultConfig.environmentVariables,
          ...options?.environmentVariables,
        },
        stoneforgeRoot: options?.stoneforgeRoot ?? this.defaultConfig.stoneforgeRoot,
        cols: options?.cols,
        rows: options?.rows,
        model: options?.model,
      });

      session.interactiveSession = interactiveSession;
      session.cols = options?.cols ?? 80;
      session.rows = options?.rows ?? 24;
      (session as { pid?: number }).pid = interactiveSession.pid;

      // Set providerSessionId immediately if the provider knows it upfront
      // (e.g., Claude provider generates a UUID before spawning)
      const knownSessionId = interactiveSession.getSessionId();
      if (knownSessionId) {
        (session as { providerSessionId?: string }).providerSessionId = knownSessionId;
      }

      // Handle data output
      interactiveSession.onData((data: string) => {
        session.lastActivityAt = createTimestamp();
        session.events.emit('pty-data', data);

        // Check for provider session ID in output
        if (!session.providerSessionId) {
          const detectedId = interactiveSession.getSessionId();
          if (detectedId) {
            (session as { providerSessionId?: string }).providerSessionId = detectedId;
            session.events.emit('provider-session-id', detectedId);
          }
        }
      });

      // Handle exit
      interactiveSession.onExit((code: number, signal?: number) => {
        if (session.status !== 'suspended' && session.status !== 'terminated') {
          this.transitionStatus(session, 'terminated');
        }
        if (!session.endedAt) {
          session.endedAt = createTimestamp();
        }
        session.events.emit('exit', code, signal);
        if (session.status === 'terminated') {
          this.scheduleTerminatedSessionCleanup(session.id);
        }
      });

      // Transition to running state
      this.transitionStatus(session, 'running');
      session.startedAt = createTimestamp();
    } catch (error) {
      if (session.status !== 'terminated') {
        this.transitionStatus(session, 'terminated');
      }
      if (!session.endedAt) {
        session.endedAt = createTimestamp();
      }
      throw error;
    }
  }

  private async waitForInit(session: InternalSession, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        session.events.off('event', onEvent);
        session.events.off('resume_failed', onResumeFailed);
        session.events.off('exit', onExit);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Timeout waiting for agent init (${timeout}ms)`));
      }, timeout);

      const onEvent = (event: SpawnedSessionEvent) => {
        if (event.type === 'system' && event.subtype === 'init') {
          if (settled) return;
          settled = true;
          cleanup();

          // Extract provider session ID from init event
          if (event.raw.session_id) {
            (session as { providerSessionId?: string }).providerSessionId = event.raw.session_id;
            session.events.emit('provider-session-id', event.raw.session_id);
          }

          this.transitionStatus(session, 'running');
          session.startedAt = createTimestamp();
          resolve();
        }
      };

      const onResumeFailed = (info: { reason: string; message: string }) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Session resume failed: ${info.message}`));
      };

      const onExit = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Session exited before init'));
      };

      session.events.on('event', onEvent);
      session.events.on('resume_failed', onResumeFailed);
      session.events.on('exit', onExit);
    });
  }

  // ----------------------------------------
  // Private Helpers - Output Parsing (legacy)
  // ----------------------------------------

  private handleHeadlessOutput(session: InternalSession, data: Buffer): void {
    const text = data.toString();
    session.jsonBuffer += text;
    session.lastActivityAt = createTimestamp();

    const lines = session.jsonBuffer.split('\n');
    session.jsonBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        this.parseAndEmitEvent(session, line);
      }
    }
  }

  private parseAndEmitEvent(session: InternalSession, line: string): void {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const rawEvent = parsed as StreamJsonEvent;

      const parsedMessage = parsed.message as Record<string, unknown> | undefined;

      let message: string | undefined;
      let toolFromContent: { name?: string; id?: string; input?: unknown } | undefined;
      let effectiveType = rawEvent.type as StreamJsonEventType;
      const rawContent = parsedMessage?.content ?? parsed.message ?? parsed.content ?? parsed.result;

      if (typeof rawContent === 'string') {
        message = rawContent;
      } else if (Array.isArray(rawContent)) {
        const textBlocks: string[] = [];
        for (const item of rawContent) {
          if (typeof item === 'object' && item !== null && 'type' in item) {
            const block = item as { type: string; text?: string; name?: string; id?: string; input?: unknown; tool_use_id?: string; content?: string };
            if (block.type === 'text' && typeof block.text === 'string') {
              textBlocks.push(block.text);
            } else if (block.type === 'tool_use' && block.name) {
              toolFromContent = {
                name: block.name,
                id: block.id,
                input: block.input,
              };
              effectiveType = 'tool_use';
            } else if (block.type === 'tool_result') {
              toolFromContent = {
                id: block.tool_use_id,
              };
              message = typeof block.content === 'string' ? block.content : undefined;
              effectiveType = 'tool_result';
            }
          }
        }
        if (textBlocks.length > 0 && !message) {
          message = textBlocks.join('\n');
        }
      } else if (typeof rawContent === 'object' && rawContent !== null) {
        const contentObj = rawContent as Record<string, unknown>;
        if ('content' in contentObj && typeof contentObj.content === 'string') {
          message = contentObj.content;
        } else if ('text' in contentObj && typeof contentObj.text === 'string') {
          message = contentObj.text;
        }
      }

      const tool = rawEvent.tool
        ? {
            name: rawEvent.tool,
            id: rawEvent.tool_use_id,
            input: rawEvent.tool_input,
          }
        : toolFromContent;

      const event: SpawnedSessionEvent = {
        type: effectiveType,
        subtype: rawEvent.subtype,
        receivedAt: createTimestamp(),
        raw: rawEvent,
        message,
        tool,
      };

      session.events.emit('event', event);
    } catch (error) {
      session.events.emit('raw', line);
    }
  }

  // ----------------------------------------
  // Private Helpers - State Management
  // ----------------------------------------

  private generateSessionId(): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).slice(2, 6);
    return `session-${timestamp}-${counter}-${random}`;
  }

  private determineSpawnMode(agentRole: AgentRole, requestedMode?: SpawnMode): SpawnMode {
    if (requestedMode) {
      return requestedMode;
    }

    switch (agentRole) {
      case 'director':
        return 'interactive';
      case 'worker':
        return 'headless';
      case 'steward':
        return 'headless';
      default:
        return 'headless';
    }
  }

  private getWorkerMode(
    agentRole: AgentRole,
    requestedMode?: SpawnMode
  ): WorkerMode | undefined {
    if (agentRole !== 'worker') {
      return undefined;
    }
    const mode = requestedMode ?? this.determineSpawnMode(agentRole);
    return mode === 'interactive' ? 'persistent' : 'ephemeral';
  }

  private scheduleTerminatedSessionCleanup(sessionId: string): void {
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session && session.status === 'terminated') {
        this.sessions.delete(sessionId);
      }
    }, 5000);
  }

  private transitionStatus(session: InternalSession, newStatus: SessionStatus): void {
    const allowedTransitions = SessionStatusTransitions[session.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${session.status} -> ${newStatus}`
      );
    }
    session.status = newStatus;
  }

  private filterAndMapSessions(
    sessions: InternalSession[],
    agentId?: EntityId
  ): SpawnedSession[] {
    const filtered = agentId
      ? sessions.filter((s) => s.agentId === agentId)
      : sessions;
    return filtered.map((s) => this.toPublicSession(s));
  }

  private toPublicSession(session: InternalSession): SpawnedSession {
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
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a SpawnerService instance
 */
export function createSpawnerService(config?: SpawnConfig): SpawnerService {
  return new SpawnerServiceImpl(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a status allows the session to receive input
 */
export function canReceiveInput(status: SessionStatus): boolean {
  return status === 'running';
}

/**
 * Checks if a status is a terminal state
 */
export function isTerminalStatus(status: SessionStatus): boolean {
  return status === 'terminated';
}

/**
 * Gets human-readable description of a session status
 */
export function getStatusDescription(status: SessionStatus): string {
  switch (status) {
    case 'starting':
      return 'Starting up';
    case 'running':
      return 'Running';
    case 'suspended':
      return 'Suspended (can be resumed)';
    case 'terminating':
      return 'Shutting down';
    case 'terminated':
      return 'Terminated';
    default:
      return 'Unknown';
  }
}
