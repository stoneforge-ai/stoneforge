/**
 * Types for the Timeline page
 * Event types, filter state, and view configurations
 */

// Event types from the API spec
export type EventType =
  | 'created'
  | 'updated'
  | 'closed'
  | 'reopened'
  | 'deleted'
  | 'dependency_added'
  | 'dependency_removed'
  | 'tag_added'
  | 'tag_removed'
  | 'member_added'
  | 'member_removed'
  | 'auto_blocked'
  | 'auto_unblocked';

export interface Event {
  id: number;
  elementId: string;
  elementType?: string;
  eventType: EventType;
  actor: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

// Event filter state
export interface EventFilterState {
  eventTypes: EventType[];
  actors: string[];
  elementTypes: string[];
  search: string;
  jumpToDate: string | null;
}

// Time period grouping
export type TimePeriod = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

// View modes
export type TimelineViewMode = 'list' | 'horizontal';

// Time range presets for horizontal timeline
export type TimeRange = '24h' | '7d' | '30d' | 'all';

// Brush selection state for horizontal timeline
export interface BrushSelection {
  startTime: number;
  endTime: number;
}

// Event dot position for horizontal timeline
export interface EventDot {
  event: Event;
  x: number;
  y: number;
  stackIndex: number;
}

// Color configuration for event types
export interface EventTypeColorConfig {
  bg: string;
  text: string;
  border: string;
  iconBg: string;
}

// Time range option configuration
export interface TimeRangeOption {
  value: TimeRange;
  label: string;
  hours: number | null;
}

// Event type filter option
export interface EventTypeFilterOption {
  value: EventType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}
