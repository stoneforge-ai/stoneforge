/**
 * Utility functions for the Entities page
 * Includes localStorage persistence helpers
 */

import { STORAGE_KEYS } from './constants';
import type { HistoryEventTypeFilter, InboxViewType, InboxSourceFilter, InboxSortOrder } from './types';

// History preferences
export function getStoredHistoryPageSize(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY_PAGE_SIZE);
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num > 0 && num <= 100) return num;
    }
  } catch {
    // localStorage not available
  }
  return 25; // Default
}

export function setStoredHistoryPageSize(size: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY_PAGE_SIZE, size.toString());
  } catch {
    // localStorage not available
  }
}

export function getStoredHistoryEventType(): HistoryEventTypeFilter {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY_EVENT_TYPE);
    if (stored === 'all' || stored === 'created' || stored === 'updated' || stored === 'closed' || stored === 'deleted') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all'; // Default
}

export function setStoredHistoryEventType(type: HistoryEventTypeFilter): void {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY_EVENT_TYPE, type);
  } catch {
    // localStorage not available
  }
}

// Inbox preferences
export function getStoredInboxView(): InboxViewType {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INBOX_VIEW);
    if (stored === 'unread' || stored === 'all' || stored === 'archived') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all'; // Default
}

export function setStoredInboxView(view: InboxViewType): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INBOX_VIEW, view);
  } catch {
    // localStorage not available
  }
}

export function getStoredSourceFilter(): InboxSourceFilter {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INBOX_SOURCE_FILTER);
    if (stored === 'all' || stored === 'direct' || stored === 'mention') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all'; // Default
}

export function setStoredSourceFilter(filter: InboxSourceFilter): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INBOX_SOURCE_FILTER, filter);
  } catch {
    // localStorage not available
  }
}

export function getStoredSortOrder(): InboxSortOrder {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INBOX_SORT_ORDER);
    if (stored === 'newest' || stored === 'oldest' || stored === 'sender') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'newest'; // Default
}

export function setStoredSortOrder(order: InboxSortOrder): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INBOX_SORT_ORDER, order);
  } catch {
    // localStorage not available
  }
}
