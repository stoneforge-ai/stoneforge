/**
 * Utility functions for the Timeline page
 * Date formatting, event helpers, and UI utilities
 */

import type { Event, EventType, TimePeriod } from './types';
import { EVENT_TYPE_DISPLAY, AVATAR_COLORS } from './constants';

/**
 * Determine the time period for a given date
 */
export function getTimePeriod(dateString: string): TimePeriod {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return 'today';
  if (date >= yesterday) return 'yesterday';
  if (date >= weekAgo) return 'thisWeek';
  return 'earlier';
}

/**
 * Format a date as a relative time string (e.g., "5m ago", "2d ago")
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Format a date to show just the time (e.g., "2:30 PM")
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a date to show short date (e.g., "Jan 15")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Generate a preview string for event changes
 */
export function generateChangesPreview(event: Event): string | null {
  const { eventType, oldValue, newValue } = event;

  if (eventType === 'updated' && oldValue && newValue) {
    const changedFields: string[] = [];
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of allKeys) {
      if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
        const newVal = newValue[key];
        if (typeof newVal === 'string' && newVal.length < 30) {
          changedFields.push(`${key}: "${newVal}"`);
        } else {
          changedFields.push(key);
        }
      }
    }
    if (changedFields.length > 0) {
      return changedFields.slice(0, 2).join(', ') + (changedFields.length > 2 ? `, +${changedFields.length - 2} more` : '');
    }
  }

  if (eventType === 'dependency_added' && newValue) {
    const blockerId = (newValue.blockerId as string) ?? '';
    const depType = (newValue.type as string) ?? 'dependency';
    if (blockerId) return `${depType} → ${blockerId.slice(0, 8)}...`;
  }

  if (eventType === 'dependency_removed' && oldValue) {
    const blockerId = (oldValue.blockerId as string) ?? '';
    const depType = (oldValue.type as string) ?? 'dependency';
    if (blockerId) return `${depType} → ${blockerId.slice(0, 8)}...`;
  }

  if (eventType === 'tag_added' && newValue) {
    const tag = (newValue.tag as string) ?? '';
    if (tag) return `"${tag}"`;
  }

  if (eventType === 'tag_removed' && oldValue) {
    const tag = (oldValue.tag as string) ?? '';
    if (tag) return `"${tag}"`;
  }

  if (eventType === 'member_added' && newValue) {
    const member = (newValue.addedMember as string) ?? '';
    if (member) return member;
  }

  if (eventType === 'member_removed' && newValue) {
    const member = (newValue.removedMember as string) ?? '';
    const selfRemoval = newValue.selfRemoval;
    if (member) return selfRemoval ? `${member} left` : member;
  }

  return null;
}

/**
 * Generate a summary string for an event
 */
export function generateEventSummary(event: Event): string {
  const { eventType, actor } = event;

  switch (eventType) {
    case 'created':
      return `Created by ${actor}`;
    case 'updated':
      return `Updated by ${actor}`;
    case 'closed':
      return `Closed by ${actor}`;
    case 'reopened':
      return `Reopened by ${actor}`;
    case 'deleted':
      return `Deleted by ${actor}`;
    case 'dependency_added':
      return `Dependency added by ${actor}`;
    case 'dependency_removed':
      return `Dependency removed by ${actor}`;
    case 'tag_added':
      return `Tag added by ${actor}`;
    case 'tag_removed':
      return `Tag removed by ${actor}`;
    case 'member_added':
      return `Member added by ${actor}`;
    case 'member_removed':
      return `Member removed by ${actor}`;
    case 'auto_blocked':
      return 'Automatically blocked';
    case 'auto_unblocked':
      return 'Automatically unblocked';
    default:
      return `${EVENT_TYPE_DISPLAY[eventType] || eventType} by ${actor}`;
  }
}

/**
 * Get initials from a name string
 */
export function getInitials(name: string): string {
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Get a consistent avatar background color based on name
 */
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Infer element type from element ID prefix
 */
export function inferElementType(elementId: string): string {
  const prefix = elementId.slice(0, 2).toLowerCase();
  const prefixMap: Record<string, string> = {
    ts: 'task',
    tk: 'task',
    pl: 'plan',
    wf: 'workflow',
    ch: 'channel',
    ms: 'message',
    dc: 'document',
    lb: 'library',
    en: 'entity',
    tm: 'team',
    pb: 'playbook',
  };
  return prefixMap[prefix] || 'element';
}

/**
 * Get the hex color for an event type (used in horizontal timeline)
 */
export function getEventDotColor(eventType: EventType): string {
  const colors: Record<EventType, string> = {
    created: '#22c55e',
    updated: '#3b82f6',
    closed: '#a855f7',
    reopened: '#eab308',
    deleted: '#ef4444',
    dependency_added: '#6366f1',
    dependency_removed: '#ec4899',
    tag_added: '#06b6d4',
    tag_removed: '#f97316',
    member_added: '#14b8a6',
    member_removed: '#f43f5e',
    auto_blocked: '#ef4444',
    auto_unblocked: '#10b981',
  };
  return colors[eventType] || '#6b7280';
}
