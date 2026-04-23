/**
 * Constants for the Entities page
 */

import { Bot, User, Server, Users } from 'lucide-react';
import type { EntityTypeFilter, InboxViewType, HistoryEventTypeFilter } from './types';

export const DEFAULT_PAGE_SIZE = 25;

export const ENTITY_TYPE_STYLES: Record<string, { bg: string; text: string; icon: typeof Bot }> = {
  agent: { bg: 'bg-purple-100', text: 'text-purple-800', icon: Bot },
  human: { bg: 'bg-blue-100', text: 'text-blue-800', icon: User },
  system: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Server },
};

export const FILTER_TABS: { value: EntityTypeFilter; label: string; icon: typeof Users }[] = [
  { value: 'all', label: 'All', icon: Users },
  { value: 'agent', label: 'Agents', icon: Bot },
  { value: 'human', label: 'Humans', icon: User },
  { value: 'system', label: 'Systems', icon: Server },
];

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  closed: 'bg-green-100 text-green-800',
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-600',
  2: 'text-orange-600',
  3: 'text-yellow-600',
  4: 'text-green-600',
  5: 'text-gray-500',
};

export const INBOX_VIEW_TABS: { value: InboxViewType; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
  { value: 'archived', label: 'Archived' },
];

export const HISTORY_EVENT_TYPE_OPTIONS: { value: HistoryEventTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Events' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'closed', label: 'Closed' },
  { value: 'deleted', label: 'Deleted' },
];

// LocalStorage keys
export const STORAGE_KEYS = {
  HISTORY_PAGE_SIZE: 'history.pageSize',
  HISTORY_EVENT_TYPE: 'history.eventType',
  INBOX_VIEW: 'inbox.view',
  INBOX_SOURCE_FILTER: 'inbox.sourceFilter',
  INBOX_SORT_ORDER: 'inbox.sortOrder',
} as const;
