/**
 * AgentRoleBadge - Role indicator for agents
 *
 * Shows the agent role with appropriate icon and styling.
 */

import { Crown, Wrench, Bot, Shield, Zap } from 'lucide-react';
import type { AgentRole, WorkerMode, StewardFocus } from '../../api/types';

interface AgentRoleBadgeProps {
  role: AgentRole;
  workerMode?: WorkerMode;
  stewardFocus?: StewardFocus;
  size?: 'sm' | 'md';
}

const roleConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  director: {
    label: 'Director',
    color: 'text-[var(--color-primary)]',
    bgColor: 'bg-[var(--color-primary-muted)]',
    icon: Crown,
  },
  worker: {
    label: 'Worker',
    color: 'text-[var(--color-info-text)]',
    bgColor: 'bg-[var(--color-info-muted)]',
    icon: Wrench,
  },
  steward: {
    label: 'Steward',
    color: 'text-[var(--color-accent-text)]',
    bgColor: 'bg-[var(--color-accent-muted)]',
    icon: Shield,
  },
};

const workerModeConfig: Record<WorkerMode, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  ephemeral: {
    label: 'Ephemeral',
    icon: Zap,
  },
  persistent: {
    label: 'Persistent',
    icon: Bot,
  },
};

const stewardFocusConfig: Record<StewardFocus, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  merge: {
    label: 'Merge',
    icon: Bot,
  },
  docs: {
    label: 'Docs',
    icon: Bot,
  },
  recovery: {
    label: 'Recovery',
    icon: Bot,
  },
  custom: {
    label: 'Custom',
    icon: Bot,
  },
};

export function AgentRoleBadge({ role, workerMode, stewardFocus, size = 'md' }: AgentRoleBadgeProps) {
  const config = roleConfig[role];
  let Icon = config.icon;
  let sublabel: string | null = null;

  // Override icon and add sublabel for workers with mode
  if (role === 'worker' && workerMode) {
    const modeConfig = workerModeConfig[workerMode];
    Icon = modeConfig.icon;
    sublabel = modeConfig.label;
  }

  // Add sublabel for stewards with focus
  if (role === 'steward' && stewardFocus) {
    const focusConfig = stewardFocusConfig[stewardFocus];
    sublabel = focusConfig.label;
  }

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${padding} rounded-md ${config.bgColor} ${config.color} ${textSize} font-medium`}
      data-testid={`agent-role-${role}`}
    >
      <Icon className={iconSize} />
      <span>{config.label}</span>
      {sublabel && (
        <span className="text-[var(--color-text-tertiary)]">({sublabel})</span>
      )}
    </span>
  );
}
