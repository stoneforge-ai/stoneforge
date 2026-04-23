/**
 * ApprovalRequestCard - Actionable card for approval requests
 *
 * Shows tool name, agent info, command details, and approve/deny buttons.
 * Pending requests have an amber left border for visual urgency.
 */

import { useState } from 'react';
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Crown,
  Wrench,
  Shield,
  Terminal,
  Clock,
} from 'lucide-react';
import type { ApprovalRequest } from '../../api/types.js';
import { formatRelativeTime } from '../../api/hooks/useActivity.js';

// ============================================================================
// Role Badge (reused pattern from ActiveAgentCard)
// ============================================================================

const ROLE_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  director: { label: 'Director', icon: Crown, color: 'text-[var(--color-warning)]' },
  worker: { label: 'Worker', icon: Wrench, color: 'text-[var(--color-primary)]' },
  steward: { label: 'Steward', icon: Shield, color: 'text-[var(--color-info)]' },
};

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.worker;
  const RoleIcon = config.icon;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${config.color}`}>
      <RoleIcon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Types
// ============================================================================

interface ApprovalRequestCardProps {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  isResolving?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function formatToolArgs(args: unknown): string {
  if (typeof args === 'string') return args;
  if (args === null || args === undefined) return '';
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

const COLLAPSE_THRESHOLD = 200;

// ============================================================================
// Component
// ============================================================================

export function ApprovalRequestCard({
  request,
  onApprove,
  onDeny,
  isResolving = false,
}: ApprovalRequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = request.status === 'pending';
  const isResolved = request.status === 'approved' || request.status === 'denied';

  const argsString = formatToolArgs(request.toolArgs);
  const isLongArgs = argsString.length > COLLAPSE_THRESHOLD;
  const displayArgs = !isLongArgs || expanded ? argsString : argsString.substring(0, COLLAPSE_THRESHOLD) + '...';

  const agentName = request.agentName || request.agentId;
  const agentRole = request.agentRole || 'worker';

  // Status border color
  const borderColor = isPending
    ? 'border-l-[var(--color-warning)]'
    : request.status === 'approved'
      ? 'border-l-[var(--color-success)]'
      : 'border-l-[var(--color-error)]';

  return (
    <div
      className={`
        border-l-4 ${borderColor} bg-[var(--color-surface)]
        rounded-r-lg p-4 transition-all duration-200
        ${isPending ? 'shadow-sm' : 'opacity-75'}
      `}
      data-testid={`approval-request-${request.id}`}
    >
      {/* Header: Agent info + timestamp */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-[var(--color-text)] truncate">
            {agentName}
          </span>
          <RoleBadge role={agentRole} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] flex-shrink-0">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(new Date(request.requestedAt).toISOString())}
        </div>
      </div>

      {/* Tool name */}
      <div className="flex items-center gap-1.5 mb-2">
        <Terminal className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
        <span className="text-sm font-mono text-[var(--color-text-secondary)]">
          {request.toolName}
        </span>
      </div>

      {/* Tool arguments in monospace block */}
      {argsString && (
        <div className="mb-3">
          <pre className="text-xs font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all text-[var(--color-text-secondary)] max-h-48 overflow-y-auto">
            {displayArgs}
          </pre>
          {isLongArgs && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-1 text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Action buttons or resolved status */}
      {isPending ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onApprove(request.id)}
            disabled={isResolving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-success)] hover:bg-[var(--color-success-hover)] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`approve-${request.id}`}
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            onClick={() => onDeny(request.id)}
            disabled={isResolving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-error)] hover:bg-[var(--color-error-hover)] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`deny-${request.id}`}
          >
            <X className="w-3.5 h-3.5" />
            Deny
          </button>
        </div>
      ) : isResolved ? (
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${
              request.status === 'approved'
                ? 'bg-[var(--color-success-muted)] text-[var(--color-success-text)]'
                : 'bg-[var(--color-error-muted)] text-[var(--color-error-text)]'
            }`}
          >
            {request.status === 'approved' ? (
              <Check className="w-3 h-3" />
            ) : (
              <X className="w-3 h-3" />
            )}
            {request.status === 'approved' ? 'Approved' : 'Denied'}
          </span>
          {request.resolvedBy && (
            <span className="text-[var(--color-text-muted)]">
              by {request.resolvedBy}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default ApprovalRequestCard;
