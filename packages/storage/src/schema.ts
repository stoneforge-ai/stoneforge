/**
 * Schema Management
 *
 * Defines the database schema migrations for Stoneforge.
 * Uses a migration-based approach for schema versioning.
 */

import type { Migration, MigrationResult, StorageBackend } from './index.js';

// ============================================================================
// Schema Constants
// ============================================================================

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 9;

// ============================================================================
// Migrations
// ============================================================================

/**
 * Migration 1: Initial schema
 *
 * Creates all core tables and indexes for the Stoneforge storage system.
 */
const migration001: Migration = {
  version: 1,
  description: 'Initial schema with elements, dependencies, tags, events, and caching tables',
  up: `
-- Core element storage
CREATE TABLE elements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    content_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (type IN ('task', 'message', 'document', 'entity',
                    'plan', 'workflow', 'playbook',
                    'channel', 'library', 'team'))
);

-- Document version history
CREATE TABLE document_versions (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, version)
);

-- Dependencies
CREATE TABLE dependencies (
    blocked_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    blocker_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    metadata TEXT,
    PRIMARY KEY (blocked_id, blocker_id, type)
);

-- Tags (many-to-many)
CREATE TABLE tags (
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (element_id, tag)
);

-- Events (audit trail)
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL
);

-- Hierarchical ID counters
CREATE TABLE child_counters (
    parent_id TEXT PRIMARY KEY,
    last_child INTEGER NOT NULL DEFAULT 0
);

-- Blocked elements cache (optimization for ready work queries)
CREATE TABLE blocked_cache (
    element_id TEXT PRIMARY KEY,
    blocked_by TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY (element_id) REFERENCES elements(id) ON DELETE CASCADE
);

-- Key indexes for performance
CREATE INDEX idx_elements_type ON elements(type);
CREATE INDEX idx_elements_created_by ON elements(created_by);
CREATE INDEX idx_elements_created_at ON elements(created_at);
CREATE INDEX idx_elements_content_hash ON elements(content_hash);
CREATE INDEX idx_elements_deleted_at ON elements(deleted_at);
CREATE INDEX idx_dependencies_blocker ON dependencies(blocker_id);
CREATE INDEX idx_dependencies_type ON dependencies(type);
CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_events_element ON events(element_id);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_document_versions_id ON document_versions(id);
`,
  down: `
-- Drop indexes first
DROP INDEX IF EXISTS idx_document_versions_id;
DROP INDEX IF EXISTS idx_events_created_at;
DROP INDEX IF EXISTS idx_events_element;
DROP INDEX IF EXISTS idx_tags_tag;
DROP INDEX IF EXISTS idx_dependencies_type;
DROP INDEX IF EXISTS idx_dependencies_blocker;
DROP INDEX IF EXISTS idx_elements_deleted_at;
DROP INDEX IF EXISTS idx_elements_content_hash;
DROP INDEX IF EXISTS idx_elements_created_at;
DROP INDEX IF EXISTS idx_elements_created_by;
DROP INDEX IF EXISTS idx_elements_type;

-- Drop tables in reverse order of creation (respecting dependencies)
DROP TABLE IF EXISTS blocked_cache;
DROP TABLE IF EXISTS child_counters;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS dependencies;
DROP TABLE IF EXISTS document_versions;
DROP TABLE IF EXISTS elements;
`,
};

/**
 * Migration 2: Add missing event indexes
 *
 * Adds indexes for actor and event_type columns on the events table
 * to support efficient queries by actor and event type.
 */
const migration002: Migration = {
  version: 2,
  description: 'Add missing event indexes for actor and event_type',
  up: `
-- Add indexes for event queries by actor and type
CREATE INDEX idx_events_actor ON events(actor);
CREATE INDEX idx_events_type ON events(event_type);
`,
  down: `
DROP INDEX IF EXISTS idx_events_type;
DROP INDEX IF EXISTS idx_events_actor;
`,
};

/**
 * Migration 3: Add previous_status to blocked_cache for automatic status transitions
 *
 * Stores the task's status before it became blocked, so we can restore it
 * when the task becomes unblocked.
 */
const migration003: Migration = {
  version: 3,
  description: 'Add previous_status column to blocked_cache for automatic status transitions',
  up: `
-- Add previous_status column to track status before blocking
ALTER TABLE blocked_cache ADD COLUMN previous_status TEXT;
`,
  down: `
-- SQLite doesn't support DROP COLUMN directly in older versions
-- We need to recreate the table without the column
CREATE TABLE blocked_cache_new (
    element_id TEXT PRIMARY KEY,
    blocked_by TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY (element_id) REFERENCES elements(id) ON DELETE CASCADE
);
INSERT INTO blocked_cache_new (element_id, blocked_by, reason)
SELECT element_id, blocked_by, reason FROM blocked_cache;
DROP TABLE blocked_cache;
ALTER TABLE blocked_cache_new RENAME TO blocked_cache;
`,
};

/**
 * Migration 4: Add inbox_items table for unified notifications
 *
 * Creates the inbox system for tracking notifications to entities.
 * Inbox items are created when:
 * - A message is sent directly to an entity
 * - An entity is mentioned in a message
 */
const migration004: Migration = {
  version: 4,
  description: 'Add inbox_items table for unified notifications',
  up: `
-- Inbox items for entity notifications
CREATE TABLE inbox_items (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('direct', 'mention')),
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES elements(id) ON DELETE CASCADE,
    UNIQUE(recipient_id, message_id)
);

-- Index for querying inbox by recipient and status (primary use case)
CREATE INDEX idx_inbox_recipient_status ON inbox_items(recipient_id, status);

-- Index for querying inbox by recipient ordered by creation time
CREATE INDEX idx_inbox_recipient_created ON inbox_items(recipient_id, created_at DESC);

-- Index for cascade deletion when message is deleted
CREATE INDEX idx_inbox_message ON inbox_items(message_id);
`,
  down: `
-- Drop indexes first
DROP INDEX IF EXISTS idx_inbox_message;
DROP INDEX IF EXISTS idx_inbox_recipient_created;
DROP INDEX IF EXISTS idx_inbox_recipient_status;

-- Drop table
DROP TABLE IF EXISTS inbox_items;
`,
};

/**
 * Migration 5: Add comments table for inline document comments
 *
 * Comments are stored separately from document content to:
 * - Keep Markdown clean and AI-agent readable
 * - Allow comments to be toggled on/off in view
 * - Survive document content changes via text anchoring
 */
const migration005: Migration = {
  version: 5,
  description: 'Add comments table for inline document comments with text anchoring',
  up: `
-- Comments for document annotations
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    anchor TEXT NOT NULL,
    start_offset INTEGER,
    end_offset INTEGER,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_by TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (document_id) REFERENCES elements(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES elements(id)
);

-- Index for querying comments by document (primary use case)
CREATE INDEX idx_comments_document ON comments(document_id);

-- Index for querying unresolved comments
CREATE INDEX idx_comments_resolved ON comments(resolved);

-- Index for querying by author
CREATE INDEX idx_comments_author ON comments(author_id);
`,
  down: `
-- Drop indexes first
DROP INDEX IF EXISTS idx_comments_author;
DROP INDEX IF EXISTS idx_comments_resolved;
DROP INDEX IF EXISTS idx_comments_document;

-- Drop table
DROP TABLE IF EXISTS comments;
`,
};

/**
 * Migration 6: Add session_messages table for persistent session event storage
 *
 * Stores all messages/events from agent sessions for:
 * - Transcript restoration after page refresh or reconnection
 * - Session history viewing
 * - Audit trail of agent interactions
 */
const migration006: Migration = {
  version: 6,
  description: 'Add session_messages table for persistent session event storage',
  up: `
-- Session messages/events for agent sessions
CREATE TABLE session_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('user', 'assistant', 'tool_use', 'tool_result', 'system', 'error', 'result')),
    content TEXT,
    tool_name TEXT,
    tool_input TEXT,
    tool_output TEXT,
    is_error INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Index for querying messages by session (primary use case)
CREATE INDEX idx_session_messages_session ON session_messages(session_id);

-- Index for querying messages by agent
CREATE INDEX idx_session_messages_agent ON session_messages(agent_id);

-- Index for querying messages by session ordered by creation time
CREATE INDEX idx_session_messages_session_time ON session_messages(session_id, created_at);
`,
  down: `
-- Drop indexes first
DROP INDEX IF EXISTS idx_session_messages_session_time;
DROP INDEX IF EXISTS idx_session_messages_agent;
DROP INDEX IF EXISTS idx_session_messages_session;

-- Drop table
DROP TABLE IF EXISTS session_messages;
`,
};

/**
 * Migration 7: Add FTS5 virtual table for document full-text search
 *
 * Creates an external-content FTS5 virtual table for document search.
 * Application code manages sync (insert/delete on create/update/delete).
 * Columns: document_id (UNINDEXED), title, content, tags, category (UNINDEXED)
 */
const migration007: Migration = {
  version: 7,
  description: 'Add FTS5 virtual table for document full-text search',
  up: `
-- FTS5 virtual table for document search (external content mode)
CREATE VIRTUAL TABLE documents_fts USING fts5(
    document_id UNINDEXED,
    title,
    content,
    tags,
    category UNINDEXED,
    tokenize='porter unicode61'
);
`,
  down: `
DROP TABLE IF EXISTS documents_fts;
`,
};

/**
 * Migration 8: Add document_embeddings table for vector semantic search
 *
 * Stores pre-computed embeddings for documents.
 * Initial implementation uses brute-force cosine similarity.
 * Future: sqlite-vec ANN virtual table for efficient nearest-neighbor search.
 */
const migration008: Migration = {
  version: 8,
  description: 'Add document_embeddings table for vector semantic search',
  up: `
-- Document embeddings for semantic search
CREATE TABLE document_embeddings (
    document_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    dimensions INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES elements(id) ON DELETE CASCADE
);
`,
  down: `
DROP TABLE IF EXISTS document_embeddings;
`,
};

/**
 * Migration 9: Add settings table for server-side key-value settings
 *
 * Stores workspace-wide configuration as key-value pairs.
 * Used for settings that need to be accessible server-side (e.g., default executable paths).
 * Values are stored as JSON strings to support structured data.
 */
const migration009: Migration = {
  version: 9,
  description: 'Add settings table for server-side key-value configuration',
  up: `
-- Server-side settings (key-value store with JSON values)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`,
  down: `
DROP TABLE IF EXISTS settings;
`,
};

/**
 * All migrations in order
 */
export const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009];

// ============================================================================
// Schema Functions
// ============================================================================

/**
 * Initialize the database schema
 *
 * Applies all pending migrations to bring the database up to the current version.
 *
 * @param backend - The storage backend to initialize
 * @returns Migration result with details of what was applied
 */
export function initializeSchema(backend: StorageBackend): MigrationResult {
  return backend.migrate([...MIGRATIONS]);
}

/**
 * Get the current schema version from a backend
 *
 * @param backend - The storage backend to check
 * @returns Current schema version number
 */
export function getSchemaVersion(backend: StorageBackend): number {
  return backend.getSchemaVersion();
}

/**
 * Check if the schema is up to date
 *
 * @param backend - The storage backend to check
 * @returns True if schema is at the current version
 */
export function isSchemaUpToDate(backend: StorageBackend): boolean {
  return backend.getSchemaVersion() === CURRENT_SCHEMA_VERSION;
}

/**
 * Get pending migrations that need to be applied
 *
 * @param backend - The storage backend to check
 * @returns Array of migrations that haven't been applied yet
 */
export function getPendingMigrations(backend: StorageBackend): Migration[] {
  const currentVersion = backend.getSchemaVersion();
  return MIGRATIONS.filter((m) => m.version > currentVersion);
}

/**
 * Reset the database schema
 *
 * WARNING: This drops all tables and data! Use only for testing.
 *
 * @param backend - The storage backend to reset
 */
export function resetSchema(backend: StorageBackend): void {
  // Run all down scripts in reverse order (newest first)
  const reversedMigrations = [...MIGRATIONS].reverse();
  for (const migration of reversedMigrations) {
    if (migration.down) {
      backend.exec(migration.down);
    }
  }

  // Reset version
  backend.setSchemaVersion(0);
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Table names that should exist after schema initialization
 */
export const EXPECTED_TABLES = [
  'elements',
  'document_versions',
  'dependencies',
  'tags',
  'events',
  'dirty_elements', // Created by backend initialization
  'child_counters',
  'blocked_cache',
  'inbox_items',
  'comments',
  'session_messages',
  'documents_fts',
  'document_embeddings',
  'settings',
] as const;

/**
 * Validate that all expected tables exist
 *
 * @param backend - The storage backend to validate
 * @returns Object with validation results
 */
export function validateSchema(backend: StorageBackend): {
  valid: boolean;
  missingTables: string[];
  extraTables: string[];
} {
  // Query actual tables
  const rows = backend.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );

  const actualTables = new Set(rows.map((r) => r.name));
  const expectedSet = new Set<string>(EXPECTED_TABLES);

  const missingTables = EXPECTED_TABLES.filter((t) => !actualTables.has(t));
  const extraTables = [...actualTables].filter((t) => !expectedSet.has(t));

  return {
    valid: missingTables.length === 0,
    missingTables,
    extraTables,
  };
}

/**
 * Validate table columns match expected schema
 *
 * @param backend - The storage backend
 * @param tableName - Name of table to validate
 * @returns Column information
 */
export function getTableColumns(
  backend: StorageBackend,
  tableName: string
): Array<{
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}> {
  const rows = backend.query<{
    name: string;
    type: string;
    notnull: number;
    pk: number;
  }>(`PRAGMA table_info(${tableName})`);

  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    notnull: r.notnull === 1,
    pk: r.pk === 1,
  }));
}

/**
 * Get indexes for a table
 *
 * @param backend - The storage backend
 * @param tableName - Name of table
 * @returns Index names for the table
 */
export function getTableIndexes(backend: StorageBackend, tableName: string): string[] {
  const rows = backend.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'`,
    [tableName]
  );
  return rows.map((r) => r.name);
}
