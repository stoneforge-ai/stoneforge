/**
 * @stoneforge/ui Workflow Status Badge
 *
 * Displays workflow status with appropriate icon and color.
 */

import type { WorkflowStatus } from '../types';
import { WORKFLOW_STATUS_CONFIG } from '../constants';

interface StatusBadgeProps {
  status: WorkflowStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = WORKFLOW_STATUS_CONFIG[status as WorkflowStatus] || WORKFLOW_STATUS_CONFIG.pending;
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      data-testid={`workflow-status-badge-${status}`}
      className={`inline-flex items-center gap-1 rounded font-medium ${sizeClasses} ${config.bgColor} ${config.color}`}
    >
      <Icon className={iconSize} />
      {config.label}
    </span>
  );
}
