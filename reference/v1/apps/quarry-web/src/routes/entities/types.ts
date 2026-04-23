/**
 * Types for the Entities page
 * Page-specific types that extend or complement the base entity types
 */

import type { Entity as BaseEntity } from '../../components/entity';

// Re-export the base Entity type
export type Entity = BaseEntity & {
  reportsTo?: string;
};

export interface EntityStats {
  assignedTaskCount: number;
  activeTaskCount: number;
  completedTaskCount: number;
  createdTaskCount: number;
  messageCount: number;
  documentCount: number;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  priority: number;
}

export interface StoneforgeEvent {
  id: number;
  elementId: string;
  elementType: string;
  eventType: string;
  actor: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

export type EntityTypeFilter = 'all' | 'agent' | 'human' | 'system';

export interface InboxItem {
  id: string;
  recipientId: string;
  messageId: string;
  channelId: string;
  sourceType: 'direct' | 'mention';
  status: 'unread' | 'read' | 'archived';
  readAt: string | null;
  createdAt: string;
  // Hydrated fields (optional)
  message?: {
    id: string;
    sender: string;
    contentRef: string;
    contentPreview?: string;
    fullContent?: string;
    contentType?: string;
    threadId?: string | null;
    createdAt: string;
  } | null;
  channel?: {
    id: string;
    name: string;
    channelType: 'group' | 'direct';
  } | null;
  sender?: Entity | null;
  // Hydrated attachments
  attachments?: {
    id: string;
    title: string;
    content?: string;
    contentType?: string;
  }[];
  // Thread parent message info
  threadParent?: {
    id: string;
    sender?: Entity | null;
    contentPreview: string;
    createdAt: string;
  } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface EntityActivity {
  entityId: string;
  startDate: string;
  endDate: string;
  totalEvents: number;
  activity: { date: string; count: number }[];
}

export interface MentionItem {
  id: string;
  title: string;
  updatedAt: string;
  type: 'document' | 'task';
  contentType?: string;
  status?: string;
}

export interface EntityMentions {
  entityId: string;
  entityName: string;
  mentions: MentionItem[];
  documentCount: number;
  taskCount: number;
  totalCount: number;
}

export interface EntityHistoryResult {
  items: StoneforgeEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export type HistoryEventTypeFilter = 'all' | 'created' | 'updated' | 'closed' | 'deleted';

export type InboxViewType = 'unread' | 'all' | 'archived';

export type InboxSourceFilter = 'all' | 'direct' | 'mention';

export type InboxSortOrder = 'newest' | 'oldest' | 'sender';

export type EntityDetailTab = 'overview' | 'inbox' | 'history';

export interface UpdateEntityInput {
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  active?: boolean;
}
