/**
 * RecentActivityFeed - Displays recent system events
 * Shows the latest activity with event and element type icons
 */

import { Link } from '@tanstack/react-router';
import { Activity, ArrowRight } from 'lucide-react';
import { useRecentEvents } from '../hooks';
import { EVENT_TYPE_ICONS, ELEMENT_TYPE_ICONS } from '../constants';
import { getRelativeTime } from '../utils';

export function RecentActivityFeed() {
  const events = useRecentEvents();

  return (
    <div className="mt-6 sm:mt-8" data-testid="recent-activity">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100">Recent Activity</h3>
        <Link to="/dashboard/timeline" search={{ page: 1, limit: 100, actor: undefined, startTime: undefined, endTime: undefined }} className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          View all <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Link>
      </div>

      {events.isLoading && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading activity...</div>
      )}

      {events.isError && (
        <div className="text-red-600 text-sm">Failed to load activity</div>
      )}

      {events.data && events.data.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
          No recent activity
        </div>
      )}

      {events.data && events.data.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-gray-700" data-testid="activity-list">
          {events.data.map((event) => {
            const EventIcon = EVENT_TYPE_ICONS[event.eventType] || Activity;
            const ElementIcon = ELEMENT_TYPE_ICONS[event.elementType] || Activity;
            return (
              <div key={event.id} className="p-3 sm:p-4 flex items-start gap-2 sm:gap-3" data-testid={`activity-item-${event.id}`}>
                <div className="p-1.5 sm:p-2 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0">
                  <EventIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <ElementIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{event.eventType}</span>
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{event.elementType}</span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 truncate">{event.elementId}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">{getRelativeTime(event.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
