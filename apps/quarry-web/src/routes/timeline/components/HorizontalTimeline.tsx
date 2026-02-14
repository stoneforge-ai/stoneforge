/**
 * HorizontalTimeline component
 * Visual timeline with pan/zoom and brush selection capabilities
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Clock,
  ZoomIn,
  ZoomOut,
  Maximize,
  Paintbrush,
  Hand,
  X,
} from 'lucide-react';
import type { Event, TimeRange, BrushSelection, EventDot } from '../types';
import {
  ALL_EVENT_TYPES,
  TIME_RANGE_OPTIONS,
  EVENT_TYPE_DISPLAY,
} from '../constants';
import { getEventDotColor } from '../utils';
import { EventCard } from './EventCard';

interface HorizontalTimelineProps {
  events: Event[];
  isLoading: boolean;
  brushSelection: BrushSelection | null;
  onBrushSelectionChange: (selection: BrushSelection | null) => void;
}

export function HorizontalTimeline({
  events,
  isLoading,
  brushSelection,
  onBrushSelectionChange,
}: HorizontalTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<Event | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // Brush selection state
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const [brushMode, setBrushMode] = useState(false);

  // Filter events by time range
  const filteredEvents = useMemo(() => {
    const option = TIME_RANGE_OPTIONS.find(o => o.value === timeRange);
    if (!option || option.hours === null) return events;

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - option.hours);
    return events.filter(e => new Date(e.createdAt) >= cutoff);
  }, [events, timeRange]);

  // Calculate time bounds
  const { minTime, timeSpan } = useMemo(() => {
    if (filteredEvents.length === 0) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { minTime: weekAgo.getTime(), maxTime: now.getTime(), timeSpan: 7 * 24 * 60 * 60 * 1000 };
    }

    const times = filteredEvents.map(e => new Date(e.createdAt).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = max - min || 24 * 60 * 60 * 1000;
    const padding = span * 0.05;
    return { minTime: min - padding, maxTime: max + padding, timeSpan: span + padding * 2 };
  }, [filteredEvents]);

  // Calculate dot positions with collision detection
  const eventDots = useMemo((): EventDot[] => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const effectiveWidth = containerWidth * zoom;
    const dotRadius = 8;
    const dotDiameter = dotRadius * 2;
    const verticalGap = 4;
    const baseY = 100;

    const sorted = [...filteredEvents].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const dots: EventDot[] = [];
    const occupiedSlots: { x: number; stackIndex: number }[] = [];

    for (const event of sorted) {
      const time = new Date(event.createdAt).getTime();
      const x = ((time - minTime) / timeSpan) * effectiveWidth;

      let stackIndex = 0;
      for (const slot of occupiedSlots) {
        if (Math.abs(slot.x - x) < dotDiameter + 4) {
          stackIndex = Math.max(stackIndex, slot.stackIndex + 1);
        }
      }

      const relevantSlots = occupiedSlots.filter(slot => Math.abs(slot.x - x) < dotDiameter + 4);
      occupiedSlots.length = 0;
      occupiedSlots.push(...relevantSlots);
      occupiedSlots.push({ x, stackIndex });

      dots.push({
        event,
        x,
        y: baseY - stackIndex * (dotDiameter + verticalGap),
        stackIndex,
      });
    }

    return dots;
  }, [filteredEvents, minTime, timeSpan, zoom]);

  // Format time axis labels
  const timeAxisLabels = useMemo(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const effectiveWidth = containerWidth * zoom;
    const labelCount = Math.max(4, Math.floor(effectiveWidth / 150));
    const labels: { x: number; label: string }[] = [];

    for (let i = 0; i <= labelCount; i++) {
      const ratio = i / labelCount;
      const time = minTime + timeSpan * ratio;
      const date = new Date(time);

      let label: string;
      if (timeSpan < 2 * 24 * 60 * 60 * 1000) {
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (timeSpan < 30 * 24 * 60 * 60 * 1000) {
        label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        label = date.toLocaleDateString([], { month: 'short', year: '2-digit' });
      }

      labels.push({ x: ratio * effectiveWidth, label });
    }

    return labels;
  }, [minTime, timeSpan, zoom]);

  // Convert x position to time
  const xToTime = useCallback((clientX: number): number => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return minTime;
    const containerWidth = containerRect.width;
    const effectiveWidth = containerWidth * zoom;
    const relativeX = clientX - containerRect.left + panOffset;
    const ratio = relativeX / effectiveWidth;
    return minTime + timeSpan * ratio;
  }, [minTime, timeSpan, zoom, panOffset]);

  // Convert time to x position
  const timeToX = useCallback((time: number): number => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const effectiveWidth = containerWidth * zoom;
    const ratio = (time - minTime) / timeSpan;
    return ratio * effectiveWidth;
  }, [minTime, timeSpan, zoom]);

  // Pan/brush handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    if (brushMode) {
      const time = xToTime(e.clientX);
      setBrushStart(time);
      setBrushEnd(time);
      setIsBrushing(true);
    } else {
      setIsDragging(true);
      setDragStart(e.clientX + panOffset);
    }
  }, [panOffset, brushMode, xToTime]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isBrushing) {
      const time = xToTime(e.clientX);
      setBrushEnd(time);
    } else if (isDragging) {
      const newOffset = dragStart - e.clientX;
      const containerWidth = containerRef.current?.clientWidth ?? 800;
      const maxOffset = Math.max(0, containerWidth * zoom - containerWidth);
      setPanOffset(Math.max(0, Math.min(maxOffset, newOffset)));
    }
  }, [isDragging, dragStart, zoom, isBrushing, xToTime]);

  const handleMouseUp = useCallback(() => {
    if (isBrushing && brushStart !== null && brushEnd !== null) {
      const start = Math.min(brushStart, brushEnd);
      const end = Math.max(brushStart, brushEnd);
      if (end - start > 1000) {
        onBrushSelectionChange({ startTime: start, endTime: end });
      }
      setIsBrushing(false);
    }
    setIsDragging(false);
  }, [isBrushing, brushStart, brushEnd, onBrushSelectionChange]);

  const handleClearBrushSelection = useCallback(() => {
    onBrushSelectionChange(null);
    setBrushStart(null);
    setBrushEnd(null);
  }, [onBrushSelectionChange]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.5, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.5, 1));
    if (zoom <= 1.5) setPanOffset(0);
  }, [zoom]);

  const handleFitToView = useCallback(() => {
    setZoom(1);
    setPanOffset(0);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(1, Math.min(10, z * delta)));
    }
  }, []);

  // Event dot hover
  const handleDotMouseEnter = (event: Event, e: React.MouseEvent) => {
    setHoveredEvent(event);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleDotMouseLeave = () => {
    setHoveredEvent(null);
    setTooltipPosition(null);
  };

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="animate-pulse text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="horizontal-timeline">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Time range selector */}
        <div className="flex items-center gap-2" data-testid="time-range-selector">
          <Clock className="w-4 h-4 text-gray-400" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="time-range-select"
          >
            {TIME_RANGE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5" data-testid="mode-toggle">
          <button
            onClick={() => setBrushMode(false)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              !brushMode
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Pan mode (drag to navigate)"
            data-testid="pan-mode-button"
          >
            <Hand className="w-3.5 h-3.5" />
            Pan
          </button>
          <button
            onClick={() => setBrushMode(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              brushMode
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Brush mode (drag to select time range)"
            data-testid="brush-mode-button"
          >
            <Paintbrush className="w-3.5 h-3.5" />
            Select
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1" data-testid="zoom-controls">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
            data-testid="zoom-out-button"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-xs text-gray-500 w-12 text-center" data-testid="zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 10}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
            data-testid="zoom-in-button"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <button
            onClick={handleFitToView}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Fit to view"
            data-testid="fit-to-view-button"
          >
            <Maximize className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Event count and clear selection */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
          </span>
          {brushSelection && (
            <button
              onClick={handleClearBrushSelection}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              data-testid="clear-selection-button"
            >
              <X className="w-3 h-3" />
              Clear selection
            </button>
          )}
        </div>
      </div>

      {/* Brush selection info bar */}
      {brushSelection && (
        <div
          className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
          data-testid="brush-selection-info"
        >
          <div className="flex items-center gap-3">
            <Paintbrush className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-800">
              Time range selected:{' '}
              <strong>
                {new Date(brushSelection.startTime).toLocaleString()} — {new Date(brushSelection.endTime).toLocaleString()}
              </strong>
            </span>
          </div>
          <span className="text-sm text-blue-600">
            {filteredEvents.filter(e => {
              const time = new Date(e.createdAt).getTime();
              return time >= brushSelection.startTime && time <= brushSelection.endTime;
            }).length} events in selection
          </span>
        </div>
      )}

      {/* Timeline canvas */}
      <div
        ref={containerRef}
        className="relative h-64 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: brushMode
            ? 'crosshair'
            : (isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default')
        }}
        data-testid="timeline-canvas"
      >
        <div
          ref={canvasRef}
          className="absolute inset-0"
          style={{ transform: `translateX(-${panOffset}px)` }}
        >
          {/* Time axis line */}
          <div
            className="absolute left-0 right-0 h-px bg-gray-300"
            style={{ top: '100px', width: `${100 * zoom}%` }}
          />

          {/* Time axis labels */}
          {timeAxisLabels.map((label, i) => (
            <div
              key={i}
              className="absolute text-xs text-gray-500 whitespace-nowrap"
              style={{ left: label.x, top: '110px', transform: 'translateX(-50%)' }}
              data-testid={`axis-label-${i}`}
            >
              {label.label}
            </div>
          ))}

          {/* Event dots */}
          {eventDots.map((dot) => (
            <button
              key={dot.event.id}
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow-sm hover:scale-125 transition-transform focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{
                left: dot.x - 8,
                top: dot.y - 8,
                backgroundColor: getEventDotColor(dot.event.eventType),
              }}
              onClick={() => setSelectedEvent(dot.event)}
              onMouseEnter={(e) => handleDotMouseEnter(dot.event, e)}
              onMouseLeave={handleDotMouseLeave}
              data-testid={`event-dot-${dot.event.id}`}
              aria-label={`${EVENT_TYPE_DISPLAY[dot.event.eventType]} event on ${dot.event.elementId}`}
            />
          ))}

          {/* Brush selection overlay (during brushing) */}
          {isBrushing && brushStart !== null && brushEnd !== null && (
            <div
              className="absolute bg-blue-500/20 border border-blue-500"
              style={{
                left: Math.min(timeToX(brushStart), timeToX(brushEnd)),
                width: Math.abs(timeToX(brushEnd) - timeToX(brushStart)),
                top: 0,
                bottom: 0,
              }}
              data-testid="brush-selection-active"
            />
          )}

          {/* Committed brush selection overlay */}
          {brushSelection && !isBrushing && (
            <div
              className="absolute bg-blue-500/10 border-2 border-blue-500 border-dashed"
              style={{
                left: timeToX(brushSelection.startTime),
                width: timeToX(brushSelection.endTime) - timeToX(brushSelection.startTime),
                top: 0,
                bottom: 0,
              }}
              data-testid="brush-selection-committed"
            />
          )}
        </div>

        {/* Empty state */}
        {filteredEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            No events in the selected time range
          </div>
        )}

        {/* Pan hint */}
        {zoom > 1 && !isDragging && (
          <div className="absolute bottom-2 right-2 text-xs text-gray-600 dark:text-gray-300 bg-white/90 dark:bg-gray-800/90 px-2 py-1 rounded">
            Drag to pan • Ctrl+scroll to zoom
          </div>
        )}
      </div>

      {/* Tooltip */}
      {hoveredEvent && tooltipPosition && (
        <div
          className="fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-3 max-w-xs pointer-events-none"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
          data-testid="event-tooltip"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getEventDotColor(hoveredEvent.eventType) }}
            />
            <span className="text-sm font-medium">{EVENT_TYPE_DISPLAY[hoveredEvent.eventType]}</span>
          </div>
          <p className="text-xs text-gray-600 font-mono">{hoveredEvent.elementId}</p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(hoveredEvent.createdAt).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">by {hoveredEvent.actor}</p>
        </div>
      )}

      {/* Selected event card */}
      {selectedEvent && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4" data-testid="selected-event-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <EventCard event={selectedEvent} />
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-1 hover:bg-blue-100 rounded-lg transition-colors ml-2"
              data-testid="close-selected-event"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs" data-testid="timeline-legend">
        {ALL_EVENT_TYPES.slice(0, 6).map(({ value, label }) => (
          <div key={value} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getEventDotColor(value) }}
            />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
        <span className="text-gray-500 dark:text-gray-400">+ {ALL_EVENT_TYPES.length - 6} more</span>
      </div>

      {/* Selected events list */}
      {brushSelection && (
        <div className="border border-gray-200 rounded-lg" data-testid="selected-events-list">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-900">
              Events in selected range
            </h3>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-2">
            {(() => {
              const selectedEvents = filteredEvents.filter(e => {
                const time = new Date(e.createdAt).getTime();
                return time >= brushSelection.startTime && time <= brushSelection.endTime;
              });

              if (selectedEvents.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No events in the selected time range
                  </div>
                );
              }

              return selectedEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
