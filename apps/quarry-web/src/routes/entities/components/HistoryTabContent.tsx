/**
 * HistoryTabContent - Shows entity's full event history in git commit log style
 */

import { useState } from 'react';
import { History, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useEntityHistory } from '../hooks';
import { getStoredHistoryPageSize, getStoredHistoryEventType, setStoredHistoryEventType } from '../utils';
import { HISTORY_EVENT_TYPE_OPTIONS } from '../constants';
import { HistoryEventItem } from './HistoryEventItem';
import type { HistoryEventTypeFilter } from '../types';

interface HistoryTabContentProps {
  entityId: string;
}

export function HistoryTabContent({ entityId }: HistoryTabContentProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(() => getStoredHistoryPageSize());
  const [eventTypeFilter, setEventTypeFilter] = useState<HistoryEventTypeFilter>(() => getStoredHistoryEventType());
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useEntityHistory(entityId, page, pageSize, eventTypeFilter);

  // Handle event type filter change
  const handleEventTypeChange = (type: HistoryEventTypeFilter) => {
    setEventTypeFilter(type);
    setStoredHistoryEventType(type);
    setPage(1); // Reset to first page when filter changes
    setExpandedEvents(new Set()); // Collapse all
  };

  // Toggle event expansion
  const toggleEventExpansion = (eventId: number) => {
    setExpandedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    if (data?.items) {
      setExpandedEvents(new Set(data.items.map((e) => e.id)));
    }
  };

  const collapseAll = () => {
    setExpandedEvents(new Set());
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="flex flex-col h-full -m-4" data-testid="entity-history-tab">
      {/* Header */}
      <div className="flex flex-col gap-2 p-3 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4" />
            Event History
            {data && (
              <span className="text-gray-500 font-normal">
                ({data.total} total)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              title="Expand all"
              data-testid="history-expand-all"
            >
              <Eye className="w-3 h-3" />
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              title="Collapse all"
              data-testid="history-collapse-all"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Event Type Filter */}
        <div className="flex gap-1 flex-wrap" data-testid="history-event-type-filter">
          {HISTORY_EVENT_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleEventTypeChange(option.value)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                eventTypeFilter === option.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid={`history-filter-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading history...</span>
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600">Failed to load history</p>
          </div>
        ) : !data?.items.length ? (
          <div className="text-center py-8">
            <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {eventTypeFilter !== 'all'
                ? `No ${eventTypeFilter} events found`
                : 'No events recorded yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-0" data-testid="history-events-list">
            {data.items.map((event) => (
              <HistoryEventItem
                key={event.id}
                event={event}
                isExpanded={expandedEvents.has(event.id)}
                onToggle={() => toggleEventExpansion(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="history-prev-page"
            >
              Previous
            </button>
            <span className="px-2 text-xs text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="history-next-page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
