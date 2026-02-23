/**
 * Metrics Page - Comprehensive orchestrator performance dashboard
 *
 * Provides actionable insights into workspace health:
 * - Summary stats with contextual indicators
 * - Task throughput trends over configurable time ranges
 * - Agent performance and workload distribution
 * - Plan progress tracking
 * - Queue health and merge pipeline status
 * - Provider and model analytics (token usage, error rates, cost)
 *
 * Uses shared visualization components from @stoneforge/ui/visualizations
 */

import {
  BarChart3,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Users,
  Clock,
  GitMerge,
  Activity,
  Zap,
  Target,
  ChevronDown,
  Cpu,
  DollarSign,
  Hash,
  Layers,
} from 'lucide-react';
import {
  StatusPieChart,
  TrendLineChart,
  HorizontalBarChart,
  type PieChartDataPoint,
  type LineChartDataPoint,
  type BarChartDataPoint,
} from '@stoneforge/ui/visualizations';
import { useTasksByStatus } from '../../api/hooks/useTasks';
import { useAgents, useAgentsByRole } from '../../api/hooks/useAgents';
import { useAllPlans } from '../../api/hooks/useAllElements';
import { useMergeRequestCounts } from '../../api/hooks/useMergeRequests';
import { useProviderMetrics } from '../../api/hooks/useProviderMetrics';
import { useState, useMemo, useRef, useEffect } from 'react';
import type { Task } from '../../api/types';

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  in_progress: '#eab308',
  blocked: '#ef4444',
  closed: '#22c55e',
  unassigned: '#6b7280',
  review: '#8b5cf6',
  backlog: '#94a3b8',
  deferred: '#a78bfa',
};

const PRIORITY_COLORS: Record<number, string> = {
  1: '#ef4444', // Critical
  2: '#f97316', // High
  3: '#eab308', // Medium
  4: '#3b82f6', // Low
  5: '#6b7280', // Minimal
};

const TIME_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
] as const;

type TimeRange = (typeof TIME_RANGES)[number];

const PROVIDER_COLORS: string[] = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f97316', // orange
  '#22c55e', // green
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ef4444', // red
];

/** Rough cost estimate per 1M tokens (input/output blended) */
const ESTIMATED_COST_PER_MILLION_TOKENS = 5.0;

// ============================================================================
// Helper Functions
// ============================================================================

function getTasksCompletedInRange(closed: Task[], days: number): Task[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return closed.filter(t => {
    const completedAt = t.metadata?.orchestrator?.completedAt || t.updatedAt;
    return new Date(completedAt) >= cutoff;
  });
}

function getTasksCompletedToday(closed: Task[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return closed.filter(t => {
    const completedAt = t.metadata?.orchestrator?.completedAt || t.updatedAt;
    return new Date(completedAt) >= today;
  }).length;
}

function formatDuration(ms: number): string {
  if (ms < 60000) return '<1m';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function computeAvgCompletionTime(closed: Task[]): string {
  const tasksWithTimes = closed.filter(t => {
    const meta = t.metadata?.orchestrator;
    return meta?.startedAt && meta?.completedAt;
  });

  if (tasksWithTimes.length === 0) return '—';

  const totalMs = tasksWithTimes.reduce((sum, t) => {
    const meta = t.metadata?.orchestrator;
    const start = new Date(meta!.startedAt!).getTime();
    const end = new Date(meta!.completedAt!).getTime();
    return sum + Math.max(0, end - start);
  }, 0);

  return formatDuration(totalMs / tasksWithTimes.length);
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatCost(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount > 0) return `$${amount.toFixed(4)}`;
  return '$0.00';
}

// ============================================================================
// Sub-Components
// ============================================================================

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  warning,
  testId,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  trend?: { value: number; label: string } | null;
  warning?: boolean;
  testId: string;
}) {
  return (
    <div
      className={`p-4 rounded-lg border bg-[var(--color-card-bg)] transition-colors duration-150 ${
        warning
          ? 'border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_5%,var(--color-card-bg))]'
          : 'border-[var(--color-border)]'
      }`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</span>
        <div className={`p-1.5 rounded-md ${iconColor}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-text)] tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-tertiary)]">{subtitle}</span>
        {trend && trend.value !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              trend.value > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
            }`}
          >
            {trend.value > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend.value > 0 ? '+' : ''}
            {trend.value}
            <span className="text-[var(--color-text-tertiary)] font-normal ml-0.5">
              {trend.label}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function TimeRangeSelector({
  selected,
  onSelect,
}: {
  selected: TimeRange;
  onSelect: (range: TimeRange) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
        data-testid="metrics-timerange"
      >
        <Calendar className="w-4 h-4" />
        {selected.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-card-bg)] shadow-lg z-20">
          {TIME_RANGES.map(range => (
            <button
              key={range.days}
              onClick={() => {
                onSelect(range);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors duration-100 first:rounded-t-md last:rounded-b-md ${
                range.days === selected.days
                  ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-[var(--color-text-tertiary)]" />
      <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
        {title}
      </h2>
    </div>
  );
}

function PlanProgressSection({
  plans,
  allTasks,
  isLoading,
}: {
  plans: Array<{ id: string; title: string; status: string }>;
  allTasks: Task[];
  isLoading: boolean;
}) {
  const planProgress = useMemo(() => {
    if (!plans || plans.length === 0) return [];

    return plans
      .filter(p => p.status !== 'closed' && p.status !== 'completed')
      .map(plan => {
        // Tasks have tags like `plan:<plan-id>` or metadata referencing the plan
        const planTasks = allTasks.filter(
          t =>
            t.tags?.includes(`plan:${plan.id}`) ||
            (t.metadata as Record<string, unknown>)?.planId === plan.id
        );

        const total = planTasks.length;
        const completed = planTasks.filter(t => t.status === 'closed').length;
        const inProgress = planTasks.filter(t => t.status === 'in_progress').length;
        const blocked = planTasks.filter(t => t.status === 'blocked').length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          id: plan.id,
          title: plan.title,
          total,
          completed,
          inProgress,
          blocked,
          pct,
        };
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [plans, allTasks]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Plan Progress</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-[var(--color-surface-hover)] rounded w-1/3 mb-2" />
              <div className="h-2 bg-[var(--color-surface-hover)] rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (planProgress.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Plan Progress</h3>
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-tertiary)]">
          <Target className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No active plans with tasks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Plan Progress</h3>
      <div className="space-y-4">
        {planProgress.map(plan => (
          <div key={plan.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-sm text-[var(--color-text)] truncate max-w-[70%]"
                title={plan.title}
              >
                {plan.title}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums whitespace-nowrap ml-2">
                {plan.completed}/{plan.total} ({plan.pct}%)
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-[var(--color-surface-hover)] overflow-hidden">
              {/* Completed segment */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-success)] transition-all duration-500"
                style={{ width: `${plan.pct}%` }}
              />
              {/* In-progress segment */}
              {plan.inProgress > 0 && plan.total > 0 && (
                <div
                  className="absolute inset-y-0 rounded-full bg-[#eab308] opacity-70 transition-all duration-500"
                  style={{
                    left: `${plan.pct}%`,
                    width: `${Math.round((plan.inProgress / plan.total) * 100)}%`,
                  }}
                />
              )}
              {/* Blocked segment */}
              {plan.blocked > 0 && plan.total > 0 && (
                <div
                  className="absolute inset-y-0 rounded-full bg-[var(--color-error)] opacity-70 transition-all duration-500"
                  style={{
                    left: `${Math.round(((plan.completed + plan.inProgress) / plan.total) * 100)}%`,
                    width: `${Math.round((plan.blocked / plan.total) * 100)}%`,
                  }}
                />
              )}
            </div>
            {(plan.inProgress > 0 || plan.blocked > 0) && (
              <div className="flex gap-3 mt-1">
                {plan.inProgress > 0 && (
                  <span className="text-[10px] text-[#eab308]">{plan.inProgress} in progress</span>
                )}
                {plan.blocked > 0 && (
                  <span className="text-[10px] text-[var(--color-error)]">
                    {plan.blocked} blocked
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MergePipelineCard({
  counts,
  isLoading,
}: {
  counts: { needsReview: number; testing: number; conflicts: number; merged: number };
  isLoading: boolean;
}) {
  const stages = [
    { label: 'Needs Review', value: counts.needsReview, color: '#eab308' },
    { label: 'Testing', value: counts.testing, color: '#3b82f6' },
    { label: 'Conflicts', value: counts.conflicts, color: '#ef4444' },
    { label: 'Merged', value: counts.merged, color: '#22c55e' },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Merge Pipeline</h3>
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-[var(--color-surface-hover)] rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {stages.map(stage => (
            <div key={stage.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm text-[var(--color-text-secondary)]">{stage.label}</span>
              </div>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  stage.value > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                {stage.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QueueHealthCard({
  unassigned,
  blocked,
  inProgress,
  allTasks,
  isLoading,
}: {
  unassigned: Task[];
  blocked: Task[];
  inProgress: Task[];
  allTasks: Task[];
  isLoading: boolean;
}) {
  const oldestUnassigned = useMemo(() => {
    if (unassigned.length === 0) return null;
    const oldest = unassigned.reduce((prev, curr) =>
      new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr
    );
    const ageMs = Date.now() - new Date(oldest.createdAt).getTime();
    return formatDuration(ageMs);
  }, [unassigned]);

  const healthScore = useMemo(() => {
    const totalActive = allTasks.filter(
      t => t.status !== 'closed' && t.status !== 'tombstone' && t.status !== 'backlog'
    ).length;
    if (totalActive === 0) return 100;

    let score = 100;
    // Penalize for blocked tasks
    score -= Math.min(40, (blocked.length / Math.max(1, totalActive)) * 100);
    // Penalize for unassigned tasks
    score -= Math.min(30, (unassigned.length / Math.max(1, totalActive)) * 60);
    return Math.max(0, Math.round(score));
  }, [allTasks, blocked, unassigned]);

  const healthColor =
    healthScore >= 80
      ? 'text-[var(--color-success)]'
      : healthScore >= 50
        ? 'text-[#eab308]'
        : 'text-[var(--color-error)]';

  const indicators = [
    { label: 'Unassigned', value: unassigned.length, warn: unassigned.length > 3 },
    { label: 'Blocked', value: blocked.length, warn: blocked.length > 0 },
    { label: 'In Progress', value: inProgress.length, warn: false },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Queue Health</h3>
        <span className={`text-lg font-bold tabular-nums ${healthColor}`}>{healthScore}%</span>
      </div>
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-[var(--color-surface-hover)] rounded" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {indicators.map(ind => (
              <div key={ind.label} className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text-secondary)]">{ind.label}</span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    ind.warn ? 'text-[var(--color-warning)]' : 'text-[var(--color-text)]'
                  }`}
                >
                  {ind.value}
                  {ind.warn && <AlertTriangle className="w-3 h-3 inline ml-1 -mt-0.5" />}
                </span>
              </div>
            ))}
          </div>
          {oldestUnassigned && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-tertiary)]">Oldest unassigned</span>
                <span className="text-[var(--color-text-secondary)] font-medium tabular-nums">
                  {oldestUnassigned} ago
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MetricsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>(TIME_RANGES[0]);

  // Data sources
  const {
    backlog,
    unassigned,
    assigned,
    inProgress,
    blocked,
    closed,
    awaitingMerge,
    allTasks,
    isLoading: tasksLoading,
    error: tasksError,
  } = useTasksByStatus();

  const { data: agentsResponse, isLoading: agentsLoading, error: agentsError } = useAgents();
  const agents = agentsResponse?.agents ?? [];

  const { workers, stewards } = useAgentsByRole();

  const { data: plans, isLoading: plansLoading } = useAllPlans();

  const { counts: mergeCounts, isLoading: mergeLoading } = useMergeRequestCounts();

  // Provider metrics — fetch both provider-grouped aggregates and time series
  const {
    data: providerMetricsData,
    isLoading: providerMetricsLoading,
    error: providerMetricsError,
  } = useProviderMetrics({
    days: timeRange.days,
    groupBy: 'provider',
    includeSeries: true,
  });

  // Also fetch model-grouped aggregates for the token trend chart
  const {
    data: modelMetricsData,
    isLoading: modelMetricsLoading,
    error: modelMetricsError,
  } = useProviderMetrics({
    days: timeRange.days,
    groupBy: 'model',
    includeSeries: true,
  });

  const isLoading = tasksLoading || agentsLoading;
  const isError = !!(tasksError || agentsError);

  const isProviderMetricsLoading = providerMetricsLoading || modelMetricsLoading;
  const isProviderMetricsError = !!(providerMetricsError || modelMetricsError);

  // ========================================================================
  // Computed metrics
  // ========================================================================

  const activeAgents = useMemo(
    () => agents.filter(a => a.metadata?.agent?.sessionStatus === 'running').length,
    [agents]
  );

  const totalAgents = agents.length;

  const completedInRange = useMemo(
    () => getTasksCompletedInRange(closed, timeRange.days),
    [closed, timeRange.days]
  );

  const completedToday = useMemo(() => getTasksCompletedToday(closed), [closed]);

  // Trend: compare current period vs previous period
  const completionTrend = useMemo(() => {
    const currentCount = completedInRange.length;
    const previousRange = getTasksCompletedInRange(closed, timeRange.days * 2).length - currentCount;
    const diff = currentCount - previousRange;
    return { value: diff, label: 'vs prev' };
  }, [completedInRange, closed, timeRange.days]);

  const avgCompletionTime = useMemo(() => computeAvgCompletionTime(completedInRange), [completedInRange]);

  // ========================================================================
  // Chart data
  // ========================================================================

  // Task Status Distribution (pie)
  const taskStatusData = useMemo((): PieChartDataPoint[] => {
    return [
      { name: 'Open', value: assigned.length, key: 'open', color: STATUS_COLORS.open },
      {
        name: 'In Progress',
        value: inProgress.length,
        key: 'in_progress',
        color: STATUS_COLORS.in_progress,
      },
      { name: 'Blocked', value: blocked.length, key: 'blocked', color: STATUS_COLORS.blocked },
      { name: 'Completed', value: closed.length, key: 'closed', color: STATUS_COLORS.closed },
      { name: 'Review', value: awaitingMerge.length, key: 'review', color: STATUS_COLORS.review },
      { name: 'Backlog', value: backlog.length, key: 'backlog', color: STATUS_COLORS.backlog },
    ].filter(d => d.value > 0);
  }, [assigned.length, inProgress.length, blocked.length, closed.length, awaitingMerge.length, backlog.length]);

  // Completion trend over time (line chart)
  const completionTrendData = useMemo((): LineChartDataPoint[] => {
    const days: LineChartDataPoint[] = [];
    const now = new Date();
    const numDays = timeRange.days;

    for (let i = numDays - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayLabel =
        i === 0
          ? 'Today'
          : numDays <= 7
            ? date.toLocaleDateString('en-US', { weekday: 'short' })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const tasksOnDay = closed.filter(t => {
        const completedAt = t.metadata?.orchestrator?.completedAt || t.updatedAt;
        const taskDate = new Date(completedAt);
        return taskDate >= date && taskDate < nextDate;
      }).length;

      days.push({
        label: dayLabel,
        value: tasksOnDay,
        date: date.toISOString().split('T')[0],
      });
    }

    return days;
  }, [closed, timeRange.days]);

  // Workload by agent (bar chart - active tasks)
  const workloadByAgentData = useMemo((): BarChartDataPoint[] => {
    const agentWorkload: Record<string, { name: string; count: number }> = {};

    const activeTasks = [...assigned, ...inProgress, ...blocked];
    activeTasks.forEach(task => {
      if (task.assignee) {
        const agent = agents.find(a => a.id === task.assignee);
        const name = agent?.name || task.assignee.slice(0, 8);
        if (!agentWorkload[task.assignee]) {
          agentWorkload[task.assignee] = { name, count: 0 };
        }
        agentWorkload[task.assignee].count++;
      }
    });

    const total = Object.values(agentWorkload).reduce((sum, { count }) => sum + count, 0);

    return Object.entries(agentWorkload)
      .map(([id, { name, count }]) => ({
        name,
        value: count,
        id,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [assigned, inProgress, blocked, agents]);

  // Agent performance (bar chart - completed tasks per agent)
  const agentPerformanceData = useMemo((): BarChartDataPoint[] => {
    const agentCompletions: Record<string, { name: string; count: number }> = {};

    completedInRange.forEach(task => {
      // Use session history to find which agent completed the task
      const meta = task.metadata?.orchestrator;
      const agentId = meta?.assignedAgent || task.assignee;
      if (agentId) {
        const agent = agents.find(a => a.id === agentId);
        const name = agent?.name || agentId.slice(0, 8);
        if (!agentCompletions[agentId]) {
          agentCompletions[agentId] = { name, count: 0 };
        }
        agentCompletions[agentId].count++;
      }
    });

    const total = Object.values(agentCompletions).reduce((sum, { count }) => sum + count, 0);

    return Object.entries(agentCompletions)
      .map(([id, { name, count }]) => ({
        name,
        value: count,
        id,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [completedInRange, agents]);

  // Priority distribution (pie)
  const priorityDistributionData = useMemo((): PieChartDataPoint[] => {
    const activeTasks = allTasks.filter(
      t => t.status !== 'closed' && t.status !== 'tombstone'
    );

    const priorityNames: Record<number, string> = {
      1: 'Critical',
      2: 'High',
      3: 'Medium',
      4: 'Low',
      5: 'Minimal',
    };

    const counts: Record<number, number> = {};
    activeTasks.forEach(t => {
      counts[t.priority] = (counts[t.priority] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([priority, count]) => ({
        name: priorityNames[Number(priority)] || `P${priority}`,
        value: count,
        key: `p${priority}`,
        color: PRIORITY_COLORS[Number(priority)] || '#6b7280',
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTasks]);

  // Task type distribution (pie)
  const taskTypeData = useMemo((): PieChartDataPoint[] => {
    const typeNames: Record<string, string> = {
      task: 'Task',
      feature: 'Feature',
      bug: 'Bug',
      chore: 'Chore',
    };

    const typeColors: Record<string, string> = {
      task: '#3b82f6',
      feature: '#8b5cf6',
      bug: '#ef4444',
      chore: '#6b7280',
    };

    const counts: Record<string, number> = {};
    allTasks
      .filter(t => t.status !== 'tombstone')
      .forEach(t => {
        counts[t.taskType] = (counts[t.taskType] || 0) + 1;
      });

    return Object.entries(counts)
      .map(([type, count]) => ({
        name: typeNames[type] || type,
        value: count,
        key: type,
        color: typeColors[type] || '#6b7280',
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [allTasks]);

  // ========================================================================
  // Provider & Model Analytics — computed data
  // ========================================================================

  const providerMetrics = providerMetricsData?.metrics ?? [];

  // Summary totals across all providers
  const providerSummary = useMemo(() => {
    const totalInputTokens = providerMetrics.reduce((s, m) => s + m.totalInputTokens, 0);
    const totalOutputTokens = providerMetrics.reduce((s, m) => s + m.totalOutputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalSessions = providerMetrics.reduce((s, m) => s + m.sessionCount, 0);
    const estimatedCost = (totalTokens / 1_000_000) * ESTIMATED_COST_PER_MILLION_TOKENS;
    return { totalInputTokens, totalOutputTokens, totalTokens, totalSessions, estimatedCost };
  }, [providerMetrics]);

  // Token usage trend line chart — aggregate time series across all models
  const tokenTrendData = useMemo((): LineChartDataPoint[] => {
    const series = modelMetricsData?.timeSeries ?? providerMetricsData?.timeSeries ?? [];
    if (series.length === 0) return [];

    // Aggregate tokens by bucket across all groups
    const bucketMap = new Map<string, number>();
    for (const point of series) {
      const existing = bucketMap.get(point.bucket) ?? 0;
      bucketMap.set(point.bucket, existing + point.totalInputTokens + point.totalOutputTokens);
    }

    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, totalTokens]) => {
        const date = new Date(bucket);
        const label =
          timeRange.days <= 7
            ? date.toLocaleDateString('en-US', { weekday: 'short' })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return { label, value: totalTokens, date: bucket };
      });
  }, [modelMetricsData?.timeSeries, providerMetricsData?.timeSeries, timeRange.days]);

  // Provider distribution pie chart — sessions by provider
  const providerDistributionData = useMemo((): PieChartDataPoint[] => {
    return providerMetrics
      .filter(m => m.sessionCount > 0)
      .map((m, i) => ({
        name: m.group,
        value: m.sessionCount,
        key: m.group,
        color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [providerMetrics]);

  // Error rate by provider (horizontal bar chart)
  const errorRateByProviderData = useMemo((): BarChartDataPoint[] => {
    return providerMetrics
      .filter(m => m.sessionCount > 0)
      .map(m => ({
        name: m.group,
        value: Math.round(m.errorRate * 1000) / 10, // Convert to percentage with 1 decimal
        id: m.group,
        percentage: Math.round(m.errorRate * 100),
      }))
      .sort((a, b) => b.value - a.value);
  }, [providerMetrics]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="space-y-6 animate-fade-in" data-testid="metrics-page">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Metrics</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Performance analytics and workspace health
            </p>
          </div>
        </div>
        <TimeRangeSelector selected={timeRange} onSelect={setTimeRange} />
      </div>

      {/* ================================================================ */}
      {/* Summary Stats Row */}
      {/* ================================================================ */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3"
        data-testid="stats-cards"
      >
        <StatCard
          label="Completed"
          value={completedInRange.length}
          subtitle={`${completedToday} today`}
          icon={CheckCircle2}
          iconColor="bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)]"
          trend={completionTrend}
          testId="stat-tasks-completed"
        />
        <StatCard
          label="Active Agents"
          value={`${activeAgents}/${totalAgents}`}
          subtitle={`${workers.length} workers, ${stewards.length} stewards`}
          icon={Users}
          iconColor="bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)]"
          testId="stat-active-agents"
        />
        <StatCard
          label="In Progress"
          value={inProgress.length}
          subtitle={`${assigned.length} assigned total`}
          icon={Activity}
          iconColor="bg-[color-mix(in_srgb,#eab308_15%,transparent)] text-[#eab308]"
          testId="stat-in-progress"
        />
        <StatCard
          label="Blocked"
          value={blocked.length}
          subtitle={`${unassigned.length} unassigned`}
          icon={AlertTriangle}
          iconColor="bg-[color-mix(in_srgb,var(--color-error)_15%,transparent)] text-[var(--color-error)]"
          warning={blocked.length > 0}
          testId="stat-blocked"
        />
        <StatCard
          label="Avg Completion"
          value={avgCompletionTime}
          subtitle={`${completedInRange.length} tasks measured`}
          icon={Clock}
          iconColor="bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]"
          testId="stat-avg-time"
        />
        <StatCard
          label="Merge Queue"
          value={awaitingMerge.length}
          subtitle={`${mergeCounts.merged} merged total`}
          icon={GitMerge}
          iconColor="bg-[color-mix(in_srgb,#8b5cf6_15%,transparent)] text-[#8b5cf6]"
          testId="stat-merge-queue"
        />
      </div>

      {/* ================================================================ */}
      {/* Activity & Performance Charts */}
      {/* ================================================================ */}
      <div>
        <SectionHeader title="Activity & Distribution" icon={TrendingUp} />
        <div
          className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="charts-grid-activity"
        >
          <TrendLineChart
            data={completionTrendData}
            title={`Task Completions (${timeRange.label})`}
            testId="tasks-completed-chart"
            isLoading={isLoading}
            isError={isError}
            errorMessage="Failed to load completion data"
            emptyMessage="No completions in this period"
            total={completedInRange.length}
            height={220}
          />

          <StatusPieChart
            data={taskStatusData}
            title="Task Status Distribution"
            testId="task-distribution-chart"
            isLoading={isLoading}
            isError={isError}
            errorMessage="Failed to load task data"
            emptyMessage="No tasks to display"
            height={220}
          />

          <StatusPieChart
            data={taskTypeData}
            title="Tasks by Type"
            testId="task-type-chart"
            isLoading={isLoading}
            isError={isError}
            errorMessage="Failed to load type data"
            emptyMessage="No tasks to display"
            height={220}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* Agent Performance & Workload */}
      {/* ================================================================ */}
      <div>
        <SectionHeader title="Agent Performance" icon={Zap} />
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          data-testid="charts-grid-agents"
        >
          <HorizontalBarChart
            data={agentPerformanceData}
            title={`Tasks Completed by Agent (${timeRange.label})`}
            testId="agent-performance-chart"
            isLoading={isLoading}
            isError={isError}
            errorMessage="Failed to load performance data"
            emptyMessage="No completed tasks in this period"
            barColor="#22c55e"
            height={240}
            maxBars={8}
          />

          <HorizontalBarChart
            data={workloadByAgentData}
            title="Current Workload by Agent"
            testId="workload-by-agent-chart"
            isLoading={isLoading}
            isError={isError}
            errorMessage="Failed to load workload data"
            emptyMessage="No assigned tasks"
            barColor="#3b82f6"
            height={240}
            maxBars={8}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* Plans, Queue Health & Merge Pipeline */}
      {/* ================================================================ */}
      <div>
        <SectionHeader title="Plans & Pipeline" icon={Target} />
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="charts-grid-health"
        >
          <PlanProgressSection
            plans={(plans ?? []) as Array<{ id: string; title: string; status: string }>}
            allTasks={allTasks}
            isLoading={plansLoading || tasksLoading}
          />

          <QueueHealthCard
            unassigned={unassigned}
            blocked={blocked}
            inProgress={inProgress}
            allTasks={allTasks}
            isLoading={tasksLoading}
          />

          <MergePipelineCard counts={mergeCounts} isLoading={mergeLoading} />
        </div>
      </div>

      {/* ================================================================ */}
      {/* Priority Distribution */}
      {/* ================================================================ */}
      <div>
        <SectionHeader title="Priority Analysis" icon={AlertTriangle} />
        <div
          className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="charts-grid-priority"
        >
          <StatusPieChart
            data={priorityDistributionData}
            title="Open Tasks by Priority"
            testId="priority-distribution-chart"
            isLoading={isLoading}
            isError={isError}
            errorMessage="Failed to load priority data"
            emptyMessage="No open tasks"
            height={220}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* Provider and Model Analytics */}
      {/* ================================================================ */}
      <div>
        <SectionHeader title="Provider and Model Analytics" icon={Cpu} />

        {/* Summary cards row */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4"
          data-testid="provider-stats-cards"
        >
          <StatCard
            label="Total Tokens"
            value={formatTokenCount(providerSummary.totalTokens)}
            subtitle={`${formatTokenCount(providerSummary.totalInputTokens)} in / ${formatTokenCount(providerSummary.totalOutputTokens)} out`}
            icon={Hash}
            iconColor="bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)]"
            testId="stat-total-tokens"
          />
          <StatCard
            label="Input Tokens"
            value={formatTokenCount(providerSummary.totalInputTokens)}
            subtitle={`${timeRange.label}`}
            icon={Layers}
            iconColor="bg-[color-mix(in_srgb,#8b5cf6_15%,transparent)] text-[#8b5cf6]"
            testId="stat-input-tokens"
          />
          <StatCard
            label="Total Sessions"
            value={providerSummary.totalSessions}
            subtitle={`across ${providerMetrics.length} provider${providerMetrics.length !== 1 ? 's' : ''}`}
            icon={Activity}
            iconColor="bg-[color-mix(in_srgb,#22c55e_15%,transparent)] text-[#22c55e]"
            testId="stat-total-sessions"
          />
          <StatCard
            label="Estimated Cost"
            value={formatCost(providerSummary.estimatedCost)}
            subtitle={`~$${ESTIMATED_COST_PER_MILLION_TOKENS}/M tokens`}
            icon={DollarSign}
            iconColor="bg-[color-mix(in_srgb,#eab308_15%,transparent)] text-[#eab308]"
            testId="stat-estimated-cost"
          />
        </div>

        {/* Charts row */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="charts-grid-provider"
        >
          <TrendLineChart
            data={tokenTrendData}
            title={`Token Usage (${timeRange.label})`}
            testId="token-usage-trend-chart"
            isLoading={isProviderMetricsLoading}
            isError={isProviderMetricsError}
            errorMessage="Failed to load token usage data"
            emptyMessage="No token usage recorded"
            total={providerSummary.totalTokens}
            height={220}
          />

          <StatusPieChart
            data={providerDistributionData}
            title="Sessions by Provider"
            testId="provider-distribution-chart"
            isLoading={isProviderMetricsLoading}
            isError={isProviderMetricsError}
            errorMessage="Failed to load provider data"
            emptyMessage="No provider data available"
            height={220}
          />

          <HorizontalBarChart
            data={errorRateByProviderData}
            title="Error Rate by Provider (%)"
            testId="error-rate-by-provider-chart"
            isLoading={isProviderMetricsLoading}
            isError={isProviderMetricsError}
            errorMessage="Failed to load error rate data"
            emptyMessage="No error data available"
            barColor="#ef4444"
            height={220}
            maxBars={8}
          />
        </div>
      </div>
    </div>
  );
}
