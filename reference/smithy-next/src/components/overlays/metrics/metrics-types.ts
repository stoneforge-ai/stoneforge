// ── Layout ──
export type LayoutSize = 'wide' | 'medium' | 'narrow'

// ── Time Series ──
export interface TimeSeriesPoint {
  date: string  // ISO date 'YYYY-MM-DD'
  value: number
}

export type TimeRange = '7d' | '14d' | '30d'

// ── Tasks with metrics fields ──
export interface MetricsTask {
  id: string
  title: string
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
  priority: 'urgent' | 'high' | 'medium' | 'low'
  assignee?: string
  model: string
  provider: string
  createdAt: number   // ms timestamp
  completedAt?: number
  cycleTimeHours?: number
  // Rework
  handoffHistory: { from: string; to: string; reason: string; timestamp: number }[]
  testRunCount: number
  reconciliationCount: number
  stuckMergeRecoveryCount: number
  stewardRecoveryCount: number
  resumeCount: number
  // Merge
  mergeStatus: 'pending' | 'testing' | 'merging' | 'merged' | 'conflict' | 'test_failed' | 'failed'
  // Sessions
  sessionHistory: { agentId: string; agentName: string; model: string; provider: string; startedAt: number; endedAt?: number }[]
  // Issues & Events
  reportedIssues: string[]
  events: { type: 'created' | 'updated' | 'closed' | 'reopened' | 'auto_blocked'; timestamp: number }[]
  // CI
  ciPassOnFirstAttempt: boolean
  // Links
  linkedMRId?: string
  linkedCIRunId?: string
}

// ── Model-level aggregates ──
export interface ModelMetrics {
  model: string
  provider: string
  // Volume
  tasksCompleted: number
  mrsMerged: number
  sessionsCount: number
  // Speed
  avgTaskDurationHours: number
  avgTimeToMergeHours: number
  // Cost
  totalCost: number
  costPerCompletedTask: number
  costPerMergedMR: number
  // Quality
  ciPassRateFirstAttempt: number  // 0-1
  reopenRate: number              // 0-1
  handoffRate: number             // 0-1
  testFailureRate: number         // 0-1
  // Tokens
  totalTokensIn: number
  totalTokensOut: number
  cacheHitRate: number            // 0-1
  // Rework
  avgTestRunCount: number
  avgReconciliationCount: number
  avgResumeCount: number
}

// ── Agent performance ──
export interface AgentPerformance {
  agentId: string
  agentName: string
  role: string
  model: string
  provider: string
  tasksCompleted: number
  avgCycleTimeHours: number
  totalCost: number
  errorRate: number
}

// ── Bottlenecks ──
export interface Bottleneck {
  id: string
  type: 'blocked_task' | 'failing_ci' | 'stale_mr' | 'stuck_merge' | 'high_rework'
  title: string
  detail: string
  severity: 'high' | 'medium' | 'low'
  linkedTaskId?: string
  linkedMRId?: string
  linkedCIRunId?: string
  age: string
}

// ── Computed insights ──
export interface Insight {
  id: string
  type: 'speed' | 'cost' | 'quality' | 'efficiency'
  message: string
  severity: 'info' | 'warning' | 'success'
  relatedModels: string[]
}

// ── Usage tab types ──
export interface UsageStats {
  totalTokens: number
  totalTokensIn: number
  totalTokensOut: number
  totalCacheTokens: number
  estimatedCost: number
  totalSessions: number
  totalToolCalls: number
}

export interface ActivityDay {
  date: string     // ISO date
  tasks: number
  mrs: number
  sessions: number
}

export interface AgentTokenSplit {
  role: string
  label: string
  tokens: number
  color: string
}

export interface ModelTokenUsage {
  model: string
  tokens: number
  color: string
}

export interface CodeChurn {
  linesAdded: number
  linesRemoved: number
  totalChanged: number
}

export interface UsageInsightCard {
  label: string
  value: string
  subtitle: string
}
