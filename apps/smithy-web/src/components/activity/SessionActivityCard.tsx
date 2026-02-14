/**
 * SessionActivityCard Component
 *
 * Displays real-time agent session output in a compact card format.
 */

import { Bot, Terminal, Wrench, AlertCircle, Info, CheckCircle } from 'lucide-react';
import type { SessionEvent, SessionEventType, AgentRole } from '../../api/types.js';

interface SessionActivityCardProps {
  event: SessionEvent;
  onOpenInWorkspace?: (sessionId: string) => void;
}

// Icon mapping for session event types
const SessionEventIcons: Record<SessionEventType, typeof Bot> = {
  assistant: Bot,
  tool_use: Wrench,
  tool_result: CheckCircle,
  error: AlertCircle,
  system: Info,
  result: CheckCircle,
};

// Colors for different event types
const eventTypeColors: Record<SessionEventType, string> = {
  assistant: 'var(--color-primary)',
  tool_use: 'var(--color-warning)',
  tool_result: 'var(--color-success)',
  error: 'var(--color-error)',
  system: 'var(--color-info)',
  result: 'var(--color-success)',
};

// Labels for agent roles (available but not currently used in this component)
const _roleLabels: Record<AgentRole, string> = {
  director: 'Director',
  worker: 'Worker',
  steward: 'Steward',
};
void _roleLabels; // Suppress unused warning

export function SessionActivityCard({ event, onOpenInWorkspace }: SessionActivityCardProps) {
  const Icon = SessionEventIcons[event.type] || Bot;
  const iconColor = eventTypeColors[event.type] || 'var(--color-text-secondary)';

  // Truncate content if too long
  const displayContent = event.content
    ? event.content.length > 200
      ? `${event.content.slice(0, 200)}...`
      : event.content
    : null;

  const formattedTime = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div
      className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-border-hover)] transition-colors duration-150"
      data-testid="session-activity-card"
      data-session-id={event.sessionId}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${iconColor}20` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              {event.agentName && (
                <span className="font-medium text-[var(--color-text)]" data-testid="session-agent-name">
                  {event.agentName}
                </span>
              )}
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-surface-hover)] capitalize"
                data-testid="session-event-type"
              >
                {event.type.replace('_', ' ')}
              </span>
              <span className="text-[var(--color-text-tertiary)]" data-testid="session-time">
                {formattedTime}
              </span>
            </div>

            {/* Open in workspace */}
            {onOpenInWorkspace && (
              <button
                onClick={() => onOpenInWorkspace(event.sessionId)}
                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Open in Workspace"
                data-testid="session-open-workspace"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content preview */}
          {displayContent && (
            <p
              className="mt-1.5 text-sm text-[var(--color-text)] whitespace-pre-wrap break-words font-mono text-xs"
              data-testid="session-content"
            >
              {displayContent}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
