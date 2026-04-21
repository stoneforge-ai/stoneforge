// ── Document Type Definitions ──

export type ContentType = 'markdown' | 'text' | 'json'
export type DocumentStatus = 'active' | 'archived'
export type DocumentCategory =
  | 'spec' | 'prd' | 'decision-log' | 'changelog' | 'tutorial'
  | 'how-to' | 'explanation' | 'reference' | 'runbook'
  | 'meeting-notes' | 'post-mortem' | 'other'

export interface Document {
  id: string
  title: string
  content: string
  contentType: ContentType
  category: DocumentCategory
  status: DocumentStatus
  version: number
  tags: string[]
  libraryId: string | null  // null = top-level
  createdAt: string
  updatedAt: string
  createdBy: string
  // cross-references
  linkedDocIds: string[]
  linkedTaskIds: string[]
  linkedMRIds: string[]
  agentSessionId?: string
}

export interface Library {
  id: string
  name: string
  parentId: string | null  // null = top-level
  description?: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface DocumentVersion {
  version: number
  updatedAt: string
  updatedBy: string
  title: string
  content: string         // full content at this version
  contentPreview: string  // first ~80 chars
}

// ── Filter / Sort ──

export type DocSortField = 'updatedAt' | 'createdAt' | 'title'
export type DocFilterCategory = DocumentCategory | 'all'
export type DocFilterContentType = ContentType | 'all'
