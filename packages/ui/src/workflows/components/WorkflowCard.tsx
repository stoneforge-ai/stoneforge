/**
 * @stoneforge/ui Workflow Card
 *
 * Card component for displaying a workflow instance.
 */

import { useState } from 'react';
import {
  MoreVertical,
  Eye,
  XCircle,
  Trash2,
  Clock,
  Play,
  CheckCircle,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import type { Workflow, WorkflowStatus } from '../types';
import {
  formatRelativeTime,
  formatWorkflowDuration,
  getWorkflowStatusDisplayName,
  getWorkflowStatusColor,
} from '../utils';

interface WorkflowCardProps {
  workflow: Workflow;
  onViewDetails: (workflowId: string) => void;
  onCancel?: (workflowId: string) => void;
  onDelete?: (workflowId: string) => void;
}

/**
 * Get icon for workflow status
 */
function getStatusIcon(status: WorkflowStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4" />;
    case 'running':
      return <Play className="w-4 h-4" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4" />;
    case 'failed':
      return <XCircle className="w-4 h-4" />;
    case 'cancelled':
      return <Ban className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

export function WorkflowCard({
  workflow,
  onViewDetails,
  onCancel,
  onDelete,
}: WorkflowCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const canCancel = workflow.status === 'pending' || workflow.status === 'running';
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(workflow.status);
  const duration = formatWorkflowDuration(workflow);

  return (
    <div
      className="flex flex-col p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] transition-colors duration-150 cursor-pointer"
      data-testid={`workflow-card-${workflow.id}`}
      onClick={() => onViewDetails(workflow.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getWorkflowStatusColor(workflow.status)}`}>
            {getStatusIcon(workflow.status)}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)]">{workflow.title}</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{workflow.id}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Workflow actions"
          >
            <MoreVertical className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(workflow.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <Eye className="w-4 h-4" />
                View Details
              </button>
              {canCancel && onCancel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(workflow.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Cancel
                </button>
              )}
              {isTerminal && onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(workflow.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span className={`px-2 py-0.5 rounded-full ${getWorkflowStatusColor(workflow.status)}`}>
          {getWorkflowStatusDisplayName(workflow.status)}
        </span>
        {duration && <span>Duration: {duration}</span>}
        {workflow.ephemeral && <span className="text-amber-600">Ephemeral</span>}
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
        <span>Created {formatRelativeTime(workflow.createdAt)}</span>
        {workflow.startedAt && <span>Started {formatRelativeTime(workflow.startedAt)}</span>}
      </div>

      {(workflow.failureReason || workflow.cancelReason) && (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
          {workflow.failureReason || workflow.cancelReason}
        </div>
      )}
    </div>
  );
}
