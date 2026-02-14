/**
 * EventCard component
 * Displays a single event with type icon, element info, changes preview, and actor
 */

import { Pencil, ListTodo } from 'lucide-react';
import type { Event } from '../types';
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_ICONS,
  EVENT_TYPE_DISPLAY,
  ELEMENT_TYPE_ICONS,
  ELEMENT_TYPE_COLORS,
} from '../constants';
import {
  formatTimeAgo,
  formatTime,
  generateChangesPreview,
  getInitials,
  getAvatarColor,
  inferElementType,
} from '../utils';

interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  const colors = EVENT_TYPE_COLORS[event.eventType] || EVENT_TYPE_COLORS.updated;
  const EventIcon = EVENT_TYPE_ICONS[event.eventType] || Pencil;
  const elementType = event.elementType || inferElementType(event.elementId);
  const ElementIcon = ELEMENT_TYPE_ICONS[elementType] || ListTodo;
  const elementColor = ELEMENT_TYPE_COLORS[elementType] || 'bg-gray-100 text-gray-700';
  const changesPreview = generateChangesPreview(event);
  const avatarColor = getAvatarColor(event.actor);

  return (
    <div
      className="p-3 sm:p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
      data-testid="event-card"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        {/* Event type icon */}
        <div className={`p-1.5 sm:p-2 rounded-lg ${colors.iconBg} shrink-0`} data-testid="event-icon">
          <EventIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${colors.text}`} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: event type badge + element type badge + timestamp */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}
              data-testid="event-type-badge"
            >
              {EVENT_TYPE_DISPLAY[event.eventType]}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full ${elementColor}`}
              data-testid="element-type-badge"
            >
              <ElementIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden xs:inline">{elementType}</span>
            </span>
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 ml-auto shrink-0" data-testid="event-time">
              {formatTimeAgo(event.createdAt)}
            </span>
          </div>

          {/* Element ID */}
          <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 mt-1 sm:mt-1.5 font-mono truncate" data-testid="element-id">
            {event.elementId}
          </p>

          {/* Changes preview */}
          {changesPreview && (
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1 truncate" data-testid="changes-preview">
              {changesPreview}
            </p>
          )}

          {/* Actor row */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
            <div
              className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full ${avatarColor} flex items-center justify-center shrink-0`}
              data-testid="actor-avatar"
            >
              <span className="text-[8px] sm:text-[10px] font-medium text-white">{getInitials(event.actor)}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-300 truncate">{event.actor}</span>
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 ml-auto shrink-0">{formatTime(event.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
