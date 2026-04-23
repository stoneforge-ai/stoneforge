/**
 * @stoneforge/ui Workflows Module Types
 *
 * Consolidated type definitions for workflow and playbook entities.
 */

// Local type aliases (avoiding dependency on @stoneforge/core in the frontend bundle)
export type EntityId = string;
export type Timestamp = number;
export type ElementId = string;

// ============================================================================
// Task Types (used in workflow context)
// ============================================================================

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'tombstone';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type TaskTypeValue = 'bug' | 'feature' | 'task' | 'chore';

/**
 * Simplified task entity for workflow context
 */
export interface WorkflowTask {
  id: ElementId;
  type: 'task';
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  complexity: Complexity;
  taskType: TaskTypeValue;
  assignee?: EntityId;
  ephemeral: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ============================================================================
// Function Step Types (used in workflow context)
// ============================================================================

export type FunctionStepStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Function step entity for workflow context
 */
export interface WorkflowFunctionStep {
  id: ElementId;
  type: 'function';
  stepId: string;
  title: string;
  description?: string;
  status: FunctionStepStatus;
  runtime: FunctionRuntime;
  code?: string;
  command?: string;
  timeout: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  output?: string;
}

/**
 * Union type for any workflow step (task or function)
 */
export type WorkflowStep = WorkflowTask | WorkflowFunctionStep;

/**
 * Type guard for function steps
 */
export function isWorkflowFunctionStep(step: WorkflowStep): step is WorkflowFunctionStep {
  return step.type === 'function';
}

/**
 * Type guard for task steps
 */
export function isWorkflowTask(step: WorkflowStep): step is WorkflowTask {
  return step.type === 'task';
}

// ============================================================================
// Workflow Types
// ============================================================================

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WorkflowFilterStatus = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'active' | 'terminal';

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

/**
 * Progress metrics for a workflow
 * Supports both orchestrator format (numeric fields) and web app format (statusCounts)
 */
export interface WorkflowProgress {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  open: number;
  percentage: number;
  // Extended fields from web app format
  totalTasks?: number;
  statusCounts?: Record<string, number>;
  completionPercentage?: number;
  readyTasks?: number;
  blockedTasks?: number;
  workflowId?: string;
}

/**
 * Workflow with hydrated progress data
 */
export interface HydratedWorkflow extends Workflow {
  _progress?: WorkflowProgress;
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
 * Filter options for workflows
 */
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
export type StepType = 'task' | 'function';
export type FunctionRuntime = 'typescript' | 'python' | 'shell';

/**
 * Variable definition in a playbook
 */
export interface PlaybookVariable {
  name: string;
  description?: string;
  type: VariableType;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

/**
 * Base step definition (shared properties)
 */
export interface PlaybookStepBase {
  id: string;
  title: string;
  description?: string;
  dependsOn?: string[];
  condition?: string;
}

/**
 * Task step - creates an agent task to be executed
 */
export interface PlaybookTaskStep extends PlaybookStepBase {
  stepType?: 'task';
  taskType?: TaskTypeValue;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string;
}

/**
 * Function step - executes code directly
 */
export interface PlaybookFunctionStep extends PlaybookStepBase {
  stepType: 'function';
  runtime: FunctionRuntime;
  code?: string;
  command?: string;
  timeout?: number;
}

/**
 * Step definition in a playbook (union of task and function steps)
 */
export type PlaybookStep = PlaybookTaskStep | PlaybookFunctionStep;

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

/**
 * Filter options for playbooks
 */
export interface PlaybookFilter {
  name?: string;
  limit?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface WorkflowsResponse {
  workflows: Workflow[];
  total?: number;
}

export interface WorkflowResponse {
  workflow: Workflow;
}

export interface WorkflowTasksResponse {
  tasks: WorkflowTask[];
  functionSteps?: WorkflowFunctionStep[];
  steps?: WorkflowStep[];
  total: number;
  progress: WorkflowProgress;
  dependencies: WorkflowDependency[];
}

export interface PlaybooksResponse {
  playbooks: Playbook[];
  total?: number;
}

export interface PlaybookResponse {
  playbook: Playbook;
}
