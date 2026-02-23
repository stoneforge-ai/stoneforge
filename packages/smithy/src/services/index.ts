/**
 * Orchestrator Services
 *
 * This module exports orchestration services:
 * - AgentRegistry (TB-O7, TB-O7a) - Agent registration, management, and channel setup
 * - RoleDefinitionService (TB-O7b) - Agent role definition storage and management
 * - TaskAssignmentService (TB-O8) - Task assignment with orchestrator metadata
 * - DispatchService (TB-O8a) - Task dispatch with assignment + notification
 * - DispatchDaemon - Continuous polling for task assignment and message delivery
 * - StewardScheduler (TB-O23) - Scheduled steward execution
 * - RateLimitTracker - In-memory rate limit state tracking for executables
 */

// Agent registry (TB-O7, TB-O7a)
// Note: AgentEntity, isAgentEntity, and getAgentMetadata are exported from api/index.js
// to avoid duplicate export conflicts
export {
  // Types
  type RegisterAgentInput,
  type AgentRegistry,
  // Implementation
  AgentRegistryImpl,
  // Factory
  createAgentRegistry,
  // Agent channel utilities (TB-O7a)
  generateAgentChannelName,
  parseAgentChannelName,
} from './agent-registry.js';

// Role definition service (TB-O7b)
export {
  // Types
  type RoleDefinitionService,
  // Implementation
  RoleDefinitionServiceImpl,
  // Factory
  createRoleDefinitionService,
} from './role-definition-service.js';

// Merge request provider
export {
  // Types
  type MergeRequestResult,
  type CreateMergeRequestOptions,
  type MergeRequestProvider,
  // Implementations
  LocalMergeProvider,
  GitHubMergeProvider,
  // Factories
  createLocalMergeProvider,
  createGitHubMergeProvider,
} from './merge-request-provider.js';

// Task assignment service (TB-O8)
export {
  // Types
  type AssignTaskOptions,
  type CompleteTaskOptions,
  type HandoffTaskOptions,
  type TaskCompletionResult,
  type TaskAssignment,
  type AssignmentFilter,
  type AssignmentStatus,
  type AgentWorkloadSummary,
  type TaskAssignmentService,
  // Constants
  AssignmentStatusValues,
  // Implementation
  TaskAssignmentServiceImpl,
  // Factory
  createTaskAssignmentService,
} from './task-assignment-service.js';

// Dispatch service (TB-O8a)
export {
  // Types
  type DispatchOptions,
  type DispatchResult,
  type DispatchMessageType,
  type DispatchNotificationMetadata,
  type DispatchService,
  // Implementation
  DispatchServiceImpl,
  // Factory
  createDispatchService,
} from './dispatch-service.js';

// Worker task service (TB-O20)
export {
  // Types
  type StartWorkerOnTaskOptions,
  type StartWorkerOnTaskResult,
  type CompleteTaskOptions as WorkerCompleteTaskOptions,
  type CompleteTaskResult,
  type TaskContext,
  type WorkerTaskService,
  // Implementation
  WorkerTaskServiceImpl,
  // Factory
  createWorkerTaskService,
} from './worker-task-service.js';

// Merge steward service (TB-O21)
export {
  // Types
  type MergeStewardConfig,
  type ProcessTaskOptions,
  type MergeProcessResult,
  type TestRunResult,
  type MergeAttemptResult,
  type CreateFixTaskOptions,
  type BatchProcessResult,
  type MergeStewardService,
  // Errors
  MergeStatusConflictError,
  // Implementation
  MergeStewardServiceImpl,
  // Factory
  createMergeStewardService,
} from './merge-steward-service.js';

// Steward scheduler service (TB-O23)
export {
  // Types
  type StewardExecutionResult,
  type StewardExecutionEntry,
  type ExecutionHistoryFilter,
  type StewardSchedulerConfig,
  type ScheduledJobInfo,
  type EventSubscriptionInfo,
  type StewardExecutor,
  type StewardScheduler,
  type StewardSchedulerStats,
  // Utilities
  isValidCronExpression,
  getNextCronRunTime,
  evaluateCondition,
  // Implementation
  StewardSchedulerImpl,
  // Factory
  createStewardScheduler,
  createStewardExecutor,
  createDefaultStewardExecutor,
  type StewardExecutorDeps,
} from './steward-scheduler.js';

// Plugin executor service (TB-O23a)
export {
  // Types
  type PluginType,
  type StewardPlugin,
  type PlaybookPlugin,
  type ScriptPlugin,
  type CommandPlugin,
  type PluginExecutionResult,
  type BatchPluginExecutionResult,
  type PluginExecutionOptions,
  type PluginExecutor,
  // Constants
  PluginTypeValues,
  // Type guards
  isPluginType,
  isPlaybookPlugin,
  isScriptPlugin,
  isCommandPlugin,
  isValidPlugin,
  // Built-in plugins
  BuiltInPlugins,
  GcEphemeralTasksPlugin,
  CleanupStaleWorktreesPlugin,
  GcEphemeralWorkflowsPlugin,
  HealthCheckAgentsPlugin,
  getBuiltInPlugin,
  listBuiltInPlugins,
  // Implementation
  PluginExecutorImpl,
  // Factory
  createPluginExecutor,
} from './plugin-executor.js';

// Docs steward service
export {
  // Types
  type DocIssueType,
  type FixConfidence,
  type IssueComplexity,
  type DocIssue,
  type VerificationResult,
  type SessionWorktreeInfo,
  type DocsMergeResult,
  type DocsStewardConfig,
  type DocsStewardService,
  // Implementation
  DocsStewardServiceImpl,
  // Factory
  createDocsStewardService,
} from './docs-steward-service.js';

// Dispatch daemon service
export {
  // Constants
  DISPATCH_DAEMON_DEFAULT_POLL_INTERVAL_MS,
  DISPATCH_DAEMON_MIN_POLL_INTERVAL_MS,
  DISPATCH_DAEMON_MAX_POLL_INTERVAL_MS,
  // Types
  type DispatchDaemonConfig,
  type PollResult,
  type DispatchDaemon,
  type OnSessionStartedCallback,
  // Implementation
  DispatchDaemonImpl,
  // Factory
  createDispatchDaemon,
} from './dispatch-daemon.js';

// Agent pool service
export {
  // Types
  type AgentPoolService,
  // Implementation
  AgentPoolServiceImpl,
  // Factory
  createAgentPoolService,
} from './agent-pool-service.js';

// Rate limit tracker service
export {
  // Types
  type RateLimitEntry,
  type RateLimitTracker,
  // Constants
  RATE_LIMITS_SETTING_KEY,
  // Factory
  createRateLimitTracker,
} from './rate-limit-tracker.js';

// Settings service
export {
  // Types
  type Setting,
  type ServerAgentDefaults,
  type SettingsService,
  // Constants
  SETTING_KEYS,
  // Factory
  createSettingsService,
} from './settings-service.js';

// Operation log service
export {
  // Types
  type OperationLogEntry,
  type OperationLogFilter,
  type OperationLogService,
  // Constants
  OperationLogLevel,
  OperationLogCategory,
  // Factory
  createOperationLogService,
} from './operation-log-service.js';

// Metrics service
export {
  // Types
  type MetricOutcome,
  type RecordMetricInput,
  type TimeRange,
  type AggregatedMetrics,
  type TimeSeriesPoint,
  type MetricsService,
  // Factory
  createMetricsService,
} from './metrics-service.js';
