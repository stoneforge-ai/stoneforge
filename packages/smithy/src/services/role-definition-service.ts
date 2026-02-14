/**
 * Role Definition Service
 *
 * This service provides methods for managing agent role definitions.
 * Role definitions store system prompts and behavioral configurations
 * for agents, enabling consistent agent behavior across the workspace.
 *
 * Key features:
 * - Create role definitions with system prompts stored as Documents
 * - Update role definitions (creates new Document versions for prompt changes)
 * - Query role definitions by various criteria
 * - Link role definitions to agents
 *
 * @module
 */

import type { Document, DocumentId, EntityId, ElementId } from '@stoneforge/core';
import { ContentType, createDocument, createTimestamp } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';
import type {
  AgentRole,
  AgentRoleDefinition,
  DirectorRoleDefinition,
  WorkerRoleDefinition,
  StewardRoleDefinition,
  CreateRoleDefinitionInput,
  UpdateRoleDefinitionInput,
  RoleDefinitionFilter,
  StoredRoleDefinition,
  AgentBehaviors,
} from '../types/index.js';
import {
  isAgentRoleDefinition,
  ROLE_DEFINITION_TAGS,
  generateRoleDefinitionTags,
} from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Metadata key for storing role definition data in the Document
 */
const ROLE_DEF_META_KEY = 'roleDefinition';

/**
 * Content type used for role definition storage
 */
const ROLE_DEF_CONTENT_TYPE = ContentType.JSON;

// ============================================================================
// Role Definition Service Interface
// ============================================================================

/**
 * Service interface for managing agent role definitions
 */
export interface RoleDefinitionService {
  /**
   * Creates a new role definition.
   *
   * This creates:
   * 1. A Document with the system prompt content
   * 2. Stores the role definition data in the Document's metadata
   *
   * @param input - The role definition to create
   * @returns The created role definition with its ID
   */
  createRoleDefinition(input: CreateRoleDefinitionInput): Promise<StoredRoleDefinition>;

  /**
   * Gets a role definition by its ID.
   *
   * @param id - The element ID of the role definition document
   * @returns The role definition, or undefined if not found
   */
  getRoleDefinition(id: ElementId): Promise<StoredRoleDefinition | undefined>;

  /**
   * Gets the system prompt content for a role definition.
   *
   * @param id - The element ID of the role definition document
   * @returns The system prompt text, or undefined if not found
   */
  getSystemPrompt(id: ElementId): Promise<string | undefined>;

  /**
   * Gets the system prompt content from a Document reference.
   *
   * @param documentId - The document ID containing the system prompt
   * @returns The system prompt text, or undefined if not found
   */
  getSystemPromptFromRef(documentId: DocumentId): Promise<string | undefined>;

  /**
   * Updates an existing role definition.
   *
   * If the system prompt is updated, a new version of the Document is created.
   *
   * @param id - The element ID of the role definition document
   * @param updates - The fields to update
   * @returns The updated role definition
   */
  updateRoleDefinition(id: ElementId, updates: UpdateRoleDefinitionInput): Promise<StoredRoleDefinition>;

  /**
   * Lists role definitions matching the filter.
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching role definitions
   */
  listRoleDefinitions(filter?: RoleDefinitionFilter): Promise<StoredRoleDefinition[]>;

  /**
   * Gets all role definitions for a specific role type.
   *
   * @param role - The role type to filter by
   * @returns Array of role definitions for that role
   */
  getRoleDefinitionsByRole(role: AgentRole): Promise<StoredRoleDefinition[]>;

  /**
   * Gets the default role definition for a role type.
   *
   * This returns the first role definition found for the role, or undefined
   * if no definitions exist. For more control, use listRoleDefinitions with filters.
   *
   * @param role - The role type
   * @returns The default role definition, or undefined
   */
  getDefaultRoleDefinition(role: AgentRole): Promise<StoredRoleDefinition | undefined>;

  /**
   * Deletes a role definition.
   *
   * @param id - The element ID of the role definition document
   * @returns True if deleted, false if not found
   */
  deleteRoleDefinition(id: ElementId): Promise<boolean>;
}

// ============================================================================
// Role Definition Service Implementation
// ============================================================================

/**
 * Implementation of the Role Definition Service
 */
export class RoleDefinitionServiceImpl implements RoleDefinitionService {
  private readonly api: QuarryAPI;

  constructor(api: QuarryAPI) {
    this.api = api;
  }

  async createRoleDefinition(input: CreateRoleDefinitionInput): Promise<StoredRoleDefinition> {
    const now = createTimestamp();

    // Create the system prompt document first
    const systemPromptDoc = await createDocument({
      contentType: ContentType.MARKDOWN,
      content: input.systemPrompt,
      createdBy: input.createdBy,
      tags: [
        ROLE_DEFINITION_TAGS.AGENT_PROMPT,
        `${ROLE_DEFINITION_TAGS.ROLE_PREFIX}${input.role}`,
      ],
      metadata: {
        purpose: 'agent-system-prompt',
        role: input.role,
      },
    });

    // Save the system prompt document
    const savedPromptDoc = await this.api.create<Document>(
      systemPromptDoc as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    // Build the role definition based on role type
    let definition: AgentRoleDefinition;
    const baseDefinition = {
      name: input.name,
      description: input.description,
      systemPromptRef: savedPromptDoc.id as unknown as DocumentId,
      maxConcurrentTasks: input.maxConcurrentTasks ?? 1,
      behaviors: input.behaviors,
      tags: input.tags,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    };

    switch (input.role) {
      case 'director':
        definition = {
          ...baseDefinition,
          role: 'director',
        } as DirectorRoleDefinition;
        break;

      case 'worker':
        definition = {
          ...baseDefinition,
          role: 'worker',
          workerMode: input.workerMode,
        } as WorkerRoleDefinition;
        break;

      case 'steward':
        definition = {
          ...baseDefinition,
          role: 'steward',
          stewardFocus: input.stewardFocus,
        } as StewardRoleDefinition;
        break;

      default:
        throw new Error(`Unknown role type: ${input.role}`);
    }

    // Create the role definition document
    const roleDefDoc = await createDocument({
      contentType: ROLE_DEF_CONTENT_TYPE,
      content: JSON.stringify(definition, null, 2),
      createdBy: input.createdBy,
      tags: generateRoleDefinitionTags(input.role, input.tags),
      metadata: {
        [ROLE_DEF_META_KEY]: definition,
        systemPromptDocId: savedPromptDoc.id,
      },
    });

    // Save the role definition document
    const savedRoleDefDoc = await this.api.create<Document>(
      roleDefDoc as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    return {
      id: savedRoleDefDoc.id,
      definition,
    };
  }

  async getRoleDefinition(id: ElementId): Promise<StoredRoleDefinition | undefined> {
    const doc = await this.api.get<Document>(id);
    if (!doc || doc.type !== 'document') {
      return undefined;
    }

    // Check if the document has been soft-deleted
    // Soft-deleted documents have a deletedAt timestamp in their data
    const docAny = doc as unknown as Record<string, unknown>;
    if (docAny.deletedAt !== undefined && docAny.deletedAt !== null) {
      return undefined;
    }

    // Try to extract from metadata first (faster)
    const metaDef = (doc.metadata as Record<string, unknown>)?.[ROLE_DEF_META_KEY];
    if (metaDef && isAgentRoleDefinition(metaDef)) {
      return {
        id: doc.id,
        definition: metaDef,
      };
    }

    // Fall back to parsing the content
    if (doc.contentType === ROLE_DEF_CONTENT_TYPE) {
      try {
        const parsed = JSON.parse(doc.content);
        if (isAgentRoleDefinition(parsed)) {
          return {
            id: doc.id,
            definition: parsed,
          };
        }
      } catch {
        // Content is not valid JSON, ignore
      }
    }

    return undefined;
  }

  async getSystemPrompt(id: ElementId): Promise<string | undefined> {
    const stored = await this.getRoleDefinition(id);
    if (!stored) {
      return undefined;
    }
    return this.getSystemPromptFromRef(stored.definition.systemPromptRef);
  }

  async getSystemPromptFromRef(documentId: DocumentId): Promise<string | undefined> {
    const doc = await this.api.get<Document>(documentId as unknown as ElementId);
    if (!doc || doc.type !== 'document') {
      return undefined;
    }
    return doc.content;
  }

  async updateRoleDefinition(
    id: ElementId,
    updates: UpdateRoleDefinitionInput
  ): Promise<StoredRoleDefinition> {
    const existing = await this.getRoleDefinition(id);
    if (!existing) {
      throw new Error(`Role definition not found: ${id}`);
    }

    const now = createTimestamp();
    let newSystemPromptRef = existing.definition.systemPromptRef;

    // If system prompt is being updated, create a new version
    if (updates.systemPrompt !== undefined) {
      const currentPromptDoc = await this.api.get<Document>(
        existing.definition.systemPromptRef as unknown as ElementId
      );
      if (!currentPromptDoc) {
        throw new Error(`System prompt document not found: ${existing.definition.systemPromptRef}`);
      }

      // Create new version of the system prompt document
      const updatedPromptDoc = await this.api.update<Document>(
        existing.definition.systemPromptRef as unknown as ElementId,
        { content: updates.systemPrompt }
      );
      newSystemPromptRef = updatedPromptDoc.id as unknown as DocumentId;
    }

    // Determine maxConcurrentTasks
    const newMaxConcurrentTasks = updates.maxConcurrentTasks ?? existing.definition.maxConcurrentTasks ?? 1;

    // Merge behaviors
    const newBehaviors: AgentBehaviors | undefined =
      updates.behaviors || existing.definition.behaviors
        ? {
            ...existing.definition.behaviors,
            ...updates.behaviors,
          }
        : undefined;

    // Build updated definition
    const updatedDefinition: AgentRoleDefinition = {
      ...existing.definition,
      name: updates.name ?? existing.definition.name,
      description: updates.description ?? existing.definition.description,
      systemPromptRef: newSystemPromptRef,
      maxConcurrentTasks: newMaxConcurrentTasks,
      behaviors: newBehaviors,
      tags: updates.tags ?? existing.definition.tags,
      updatedAt: now,
    } as AgentRoleDefinition;

    // Update the role definition document
    await this.api.update<Document>(id, {
      content: JSON.stringify(updatedDefinition, null, 2),
      metadata: {
        [ROLE_DEF_META_KEY]: updatedDefinition,
        systemPromptDocId: newSystemPromptRef,
      },
    });

    return {
      id,
      definition: updatedDefinition,
    };
  }

  async listRoleDefinitions(filter?: RoleDefinitionFilter): Promise<StoredRoleDefinition[]> {
    // Get all documents with the role-definition tag
    const docs = await this.api.list<Document>({ type: 'document' });

    // Filter to role definition documents
    const roleDefDocs = docs.filter((doc) =>
      doc.tags.includes(ROLE_DEFINITION_TAGS.ROLE_DEFINITION)
    );

    // Extract role definitions
    const results: StoredRoleDefinition[] = [];
    for (const doc of roleDefDocs) {
      const stored = await this.getRoleDefinition(doc.id);
      if (stored) {
        results.push(stored);
      }
    }

    // Apply filters
    let filtered = results;

    if (filter) {
      if (filter.role !== undefined) {
        filtered = filtered.filter((r) => r.definition.role === filter.role);
      }

      if (filter.workerMode !== undefined) {
        filtered = filtered.filter((r) => {
          if (r.definition.role !== 'worker') return false;
          const workerDef = r.definition as WorkerRoleDefinition;
          return workerDef.workerMode === filter.workerMode;
        });
      }

      if (filter.stewardFocus !== undefined) {
        filtered = filtered.filter((r) => {
          if (r.definition.role !== 'steward') return false;
          const stewardDef = r.definition as StewardRoleDefinition;
          return stewardDef.stewardFocus === filter.stewardFocus;
        });
      }

      if (filter.tags && filter.tags.length > 0) {
        filtered = filtered.filter((r) => {
          const defTags = r.definition.tags ?? [];
          return filter.tags!.every((tag) => defTags.includes(tag));
        });
      }

      if (filter.nameContains !== undefined) {
        const searchTerm = filter.nameContains.toLowerCase();
        filtered = filtered.filter((r) =>
          r.definition.name.toLowerCase().includes(searchTerm)
        );
      }
    }

    return filtered;
  }

  async getRoleDefinitionsByRole(role: AgentRole): Promise<StoredRoleDefinition[]> {
    return this.listRoleDefinitions({ role });
  }

  async getDefaultRoleDefinition(role: AgentRole): Promise<StoredRoleDefinition | undefined> {
    const definitions = await this.getRoleDefinitionsByRole(role);
    return definitions[0];
  }

  async deleteRoleDefinition(id: ElementId): Promise<boolean> {
    const existing = await this.getRoleDefinition(id);
    if (!existing) {
      return false;
    }

    // Delete the role definition document
    await this.api.delete(id);

    // Note: We don't delete the system prompt document as it may be
    // referenced by other role definitions or historical records

    return true;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a RoleDefinitionService instance
 */
export function createRoleDefinitionService(api: QuarryAPI): RoleDefinitionService {
  return new RoleDefinitionServiceImpl(api);
}
