import type {
  MetricsTask, ModelMetrics, AgentPerformance, Bottleneck, Insight,
  TimeSeriesPoint, TimeRange, UsageStats, ActivityDay, AgentTokenSplit,
  ModelTokenUsage, CodeChurn, UsageInsightCard,
} from './metrics-types'

// ── Helpers ──

const DAY = 86_400_000
const now = Date.now()
const daysAgo = (d: number) => now - d * DAY

function rand(min: number, max: number) { return min + Math.random() * (max - min) }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)) }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ── Agents ──

const agents = [
  { id: 'agent-1', name: 'Director Alpha', role: 'director' as const, model: 'claude-opus-4-6', provider: 'Anthropic' },
  { id: 'agent-2', name: 'Worker Beta', role: 'worker' as const, model: 'claude-sonnet-4-6', provider: 'Anthropic' },
  { id: 'agent-3', name: 'Worker Gamma', role: 'worker' as const, model: 'claude-sonnet-4-6', provider: 'Anthropic' },
  { id: 'agent-4', name: 'Worker Delta', role: 'worker' as const, model: 'claude-haiku-4-5', provider: 'Anthropic' },
  { id: 'agent-5', name: 'Steward Echo', role: 'steward' as const, model: 'claude-sonnet-4-6', provider: 'Anthropic' },
]

// ── Model cost profiles ──

const modelProfiles: Record<string, { costPerMToken: number; avgCycleHours: number; ciPassRate: number; reopenRate: number; handoffRate: number; testRuns: number; reconciliations: number; resumes: number }> = {
  'claude-opus-4-6': { costPerMToken: 75, avgCycleHours: 2.8, ciPassRate: 0.92, reopenRate: 0.05, handoffRate: 0.08, testRuns: 1.2, reconciliations: 0.1, resumes: 0.2 },
  'claude-sonnet-4-6': { costPerMToken: 15, avgCycleHours: 4.1, ciPassRate: 0.82, reopenRate: 0.12, handoffRate: 0.15, testRuns: 1.8, reconciliations: 0.3, resumes: 0.5 },
  'claude-haiku-4-5': { costPerMToken: 1.25, avgCycleHours: 5.6, ciPassRate: 0.68, reopenRate: 0.22, handoffRate: 0.28, testRuns: 2.8, reconciliations: 0.7, resumes: 1.1 },
}

// ── Generate mock tasks ──

const statuses: MetricsTask['status'][] = ['done', 'done', 'done', 'done', 'in_progress', 'in_review', 'todo', 'backlog']
const priorities: MetricsTask['priority'][] = ['urgent', 'high', 'medium', 'medium', 'low']
const mergeStatuses: MetricsTask['mergeStatus'][] = ['merged', 'merged', 'merged', 'pending', 'testing', 'test_failed', 'conflict', 'failed']

const taskTitles = [
  'Fix authentication token refresh loop', 'Add rate limiting to API gateway', 'Refactor database connection pooling',
  'Implement webhook retry mechanism', 'Update user profile validation', 'Fix memory leak in WebSocket handler',
  'Add pagination to search results', 'Migrate config to env variables', 'Fix race condition in queue processor',
  'Add OpenTelemetry tracing spans', 'Update dependency versions', 'Fix CSS grid layout on mobile',
  'Add input sanitization middleware', 'Implement graceful shutdown', 'Fix timezone handling in scheduler',
  'Add health check endpoints', 'Refactor error handling middleware', 'Fix file upload size validation',
  'Add request deduplication', 'Implement circuit breaker pattern', 'Fix incorrect sort ordering',
  'Add API versioning headers', 'Refactor auth middleware chain', 'Fix N+1 query in dashboard',
  'Add structured logging format', 'Implement cache invalidation', 'Fix CORS preflight handling',
  'Add retry logic for external APIs', 'Fix deadlock in transaction handler', 'Update GraphQL schema types',
  'Add feature flag evaluation', 'Fix incorrect error status codes', 'Implement request batching',
  'Add compression middleware', 'Fix session expiry edge case',
]

export const mockMetricsTasks: MetricsTask[] = taskTitles.map((title, i) => {
  const agent = agents[i % agents.length]
  const model = agent.model
  const profile = modelProfiles[model]
  const status = statuses[i % statuses.length]
  const created = daysAgo(randInt(1, 30))
  const cycleHours = status === 'done' ? profile.avgCycleHours * rand(0.5, 1.8) : undefined
  const completed = status === 'done' && cycleHours ? created + cycleHours * 3_600_000 : undefined
  const isReopened = status === 'done' && Math.random() < profile.reopenRate
  const handoffs: MetricsTask['handoffHistory'] = Math.random() < profile.handoffRate
    ? [{ from: agent.name, to: pick(agents.filter(a => a.id !== agent.id)).name, reason: pick(['Complexity escalation', 'Timeout', 'Specialization needed']), timestamp: created + DAY }]
    : []
  const ms = status === 'done' ? pick(mergeStatuses.slice(0, 3)) : pick(mergeStatuses)

  return {
    id: `SF-${100 + i}`,
    title,
    status,
    priority: pick(priorities),
    assignee: agent.name,
    model,
    provider: agent.provider,
    createdAt: created,
    completedAt: completed,
    cycleTimeHours: cycleHours,
    handoffHistory: handoffs,
    testRunCount: Math.round(profile.testRuns * rand(0.5, 2)),
    reconciliationCount: Math.round(profile.reconciliations * rand(0, 3)),
    stuckMergeRecoveryCount: Math.random() < 0.1 ? 1 : 0,
    stewardRecoveryCount: Math.random() < 0.08 ? 1 : 0,
    resumeCount: Math.round(profile.resumes * rand(0, 2.5)),
    mergeStatus: ms,
    sessionHistory: [
      { agentId: agent.id, agentName: agent.name, model, provider: agent.provider, startedAt: created, endedAt: completed },
      ...(handoffs.length > 0 ? [{
        agentId: pick(agents).id, agentName: handoffs[0].to, model: pick(Object.keys(modelProfiles)),
        provider: 'Anthropic', startedAt: handoffs[0].timestamp, endedAt: completed,
      }] : []),
    ],
    reportedIssues: [
      ...(ms === 'test_failed' ? ['test_failure'] : []),
      ...(ms === 'conflict' ? ['merge_conflict'] : []),
    ],
    events: [
      { type: 'created', timestamp: created },
      ...(completed ? [{ type: 'closed' as const, timestamp: completed }] : []),
      ...(isReopened ? [{ type: 'reopened' as const, timestamp: (completed || created) + DAY }] : []),
    ],
    ciPassOnFirstAttempt: Math.random() < profile.ciPassRate,
    linkedMRId: ms !== 'pending' ? `MR-${200 + i}` : undefined,
    linkedCIRunId: `run-${300 + i}`,
  }
})

// ── Time series generators ──

function generateSeries(days: number, baseFn: (day: number) => number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(daysAgo(d))
    points.push({ date: date.toISOString().slice(0, 10), value: Math.max(0, baseFn(d)) })
  }
  return points
}

export const tasksCompletedSeries = generateSeries(30, (d) => Math.round(2 + Math.sin(d / 4) * 1.5 + rand(-0.5, 1.5)))
export const mrsMergedSeries = generateSeries(30, (d) => Math.round(1 + Math.sin(d / 5) * 1 + rand(-0.3, 1)))
export const cycleTimeSeries = generateSeries(30, (d) => +(4.5 - d * 0.03 + rand(-0.5, 0.5)).toFixed(1))
export const costSeries = generateSeries(30, (d) => +(35 + Math.sin(d / 3) * 15 + rand(-5, 10)).toFixed(2))
export const reopenRateSeries = generateSeries(30, (d) => +(0.12 - d * 0.001 + rand(-0.02, 0.03)).toFixed(3))
export const ciPassRateSeries = generateSeries(30, (d) => +(0.78 + d * 0.002 + rand(-0.03, 0.03)).toFixed(3))

// ── Computation functions ──

function filterByRange(tasks: MetricsTask[], range: TimeRange): MetricsTask[] {
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30
  const cutoff = daysAgo(days)
  return tasks.filter(t => t.createdAt >= cutoff)
}

export function computeModelMetrics(tasks: MetricsTask[], range: TimeRange): ModelMetrics[] {
  const filtered = filterByRange(tasks, range)
  const models = [...new Set(filtered.map(t => t.model))]

  return models.map(model => {
    const modelTasks = filtered.filter(t => t.model === model)
    const completed = modelTasks.filter(t => t.status === 'done')
    const merged = modelTasks.filter(t => t.mergeStatus === 'merged')
    const profile = modelProfiles[model] || modelProfiles['claude-sonnet-4-6']
    const totalTokens = completed.length * rand(800_000, 2_000_000)
    const tokensIn = totalTokens * 0.65
    const tokensOut = totalTokens * 0.35

    return {
      model,
      provider: 'Anthropic',
      tasksCompleted: completed.length,
      mrsMerged: merged.length,
      sessionsCount: modelTasks.reduce((s, t) => s + t.sessionHistory.length, 0),
      avgTaskDurationHours: completed.length > 0
        ? completed.reduce((s, t) => s + (t.cycleTimeHours || 0), 0) / completed.length
        : 0,
      avgTimeToMergeHours: merged.length > 0
        ? merged.reduce((s, t) => s + (t.cycleTimeHours || 0) * 1.3, 0) / merged.length
        : 0,
      totalCost: +(totalTokens / 1_000_000 * profile.costPerMToken).toFixed(2),
      costPerCompletedTask: completed.length > 0
        ? +((totalTokens / 1_000_000 * profile.costPerMToken) / completed.length).toFixed(2)
        : 0,
      costPerMergedMR: merged.length > 0
        ? +((totalTokens / 1_000_000 * profile.costPerMToken) / merged.length).toFixed(2)
        : 0,
      ciPassRateFirstAttempt: completed.length > 0
        ? completed.filter(t => t.ciPassOnFirstAttempt).length / completed.length
        : 0,
      reopenRate: completed.length > 0
        ? completed.filter(t => t.events.some(e => e.type === 'reopened')).length / completed.length
        : 0,
      handoffRate: modelTasks.length > 0
        ? modelTasks.filter(t => t.handoffHistory.length > 0).length / modelTasks.length
        : 0,
      testFailureRate: modelTasks.length > 0
        ? modelTasks.filter(t => t.reportedIssues.includes('test_failure')).length / modelTasks.length
        : 0,
      totalTokensIn: Math.round(tokensIn),
      totalTokensOut: Math.round(tokensOut),
      cacheHitRate: +(0.75 + rand(0, 0.2)).toFixed(3),
      avgTestRunCount: modelTasks.length > 0
        ? +(modelTasks.reduce((s, t) => s + t.testRunCount, 0) / modelTasks.length).toFixed(1)
        : 0,
      avgReconciliationCount: modelTasks.length > 0
        ? +(modelTasks.reduce((s, t) => s + t.reconciliationCount, 0) / modelTasks.length).toFixed(1)
        : 0,
      avgResumeCount: modelTasks.length > 0
        ? +(modelTasks.reduce((s, t) => s + t.resumeCount, 0) / modelTasks.length).toFixed(1)
        : 0,
    }
  }).sort((a, b) => b.tasksCompleted - a.tasksCompleted)
}

export function computeAgentPerformance(tasks: MetricsTask[], range: TimeRange): AgentPerformance[] {
  const filtered = filterByRange(tasks, range)

  return agents.map(agent => {
    const agentTasks = filtered.filter(t => t.assignee === agent.name)
    const completed = agentTasks.filter(t => t.status === 'done')
    const profile = modelProfiles[agent.model]
    const totalTokens = completed.length * rand(800_000, 1_500_000)

    return {
      agentId: agent.id,
      agentName: agent.name,
      role: 'agent',
      model: agent.model,
      provider: agent.provider,
      tasksCompleted: completed.length,
      avgCycleTimeHours: completed.length > 0
        ? +(completed.reduce((s, t) => s + (t.cycleTimeHours || 0), 0) / completed.length).toFixed(1)
        : 0,
      totalCost: +(totalTokens / 1_000_000 * profile.costPerMToken).toFixed(2),
      errorRate: +(agentTasks.length > 0
        ? agentTasks.filter(t => t.mergeStatus === 'failed' || t.mergeStatus === 'test_failed').length / agentTasks.length
        : 0).toFixed(3),
    }
  }).sort((a, b) => b.tasksCompleted - a.tasksCompleted)
}

export function computeBottlenecks(tasks: MetricsTask[]): Bottleneck[] {
  const bottlenecks: Bottleneck[] = []

  // Blocked tasks
  tasks.filter(t => t.status === 'in_progress' && t.events.some(e => e.type === 'auto_blocked')).forEach(t => {
    bottlenecks.push({
      id: `bn-blocked-${t.id}`, type: 'blocked_task', title: `${t.id} "${t.title}"`,
      detail: `Blocked for ${Math.round((now - t.createdAt) / DAY)}d`, severity: 'high',
      linkedTaskId: t.id, age: `${Math.round((now - t.createdAt) / DAY)}d`,
    })
  })

  // Failing CI
  tasks.filter(t => t.mergeStatus === 'test_failed').forEach(t => {
    bottlenecks.push({
      id: `bn-ci-${t.id}`, type: 'failing_ci', title: `CI failing on ${t.id}`,
      detail: t.title, severity: 'high',
      linkedTaskId: t.id, linkedCIRunId: t.linkedCIRunId, age: '2h',
    })
  })

  // Stale MRs
  tasks.filter(t => t.mergeStatus === 'pending' && t.status === 'in_review').forEach(t => {
    bottlenecks.push({
      id: `bn-stale-${t.id}`, type: 'stale_mr', title: `MR stale for ${t.id}`,
      detail: t.title, severity: 'medium',
      linkedTaskId: t.id, linkedMRId: t.linkedMRId, age: '3d',
    })
  })

  // Merge conflicts
  tasks.filter(t => t.mergeStatus === 'conflict').forEach(t => {
    bottlenecks.push({
      id: `bn-conflict-${t.id}`, type: 'stuck_merge', title: `Merge conflict on ${t.id}`,
      detail: t.title, severity: 'medium',
      linkedTaskId: t.id, linkedMRId: t.linkedMRId, age: '1d',
    })
  })

  // High rework
  tasks.filter(t => t.testRunCount >= 4 || t.handoffHistory.length >= 2).slice(0, 3).forEach(t => {
    bottlenecks.push({
      id: `bn-rework-${t.id}`, type: 'high_rework', title: `High rework on ${t.id}`,
      detail: `${t.testRunCount} CI runs, ${t.handoffHistory.length} handoffs`, severity: 'low',
      linkedTaskId: t.id, age: `${Math.round((now - t.createdAt) / DAY)}d`,
    })
  })

  return bottlenecks.slice(0, 8)
}

export function computeInsights(models: ModelMetrics[]): Insight[] {
  if (models.length < 2) return []
  const insights: Insight[] = []
  const sorted = [...models].sort((a, b) => a.avgTaskDurationHours - b.avgTaskDurationHours)
  const fastest = sorted[0]
  const slowest = sorted[sorted.length - 1]

  // Speed
  if (slowest.avgTaskDurationHours > 0 && fastest.avgTaskDurationHours > 0) {
    const ratio = slowest.avgTaskDurationHours / fastest.avgTaskDurationHours
    if (ratio > 1.3) {
      insights.push({
        id: 'insight-speed', type: 'speed',
        message: `${fastest.model} completes tasks ${ratio.toFixed(1)}x faster than ${slowest.model} on average`,
        severity: 'info', relatedModels: [fastest.model, slowest.model],
      })
    }
  }

  // Cost
  const byCost = [...models].sort((a, b) => a.costPerCompletedTask - b.costPerCompletedTask)
  const cheapest = byCost[0]
  const priciest = byCost[byCost.length - 1]
  if (cheapest.costPerCompletedTask > 0 && priciest.costPerCompletedTask > 0) {
    const ratio = priciest.costPerCompletedTask / cheapest.costPerCompletedTask
    if (ratio > 2) {
      insights.push({
        id: 'insight-cost', type: 'cost',
        message: `${priciest.model} costs ${ratio.toFixed(1)}x more per task than ${cheapest.model} ($${priciest.costPerCompletedTask.toFixed(2)} vs $${cheapest.costPerCompletedTask.toFixed(2)})`,
        severity: 'warning', relatedModels: [priciest.model, cheapest.model],
      })
    }
  }

  // Quality
  const byQuality = [...models].sort((a, b) => b.ciPassRateFirstAttempt - a.ciPassRateFirstAttempt)
  const best = byQuality[0]
  const worst = byQuality[byQuality.length - 1]
  if (best.ciPassRateFirstAttempt - worst.ciPassRateFirstAttempt > 0.15) {
    insights.push({
      id: 'insight-quality', type: 'quality',
      message: `${worst.model} has ${Math.round((best.ciPassRateFirstAttempt - worst.ciPassRateFirstAttempt) * 100)}% lower CI first-pass rate than ${best.model}, indicating more rework`,
      severity: 'warning', relatedModels: [worst.model, best.model],
    })
  }

  // Cost-quality tradeoff
  if (priciest && priciest.reopenRate < cheapest.reopenRate * 0.5) {
    insights.push({
      id: 'insight-tradeoff', type: 'efficiency',
      message: `${priciest.model} costs more but produces ${Math.round((1 - priciest.reopenRate / cheapest.reopenRate) * 100)}% fewer re-opens — higher cost buys measurably better quality`,
      severity: 'success', relatedModels: [priciest.model, cheapest.model],
    })
  }

  return insights.slice(0, 4)
}

// ── Usage tab data ──

export const mockUsageStats: UsageStats = {
  totalTokens: 890_200_000,
  totalTokensIn: 578_630_000,
  totalTokensOut: 311_570_000,
  totalCacheTokens: 515_034_000,
  estimatedCost: 1420,
  totalSessions: 1847,
  totalToolCalls: 38412,
}

// Deterministic seeded PRNG (avoids re-randomization on re-render)
function seededRand(seed: number) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

// Generate 53-week heatmap anchored to today, wrapping back 1 year
// Tasks and MRs use INDEPENDENT RNGs so their intensities diverge visibly
export const mockActivityHeatmap: ActivityDay[] = (() => {
  const days: ActivityDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // End on this Saturday (end of current week)
  const endDate = new Date(today)
  const todayDow = (today.getDay() + 6) % 7 // Mon=0
  endDate.setDate(endDate.getDate() + (6 - todayDow))

  // Start 53 weeks back on a Monday
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 53 * 7 + 1)

  // Two independent RNGs with different seeds
  const taskRng = seededRand(42)
  const mrRng = seededRand(137)

  const current = new Date(startDate)
  while (current <= endDate) {
    if (current > today) {
      days.push({ date: current.toISOString().slice(0, 10), tasks: 0, mrs: 0, sessions: 0 })
    } else {
      const dow = current.getDay()
      const isWeekend = dow === 0 || dow === 6
      const daysFromEnd = Math.round((endDate.getTime() - current.getTime()) / DAY)
      const recencyFactor = Math.max(0.1, 1 - daysFromEnd / 400)

      // Tasks: peaks on Mon-Wed, lower Thu-Fri, minimal weekends
      const taskDayBias = isWeekend ? 0.15 : dow <= 3 ? 1.0 : 0.7
      const baseTasks = Math.round(taskRng() * 8 * recencyFactor * taskDayBias)

      // MRs: independent — peaks later in week (Wed-Fri), lag behind tasks
      const mrDayBias = isWeekend ? 0.1 : dow >= 3 ? 1.0 : 0.4
      const baseMrs = Math.round(mrRng() * 5 * recencyFactor * mrDayBias)

      const sessions = baseTasks + baseMrs + Math.round(taskRng() * 2 * recencyFactor)

      days.push({ date: current.toISOString().slice(0, 10), tasks: baseTasks, mrs: baseMrs, sessions })
    }
    current.setDate(current.getDate() + 1)
  }
  return days
})()

export const mockAgentTokenSplit: AgentTokenSplit[] = [
  { role: 'worker', label: 'Workers', tokens: 667_500_000, color: 'var(--color-primary)' },
  { role: 'director', label: 'Directors', tokens: 178_000_000, color: '#8b5cf6' },
  { role: 'steward', label: 'Stewards', tokens: 44_700_000, color: 'var(--color-success)' },
]

export const mockModelTokenUsage: ModelTokenUsage[] = [
  { model: 'claude-sonnet-4-6', tokens: 520_100_000, color: 'var(--color-primary)' },
  { model: 'claude-opus-4-6', tokens: 310_400_000, color: '#8b5cf6' },
  { model: 'claude-haiku-4-5', tokens: 59_700_000, color: '#f97316' },
]

export const mockCodeChurn: CodeChurn = {
  linesAdded: 42847,
  linesRemoved: 18312,
  totalChanged: 61159,
}

export const mockUsageInsights: UsageInsightCard[] = [
  { label: 'Tracked MRs', value: '127', subtitle: '52 merged \u00b7 68 open' },
  { label: 'Merge rate', value: '41%', subtitle: '284 sessions with MRs' },
  { label: 'Largest session', value: '12.8M', subtitle: 'Tokens \u00b7 Director Alpha' },
  { label: 'Avg tokens / session', value: '482K', subtitle: '1,847 sessions' },
  { label: 'Tool calls / session', value: '20.8', subtitle: 'Across all tool calls' },
  { label: 'Cache hit ratio', value: '89%', subtitle: 'Cached / total input tokens' },
]

// ── Series filtering helper ──

export function filterSeries(series: TimeSeriesPoint[], range: TimeRange): TimeSeriesPoint[] {
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30
  return series.slice(-days)
}

// ── Trend comparison helper ──

export function computeTrend(series: TimeSeriesPoint[], range: TimeRange): { current: number; previous: number; delta: number } {
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30
  const current = series.slice(-days).reduce((s, p) => s + p.value, 0)
  const previous = series.slice(-days * 2, -days).reduce((s, p) => s + p.value, 0)
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0
  return { current: Math.round(current * 10) / 10, previous: Math.round(previous * 10) / 10, delta }
}
