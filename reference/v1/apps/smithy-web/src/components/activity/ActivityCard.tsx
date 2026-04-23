/**
 * ActivityCard Component
 *
 * Displays a single activity event with rich formatting and expandable details.
 */

import { useState } from 'react';
import {
  Plus,
  Edit,
  CheckCircle,
  RefreshCw,
  Trash2,
  Link,
  Unlink,
  Tag,
  UserPlus,
  UserMinus,
  Lock,
  Unlock,
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import type { ActivityEvent, ElementType } from '../../api/types.js';
import { formatRelativeTime, getEventTypeColor } from '../../api/hooks/useActivity.js';

interface ActivityCardProps {
  event: ActivityEvent;
  onOpenInWorkspace?: (event: ActivityEvent) => void;
}

// Icon mapping for event types
const EventIcons: Record<string, typeof Activity> = {
  created: Plus,
  updated: Edit,
  closed: CheckCircle,
  reopened: RefreshCw,
  deleted: Trash2,
  dependency_added: Link,
  dependency_removed: Unlink,
  tag_added: Tag,
  tag_removed: Tag,
  member_added: UserPlus,
  member_removed: UserMinus,
  auto_blocked: Lock,
  auto_unblocked: Unlock,
};

// Element type labels
const ElementTypeLabels: Record<ElementType, string> = {
  task: 'Task',
  entity: 'Entity',
  document: 'Document',
  channel: 'Channel',
  message: 'Message',
  plan: 'Plan',
  workflow: 'Workflow',
  library: 'Library',
  team: 'Team',
};

export function ActivityCard({ event, onOpenInWorkspace }: ActivityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = EventIcons[event.eventType] || Activity;
  const iconColor = getEventTypeColor(event.eventType);
  const typeLabel = event.elementType ? ElementTypeLabels[event.elementType] || event.elementType : 'item';

  // Check if there are details to show
  const hasDetails =
    (event.oldValue && Object.keys(event.oldValue).length > 0) ||
    (event.newValue && Object.keys(event.newValue).length > 0);

  return (
    <div
      className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 hover:border-[var(--color-border-hover)] transition-colors duration-150"
      data-testid="activity-card"
      data-event-id={event.id}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${iconColor}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Summary */}
              <p className="text-sm text-[var(--color-text)]" data-testid="activity-summary">
                {event.summary || `${event.eventType} on ${typeLabel}`}
              </p>

              {/* Meta info */}
              <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-tertiary)]">
                {event.actorName && (
                  <>
                    <span data-testid="activity-actor">{event.actorName}</span>
                    <span>·</span>
                  </>
                )}
                <span data-testid="activity-time">{formatRelativeTime(event.createdAt)}</span>
                {event.elementType && (
                  <>
                    <span>·</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-surface-hover)]"
                      data-testid="activity-element-type"
                    >
                      {typeLabel}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {onOpenInWorkspace && (
                <button
                  onClick={() => onOpenInWorkspace(event)}
                  className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors duration-150"
                  title="Open in Workspace"
                  data-testid="activity-open-workspace"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              {hasDetails && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors duration-150"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                  data-testid="activity-expand"
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Title/Link if available */}
          {event.elementTitle && (
            <div className="mt-2">
              <span
                className="text-sm font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
                data-testid="activity-element-title"
              >
                {event.elementTitle}
              </span>
            </div>
          )}

          {/* Expanded details */}
          {isExpanded && hasDetails && (
            <div
              className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3"
              data-testid="activity-details"
            >
              {event.newValue && Object.keys(event.newValue).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    {event.eventType === 'created' ? 'Initial Values' : 'New Values'}
                  </h4>
                  <pre className="text-xs bg-[var(--color-surface-hover)] p-2 rounded overflow-x-auto">
                    {JSON.stringify(event.newValue, null, 2)}
                  </pre>
                </div>
              )}
              {event.oldValue &&
                Object.keys(event.oldValue).length > 0 &&
                event.eventType !== 'created' && (
                  <div>
                    <h4 className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Previous Values
                    </h4>
                    <pre className="text-xs bg-[var(--color-surface-hover)] p-2 rounded overflow-x-auto">
                      {JSON.stringify(event.oldValue, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
