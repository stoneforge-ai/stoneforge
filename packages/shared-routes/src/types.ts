/**
 * Shared Types for Collaborate Routes
 *
 * Defines the services interface that both main server and orchestrator-server satisfy.
 * Uses duck-typed interfaces to avoid circular dependency on @stoneforge/quarry.
 */

import type { StorageBackend } from '@stoneforge/storage';
import type {
  Element,
  ElementId,
  EntityId,
  Document,
  DocumentId,
  Task,
  Channel,
  Dependency,
  DependencyType,
  PlanProgress,
  InboxFilter,
  InboxItem,
  CreateInboxItemInput,
} from '@stoneforge/core';

// ============================================================================
// Duck-typed interfaces for quarry types
// ============================================================================

/**
 * Subset of QuarryAPI methods used by shared routes.
 * Avoids a circular dependency on @stoneforge/quarry.
 */
export interface QuarryLikeAPI {
  get<T extends Element>(id: ElementId, options?: { hydrate?: { description?: boolean; content?: boolean; attachments?: boolean } }): Promise<T | null>;
  list<T extends Element>(filter?: Record<string, unknown>): Promise<T[]>;
  listPaginated<T extends Element>(filter?: Record<string, unknown>): Promise<{ items: T[]; total: number; offset: number; limit: number; hasMore: boolean }>;
  create<T extends Element>(input: Record<string, unknown>): Promise<T>;
  update<T extends Element>(id: ElementId, updates: Partial<T>, options?: { actor?: EntityId; expectedUpdatedAt?: string }): Promise<T>;
  delete(id: ElementId, options?: { actor?: EntityId; reason?: string }): Promise<void>;
  search(query: string, filter?: Record<string, unknown>): Promise<Element[]>;
  searchDocumentsFTS(query: string, options?: Record<string, unknown>): Promise<Array<{ document: Document; score: number; snippet: string }>>;
  getDependencies(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;
  getDependents(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;
  addDependency(dep: { blockedId: ElementId; blockerId: ElementId; type: DependencyType; metadata?: Record<string, unknown>; actor?: EntityId }): Promise<Dependency>;
  removeDependency(blockedId: ElementId, blockerId: ElementId, type: DependencyType, actor?: EntityId): Promise<void>;
  addChannelMember(channelId: ElementId, entityId: EntityId, options?: { actor?: EntityId }): Promise<{ success: boolean; channel: Channel; entityId: EntityId }>;
  removeChannelMember(channelId: ElementId, entityId: EntityId, options?: { actor?: EntityId; reason?: string }): Promise<{ success: boolean; channel: Channel; entityId: EntityId }>;
  leaveChannel(channelId: ElementId, actor: EntityId): Promise<{ success: boolean; channel: Channel; entityId: EntityId }>;
  mergeChannels(sourceId: ElementId, targetId: ElementId, options?: { newName?: string; actor?: EntityId }): Promise<{ target: Channel; sourceArchived: boolean; messagesMoved: number }>;
  getDocumentHistory(id: DocumentId): Promise<Document[]>;
  getDocumentVersion(id: DocumentId, version: number): Promise<Document | null>;
  getPlanProgress(planId: ElementId): Promise<PlanProgress>;
  getTasksInPlan(planId: ElementId, filter?: Record<string, unknown>): Promise<Task[]>;
  addTaskToPlan(taskId: ElementId, planId: ElementId, options?: { actor?: EntityId }): Promise<Dependency>;
  removeTaskFromPlan(taskId: ElementId, planId: ElementId, actor?: EntityId): Promise<void>;
}

/**
 * Subset of InboxService methods used by shared routes.
 * Avoids a circular dependency on @stoneforge/quarry.
 */
export interface InboxLikeService {
  getInboxPaginated(recipientId: string, filter?: InboxFilter): { items: InboxItem[]; total: number };
  getUnreadCount(recipientId: string): number;
  markAllAsRead(recipientId: string): number;
  getInboxItem(itemId: string): InboxItem | null;
  markAsRead(itemId: string): InboxItem;
  markAsUnread(itemId: string): InboxItem;
  archive(itemId: string): InboxItem;
  addToInbox(input: CreateInboxItemInput): InboxItem;
}

/**
 * Services required for collaborate routes.
 * Both main server and orchestrator-server provide these services.
 */
export interface CollaborateServices {
  api: QuarryLikeAPI;
  inboxService: InboxLikeService;
  storageBackend: StorageBackend;
}

/**
 * Optional callback for broadcasting inbox events in real-time.
 * Used by servers with WebSocket support.
 */
export type BroadcastInboxEventFn = (
  id: string,
  recipientId: EntityId,
  action: 'created' | 'updated' | 'deleted',
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  actor: EntityId
) => void;

/**
 * Extended services including optional real-time features.
 */
export interface CollaborateServicesWithBroadcast extends CollaborateServices {
  broadcastInboxEvent?: BroadcastInboxEventFn;
}
