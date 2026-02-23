/**
 * Dispatch Daemon Service
 *
 * This daemon runs continuous polling loops to coordinate task assignment
 * and message delivery across all agents in the orchestration system.
 *
 * Key features:
 * - Worker availability polling: Assigns unassigned tasks to available workers
 * - Inbox polling: Delivers messages and spawns agents when needed
 * - Steward trigger polling: Activates stewards based on scheduled triggers
 * - Workflow task polling: Assigns workflow tasks to available stewards
 *
 * The daemon implements the dispatch behavior defined in ORCHESTRATION_PLAN.md:
 * - Workers are spawned INSIDE their worktree directory
 * - Handoff branches are reused when present in task metadata
 * - Inbox polling: Routes messages by role (triage for ephemeral, forward for persistent)
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type {
  EntityId,
  ElementId,
  Task,
  Message,
  InboxItem,
  Document,
  Plan,
} from '@stoneforge/core';
import { InboxStatus, createTimestamp, TaskStatus, asEntityId, asElementId, PlanStatus, canAutoComplete } from '@stoneforge/core';
import type { QuarryAPI, InboxService } from '@stoneforge/quarry';
import { loadTriagePrompt, loadRolePrompt, renderPromptTemplate } from '../prompts/index.js';
import { detectTargetBranch } from '../git/merge.js';
import { createLogger } from '../utils/logger.js';

import type { AgentRegistry, AgentEntity } from './agent-registry.js';
import { getAgentMetadata } from './agent-registry.js';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';
import type { DispatchService, DispatchOptions } from './dispatch-service.js';
import type { WorktreeManager, CreateWorktreeResult } from '../git/worktree-manager.js';
import type { SyncResult } from '../cli/commands/task.js';
import type { TaskAssignmentService } from './task-assignment-service.js';
import type { StewardScheduler } from './steward-scheduler.js';
import type { AgentPoolService } from './agent-pool-service.js';
import type { SettingsService } from './settings-service.js';
import type { RateLimitTracker } from './rate-limit-tracker.js';
import { createRateLimitTracker } from './rate-limit-tracker.js';
import type { WorkerMetadata, StewardMetadata, StewardFocus } from '../types/agent.js';
import type { PoolSpawnRequest } from '../types/agent-pool.js';
import {
  getOrchestratorTaskMeta,
  updateOrchestratorTaskMeta,
  appendTaskSessionHistory,
  type TaskSessionHistoryEntry,
} from '../types/task-meta.js';

const logger = createLogger('dispatch-daemon');

// ============================================================================
// Constants
// ============================================================================

/**
 * Default poll interval in milliseconds for dispatch daemon (5 seconds)
 */
export const DISPATCH_DAEMON_DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Minimum poll interval in milliseconds for dispatch daemon (1 second)
 */
export const DISPATCH_DAEMON_MIN_POLL_INTERVAL_MS = 1000;

/**
 * Maximum poll interval in milliseconds for dispatch daemon (1 minute)
 */
export const DISPATCH_DAEMON_MAX_POLL_INTERVAL_MS = 60000;

// ============================================================================
// Types
// ============================================================================

/**
 * Callback fired when a session is started by the dispatch daemon.
 * This allows the server to attach event listeners and save the initial prompt.
 */
export type OnSessionStartedCallback = (
  session: SessionRecord,
  events: import('events').EventEmitter,
  agentId: EntityId,
  initialPrompt: string
) => void;

/**
 * Configuration for the Dispatch Daemon
 */
export interface DispatchDaemonConfig {
  /**
   * Poll interval in milliseconds.
   * Default: 5000 (5 seconds)
   */
  readonly pollIntervalMs?: number;

  /**
   * Whether worker availability polling is enabled.
   * Default: true
   */
  readonly workerAvailabilityPollEnabled?: boolean;

  /**
   * Whether inbox polling is enabled.
   * Default: true
   */
  readonly inboxPollEnabled?: boolean;

  /**
   * Whether steward trigger polling is enabled.
   * Default: true
   */
  readonly stewardTriggerPollEnabled?: boolean;

  /**
   * Whether workflow task polling is enabled.
   * Default: true
   */
  readonly workflowTaskPollEnabled?: boolean;

  /**
   * Whether orphan recovery polling is enabled.
   * Detects workers with assigned tasks but no active session after a restart
   * and re-spawns sessions to continue the work.
   * Default: true
   */
  readonly orphanRecoveryEnabled?: boolean;

  /**
   * Whether plan auto-completion polling is enabled.
   * Detects active plans where all tasks are closed and marks them as completed.
   * Default: true
   */
  readonly planAutoCompleteEnabled?: boolean;

  /**
   * Whether closed-but-unmerged task reconciliation is enabled.
   * Detects tasks with status=CLOSED but mergeStatus not 'merged'
   * and moves them back to REVIEW so merge stewards can pick them up.
   * Default: true
   */
  readonly closedUnmergedReconciliationEnabled?: boolean;

  /**
   * Grace period in ms before a closed-but-unmerged task is reconciled.
   * Prevents racing with in-progress close+merge sequences.
   * Default: 120000 (2 minutes)
   */
  readonly closedUnmergedGracePeriodMs?: number;

  /**
   * Whether stuck-merge recovery is enabled.
   * Detects tasks stuck in 'merging' or 'testing' mergeStatus for too long
   * and resets them to 'pending' for a fresh retry.
   * Default: true
   */
  readonly stuckMergeRecoveryEnabled?: boolean;

  /**
   * Grace period in ms before a stuck merge task is recovered.
   * Prevents racing with in-progress merge operations.
   * Default: 600000 (10 minutes)
   */
  readonly stuckMergeRecoveryGracePeriodMs?: number;

  /**
   * Maximum number of consecutive resume attempts for the same task
   * before the daemon stops resuming the worker and spawns a recovery
   * steward instead. Set to 0 to disable recovery steward spawning.
   * Default: 3
   */
  readonly maxResumeAttemptsBeforeRecovery?: number;

  /**
   * Maximum session duration in ms before the daemon terminates it.
   * Prevents stuck workers from blocking their slot indefinitely.
   * Default: 0 (disabled).
   */
  readonly maxSessionDurationMs?: number;

  /**
   * Maximum session duration in ms for steward sessions specifically.
   * Steward sessions are expected to be short-lived; this provides
   * a safety net for sessions that fail to self-terminate.
   * Default: 1800000 (30 minutes).
   */
  readonly maxStewardSessionDurationMs?: number;

  /**
   * Callback fired when a session is started by the daemon.
   * Allows the server to attach event savers and save the initial prompt.
   */
  readonly onSessionStarted?: OnSessionStartedCallback;

  /**
   * Project root directory for loading prompt overrides.
   * Default: process.cwd()
   */
  readonly projectRoot?: string;

  /**
   * Whether to auto-forward inbox messages to the director's interactive session.
   * When enabled, messages are injected into the director's PTY as user input
   * (same mechanism as persistent workers via processPersistentAgentMessage).
   * Default: true
   */
  readonly directorInboxForwardingEnabled?: boolean;

  /**
   * Minimum idle time (ms) since last user input before forwarding messages
   * to the director's session. Prevents interrupting the user mid-thought.
   * Default: 120000 (2 minutes)
   */
  readonly directorInboxIdleThresholdMs?: number;
}

/**
 * Result of a poll operation
 */
export interface PollResult {
  /** The poll type */
  readonly pollType: 'worker-availability' | 'inbox' | 'steward-trigger' | 'workflow-task' | 'orphan-recovery' | 'closed-unmerged-reconciliation' | 'stuck-merge-recovery' | 'plan-auto-complete';
  /** Timestamp when the poll started */
  readonly startedAt: string;
  /** Duration of the poll in milliseconds */
  readonly durationMs: number;
  /** Number of items processed */
  readonly processed: number;
  /** Number of errors encountered */
  readonly errors: number;
  /** Error messages if any */
  readonly errorMessages?: string[];
}

/**
 * Internal normalized configuration
 */
interface NormalizedConfig {
  pollIntervalMs: number;
  workerAvailabilityPollEnabled: boolean;
  inboxPollEnabled: boolean;
  stewardTriggerPollEnabled: boolean;
  workflowTaskPollEnabled: boolean;
  orphanRecoveryEnabled: boolean;
  planAutoCompleteEnabled: boolean;
  closedUnmergedReconciliationEnabled: boolean;
  closedUnmergedGracePeriodMs: number;
  stuckMergeRecoveryEnabled: boolean;
  stuckMergeRecoveryGracePeriodMs: number;
  maxResumeAttemptsBeforeRecovery: number;
  maxSessionDurationMs: number;
  maxStewardSessionDurationMs: number;
  onSessionStarted?: OnSessionStartedCallback;
  projectRoot: string;
  directorInboxForwardingEnabled: boolean;
  directorInboxIdleThresholdMs: number;
}

// ============================================================================
// Dispatch Daemon Interface
// ============================================================================

/**
 * Dispatch Daemon interface for coordinating task assignment and message delivery.
 *
 * The daemon provides methods for:
 * - Starting and stopping the polling loops
 * - Manual trigger of individual poll operations
 * - Configuration management
 */
export interface DispatchDaemon {
  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  /**
   * Starts the dispatch daemon with all enabled polling loops.
   * Reconciles stale sessions on startup before beginning polls.
   */
  start(): Promise<void>;

  /**
   * Stops the dispatch daemon and all polling loops.
   * Waits for any in-flight poll cycle to complete before returning.
   */
  stop(): Promise<void>;

  /**
   * Whether the daemon is currently running.
   */
  isRunning(): boolean;

  // ----------------------------------------
  // Manual Poll Triggers
  // ----------------------------------------

  /**
   * Manually triggers worker availability polling.
   * Finds available ephemeral workers and assigns unassigned tasks.
   */
  pollWorkerAvailability(): Promise<PollResult>;

  /**
   * Manually triggers inbox polling.
   * Processes unread messages for all agents.
   */
  pollInboxes(): Promise<PollResult>;

  /**
   * Manually triggers steward trigger polling.
   * Checks for scheduled steward activations.
   */
  pollStewardTriggers(): Promise<PollResult>;

  /**
   * Manually triggers workflow task polling.
   * Assigns workflow tasks to available stewards.
   */
  pollWorkflowTasks(): Promise<PollResult>;

  /**
   * Manually triggers orphan recovery polling.
   * Detects workers with assigned tasks but no active session
   * and re-spawns sessions to continue the work.
   */
  recoverOrphanedAssignments(): Promise<PollResult>;

  /**
   * Manually triggers closed-but-unmerged task reconciliation.
   * Detects tasks with status=CLOSED but mergeStatus not 'merged'
   * and moves them back to REVIEW so merge stewards can pick them up.
   */
  reconcileClosedUnmergedTasks(): Promise<PollResult>;

  /**
   * Manually triggers stuck-merge recovery.
   * Detects tasks stuck in 'merging' or 'testing' mergeStatus for too long
   * and resets them to 'pending' for a fresh retry.
   */
  recoverStuckMergeTasks(): Promise<PollResult>;

  /**
   * Manually triggers plan auto-completion polling.
   * Detects active plans where all non-tombstone tasks are closed
   * and marks them as completed.
   */
  pollPlanAutoComplete(): Promise<PollResult>;

  // ----------------------------------------
  // Rate Limiting
  // ----------------------------------------

  /**
   * Notify the daemon that a rate limit was detected for an executable.
   * Called externally (e.g., from event listeners on session events).
   */
  handleRateLimitDetected(executable: string, resetsAt: Date): void;

  /**
   * Returns the current rate limit status for the daemon.
   */
  getRateLimitStatus(): {
    isPaused: boolean;
    limits: Array<{ executable: string; resetsAt: string }>;
    soonestReset?: string;
  };

  /**
   * Manually put the daemon to sleep until the specified time.
   * Marks all executables in the fallback chain as rate-limited until the given time.
   * This reuses the existing rate limit tracker and pause logic.
   */
  sleepUntil(resetTime: Date): void;

  /**
   * Immediately wake the daemon from a sleep/rate-limit pause.
   * Clears all rate limit tracker entries and the sleep timer.
   * The next poll cycle will resume normal dispatch.
   */
  wake(): void;

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  /**
   * Gets the current configuration.
   */
  getConfig(): Omit<Required<DispatchDaemonConfig>, 'onSessionStarted'> & { onSessionStarted?: OnSessionStartedCallback };

  /**
   * Updates the configuration.
   * Takes effect on the next poll cycle.
   */
  updateConfig(config: Partial<DispatchDaemonConfig>): void;

  // ----------------------------------------
  // Events
  // ----------------------------------------

  /**
   * Subscribe to daemon events.
   */
  on(event: 'poll:start', listener: (pollType: string) => void): void;
  on(event: 'poll:complete', listener: (result: PollResult) => void): void;
  on(event: 'poll:error', listener: (pollType: string, error: Error) => void): void;
  on(event: 'task:dispatched', listener: (taskId: ElementId, agentId: EntityId) => void): void;
  on(event: 'message:forwarded', listener: (messageId: string, agentId: EntityId) => void): void;
  on(event: 'agent:spawned', listener: (agentId: EntityId, worktree?: string) => void): void;
  on(event: 'daemon:notification', listener: (data: { type: 'info' | 'warning' | 'error'; title: string; message?: string }) => void): void;

  /**
   * Unsubscribe from daemon events.
   */
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// ============================================================================
// Dispatch Daemon Implementation
// ============================================================================

/**
 * Implementation of the Dispatch Daemon.
 */
export class DispatchDaemonImpl implements DispatchDaemon {
  private readonly api: QuarryAPI;
  private readonly agentRegistry: AgentRegistry;
  private readonly sessionManager: SessionManager;
  private readonly dispatchService: DispatchService;
  private readonly worktreeManager: WorktreeManager;
  private readonly taskAssignment: TaskAssignmentService;
  private readonly stewardScheduler: StewardScheduler;
  private readonly inboxService: InboxService;
  private readonly poolService: AgentPoolService | undefined;
  private readonly settingsService: SettingsService | undefined;
  private readonly rateLimitTracker: RateLimitTracker;
  private readonly emitter: EventEmitter;

  private config: NormalizedConfig;
  private running = false;
  private polling = false;
  private pollIntervalHandle?: NodeJS.Timeout;
  private currentPollCycle?: Promise<void>;
  private rateLimitSleepTimer?: NodeJS.Timeout;

  /**
   * Tracks inbox item IDs that are currently being forwarded to persistent agents.
   * Prevents duplicate message delivery when concurrent pollInboxes() calls
   * race to forward the same unread message before markAsRead() completes.
   *
   * Key: inbox item ID
   * Value: true (item is in-flight, being processed)
   *
   * Items are added before forwarding and removed after markAsRead() completes.
   */
  private readonly forwardingInboxItems = new Set<string>();

  /**
   * When true, the startup background orphan recovery is still in flight.
   * runPollCycle skips its own orphan recovery to avoid duplicate work and
   * to prevent the initial poll cycle from blocking on stale session resumes.
   */
  private startupRecoveryInFlight = false;

  /**
   * Cached result of target branch detection.
   * Lazily resolved on first use and reused for subsequent prompt renders.
   */
  private cachedTargetBranch: string | undefined;

  constructor(
    api: QuarryAPI,
    agentRegistry: AgentRegistry,
    sessionManager: SessionManager,
    dispatchService: DispatchService,
    worktreeManager: WorktreeManager,
    taskAssignment: TaskAssignmentService,
    stewardScheduler: StewardScheduler,
    inboxService: InboxService,
    config?: DispatchDaemonConfig,
    poolService?: AgentPoolService,
    settingsService?: SettingsService
  ) {
    this.api = api;
    this.agentRegistry = agentRegistry;
    this.sessionManager = sessionManager;
    this.dispatchService = dispatchService;
    this.worktreeManager = worktreeManager;
    this.taskAssignment = taskAssignment;
    this.stewardScheduler = stewardScheduler;
    this.inboxService = inboxService;
    this.poolService = poolService;
    this.settingsService = settingsService;
    this.rateLimitTracker = createRateLimitTracker(settingsService);
    this.emitter = new EventEmitter();
    this.config = this.normalizeConfig(config);
  }

  // ----------------------------------------
  // Prompt Template Helpers
  // ----------------------------------------

  /**
   * Gets the target branch name, caching it after first detection.
   * Uses the centralized detectTargetBranch() function.
   */
  private async getTargetBranch(): Promise<string> {
    if (!this.cachedTargetBranch) {
      this.cachedTargetBranch = await detectTargetBranch(this.config.projectRoot);
    }
    return this.cachedTargetBranch;
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    // Reconcile stale sessions on startup (M-7)
    try {
      const result = await this.sessionManager.reconcileOnStartup();
      if (result.reconciled > 0) {
        logger.info(`Reconciled ${result.reconciled} stale session(s)`);
      }
      if (result.errors.length > 0) {
        logger.warn('Reconciliation errors:', result.errors);
      }
    } catch (error) {
      logger.error('Failed to reconcile on startup:', error);
    }

    // Option A (non-blocking startup recovery): Orphan recovery may block for a
    // long time if it encounters stale session IDs from before a server restart.
    // The resumeSession → spawn → waitForInit path will wait for the full timeout
    // duration on dead sessions. By running orphan recovery in the background and
    // starting the poll loop first, we ensure tasks are dispatched within the first
    // poll interval regardless of how long recovery takes.
    //
    // While startup recovery is in flight, runPollCycle skips its own orphan
    // recovery call to avoid duplicate work. Once the background recovery finishes,
    // the flag is cleared and subsequent poll cycles handle orphan recovery normally.

    // Run orphan recovery in the background — don't block the poll loop
    if (this.config.orphanRecoveryEnabled) {
      this.startupRecoveryInFlight = true;
      this.recoverOrphanedAssignments().then((result) => {
        if (result.processed > 0) {
          logger.info(`Startup: recovered ${result.processed} orphaned task assignment(s)`);
        }
      }).catch((error) => {
        logger.error('Failed to recover orphaned assignments on startup:', error);
      }).finally(() => {
        this.startupRecoveryInFlight = false;
      });
    }

    // Start the main poll loop
    this.pollIntervalHandle = this.createPollInterval();

    // Run an initial poll cycle immediately
    this.currentPollCycle = this.runPollCycle().catch((error) => {
      logger.error('Initial poll cycle error:', error);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.pollIntervalHandle) {
      clearInterval(this.pollIntervalHandle);
      this.pollIntervalHandle = undefined;
    }

    if (this.rateLimitSleepTimer) {
      clearTimeout(this.rateLimitSleepTimer);
      this.rateLimitSleepTimer = undefined;
    }

    // Wait for in-flight poll cycle to complete (M-8)
    if (this.currentPollCycle) {
      try {
        await Promise.race([
          this.currentPollCycle,
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Shutdown timeout')), 30_000)
          ),
        ]);
      } catch { /* timeout or error — proceed with shutdown */ }
      this.currentPollCycle = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ----------------------------------------
  // Rate Limiting
  // ----------------------------------------

  handleRateLimitDetected(executable: string, resetsAt: Date): void {
    this.rateLimitTracker.markLimited(executable, resetsAt);
    logger.info(
      `Rate limit detected for executable '${executable}', resets at ${resetsAt.toISOString()}`
    );
  }

  getRateLimitStatus(): {
    isPaused: boolean;
    limits: Array<{ executable: string; resetsAt: string }>;
    soonestReset?: string;
  } {
    const fallbackChain = this.settingsService?.getAgentDefaults().fallbackChain ?? [];
    const isPaused = fallbackChain.length > 0
      ? this.rateLimitTracker.isAllLimited(fallbackChain)
      : this.rateLimitTracker.isLimited('claude');
    const allLimits = this.rateLimitTracker.getAllLimits();
    const soonestReset = this.rateLimitTracker.getSoonestResetTime();

    return {
      isPaused,
      limits: allLimits.map((entry) => ({
        executable: entry.executable,
        resetsAt: entry.resetsAt.toISOString(),
      })),
      soonestReset: soonestReset?.toISOString(),
    };
  }

  sleepUntil(resetTime: Date): void {
    const fallbackChain = this.settingsService?.getAgentDefaults().fallbackChain ?? [];
    if (fallbackChain.length === 0) {
      logger.warn('sleepUntil: No fallback chain configured — nothing to mark as limited');
      return;
    }

    // Mark all executables in the fallback chain as rate-limited until the given time
    for (const executable of fallbackChain) {
      this.rateLimitTracker.markLimited(executable, resetTime);
    }

    // Clear any existing sleep timer and set a new one
    if (this.rateLimitSleepTimer) {
      clearTimeout(this.rateLimitSleepTimer);
    }
    const sleepMs = Math.max(0, resetTime.getTime() - Date.now());
    logger.info(
      `Manual sleep: pausing dispatch for ${Math.round(sleepMs / 1000)}s (until ${resetTime.toISOString()})`
    );
    this.rateLimitSleepTimer = setTimeout(() => {
      this.rateLimitSleepTimer = undefined;
    }, sleepMs);
  }

  wake(): void {
    // Clear all rate limit entries
    this.rateLimitTracker.clear();

    // Clear the sleep timer
    if (this.rateLimitSleepTimer) {
      clearTimeout(this.rateLimitSleepTimer);
      this.rateLimitSleepTimer = undefined;
    }

    logger.info('Manual wake: cleared all rate limits, dispatch will resume on next poll cycle');
  }

  // ----------------------------------------
  // Manual Poll Triggers
  // ----------------------------------------

  async pollWorkerAvailability(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'worker-availability');

    try {
      // 1. Get all ephemeral workers
      const workers = await this.agentRegistry.listAgents({
        role: 'worker',
        workerMode: 'ephemeral',
      });

      // 2. Find workers with no active session and no unread non-dispatch messages.
      // pollInboxes() runs first in each cycle, marking dispatch messages as read.
      // Any remaining unread items are non-dispatch messages needing triage —
      // defer task assignment so the next cycle's triage pass can handle them.
      const availableWorkers: AgentEntity[] = [];
      for (const worker of workers) {
        const session = this.sessionManager.getActiveSession(asEntityId(worker.id));
        if (session) continue;

        const unreadItems = this.inboxService.getInbox(asEntityId(worker.id), {
          status: InboxStatus.UNREAD,
          limit: 1,
        });
        if (unreadItems.length > 0) continue;

        // Defense in depth: Check if worker already has an assigned task
        // (protects against race conditions where session terminated but assignment wasn't cleared)
        const workerTasks = await this.taskAssignment.getAgentTasks(asEntityId(worker.id), {
          taskStatus: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW],
        });
        if (workerTasks.length > 0) {
          logger.debug(`Worker ${worker.name} already has ${workerTasks.length} assigned task(s), skipping`);
          continue;
        }

        availableWorkers.push(worker);
      }

      // 3. For each available worker, try to assign a task
      for (const worker of availableWorkers) {
        try {
          const assigned = await this.assignTaskToWorker(worker);
          if (assigned) {
            processed++;
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Worker ${worker.name}: ${errorMessage}`);
          logger.error(`Error assigning task to worker ${worker.name}:`, error);
        }
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in pollWorkerAvailability:', error);
    }

    const result: PollResult = {
      pollType: 'worker-availability',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async pollInboxes(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'inbox');

    // Accumulate deferred items per agent for triage processing
    const deferredItems = new Map<string, { agent: AgentEntity; items: InboxItem[] }>();

    try {
      // Get all agents
      const agents = await this.agentRegistry.listAgents();

      for (const agent of agents) {
        try {
          const agentId = asEntityId(agent.id);
          const meta = getAgentMetadata(agent);
          if (!meta) continue;

          // Get unread messages for this agent
          const inboxItems = this.inboxService.getInbox(agentId, {
            status: InboxStatus.UNREAD,
            limit: 50, // Process up to 50 messages per agent per cycle
          });

          for (const item of inboxItems) {
            try {
              const messageProcessed = await this.processInboxItem(agent, item, meta);
              if (messageProcessed) {
                processed++;
              } else {
                // Item was not processed (deferred for triage)
                // Only ephemeral workers and stewards get triage sessions.
                // Persistent agents (directors, persistent workers) leave messages
                // unread until their session starts — spawning a headless triage
                // session for them would confuse the UI and mark messages as read
                // before the agent can actually process them.
                const isPersistentAgent = meta.agentRole === 'director' ||
                  (meta.agentRole === 'worker' && (meta as WorkerMetadata).workerMode === 'persistent');

                if (!isPersistentAgent) {
                  const activeSession = this.sessionManager.getActiveSession(agentId);
                  if (!activeSession) {
                    if (!deferredItems.has(agentId)) {
                      deferredItems.set(agentId, { agent, items: [] });
                    }
                    deferredItems.get(agentId)!.items.push(item);
                  }
                }
              }
            } catch (error) {
              errors++;
              const errorMessage = error instanceof Error ? error.message : String(error);
              errorMessages.push(`Message ${item.messageId}: ${errorMessage}`);
            }
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Agent ${agent.name}: ${errorMessage}`);
        }
      }

      // Process triage batches for idle agents with deferred messages
      if (deferredItems.size > 0) {
        const triageResult = await this.processTriageBatch(deferredItems);
        processed += triageResult;
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in pollInboxes:', error);
    }

    const result: PollResult = {
      pollType: 'inbox',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async pollStewardTriggers(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'steward-trigger');

    try {
      // The StewardScheduler handles trigger evaluation internally
      // We just need to check if any stewards need to be triggered
      // This is mainly handled by the scheduler's own polling, but
      // we can use this to ensure the scheduler is running

      if (!this.stewardScheduler.isRunning()) {
        // Start the scheduler if it's not running
        await this.stewardScheduler.start();
        const registered = await this.stewardScheduler.registerAllStewards();
        logger.info(`Steward scheduler started, registered ${registered} steward(s)`);
        processed++;
      }

      // Get stats to report on activity
      const stats = this.stewardScheduler.getStats();
      processed += stats.runningExecutions;
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in pollStewardTriggers:', error);
    }

    const result: PollResult = {
      pollType: 'steward-trigger',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async pollWorkflowTasks(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'workflow-task');

    try {
      const stewards = await this.agentRegistry.getStewards();

      // Find available stewards (no active session)
      const availableStewards: AgentEntity[] = [];
      for (const steward of stewards) {
        const session = this.sessionManager.getActiveSession(asEntityId(steward.id));
        if (!session) {
          availableStewards.push(steward);
        }
      }

      // Separate merge stewards from other stewards
      const mergeStewards = availableStewards.filter((s) => {
        const meta = getAgentMetadata(s) as StewardMetadata | undefined;
        return meta?.stewardFocus === 'merge';
      });

      const otherStewards = availableStewards.filter((s) => {
        const meta = getAgentMetadata(s) as StewardMetadata | undefined;
        return meta?.stewardFocus !== 'merge';
      });

      // 1. Handle REVIEW tasks - spawn merge stewards with full context
      // Find tasks in REVIEW status that need merge processing
      const reviewTasks = await this.taskAssignment.listAssignments({
        taskStatus: [TaskStatus.REVIEW],
        mergeStatus: ['pending'],
      });

      // Filter to tasks not already claimed by a steward.
      // We check task.assignee rather than orchestratorMeta.assignedAgent because
      // assignedAgent retains the original worker's ID after completeTask() clears
      // the top-level assignee. A steward claim sets task.assignee to the steward ID
      // (in spawnMergeStewardForTask), so an unset assignee means no steward has it.
      const unclaimedReviewTasks = reviewTasks.filter((ta) => !ta.task.assignee);

      const sortedReviewTasks = [...unclaimedReviewTasks].sort(
        (a, b) => (a.task.priority ?? 0) - (b.task.priority ?? 0)
      );

      for (const steward of mergeStewards) {
        if (sortedReviewTasks.length === 0) break;

        const taskAssignment = sortedReviewTasks.shift();
        if (!taskAssignment) continue;

        try {
          // Spawn merge steward with full context prompt
          await this.spawnMergeStewardForTask(steward, taskAssignment.task);
          processed++;
          this.emitter.emit('task:dispatched', taskAssignment.taskId, asEntityId(steward.id));
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Merge steward ${steward.name}: ${errorMessage}`);
        }
      }

      // 2. Handle other workflow tasks (tag-based matching for non-merge stewards)
      for (const steward of otherStewards) {
        try {
          const meta = getAgentMetadata(steward) as StewardMetadata | undefined;
          if (!meta) continue;

          // Look for unassigned tasks that match this steward's focus
          const focusTag = meta.stewardFocus;

          const unassignedTasks = await this.taskAssignment.getUnassignedTasks({
            taskStatus: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
          });

          // Filter tasks that match this steward's focus
          const matchingTasks = unassignedTasks.filter((task) => {
            const tags = task.tags ?? [];
            return tags.includes(focusTag) ||
              tags.includes(`steward-${focusTag}`) ||
              tags.includes('workflow');
          });

          if (matchingTasks.length > 0) {
            // Assign the highest priority task to this steward
            const sortedTasks = [...matchingTasks].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
            const task = sortedTasks[0];
            const stewardId = asEntityId(steward.id);

            await this.dispatchService.dispatch(task.id, stewardId);
            processed++;

            this.emitter.emit('task:dispatched', task.id, stewardId);
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Steward ${steward.name}: ${errorMessage}`);
        }
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in pollWorkflowTasks:', error);
    }

    const result: PollResult = {
      pollType: 'workflow-task',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async recoverOrphanedAssignments(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'orphan-recovery');

    try {
      // 1. Get all ephemeral workers
      const workers = await this.agentRegistry.listAgents({
        role: 'worker',
        workerMode: 'ephemeral',
      });

      // Track recovery stewards assigned during this cycle to prevent cascade assignment.
      // When a steward session terminates immediately (e.g. rate-limited), getActiveSession
      // returns null and the steward appears available for the next task. This set ensures
      // each steward is only assigned once per recoverOrphanedAssignments call.
      const stewardsUsedThisCycle = new Set<string>();

      for (const worker of workers) {
        const workerId = asEntityId(worker.id);

        // 2. Skip if worker has an active session
        const session = this.sessionManager.getActiveSession(workerId);
        if (session) continue;

        // 3. Check if worker has assigned tasks (OPEN or IN_PROGRESS only, not REVIEW)
        const workerTasks = await this.taskAssignment.getAgentTasks(workerId, {
          taskStatus: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
        });
        if (workerTasks.length === 0) continue;

        // 3b. Skip recovery entirely when all executables are rate-limited.
        // Rate limits are transient — do NOT increment resumeCount, as that
        // would eventually trigger the recovery steward for a non-stuck task.
        const executableCheck = this.resolveExecutableWithFallback(worker);
        if (executableCheck === 'all_limited') {
          logger.debug(
            `All executables rate-limited, skipping orphan recovery for ${worker.name}`
          );
          continue; // Skip this worker entirely — do NOT increment resumeCount
        }

        // 4. Check if the task is stuck in a resume loop
        const taskAssignment = workerTasks[0];
        const resumeCount = taskAssignment.orchestratorMeta?.resumeCount ?? 0;
        const maxResumes = this.config.maxResumeAttemptsBeforeRecovery;

        if (maxResumes > 0 && resumeCount >= maxResumes) {
          // Task has been resumed too many times without status change —
          // spawn a recovery steward instead of resuming the worker again
          try {
            await this.spawnRecoveryStewardForTask(worker, taskAssignment.task, taskAssignment.orchestratorMeta, stewardsUsedThisCycle);
            processed++;
            logger.info(
              `[dispatch-daemon] Spawning recovery steward for stuck task ${taskAssignment.task.id} after ${resumeCount} resume attempts`
            );
          } catch (error) {
            errors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            errorMessages.push(`Recovery steward for ${worker.name}: ${errorMessage}`);
            logger.error(`Error spawning recovery steward for worker ${worker.name}:`, error);
          }
        } else {
          // Normal recovery: re-spawn the worker, then increment resume count on success
          try {
            await this.recoverOrphanedTask(worker, taskAssignment.task, taskAssignment.orchestratorMeta);
            // Only increment resumeCount after successful recovery — if recovery fails,
            // the count stays the same so the task isn't prematurely flagged as stuck.
            // Re-read task metadata since recoverOrphanedTask may have updated it (e.g., new sessionId).
            const freshTask = await this.api.get<Task>(taskAssignment.task.id);
            await this.api.update<Task>(taskAssignment.task.id, {
              metadata: updateOrchestratorTaskMeta(
                freshTask?.metadata as Record<string, unknown> | undefined,
                { resumeCount: resumeCount + 1 }
              ),
            });
            processed++;
          } catch (error) {
            errors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            errorMessages.push(`Worker ${worker.name}: ${errorMessage}`);
            logger.error(`Error recovering orphaned task for worker ${worker.name}:`, error);
          }
        }
      }

      // --- Phase 2: Recover orphaned merge steward assignments ---
      const mergeStewards = await this.agentRegistry.listAgents({
        role: 'steward',
        stewardFocus: 'merge',
      });

      for (const steward of mergeStewards) {
        const stewardId = asEntityId(steward.id);

        // Skip if steward has an active session
        const stewardSession = this.sessionManager.getActiveSession(stewardId);
        if (stewardSession) continue;

        // Find REVIEW tasks assigned to this steward that still need processing.
        // Only recover tasks with 'pending' or 'testing' mergeStatus - tasks with
        // 'test_failed', 'conflict', 'failed', or 'merged' have already been processed
        // and should NOT be re-spawned (prevents infinite retry loops on pre-existing failures).
        const stewardTasks = await this.taskAssignment.getAgentTasks(stewardId, {
          taskStatus: [TaskStatus.REVIEW],
          mergeStatus: ['pending', 'testing'],
        });
        if (stewardTasks.length === 0) continue;

        // Skip recovery when all executables are rate-limited (same guard as Phase 1).
        // Prevents stewardRecoveryCount from incrementing due to transient rate limits.
        const stewardExecCheck = this.resolveExecutableWithFallback(steward);
        if (stewardExecCheck === 'all_limited') {
          logger.debug(
            `All executables rate-limited, skipping steward orphan recovery for ${steward.name}`
          );
          continue;
        }

        const orphanedAssignment = stewardTasks[0];

        // Safety valve: cap steward recovery attempts to prevent infinite re-dispatch loops
        const stewardRecoveryCount = orphanedAssignment.orchestratorMeta?.stewardRecoveryCount ?? 0;
        if (stewardRecoveryCount >= 3) {
          logger.warn(
            `Steward recovery limit reached for task ${orphanedAssignment.task.id}, setting mergeStatus to 'failed'`
          );
          try {
            await this.api.update<Task>(orphanedAssignment.task.id, {
              assignee: undefined,
              metadata: updateOrchestratorTaskMeta(
                orphanedAssignment.task.metadata as Record<string, unknown> | undefined,
                {
                  mergeStatus: 'failed' as const,
                  mergeFailureReason: `Steward recovery limit reached after ${stewardRecoveryCount} attempts`,
                }
              ),
            });
            processed++;
          } catch (error) {
            errors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            errorMessages.push(`Steward recovery limit for ${steward.name}: ${errorMessage}`);
            logger.error(`Error setting mergeStatus to failed for task ${orphanedAssignment.task.id}:`, error);
          }
          continue;
        }

        try {
          // Increment stewardRecoveryCount before recovering
          await this.api.update<Task>(orphanedAssignment.task.id, {
            metadata: updateOrchestratorTaskMeta(
              orphanedAssignment.task.metadata as Record<string, unknown> | undefined,
              { stewardRecoveryCount: stewardRecoveryCount + 1 }
            ),
          });
          await this.recoverOrphanedStewardTask(steward, orphanedAssignment.task, orphanedAssignment.orchestratorMeta);
          processed++;
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Merge steward ${steward.name}: ${errorMessage}`);
          logger.error(`Error recovering orphaned steward task for ${steward.name}:`, error);
        }
      }

      if (processed > 0) {
        logger.info(`Recovered ${processed} orphaned task assignment(s)`);
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in recoverOrphanedAssignments:', error);
    }

    const result: PollResult = {
      pollType: 'orphan-recovery',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async reconcileClosedUnmergedTasks(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'closed-unmerged-reconciliation');

    try {
      // Find tasks that are CLOSED but have a non-merged mergeStatus
      const stuckTasks = await this.taskAssignment.listAssignments({
        taskStatus: [TaskStatus.CLOSED],
        mergeStatus: ['pending', 'testing', 'merging', 'conflict', 'test_failed', 'failed'],
      });

      const now = Date.now();

      for (const assignment of stuckTasks) {
        try {
          const { task, orchestratorMeta } = assignment;

          // Skip tasks without orchestrator metadata (not managed by orchestrator)
          if (!orchestratorMeta) continue;

          // Grace period: skip if closedAt is within the grace period
          if (task.closedAt) {
            const closedAtMs = typeof task.closedAt === 'number'
              ? task.closedAt
              : new Date(task.closedAt).getTime();
            if (now - closedAtMs < this.config.closedUnmergedGracePeriodMs) {
              continue;
            }
          }

          // Safety valve: skip if already reconciled 3+ times (prevents infinite loops)
          const currentCount = orchestratorMeta.reconciliationCount ?? 0;
          if (currentCount >= 3) {
            logger.warn(
              `Task ${task.id} has been reconciled ${currentCount} times, skipping (safety valve)`
            );
            continue;
          }

          // Move back to REVIEW with incremented reconciliation count.
          // Clear assignee so steward dispatch sees it as unclaimed.
          // Reset mergeStatus to 'pending' for a clean steward pickup.
          await this.api.update<Task>(task.id, {
            status: TaskStatus.REVIEW,
            assignee: undefined,
            closedAt: undefined,
            closeReason: undefined,
            metadata: updateOrchestratorTaskMeta(
              task.metadata as Record<string, unknown> | undefined,
              {
                reconciliationCount: currentCount + 1,
                mergeStatus: 'pending' as const,
              }
            ),
          });

          processed++;
          logger.info(
            `Reconciled closed-but-unmerged task ${task.id} (mergeStatus=${orchestratorMeta.mergeStatus}, attempt=${currentCount + 1})`
          );
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Task ${assignment.taskId}: ${errorMessage}`);
          logger.error(`Error reconciling task ${assignment.taskId}:`, error);
        }
      }

      if (processed > 0) {
        logger.info(`Reconciled ${processed} closed-but-unmerged task(s)`);
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in reconcileClosedUnmergedTasks:', error);
    }

    const result: PollResult = {
      pollType: 'closed-unmerged-reconciliation',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  /**
   * Detects tasks stuck in 'merging' or 'testing' mergeStatus for too long
   * and resets them to 'pending' for a fresh retry.
   */
  async recoverStuckMergeTasks(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'stuck-merge-recovery');

    try {
      const stuckTasks = await this.taskAssignment.listAssignments({
        taskStatus: [TaskStatus.REVIEW],
        mergeStatus: ['merging', 'testing'],
      });

      const now = Date.now();

      for (const assignment of stuckTasks) {
        try {
          const { task, orchestratorMeta } = assignment;
          if (!orchestratorMeta) continue;

          // Grace period: skip if updatedAt is within the grace period
          if (task.updatedAt) {
            const updatedAtMs = typeof task.updatedAt === 'number'
              ? task.updatedAt
              : new Date(task.updatedAt).getTime();
            if (now - updatedAtMs < this.config.stuckMergeRecoveryGracePeriodMs) {
              continue;
            }
          }

          // Skip if steward has an active session (merge still in progress)
          if (orchestratorMeta.assignedAgent) {
            const activeSession = this.sessionManager.getActiveSession(
              orchestratorMeta.assignedAgent as EntityId
            );
            if (activeSession) continue;
          }

          // Safety valve: skip if already recovered 3+ times
          const currentCount = orchestratorMeta.stuckMergeRecoveryCount ?? 0;
          if (currentCount >= 3) {
            logger.warn(
              `Task ${task.id} has been recovered from stuck merge ${currentCount} times, skipping (safety valve)`
            );
            continue;
          }

          // Reset mergeStatus to 'pending' for fresh steward pickup
          await this.api.update<Task>(task.id, {
            assignee: undefined,
            metadata: updateOrchestratorTaskMeta(
              task.metadata as Record<string, unknown> | undefined,
              {
                mergeStatus: 'pending' as const,
                stuckMergeRecoveryCount: currentCount + 1,
              }
            ),
          });

          // Clean up temp merge worktree if it exists
          const mergeDirName = `_merge-${task.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
          const mergeWorktreePath = `.stoneforge/.worktrees/${mergeDirName}`;
          try {
            const exists = await this.worktreeManager.worktreeExists(mergeWorktreePath);
            if (exists) {
              await this.worktreeManager.removeWorktree(mergeWorktreePath, { force: true });
            }
          } catch {
            // Ignore worktree cleanup errors
          }

          processed++;
          logger.info(
            `Recovered stuck merge task ${task.id} (mergeStatus=${orchestratorMeta.mergeStatus}, attempt=${currentCount + 1})`
          );
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Task ${assignment.taskId}: ${errorMessage}`);
          logger.error(`Error recovering stuck merge task ${assignment.taskId}:`, error);
        }
      }

      if (processed > 0) {
        logger.info(`Recovered ${processed} stuck merge task(s)`);
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in recoverStuckMergeTasks:', error);
    }

    const stuckResult: PollResult = {
      pollType: 'stuck-merge-recovery',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', stuckResult);
    return stuckResult;
  }

  /**
   * Detects active plans where all non-tombstone tasks are closed
   * and marks them as completed.
   */
  async pollPlanAutoComplete(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'plan-auto-complete');

    try {
      // 1. List all active plans
      const allPlans = await this.api.list<Plan>({ type: 'plan' });
      const activePlans = allPlans.filter((p) => p.status === PlanStatus.ACTIVE);

      // 2. Check each active plan for auto-completion eligibility
      for (const plan of activePlans) {
        try {
          // Get tasks in this plan (excluding deleted/tombstone)
          const tasks = await this.api.getTasksInPlan(plan.id, { includeDeleted: false });

          // Build status counts
          const statusCounts: Record<string, number> = {
            [TaskStatus.OPEN]: 0,
            [TaskStatus.IN_PROGRESS]: 0,
            [TaskStatus.BLOCKED]: 0,
            [TaskStatus.CLOSED]: 0,
            [TaskStatus.DEFERRED]: 0,
            [TaskStatus.TOMBSTONE]: 0,
          };

          for (const task of tasks) {
            if (task.status in statusCounts) {
              statusCounts[task.status]++;
            }
          }

          // 3. Check if plan can be auto-completed (all non-tombstone tasks are CLOSED)
          if (canAutoComplete(statusCounts as Record<TaskStatus, number>)) {
            const now = new Date().toISOString();
            await this.api.update<Plan>(plan.id, {
              status: PlanStatus.COMPLETED,
              completedAt: now,
            });
            processed++;
            logger.info(`Auto-completed plan ${plan.id} ("${plan.title}")`);
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Plan ${plan.id}: ${errorMessage}`);
          logger.error(`Error checking plan ${plan.id} for auto-completion:`, error);
        }
      }

      if (processed > 0) {
        logger.info(`Auto-completed ${processed} plan(s)`);
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      logger.error('Error in pollPlanAutoComplete:', error);
    }

    const result: PollResult = {
      pollType: 'plan-auto-complete',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  getConfig(): Omit<Required<DispatchDaemonConfig>, 'onSessionStarted'> & { onSessionStarted?: OnSessionStartedCallback } {
    return { ...this.config };
  }

  updateConfig(config: Partial<DispatchDaemonConfig>): void {
    const oldPollIntervalMs = this.config.pollIntervalMs;
    this.config = this.normalizeConfig({ ...this.config, ...config });

    if (this.running && this.config.pollIntervalMs !== oldPollIntervalMs) {
      if (this.pollIntervalHandle) {
        clearInterval(this.pollIntervalHandle);
      }
      this.pollIntervalHandle = this.createPollInterval();
    }
  }

  // ----------------------------------------
  // Events
  // ----------------------------------------

  on(event: 'poll:start', listener: (pollType: string) => void): void;
  on(event: 'poll:complete', listener: (result: PollResult) => void): void;
  on(event: 'poll:error', listener: (pollType: string, error: Error) => void): void;
  on(event: 'task:dispatched', listener: (taskId: ElementId, agentId: EntityId) => void): void;
  on(event: 'message:forwarded', listener: (messageId: string, agentId: EntityId) => void): void;
  on(event: 'agent:spawned', listener: (agentId: EntityId, worktree?: string) => void): void;
  on(event: 'agent:triage-spawned', listener: (agentId: EntityId, channelId: string, worktree: string) => void): void;
  on(event: 'daemon:notification', listener: (data: { type: 'info' | 'warning' | 'error'; title: string; message?: string }) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private createPollInterval(): NodeJS.Timeout {
    return setInterval(async () => {
      if (!this.running) return;
      try {
        this.currentPollCycle = this.runPollCycle();
        await this.currentPollCycle;
      } catch (error) {
        logger.error('Poll cycle error:', error);
      }
    }, this.config.pollIntervalMs);
  }

  private normalizeConfig(config?: DispatchDaemonConfig): NormalizedConfig {
    let pollIntervalMs = config?.pollIntervalMs ?? DISPATCH_DAEMON_DEFAULT_POLL_INTERVAL_MS;
    pollIntervalMs = Math.max(DISPATCH_DAEMON_MIN_POLL_INTERVAL_MS, Math.min(DISPATCH_DAEMON_MAX_POLL_INTERVAL_MS, pollIntervalMs));

    return {
      pollIntervalMs,
      workerAvailabilityPollEnabled: config?.workerAvailabilityPollEnabled ?? true,
      inboxPollEnabled: config?.inboxPollEnabled ?? true,
      stewardTriggerPollEnabled: config?.stewardTriggerPollEnabled ?? true,
      workflowTaskPollEnabled: config?.workflowTaskPollEnabled ?? true,
      orphanRecoveryEnabled: config?.orphanRecoveryEnabled ?? true,
      planAutoCompleteEnabled: config?.planAutoCompleteEnabled ?? true,
      closedUnmergedReconciliationEnabled: config?.closedUnmergedReconciliationEnabled ?? true,
      closedUnmergedGracePeriodMs: config?.closedUnmergedGracePeriodMs ?? 120_000,
      stuckMergeRecoveryEnabled: config?.stuckMergeRecoveryEnabled ?? true,
      stuckMergeRecoveryGracePeriodMs: config?.stuckMergeRecoveryGracePeriodMs ?? 600_000,
      maxResumeAttemptsBeforeRecovery: config?.maxResumeAttemptsBeforeRecovery ?? 3,
      maxSessionDurationMs: config?.maxSessionDurationMs ?? 0,
      maxStewardSessionDurationMs: config?.maxStewardSessionDurationMs ?? 30 * 60 * 1000,
      onSessionStarted: config?.onSessionStarted,
      projectRoot: config?.projectRoot ?? process.cwd(),
      directorInboxForwardingEnabled: config?.directorInboxForwardingEnabled ?? true,
      directorInboxIdleThresholdMs: config?.directorInboxIdleThresholdMs ?? 120_000,
    };
  }

  /**
   * Runs a complete poll cycle for all enabled polling loops.
   */
  private async runPollCycle(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      // Check if all executables in the fallback chain are rate-limited.
      // When paused, skip dispatch-related polls but still run non-dispatch work.
      // When no fallback chain is configured, check if the default provider is limited —
      // an empty chain previously made allLimited always false, letting orphan recovery
      // run every cycle even when the only executable was rate-limited.
      const fallbackChain = this.settingsService?.getAgentDefaults().fallbackChain ?? [];
      const allLimited = fallbackChain.length > 0
        ? this.rateLimitTracker.isAllLimited(fallbackChain)
        : this.rateLimitTracker.isLimited('claude');

      if (allLimited) {
        // Schedule a wake-up timer so we re-check when the soonest limit expires
        const soonestReset = this.rateLimitTracker.getSoonestResetTime();
        if (soonestReset && !this.rateLimitSleepTimer) {
          const sleepMs = Math.max(0, soonestReset.getTime() - Date.now());
          logger.info(
            `All executables rate-limited. Pausing dispatch polls for ${Math.round(sleepMs / 1000)}s (until ${soonestReset.toISOString()})`
          );
          this.rateLimitSleepTimer = setTimeout(() => {
            this.rateLimitSleepTimer = undefined;
          }, sleepMs);
        }

        // Run non-dispatch polls only
        if (this.config.inboxPollEnabled) {
          await this.pollInboxes();
        }
        if (this.config.closedUnmergedReconciliationEnabled) {
          await this.reconcileClosedUnmergedTasks();
        }
        if (this.config.stuckMergeRecoveryEnabled) {
          await this.recoverStuckMergeTasks();
        }
        if (this.config.planAutoCompleteEnabled) {
          await this.pollPlanAutoComplete();
        }
        return;
      }

      // Clear sleep timer if limits have expired
      if (this.rateLimitSleepTimer) {
        clearTimeout(this.rateLimitSleepTimer);
        this.rateLimitSleepTimer = undefined;
      }

      // Recover orphaned assignments first — workers with tasks but no session
      // (e.g. from mid-cycle crashes). Runs before availability polling so
      // orphans are handled before they'd be skipped.
      // Skip if startup recovery is still in flight to avoid duplicate work
      // and prevent blocking the poll cycle on stale session resumes.
      if (this.config.orphanRecoveryEnabled && !this.startupRecoveryInFlight) {
        await this.recoverOrphanedAssignments();
      }

      // Reap stale sessions before polling for availability
      await this.reapStaleSessions();

      // Run polls sequentially to avoid overwhelming the system.
      // Inbox runs first so triage spawns before task dispatch — idle agents
      // process accumulated non-dispatch messages before picking up new tasks.
      if (this.config.inboxPollEnabled) {
        await this.pollInboxes();
      }

      if (this.config.workerAvailabilityPollEnabled) {
        await this.pollWorkerAvailability();
      }

      if (this.config.stewardTriggerPollEnabled) {
        await this.pollStewardTriggers();
      }

      if (this.config.workflowTaskPollEnabled) {
        await this.pollWorkflowTasks();
      }

      // Reconcile closed-but-unmerged tasks after workflow polling so
      // reconciled tasks get picked up on the next cycle, giving a clean
      // state transition.
      if (this.config.closedUnmergedReconciliationEnabled) {
        await this.reconcileClosedUnmergedTasks();
      }

      // Recover tasks stuck in merging/testing for too long
      if (this.config.stuckMergeRecoveryEnabled) {
        await this.recoverStuckMergeTasks();
      }

      // Auto-complete plans where all tasks are closed
      if (this.config.planAutoCompleteEnabled) {
        await this.pollPlanAutoComplete();
      }
    } finally {
      this.polling = false;
    }
  }

  /**
   * Resolves the executable path for a session, checking rate limits and applying
   * fallback selection when the primary executable is rate-limited.
   *
   * @param agent - The agent to resolve the executable for
   * @returns The executable path override if fallback was needed, undefined if primary is OK,
   *          or 'all_limited' if all executables in the fallback chain are rate-limited.
   */
  private resolveExecutableWithFallback(agent: AgentEntity): string | undefined | 'all_limited' {
    const meta = getAgentMetadata(agent);
    if (!meta) return undefined;

    // When a fallback chain is configured, it is the authoritative list of
    // available executables. Check it first before resolving per-agent defaults.
    const fallbackChain = this.settingsService?.getAgentDefaults().fallbackChain ?? [];

    if (fallbackChain.length > 0) {
      // If all executables in the chain are limited, we can't dispatch
      if (this.rateLimitTracker.isAllLimited(fallbackChain)) {
        return 'all_limited';
      }

      // Find the first available executable in the chain
      const available = this.rateLimitTracker.getAvailableExecutable(fallbackChain);
      if (!available) {
        return 'all_limited';
      }

      // Return the available executable as an override path
      return available;
    }

    // No fallback chain — check the agent's effective executable directly
    const agentExecutablePath = (meta as { executablePath?: string }).executablePath;
    const providerName = (meta as { provider?: string }).provider ?? 'claude-code';

    // Determine the effective executable path that would be used
    // Priority: agent-specific → workspace-wide default → provider default
    let effectiveExecutable = agentExecutablePath;
    if (!effectiveExecutable && this.settingsService) {
      const defaults = this.settingsService.getAgentDefaults();
      effectiveExecutable = defaults.defaultExecutablePaths[providerName];
    }
    if (!effectiveExecutable) {
      effectiveExecutable = providerName;
    }

    if (this.rateLimitTracker.isLimited(effectiveExecutable)) {
      return 'all_limited';
    }
    return undefined;
  }

  /**
   * Terminates sessions that have exceeded the configured max duration.
   * Prevents stuck workers from blocking their slot indefinitely.
   *
   * Applies two thresholds:
   * - `maxSessionDurationMs` — general limit for all sessions (0 = disabled)
   * - `maxStewardSessionDurationMs` — stricter limit for steward sessions
   *   (default 30 minutes), which are expected to be short-lived
   */
  private async reapStaleSessions(): Promise<void> {
    const hasGeneralLimit = this.config.maxSessionDurationMs > 0;
    const hasStewardLimit = this.config.maxStewardSessionDurationMs > 0;

    if (!hasGeneralLimit && !hasStewardLimit) return;

    const running = this.sessionManager.listSessions({ status: 'running' });
    const now = Date.now();

    for (const session of running) {
      const createdAt = typeof session.createdAt === 'number'
        ? session.createdAt
        : new Date(session.createdAt).getTime();
      const age = now - createdAt;

      // Apply steward-specific limit
      if (hasStewardLimit && session.agentRole === 'steward' && age > this.config.maxStewardSessionDurationMs) {
        try {
          await this.sessionManager.stopSession(session.id, {
            graceful: false,
            reason: `Steward session exceeded max duration (${Math.round(age / 1000)}s, limit: ${Math.round(this.config.maxStewardSessionDurationMs / 1000)}s)`,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('not found')) {
            logger.warn(`Failed to reap steward session ${session.id}:`, error);
          }
        }
        continue;
      }

      // Apply general limit
      if (hasGeneralLimit && age > this.config.maxSessionDurationMs) {
        try {
          await this.sessionManager.stopSession(session.id, {
            graceful: false,
            reason: `Session exceeded max duration (${Math.round(age / 1000)}s)`,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('not found')) {
            logger.warn(`Failed to reap session ${session.id}:`, error);
          }
        }
      }
    }
  }

  /**
   * Recovers a single orphaned task by re-spawning a session for the worker.
   * Tries to resume the previous provider session first (preserves context),
   * falls back to a fresh spawn if no sessionId or resume fails.
   */
  private async recoverOrphanedTask(
    worker: AgentEntity,
    task: Task,
    taskMeta: import('../types/task-meta.js').OrchestratorTaskMeta | undefined
  ): Promise<void> {
    const workerId = asEntityId(worker.id);

    // 1. Resolve worktree — reuse existing or create new
    let worktreePath = taskMeta?.worktree ?? taskMeta?.handoffWorktree;
    let branch = taskMeta?.branch ?? taskMeta?.handoffBranch;

    if (worktreePath) {
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        const worktreeResult = await this.createWorktreeForTask(worker, task);
        worktreePath = worktreeResult.path;
        branch = worktreeResult.branch;

        // Update task metadata with new worktree info
        await this.api.update(task.id, {
          metadata: updateOrchestratorTaskMeta(
            task.metadata as Record<string, unknown> | undefined,
            { worktree: worktreePath, branch }
          ),
        });
      }
    } else {
      const worktreeResult = await this.createWorktreeForTask(worker, task);
      worktreePath = worktreeResult.path;
      branch = worktreeResult.branch;

      await this.api.update(task.id, {
        metadata: updateOrchestratorTaskMeta(
          task.metadata as Record<string, unknown> | undefined,
          { worktree: worktreePath, branch }
        ),
      });
    }

    // 2. Try resume first if we have a previous session ID
    const previousSessionId = taskMeta?.sessionId;
    if (previousSessionId) {
      try {
        const { session, events } = await this.sessionManager.resumeSession(workerId, {
          providerSessionId: previousSessionId,
          workingDirectory: worktreePath,
          worktree: worktreePath,
          checkReadyQueue: false,
          resumePrompt: [
            'Your previous session was interrupted by a server restart.',
            `You are still assigned to task ${task.id}: "${task.title}".`,
            'Please continue working on this task from where you left off.',
          ].join('\n'),
        });

        // Record session history entry for recovered worker session
        const resumeHistoryEntry: TaskSessionHistoryEntry = {
          sessionId: session.id,
          providerSessionId: session.providerSessionId,
          agentId: workerId,
          agentName: worker.name,
          agentRole: 'worker',
          startedAt: createTimestamp(),
        };
        const updatedTask = await this.api.get<Task>(task.id);
        if (updatedTask) {
          const metadataWithHistory = appendTaskSessionHistory(
            updatedTask.metadata as Record<string, unknown> | undefined,
            resumeHistoryEntry
          );
          await this.api.update<Task>(task.id, { metadata: metadataWithHistory });
        }

        if (this.config.onSessionStarted) {
          this.config.onSessionStarted(session, events, workerId, `[resumed session for task ${task.id}]`);
        }

        this.emitter.emit('agent:spawned', workerId, worktreePath);
        logger.info(`Resumed session for orphaned task ${task.id} on worker ${worker.name}`);
        return;
      } catch (error) {
        logger.warn(
          `Failed to resume session ${previousSessionId} for worker ${worker.name}, falling back to fresh spawn:`,
          error
        );

        // Clear stale session ID so next recovery cycle doesn't try to resume again
        const clearedMeta = updateOrchestratorTaskMeta(
          task.metadata as Record<string, unknown> | undefined,
          { sessionId: undefined }
        );
        await this.api.update(task.id, { metadata: clearedMeta });
      }
    }

    // 3. Fall back to fresh spawn (with rate limit fallback)
    const orphanExecutableOverride = this.resolveExecutableWithFallback(worker);
    if (orphanExecutableOverride === 'all_limited') {
      logger.warn(
        `All executables rate-limited, deferring orphan recovery for worker ${worker.name}`
      );
      return;
    }

    const initialPrompt = await this.buildTaskPrompt(task, workerId);

    const { session, events } = await this.sessionManager.startSession(workerId, {
      workingDirectory: worktreePath,
      worktree: worktreePath,
      initialPrompt,
      executablePathOverride: orphanExecutableOverride ?? undefined,
    });

    // Record session history entry and new sessionId for fresh spawned worker session
    const freshSpawnHistoryEntry: TaskSessionHistoryEntry = {
      sessionId: session.id,
      providerSessionId: session.providerSessionId,
      agentId: workerId,
      agentName: worker.name,
      agentRole: 'worker',
      startedAt: createTimestamp(),
    };
    const taskAfterFreshSpawn = await this.api.get<Task>(task.id);
    if (taskAfterFreshSpawn) {
      const metadataWithHistory = appendTaskSessionHistory(
        taskAfterFreshSpawn.metadata as Record<string, unknown> | undefined,
        freshSpawnHistoryEntry
      );
      // Write the new session ID so future recovery cycles can resume this session
      const metadataWithSessionId = updateOrchestratorTaskMeta(
        metadataWithHistory,
        { sessionId: session.providerSessionId ?? session.id }
      );
      await this.api.update<Task>(task.id, { metadata: metadataWithSessionId });
    }

    if (this.config.onSessionStarted) {
      this.config.onSessionStarted(session, events, workerId, initialPrompt);
    }

    this.emitter.emit('agent:spawned', workerId, worktreePath);
    logger.info(`Spawned fresh session for orphaned task ${task.id} on worker ${worker.name}`);
  }

  /**
   * Recovers a single orphaned merge steward task by resuming or re-spawning.
   * Tries to resume the previous provider session first (preserves context),
   * falls back to a fresh spawn via spawnMergeStewardForTask.
   */
  private async recoverOrphanedStewardTask(
    steward: AgentEntity,
    task: Task,
    taskMeta: import('../types/task-meta.js').OrchestratorTaskMeta | undefined
  ): Promise<void> {
    const stewardId = asEntityId(steward.id);

    // 1. Resolve worktree — verify it still exists
    let worktreePath = taskMeta?.worktree;
    if (worktreePath) {
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        logger.warn(`Worktree ${worktreePath} no longer exists for steward task ${task.id}, using project root`);
        worktreePath = undefined;
      }
    }
    const workingDirectory = worktreePath ?? this.config.projectRoot;

    // 2. Try resume first if we have a previous session ID
    const previousSessionId = taskMeta?.sessionId;
    if (previousSessionId) {
      try {
        const { session, events } = await this.sessionManager.resumeSession(stewardId, {
          providerSessionId: previousSessionId,
          workingDirectory,
          worktree: worktreePath,
          checkReadyQueue: false,
          resumePrompt: [
            'Your previous session was interrupted by a server restart.',
            `You are still assigned to review/merge task ${task.id}: "${task.title}".`,
            'Please continue the merge review from where you left off.',
          ].join('\n'),
        });

        // Record session history entry for recovered steward session
        const resumeHistoryEntry: TaskSessionHistoryEntry = {
          sessionId: session.id,
          providerSessionId: session.providerSessionId,
          agentId: stewardId,
          agentName: steward.name,
          agentRole: 'steward',
          startedAt: createTimestamp(),
        };
        const updatedTask = await this.api.get<Task>(task.id);
        if (updatedTask) {
          const metadataWithHistory = appendTaskSessionHistory(
            updatedTask.metadata as Record<string, unknown> | undefined,
            resumeHistoryEntry
          );
          await this.api.update<Task>(task.id, { metadata: metadataWithHistory });
        }

        if (this.config.onSessionStarted) {
          this.config.onSessionStarted(session, events, stewardId, `[resumed steward session for task ${task.id}]`);
        }
        this.emitter.emit('agent:spawned', stewardId, worktreePath);
        logger.info(`Resumed steward session for orphaned task ${task.id} on ${steward.name}`);
        return;
      } catch (error) {
        logger.warn(
          `Failed to resume steward session ${previousSessionId} for ${steward.name}, falling back to fresh spawn:`,
          error
        );

        // Clear stale session ID so next recovery cycle doesn't try to resume again
        const clearedMeta = updateOrchestratorTaskMeta(
          task.metadata as Record<string, unknown> | undefined,
          { sessionId: undefined }
        );
        await this.api.update(task.id, { metadata: clearedMeta });
      }
    }

    // 3. Fall back to fresh spawn (spawnMergeStewardForTask handles metadata update AND session history)
    await this.spawnMergeStewardForTask(steward, task);
    logger.info(`Spawned fresh steward session for orphaned task ${task.id} on ${steward.name}`);
  }

  /**
   * Assigns the highest priority unassigned task to a worker.
   * Handles handoff branches by reusing existing worktrees.
   * Respects agent pool capacity limits.
   */
  private async assignTaskToWorker(worker: AgentEntity): Promise<boolean> {
    // Get ready tasks (already filtered for blocked, draft plans, future-scheduled, etc.)
    // and sorted by effective priority via api.ready()
    const readyTasks = await this.api.ready();
    const unassignedTasks = readyTasks.filter((t) => !t.assignee);

    if (unassignedTasks.length === 0) {
      return false;
    }

    // ready() already sorts by effective priority, take the first
    const task = unassignedTasks[0];
    const workerId = asEntityId(worker.id);

    // Check pool capacity before spawning
    if (this.poolService) {
      const meta = getAgentMetadata(worker);
      if (meta && meta.agentRole === 'worker') {
        const workerMeta = meta as WorkerMetadata;
        const spawnRequest: PoolSpawnRequest = {
          role: 'worker',
          workerMode: workerMeta.workerMode,
          agentId: workerId,
        };

        const poolCheck = await this.poolService.canSpawn(spawnRequest);
        if (!poolCheck.canSpawn) {
          logger.debug(
            `Pool capacity reached for worker ${worker.name}: ${poolCheck.reason}`
          );
          return false;
        }
      }
    }

    // Check rate limits and determine executable path override if needed
    const executableOverride = this.resolveExecutableWithFallback(worker);
    if (executableOverride === 'all_limited') {
      logger.warn(
        `All executables rate-limited, skipping dispatch for worker ${worker.name}`
      );
      return false;
    }

    // Check for existing worktree/branch in task metadata
    // Priority: handoff > existing assignment > create new
    const taskMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
    const handoffBranch = taskMeta?.handoffBranch;
    const handoffWorktree = taskMeta?.handoffWorktree;
    const existingBranch = taskMeta?.branch;
    const existingWorktree = taskMeta?.worktree;

    let worktreePath: string;
    let branch: string;

    // Check handoff first (takes priority)
    if (handoffBranch && handoffWorktree) {
      worktreePath = handoffWorktree;
      branch = handoffBranch;

      // Verify the worktree still exists
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        // Worktree was cleaned up, create a new one
        const worktreeResult = await this.createWorktreeForTask(worker, task);
        worktreePath = worktreeResult.path;
        branch = worktreeResult.branch;
      }
    }
    // Check for existing assignment worktree (from previous attempt)
    else if (existingBranch && existingWorktree) {
      worktreePath = existingWorktree;
      branch = existingBranch;

      // Verify the worktree still exists
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        // Worktree was cleaned up, create a new one
        const worktreeResult = await this.createWorktreeForTask(worker, task);
        worktreePath = worktreeResult.path;
        branch = worktreeResult.branch;
      }
    }
    // No existing worktree, create a new one
    else {
      const worktreeResult = await this.createWorktreeForTask(worker, task);
      worktreePath = worktreeResult.path;
      branch = worktreeResult.branch;
    }

    // Build initial prompt with task context
    const initialPrompt = await this.buildTaskPrompt(task, workerId);

    // Spawn worker INSIDE the worktree BEFORE dispatching the task.
    // This ensures that if the session fails to start (e.g. provider not
    // available), the task stays unassigned and available for other agents.
    const { session, events } = await this.sessionManager.startSession(workerId, {
      workingDirectory: worktreePath,
      worktree: worktreePath,
      initialPrompt,
      executablePathOverride: executableOverride ?? undefined,
    });

    // Session started successfully — now dispatch the task (assigns + sends message)
    const dispatchOptions: DispatchOptions = {
      branch,
      worktree: worktreePath,
      markAsStarted: true,
      priority: task.priority,
      sessionId: session.providerSessionId ?? session.id,
    };

    await this.dispatchService.dispatch(task.id, workerId, dispatchOptions);
    this.emitter.emit('task:dispatched', task.id, workerId);

    // Record session history entry for this worker session
    // Re-read task to get metadata after dispatch wrote to it
    const updatedTask = await this.api.get<Task>(task.id);
    if (updatedTask) {
      const sessionHistoryEntry: TaskSessionHistoryEntry = {
        sessionId: session.id,
        providerSessionId: session.providerSessionId,
        agentId: workerId,
        agentName: worker.name,
        agentRole: 'worker',
        startedAt: createTimestamp(),
      };
      const metadataWithHistory = appendTaskSessionHistory(
        updatedTask.metadata as Record<string, unknown> | undefined,
        sessionHistoryEntry
      );
      await this.api.update<Task>(task.id, { metadata: metadataWithHistory });
    }

    // Call the onSessionStarted callback if provided (for event saver and initial prompt saving)
    if (this.config.onSessionStarted) {
      this.config.onSessionStarted(session, events, workerId, initialPrompt);
    }

    // Notify pool service that agent was spawned
    if (this.poolService) {
      await this.poolService.onAgentSpawned(workerId);
    }

    this.emitter.emit('agent:spawned', workerId, worktreePath);

    return true;
  }

  /**
   * Creates a worktree for a task assignment.
   * Includes dependency installation so workers have node_modules available.
   */
  private async createWorktreeForTask(worker: AgentEntity, task: Task): Promise<CreateWorktreeResult> {
    return this.worktreeManager.createWorktree({
      agentName: worker.name,
      taskId: task.id,
      taskTitle: task.title,
      installDependencies: true,
    });
  }

  /**
   * Builds the initial prompt for a task assignment.
   * Includes the worker role prompt followed by task-specific details.
   * Fetches the description Document content so handoff notes (appended to
   * description) are automatically included.
   */
  private async buildTaskPrompt(task: Task, workerId: EntityId): Promise<string> {
    const parts: string[] = [];

    // Load and include the worker role prompt, framed as operating instructions
    // so Claude understands this is its role definition, not file content
    const roleResult = loadRolePrompt('worker', undefined, { projectRoot: this.config.projectRoot, workerMode: 'ephemeral' });
    if (roleResult) {
      parts.push(
        'Please read and internalize the following operating instructions. These define your role and how you should behave:',
        '',
        roleResult.prompt,
        '',
        '---',
        ''
      );
    }

    // Get the director ID for context
    const director = await this.agentRegistry.getDirector();
    const directorId = director?.id ?? 'unknown';

    parts.push(
      '## Task Assignment',
      '',
      `**Worker ID:** ${workerId}`,
      `**Director ID:** ${directorId}`,
      `**Task ID:** ${task.id}`,
      `**Title:** ${task.title}`,
    );

    if (task.priority !== undefined) {
      parts.push(`**Priority:** ${task.priority}`);
    }

    // Fetch and include the actual description content
    if (task.descriptionRef) {
      try {
        const doc = await this.api.get<Document>(asElementId(task.descriptionRef));
        if (doc?.content) {
          parts.push('', '### Description', doc.content);
        }
      } catch {
        parts.push('', `**Description Document:** ${task.descriptionRef}`);
      }
    }

    // Include acceptance criteria if any
    if (task.acceptanceCriteria) {
      parts.push('', '### Acceptance Criteria', task.acceptanceCriteria);
    }

    // Handoff notes are now embedded in the description — no separate section needed

    // Explicit action instructions so the worker knows what to do
    parts.push(
      '',
      '### Instructions',
      '1. Read the task title and acceptance criteria carefully to decide the correct action.',
      '2. If the task asks you to **hand off**, run: `sf task handoff ' + task.id + ' --message "your handoff note"` and stop.',
      '3. Otherwise, complete the task: make changes, commit, push, then run: `sf task complete ' + task.id + '`.',
    );

    return parts.join('\n');
  }

  /**
   * Builds the initial prompt for a merge steward session.
   * Includes the steward role prompt (steward-merge.md) followed by task context.
   *
   * @param task - The task being reviewed
   * @param stewardId - The steward's entity ID
   * @param stewardFocus - The steward's focus area (merge, docs, or custom)
   * @param syncResult - Optional result from pre-spawn branch sync
   */
  private async buildStewardPrompt(
    task: Task,
    stewardId: EntityId,
    stewardFocus: StewardFocus = 'merge',
    syncResult?: SyncResult
  ): Promise<string> {
    const parts: string[] = [];

    // Load and include the steward role prompt, rendering template variables
    const roleResult = loadRolePrompt('steward', stewardFocus, { projectRoot: this.config.projectRoot });
    if (roleResult) {
      const baseBranch = await this.getTargetBranch();
      const renderedPrompt = renderPromptTemplate(roleResult.prompt, { baseBranch });
      parts.push(
        'Please read and internalize the following operating instructions. These define your role and how you should behave:',
        '',
        renderedPrompt,
        '',
        '---',
        ''
      );
    }

    // Get orchestrator metadata for PR/branch info
    const taskMeta = task.metadata as Record<string, unknown> | undefined;
    const orchestratorMeta = taskMeta?.orchestrator as Record<string, unknown> | undefined;
    const prUrl = orchestratorMeta?.mergeRequestUrl as string | undefined;
    const branch = orchestratorMeta?.branch as string | undefined;

    // Get the director ID for context
    const director = await this.agentRegistry.getDirector();
    const directorId = director?.id ?? 'unknown';

    parts.push(
      '## Merge Request Assignment',
      '',
      `**Steward ID:** ${stewardId}`,
      `**Director ID:** ${directorId}`,
      `**Task ID:** ${task.id}`,
      `**Title:** ${task.title}`,
    );

    if (branch) {
      parts.push(`**Branch:** ${branch}`);
    }

    if (prUrl) {
      parts.push(`**PR URL:** ${prUrl}`);
    }

    if (task.priority !== undefined) {
      parts.push(`**Priority:** ${task.priority}`);
    }

    // Include sync status section if sync was attempted
    if (syncResult) {
      parts.push('', '## Sync Status', '');
      parts.push('The branch was synced with master before your review.', '');

      if (syncResult.success) {
        parts.push('**Result**: SUCCESS');
        parts.push('');
        parts.push('Branch is up-to-date with master. `git diff origin/master..HEAD` will show only this task\'s changes.');
      } else if (syncResult.conflicts && syncResult.conflicts.length > 0) {
        parts.push('**Result**: CONFLICTS');
        parts.push('');
        parts.push('**Conflicted files**:');
        for (const file of syncResult.conflicts) {
          parts.push(`- ${file}`);
        }
        parts.push('');
        parts.push('**Your first step is to resolve these conflicts before reviewing.**');
        parts.push('See the conflict resolution guidance in your operating instructions.');
      } else {
        parts.push('**Result**: ERROR');
        parts.push('');
        parts.push(`**Error**: ${syncResult.error ?? syncResult.message}`);
        parts.push('');
        parts.push('You may need to manually sync the branch with `sf task sync ' + task.id + '`.');
      }
    }

    // Fetch and include the description content
    if (task.descriptionRef) {
      try {
        const doc = await this.api.get<Document>(asElementId(task.descriptionRef));
        if (doc?.content) {
          parts.push('', '### Task Description', doc.content);
        }
      } catch {
        parts.push('', `**Description Document:** ${task.descriptionRef}`);
      }
    }

    // Include acceptance criteria if any
    if (task.acceptanceCriteria) {
      parts.push('', '### Acceptance Criteria', task.acceptanceCriteria);
    }

    return parts.join('\n');
  }

  /**
   * Spawns a merge steward session for a task in REVIEW status.
   * Syncs the branch with master before spawning to ensure clean diffs.
   * Respects agent pool capacity limits.
   */
  private async spawnMergeStewardForTask(steward: AgentEntity, task: Task): Promise<void> {
    const stewardId = asEntityId(steward.id);
    const meta = getAgentMetadata(steward) as StewardMetadata | undefined;
    const stewardFocus = meta?.stewardFocus ?? 'merge';

    // Check pool capacity before spawning
    if (this.poolService && meta) {
      const spawnRequest: PoolSpawnRequest = {
        role: 'steward',
        stewardFocus: meta.stewardFocus,
        agentId: stewardId,
      };

      const poolCheck = await this.poolService.canSpawn(spawnRequest);
      if (!poolCheck.canSpawn) {
        logger.debug(
          `Pool capacity reached for steward ${steward.name}: ${poolCheck.reason}`
        );
        return;
      }
    }

    // Check rate limits and determine executable path override if needed
    const stewardExecutableOverride = this.resolveExecutableWithFallback(steward);
    if (stewardExecutableOverride === 'all_limited') {
      logger.warn(
        `All executables rate-limited, skipping merge steward dispatch for ${steward.name}`
      );
      return;
    }

    // Get task metadata for worktree path
    const taskMeta = task.metadata as Record<string, unknown> | undefined;
    const orchestratorMeta = taskMeta?.orchestrator as Record<string, unknown> | undefined;
    let worktreePath = orchestratorMeta?.worktree as string | undefined;

    // Verify the worktree still exists; create a fresh one if cleaned up (NEVER fall back to project root)
    if (worktreePath) {
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        logger.warn(`Worktree ${worktreePath} no longer exists for task ${task.id}, creating fresh worktree`);
        const sourceBranch = orchestratorMeta?.branch as string | undefined;
        if (sourceBranch) {
          try {
            const result = await this.worktreeManager.createReadOnlyWorktree({
              agentName: stewardId,
              purpose: `steward-${task.id}`,
            });
            worktreePath = result.path;
          } catch (e) {
            logger.error(`Failed to create steward worktree: ${e}`);
            worktreePath = undefined;
          }
        } else {
          worktreePath = undefined;
        }
      }
    }

    // Guard: never spawn a steward in the project root — skip if no worktree
    if (!worktreePath) {
      this.emitter.emit('daemon:notification', {
        type: 'warning' as const,
        title: 'Merge steward skipped',
        message: `Cannot spawn merge steward for task ${task.id}: worktree missing and no branch info available to create a new one.`,
      });
      return;
    }

    // Phase 1: Sync branch with master before spawning steward
    // This ensures `git diff origin/master..HEAD` shows only the task's changes
    let syncResult: SyncResult | undefined;
    if (worktreePath) {
      logger.debug(`Syncing task ${task.id} branch before steward spawn...`);
      syncResult = await this.syncTaskBranch(task);

      // Store sync result in task metadata for audit trail
      await this.api.update<Task>(task.id, {
        metadata: updateOrchestratorTaskMeta(
          task.metadata as Record<string, unknown> | undefined,
          {
            lastSyncResult: {
              success: syncResult.success,
              conflicts: syncResult.conflicts,
              error: syncResult.error,
              message: syncResult.message,
              syncedAt: new Date().toISOString(),
            },
          }
        ),
      });
    }

    // Build the steward prompt with full context including sync result
    const initialPrompt = await this.buildStewardPrompt(task, stewardId, stewardFocus as StewardFocus, syncResult);

    const workingDirectory = worktreePath;

    // Start the steward session
    const { session, events } = await this.sessionManager.startSession(stewardId, {
      workingDirectory,
      worktree: worktreePath,
      initialPrompt,
      interactive: false, // Stewards use headless mode
      executablePathOverride: stewardExecutableOverride ?? undefined,
    });

    // Record steward assignment and session history on the task to prevent double-dispatch and enable recovery.
    // Setting task.assignee makes the steward visible in the UI and enables
    // getAgentTasks() lookups for orphan recovery.
    // Re-read task to get latest metadata (after sync result was stored)
    const taskAfterSync = await this.api.get<Task>(task.id);
    const sessionHistoryEntry: TaskSessionHistoryEntry = {
      sessionId: session.id,
      providerSessionId: session.providerSessionId,
      agentId: stewardId,
      agentName: steward.name,
      agentRole: 'steward',
      startedAt: createTimestamp(),
    };
    // First append session history, then apply steward assignment metadata
    const metadataWithHistory = appendTaskSessionHistory(
      taskAfterSync?.metadata as Record<string, unknown> | undefined,
      sessionHistoryEntry
    );
    const finalMetadata = updateOrchestratorTaskMeta(
      metadataWithHistory,
      {
        assignedAgent: stewardId,
        mergeStatus: 'testing' as const,
        sessionId: session.providerSessionId ?? session.id,
      }
    );
    await this.api.update<Task>(task.id, {
      assignee: stewardId,
      metadata: finalMetadata,
    });

    // Call the onSessionStarted callback if provided
    if (this.config.onSessionStarted) {
      this.config.onSessionStarted(session, events, stewardId, initialPrompt);
    }

    // Notify pool service that agent was spawned
    if (this.poolService) {
      await this.poolService.onAgentSpawned(stewardId);
    }

    this.emitter.emit('agent:spawned', stewardId, worktreePath);
    logger.info(`Spawned merge steward ${steward.name} for task ${task.id}`);
  }

  /**
   * Spawns a recovery steward for a task stuck in a resume loop.
   *
   * When a worker session exits without calling `sf task complete` or
   * `sf task handoff`, the orphan recovery loop resumes it. After
   * maxResumeAttemptsBeforeRecovery consecutive resumes without a status
   * change, this method is called instead to:
   * 1. Unassign the worker from the task
   * 2. Find an available recovery steward (or any available steward)
   * 3. Spawn a recovery steward session with full task context
   *
   * @param worker - The worker that was assigned to the stuck task
   * @param task - The stuck task
   * @param taskMeta - The task's orchestrator metadata
   */
  private async spawnRecoveryStewardForTask(
    worker: AgentEntity,
    task: Task,
    taskMeta: import('../types/task-meta.js').OrchestratorTaskMeta | undefined,
    stewardsUsedThisCycle?: Set<string>
  ): Promise<void> {
    const workerId = asEntityId(worker.id);

    // 1. Find an available recovery steward
    const stewards = await this.agentRegistry.listAgents({
      role: 'steward',
      stewardFocus: 'recovery',
    });

    // Find a steward without an active session that hasn't already been used this cycle.
    // The stewardsUsedThisCycle guard prevents cascade assignment: when a steward session
    // terminates immediately (e.g. due to rate limiting), getActiveSession returns null
    // and the steward appears available for the next task in the same loop iteration.
    let recoverySteward: AgentEntity | undefined;
    for (const steward of stewards) {
      const sid = asEntityId(steward.id);
      if (stewardsUsedThisCycle?.has(sid as string)) continue;
      const session = this.sessionManager.getActiveSession(sid);
      if (!session) {
        recoverySteward = steward;
        break;
      }
    }

    if (!recoverySteward) {
      // No recovery steward available — emit a notification and leave the task as-is
      this.emitter.emit('daemon:notification', {
        type: 'warning' as const,
        title: 'Recovery steward unavailable',
        message: `Task ${task.id} is stuck after ${taskMeta?.resumeCount ?? 0} resume attempts, but no recovery steward is available. The task will not be resumed again until a recovery steward is available.`,
      });
      logger.warn(
        `No available recovery steward for stuck task ${task.id}. ` +
        `Task has been resumed ${taskMeta?.resumeCount ?? 0} times without status change.`
      );
      return;
    }

    const stewardId = asEntityId(recoverySteward.id);

    // 2. Check pool capacity before spawning
    const stewardMeta = getAgentMetadata(recoverySteward) as StewardMetadata | undefined;
    if (this.poolService && stewardMeta) {
      const spawnRequest: PoolSpawnRequest = {
        role: 'steward',
        stewardFocus: stewardMeta.stewardFocus,
        agentId: stewardId,
      };

      const poolCheck = await this.poolService.canSpawn(spawnRequest);
      if (!poolCheck.canSpawn) {
        logger.debug(
          `Pool capacity reached for recovery steward ${recoverySteward.name}: ${poolCheck.reason}`
        );
        return;
      }
    }

    // 2b. Check rate limits and determine executable path override
    const recoveryExecutableOverride = this.resolveExecutableWithFallback(recoverySteward);
    if (recoveryExecutableOverride === 'all_limited') {
      logger.warn(
        `All executables rate-limited, deferring recovery steward spawn for ${recoverySteward.name}`
      );
      return;
    }

    // 3. Resolve worktree — reuse the worker's existing worktree
    let worktreePath = taskMeta?.worktree ?? taskMeta?.handoffWorktree;
    const branch = taskMeta?.branch ?? taskMeta?.handoffBranch;

    if (worktreePath) {
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        logger.warn(`Worktree ${worktreePath} no longer exists for stuck task ${task.id}`);
        // Try to create a read-only worktree for the steward
        if (branch) {
          try {
            const result = await this.worktreeManager.createReadOnlyWorktree({
              agentName: stewardId,
              purpose: `recovery-${task.id}`,
            });
            worktreePath = result.path;
          } catch (e) {
            logger.error(`Failed to create recovery steward worktree: ${e}`);
            worktreePath = undefined;
          }
        } else {
          worktreePath = undefined;
        }
      }
    }

    // Guard: never spawn a steward without a worktree
    if (!worktreePath) {
      this.emitter.emit('daemon:notification', {
        type: 'warning' as const,
        title: 'Recovery steward skipped',
        message: `Cannot spawn recovery steward for task ${task.id}: worktree missing and no branch info available to create a new one.`,
      });
      return;
    }

    // 4. Build the recovery steward prompt
    const initialPrompt = await this.buildRecoveryStewardPrompt(task, stewardId, taskMeta);

    // 5. Start the recovery steward session BEFORE unassigning the worker.
    //    If startSession fails (rate limited, pool full, etc.), the task retains
    //    its original worker assignment and is not left orphaned.
    const { session, events } = await this.sessionManager.startSession(stewardId, {
      workingDirectory: worktreePath,
      worktree: worktreePath,
      initialPrompt,
      interactive: false, // Stewards use headless mode
      executablePathOverride: recoveryExecutableOverride ?? undefined,
    });

    // 5b. Mark steward as used this cycle so it won't be re-assigned if the session
    //     terminates immediately (e.g. rate-limited) before the next loop iteration checks.
    stewardsUsedThisCycle?.add(stewardId as string);

    // 6. Session started successfully — now transfer the task from worker to steward.
    //    If the metadata update fails, terminate the steward session to avoid an
    //    orphaned steward running without proper task assignment.
    try {
      const taskAfterUpdate = await this.api.get<Task>(task.id);
      const sessionHistoryEntry: TaskSessionHistoryEntry = {
        sessionId: session.id,
        providerSessionId: session.providerSessionId,
        agentId: stewardId,
        agentName: recoverySteward.name,
        agentRole: 'steward',
        startedAt: createTimestamp(),
      };

      const metadataWithHistory = appendTaskSessionHistory(
        taskAfterUpdate?.metadata as Record<string, unknown> | undefined,
        sessionHistoryEntry
      );
      const finalMetadata = updateOrchestratorTaskMeta(
        metadataWithHistory,
        {
          assignedAgent: stewardId,
          sessionId: session.providerSessionId ?? session.id,
        }
      );
      await this.api.update<Task>(task.id, {
        assignee: stewardId,
        metadata: finalMetadata,
      });
    } catch (metadataError) {
      // Metadata update failed — terminate the steward session to prevent an
      // orphaned steward running without a proper task assignment. The task
      // retains its original worker assignment and can be retried on next poll.
      logger.error(
        `Failed to update task metadata after starting recovery steward session for ${task.id}. ` +
        `Terminating steward session to prevent orphan.`,
        metadataError
      );
      try {
        await this.sessionManager.stopSession(stewardId);
      } catch (stopError) {
        logger.error(
          `Failed to stop orphaned recovery steward session for ${recoverySteward.name}:`,
          stopError
        );
      }
      throw metadataError;
    }

    // 7. Callbacks and notifications
    if (this.config.onSessionStarted) {
      this.config.onSessionStarted(session, events, stewardId, initialPrompt);
    }

    if (this.poolService) {
      await this.poolService.onAgentSpawned(stewardId);
    }

    this.emitter.emit('agent:spawned', stewardId, worktreePath);
  }

  /**
   * Builds the initial prompt for a recovery steward session.
   * Includes the steward-recovery role prompt followed by task context,
   * session history, and resume count information.
   *
   * @param task - The stuck task
   * @param stewardId - The recovery steward's entity ID
   * @param taskMeta - The task's orchestrator metadata
   */
  private async buildRecoveryStewardPrompt(
    task: Task,
    stewardId: EntityId,
    taskMeta: import('../types/task-meta.js').OrchestratorTaskMeta | undefined
  ): Promise<string> {
    const parts: string[] = [];

    // Load the recovery steward role prompt, rendering template variables
    const roleResult = loadRolePrompt('steward', 'recovery' as StewardFocus, { projectRoot: this.config.projectRoot });
    if (roleResult) {
      const baseBranch = await this.getTargetBranch();
      const renderedPrompt = renderPromptTemplate(roleResult.prompt, { baseBranch });
      parts.push(
        'Please read and internalize the following operating instructions. These define your role and how you should behave:',
        '',
        renderedPrompt,
        '',
        '---',
        ''
      );
    }

    // Get the director ID for context
    const director = await this.agentRegistry.getDirector();
    const directorId = director?.id ?? 'unknown';

    const branch = taskMeta?.branch ?? taskMeta?.handoffBranch;
    const worktree = taskMeta?.worktree ?? taskMeta?.handoffWorktree;
    const resumeCount = taskMeta?.resumeCount ?? 0;

    parts.push(
      '## Recovery Assignment',
      '',
      `**Steward ID:** ${stewardId}`,
      `**Director ID:** ${directorId}`,
      `**Task ID:** ${task.id}`,
      `**Title:** ${task.title}`,
      `**Status:** ${task.status}`,
    );

    if (branch) {
      parts.push(`**Branch:** ${branch}`);
    }

    if (worktree) {
      parts.push(`**Worktree:** ${worktree}`);
    }

    if (task.priority !== undefined) {
      parts.push(`**Priority:** ${task.priority}`);
    }

    parts.push(
      '',
      '## Recovery Context',
      '',
      `This task has been resumed **${resumeCount} times** without a status change.`,
      'The previous worker session exited without calling `sf task complete` or `sf task handoff`.',
      'This indicates the worker may have crashed, lost context, or encountered an unrecoverable error.',
      '',
    );

    // Include session history if available
    if (taskMeta?.sessionHistory && taskMeta.sessionHistory.length > 0) {
      parts.push('### Session History', '');
      for (const entry of taskMeta.sessionHistory) {
        const ended = entry.endedAt ? ` → ${entry.endedAt}` : ' (may still be running)';
        parts.push(`- **${entry.agentRole}** ${entry.agentName} (${entry.sessionId}): ${entry.startedAt}${ended}`);
      }
      parts.push('');
    }

    // Fetch and include the description content
    if (task.descriptionRef) {
      try {
        const doc = await this.api.get<Document>(asElementId(task.descriptionRef));
        if (doc?.content) {
          parts.push('### Task Description', doc.content);
        }
      } catch {
        parts.push(`**Description Document:** ${task.descriptionRef}`);
      }
    }

    // Include acceptance criteria if any
    if (task.acceptanceCriteria) {
      parts.push('', '### Acceptance Criteria', task.acceptanceCriteria);
    }

    return parts.join('\n');
  }

  /**
   * Processes an inbox item for an agent.
   * Handles dispatch messages and delegates to role-specific processors.
   */
  private async processInboxItem(
    agent: AgentEntity,
    item: InboxItem,
    meta: WorkerMetadata | StewardMetadata | { agentRole: 'director' }
  ): Promise<boolean> {
    const agentId = asEntityId(agent.id);
    const activeSession = this.sessionManager.getActiveSession(agentId);

    // Get the message to check its type
    const message = await this.api.get<Message>(asElementId(item.messageId));
    if (!message) {
      // Message not found, mark as read and skip
      this.inboxService.markAsRead(item.id);
      return false;
    }

    const messageMetadata = message.metadata as Record<string, unknown> | undefined;
    const isDispatchMessage = messageMetadata?.type === 'task-dispatch' ||
      messageMetadata?.type === 'task-assignment' ||
      messageMetadata?.type === 'task-reassignment';

    // Handle based on agent role and session state
    if (meta.agentRole === 'worker' && (meta as WorkerMetadata).workerMode === 'ephemeral') {
      return this.processEphemeralWorkerMessage(agent, message, item, activeSession, isDispatchMessage);
    } else if (meta.agentRole === 'steward') {
      // Stewards use the same two-path model as ephemeral workers
      return this.processEphemeralWorkerMessage(agent, message, item, activeSession, isDispatchMessage);
    } else if (meta.agentRole === 'worker' && (meta as WorkerMetadata).workerMode === 'persistent') {
      return this.processPersistentAgentMessage(agent, message, item, activeSession);
    } else if (meta.agentRole === 'director') {
      if (this.config.directorInboxForwardingEnabled) {
        // Only forward if the user hasn't typed recently (debounce)
        if (activeSession) {
          const idleMs = this.sessionManager.getSessionUserIdleMs(agentId);
          // idleMs is undefined when no user input has been recorded yet — treat as idle
          if (idleMs !== undefined && idleMs < this.config.directorInboxIdleThresholdMs) {
            // User is actively typing — leave unread for next poll cycle
            return false;
          }
        }
        return this.processPersistentAgentMessage(agent, message, item, activeSession);
      }
      // Default: leave inbox items unread for manual sf inbox checks
      return false;
    }

    return false;
  }

  /**
   * Two-path model for ephemeral worker messages:
   * 1. Dispatch message → mark as read (task dispatch handled by pollWorkerAvailability)
   * 2. Non-dispatch message → leave unread if active session (don't forward/interrupt),
   *    or accumulate as deferred item for triage if idle
   *
   * Returns { processed: boolean, deferredItem?: ... } so pollInboxes can batch triage.
   */
  private async processEphemeralWorkerMessage(
    _agent: AgentEntity,
    _message: Message,
    item: InboxItem,
    activeSession: SessionRecord | undefined,
    isDispatchMessage: boolean
  ): Promise<boolean> {
    if (isDispatchMessage) {
      // Dispatch message → mark as read (spawn handled elsewhere)
      this.inboxService.markAsRead(item.id);
      return true;
    }

    // Non-dispatch message:
    if (activeSession) {
      // Agent is busy → leave message unread for next poll cycle
      // Do NOT forward to active session (keeps task-focused sessions uninterrupted)
      return false;
    }

    // Agent is idle → leave unread, will be picked up by triage batch
    // The caller (pollInboxes) accumulates these for processTriageBatch
    return false;
  }

  /**
   * Process message for persistent workers and directors.
   * - If in session -> forward as user input
   * - Otherwise -> leave for next session
   */
  private async processPersistentAgentMessage(
    agent: AgentEntity,
    message: Message,
    item: InboxItem,
    activeSession: SessionRecord | undefined
  ): Promise<boolean> {
    const agentId = asEntityId(agent.id);

    if (activeSession) {
      // Guard against duplicate forwarding:
      // If another concurrent pollInboxes() call is already processing this item,
      // skip it to prevent duplicate message delivery. The in-flight call will
      // mark it as read when done.
      if (this.forwardingInboxItems.has(item.id)) {
        return false;
      }

      // Mark as in-flight before the async operation
      this.forwardingInboxItems.add(item.id);

      try {
        // In session -> forward as user input
        const forwardedContent = await this.formatForwardedMessage(message);
        await this.sessionManager.messageSession(activeSession.id, {
          content: forwardedContent,
          senderId: message.sender,
        });

        this.inboxService.markAsRead(item.id);
        this.emitter.emit('message:forwarded', message.id, agentId);
        return true;
      } finally {
        // Always clean up the in-flight tracking, even on error
        this.forwardingInboxItems.delete(item.id);
      }
    }

    // No session -> leave message unread for next session
    return false;
  }

  /**
   * Processes deferred inbox items for idle agents by spawning triage sessions.
   *
   * Groups items by agentId then channelId. For each agent:
   * - Skips if agent now has an active session (messages stay unread for next cycle)
   * - Spawns triage session for the first channel group only (single-session constraint)
   * - Marks those items as read
   *
   * @returns Number of items processed
   */
  private async processTriageBatch(
    deferredItems: Map<string, { agent: AgentEntity; items: InboxItem[] }>
  ): Promise<number> {
    let processed = 0;

    for (const [agentId, { agent, items }] of deferredItems) {
      // Re-check: agent may have had a session started by task dispatch.
      // Known race: between this check and startSession() below, another poll
      // cycle could spawn a session for the same agent. If that happens,
      // startSession() fails, the error is caught, items stay unread, and
      // retry happens next cycle. This is acceptable — not a bug.
      const activeSession = this.sessionManager.getActiveSession(asEntityId(agentId));
      if (activeSession) {
        // Agent is now busy — leave messages unread for next cycle
        continue;
      }

      // Group items by channelId
      const byChannel = new Map<string, InboxItem[]>();
      for (const item of items) {
        const channelKey = String(item.channelId);
        if (!byChannel.has(channelKey)) {
          byChannel.set(channelKey, []);
        }
        byChannel.get(channelKey)!.push(item);
      }

      // Spawn triage for the first channel group only (single-session constraint)
      const [channelId, channelItems] = byChannel.entries().next().value as [string, InboxItem[]];

      try {
        await this.spawnTriageSession(agent, channelItems, channelId);

        // Count items as processed only after spawn succeeds. Items are
        // marked as read in spawnTriageSession's exit handler after the
        // triage session completes. If the session crashes, items stay
        // unread and retry next cycle.
        processed += channelItems.length;
      } catch (error) {
        logger.error(
          `Failed to spawn triage session for agent ${agent.name}:`,
          error
        );
      }

      // Only one triage session per poll cycle per agent — remaining channels
      // will be picked up in subsequent cycles
    }

    return processed;
  }

  /**
   * Spawns a triage session for an agent to process deferred messages.
   *
   * Creates a read-only worktree on the default branch, builds the triage prompt
   * with hydrated message contents, starts a headless session, and registers
   * worktree cleanup on session exit.
   */
  private async spawnTriageSession(
    agent: AgentEntity,
    items: InboxItem[],
    channelId: string
  ): Promise<void> {
    const agentId = asEntityId(agent.id);

    // Rate limit guard: skip triage when all executables are rate-limited.
    // Items stay unread and retry next cycle when limits expire.
    const executableCheck = this.resolveExecutableWithFallback(agent);
    if (executableCheck === 'all_limited') {
      logger.debug(
        `All executables rate-limited, skipping triage session for ${agent.name}`
      );
      return;
    }

    // Create a read-only worktree (detached HEAD on default branch).
    // The path is deterministic ({agentName}-triage), so a stale worktree
    // from a previous crash would cause WORKTREE_EXISTS. Handle by removing
    // the stale worktree and retrying once.
    let worktreeResult: CreateWorktreeResult;
    try {
      worktreeResult = await this.worktreeManager.createReadOnlyWorktree({
        agentName: agent.name,
        purpose: 'triage',
      });
    } catch (error: unknown) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === 'WORKTREE_EXISTS') {
        // Remove stale worktree from a previous crash and retry.
        // Path must match the relative path used by createReadOnlyWorktree.
        try {
          await this.worktreeManager.removeWorktree(
            `.stoneforge/.worktrees/${agent.name}-triage`,
            { force: true }
          );
        } catch {
          // Ignore removal errors
        }
        worktreeResult = await this.worktreeManager.createReadOnlyWorktree({
          agentName: agent.name,
          purpose: 'triage',
        });
      } else {
        throw error;
      }
    }

    // Fetch messages and build the triage prompt
    // Pair each message with its inbox item ID for the triage prompt
    const triageItems: Array<{ message: Message; inboxItemId: string }> = [];
    for (const item of items) {
      const message = await this.api.get<Message>(asElementId(item.messageId));
      if (message) {
        triageItems.push({ message, inboxItemId: item.id });
      }
    }

    // All message fetches failed — nothing to triage; clean up worktree
    if (triageItems.length === 0) {
      try {
        await this.worktreeManager.removeWorktree(worktreeResult.path);
      } catch {
        // Ignore cleanup errors
      }
      return;
    }

    const initialPrompt = await this.buildTriagePrompt(agent, triageItems, channelId);

    // Start a headless session in the read-only worktree
    const { session, events } = await this.sessionManager.startSession(agentId, {
      workingDirectory: worktreeResult.path,
      worktree: worktreeResult.path,
      initialPrompt,
      interactive: false,
    });

    // Call the onSessionStarted callback if provided
    if (this.config.onSessionStarted) {
      this.config.onSessionStarted(session, events, agentId, initialPrompt);
    }

    // On session exit: mark triage items as read and clean up worktree.
    // Items stay unread if the session crashes, so they retry next cycle.
    // Use .once() since a session only exits once; bump maxListeners to avoid false warning.
    events.setMaxListeners(events.getMaxListeners() + 1);
    events.once('exit', async () => {
      // Mark triage items as read. Use batch for efficiency.
      // Errors are non-fatal — items stay unread and retry next cycle.
      try {
        this.inboxService.markAsReadBatch(items.map((item) => item.id));
      } catch (error) {
        logger.warn('Failed to mark triage items as read:', error);
      }

      try {
        await this.worktreeManager.removeWorktree(worktreeResult.path);
      } catch {
        // Ignore cleanup errors — worktree may already be removed
      }
    });

    this.emitter.emit('agent:triage-spawned', agentId, channelId, worktreeResult.path);
  }

  /**
   * Builds the triage prompt by loading the message-triage template and
   * hydrating it with the actual message contents.
   */
  private async buildTriagePrompt(
    agent: AgentEntity,
    triageItems: Array<{ message: Message; inboxItemId: string }>,
    channelId: string
  ): Promise<string> {
    // Load the triage prompt template
    const triageResult = loadTriagePrompt({ projectRoot: this.config.projectRoot });
    if (!triageResult) {
      throw new Error('Failed to load message-triage prompt template');
    }

    // Hydrate each message's content
    const formattedMessages: string[] = [];
    for (const { message, inboxItemId } of triageItems) {
      const senderId = message.sender ?? 'unknown';
      const timestamp = message.createdAt ?? 'unknown';

      // Fetch content document if contentRef is available
      let content = '[No content available]';
      if (message.contentRef) {
        try {
          const doc = await this.api.get<Document>(asElementId(message.contentRef));
          if (doc?.content) {
            content = doc.content;
          }
        } catch (error) {
          logger.warn(`Failed to fetch content for message ${message.id}:`, error);
        }
      }

      formattedMessages.push(
        `--- Inbox Item ID: ${inboxItemId} | Message ID: ${message.id} | From: ${senderId} | At: ${timestamp} ---`,
        content,
        ''
      );
    }

    // Replace the {{MESSAGES}} placeholder with hydrated content
    const messagesBlock = formattedMessages.join('\n');
    const prompt = triageResult.prompt.replace('{{MESSAGES}}', messagesBlock);

    // Get the director ID for context
    const director = await this.agentRegistry.getDirector();
    const directorId = director?.id ?? 'unknown';

    return `${prompt}\n\n---\n\n**Worker ID:** ${agent.id}\n**Director ID:** ${directorId}\n**Channel:** ${channelId}\n**Agent:** ${agent.name}\n**Message count:** ${triageItems.length}`;
  }

  /**
   * Formats a message for forwarding to an agent session.
   * Fetches document content from contentRef to provide actual message text.
   */
  private async formatForwardedMessage(message: Message): Promise<string> {
    let content = '[No content available]';
    if (message.contentRef) {
      try {
        const doc = await this.api.get<Document>(asElementId(message.contentRef));
        if (doc?.content) {
          content = doc.content;
        }
      } catch (error) {
        logger.warn(`Failed to fetch content for forwarded message ${message.id}:`, error);
      }
    }
    return content; // No prefix — messageSession() handles the [Message from ...] prefix
  }

  /**
   * Syncs a task's branch with the main branch before steward review.
   *
   * This ensures that when a merge steward reviews a PR, the diff against
   * master only shows the task's actual changes (not other merged work).
   *
   * @param task - The task to sync
   * @returns SyncResult with success/conflicts/error status
   */
  private async syncTaskBranch(task: Task): Promise<SyncResult> {
    const taskMeta = task.metadata as Record<string, unknown> | undefined;
    const orchestratorMeta = taskMeta?.orchestrator as Record<string, unknown> | undefined;
    const worktreePath = orchestratorMeta?.worktree as string | undefined;
    const branch = orchestratorMeta?.branch as string | undefined;

    // Check for worktree path
    if (!worktreePath) {
      return {
        success: false,
        error: 'No worktree path found in task metadata',
        message: 'Task has no worktree path - cannot sync',
      };
    }

    // Verify worktree exists
    const worktreeExists = await this.worktreeManager.worktreeExists(worktreePath);
    if (!worktreeExists) {
      return {
        success: false,
        error: `Worktree does not exist: ${worktreePath}`,
        message: `Worktree not found at ${worktreePath}`,
        worktreePath,
        branch,
      };
    }

    // Import node modules for git operations
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const path = await import('node:path');
    const execFileAsync = promisify(execFile);

    // Resolve full worktree path
    const workspaceRoot = this.worktreeManager.getWorkspaceRoot();
    const fullWorktreePath = path.isAbsolute(worktreePath)
      ? worktreePath
      : path.join(workspaceRoot, worktreePath);

    // Fetch from origin
    try {
      await execFileAsync('git', ['fetch', 'origin'], {
        cwd: fullWorktreePath,
        encoding: 'utf8',
        timeout: 60_000,
      });
    } catch (fetchError) {
      return {
        success: false,
        error: `Failed to fetch from origin: ${(fetchError as Error).message}`,
        message: 'Git fetch failed',
        worktreePath,
        branch,
      };
    }

    // Get default branch
    const defaultBranch = await this.worktreeManager.getDefaultBranch();
    const remoteBranch = `origin/${defaultBranch}`;

    // Attempt to merge
    try {
      await execFileAsync('git', ['merge', remoteBranch, '--no-edit'], {
        cwd: fullWorktreePath,
        encoding: 'utf8',
        timeout: 120_000,
      });

      // Merge succeeded
      logger.debug(`Synced task ${task.id} branch with ${remoteBranch}`);
      return {
        success: true,
        message: `Branch synced with ${remoteBranch}`,
        worktreePath,
        branch,
      };
    } catch (mergeError) {
      // Check for merge conflicts
      try {
        const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: fullWorktreePath,
          encoding: 'utf8',
        });

        // Parse conflicted files (UU, AA, DD, AU, UA, DU, UD)
        const conflictPatterns = /^(UU|AA|DD|AU|UA|DU|UD)\s+(.+)$/gm;
        const conflicts: string[] = [];
        let match;
        while ((match = conflictPatterns.exec(statusOutput)) !== null) {
          conflicts.push(match[2]);
        }

        if (conflicts.length > 0) {
          logger.debug(`Merge conflicts detected for task ${task.id}: ${conflicts.join(', ')}`);
          return {
            success: false,
            conflicts,
            message: `Merge conflicts detected in ${conflicts.length} file(s)`,
            worktreePath,
            branch,
          };
        }

        // Some other merge error
        return {
          success: false,
          error: (mergeError as Error).message,
          message: 'Merge failed (not due to conflicts)',
          worktreePath,
          branch,
        };
      } catch {
        return {
          success: false,
          error: (mergeError as Error).message,
          message: 'Merge failed',
          worktreePath,
          branch,
        };
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a DispatchDaemon instance
 */
export function createDispatchDaemon(
  api: QuarryAPI,
  agentRegistry: AgentRegistry,
  sessionManager: SessionManager,
  dispatchService: DispatchService,
  worktreeManager: WorktreeManager,
  taskAssignment: TaskAssignmentService,
  stewardScheduler: StewardScheduler,
  inboxService: InboxService,
  config?: DispatchDaemonConfig,
  poolService?: AgentPoolService,
  settingsService?: SettingsService
): DispatchDaemon {
  return new DispatchDaemonImpl(
    api,
    agentRegistry,
    sessionManager,
    dispatchService,
    worktreeManager,
    taskAssignment,
    stewardScheduler,
    inboxService,
    config,
    poolService,
    settingsService
  );
}
