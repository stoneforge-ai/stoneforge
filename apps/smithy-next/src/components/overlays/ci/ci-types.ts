// ── CI/CD Type Definitions ──

export type CIRunStatus = 'success' | 'failure' | 'running' | 'queued' | 'cancelled' | 'skipped'
export type CITriggerEvent = 'push' | 'pull_request' | 'schedule' | 'manual' | 'merge_group'

export interface CIAction {
  id: string
  name: string
  fileName: string
  path: string
  dispatchInputs?: CIDispatchInput[]
}

export interface CIDispatchInput {
  name: string
  description?: string
  type: 'string' | 'boolean' | 'choice'
  required: boolean
  default?: string
  options?: string[]
}

export interface CIAnnotation {
  level: 'error' | 'warning' | 'notice'
  message: string
  file?: string
  line?: number
  jobName: string
  stepName?: string
}

export interface CIArtifact {
  id: string
  name: string
  size: string
}

export interface CIStep {
  id: string
  name: string
  status: CIRunStatus
  duration?: string
  logs?: string[]
}

export interface CIMatrixEntry {
  dimensions: Record<string, string>
  status: CIRunStatus
  duration?: string
  jobId: string
}

export interface CIJob {
  id: string
  name: string
  status: CIRunStatus
  duration?: string
  steps: CIStep[]
  dependsOn?: string[]
  matrix?: CIMatrixEntry[]
  annotations?: CIAnnotation[]
  runnerName?: string
}

export interface CIRun {
  id: string
  runNumber: number
  action: CIAction
  status: CIRunStatus
  event: CITriggerEvent
  branch: string
  commit: string
  commitMessage: string
  actor: string
  actorAvatar: string
  createdAt: string
  duration?: string
  jobs: CIJob[]
  annotations: CIAnnotation[]
  artifacts: CIArtifact[]
  // Stoneforge-specific
  triggeredByAgent?: string
  triggeredByAgentId?: string
  linkedTaskId?: string
  linkedMRId?: string
  // Automation cross-references
  triggeredByWorkflowId?: string
  triggeredByWorkflowName?: string
  triggeredByWorkflowRunId?: string
  // Team-mode fields
  actorUserId?: string
  approvalGates?: { requiredApprovals: number; approvedBy: string[]; pending: boolean }
}

export interface CIHandoffContext {
  jobId: string
  jobName: string
  errorSummary: string
  failedStep?: string
  logExcerpt: string[]
  relatedFiles: string[]
}

// Filter/sort types
export type CIFilterField = 'status' | 'event' | 'branch' | 'actor' | 'action'
export interface CIActiveFilter { field: CIFilterField; value: string }
export type CISortField = 'created' | 'duration' | 'runNumber'
export type CIGroupField = 'status' | 'action' | 'none'
