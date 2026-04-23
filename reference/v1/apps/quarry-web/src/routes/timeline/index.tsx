/**
 * Timeline Lens - Chronological view of all events
 *
 * Features:
 * - Visual event type icons (plus, pencil, trash, etc.)
 * - Events grouped by time period (Today, Yesterday, This Week, Earlier)
 * - Enhanced event cards with actor avatar, element type badge, preview
 * - Jump to date picker for navigation
 * - Multi-select chips for filtering
 * - Horizontal timeline visualization with pan/zoom and brush selection
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Pagination, PageHeader } from '../../components/shared';
import { useTrackDashboardSection } from '../../hooks/useTrackDashboardSection';
import { History, X, Search, Users, ListTodo } from 'lucide-react';

import type { Event, EventFilterState, TimePeriod, TimelineViewMode, BrushSelection } from './types';
import { ALL_EVENT_TYPES, EVENT_TYPE_COLORS, DEFAULT_EVENT_PAGE_SIZE, TIME_PERIOD_ORDER } from './constants';
import { getTimePeriod, generateEventSummary, inferElementType } from './utils';
import { useAllEvents } from './hooks';
import {
  FilterChip,
  MultiSelectDropdown,
  JumpToDatePicker,
  TimePeriodGroup,
  HorizontalTimeline,
  ViewModeToggle,
} from './components';

export function TimelinePage() {
  // Track this dashboard section visit
  useTrackDashboardSection('timeline');

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<TimelineViewMode>(() => {
    const saved = localStorage.getItem('timeline-view-mode');
    return (saved === 'list' || saved === 'horizontal') ? saved : 'list';
  });

  useEffect(() => {
    localStorage.setItem('timeline-view-mode', viewMode);
  }, [viewMode]);

  const navigate = useNavigate();
  const search = useSearch({ from: '/dashboard/timeline' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_EVENT_PAGE_SIZE;
  const actorFromUrl = search.actor;
  const startTimeFromUrl = search.startTime;
  const endTimeFromUrl = search.endTime;

  // Brush selection state synchronized with URL
  const [brushSelection, setBrushSelection] = useState<BrushSelection | null>(() => {
    if (startTimeFromUrl && endTimeFromUrl) {
      return { startTime: startTimeFromUrl, endTime: endTimeFromUrl };
    }
    return null;
  });

  // Handle brush selection change and sync to URL
  const handleBrushSelectionChange = useCallback((selection: BrushSelection | null) => {
    setBrushSelection(selection);
    navigate({
      to: '/dashboard/timeline',
      search: {
        page: currentPage,
        limit: pageSize,
        actor: actorFromUrl,
        startTime: selection?.startTime,
        endTime: selection?.endTime,
      },
    });
  }, [navigate, currentPage, pageSize, actorFromUrl]);

  // Sync brush selection when URL params change
  useEffect(() => {
    if (startTimeFromUrl && endTimeFromUrl) {
      setBrushSelection({ startTime: startTimeFromUrl, endTime: endTimeFromUrl });
    } else {
      setBrushSelection(null);
    }
  }, [startTimeFromUrl, endTimeFromUrl]);

  const [filter, setFilter] = useState<EventFilterState>(() => ({
    eventTypes: [],
    actors: actorFromUrl ? [actorFromUrl] : [],
    elementTypes: [],
    search: '',
    jumpToDate: null,
  }));

  // Sync filter.actors when URL actor param changes
  useEffect(() => {
    if (actorFromUrl) {
      setFilter((prev) => ({
        ...prev,
        actors: [actorFromUrl],
      }));
    }
  }, [actorFromUrl]);

  // Fetch all events with eager loading
  const { events: allEvents, totalCount, isLoading, isFetching, isError } = useAllEvents(filter);

  const handlePageChange = (page: number) => {
    navigate({
      to: '/dashboard/timeline',
      search: {
        page,
        limit: pageSize,
        actor: actorFromUrl,
        startTime: brushSelection?.startTime,
        endTime: brushSelection?.endTime,
      },
    });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({
      to: '/dashboard/timeline',
      search: {
        page: 1,
        limit: newPageSize,
        actor: actorFromUrl,
        startTime: brushSelection?.startTime,
        endTime: brushSelection?.endTime,
      },
    });
  };

  // Get unique actors from all events
  const uniqueActors = useMemo(() => {
    if (!allEvents || allEvents.length === 0) return [];
    const actorSet = new Set(allEvents.map((e: Event) => e.actor));
    return Array.from(actorSet).sort() as string[];
  }, [allEvents]);

  // Get unique element types from all events
  const uniqueElementTypes = useMemo(() => {
    if (!allEvents || allEvents.length === 0) return [];
    const typeSet = new Set(allEvents.map((e: Event) => e.elementType || inferElementType(e.elementId)));
    return Array.from(typeSet).sort() as string[];
  }, [allEvents]);

  // Apply client-side filters to all events
  const filteredEvents = useMemo(() => {
    if (!allEvents || allEvents.length === 0) return [];

    return allEvents.filter((event: Event) => {
      // Actor filter (multi-select)
      if (filter.actors.length > 1 && !filter.actors.includes(event.actor)) {
        return false;
      }

      // Element type filter
      if (filter.elementTypes.length > 0) {
        const elementType = event.elementType || inferElementType(event.elementId);
        if (!filter.elementTypes.includes(elementType)) {
          return false;
        }
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matchesId = event.elementId.toLowerCase().includes(searchLower);
        const matchesActor = event.actor.toLowerCase().includes(searchLower);
        const matchesSummary = generateEventSummary(event).toLowerCase().includes(searchLower);
        if (!matchesId && !matchesActor && !matchesSummary) {
          return false;
        }
      }

      // Jump to date filter
      if (filter.jumpToDate) {
        const eventDate = new Date(event.createdAt);
        const targetDate = new Date(filter.jumpToDate);
        eventDate.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);
        if (eventDate > targetDate) {
          return false;
        }
      }

      return true;
    });
  }, [allEvents, filter]);

  // Pagination calculations
  const filteredTotal = filteredEvents.length;
  const filteredTotalPages = Math.ceil(filteredTotal / pageSize);

  // Paginate filtered events for list view
  const paginatedFilteredEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredEvents.slice(startIndex, endIndex);
  }, [filteredEvents, currentPage, pageSize]);

  // Group paginated events by time period
  const groupedEvents = useMemo(() => {
    const groups: Record<TimePeriod, Event[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      earlier: [],
    };

    for (const event of paginatedFilteredEvents) {
      const period = getTimePeriod(event.createdAt);
      groups[period].push(event);
    }

    return groups;
  }, [paginatedFilteredEvents]);

  const toggleEventType = (eventType: Event['eventType']) => {
    setFilter((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((t) => t !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  };

  const clearFilters = () => {
    setFilter({ eventTypes: [], actors: [], elementTypes: [], search: '', jumpToDate: null });
  };

  const hasActiveFilters =
    filter.eventTypes.length > 0 ||
    filter.actors.length > 0 ||
    filter.elementTypes.length > 0 ||
    filter.search !== '' ||
    filter.jumpToDate !== null;

  return (
    <div className="h-full flex flex-col" data-testid="timeline-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 sm:mb-4">
        <PageHeader
          title="Timeline"
          icon={History}
          iconColor="text-blue-500"
          subtitle="Event history across all elements"
          testId="timeline-header"
        />
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1 sm:gap-1.5"
              data-testid="clear-filters-button"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Clear filters</span>
              <span className="xs:hidden">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter controls */}
      <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search events..."
            value={filter.search}
            onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
            className="w-full pl-9 sm:pl-10 pr-4 py-1.5 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100"
            data-testid="search-input"
          />
        </div>

        {/* Filter chips row */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center overflow-x-auto pb-1 -mb-1" data-testid="filter-chips">
          {/* Event type filter chips */}
          <div className="flex gap-1 sm:gap-1.5 flex-wrap" data-testid="event-type-filters">
            {ALL_EVENT_TYPES.map(({ value, label, icon }) => {
              const colors = EVENT_TYPE_COLORS[value];
              return (
                <FilterChip
                  key={value}
                  label={label}
                  icon={icon}
                  active={filter.eventTypes.includes(value)}
                  onClick={() => toggleEventType(value)}
                  color={filter.eventTypes.includes(value) ? { bg: colors.bg, text: colors.text } : undefined}
                />
              );
            })}
          </div>

          {/* Separator */}
          <div className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Actor multi-select dropdown */}
          <MultiSelectDropdown
            label="Actors"
            icon={Users}
            options={uniqueActors}
            selected={filter.actors}
            onChange={(actors) => setFilter((prev) => ({ ...prev, actors }))}
            testId="actor-filter"
          />

          {/* Element type multi-select dropdown */}
          <MultiSelectDropdown
            label="Types"
            icon={ListTodo}
            options={uniqueElementTypes}
            selected={filter.elementTypes}
            onChange={(elementTypes) => setFilter((prev) => ({ ...prev, elementTypes }))}
            testId="element-type-filter"
          />

          {/* Jump to date picker */}
          <JumpToDatePicker
            value={filter.jumpToDate}
            onChange={(jumpToDate) => setFilter((prev) => ({ ...prev, jumpToDate }))}
          />
        </div>
      </div>

      {/* Conditional rendering based on view mode */}
      {viewMode === 'horizontal' ? (
        <div className="flex-1 min-h-0 overflow-y-auto" data-testid="horizontal-timeline-container">
          <HorizontalTimeline
            events={filteredEvents}
            isLoading={isLoading}
            brushSelection={brushSelection}
            onBrushSelectionChange={handleBrushSelectionChange}
          />
        </div>
      ) : (
        <>
          {/* Event count */}
          <div className="mb-3 text-sm text-gray-500 flex items-center gap-2" data-testid="event-count">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
                Loading {totalCount > 0 ? `${totalCount.toLocaleString()} events...` : 'events...'}
              </span>
            ) : (
              <>
                <span data-testid="total-count">
                  {hasActiveFilters || filter.search || filter.elementTypes.length > 0 || filter.jumpToDate
                    ? `${filteredTotal.toLocaleString()} of ${totalCount.toLocaleString()} events`
                    : `${totalCount.toLocaleString()} total events`}
                </span>
                {(hasActiveFilters || filter.search || filter.elementTypes.length > 0 || filter.jumpToDate) && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">(filtered)</span>
                )}
                {isFetching && !isLoading && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full flex items-center gap-1">
                    <span className="animate-spin w-3 h-3 border border-gray-400 border-t-gray-600 rounded-full" />
                    refreshing
                  </span>
                )}
              </>
            )}
          </div>

          {/* Events list with time period grouping */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 -mx-3" data-testid="events-list">
            {isLoading && (
              <div className="text-center py-8 text-gray-500">
                <div className="flex flex-col items-center gap-2">
                  <span className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full" />
                  <span>Loading {totalCount > 0 ? `${totalCount.toLocaleString()} events...` : 'events...'}</span>
                  {totalCount > 5000 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">This may take a moment for large datasets</span>
                  )}
                </div>
              </div>
            )}
            {isError && (
              <div className="text-center py-8 text-red-600">Failed to load events</div>
            )}
            {!isLoading && !isError && filteredEvents.length === 0 && (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                {hasActiveFilters || filter.search || filter.elementTypes.length > 0 || filter.jumpToDate
                  ? 'No events match the current filters'
                  : 'No events recorded yet'}
              </div>
            )}
            {!isLoading &&
              !isError &&
              paginatedFilteredEvents.length > 0 &&
              TIME_PERIOD_ORDER.map((period, index) => (
                <TimePeriodGroup
                  key={period}
                  period={period}
                  events={groupedEvents[period]}
                  isFirst={index === 0 || TIME_PERIOD_ORDER.slice(0, index).every((p) => groupedEvents[p].length === 0)}
                />
              ))}

            {/* Pagination */}
            {!isLoading && !isError && filteredTotalPages > 1 && (
              <div className="mt-4 mb-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={filteredTotalPages}
                  totalItems={filteredTotal}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
