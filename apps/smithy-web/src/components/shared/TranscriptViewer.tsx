/**
 * TranscriptViewer - Shared components for rendering session transcripts
 *
 * Displays a list of session events with color-coded event types and markdown support.
 * Used by SessionHistoryModal and can be reused wherever transcript viewing is needed.
 */

import { MessageSquare } from 'lucide-react';
import type { StreamEvent } from '../workspace/types';
import type { SessionMessage } from '../../api/types';
import { MarkdownContent } from './MarkdownContent';

/**
 * Convert server SessionMessage to StreamEvent format
 */
export function messageToStreamEvent(msg: SessionMessage): StreamEvent {
  return {
    id: msg.id,
    type: msg.type,
    timestamp: typeof msg.createdAt === 'number' ? msg.createdAt : Date.parse(msg.createdAt as unknown as string),
    content: msg.content,
    toolName: msg.toolName,
    toolInput: msg.toolInput ? JSON.parse(msg.toolInput) : undefined,
    toolOutput: msg.toolOutput,
    isError: msg.isError,
  };
}

interface TranscriptViewerProps {
  events: StreamEvent[];
}

/**
 * TranscriptViewer - Renders a list of transcript events
 */
export function TranscriptViewer({ events }: TranscriptViewerProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] p-6">
        <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No transcript available for this session</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      {events.map((event) => (
        <TranscriptEvent key={event.id} event={event} />
      ))}
    </div>
  );
}

/**
 * TranscriptEvent - Renders a single event with type badge, tool name, and content
 */
export function TranscriptEvent({ event }: { event: StreamEvent }) {
  const typeColors: Record<string, { bg: string; text: string }> = {
    assistant: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
    user: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300' },
    tool_use: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300' },
    tool_result: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300' },
    system: { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400' },
    error: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300' },
  };

  const colors = typeColors[event.type] || typeColors.system;
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`rounded-md border overflow-hidden ${colors.bg} border-[var(--color-border)]/30`}>
      <div className={`flex items-center gap-2 px-3 py-1.5 ${colors.text}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">
          {event.type.replace('_', ' ')}
        </span>
        {event.toolName && (
          <span className="text-xs font-mono opacity-75">{event.toolName}</span>
        )}
        <span className="ml-auto text-xs opacity-50">{time}</span>
      </div>
      {event.content && (
        <div className="px-3 py-2 border-t border-[var(--color-border)]/30">
          {event.type === 'assistant' || event.type === 'user' ? (
            <MarkdownContent content={event.content} className="text-sm text-[var(--color-text)]" />
          ) : (
            <div className="text-sm whitespace-pre-wrap break-words text-[var(--color-text)]">
              {event.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
