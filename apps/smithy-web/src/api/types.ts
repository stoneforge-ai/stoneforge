/**
 * API Types for Orchestrator Web
 *
 * Type definitions for API responses and data structures.
 * These mirror the types from @stoneforge/smithy but are kept
 * separate to avoid bundling the full SDK in the frontend.
 */

// Local type aliases (avoiding dependency on @stoneforge/core in the frontend bundle)
export type EntityId = string;
export type ChannelId = string;
export type Timestamp = number;
export type ElementId = string;

// ============================================================================
// Agent Types
// ============================================================================

export type AgentRole = 'director' | 'steward' | 'worker';
export type WorkerMode = 'ephemeral' | 'persistent';
export type StewardFocus = 'merge' | 'docs';
/** Agent metadata session status (simpler set) */
export type AgentSessionStatus = 'idle' | 'running' | 'suspended' | 'terminated';
/** Full session status including transitional states */
export type SessionStatus = 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';

export interface CronTrigger {
  type: 'cron';
  schedule: string;
}

export interface EventTrigger {
  type: 'event';
  event: string;
  condition?: string;
}

export type StewardTrigger = CronTrigger | EventTrigger;

export interface BaseAgentMetadata {
  agentRole: AgentRole;
  channelId?: ChannelId;
  sessionId?: string;
  worktree?: string;
  sessionStatus?: SessionStatus;
  lastActivityAt?: Timestamp;
  roleDefinitionRef?: ElementId;
  provider?: string;
  model?: string;
}

export interface DirectorMetadata extends BaseAgentMetadata {
  agentRole: 'director';
}

export interface WorkerMetadata extends BaseAgentMetadata {
  agentRole: 'worker';
  workerMode: WorkerMode;
  branch?: string;
}

export interface StewardMetadata extends BaseAgentMetadata {
  agentRole: 'steward';
  stewardFocus: StewardFocus;
  triggers?: StewardTrigger[];
  lastExecutedAt?: Timestamp;
  nextScheduledAt?: Timestamp;
}

export type AgentMetadata = DirectorMetadata | WorkerMetadata | StewardMetadata;

/**
 * Agent entity as returned by the API
 */
export interface Agent {
  id: EntityId;
  name: string;
  type: 'entity';
  entityType: string;
  tags?: string[];
  status: string;
  createdAt: Timestamp;
  modifiedAt: Timestamp;
  metadata?: {
    agent?: AgentMetadata;
    [key: string]: unknown;
  };
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionRecord {
  id: string;
  providerSessionId?: string;
  agentId: EntityId;
  agentRole: AgentRole;
  workerMode?: WorkerMode;
  pid?: number;
  status: 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';
  workingDirectory?: string;
  worktree?: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  lastActivityAt?: Timestamp;
  endedAt?: Timestamp;
  terminationReason?: string;
}

// ============================================================================
// Worktree Types
// ============================================================================

export interface WorktreeInfo {
  path: string;
  relativePath: string;
  branch: string;
  head: string;
  isMain: boolean;
  state: 'creating' | 'active' | 'suspended' | 'merging' | 'cleaning' | 'archived';
  agentName?: string;
  taskId?: ElementId;
  createdAt?: Timestamp;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiError {
  code: string;
  message: string;
}

export interface AgentsResponse {
  agents: Agent[];
}

export interface AgentResponse {
  agent: Agent;
}

export interface AgentStatusResponse {
  agentId: EntityId;
  hasActiveSession: boolean;
  activeSession: SessionRecord | null;
  recentHistory: SessionRecord[];
}

export interface SessionsResponse {
  sessions: SessionRecord[];
}

/**
 * Session message from the server (persisted transcript)
 */
export interface SessionMessage {
  id: string;
  sessionId: string;
  agentId: EntityId;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'result';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  isError: boolean;
  createdAt: Timestamp;
}

export interface SessionMessagesResponse {
  messages: SessionMessage[];
}

export interface WorktreesResponse {
  worktrees: WorktreeInfo[];
}

// ============================================================================
// Create Agent Input Types
// ============================================================================

export interface CreateAgentInput {
  name: string;
  role: AgentRole;
  tags?: string[];
  // Worker-specific
  workerMode?: WorkerMode;
  // Steward-specific
  stewardFocus?: StewardFocus;
  triggers?: StewardTrigger[];
  // Provider
  provider?: string;
  // Model override (if not set, uses provider default)
  model?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

export interface ProviderInfo {
  name: string;
  available: boolean;
  installInstructions: string;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
}

// ============================================================================
// Model Types
// ============================================================================

export interface ModelInfo {
  id: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  providerName?: string;
}

export interface ProviderModelsResponse {
  models: ModelInfo[];
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'backlog' | 'open' | 'in_progress' | 'blocked' | 'review' | 'deferred' | 'closed' | 'tombstone';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type TaskTypeValue = 'bug' | 'feature' | 'task' | 'chore';
export type MergeStatus = 'pending' | 'testing' | 'merging' | 'merged' | 'conflict' | 'test_failed' | 'failed' | 'not_applicable';

/**
 * Orchestrator-specific metadata attached to tasks
 */
export interface OrchestratorTaskMeta {
  branch?: string;
  worktree?: string;
  sessionId?: string;
  assignedAgent?: EntityId;
  startedAt?: string;
  completedAt?: string;
  mergedAt?: string;
  mergeStatus?: MergeStatus;
  mergeFailureReason?: string;
  testRunCount?: number;
  lastTestResult?: TestResult;
  mergeRequestUrl?: string;
  mergeRequestId?: number;
  mergeRequestProvider?: string;
  sessionHistory?: TaskSessionHistoryEntry[];
}

export interface TestResult {
  passed: boolean;
  totalTests?: number;
  passedTests?: number;
  failedTests?: number;
  skippedTests?: number;
  completedAt: string;
  durationMs?: number;
  errorMessage?: string;
}

/**
 * Session history entry for a task - tracks which agents worked on it
 */
export interface TaskSessionHistoryEntry {
  sessionId: string;
  providerSessionId?: string;
  agentId: EntityId;
  agentName: string;
  agentRole: 'worker' | 'steward';
  startedAt: string;
  endedAt?: string;
}

/**
 * Task entity as returned by the API
 */
export interface Task {
  id: ElementId;
  type: 'task';
  title: string;
  description?: string;
  descriptionRef?: string;
  acceptanceCriteria?: string;
  status: TaskStatus;
  priority: Priority;
  complexity: Complexity;
  taskType: TaskTypeValue;
  closeReason?: string;
  assignee?: EntityId;
  owner?: EntityId;
  deadline?: string;
  scheduledFor?: string;
  closedAt?: string;
  ephemeral: boolean;
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId;
  tags: string[];
  metadata?: {
    orchestrator?: OrchestratorTaskMeta;
    description?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Task API Response Types
// ============================================================================

export interface TasksResponse {
  tasks: Task[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface TaskResponse {
  task: Task;
}

// Filter for fetching tasks
export type TaskFilterStatus = 'all' | 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'awaiting_merge';
export type TaskAssignmentFilter = 'all' | 'unassigned' | 'assigned';

export interface TaskFilter {
  status?: TaskFilterStatus;
  assignment?: TaskAssignmentFilter;
  assignee?: EntityId;
  priority?: Priority;
  taskType?: TaskTypeValue;
  ephemeral?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================================
// Activity/Event Types
// ============================================================================

/**
 * Event types for activity feed
 */
export type EventType =
  | 'created'
  | 'updated'
  | 'closed'
  | 'reopened'
  | 'deleted'
  | 'dependency_added'
  | 'dependency_removed'
  | 'tag_added'
  | 'tag_removed'
  | 'member_added'
  | 'member_removed'
  | 'auto_blocked'
  | 'auto_unblocked';

/**
 * Element types that events can be associated with
 */
export type ElementType = 'task' | 'entity' | 'document' | 'channel' | 'message' | 'plan' | 'workflow' | 'library' | 'team';

/**
 * Event record from the API
 */
export interface ActivityEvent {
  id: number;
  elementId: ElementId;
  elementType?: ElementType;
  elementTitle?: string;
  eventType: EventType;
  actor: EntityId;
  actorName?: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
  summary?: string;
}

/**
 * Activity filter options
 */
export type ActivityFilterCategory = 'all' | 'tasks' | 'agents' | 'sessions' | 'workflows';

export interface ActivityFilter {
  category?: ActivityFilterCategory;
  elementId?: ElementId;
  elementType?: ElementType | ElementType[];
  eventType?: EventType | EventType[];
  actor?: EntityId;
  after?: string;
  before?: string;
  limit?: number;
  offset?: number;
}

/**
 * Activity API response
 */
export interface ActivityResponse {
  events: ActivityEvent[];
  total?: number;
  hasMore: boolean;
}

// ============================================================================
// Activity Session Events (real-time agent activity)
// ============================================================================

/**
 * Session event types for real-time streaming
 */
export type SessionEventType = 'assistant' | 'tool_use' | 'tool_result' | 'error' | 'system' | 'result';

/**
 * Session event for real-time activity
 */
export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  agentId: EntityId;
  agentName?: string;
  content?: string;
  timestamp: string;
  /** Tool name (for tool_use/tool_result events) */
  tool?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Workflow Types
// ============================================================================

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Workflow entity as returned by the API
 */
export interface Workflow {
  id: ElementId;
  type: 'workflow';
  title: string;
  descriptionRef?: string;
  status: WorkflowStatus;
  playbookId?: string;
  ephemeral: boolean;
  variables: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  failureReason?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowsResponse {
  workflows: Workflow[];
  total?: number;
}

export interface WorkflowResponse {
  workflow: Workflow;
}

/**
 * Progress metrics for a workflow
 */
export interface WorkflowProgress {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  open: number;
  percentage: number;
}

/**
 * Internal dependency between workflow tasks
 */
export interface WorkflowDependency {
  blockedId: ElementId;
  blockerId: ElementId;
  type: string;
}

/**
 * Response for workflow tasks endpoint
 */
export interface WorkflowTasksResponse {
  tasks: Task[];
  total: number;
  progress: WorkflowProgress;
  dependencies: WorkflowDependency[];
}

export type WorkflowFilterStatus = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'active' | 'terminal';

export interface WorkflowFilter {
  status?: WorkflowFilterStatus;
  playbookId?: string;
  ephemeral?: boolean;
  limit?: number;
}

// ============================================================================
// Playbook Types
// ============================================================================

export type VariableType = 'string' | 'number' | 'boolean';

export interface PlaybookVariable {
  name: string;
  description?: string;
  type: VariableType;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

export interface PlaybookStep {
  id: string;
  title: string;
  description?: string;
  taskType?: TaskTypeValue;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string;
  dependsOn?: string[];
  condition?: string;
}

/**
 * Playbook entity as returned by the API
 */
export interface Playbook {
  id: ElementId;
  type: 'playbook';
  name: string;
  title: string;
  descriptionRef?: string;
  version: number;
  steps: PlaybookStep[];
  variables: PlaybookVariable[];
  extends?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface PlaybooksResponse {
  playbooks: Playbook[];
  total?: number;
}

export interface PlaybookResponse {
  playbook: Playbook;
}

export interface PlaybookFilter {
  name?: string;
  limit?: number;
}
