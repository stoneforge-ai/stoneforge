/**
 * Session Messages Service
 *
 * Persists session messages/events to SQLite for transcript restoration.
 * Messages are saved immediately when received to prevent data loss.
 */

import type { StorageBackend } from '@stoneforge/storage';
import type { EntityId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';

export interface SessionMessage {
  id: string;
  sessionId: string;
  agentId: EntityId;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'result';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  isError: boolean;
  createdAt: Timestamp;
}

export interface SessionMessageService {
  /**
   * Save a message to the database
   */
  saveMessage(message: Omit<SessionMessage, 'createdAt'> & { createdAt?: Timestamp }): void;

  /**
   * Get all messages for a session
   */
  getSessionMessages(sessionId: string): SessionMessage[];

  /**
   * Get messages for multiple sessions (for loading related/resumed sessions)
   */
  getMessagesForSessions(sessionIds: string[]): SessionMessage[];

  /**
   * Get messages for a session after a specific message ID (for incremental loading)
   */
  getSessionMessagesAfter(sessionId: string, afterId: string): SessionMessage[];

  /**
   * Delete all messages for a session
   */
  deleteSessionMessages(sessionId: string): void;

  /**
   * Get the count of messages for a session
   */
  getMessageCount(sessionId: string): number;

  /**
   * Get the latest displayable message for a session.
   * Returns the most recent message that has content or is a tool_use event
   * (which can be displayed as "Using <tool>...").
   */
  getLatestDisplayableMessage(sessionId: string): SessionMessage | undefined;

  /**
   * Get the latest displayable messages for multiple sessions (batch).
   * Returns a map of sessionId -> latest message.
   */
  getLatestDisplayableMessages(sessionIds: string[]): Map<string, SessionMessage>;
}

interface DbSessionMessage {
  [key: string]: unknown;
  id: string;
  session_id: string;
  agent_id: string;
  type: string;
  content: string | null;
  tool_name: string | null;
  tool_input: string | null;
  tool_output: string | null;
  is_error: number;
  created_at: string;
}

function dbToMessage(row: DbSessionMessage): SessionMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    agentId: row.agent_id as EntityId,
    type: row.type as SessionMessage['type'],
    content: row.content ?? undefined,
    toolName: row.tool_name ?? undefined,
    toolInput: row.tool_input ?? undefined,
    toolOutput: row.tool_output ?? undefined,
    isError: row.is_error === 1,
    createdAt: row.created_at as Timestamp,
  };
}

export function createSessionMessageService(storage: StorageBackend): SessionMessageService {
  return {
    saveMessage(message) {
      const createdAt = message.createdAt ?? createTimestamp();

      // Explicitly construct params with all 10 values for the 10 SQL placeholders
      // Order must match: id, session_id, agent_id, type, content, tool_name, tool_input, tool_output, is_error, created_at
      const id = message.id ?? '';
      const sessionId = message.sessionId ?? '';
      const agentId = message.agentId ?? '';
      const type = message.type ?? 'system';
      // SAFETY: Ensure content is a string or null, never an object (SQLite can't bind objects)
      const content = typeof message.content === 'string' ? message.content : null;
      const toolName = typeof message.toolName === 'string' ? message.toolName : null;
      const toolInput = typeof message.toolInput === 'string' ? message.toolInput : null;
      const toolOutput = typeof message.toolOutput === 'string' ? message.toolOutput : null;
      const isError = message.isError ? 1 : 0;

      storage.run(
        'INSERT OR REPLACE INTO session_messages (id, session_id, agent_id, type, content, tool_name, tool_input, tool_output, is_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, sessionId, agentId, type, content, toolName, toolInput, toolOutput, isError, createdAt]
      );
    },

    getSessionMessages(sessionId) {
      const rows = storage.query<DbSessionMessage>(
        `SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC`,
        [sessionId]
      );
      return rows.map(dbToMessage);
    },

    getMessagesForSessions(sessionIds) {
      if (sessionIds.length === 0) {
        return [];
      }
      // Build placeholders for IN clause
      const placeholders = sessionIds.map(() => '?').join(', ');
      const rows = storage.query<DbSessionMessage>(
        `SELECT * FROM session_messages WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`,
        sessionIds
      );
      return rows.map(dbToMessage);
    },

    getSessionMessagesAfter(sessionId, afterId) {
      // Get the timestamp of the afterId message, then get all messages after it
      const afterRow = storage.query<{ created_at: string }>(
        `SELECT created_at FROM session_messages WHERE id = ?`,
        [afterId]
      );

      if (afterRow.length === 0) {
        // If afterId not found, return all messages
        return this.getSessionMessages(sessionId);
      }

      const rows = storage.query<DbSessionMessage>(
        `SELECT * FROM session_messages
         WHERE session_id = ? AND created_at > ?
         ORDER BY created_at ASC`,
        [sessionId, afterRow[0].created_at]
      );
      return rows.map(dbToMessage);
    },

    deleteSessionMessages(sessionId) {
      storage.run(`DELETE FROM session_messages WHERE session_id = ?`, [sessionId]);
    },

    getMessageCount(sessionId) {
      const result = storage.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM session_messages WHERE session_id = ?`,
        [sessionId]
      );
      return result[0]?.count ?? 0;
    },

    getLatestDisplayableMessage(sessionId) {
      // Get the most recent message that has displayable content:
      // - Has text content, OR
      // - Is a tool_use event (can display tool name), OR
      // - Is a tool_result event (can display "Tool completed")
      // Exclude 'user' type (user prompts are not useful for status display)
      const rows = storage.query<DbSessionMessage>(
        `SELECT * FROM session_messages
         WHERE session_id = ?
           AND type != 'user'
           AND (content IS NOT NULL OR type IN ('tool_use', 'tool_result'))
         ORDER BY created_at DESC
         LIMIT 1`,
        [sessionId]
      );
      return rows.length > 0 ? dbToMessage(rows[0]) : undefined;
    },

    getLatestDisplayableMessages(sessionIds) {
      const result = new Map<string, SessionMessage>();
      if (sessionIds.length === 0) return result;

      // Query each session individually for clarity and to use the index efficiently
      for (const sessionId of sessionIds) {
        const msg = this.getLatestDisplayableMessage(sessionId);
        if (msg) {
          result.set(sessionId, msg);
        }
      }
      return result;
    },
  };
}
