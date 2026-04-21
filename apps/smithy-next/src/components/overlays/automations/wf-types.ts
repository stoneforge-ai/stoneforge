// ── Workflow Type Definitions ──

export type WFStepType = 'agent' | 'script'
export type WFScriptRuntime = 'shell' | 'python' | 'nodejs' | 'typescript'
export type WFTriggerType = 'cron' | 'event' | 'manual' | 'webhook'
export type WFStatus = 'active' | 'disabled' | 'error' | 'draft'
export type WFRunStatus = 'success' | 'failure' | 'running' | 'queued' | 'cancelled'
export type WFStepRunStatus = 'success' | 'failure' | 'running' | 'pending' | 'skipped'

// ── Step definitions ──

export interface WFStepBase {
  id: string
  name: string
  description?: string
  dependsOn?: string[]
  retryCount: number
  retryDelaySeconds: number
  timeoutSeconds: number
  condition?: string
}

export interface WFAgentStep extends WFStepBase {
  type: 'agent'
  roleDefinitionId: string       // the role definition prompt to use (replaces both prompt and agentIds)
  requiredAgentTags?: string[]   // optional compute requirements (same matching as tasks)
  tools: string[]
}

export interface WFScriptStep extends WFStepBase {
  type: 'script'
  runtime: WFScriptRuntime
  code: string
}

export type WFStep = WFAgentStep | WFScriptStep

// ── Trigger config ──

export interface WFTrigger {
  type: WFTriggerType
  cronExpression?: string
  cronHumanReadable?: string
  eventType?: string
  webhookUrl?: string
}

// ── Variable definition ──

export interface WFVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum'
  default?: string
  description?: string
  required: boolean
  options?: string[]
}

// ── Workflow ──

export interface Workflow {
  id: string
  name: string
  description?: string
  status: WFStatus
  steps: WFStep[]
  trigger: WFTrigger
  variables: WFVariable[]
  totalRuns: number
  lastRunAt?: string
  lastRunStatus?: WFRunStatus
  nextRunAt?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  tags: string[]
  // Cross-references
  linkedCIActionId?: string
  // Team-mode fields
  createdByUserId?: string
  scope?: 'personal' | 'team'
  approvalRequired?: boolean
  approvalUsers?: string[]
}

// ── Run instance ──

export interface WFRun {
  id: string
  runNumber: number
  workflowId: string
  status: WFRunStatus
  triggeredBy: 'schedule' | 'manual' | 'event' | 'webhook'
  triggeredByActor?: string
  triggeredByUserId?: string
  startedAt: string
  endedAt?: string
  duration?: string
  runId?: string
  steps: WFStepRun[]
  variables: Record<string, string>
  error?: string
  result?: string
  // Cross-references
  linkedCIRunIds?: string[]
  linkedMRId?: string
  linkedTaskId?: string
}

export interface WFStepRun {
  stepId: string
  stepName: string
  stepType: WFStepType
  status: WFStepRunStatus
  startedAt?: string
  endedAt?: string
  duration?: string
  output?: string
  error?: string
  input?: string
  retryAttempt: number
  // Cross-references
  linkedCIRunId?: string
}

// ── Filter/sort/group types ──

export type WFFilterField = 'status' | 'trigger' | 'tag'
export interface WFActiveFilter { field: WFFilterField; value: string }
export type WFSortField = 'name' | 'lastRun' | 'totalRuns' | 'created'
export type WFGroupField = 'status' | 'trigger' | 'none'
