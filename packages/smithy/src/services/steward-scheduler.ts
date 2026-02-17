/**
 * Steward Scheduler Service
 *
 * This service executes stewards on schedule (cron) or in response to events.
 * It manages the lifecycle of scheduled steward executions and tracks execution history.
 *
 * Key features:
 * - Cron-based scheduling using node-cron
 * - Event-driven triggers with condition evaluation
 * - Execution history tracking
 * - Graceful shutdown support
 *
 * TB-O23: Steward Scheduler Service
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type {
  EntityId,
  Timestamp,
} from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';

import type {
  StewardTrigger,
  CronTrigger,
  EventTrigger,
  StewardMetadata,
  StewardFocus,
} from '../types/index.js';
import {
  isCronTrigger,
  isEventTrigger,
} from '../types/index.js';
import type { SessionManager } from '../runtime/session-manager.js';
import { loadRolePrompt } from '../prompts/index.js';
import type { AgentRegistry, AgentEntity } from './agent-registry.js';
import { getAgentMetadata } from './agent-registry.js';
import type { MergeStewardService } from './merge-steward-service.js';
import type { DocsStewardService } from './docs-steward-service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a steward execution
 */
export interface StewardExecutionResult {
  /** Whether the execution succeeded */
  readonly success: boolean;
  /** Error message if execution failed */
  readonly error?: string;
  /** Output from the steward (summary or relevant data) */
  readonly output?: string;
  /** Duration of execution in ms */
  readonly durationMs: number;
  /** Items processed (if applicable) */
  readonly itemsProcessed?: number;
}

/**
 * Entry in the execution history
 */
export interface StewardExecutionEntry {
  /** Unique execution ID */
  readonly executionId: string;
  /** The steward entity ID */
  readonly stewardId: EntityId;
  /** Steward name for convenience */
  readonly stewardName: string;
  /** The trigger that caused the execution */
  readonly trigger: StewardTrigger;
  /** Whether this was a manual execution */
  readonly manual: boolean;
  /** Timestamp when execution started */
  readonly startedAt: Timestamp;
  /** Timestamp when execution completed */
  readonly completedAt?: Timestamp;
  /** Execution result (set when completed) */
  readonly result?: StewardExecutionResult;
  /** Event context if triggered by event */
  readonly eventContext?: Record<string, unknown>;
}

/**
 * Filter options for querying execution history
 */
export interface ExecutionHistoryFilter {
  /** Filter by steward ID */
  readonly stewardId?: EntityId;
  /** Filter by trigger type */
  readonly triggerType?: 'cron' | 'event';
  /** Filter by success/failure */
  readonly success?: boolean;
  /** Filter by date range (start) */
  readonly startedAfter?: Timestamp;
  /** Filter by date range (end) */
  readonly startedBefore?: Timestamp;
  /** Maximum number of entries to return */
  readonly limit?: number;
}

/**
 * Configuration for the scheduler
 */
export interface StewardSchedulerConfig {
  /** Maximum execution history entries to keep per steward */
  readonly maxHistoryPerSteward?: number;
  /** Default timeout for steward execution in ms */
  readonly defaultTimeoutMs?: number;
  /** Whether to start scheduled stewards immediately */
  readonly startImmediately?: boolean;
}

/**
 * Information about a scheduled job
 */
export interface ScheduledJobInfo {
  /** The steward entity ID */
  readonly stewardId: EntityId;
  /** Steward name */
  readonly stewardName: string;
  /** The cron trigger */
  readonly trigger: CronTrigger;
  /** Whether the job is currently running */
  readonly isRunning: boolean;
  /** Next scheduled execution time (if available) */
  readonly nextRunAt?: Date;
  /** Last execution time */
  readonly lastRunAt?: Timestamp;
}

/**
 * Event subscription info
 */
export interface EventSubscriptionInfo {
  /** The steward entity ID */
  readonly stewardId: EntityId;
  /** Steward name */
  readonly stewardName: string;
  /** The event trigger */
  readonly trigger: EventTrigger;
  /** Whether currently listening */
  readonly isActive: boolean;
}

/**
 * Steward execution function type
 * This is what actually runs the steward's logic
 */
export type StewardExecutor = (
  steward: AgentEntity,
  context: {
    trigger: StewardTrigger;
    eventContext?: Record<string, unknown>;
  }
) => Promise<StewardExecutionResult>;

// ============================================================================
// Steward Scheduler Interface
// ============================================================================

/**
 * Steward Scheduler Service interface for executing stewards on schedule or events.
 *
 * The service provides methods for:
 * - Starting/stopping scheduled executions
 * - Publishing events for event-triggered stewards
 * - Manual steward execution
 * - Execution history queries
 */
export interface StewardScheduler {
  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  /**
   * Starts the scheduler, activating all cron jobs and event listeners
   * for registered stewards.
   */
  start(): Promise<void>;

  /**
   * Stops the scheduler, cleaning up all cron jobs and event listeners.
   * Running executions are allowed to complete.
   */
  stop(): Promise<void>;

  /**
   * Whether the scheduler is currently running
   */
  isRunning(): boolean;

  // ----------------------------------------
  // Steward Management
  // ----------------------------------------

  /**
   * Registers a steward with the scheduler.
   * This sets up cron jobs and event subscriptions based on the steward's triggers.
   *
   * @param stewardId - The steward entity ID
   * @returns True if registered successfully
   */
  registerSteward(stewardId: EntityId): Promise<boolean>;

  /**
   * Unregisters a steward from the scheduler.
   * This removes cron jobs and event subscriptions.
   *
   * @param stewardId - The steward entity ID
   * @returns True if unregistered successfully
   */
  unregisterSteward(stewardId: EntityId): Promise<boolean>;

  /**
   * Refreshes a steward's registration (useful if triggers changed).
   *
   * @param stewardId - The steward entity ID
   */
  refreshSteward(stewardId: EntityId): Promise<void>;

  /**
   * Registers all stewards from the agent registry.
   */
  registerAllStewards(): Promise<number>;

  // ----------------------------------------
  // Manual Execution
  // ----------------------------------------

  /**
   * Manually triggers a steward execution.
   *
   * @param stewardId - The steward to execute
   * @param context - Optional context data
   * @returns The execution result
   */
  executeSteward(
    stewardId: EntityId,
    context?: Record<string, unknown>
  ): Promise<StewardExecutionResult>;

  // ----------------------------------------
  // Event Publishing
  // ----------------------------------------

  /**
   * Publishes an event that may trigger stewards.
   * Stewards with matching event triggers will be executed.
   *
   * @param eventName - The event name (e.g., 'task_completed')
   * @param eventData - Event data for condition evaluation
   * @returns Number of stewards triggered
   */
  publishEvent(
    eventName: string,
    eventData: Record<string, unknown>
  ): Promise<number>;

  // ----------------------------------------
  // Status & Queries
  // ----------------------------------------

  /**
   * Gets scheduled job information for a steward.
   */
  getScheduledJobs(stewardId?: EntityId): ScheduledJobInfo[];

  /**
   * Gets event subscription information.
   */
  getEventSubscriptions(stewardId?: EntityId): EventSubscriptionInfo[];

  /**
   * Gets execution history.
   */
  getExecutionHistory(filter?: ExecutionHistoryFilter): StewardExecutionEntry[];

  /**
   * Gets the last execution for a steward.
   */
  getLastExecution(stewardId: EntityId): StewardExecutionEntry | undefined;

  /**
   * Gets statistics about steward executions.
   */
  getStats(): StewardSchedulerStats;

  // ----------------------------------------
  // Events
  // ----------------------------------------

  /**
   * Subscribe to scheduler events.
   */
  on(event: 'execution:started', listener: (entry: StewardExecutionEntry) => void): void;
  on(event: 'execution:completed', listener: (entry: StewardExecutionEntry) => void): void;
  on(event: 'execution:failed', listener: (entry: StewardExecutionEntry) => void): void;
  on(event: 'steward:registered', listener: (stewardId: EntityId) => void): void;
  on(event: 'steward:unregistered', listener: (stewardId: EntityId) => void): void;

  /**
   * Unsubscribe from scheduler events.
   */
  off(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Statistics about steward executions
 */
export interface StewardSchedulerStats {
  /** Number of registered stewards */
  readonly registeredStewards: number;
  /** Number of active cron jobs */
  readonly activeCronJobs: number;
  /** Number of active event subscriptions */
  readonly activeEventSubscriptions: number;
  /** Total executions */
  readonly totalExecutions: number;
  /** Successful executions */
  readonly successfulExecutions: number;
  /** Failed executions */
  readonly failedExecutions: number;
  /** Currently running executions */
  readonly runningExecutions: number;
}

// ============================================================================
// Cron Schedule Utilities
// ============================================================================

/**
 * Validates a cron expression.
 * This is a basic validation - we check the format but not all edge cases.
 */
export function isValidCronExpression(schedule: string): boolean {
  // Standard cron format: * * * * * (minute hour day month weekday)
  // Extended format with seconds: * * * * * * (second minute hour day month weekday)
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }

  // Basic validation: each part should be a valid cron field
  const cronFieldPattern = /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?$/;
  return parts.every(part => cronFieldPattern.test(part) || part === '*');
}

/**
 * Calculates the next run time for a cron expression.
 * This is a simplified implementation - for production use node-cron handles this.
 */
export function getNextCronRunTime(_schedule: string): Date | undefined {
  // This is a placeholder - node-cron provides this via the scheduled task
  // For now we return undefined; actual implementation uses node-cron internals
  return undefined;
}

// ============================================================================
// Condition Evaluation
// ============================================================================

/**
 * Validates that a condition string contains only safe expression tokens.
 * Allows: property access, comparisons, string/number literals, booleans,
 * logical operators, parentheses.
 * Rejects: function calls, assignments, semicolons, template literals,
 * dangerous globals.
 */
function isSafeCondition(condition: string): boolean {
  // Strip string literals so their contents don't trigger false positives
  const withoutStrings = condition
    .replace(/'[^']*'/g, '""')
    .replace(/"[^"]*"/g, '""');

  // Reject dangerous patterns
  const dangerousPatterns = [
    /[;{}]/,                          // statements, blocks
    /\b(import|require|eval|Function|constructor|__proto__|prototype)\b/,
    /\b(process|global|globalThis|window|document)\b/,
    /\b(setTimeout|setInterval|fetch|XMLHttpRequest)\b/,
    /=>|\.\.\.|\+\+|--/,             // arrow functions, spread, increment/decrement
    /\[.*\]/,                         // bracket notation (property access escape vector)
    /`/,                              // template literals
    /\$\{/,                           // template expressions
    /\bthis\b/,                       // this reference
    /\bnew\b/,                        // constructor calls
    /\bdelete\b/,                     // delete operator
    /\bvoid\b/,                       // void operator
    /\btypeof\b/,                     // typeof operator
    /\bin\b/,                         // in operator
    /\binstanceof\b/,                 // instanceof operator
    /[^=!<>]=[^=]/,                   // assignment (but not ==, !=, <=, >=)
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(withoutStrings)) {
      return false;
    }
  }

  // Only allow safe characters after string removal
  const safeTokenPattern = /^[\w\s.$?!&|><=()'",-]+$/;
  if (!safeTokenPattern.test(withoutStrings)) {
    return false;
  }

  // Reject function calls: identifier followed by (
  if (/\w\s*\(/.test(withoutStrings)) {
    return false;
  }

  return true;
}

/**
 * Evaluates a simple condition expression against event data.
 * Supports basic JavaScript-like expressions with property access.
 *
 * Examples:
 * - "task.status === 'closed'"
 * - "task.assignedAgent?.role === 'worker'"
 * - "branch.tests === 'passing'"
 */
export function evaluateCondition(
  condition: string,
  context: Record<string, unknown>
): boolean {
  try {
    // Validate condition contains only safe expression tokens
    if (!isSafeCondition(condition)) {
      return false;
    }

    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    const fn = new Function(
      ...contextKeys,
      `"use strict"; try { return Boolean(${condition}); } catch { return false; }`
    );

    return fn(...contextValues);
  } catch {
    return false;
  }
}

// ============================================================================
// Steward Scheduler Implementation
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<StewardSchedulerConfig> = {
  maxHistoryPerSteward: 100,
  defaultTimeoutMs: 5 * 60 * 1000, // 5 minutes
  startImmediately: false,
};

/**
 * Internal state for a scheduled cron job
 */
interface CronJobState {
  stewardId: EntityId;
  stewardName: string;
  trigger: CronTrigger;
  // We use a simple interval-based approach for now
  // A proper implementation would use node-cron
  intervalId?: ReturnType<typeof setInterval>;
  lastRunAt?: Timestamp;
  nextRunAt?: Date;
  isRunning: boolean;
}

/**
 * Internal state for an event subscription
 */
interface EventSubscriptionState {
  stewardId: EntityId;
  stewardName: string;
  trigger: EventTrigger;
  isActive: boolean;
}

/**
 * Implementation of the Steward Scheduler Service.
 */
export class StewardSchedulerImpl implements StewardScheduler {
  private readonly agentRegistry: AgentRegistry;
  private readonly config: Required<StewardSchedulerConfig>;
  private readonly executor: StewardExecutor;
  private readonly emitter: EventEmitter;

  private running = false;
  private cronJobs: Map<string, CronJobState> = new Map(); // key: stewardId-triggerIndex
  private eventSubscriptions: Map<string, EventSubscriptionState[]> = new Map(); // key: eventName
  private executionHistory: StewardExecutionEntry[] = [];
  private runningExecutions: Set<string> = new Set();
  private executionCounter = 0;

  constructor(
    agentRegistry: AgentRegistry,
    executor: StewardExecutor,
    config: StewardSchedulerConfig = {}
  ) {
    this.agentRegistry = agentRegistry;
    this.executor = executor;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = new EventEmitter();
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    // Start all registered cron jobs
    for (const job of this.cronJobs.values()) {
      this.startCronJob(job);
    }

    // Activate all event subscriptions
    for (const subs of this.eventSubscriptions.values()) {
      for (const sub of subs) {
        sub.isActive = true;
      }
    }

    // Register all stewards if configured to do so
    if (this.config.startImmediately) {
      await this.registerAllStewards();
    }

    console.log(`[steward-scheduler] Started with ${this.cronJobs.size} cron job(s) and ${[...this.eventSubscriptions.values()].flat().length} event subscription(s)`);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop all cron jobs
    for (const job of this.cronJobs.values()) {
      this.stopCronJob(job);
    }

    // Deactivate event subscriptions
    for (const subs of this.eventSubscriptions.values()) {
      for (const sub of subs) {
        sub.isActive = false;
      }
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ----------------------------------------
  // Steward Management
  // ----------------------------------------

  async registerSteward(stewardId: EntityId): Promise<boolean> {
    const agent = await this.agentRegistry.getAgent(stewardId);
    if (!agent) {
      return false;
    }

    const metadata = getAgentMetadata(agent);
    if (!metadata || metadata.agentRole !== 'steward') {
      return false;
    }

    const stewardMeta = metadata as StewardMetadata;
    const triggers = stewardMeta.triggers ?? [];

    // Remove existing registrations for this steward
    await this.unregisterSteward(stewardId);

    // Register each trigger
    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i];

      if (isCronTrigger(trigger)) {
        const jobKey = `${stewardId}-${i}`;
        const jobState: CronJobState = {
          stewardId,
          stewardName: agent.name,
          trigger,
          isRunning: false,
        };
        this.cronJobs.set(jobKey, jobState);

        // Start job if scheduler is running
        if (this.running) {
          this.startCronJob(jobState);
        }
      } else if (isEventTrigger(trigger)) {
        const eventName = trigger.event;
        if (!this.eventSubscriptions.has(eventName)) {
          this.eventSubscriptions.set(eventName, []);
        }
        this.eventSubscriptions.get(eventName)!.push({
          stewardId,
          stewardName: agent.name,
          trigger,
          isActive: this.running,
        });
      }
    }

    const cronCount = triggers.filter(t => isCronTrigger(t)).length;
    const eventCount = triggers.filter(t => isEventTrigger(t)).length;
    console.log(`[steward-scheduler] Registered steward '${agent.name}' (${stewardId}) with ${cronCount} cron trigger(s) and ${eventCount} event trigger(s)`);

    this.emitter.emit('steward:registered', stewardId);
    return true;
  }

  async unregisterSteward(stewardId: EntityId): Promise<boolean> {
    let unregistered = false;

    // Remove cron jobs
    for (const [key, job] of this.cronJobs.entries()) {
      if (job.stewardId === stewardId) {
        this.stopCronJob(job);
        this.cronJobs.delete(key);
        unregistered = true;
      }
    }

    // Remove event subscriptions
    for (const [eventName, subs] of this.eventSubscriptions.entries()) {
      const remaining = subs.filter(s => s.stewardId !== stewardId);
      if (remaining.length !== subs.length) {
        unregistered = true;
      }
      if (remaining.length === 0) {
        this.eventSubscriptions.delete(eventName);
      } else {
        this.eventSubscriptions.set(eventName, remaining);
      }
    }

    if (unregistered) {
      this.emitter.emit('steward:unregistered', stewardId);
    }

    return unregistered;
  }

  async refreshSteward(stewardId: EntityId): Promise<void> {
    await this.unregisterSteward(stewardId);
    await this.registerSteward(stewardId);
  }

  async registerAllStewards(): Promise<number> {
    const stewards = await this.agentRegistry.getStewards();
    let registered = 0;

    for (const steward of stewards) {
      const success = await this.registerSteward(steward.id as unknown as EntityId);
      if (success) {
        registered++;
      }
    }

    console.log(`[steward-scheduler] Registered ${registered}/${stewards.length} steward(s)`);
    return registered;
  }

  // ----------------------------------------
  // Manual Execution
  // ----------------------------------------

  async executeSteward(
    stewardId: EntityId,
    context?: Record<string, unknown>
  ): Promise<StewardExecutionResult> {
    const agent = await this.agentRegistry.getAgent(stewardId);
    if (!agent) {
      return {
        success: false,
        error: `Steward not found: ${stewardId}`,
        durationMs: 0,
      };
    }

    const metadata = getAgentMetadata(agent);
    if (!metadata || metadata.agentRole !== 'steward') {
      return {
        success: false,
        error: `Entity is not a steward: ${stewardId}`,
        durationMs: 0,
      };
    }

    // Create a manual trigger
    const manualTrigger: EventTrigger = {
      type: 'event',
      event: 'manual',
    };

    return this.runExecution(agent, manualTrigger, true, context);
  }

  // ----------------------------------------
  // Event Publishing
  // ----------------------------------------

  async publishEvent(
    eventName: string,
    eventData: Record<string, unknown>
  ): Promise<number> {
    if (!this.running) {
      return 0;
    }

    const subscriptions = this.eventSubscriptions.get(eventName) ?? [];
    let triggered = 0;

    for (const sub of subscriptions) {
      if (!sub.isActive) {
        continue;
      }

      // Check condition if present
      if (sub.trigger.condition) {
        const matches = evaluateCondition(sub.trigger.condition, eventData);
        if (!matches) {
          continue;
        }
      }

      // Execute the steward
      const agent = await this.agentRegistry.getAgent(sub.stewardId);
      if (agent) {
        // Run execution asynchronously
        this.runExecution(agent, sub.trigger, false, eventData).catch((error) => {
          console.error(`[steward-scheduler] Event-triggered execution failed for steward '${sub.stewardName}':`, error);
        });
        triggered++;
      }
    }

    return triggered;
  }

  // ----------------------------------------
  // Status & Queries
  // ----------------------------------------

  getScheduledJobs(stewardId?: EntityId): ScheduledJobInfo[] {
    const jobs: ScheduledJobInfo[] = [];

    for (const job of this.cronJobs.values()) {
      if (stewardId && job.stewardId !== stewardId) {
        continue;
      }

      jobs.push({
        stewardId: job.stewardId,
        stewardName: job.stewardName,
        trigger: job.trigger,
        isRunning: job.isRunning,
        nextRunAt: job.nextRunAt,
        lastRunAt: job.lastRunAt,
      });
    }

    return jobs;
  }

  getEventSubscriptions(stewardId?: EntityId): EventSubscriptionInfo[] {
    const subscriptions: EventSubscriptionInfo[] = [];

    for (const subs of this.eventSubscriptions.values()) {
      for (const sub of subs) {
        if (stewardId && sub.stewardId !== stewardId) {
          continue;
        }

        subscriptions.push({
          stewardId: sub.stewardId,
          stewardName: sub.stewardName,
          trigger: sub.trigger,
          isActive: sub.isActive,
        });
      }
    }

    return subscriptions;
  }

  getExecutionHistory(filter?: ExecutionHistoryFilter): StewardExecutionEntry[] {
    let entries = [...this.executionHistory];

    if (filter) {
      if (filter.stewardId) {
        entries = entries.filter(e => e.stewardId === filter.stewardId);
      }
      if (filter.triggerType) {
        entries = entries.filter(e => e.trigger.type === filter.triggerType);
      }
      if (filter.success !== undefined) {
        entries = entries.filter(e => e.result?.success === filter.success);
      }
      if (filter.startedAfter) {
        entries = entries.filter(e => e.startedAt >= filter.startedAfter!);
      }
      if (filter.startedBefore) {
        entries = entries.filter(e => e.startedAt <= filter.startedBefore!);
      }
    }

    // Sort by startedAt descending
    entries.sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  getLastExecution(stewardId: EntityId): StewardExecutionEntry | undefined {
    const entries = this.getExecutionHistory({ stewardId, limit: 1 });
    return entries[0];
  }

  getStats(): StewardSchedulerStats {
    const registeredStewards = new Set<EntityId>();

    for (const job of this.cronJobs.values()) {
      registeredStewards.add(job.stewardId);
    }
    for (const subs of this.eventSubscriptions.values()) {
      for (const sub of subs) {
        registeredStewards.add(sub.stewardId);
      }
    }

    const successfulExecutions = this.executionHistory.filter(
      e => e.result?.success === true
    ).length;
    const failedExecutions = this.executionHistory.filter(
      e => e.result?.success === false
    ).length;

    return {
      registeredStewards: registeredStewards.size,
      activeCronJobs: this.cronJobs.size,
      activeEventSubscriptions: [...this.eventSubscriptions.values()].flat().length,
      totalExecutions: this.executionHistory.length,
      successfulExecutions,
      failedExecutions,
      runningExecutions: this.runningExecutions.size,
    };
  }

  // ----------------------------------------
  // Events
  // ----------------------------------------

  on(event: 'execution:started', listener: (entry: StewardExecutionEntry) => void): void;
  on(event: 'execution:completed', listener: (entry: StewardExecutionEntry) => void): void;
  on(event: 'execution:failed', listener: (entry: StewardExecutionEntry) => void): void;
  on(event: 'steward:registered', listener: (stewardId: EntityId) => void): void;
  on(event: 'steward:unregistered', listener: (stewardId: EntityId) => void): void;
  on(
    event: 'execution:started' | 'execution:completed' | 'execution:failed' | 'steward:registered' | 'steward:unregistered',
    listener: ((entry: StewardExecutionEntry) => void) | ((stewardId: EntityId) => void)
  ): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private startCronJob(job: CronJobState): void {
    if (job.intervalId) {
      return; // Already running
    }
    this.scheduleNextRun(job);
  }

  private scheduleNextRun(job: CronJobState): void {
    const nextTime = this.getNextCronTime(job.trigger.schedule);
    if (!nextTime) {
      console.warn(`[steward-scheduler] Failed to compute next run time for steward '${job.stewardName}' with schedule '${job.trigger.schedule}'`);
      return;
    }

    job.nextRunAt = nextTime;
    const delayMs = Math.max(0, nextTime.getTime() - Date.now());

    console.log(`[steward-scheduler] Scheduled next run for steward '${job.stewardName}' at ${nextTime.toISOString()} (in ${Math.round(delayMs / 1000)}s)`);

    job.intervalId = setTimeout(async () => {
      try {
        if (!this.running) return;
        if (job.isRunning) {
          console.warn(`[steward-scheduler] Skipping overlapping execution for steward '${job.stewardName}'`);
          return; // finally block will schedule the next run
        }

        console.log(`[steward-scheduler] Cron firing for steward '${job.stewardName}' (schedule: ${job.trigger.schedule})`);

        const agent = await this.agentRegistry.getAgent(job.stewardId);
        if (!agent) {
          console.warn(`[steward-scheduler] Agent not found for steward '${job.stewardId}', skipping cron execution`);
        }
        if (agent && this.running) {
          const result = await this.runExecution(agent, job.trigger, false);
          job.lastRunAt = createTimestamp();
          console.log(`[steward-scheduler] Cron execution completed for steward '${job.stewardName}': success=${result.success}${result.error ? `, error=${result.error}` : ''}`);
        }
      } catch (error) {
        console.error(`[steward-scheduler] Unhandled error in cron callback for steward '${job.stewardName}':`, error);
      } finally {
        if (this.running) {
          job.intervalId = undefined;
          this.scheduleNextRun(job);
        }
      }
    }, delayMs) as unknown as ReturnType<typeof setInterval>;
  }

  private stopCronJob(job: CronJobState): void {
    if (job.intervalId) {
      clearTimeout(job.intervalId as unknown as ReturnType<typeof setTimeout>);
      job.intervalId = undefined;
    }
  }

  /**
   * Calculates the next fire time for a cron expression after the given date.
   * Supports 5-field cron (minute hour dom month dow) with optional 6th seconds field (ignored).
   * Supports: *, specific values, step (* /N), range (N-M), and lists (N,M).
   * Returns null for invalid expressions.
   */
  getNextCronTime(schedule: string, after?: Date): Date | null {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      return null;
    }

    // If 6 fields, ignore the first (seconds) field
    const fields = parts.length === 6 ? parts.slice(1) : parts;
    const [minuteField, hourField, domField, monthField, dowField] = fields;

    // Parse each field into a set of allowed values
    const minutes = this.parseCronField(minuteField, 0, 59);
    const hours = this.parseCronField(hourField, 0, 23);
    const doms = this.parseCronField(domField, 1, 31);
    const months = this.parseCronField(monthField, 1, 12);
    const dows = this.parseCronField(dowField, 0, 6); // 0=Sunday

    if (!minutes || !hours || !doms || !months || !dows) {
      return null;
    }

    // Start from the next minute after 'after'
    const start = after ? new Date(after) : new Date();
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    // Iterate forward up to 366 days to find the next matching time
    const maxIterations = 366 * 24 * 60; // worst case: check every minute for a year
    const candidate = new Date(start);

    for (let i = 0; i < maxIterations; i++) {
      const month = candidate.getMonth() + 1; // 1-12
      const dom = candidate.getDate();
      const dow = candidate.getDay(); // 0=Sunday
      const hour = candidate.getHours();
      const minute = candidate.getMinutes();

      if (
        months.has(month) &&
        doms.has(dom) &&
        dows.has(dow) &&
        hours.has(hour) &&
        minutes.has(minute)
      ) {
        return candidate;
      }

      // Advance by 1 minute
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null; // No match found within 366 days
  }

  /**
   * Parses a single cron field into a set of valid values.
   * Supports: *, N, N-M, N,M, * /N, N-M/S
   */
  private parseCronField(field: string, min: number, max: number): Set<number> | null {
    const result = new Set<number>();

    // Handle comma-separated list
    const segments = field.split(',');
    for (const segment of segments) {
      // Handle step: */N or N-M/S
      const stepMatch = segment.match(/^(.+)\/(\d+)$/);
      if (stepMatch) {
        const step = parseInt(stepMatch[2], 10);
        if (step <= 0) return null;

        let rangeStart = min;
        let rangeEnd = max;

        if (stepMatch[1] !== '*') {
          const rangeMatch = stepMatch[1].match(/^(\d+)-(\d+)$/);
          if (rangeMatch) {
            rangeStart = parseInt(rangeMatch[1], 10);
            rangeEnd = parseInt(rangeMatch[2], 10);
          } else {
            rangeStart = parseInt(stepMatch[1], 10);
            rangeEnd = max;
          }
        }

        for (let v = rangeStart; v <= rangeEnd; v += step) {
          if (v >= min && v <= max) result.add(v);
        }
        continue;
      }

      // Handle wildcard
      if (segment === '*') {
        for (let v = min; v <= max; v++) result.add(v);
        continue;
      }

      // Handle range: N-M
      const rangeMatch = segment.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        for (let v = start; v <= end; v++) {
          if (v >= min && v <= max) result.add(v);
        }
        continue;
      }

      // Handle specific value
      const value = parseInt(segment, 10);
      if (isNaN(value) || value < min || value > max) return null;
      result.add(value);
    }

    return result.size > 0 ? result : null;
  }

  private async runExecution(
    agent: AgentEntity,
    trigger: StewardTrigger,
    manual: boolean,
    eventContext?: Record<string, unknown>
  ): Promise<StewardExecutionResult> {
    const executionId = `exec-${++this.executionCounter}-${Date.now()}`;
    const stewardId = agent.id as unknown as EntityId;
    const startedAt = createTimestamp();

    const entry: StewardExecutionEntry = {
      executionId,
      stewardId,
      stewardName: agent.name,
      trigger,
      manual,
      startedAt,
      eventContext,
    };

    this.addHistoryEntry(entry);
    this.runningExecutions.add(executionId);
    this.emitter.emit('execution:started', entry);

    // Update job state if this is a cron job
    for (const job of this.cronJobs.values()) {
      if (job.stewardId === stewardId && isCronTrigger(trigger)) {
        job.isRunning = true;
      }
    }

    const startTime = Date.now();

    try {
      // Execute the steward
      const result = await this.executor(agent, { trigger, eventContext });

      // Complete the entry
      const completedEntry: StewardExecutionEntry = {
        ...entry,
        completedAt: createTimestamp(),
        result,
      };

      this.updateHistoryEntry(executionId, completedEntry);
      this.runningExecutions.delete(executionId);

      if (result.success) {
        this.emitter.emit('execution:completed', completedEntry);
      } else {
        this.emitter.emit('execution:failed', completedEntry);
      }

      // Update job state
      for (const job of this.cronJobs.values()) {
        if (job.stewardId === stewardId) {
          job.isRunning = false;
          job.lastRunAt = completedEntry.completedAt;
        }
      }

      // Update steward metadata with last execution time
      await this.agentRegistry.updateAgentMetadata(stewardId, {
        lastExecutedAt: completedEntry.completedAt,
      } as Partial<StewardMetadata>);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const result: StewardExecutionResult = {
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };

      const failedEntry: StewardExecutionEntry = {
        ...entry,
        completedAt: createTimestamp(),
        result,
      };

      this.updateHistoryEntry(executionId, failedEntry);
      this.runningExecutions.delete(executionId);
      this.emitter.emit('execution:failed', failedEntry);

      // Update job state
      for (const job of this.cronJobs.values()) {
        if (job.stewardId === stewardId) {
          job.isRunning = false;
        }
      }

      return result;
    }
  }

  private addHistoryEntry(entry: StewardExecutionEntry): void {
    this.executionHistory.push(entry);
    this.pruneHistory();
  }

  private updateHistoryEntry(executionId: string, entry: StewardExecutionEntry): void {
    const index = this.executionHistory.findIndex(e => e.executionId === executionId);
    if (index !== -1) {
      this.executionHistory[index] = entry;
    }
  }

  private pruneHistory(): void {
    // Group by steward and keep only maxHistoryPerSteward entries per steward
    const bysteward = new Map<EntityId, StewardExecutionEntry[]>();

    for (const entry of this.executionHistory) {
      if (!bysteward.has(entry.stewardId)) {
        bysteward.set(entry.stewardId, []);
      }
      bysteward.get(entry.stewardId)!.push(entry);
    }

    const prunedHistory: StewardExecutionEntry[] = [];

    for (const entries of bysteward.values()) {
      // Sort by startedAt descending and keep only the first maxHistoryPerSteward
      entries.sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));
      prunedHistory.push(...entries.slice(0, this.config.maxHistoryPerSteward));
    }

    this.executionHistory = prunedHistory;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a StewardScheduler instance
 *
 * @param agentRegistry - The agent registry for looking up stewards
 * @param executor - Function to execute steward logic
 * @param config - Optional configuration
 */
export function createStewardScheduler(
  agentRegistry: AgentRegistry,
  executor: StewardExecutor,
  config?: StewardSchedulerConfig
): StewardScheduler {
  return new StewardSchedulerImpl(agentRegistry, executor, config);
}

// ============================================================================
// Steward Executor Factory
// ============================================================================

/**
 * Dependencies required by the real steward executor.
 */
export interface StewardExecutorDeps {
  mergeStewardService: MergeStewardService;
  docsStewardService: DocsStewardService;
  sessionManager: SessionManager;
  projectRoot: string;
}

/**
 * Creates a steward executor that dispatches to the appropriate service
 * based on the steward's focus.
 *
 * - 'merge' focus → MergeStewardService.processAllPending()
 * - 'docs' → spawns an agent session via sessionManager
 *
 * Session-based stewards check for an existing active session before spawning
 * to prevent overlapping runs across cron ticks.
 *
 * Each case is wrapped in try/catch so one failing steward doesn't crash
 * the scheduler.
 */
export function createStewardExecutor(deps: StewardExecutorDeps): StewardExecutor {
  return async (steward, _context) => {
    const metadata = getAgentMetadata(steward) as StewardMetadata;
    const focus = metadata?.stewardFocus;
    const startTime = Date.now();

    switch (focus) {
      case 'merge': {
        try {
          const result = await deps.mergeStewardService.processAllPending();
          return {
            success: true,
            output: `Processed ${result.totalProcessed} tasks (${result.mergedCount} merged, ${result.errorCount} failed)`,
            durationMs: Date.now() - startTime,
            itemsProcessed: result.totalProcessed,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            output: `Merge steward '${steward.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - startTime,
            itemsProcessed: 0,
          };
        }
      }
      case 'docs': {
        try {
          const stewardId = steward.id as unknown as EntityId;
          const activeSession = deps.sessionManager.getActiveSession(stewardId);
          if (activeSession) {
            return {
              success: true,
              output: `Steward '${steward.name}' already has active session ${activeSession.id}, skipping`,
              durationMs: Date.now() - startTime,
              itemsProcessed: 0,
            };
          }

          const roleResult = loadRolePrompt('steward', focus as StewardFocus, {
            projectRoot: deps.projectRoot,
          });
          const initialPrompt = roleResult?.prompt ?? '';
          const { session } = await deps.sessionManager.startSession(stewardId, {
            workingDirectory: deps.projectRoot,
            initialPrompt,
            interactive: false,
          });
          return {
            success: true,
            output: `Spawned ${focus} steward session ${session.id}`,
            durationMs: Date.now() - startTime,
            itemsProcessed: 1,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            output: `${focus} steward '${steward.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - startTime,
            itemsProcessed: 0,
          };
        }
      }
      case 'custom': {
        try {
          const stewardId = steward.id as unknown as EntityId;
          const activeSession = deps.sessionManager.getActiveSession(stewardId);
          if (activeSession) {
            return {
              success: true,
              output: `Steward '${steward.name}' already has active session ${activeSession.id}, skipping`,
              durationMs: Date.now() - startTime,
              itemsProcessed: 0,
            };
          }

          // Build prompt from steward base + custom playbook
          const playbook = metadata?.playbook;
          if (!playbook) {
            return {
              success: false,
              error: 'Custom steward has no playbook configured',
              output: `Custom steward '${steward.name}' has no playbook configured`,
              durationMs: Date.now() - startTime,
              itemsProcessed: 0,
            };
          }

          // Load the steward base prompt for shared context
          const roleResult = loadRolePrompt('steward', undefined, {
            projectRoot: deps.projectRoot,
          });
          const basePrompt = roleResult?.prompt ?? '';

          // Combine base steward prompt with the custom playbook
          const initialPrompt = basePrompt
            ? `${basePrompt}\n\n---\n\n## Custom Steward Playbook\n\n${playbook}`
            : `## Custom Steward Playbook\n\n${playbook}`;

          const { session } = await deps.sessionManager.startSession(stewardId, {
            workingDirectory: deps.projectRoot,
            initialPrompt,
            interactive: false,
          });
          return {
            success: true,
            output: `Spawned custom steward session ${session.id}`,
            durationMs: Date.now() - startTime,
            itemsProcessed: 1,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            output: `Custom steward '${steward.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - startTime,
            itemsProcessed: 0,
          };
        }
      }
      default:
        return {
          success: false,
          output: `Unknown steward focus: ${focus}`,
          durationMs: Date.now() - startTime,
          itemsProcessed: 0,
        };
    }
  };
}

// ============================================================================
// Default Executor (deprecated — use createStewardExecutor)
// ============================================================================

/**
 * Creates a default steward executor that returns fake success without
 * calling any real service. Useful for tests.
 *
 * @deprecated Use {@link createStewardExecutor} instead, which dispatches
 * to real steward services based on the steward's focus.
 */
export function createDefaultStewardExecutor(): StewardExecutor {
  return async (steward, _context) => {
    const metadata = getAgentMetadata(steward) as StewardMetadata;
    const focus = metadata?.stewardFocus;

    // Stub - returns success with info about what would be done
    return {
      success: true,
      output: `Steward ${steward.name} (${focus}) executed successfully`,
      durationMs: 0,
      itemsProcessed: 0,
    };
  };
}
