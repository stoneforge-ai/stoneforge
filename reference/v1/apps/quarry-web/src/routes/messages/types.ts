/**
 * Type definitions for the Messages feature
 */

export interface Entity {
  id: string;
  name: string;
  entityType: 'human' | 'agent' | 'system';
}

export interface Channel {
  id: string;
  name: string;
  channelType: 'direct' | 'group';
  members: string[];
  createdBy: string;
  permissions: {
    visibility: 'public' | 'private';
    joinPolicy: 'open' | 'invite-only' | 'request';
    modifyMembers: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface AttachedDocument {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  sender: string;
  contentRef: string;
  attachments: string[];
  threadId: string | null;
  createdAt: string;
  createdBy: string;
  _content?: string;
  _attachments?: AttachedDocument[];
}

export interface MessageSearchResult {
  id: string;
  channelId: string;
  sender: string;
  content: string;
  snippet: string;
  createdAt: string;
  threadId: string | null;
}

export interface MessageSearchResponse {
  results: MessageSearchResult[];
  query: string;
}

export interface ImageAttachment {
  url: string;
  filename?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
