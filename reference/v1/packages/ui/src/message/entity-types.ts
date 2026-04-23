/**
 * Shared types for entity components
 * These mirror the types from the backend API responses
 */

export interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  // TB83: Rich task display counts
  _attachmentCount?: number;
  _blocksCount?: number;
  _blockedByCount?: number;
  // Optional description preview (from hydration)
  description?: string;
}

export interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface Team {
  id: string;
  type: 'team';
  name: string;
  members: string[];
  status?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface Plan {
  id: string;
  type: 'plan';
  title: string;
  status: string;
  tasks?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  type: 'workflow';
  title: string;
  status: string;
  ephemeral?: boolean;
  playbookId?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  type: 'document';
  title: string;
  contentType: string;
  content?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  type: 'channel';
  name: string;
  channelType: 'group' | 'direct';
  members?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
