/**
 * Handoff Service (TB-O10e, TB-O10f)
 *
 * This service enables agent session handoffs for context preservation:
 *
 * - **Self-Handoff (TB-O10e)**: Agent hands off to fresh instance of itself
 *   - Creates handoff message with context summary
 *   - Suspends current session (available for predecessor query)
 *   - New session finds handoff note in inbox
 *
 * - **Agent-Agent Handoff (TB-O10f)**: Agent hands off to another agent
 *   - Sends handoff message to target agent's channel
 *   - Optionally transfers tasks to target agent
 *   - Triggers target agent to process handoff
 *
 * Key design decisions:
 * - Handoff is manual-only (agent decides when to hand off)
 * - Handoff messages stored as Documents for persistence
 * - Uses existing inbox/channel system for delivery
 *
 * @module
 */

import type { EntityId, DocumentId, MessageId, Timestamp, ChannelId } from '@stoneforge/core';
import { createTimestamp, createDocument, createMessage, ContentType } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';
import type { SessionManager, SessionRecord } from './session-manager.js';
import type { AgentRegistry } from '../services/agent-registry.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Handoff message content structure
 */
export interface HandoffContent {
  /** Type identifier for handoff messages */
  readonly type: 'handoff';
  /** Agent ID of the source (handing off) */
  readonly fromAgentId: EntityId;
  /** Agent ID of the target (receiving handoff), undefined for self-handoff */
  readonly toAgentId?: EntityId;
  /** Summary of the current context/state */
  readonly contextSummary: string;
  /** Recommended next steps */
  readonly nextSteps?: string;
  /** Reason for the handoff */
  readonly reason?: string;
  /** Task IDs being transferred (for agent-agent handoff) */
  readonly taskIds?: string[];
  /** Provider session ID for predecessor queries */
  readonly providerSessionId?: string;
  /** Timestamp when handoff was initiated */
  readonly initiatedAt: Timestamp;
}

/**
 * Options for self-handoff
 */
export interface SelfHandoffOptions {
  /** Summary of current context to preserve */
  readonly contextSummary: string;
  /** Recommended next steps for the new session */
  readonly nextSteps?: string;
  /** Reason for triggering handoff */
  readonly reason?: string;
  /** Additional metadata to include */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of a self-handoff operation
 */
export interface SelfHandoffResult {
  /** Whether the handoff was successful */
  readonly success: boolean;
  /** The handoff document ID */
  readonly handoffDocumentId?: DocumentId;
  /** The message ID sent to the agent's channel */
  readonly messageId?: MessageId;
  /** The suspended session record */
  readonly suspendedSession?: SessionRecord;
  /** Error message if failed */
  readonly error?: string;
  /** Timestamp when handoff completed */
  readonly completedAt: Timestamp;
}

/**
 * Options for agent-to-agent handoff
 */
export interface AgentHandoffOptions {
  /** Summary of current context to preserve */
  readonly contextSummary: string;
  /** Recommended next steps for the target agent */
  readonly nextSteps?: string;
  /** Reason for triggering handoff */
  readonly reason?: string;
  /** Task IDs to transfer to the target agent */
  readonly taskIds?: string[];
  /** Additional metadata to include */
  readonly metadata?: Record<string, unknown>;
  /** Whether to trigger the target agent to wake up (default: true) */
  readonly triggerTarget?: boolean;
}

/**
 * Result of an agent-to-agent handoff operation
 */
export interface AgentHandoffResult {
  /** Whether the handoff was successful */
  readonly success: boolean;
  /** The handoff document ID */
  readonly handoffDocumentId?: DocumentId;
  /** The message ID sent to the target agent's channel */
  readonly messageId?: MessageId;
  /** The suspended session record of the source agent */
  readonly suspendedSession?: SessionRecord;
  /** The target agent ID */
  readonly targetAgentId?: EntityId;
  /** Error message if failed */
  readonly error?: string;
  /** Timestamp when handoff completed */
  readonly completedAt: Timestamp;
}

// ============================================================================
// Handoff Service Interface
// ============================================================================

/**
 * Handoff Service interface for agent session handoffs.
 *
 * The service provides methods for:
 * - Self-handoff: Agent hands off to fresh instance of itself
 * - Agent-agent handoff: Agent hands off to another agent (TB-O10f)
 */
export interface HandoffService {
  /**
   * Performs a self-handoff for an agent.
   *
   * This operation:
   * 1. Creates a handoff document with context summary
   * 2. Sends a handoff message to the agent's own channel
   * 3. Suspends the current session (preserving provider session ID)
   * 4. Terminates the process gracefully
   *
   * The new session can find the handoff note in its inbox and
   * optionally query the suspended predecessor for more context.
   *
   * @param agentId - The agent performing the handoff
   * @param sessionId - The current session ID
   * @param options - Handoff options
   * @returns Result of the handoff operation
   */
  selfHandoff(
    agentId: EntityId,
    sessionId: string,
    options: SelfHandoffOptions
  ): Promise<SelfHandoffResult>;

  /**
   * Performs a handoff from one agent to another.
   *
   * This operation:
   * 1. Creates a handoff document with context summary
   * 2. Sends a handoff message to the target agent's channel
   * 3. Optionally transfers task assignments to the target
   * 4. Suspends the source session
   * 5. Optionally triggers the target agent to wake up
   *
   * @param fromAgentId - The agent initiating the handoff
   * @param toAgentId - The target agent receiving the handoff
   * @param sessionId - The current session ID of the source agent
   * @param options - Handoff options
   * @returns Result of the handoff operation
   */
  handoffToAgent(
    fromAgentId: EntityId,
    toAgentId: EntityId,
    sessionId: string,
    options: AgentHandoffOptions
  ): Promise<AgentHandoffResult>;

  /**
   * Gets the most recent handoff message for an agent.
   *
   * @param agentId - The agent to check for handoff messages
   * @returns The most recent handoff content, or undefined if none
   */
  getLastHandoff(agentId: EntityId): Promise<HandoffContent | undefined>;

  /**
   * Checks if an agent has a pending handoff message.
   *
   * @param agentId - The agent to check
   * @returns True if a handoff message is pending
   */
  hasPendingHandoff(agentId: EntityId): Promise<boolean>;
}

// ============================================================================
// Constants
// ============================================================================

/** Tag used to identify handoff documents */
export const HANDOFF_DOCUMENT_TAG = 'handoff';

/** Message type for handoff messages */
export const HANDOFF_MESSAGE_TYPE = 'handoff';

// ============================================================================
// Implementation
// ============================================================================

/**
 * Implementation of the Handoff Service.
 */
export class HandoffServiceImpl implements HandoffService {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly registry: AgentRegistry,
    private readonly api: QuarryAPI
  ) {}

  async selfHandoff(
    agentId: EntityId,
    sessionId: string,
    options: SelfHandoffOptions
  ): Promise<SelfHandoffResult> {
    const now = createTimestamp();

    try {
      // Get the current session
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: `Session not found: ${sessionId}`,
          completedAt: now,
        };
      }

      // Verify the session belongs to the agent
      if (session.agentId !== agentId) {
        return {
          success: false,
          error: `Session ${sessionId} does not belong to agent ${agentId}`,
          completedAt: now,
        };
      }

      // Verify the session is running
      if (session.status !== 'running') {
        return {
          success: false,
          error: `Cannot handoff session in status: ${session.status}`,
          completedAt: now,
        };
      }

      // Get the agent's channel
      const channelId = await this.registry.getAgentChannelId(agentId);
      if (!channelId) {
        return {
          success: false,
          error: `Agent ${agentId} has no channel`,
          completedAt: now,
        };
      }

      // Create handoff content
      const handoffContent: HandoffContent = {
        type: 'handoff',
        fromAgentId: agentId,
        toAgentId: undefined, // Self-handoff has no target
        contextSummary: options.contextSummary,
        nextSteps: options.nextSteps,
        reason: options.reason,
        providerSessionId: session.providerSessionId,
        initiatedAt: now,
      };

      // Create handoff document
      const handoffDocument = await createDocument({
        content: JSON.stringify(handoffContent, null, 2),
        contentType: ContentType.JSON,
        createdBy: agentId,
        tags: [HANDOFF_DOCUMENT_TAG, 'self-handoff'],
        metadata: {
          handoffType: 'self',
          fromAgentId: agentId,
          providerSessionId: session.providerSessionId,
          ...options.metadata,
        },
      });

      // Save the handoff document
      const savedDocument = await this.api.create(
        handoffDocument as unknown as Record<string, unknown> & { createdBy: EntityId }
      );
      const handoffDocumentId = savedDocument.id as unknown as DocumentId;

      // Create and send handoff message to the agent's channel
      const handoffMessage = await createMessage({
        channelId: channelId as ChannelId,
        sender: agentId,
        contentRef: handoffDocumentId,
        metadata: {
          type: HANDOFF_MESSAGE_TYPE,
          handoffType: 'self',
          fromAgentId: agentId,
          handoffDocumentId,
        },
      });

      const savedMessage = await this.api.create(
        handoffMessage as unknown as Record<string, unknown> & { createdBy: EntityId }
      );
      const messageId = savedMessage.id as unknown as MessageId;

      // Suspend the session (preserves provider session ID for predecessor queries)
      const suspendReason = options.reason
        ? `Self-handoff: ${options.reason}`
        : 'Self-handoff initiated';
      await this.sessionManager.suspendSession(sessionId, suspendReason);

      // Get the updated session record
      const suspendedSession = this.sessionManager.getSession(sessionId);

      return {
        success: true,
        handoffDocumentId,
        messageId,
        suspendedSession: suspendedSession ?? undefined,
        completedAt: createTimestamp(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        completedAt: createTimestamp(),
      };
    }
  }

  async handoffToAgent(
    fromAgentId: EntityId,
    toAgentId: EntityId,
    sessionId: string,
    options: AgentHandoffOptions
  ): Promise<AgentHandoffResult> {
    const now = createTimestamp();

    try {
      // Get the current session
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: `Session not found: ${sessionId}`,
          completedAt: now,
        };
      }

      // Verify the session belongs to the source agent
      if (session.agentId !== fromAgentId) {
        return {
          success: false,
          error: `Session ${sessionId} does not belong to agent ${fromAgentId}`,
          completedAt: now,
        };
      }

      // Verify the session is running
      if (session.status !== 'running') {
        return {
          success: false,
          error: `Cannot handoff session in status: ${session.status}`,
          completedAt: now,
        };
      }

      // Verify target agent exists
      const targetAgent = await this.registry.getAgent(toAgentId);
      if (!targetAgent) {
        return {
          success: false,
          error: `Target agent not found: ${toAgentId}`,
          completedAt: now,
        };
      }

      // Get the target agent's channel
      const targetChannelId = await this.registry.getAgentChannelId(toAgentId);
      if (!targetChannelId) {
        return {
          success: false,
          error: `Target agent ${toAgentId} has no channel`,
          completedAt: now,
        };
      }

      // Create handoff content
      const handoffContent: HandoffContent = {
        type: 'handoff',
        fromAgentId,
        toAgentId,
        contextSummary: options.contextSummary,
        nextSteps: options.nextSteps,
        reason: options.reason,
        taskIds: options.taskIds,
        providerSessionId: session.providerSessionId,
        initiatedAt: now,
      };

      // Create handoff document
      const handoffDocument = await createDocument({
        content: JSON.stringify(handoffContent, null, 2),
        contentType: ContentType.JSON,
        createdBy: fromAgentId,
        tags: [HANDOFF_DOCUMENT_TAG, 'agent-handoff'],
        metadata: {
          handoffType: 'agent-to-agent',
          fromAgentId,
          toAgentId,
          providerSessionId: session.providerSessionId,
          taskIds: options.taskIds,
          ...options.metadata,
        },
      });

      // Save the handoff document
      const savedDocument = await this.api.create(
        handoffDocument as unknown as Record<string, unknown> & { createdBy: EntityId }
      );
      const handoffDocumentId = savedDocument.id as unknown as DocumentId;

      // Create and send handoff message to the target agent's channel
      const handoffMessage = await createMessage({
        channelId: targetChannelId as ChannelId,
        sender: fromAgentId,
        contentRef: handoffDocumentId,
        metadata: {
          type: HANDOFF_MESSAGE_TYPE,
          handoffType: 'agent-to-agent',
          fromAgentId,
          toAgentId,
          handoffDocumentId,
          taskIds: options.taskIds,
        },
      });

      const savedMessage = await this.api.create(
        handoffMessage as unknown as Record<string, unknown> & { createdBy: EntityId }
      );
      const messageId = savedMessage.id as unknown as MessageId;

      // Suspend the source session
      const suspendReason = options.reason
        ? `Handoff to ${toAgentId}: ${options.reason}`
        : `Handoff to ${toAgentId}`;
      await this.sessionManager.suspendSession(sessionId, suspendReason);

      // Get the updated session record
      const suspendedSession = this.sessionManager.getSession(sessionId);

      // TODO: If options.triggerTarget !== false and target agent is idle,
      // we could notify/wake up the target agent here.
      // This would require integration with a notification system or
      // direct session starting capability.

      return {
        success: true,
        handoffDocumentId,
        messageId,
        suspendedSession: suspendedSession ?? undefined,
        targetAgentId: toAgentId,
        completedAt: createTimestamp(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        completedAt: createTimestamp(),
      };
    }
  }

  async getLastHandoff(agentId: EntityId): Promise<HandoffContent | undefined> {
    try {
      // Get the agent's channel ID
      const channelId = await this.registry.getAgentChannelId(agentId);
      if (!channelId) {
        return undefined;
      }

      // Search for handoff documents targeting this agent
      const documents = await this.api.list({
        type: 'document',
        tags: [HANDOFF_DOCUMENT_TAG],
      });

      // Filter to handoff documents for this agent and sort by creation time
      const handoffDocs = documents
        .filter((doc) => {
          const meta = doc.metadata as Record<string, unknown> | undefined;
          // Match self-handoff (fromAgentId === agentId, no toAgentId) or
          // agent-to-agent handoff (toAgentId === agentId)
          return (
            (meta?.fromAgentId === agentId && meta?.handoffType === 'self') ||
            meta?.toAgentId === agentId
          );
        })
        .sort((a, b) => {
          const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
          const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
          return bTime - aTime; // Most recent first
        });

      if (handoffDocs.length === 0) {
        return undefined;
      }

      // Get the most recent handoff document
      const latestDoc = handoffDocs[0];
      const content = (latestDoc as { content?: string }).content;
      if (!content) {
        return undefined;
      }

      // Parse the handoff content
      try {
        const handoffContent = JSON.parse(content) as HandoffContent;
        if (handoffContent.type !== 'handoff') {
          return undefined;
        }
        return handoffContent;
      } catch {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }

  async hasPendingHandoff(agentId: EntityId): Promise<boolean> {
    const handoff = await this.getLastHandoff(agentId);
    return handoff !== undefined;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a HandoffService instance
 */
export function createHandoffService(
  sessionManager: SessionManager,
  registry: AgentRegistry,
  api: QuarryAPI
): HandoffService {
  return new HandoffServiceImpl(sessionManager, registry, api);
}
