/**
 * @stoneforge/ui Workflow Progress Dashboard
 *
 * Displays workflow execution progress with stats, progress bar, task list, and dependencies.
 */

import { useMemo } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ArrowRight,
  Circle,
  Play,
  AlertTriangle,
  ListTodo,
  Terminal,
  XCircle,
} from 'lucide-react';
import type {
  Workflow,
  WorkflowTask,
  WorkflowProgress,
  WorkflowDependency,
  WorkflowStatus,
  WorkflowFunctionStep,
  WorkflowStep,
} from '../types';
import { isWorkflowFunctionStep } from '../types';
import { WORKFLOW_STATUS_CONFIG } from '../constants';

// ============================================================================
// Types
// ============================================================================

interface WorkflowProgressDashboardProps {
  workflow: Workflow;
  tasks: WorkflowTask[];
  functionSteps?: WorkflowFunctionStep[];
  steps?: WorkflowStep[];
  progress: WorkflowProgress;
  dependencies: WorkflowDependency[];
  isLoading?: boolean;
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function DashboardProgressBar({ progress }: { progress: WorkflowProgress }) {
  const { percentage, completed, inProgress, blocked, open, total } = progress;

  // Calculate segment widths
  const completedWidth = total > 0 ? (completed / total) * 100 : 0;
  const inProgressWidth = total > 0 ? (inProgress / total) * 100 : 0;
  const blockedWidth = total > 0 ? (blocked / total) * 100 : 0;

  return (
    <div className="space-y-3" data-testid="workflow-progress-bar">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">Progress</span>
        <span className="text-sm text-[var(--color-text-secondary)]">{percentage}% complete</span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-3 bg-[var(--color-surface-elevated)] rounded-full overflow-hidden flex">
        {completedWidth > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${completedWidth}%` }}
            title={`Completed: ${completed}`}
          />
        )}
        {inProgressWidth > 0 && (
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${inProgressWidth}%` }}
            title={`In Progress: ${inProgress}`}
          />
        )}
        {blockedWidth > 0 && (
          <div
            className="bg-red-400 transition-all duration-500"
            style={{ width: `${blockedWidth}%` }}
            title={`Blocked: ${blocked}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-[var(--color-text-secondary)]">Completed ({completed})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-[var(--color-text-secondary)]">In Progress ({inProgress})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-[var(--color-text-secondary)]">Blocked ({blocked})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span className="text-[var(--color-text-secondary)]">Open ({open})</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Stats Cards Component
// ============================================================================

function StatsCards({ progress }: { progress: WorkflowProgress }) {
  const stats = [
    {
      label: 'Total Tasks',
      value: progress.total,
      icon: ListTodo,
      color: 'text-[var(--color-text)]',
      bgColor: 'bg-[var(--color-surface-elevated)]',
    },
    {
      label: 'Completed',
      value: progress.completed,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'In Progress',
      value: progress.inProgress,
      icon: Play,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Blocked',
      value: progress.blocked,
      icon: AlertCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="workflow-stats-cards">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`p-3 rounded-lg ${stat.bgColor}`}
          data-testid={`stat-card-${stat.label.toLowerCase().replace(' ', '-')}`}
        >
          <div className="flex items-center gap-2">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className={`text-xl font-semibold ${stat.color}`}>{stat.value}</span>
          </div>
          <span className="text-xs text-[var(--color-text-secondary)]">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Task List Item Component
// ============================================================================

interface TaskListItemProps {
  task: WorkflowTask;
  dependsOn: string[];
  blockedBy: string[];
}

function TaskListItem({ task, dependsOn, blockedBy }: TaskListItemProps) {
  const statusIcon = useMemo(() => {
    switch (task.status) {
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'blocked':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'open':
        return <Circle className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  }, [task.status]);

  return (
    <div
      className="flex items-center gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors"
      data-testid={`workflow-task-${task.id}`}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">{statusIcon}</div>

      {/* Task Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)] truncate">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className={`px-1.5 py-0.5 rounded ${getTaskStatusStyle(task.status)}`}>
            {task.status.replace('_', ' ')}
          </span>
          {dependsOn.length > 0 && (
            <span className="text-[var(--color-text-tertiary)]">
              Depends on {dependsOn.length} task{dependsOn.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Blocked indicator */}
      {blockedBy.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Blocked</span>
        </div>
      )}
    </div>
  );
}

function getTaskStatusStyle(status: string): string {
  switch (status) {
    case 'closed':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'blocked':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    case 'in_progress':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
  }
}

// ============================================================================
// Function Step List Item Component
// ============================================================================

interface FunctionStepListItemProps {
  step: WorkflowFunctionStep;
  dependsOn: string[];
  blockedBy: string[];
}

function FunctionStepListItem({ step, dependsOn, blockedBy }: FunctionStepListItemProps) {
  const statusIcon = useMemo(() => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  }, [step.status]);

  const runtimeLabel = useMemo(() => {
    const runtime = step.runtime;
    switch (runtime) {
      case 'typescript':
        return 'TS';
      case 'python':
        return 'PY';
      case 'shell':
        return 'SH';
      default:
        return (runtime as string)?.toUpperCase() ?? '';
    }
  }, [step.runtime]);

  const getRuntimeColor = (runtime: string) => {
    switch (runtime) {
      case 'typescript':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      case 'python':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
      case 'shell':
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
      default:
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    }
  };

  const getFunctionStatusStyle = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'running':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <div
      className="flex items-center gap-3 p-3 border border-purple-200 dark:border-purple-800/50 rounded-lg bg-purple-50/50 dark:bg-purple-900/10 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors"
      data-testid={`workflow-function-step-${step.id}`}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">{statusIcon}</div>

      {/* Function indicator */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-center w-6 h-6 rounded bg-purple-100 dark:bg-purple-900/30">
          <Terminal className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      {/* Step Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)] truncate">
            {step.title}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${getRuntimeColor(step.runtime)}`}>
            {runtimeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className={`px-1.5 py-0.5 rounded ${getFunctionStatusStyle(step.status)}`}>
            {step.status}
          </span>
          {dependsOn.length > 0 && (
            <span className="text-[var(--color-text-tertiary)]">
              Depends on {dependsOn.length} step{dependsOn.length > 1 ? 's' : ''}
            </span>
          )}
          {step.timeout && (
            <span className="text-[var(--color-text-tertiary)]">
              Timeout: {step.timeout / 1000}s
            </span>
          )}
        </div>
      </div>

      {/* Error indicator */}
      {step.error && (
        <div className="flex items-center gap-1 text-xs text-red-500" title={step.error}>
          <AlertTriangle className="w-3 h-3" />
          <span>Error</span>
        </div>
      )}

      {/* Blocked indicator */}
      {blockedBy.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Blocked</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step List Component (handles both tasks and function steps)
// ============================================================================

function StepList({
  tasks,
  functionSteps = [],
  steps = [],
  dependencies,
}: {
  tasks: WorkflowTask[];
  functionSteps?: WorkflowFunctionStep[];
  steps?: WorkflowStep[];
  dependencies: WorkflowDependency[];
}) {
  // Build dependency maps
  const { dependsOnMap, blockedByMap } = useMemo(() => {
    const dependsOn = new Map<string, string[]>();
    const blockedBy = new Map<string, string[]>();

    for (const dep of dependencies) {
      if (!dependsOn.has(dep.blockedId)) {
        dependsOn.set(dep.blockedId, []);
      }
      dependsOn.get(dep.blockedId)!.push(dep.blockerId);

      if (!blockedBy.has(dep.blockerId)) {
        blockedBy.set(dep.blockerId, []);
      }
      blockedBy.get(dep.blockerId)!.push(dep.blockedId);
    }

    return { dependsOnMap: dependsOn, blockedByMap: blockedBy };
  }, [dependencies]);

  // Combine and sort all steps by status priority
  const sortedSteps = useMemo(() => {
    // If steps array is provided, use it directly
    let allSteps: WorkflowStep[] = steps.length > 0
      ? steps
      : [...tasks, ...functionSteps];

    const statusOrder: Record<string, number> = {
      // Task statuses
      in_progress: 0,
      running: 0, // Function step running
      blocked: 1,
      open: 2,
      pending: 2, // Function step pending
      closed: 3,
      completed: 3, // Function step completed
      failed: 4,
      deferred: 5,
      tombstone: 6,
    };

    return allSteps.sort((a, b) => {
      const aOrder = statusOrder[a.status] ?? 99;
      const bOrder = statusOrder[b.status] ?? 99;
      return aOrder - bOrder;
    });
  }, [tasks, functionSteps, steps]);

  if (sortedSteps.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--color-text-secondary)]">
        No steps in this workflow
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="workflow-step-list">
      {sortedSteps.map((step) => {
        if (isWorkflowFunctionStep(step)) {
          return (
            <FunctionStepListItem
              key={step.id}
              step={step}
              dependsOn={dependsOnMap.get(step.id) ?? []}
              blockedBy={blockedByMap.get(step.id) ?? []}
            />
          );
        }
        return (
          <TaskListItem
            key={step.id}
            task={step as WorkflowTask}
            dependsOn={dependsOnMap.get(step.id) ?? []}
            blockedBy={blockedByMap.get(step.id) ?? []}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Dependency Graph Component
// ============================================================================

function DependencyGraph({
  tasks,
  dependencies,
}: {
  tasks: WorkflowTask[];
  dependencies: WorkflowDependency[];
}) {
  const taskMap = useMemo(() => {
    const map = new Map<string, WorkflowTask>();
    for (const task of tasks) {
      map.set(task.id, task);
    }
    return map;
  }, [tasks]);

  if (dependencies.length === 0) {
    return (
      <div className="text-center py-4 text-[var(--color-text-tertiary)] text-sm">
        No dependencies between tasks
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed':
        return 'border-green-500 bg-green-100 dark:bg-green-900/30';
      case 'in_progress':
        return 'border-blue-500 bg-blue-100 dark:bg-blue-900/30';
      case 'blocked':
        return 'border-red-400 bg-red-100 dark:bg-red-900/30';
      default:
        return 'border-gray-300 bg-gray-100 dark:bg-gray-800';
    }
  };

  return (
    <div className="space-y-3" data-testid="workflow-dependency-graph">
      <div className="text-xs text-[var(--color-text-secondary)] mb-2">
        Task dependencies ({dependencies.length} connection{dependencies.length !== 1 ? 's' : ''})
      </div>
      <div className="space-y-2 overflow-x-auto">
        {dependencies.slice(0, 10).map((dep, idx) => {
          const sourceTask = taskMap.get(dep.blockedId);
          const targetTask = taskMap.get(dep.blockerId);
          if (!sourceTask || !targetTask) return null;

          return (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <div
                className={`px-2 py-1 rounded border-2 ${getStatusColor(sourceTask.status)} truncate max-w-[150px]`}
                title={sourceTask.title}
              >
                {sourceTask.title}
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
              <div
                className={`px-2 py-1 rounded border-2 ${getStatusColor(targetTask.status)} truncate max-w-[150px]`}
                title={targetTask.title}
              >
                {targetTask.title}
              </div>
            </div>
          );
        })}
        {dependencies.length > 10 && (
          <div className="text-xs text-[var(--color-text-tertiary)]">
            ...and {dependencies.length - 10} more
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkflowProgressDashboard({
  workflow,
  tasks,
  functionSteps = [],
  steps = [],
  progress,
  dependencies,
  isLoading,
}: WorkflowProgressDashboardProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  const statusConfig = WORKFLOW_STATUS_CONFIG[workflow.status as WorkflowStatus];

  // Calculate total steps count (tasks + function steps)
  const totalSteps = steps.length > 0 ? steps.length : tasks.length + functionSteps.length;
  const hasFunctionSteps = functionSteps.length > 0 || steps.some(s => isWorkflowFunctionStep(s));

  return (
    <div className="space-y-6" data-testid="workflow-progress-dashboard">
      {/* Workflow Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {workflow.title}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {totalSteps} step{totalSteps !== 1 ? 's' : ''} in workflow
            {hasFunctionSteps && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Terminal className="w-3 h-3 text-purple-500" />
                <span className="text-purple-600 dark:text-purple-400">
                  includes function steps
                </span>
              </span>
            )}
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig?.bgColor ?? ''} ${statusConfig?.color ?? ''}`}>
          {statusConfig?.label ?? workflow.status}
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCards progress={progress} />

      {/* Progress Bar */}
      <DashboardProgressBar progress={progress} />

      {/* Two Column Layout: Step List and Dependencies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step List - 2 columns */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3">Steps</h3>
          <StepList
            tasks={tasks}
            functionSteps={functionSteps}
            steps={steps}
            dependencies={dependencies}
          />
        </div>

        {/* Dependencies - 1 column */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3">Dependencies</h3>
          <div className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
            <DependencyGraph tasks={tasks} dependencies={dependencies} />
          </div>
        </div>
      </div>
    </div>
  );
}
