/**
 * AgentNode - Custom node renderer for agent hierarchy graph
 *
 * Renders agent information including status, current task, and health indicators.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  User,
  Crown,
  Zap,
  Shield,
  Circle,
  GitBranch,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Terminal,
} from 'lucide-react';
import type { AgentNodeData } from './types';

interface AgentNodeComponentProps {
  data: AgentNodeData;
  selected: boolean;
  id: string;
}

/**
 * Icon mapping for node types
 */
const nodeTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  human: User,
  director: Crown,
  worker: Zap,
  steward: Shield,
};

/**
 * Status color mapping
 */
const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  running: {
    bg: 'bg-[var(--color-success-muted)]',
    text: 'text-[var(--color-success-text)]',
    border: 'border-[var(--color-success)]',
  },
  idle: {
    bg: 'bg-[var(--color-surface-elevated)]',
    text: 'text-[var(--color-text-secondary)]',
    border: 'border-[var(--color-border)]',
  },
  suspended: {
    bg: 'bg-[var(--color-warning-muted)]',
    text: 'text-[var(--color-warning-text)]',
    border: 'border-[var(--color-warning)]',
  },
  terminated: {
    bg: 'bg-[var(--color-surface)]',
    text: 'text-[var(--color-text-tertiary)]',
    border: 'border-[var(--color-border-subtle)]',
  },
  starting: {
    bg: 'bg-[var(--color-info-muted)]',
    text: 'text-[var(--color-info-text)]',
    border: 'border-[var(--color-info)]',
  },
};

/**
 * Health indicator icons
 */
const healthIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  healthy: { icon: CheckCircle, color: 'text-[var(--color-success)]' },
  warning: { icon: AlertTriangle, color: 'text-[var(--color-warning)]' },
  error: { icon: XCircle, color: 'text-[var(--color-error)]' },
};

function AgentNodeComponent({ data, selected }: AgentNodeComponentProps) {
  const { label, nodeType, agent, status = 'idle', currentTask, branch, healthIndicator } = data;

  const Icon = nodeTypeIcons[nodeType] || User;
  const colors = statusColors[status] || statusColors.idle;
  const healthConfig = healthIndicator ? healthIcons[healthIndicator] : null;
  const HealthIcon = healthConfig?.icon;
  const isHuman = nodeType === 'human';
  // Agent nodes are clickable if they have an agent (the click is handled at ReactFlow level)
  const isClickable = !!agent;

  return (
    <div
      className={`
        relative min-w-[180px] max-w-[220px] rounded-lg border-2 shadow-sm transition-all duration-200
        ${colors.bg} ${colors.border}
        ${selected ? 'ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-bg)]' : ''}
        ${isClickable ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''}
        ${isHuman ? 'border-dashed' : ''}
      `}
      data-testid={`graph-node-${agent?.id || nodeType}`}
    >
      {/* Source handle (top) - for nodes that report to someone */}
      {!isHuman && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-[var(--color-border)] !border-[var(--color-bg)] !w-3 !h-3"
          data-testid={`handle-target-${agent?.id || nodeType}`}
        />
      )}

      {/* Node content */}
      <div className="p-3">
        {/* Header with icon and label */}
        <div className="flex items-center gap-2">
          <div
            className={`
              p-1.5 rounded-md
              ${isHuman ? 'bg-[var(--color-accent-muted)]' : colors.bg}
            `}
          >
            <Icon
              className={`w-4 h-4 ${isHuman ? 'text-[var(--color-accent)]' : colors.text}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className="font-semibold text-sm text-[var(--color-text)] truncate"
              title={label}
            >
              {label}
            </h4>
            {!isHuman && (
              <span className={`text-xs ${colors.text} capitalize`}>
                {status}
              </span>
            )}
          </div>
          {/* Health indicator */}
          {HealthIcon && (
            <HealthIcon className={`w-4 h-4 ${healthConfig?.color}`} />
          )}
        </div>

        {/* Current task */}
        {currentTask && (
          <div className="mt-2 px-2 py-1 rounded bg-[var(--color-surface)] border border-[var(--color-border-subtle)]">
            <p
              className="text-xs text-[var(--color-text-secondary)] truncate"
              title={currentTask.title}
            >
              {currentTask.title}
            </p>
          </div>
        )}

        {/* Branch info */}
        {branch && (
          <div className="mt-2 flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
            <GitBranch className="w-3 h-3" />
            <span className="truncate font-mono" title={branch}>
              {branch}
            </span>
          </div>
        )}

        {/* Open in workspace indicator for agents with running sessions */}
        {isClickable && (status === 'running' || status === 'starting') && (
          <div className="mt-2 flex items-center gap-1 text-xs text-[var(--color-primary)]">
            <Terminal className="w-3 h-3" />
            <span>Open in Workspace</span>
          </div>
        )}

        {/* Running indicator */}
        {status === 'running' && (
          <div className="absolute top-2 right-2">
            <Circle className="w-2 h-2 fill-[var(--color-success)] text-[var(--color-success)] animate-pulse" />
          </div>
        )}
      </div>

      {/* Target handle (bottom) - for nodes that supervise others */}
      {(isHuman || nodeType === 'director') && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-[var(--color-border)] !border-[var(--color-bg)] !w-3 !h-3"
          data-testid={`handle-source-${agent?.id || nodeType}`}
        />
      )}
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
