/**
 * AgentStatusBadge - Status indicator for agents
 *
 * Shows the current session status with appropriate styling.
 */

import { Circle, Loader2, Pause, Square, AlertCircle } from 'lucide-react';
import type { SessionStatus } from '../../api/types';

interface AgentStatusBadgeProps {
  status: SessionStatus | 'idle' | 'unknown' | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const statusConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  running: {
    label: 'Running',
    color: 'text-[var(--color-success-text)]',
    bgColor: 'bg-[var(--color-success-muted)]',
    icon: Circle,
  },
  idle: {
    label: 'Idle',
    color: 'text-[var(--color-text-secondary)]',
    bgColor: 'bg-[var(--color-surface-elevated)]',
    icon: Circle,
  },
  suspended: {
    label: 'Suspended',
    color: 'text-[var(--color-warning-text)]',
    bgColor: 'bg-[var(--color-warning-muted)]',
    icon: Pause,
  },
  terminated: {
    label: 'Stopped',
    color: 'text-[var(--color-text-tertiary)]',
    bgColor: 'bg-[var(--color-surface)]',
    icon: Square,
  },
  starting: {
    label: 'Starting',
    color: 'text-[var(--color-info-text)]',
    bgColor: 'bg-[var(--color-info-muted)]',
    icon: Loader2,
  },
  unknown: {
    label: 'Unknown',
    color: 'text-[var(--color-text-muted)]',
    bgColor: 'bg-[var(--color-surface)]',
    icon: AlertCircle,
  },
};

export function AgentStatusBadge({ status, size = 'md', showLabel = true }: AgentStatusBadgeProps) {
  const config = statusConfig[status ?? 'unknown'] ?? statusConfig.unknown;
  const Icon = config.icon;
  const isAnimated = status === 'running' || status === 'starting';
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${padding} rounded-full ${config.bgColor} ${config.color} ${textSize} font-medium`}
      data-testid={`agent-status-${status ?? 'unknown'}`}
    >
      <Icon
        className={`${iconSize} ${isAnimated ? (status === 'running' ? 'fill-current' : 'animate-spin') : ''}`}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
