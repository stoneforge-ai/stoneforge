/**
 * Health Steward Service
 *
 * This service monitors agent health and detects stuck agents.
 * The Health Steward detects problematic agents and takes corrective action.
 *
 * Key features:
 * - Detect agents with no output for configurable duration
 * - Detect agents with repeated errors
 * - Detect crashed agent processes
 * - Attempt to unstick agents
 * - Notify Director of issues
 * - Stop and reassign tasks from stuck agents
 *
 * TB-O24: Health Steward Implementation
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type {
  ElementId,
  EntityId,
  Timestamp,
} from '@stoneforge/core';
import { createTimestamp, TaskStatus } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

import type { AgentRole } from '../types/agent.js';
import type { AgentEntity, AgentRegistry } from './agent-registry.js';
import { getAgentMetadata } from './agent-registry.js';
import type { SessionManager } from '../runtime/session-manager.js';
import type { TaskAssignmentService } from './task-assignment-service.js';
import type { DispatchService } from './dispatch-service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Health issue types that the steward can detect
 */
export type HealthIssueType =
  | 'no_output'
  | 'repeated_errors'
  | 'process_crashed'
  | 'high_error_rate'
  | 'session_stale'
  | 'unresponsive';

/**
 * All valid health issue types
 */
export const HealthIssueTypes = [
  'no_output',
  'repeated_errors',
  'process_crashed',
  'high_error_rate',
  'session_stale',
  'unresponsive',
] as const;

/**
 * Type guard for HealthIssueType
 */
export function isHealthIssueType(value: unknown): value is HealthIssueType {
  return typeof value === 'string' && HealthIssueTypes.includes(value as HealthIssueType);
}

/**
 * Severity levels for health issues
 */
export type HealthIssueSeverity = 'warning' | 'error' | 'critical';

/**
 * All valid severity levels
 */
export const HealthIssueSeverities = ['warning', 'error', 'critical'] as const;

/**
 * Type guard for HealthIssueSeverity
 */
export function isHealthIssueSeverity(value: unknown): value is HealthIssueSeverity {
  return typeof value === 'string' && HealthIssueSeverities.includes(value as HealthIssueSeverity);
}

/**
 * Action types the health steward can take
 */
export type HealthAction =
  | 'monitor'       // Continue monitoring, no action
  | 'send_ping'     // Send a ping to check responsiveness
  | 'restart'       // Restart the agent session
  | 'notify_director' // Notify the Director agent
  | 'reassign_task' // Stop agent and reassign task
  | 'escalate';     // Escalate to human

/**
 * All valid health actions
 */
export const HealthActions = [
  'monitor',
  'send_ping',
  'restart',
  'notify_director',
  'reassign_task',
  'escalate',
] as const;

/**
 * Type guard for HealthAction
 */
export function isHealthAction(value: unknown): value is HealthAction {
  return typeof value === 'string' && HealthActions.includes(value as HealthAction);
}

/**
 * A detected health issue
 */
export interface HealthIssue {
  /** Unique issue ID */
  readonly id: string;
  /** Agent ID with the issue */
  readonly agentId: EntityId;
  /** Agent name */
  readonly agentName: string;
  /** Agent role */
  readonly agentRole: AgentRole;
  /** Type of issue detected */
  readonly issueType: HealthIssueType;
  /** Severity of the issue */
  readonly severity: HealthIssueSeverity;
  /** Human-readable description */
  readonly description: string;
  /** When the issue was first detected */
  readonly detectedAt: Timestamp;
  /** When the issue was last seen */
  readonly lastSeenAt: Timestamp;
  /** Number of times this issue has been seen */
  readonly occurrenceCount: number;
  /** Current session ID (if any) */
  readonly sessionId?: string;
  /** Current task ID (if any) */
  readonly taskId?: ElementId;
  /** Additional context data */
  readonly context?: Record<string, unknown>;
}

/**
 * Result of an action taken on an issue
 */
export interface HealthActionResult {
  /** Whether the action succeeded */
  readonly success: boolean;
  /** The action taken */
  readonly action: HealthAction;
  /** The issue that was addressed */
  readonly issueId: string;
  /** Description of what happened */
  readonly message: string;
  /** When the action was taken */
  readonly actionTakenAt: Timestamp;
  /** New task ID if task was reassigned */
  readonly newTaskId?: ElementId;
  /** New agent ID if task was reassigned */
  readonly newAgentId?: EntityId;
  /** Error if action failed */
  readonly error?: string;
}

/**
 * Session status values for health checks
 */
export type HealthSessionStatus = 'idle' | 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';

/**
 * Agent health status summary
 */
export interface AgentHealthStatus {
  /** Agent ID */
  readonly agentId: EntityId;
  /** Agent name */
  readonly agentName: string;
  /** Agent role */
  readonly agentRole: AgentRole;
  /** Whether the agent is healthy */
  readonly isHealthy: boolean;
  /** Current health issues (if any) */
  readonly issues: readonly HealthIssue[];
  /** Last activity timestamp */
  readonly lastActivityAt?: Timestamp;
  /** Last health check timestamp */
  readonly lastHealthCheckAt?: Timestamp;
  /** Current session status */
  readonly sessionStatus?: HealthSessionStatus;
  /** Current task (if any) */
  readonly currentTaskId?: ElementId;
  /** Recent error count (last N minutes) */
  readonly recentErrorCount: number;
  /** Recent output count (last N minutes) */
  readonly recentOutputCount: number;
}

/**
 * Configuration for the Health Steward service
 */
export interface HealthStewardConfig {
  /** How long without output before considering stuck (ms). Default: 5 minutes */
  readonly noOutputThresholdMs?: number;
  /** How many errors in the window before alerting. Default: 5 */
  readonly errorCountThreshold?: number;
  /** Time window for counting errors (ms). Default: 10 minutes */
  readonly errorWindowMs?: number;
  /** How long a session can be stale before alerting (ms). Default: 15 minutes */
  readonly staleSessionThresholdMs?: number;
  /** Interval between health checks (ms). Default: 1 minute */
  readonly healthCheckIntervalMs?: number;
  /** Number of ping attempts before escalating. Default: 3 */
  readonly maxPingAttempts?: number;
  /** Whether to auto-restart stuck agents. Default: true */
  readonly autoRestart?: boolean;
  /** Whether to auto-reassign from crashed agents. Default: true */
  readonly autoReassign?: boolean;
  /** Whether to notify Director on issues. Default: true */
  readonly notifyDirector?: boolean;
  /** Entity ID of the health steward (for creating messages) */
  readonly stewardEntityId?: EntityId;
  /** Maximum issues to track per agent. Default: 10 */
  readonly maxIssuesPerAgent?: number;
}

/**
 * Result of a health check run
 */
export interface HealthCheckResult {
  /** When the check was run */
  readonly timestamp: Timestamp;
  /** Total agents checked */
  readonly agentsChecked: number;
  /** Agents with issues */
  readonly agentsWithIssues: number;
  /** New issues detected */
  readonly newIssues: readonly HealthIssue[];
  /** Resolved issues (no longer present) */
  readonly resolvedIssues: readonly string[];
  /** Actions taken */
  readonly actionsTaken: readonly HealthActionResult[];
  /** Duration of the check in ms */
  readonly durationMs: number;
}

/**
 * Statistics about health steward operations
 */
export interface HealthStewardStats {
  /** Total health checks run */
  readonly totalChecks: number;
  /** Total issues detected */
  readonly totalIssuesDetected: number;
  /** Total issues resolved */
  readonly totalIssuesResolved: number;
  /** Total actions taken */
  readonly totalActionsTaken: number;
  /** Successful actions */
  readonly successfulActions: number;
  /** Failed actions */
  readonly failedActions: number;
  /** Currently active issues */
  readonly activeIssues: number;
  /** Agents currently being monitored */
  readonly monitoredAgents: number;
}

/**
 * Internal tracking for agent activity
 */
export interface AgentActivityTracker {
  /** Agent ID */
  readonly agentId: EntityId;
  /** Last output timestamp */
  lastOutputAt?: Timestamp;
  /** Last error timestamp */
  lastErrorAt?: Timestamp;
  /** Error timestamps in the window */
  errorTimestamps: Timestamp[];
  /** Output timestamps in the window */
  outputTimestamps: Timestamp[];
  /** Last ping attempt */
  lastPingAt?: Timestamp;
  /** Ping attempt count */
  pingAttempts: number;
  /** Last health check */
  lastHealthCheckAt?: Timestamp;
}

// ============================================================================
// Health Steward Service Interface
// ============================================================================

/**
 * Health Steward Service interface for monitoring agent health.
 *
 * The service provides methods for:
 * - Running health checks on agents
 * - Detecting stuck or problematic agents
 * - Taking corrective actions
 * - Tracking health issues
 */
export interface HealthStewardService {
  // ----------------------------------------
  // Health Checks
  // ----------------------------------------

  /**
   * Runs a health check on all running agents.
   *
   * @returns Health check result with issues and actions
   */
  runHealthCheck(): Promise<HealthCheckResult>;

  /**
   * Runs a health check on a specific agent.
   *
   * @param agentId - The agent to check
   * @returns Agent health status
   */
  checkAgent(agentId: EntityId): Promise<AgentHealthStatus>;

  /**
   * Gets all agents with their current health status.
   *
   * @returns Array of agent health statuses
   */
  getAllAgentHealth(): Promise<readonly AgentHealthStatus[]>;

  // ----------------------------------------
  // Issue Management
  // ----------------------------------------

  /**
   * Gets all active health issues.
   *
   * @returns Array of active issues
   */
  getActiveIssues(): readonly HealthIssue[];

  /**
   * Gets issues for a specific agent.
   *
   * @param agentId - The agent to get issues for
   * @returns Array of issues for the agent
   */
  getIssuesForAgent(agentId: EntityId): readonly HealthIssue[];

  /**
   * Resolves an issue (marks it as handled).
   *
   * @param issueId - The issue ID to resolve
   * @returns Whether the issue was resolved
   */
  resolveIssue(issueId: string): boolean;

  /**
   * Clears all resolved issues from history.
   */
  clearResolvedIssues(): void;

  // ----------------------------------------
  // Actions
  // ----------------------------------------

  /**
   * Takes action on a detected issue.
   *
   * @param issueId - The issue to act on
   * @param action - The action to take (optional, will auto-determine if not provided)
   * @returns Result of the action
   */
  takeAction(issueId: string, action?: HealthAction): Promise<HealthActionResult>;

  /**
   * Sends a ping to an agent to check responsiveness.
   *
   * @param agentId - The agent to ping
   * @returns Whether the agent responded
   */
  pingAgent(agentId: EntityId): Promise<boolean>;

  /**
   * Attempts to unstick an agent by restarting its session.
   *
   * @param agentId - The agent to unstick
   * @returns Whether the restart succeeded
   */
  restartAgent(agentId: EntityId): Promise<boolean>;

  /**
   * Notifies the Director about an agent issue.
   *
   * @param issue - The issue to report
   * @returns Whether notification was sent
   */
  notifyDirector(issue: HealthIssue): Promise<boolean>;

  /**
   * Reassigns a task from a stuck agent to another available agent.
   *
   * @param agentId - The stuck agent
   * @param taskId - The task to reassign
   * @returns Result with new assignment info
   */
  reassignTask(
    agentId: EntityId,
    taskId: ElementId
  ): Promise<{ success: boolean; newAgentId?: EntityId; error?: string }>;

  // ----------------------------------------
  // Activity Tracking
  // ----------------------------------------

  /**
   * Records agent output (call this when agent produces output).
   *
   * @param agentId - The agent that produced output
   */
  recordOutput(agentId: EntityId): void;

  /**
   * Records an agent error (call this when agent encounters an error).
   *
   * @param agentId - The agent that had an error
   * @param error - The error message
   */
  recordError(agentId: EntityId, error?: string): void;

  /**
   * Records a process crash (call this when agent process exits unexpectedly).
   *
   * @param agentId - The agent that crashed
   * @param exitCode - The exit code
   */
  recordCrash(agentId: EntityId, exitCode?: number): void;

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  /**
   * Starts the health monitoring service.
   * Begins periodic health checks based on config.
   */
  start(): void;

  /**
   * Stops the health monitoring service.
   */
  stop(): void;

  /**
   * Whether the service is currently running.
   */
  isRunning(): boolean;

  // ----------------------------------------
  // Statistics
  // ----------------------------------------

  /**
   * Gets statistics about health steward operations.
   */
  getStats(): HealthStewardStats;

  // ----------------------------------------
  // Events
  // ----------------------------------------

  /**
   * Subscribe to health steward events.
   */
  on(event: 'issue:detected', listener: (issue: HealthIssue) => void): void;
  on(event: 'issue:resolved', listener: (issueId: string) => void): void;
  on(event: 'action:taken', listener: (result: HealthActionResult) => void): void;
  on(event: 'check:completed', listener: (result: HealthCheckResult) => void): void;

  /**
   * Unsubscribe from events.
   */
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// ============================================================================
// Health Steward Service Implementation
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<HealthStewardConfig, 'stewardEntityId'>> = {
  noOutputThresholdMs: 5 * 60 * 1000,      // 5 minutes
  errorCountThreshold: 5,
  errorWindowMs: 10 * 60 * 1000,           // 10 minutes
  staleSessionThresholdMs: 15 * 60 * 1000, // 15 minutes
  healthCheckIntervalMs: 60 * 1000,        // 1 minute
  maxPingAttempts: 3,
  autoRestart: true,
  autoReassign: true,
  notifyDirector: true,
  maxIssuesPerAgent: 10,
};

/**
 * Implementation of the Health Steward Service.
 */
export class HealthStewardServiceImpl implements HealthStewardService {
  // Reserved for future persistence of health data
  private readonly _api: QuarryAPI;
  private readonly config: Required<Omit<HealthStewardConfig, 'stewardEntityId'>> &
    Pick<HealthStewardConfig, 'stewardEntityId'>;
  private readonly agentRegistry: AgentRegistry;
  private readonly sessionManager: SessionManager;
  private readonly taskAssignment: TaskAssignmentService;
  private readonly dispatchService: DispatchService;
  private readonly emitter: EventEmitter;

  // State
  private running = false;
  private checkInterval?: ReturnType<typeof setInterval>;
  private issueCounter = 0;

  // Tracking
  private readonly activityTrackers: Map<EntityId, AgentActivityTracker> = new Map();
  private readonly activeIssues: Map<string, HealthIssue> = new Map();
  private readonly resolvedIssueIds: Set<string> = new Set();

  // Statistics
  private totalChecks = 0;
  private totalIssuesDetected = 0;
  private totalIssuesResolved = 0;
  private totalActionsTaken = 0;
  private successfulActions = 0;
  private failedActions = 0;

  constructor(
    api: QuarryAPI,
    agentRegistry: AgentRegistry,
    sessionManager: SessionManager,
    taskAssignment: TaskAssignmentService,
    dispatchService: DispatchService,
    config: HealthStewardConfig = {}
  ) {
    this._api = api;
    this.agentRegistry = agentRegistry;
    this.sessionManager = sessionManager;
    this.taskAssignment = taskAssignment;
    this.dispatchService = dispatchService;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = new EventEmitter();
  }

  // ----------------------------------------
  // Health Checks
  // ----------------------------------------

  async runHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = createTimestamp();
    const newIssues: HealthIssue[] = [];
    const resolvedIssues: string[] = [];
    const actionsTaken: HealthActionResult[] = [];

    // Get all agents with running sessions
    const agents = await this.getRunningAgents();
    let agentsWithIssues = 0;

    for (const agent of agents) {
      const agentId = agent.id as unknown as EntityId;
      const status = await this.checkAgent(agentId);

      if (!status.isHealthy) {
        agentsWithIssues++;

        // Record new issues
        for (const issue of status.issues) {
          if (!this.activeIssues.has(issue.id)) {
            newIssues.push(issue);
            this.emitter.emit('issue:detected', issue);
          }
        }

        // Take automatic actions if configured
        for (const issue of status.issues) {
          const action = await this.determineAction(issue);
          if (action !== 'monitor') {
            const result = await this.takeAction(issue.id, action);
            actionsTaken.push(result);
          }
        }
      }
    }

    // Check for resolved issues
    for (const [issueId, issue] of this.activeIssues) {
      const agent = await this.agentRegistry.getAgent(issue.agentId);
      if (!agent) {
        // Agent no longer exists - resolve issue
        this.resolveIssue(issueId);
        resolvedIssues.push(issueId);
        continue;
      }

      // Check if the issue condition still applies
      const stillApplies = await this.issueStillApplies(issue);
      if (!stillApplies) {
        this.resolveIssue(issueId);
        resolvedIssues.push(issueId);
      }
    }

    this.totalChecks++;

    const result: HealthCheckResult = {
      timestamp,
      agentsChecked: agents.length,
      agentsWithIssues,
      newIssues,
      resolvedIssues,
      actionsTaken,
      durationMs: Date.now() - startTime,
    };

    this.emitter.emit('check:completed', result);
    return result;
  }

  async checkAgent(agentId: EntityId): Promise<AgentHealthStatus> {
    const agent = await this.agentRegistry.getAgent(agentId);
    if (!agent) {
      return this.createUnhealthyStatus(agentId, 'unknown', 'worker', []);
    }

    const meta = getAgentMetadata(agent);
    if (!meta) {
      return this.createUnhealthyStatus(agentId, agent.name, 'worker', []);
    }

    const tracker = this.getOrCreateTracker(agentId);
    tracker.lastHealthCheckAt = createTimestamp();

    const issues: HealthIssue[] = [];
    const now = Date.now();

    // Get session info
    const session = this.sessionManager.getActiveSession(agentId);
    const sessionStatus: HealthSessionStatus = session?.status ?? (meta.sessionStatus as HealthSessionStatus) ?? 'idle';

    // Only check running sessions
    if (sessionStatus === 'running') {
      // Check for no output
      if (tracker.lastOutputAt) {
        const lastOutputTime = this.getTimestampMs(tracker.lastOutputAt);
        const timeSinceOutput = now - lastOutputTime;
        if (timeSinceOutput > this.config.noOutputThresholdMs) {
          issues.push(this.createIssue(agentId, agent.name, meta.agentRole, 'no_output', {
            timeSinceOutputMs: timeSinceOutput,
            thresholdMs: this.config.noOutputThresholdMs,
            sessionId: session?.id,
          }));
        }
      }

      // Check for repeated errors
      const recentErrors = this.countRecentEvents(tracker.errorTimestamps, this.config.errorWindowMs);
      if (recentErrors >= this.config.errorCountThreshold) {
        issues.push(this.createIssue(agentId, agent.name, meta.agentRole, 'repeated_errors', {
          errorCount: recentErrors,
          thresholdCount: this.config.errorCountThreshold,
          windowMs: this.config.errorWindowMs,
          sessionId: session?.id,
        }));
      }

      // Check for high error rate
      const recentOutputs = this.countRecentEvents(tracker.outputTimestamps, this.config.errorWindowMs);
      if (recentOutputs > 0 && recentErrors > 0) {
        const errorRate = recentErrors / (recentErrors + recentOutputs);
        if (errorRate > 0.5) { // More than 50% errors
          issues.push(this.createIssue(agentId, agent.name, meta.agentRole, 'high_error_rate', {
            errorRate,
            errorCount: recentErrors,
            outputCount: recentOutputs,
            sessionId: session?.id,
          }));
        }
      }

      // Check for stale session
      if (session?.lastActivityAt) {
        const lastActivityTime = this.getTimestampMs(session.lastActivityAt);
        const timeSinceActivity = now - lastActivityTime;
        if (timeSinceActivity > this.config.staleSessionThresholdMs) {
          issues.push(this.createIssue(agentId, agent.name, meta.agentRole, 'session_stale', {
            timeSinceActivityMs: timeSinceActivity,
            thresholdMs: this.config.staleSessionThresholdMs,
            sessionId: session.id,
          }));
        }
      }
    }

    // Get current task
    const agentTasks = await this.taskAssignment.getAgentTasks(agentId, {
      taskStatus: TaskStatus.IN_PROGRESS,
    });
    const currentTaskId = agentTasks[0]?.taskId;

    // Add task context to issues
    for (const issue of issues) {
      if (currentTaskId) {
        (issue as { taskId?: ElementId }).taskId = currentTaskId;
      }
    }

    // Update active issues
    for (const issue of issues) {
      const existingIssue = this.findExistingIssue(agentId, issue.issueType);
      if (existingIssue) {
        // Update existing issue
        this.activeIssues.set(existingIssue.id, {
          ...existingIssue,
          lastSeenAt: createTimestamp(),
          occurrenceCount: existingIssue.occurrenceCount + 1,
          context: issue.context,
        });
      } else {
        // New issue
        this.activeIssues.set(issue.id, issue);
        this.totalIssuesDetected++;
      }
    }

    const recentErrors = this.countRecentEvents(tracker.errorTimestamps, this.config.errorWindowMs);
    const recentOutputs = this.countRecentEvents(tracker.outputTimestamps, this.config.errorWindowMs);

    return {
      agentId,
      agentName: agent.name,
      agentRole: meta.agentRole,
      isHealthy: issues.length === 0,
      issues,
      lastActivityAt: tracker.lastOutputAt ?? meta.lastActivityAt,
      lastHealthCheckAt: tracker.lastHealthCheckAt,
      sessionStatus,
      currentTaskId,
      recentErrorCount: recentErrors,
      recentOutputCount: recentOutputs,
    };
  }

  async getAllAgentHealth(): Promise<readonly AgentHealthStatus[]> {
    const agents = await this.getRunningAgents();
    const statuses: AgentHealthStatus[] = [];

    for (const agent of agents) {
      const agentId = agent.id as unknown as EntityId;
      const status = await this.checkAgent(agentId);
      statuses.push(status);
    }

    return statuses;
  }

  // ----------------------------------------
  // Issue Management
  // ----------------------------------------

  getActiveIssues(): readonly HealthIssue[] {
    return Array.from(this.activeIssues.values());
  }

  getIssuesForAgent(agentId: EntityId): readonly HealthIssue[] {
    return Array.from(this.activeIssues.values()).filter(
      (issue) => issue.agentId === agentId
    );
  }

  resolveIssue(issueId: string): boolean {
    const issue = this.activeIssues.get(issueId);
    if (!issue) {
      return false;
    }

    this.activeIssues.delete(issueId);
    this.resolvedIssueIds.add(issueId);
    this.totalIssuesResolved++;
    this.emitter.emit('issue:resolved', issueId);
    return true;
  }

  clearResolvedIssues(): void {
    this.resolvedIssueIds.clear();
  }

  // ----------------------------------------
  // Actions
  // ----------------------------------------

  async takeAction(issueId: string, action?: HealthAction): Promise<HealthActionResult> {
    const issue = this.activeIssues.get(issueId);
    if (!issue) {
      return {
        success: false,
        action: action ?? 'monitor',
        issueId,
        message: `Issue not found: ${issueId}`,
        actionTakenAt: createTimestamp(),
        error: 'Issue not found',
      };
    }

    const effectiveAction = action ?? await this.determineAction(issue);
    this.totalActionsTaken++;

    let result: HealthActionResult;

    try {
      switch (effectiveAction) {
        case 'monitor':
          result = {
            success: true,
            action: effectiveAction,
            issueId,
            message: `Continuing to monitor agent ${issue.agentName}`,
            actionTakenAt: createTimestamp(),
          };
          break;

        case 'send_ping':
          const pingSuccess = await this.pingAgent(issue.agentId);
          result = {
            success: pingSuccess,
            action: effectiveAction,
            issueId,
            message: pingSuccess
              ? `Agent ${issue.agentName} responded to ping`
              : `Agent ${issue.agentName} did not respond to ping`,
            actionTakenAt: createTimestamp(),
          };
          break;

        case 'restart':
          const restartSuccess = await this.restartAgent(issue.agentId);
          result = {
            success: restartSuccess,
            action: effectiveAction,
            issueId,
            message: restartSuccess
              ? `Successfully restarted agent ${issue.agentName}`
              : `Failed to restart agent ${issue.agentName}`,
            actionTakenAt: createTimestamp(),
          };
          if (restartSuccess) {
            this.resolveIssue(issueId);
          }
          break;

        case 'notify_director':
          const notifySuccess = await this.notifyDirector(issue);
          result = {
            success: notifySuccess,
            action: effectiveAction,
            issueId,
            message: notifySuccess
              ? `Director notified about ${issue.agentName}`
              : `Failed to notify Director about ${issue.agentName}`,
            actionTakenAt: createTimestamp(),
          };
          break;

        case 'reassign_task':
          if (!issue.taskId) {
            result = {
              success: false,
              action: effectiveAction,
              issueId,
              message: `No task to reassign for agent ${issue.agentName}`,
              actionTakenAt: createTimestamp(),
              error: 'No task associated with issue',
            };
          } else {
            const reassignResult = await this.reassignTask(issue.agentId, issue.taskId);
            result = {
              success: reassignResult.success,
              action: effectiveAction,
              issueId,
              message: reassignResult.success
                ? `Task reassigned from ${issue.agentName} to new agent`
                : `Failed to reassign task from ${issue.agentName}`,
              actionTakenAt: createTimestamp(),
              newAgentId: reassignResult.newAgentId,
              error: reassignResult.error,
            };
            if (reassignResult.success) {
              this.resolveIssue(issueId);
            }
          }
          break;

        case 'escalate':
          // For escalate, we notify both Director and mark for human review
          await this.notifyDirector(issue);
          result = {
            success: true,
            action: effectiveAction,
            issueId,
            message: `Issue escalated for agent ${issue.agentName} - requires human intervention`,
            actionTakenAt: createTimestamp(),
          };
          break;

        default:
          result = {
            success: false,
            action: effectiveAction,
            issueId,
            message: `Unknown action: ${effectiveAction}`,
            actionTakenAt: createTimestamp(),
            error: `Unknown action: ${effectiveAction}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result = {
        success: false,
        action: effectiveAction,
        issueId,
        message: `Action failed: ${errorMessage}`,
        actionTakenAt: createTimestamp(),
        error: errorMessage,
      };
    }

    if (result.success) {
      this.successfulActions++;
    } else {
      this.failedActions++;
    }

    this.emitter.emit('action:taken', result);
    return result;
  }

  async pingAgent(agentId: EntityId): Promise<boolean> {
    const tracker = this.getOrCreateTracker(agentId);

    // Check if we've exceeded ping attempts
    if (tracker.pingAttempts >= this.config.maxPingAttempts) {
      return false;
    }

    const session = this.sessionManager.getActiveSession(agentId);
    if (!session || session.status !== 'running') {
      return false;
    }

    tracker.lastPingAt = createTimestamp();
    tracker.pingAttempts++;

    // Send a health check message via the session
    const result = await this.sessionManager.messageSession(session.id, {
      content: 'Health check ping - please respond with any message to confirm you are active.',
    });

    return result.success;
  }

  async restartAgent(agentId: EntityId): Promise<boolean> {
    const session = this.sessionManager.getActiveSession(agentId);

    if (session) {
      try {
        // Stop the current session
        await this.sessionManager.stopSession(session.id, {
          graceful: true,
          reason: 'Health Steward restart due to detected issues',
        });
      } catch {
        // Continue even if stop fails
      }
    }

    // Reset tracker
    const tracker = this.getOrCreateTracker(agentId);
    tracker.pingAttempts = 0;
    tracker.errorTimestamps = [];

    // Note: We don't auto-start a new session here - that's the responsibility
    // of the agent or Director. We've cleared the issues by stopping.
    return true;
  }

  async notifyDirector(issue: HealthIssue): Promise<boolean> {
    // Find the Director agent
    const directors = await this.agentRegistry.getAgentsByRole('director');
    if (directors.length === 0) {
      return false;
    }

    const director = directors[0];
    const directorId = director.id as unknown as EntityId;

    // Build notification content
    const severity = issue.severity.toUpperCase();
    const content = [
      `# Health Alert: ${severity}`,
      '',
      `**Agent:** ${issue.agentName} (${issue.agentRole})`,
      `**Issue:** ${issue.issueType}`,
      `**Description:** ${issue.description}`,
      '',
      `**Detected:** ${issue.detectedAt}`,
      `**Occurrences:** ${issue.occurrenceCount}`,
      '',
      issue.taskId ? `**Current Task:** ${issue.taskId}` : '',
      '',
      '**Recommended Action:**',
      this.getRecommendedActionDescription(issue),
    ].filter(Boolean).join('\n');

    try {
      // Use task-assignment type as a general notification mechanism
      await this.dispatchService.notifyAgent(
        directorId,
        'task-assignment',
        content,
        {
          healthAlert: true,
          issueId: issue.id,
          issueType: issue.issueType,
          severity: issue.severity,
          agentId: issue.agentId,
          agentName: issue.agentName,
          taskId: issue.taskId,
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  async reassignTask(
    agentId: EntityId,
    taskId: ElementId
  ): Promise<{ success: boolean; newAgentId?: EntityId; error?: string }> {
    try {
      // Stop the current agent session
      const session = this.sessionManager.getActiveSession(agentId);
      if (session) {
        await this.sessionManager.stopSession(session.id, {
          graceful: false,
          reason: 'Task reassignment due to agent health issues',
        });
      }

      // Unassign the task - it will be picked up by the dispatch daemon
      await this.taskAssignment.unassignTask(taskId);

      // Task reassignment is now handled by the dispatch daemon polling for
      // unassigned tasks, rather than immediately dispatching here
      return {
        success: true,
        // Note: newAgentId is undefined since dispatch daemon handles assignment
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ----------------------------------------
  // Activity Tracking
  // ----------------------------------------

  recordOutput(agentId: EntityId): void {
    const tracker = this.getOrCreateTracker(agentId);
    const now = createTimestamp();
    tracker.lastOutputAt = now;
    tracker.outputTimestamps.push(now);
    // Reset ping attempts on successful output
    tracker.pingAttempts = 0;

    // Prune old timestamps
    this.pruneTimestamps(tracker);
  }

  recordError(agentId: EntityId, _error?: string): void {
    const tracker = this.getOrCreateTracker(agentId);
    const now = createTimestamp();
    tracker.lastErrorAt = now;
    tracker.errorTimestamps.push(now);

    // Prune old timestamps
    this.pruneTimestamps(tracker);
  }

  recordCrash(agentId: EntityId, exitCode?: number): void {
    const agent = this.activityTrackers.get(agentId);
    const agentName = agent ? 'Agent' : 'Unknown';

    // Create a crash issue immediately
    const issue = this.createIssue(
      agentId,
      agentName,
      'worker', // Default, will be updated
      'process_crashed',
      { exitCode }
    );

    this.activeIssues.set(issue.id, issue);
    this.totalIssuesDetected++;
    this.emitter.emit('issue:detected', issue);
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.checkInterval = setInterval(
      () => this.runHealthCheck().catch(() => {}),
      this.config.healthCheckIntervalMs
    );
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ----------------------------------------
  // Statistics
  // ----------------------------------------

  getStats(): HealthStewardStats {
    return {
      totalChecks: this.totalChecks,
      totalIssuesDetected: this.totalIssuesDetected,
      totalIssuesResolved: this.totalIssuesResolved,
      totalActionsTaken: this.totalActionsTaken,
      successfulActions: this.successfulActions,
      failedActions: this.failedActions,
      activeIssues: this.activeIssues.size,
      monitoredAgents: this.activityTrackers.size,
    };
  }

  // ----------------------------------------
  // Events
  // ----------------------------------------

  on(event: 'issue:detected', listener: (issue: HealthIssue) => void): void;
  on(event: 'issue:resolved', listener: (issueId: string) => void): void;
  on(event: 'action:taken', listener: (result: HealthActionResult) => void): void;
  on(event: 'check:completed', listener: (result: HealthCheckResult) => void): void;
  on(
    event: 'issue:detected' | 'issue:resolved' | 'action:taken' | 'check:completed',
    listener: ((issue: HealthIssue) => void) | ((issueId: string) => void) |
              ((result: HealthActionResult) => void) | ((result: HealthCheckResult) => void)
  ): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private async getRunningAgents(): Promise<AgentEntity[]> {
    const allAgents = await this.agentRegistry.listAgents({
      sessionStatus: 'running',
    });
    return allAgents;
  }

  private getOrCreateTracker(agentId: EntityId): AgentActivityTracker {
    let tracker = this.activityTrackers.get(agentId);
    if (!tracker) {
      tracker = {
        agentId,
        errorTimestamps: [],
        outputTimestamps: [],
        pingAttempts: 0,
      };
      this.activityTrackers.set(agentId, tracker);
    }
    return tracker;
  }

  private createIssue(
    agentId: EntityId,
    agentName: string,
    agentRole: AgentRole,
    issueType: HealthIssueType,
    context?: Record<string, unknown>
  ): HealthIssue {
    const now = createTimestamp();
    const severity = this.determineSeverity(issueType, context);

    return {
      id: `health-${++this.issueCounter}-${Date.now()}`,
      agentId,
      agentName,
      agentRole,
      issueType,
      severity,
      description: this.getIssueDescription(issueType, context),
      detectedAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      sessionId: context?.sessionId as string | undefined,
      context,
    };
  }

  private createUnhealthyStatus(
    agentId: EntityId,
    agentName: string,
    agentRole: AgentRole,
    issues: HealthIssue[]
  ): AgentHealthStatus {
    return {
      agentId,
      agentName,
      agentRole,
      isHealthy: false,
      issues,
      recentErrorCount: 0,
      recentOutputCount: 0,
    };
  }

  private determineSeverity(
    issueType: HealthIssueType,
    context?: Record<string, unknown>
  ): HealthIssueSeverity {
    switch (issueType) {
      case 'process_crashed':
        return 'critical';
      case 'repeated_errors':
        const errorCount = (context?.errorCount as number) ?? 0;
        return errorCount > 10 ? 'critical' : 'error';
      case 'high_error_rate':
        return 'error';
      case 'no_output':
        const timeSinceOutput = (context?.timeSinceOutputMs as number) ?? 0;
        return timeSinceOutput > 15 * 60 * 1000 ? 'error' : 'warning';
      case 'session_stale':
        return 'warning';
      case 'unresponsive':
        return 'error';
      default:
        return 'warning';
    }
  }

  private getIssueDescription(
    issueType: HealthIssueType,
    context?: Record<string, unknown>
  ): string {
    switch (issueType) {
      case 'no_output':
        const mins = Math.round(((context?.timeSinceOutputMs as number) ?? 0) / 60000);
        return `Agent has produced no output for ${mins} minutes`;
      case 'repeated_errors':
        return `Agent has encountered ${context?.errorCount ?? 'multiple'} errors in the last ${Math.round(((context?.windowMs as number) ?? 600000) / 60000)} minutes`;
      case 'process_crashed':
        return `Agent process crashed with exit code ${context?.exitCode ?? 'unknown'}`;
      case 'high_error_rate':
        const rate = ((context?.errorRate as number) ?? 0) * 100;
        return `Agent has a ${rate.toFixed(1)}% error rate`;
      case 'session_stale':
        const staleMins = Math.round(((context?.timeSinceActivityMs as number) ?? 0) / 60000);
        return `Agent session has been inactive for ${staleMins} minutes`;
      case 'unresponsive':
        return 'Agent is not responding to health check pings';
      default:
        return 'Unknown health issue';
    }
  }

  private async determineAction(issue: HealthIssue): Promise<HealthAction> {
    const tracker = this.activityTrackers.get(issue.agentId);

    switch (issue.issueType) {
      case 'process_crashed':
        // For crashes, try to reassign if auto-reassign is enabled
        if (this.config.autoReassign && issue.taskId) {
          return 'reassign_task';
        }
        return 'notify_director';

      case 'no_output':
      case 'session_stale':
        // First try pinging
        if (tracker && tracker.pingAttempts < this.config.maxPingAttempts) {
          return 'send_ping';
        }
        // Then try restart
        if (this.config.autoRestart) {
          return 'restart';
        }
        return 'notify_director';

      case 'repeated_errors':
      case 'high_error_rate':
        // Notify Director about error patterns
        if (this.config.notifyDirector) {
          return 'notify_director';
        }
        return 'monitor';

      case 'unresponsive':
        // Escalate unresponsive agents
        if (issue.severity === 'critical') {
          return 'escalate';
        }
        if (this.config.autoRestart) {
          return 'restart';
        }
        return 'notify_director';

      default:
        return 'monitor';
    }
  }

  private getRecommendedActionDescription(issue: HealthIssue): string {
    switch (issue.issueType) {
      case 'process_crashed':
        return 'Restart the agent and reassign any incomplete tasks.';
      case 'no_output':
        return 'Check if the agent is stuck and consider restarting.';
      case 'repeated_errors':
        return 'Review the task requirements and agent logs to identify the root cause.';
      case 'high_error_rate':
        return 'The agent may be struggling with the current task. Consider reassignment.';
      case 'session_stale':
        return 'The agent session may be hung. Try restarting the session.';
      case 'unresponsive':
        return 'The agent is not responding. Force terminate and reassign task.';
      default:
        return 'Monitor the situation and take action if it persists.';
    }
  }

  private findExistingIssue(agentId: EntityId, issueType: HealthIssueType): HealthIssue | undefined {
    for (const issue of this.activeIssues.values()) {
      if (issue.agentId === agentId && issue.issueType === issueType) {
        return issue;
      }
    }
    return undefined;
  }

  private async issueStillApplies(issue: HealthIssue): Promise<boolean> {
    const tracker = this.activityTrackers.get(issue.agentId);
    if (!tracker) {
      return false;
    }

    const now = Date.now();

    switch (issue.issueType) {
      case 'no_output':
        if (!tracker.lastOutputAt) return true;
        const timeSinceOutput = now - this.getTimestampMs(tracker.lastOutputAt);
        return timeSinceOutput > this.config.noOutputThresholdMs;

      case 'repeated_errors':
        const recentErrors = this.countRecentEvents(tracker.errorTimestamps, this.config.errorWindowMs);
        return recentErrors >= this.config.errorCountThreshold;

      case 'process_crashed':
        // Crashes are resolved by explicit restart/reassign
        return true;

      case 'high_error_rate':
        const errors = this.countRecentEvents(tracker.errorTimestamps, this.config.errorWindowMs);
        const outputs = this.countRecentEvents(tracker.outputTimestamps, this.config.errorWindowMs);
        if (outputs === 0) return false;
        return (errors / (errors + outputs)) > 0.5;

      case 'session_stale':
        const session = this.sessionManager.getActiveSession(issue.agentId);
        if (!session?.lastActivityAt) return false;
        const timeSinceActivity = now - this.getTimestampMs(session.lastActivityAt);
        return timeSinceActivity > this.config.staleSessionThresholdMs;

      default:
        return false;
    }
  }

  private countRecentEvents(timestamps: Timestamp[], windowMs: number): number {
    const now = Date.now();
    const windowStart = now - windowMs;
    return timestamps.filter((t) => this.getTimestampMs(t) >= windowStart).length;
  }

  private pruneTimestamps(tracker: AgentActivityTracker): void {
    const now = Date.now();
    const windowStart = now - this.config.errorWindowMs;

    tracker.errorTimestamps = tracker.errorTimestamps.filter(
      (t) => this.getTimestampMs(t) >= windowStart
    );
    tracker.outputTimestamps = tracker.outputTimestamps.filter(
      (t) => this.getTimestampMs(t) >= windowStart
    );
  }

  private getTimestampMs(timestamp: Timestamp): number {
    return typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a HealthStewardService instance
 */
export function createHealthStewardService(
  api: QuarryAPI,
  agentRegistry: AgentRegistry,
  sessionManager: SessionManager,
  taskAssignment: TaskAssignmentService,
  dispatchService: DispatchService,
  config?: HealthStewardConfig
): HealthStewardService {
  return new HealthStewardServiceImpl(
    api,
    agentRegistry,
    sessionManager,
    taskAssignment,
    dispatchService,
    config
  );
}
