/**
 * TimePeriodGroup component
 * Groups events by time period with sticky header and optional virtualization
 */

import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import type { Event, TimePeriod } from '../types';
import { TIME_PERIOD_LABELS, EVENT_CARD_HEIGHT } from '../constants';
import { EventCard } from './EventCard';

interface TimePeriodGroupProps {
  period: TimePeriod;
  events: Event[];
  isFirst: boolean;
}

export function TimePeriodGroup({ period, events, isFirst }: TimePeriodGroupProps) {
  if (events.length === 0) return null;

  // Use virtualization for large groups (more than 50 events)
  const useVirtualization = events.length > 50;

  return (
    <div className="mb-6" data-testid={`time-period-${period}`}>
      <div
        className={`sticky top-0 z-10 bg-gray-50 py-2 px-3 -mx-3 ${isFirst ? '' : 'mt-4'}`}
        data-testid={`time-period-header-${period}`}
      >
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          {TIME_PERIOD_LABELS[period]}
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({events.length})</span>
        </h3>
      </div>
      {useVirtualization ? (
        <div className="mt-2">
          <VirtualizedList
            items={events}
            getItemKey={(event) => event.id}
            estimateSize={EVENT_CARD_HEIGHT}
            scrollRestoreId={`timeline-${period}`}
            height={400}
            testId={`virtualized-events-${period}`}
            gap={8}
            renderItem={(event) => <EventCard event={event} />}
          />
        </div>
      ) : (
        <div className="space-y-2 mt-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
