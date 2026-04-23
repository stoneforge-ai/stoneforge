/**
 * HistoryEventItem - Git commit log style display
 * Shows event ID (hash), description, timestamp, and expandable details
 */

import { Hash, Eye, EyeOff } from 'lucide-react';
import type { StoneforgeEvent } from '../types';

interface HistoryEventItemProps {
  event: StoneforgeEvent;
  isExpanded: boolean;
  onToggle: () => void;
}

export function HistoryEventItem({ event, isExpanded, onToggle }: HistoryEventItemProps) {
  // Generate a short hash from the event ID
  const shortHash = `${event.id}`.padStart(7, '0').slice(0, 7);

  // Get event color based on event type
  const getEventColor = () => {
    switch (event.eventType) {
      case 'created':
        return 'text-green-600';
      case 'updated':
        return 'text-blue-600';
      case 'closed':
        return 'text-purple-600';
      case 'deleted':
        return 'text-red-600';
      case 'reopened':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  // Generate commit-style message
  const getMessage = () => {
    const elementType = event.elementType || 'element';
    const eventType = event.eventType;

    switch (eventType) {
      case 'created':
        return `Create ${elementType}`;
      case 'updated':
        return `Update ${elementType}`;
      case 'closed':
        return elementType === 'task' ? 'Complete task' : `Close ${elementType}`;
      case 'deleted':
        return `Delete ${elementType}`;
      case 'reopened':
        return `Reopen ${elementType}`;
      case 'added_dependency':
        return `Add dependency`;
      case 'removed_dependency':
        return `Remove dependency`;
      case 'auto_blocked':
        return `Auto-blocked by dependency`;
      case 'auto_unblocked':
        return `Auto-unblocked (dependency resolved)`;
      default:
        return eventType.replace(/_/g, ' ');
    }
  };

  // Format timestamp
  const formatTimestamp = () => {
    const date = new Date(event.createdAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    if (days < 7) {
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  // Format old/new values for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(none)';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.join(', ') || '(empty)';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  // Get changed fields
  const getChangedFields = () => {
    const changes: { field: string; oldValue: string; newValue: string }[] = [];

    const oldValue = event.oldValue as Record<string, unknown> | null;
    const newValue = event.newValue as Record<string, unknown> | null;

    if (!oldValue && newValue) {
      // Created - show new values
      Object.entries(newValue).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          changes.push({ field: key, oldValue: '(none)', newValue: formatValue(value) });
        }
      });
    } else if (oldValue && newValue) {
      // Updated - show differences
      const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
      allKeys.forEach((key) => {
        if (key !== 'updatedAt') {
          const oldVal = oldValue[key];
          const newVal = newValue[key];
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({
              field: key,
              oldValue: formatValue(oldVal),
              newValue: formatValue(newVal),
            });
          }
        }
      });
    } else if (oldValue && !newValue) {
      // Deleted - show old values
      Object.entries(oldValue).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          changes.push({ field: key, oldValue: formatValue(value), newValue: '(deleted)' });
        }
      });
    }

    return changes;
  };

  const changes = isExpanded ? getChangedFields() : [];

  return (
    <div
      className="border-l-2 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors"
      data-testid={`history-item-${event.id}`}
    >
      {/* Main row - commit log style */}
      <div className="flex items-start gap-3">
        {/* Hash (event ID) */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 hover:bg-gray-200 transition-colors"
          title={`Event ID: ${event.id}`}
          data-testid={`history-hash-${event.id}`}
        >
          <Hash className="w-3 h-3 inline mr-1" />
          {shortHash}
        </button>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${getEventColor()}`}>
            {getMessage()}
          </p>
          <p className="text-xs text-gray-500 font-mono truncate" title={event.elementId}>
            {event.elementId}
          </p>
        </div>

        {/* Timestamp */}
        <span className="flex-shrink-0 text-xs text-gray-400" title={new Date(event.createdAt).toLocaleString()}>
          {formatTimestamp()}
        </span>

        {/* Expand/collapse button */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          title={isExpanded ? 'Hide details' : 'Show details'}
          data-testid={`history-toggle-${event.id}`}
        >
          {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded details - git diff style */}
      {isExpanded && changes.length > 0 && (
        <div className="mt-3 bg-gray-50 rounded border border-gray-200 overflow-hidden" data-testid={`history-details-${event.id}`}>
          <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-xs text-gray-600 font-medium">
            Changes ({changes.length})
          </div>
          <div className="divide-y divide-gray-200">
            {changes.slice(0, 10).map((change, index) => (
              <div key={index} className="px-3 py-2 text-xs">
                <div className="font-medium text-gray-700 mb-1">{change.field}</div>
                {change.oldValue !== '(none)' && change.oldValue !== '(deleted)' && (
                  <div className="flex items-start gap-2 text-red-600 bg-red-50 px-2 py-1 rounded mb-1">
                    <span className="font-mono">-</span>
                    <span className="break-all font-mono">{change.oldValue}</span>
                  </div>
                )}
                {change.newValue !== '(none)' && change.newValue !== '(deleted)' && (
                  <div className="flex items-start gap-2 text-green-600 bg-green-50 px-2 py-1 rounded">
                    <span className="font-mono">+</span>
                    <span className="break-all font-mono">{change.newValue}</span>
                  </div>
                )}
              </div>
            ))}
            {changes.length > 10 && (
              <div className="px-3 py-2 text-xs text-gray-500 italic">
                +{changes.length - 10} more fields
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message if no details */}
      {isExpanded && changes.length === 0 && (
        <div className="mt-2 text-xs text-gray-400 italic pl-10">
          No detailed changes recorded
        </div>
      )}
    </div>
  );
}
