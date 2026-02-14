/**
 * Library Routes Factory
 *
 * CRUD operations for document libraries.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Element, CreateLibraryInput } from '@stoneforge/core';
import { createLibrary } from '@stoneforge/core';
import type { CollaborateServices } from './types.js';

export function createLibraryRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  // GET /api/libraries - List all libraries
  app.get('/api/libraries', async (c) => {
    try {
      const url = new URL(c.req.url);
      const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 10000; // Default to loading all

      const libraries = await api.list({
        type: 'library',
        limit,
        ...(hydrateDescription && { hydrate: { description: true } }),
      } as Parameters<typeof api.list>[0]);

      // Get parent relationships for all libraries
      // Parent-child dependencies have: blockedId = child, blockerId = parent
      const librariesWithParent = await Promise.all(
        libraries.map(async (library) => {
          // Find if this library has a parent (it would be the source in a parent-child dependency)
          const dependencies = await api.getDependencies(library.id, ['parent-child']);
          const parentDep = dependencies.find((d) => d.type === 'parent-child');
          return {
            ...library,
            parentId: parentDep?.blockerId || null,
          };
        })
      );

      return c.json(librariesWithParent);
    } catch (error) {
      console.error('[stoneforge] Failed to get libraries:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get libraries' } }, 500);
    }
  });

  // GET /api/libraries/:id - Get single library with children
  app.get('/api/libraries/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';

      const library = await api.get(id, hydrateDescription ? { hydrate: { description: true } } : undefined);

      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      // Get sub-libraries and documents (children via parent-child dependency)
      const dependents = await api.getDependents(id, ['parent-child']);

      // Separate into sub-libraries and documents
      const childIds = dependents.map((d) => d.blockedId);
      const children: Element[] = [];
      for (const childId of childIds) {
        const child = await api.get(childId as ElementId);
        if (child) {
          children.push(child);
        }
      }

      const subLibraries = children.filter((c) => c.type === 'library');
      const documents = children.filter((c) => c.type === 'document');

      return c.json({
        ...library,
        _subLibraries: subLibraries,
        _documents: documents,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to get library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get library' } }, 500);
    }
  });

  // GET /api/libraries/:id/documents - Get documents in a library
  app.get('/api/libraries/:id/documents', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      // First verify library exists
      const library = await api.get(id);
      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }
      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      // Get documents via parent-child dependency
      const dependents = await api.getDependents(id, ['parent-child']);

      // Filter to only documents and fetch full data
      const documentIds = dependents.map((d) => d.blockedId);
      const documents: Element[] = [];

      for (const docId of documentIds) {
        const doc = await api.get(docId as ElementId);
        if (doc && doc.type === 'document') {
          documents.push(doc);
        }
      }

      // Apply pagination if requested
      let result = documents;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      if (offset > 0) {
        result = result.slice(offset);
      }
      if (limit !== undefined) {
        result = result.slice(0, limit);
      }

      return c.json(result);
    } catch (error) {
      console.error('[stoneforge] Failed to get library documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get library documents' } }, 500);
    }
  });

  /**
   * Helper to get siblings of a library (other libraries with the same parent)
   */
  async function getSiblingLibraries(libraryId: ElementId, parentId: string | null): Promise<Element[]> {
    if (parentId) {
      // Get children of parent
      const dependents = await api.getDependents(parentId as ElementId, ['parent-child']);
      const siblings: Element[] = [];
      for (const dep of dependents) {
        if (dep.blockedId !== libraryId) {
          const sibling = await api.get(dep.blockedId as ElementId);
          if (sibling && sibling.type === 'library') {
            siblings.push(sibling);
          }
        }
      }
      return siblings;
    } else {
      // Root level - get all libraries without a parent
      const allLibraries = await api.list({ type: 'library' } as Parameters<typeof api.list>[0]);
      const rootSiblings: Element[] = [];
      for (const lib of allLibraries) {
        if (lib.id !== libraryId) {
          const deps = await api.getDependencies(lib.id, ['parent-child']);
          const hasParent = deps.some((d) => d.type === 'parent-child');
          if (!hasParent) {
            rootSiblings.push(lib);
          }
        }
      }
      return rootSiblings;
    }
  }

  /**
   * Helper to assign sort indices to siblings when reordering
   */
  async function assignSortIndices(
    libraryId: ElementId,
    siblings: Element[],
    targetIndex: number
  ): Promise<void> {
    // Sort siblings by their current sortIndex (or name for those without)
    const sortedSiblings = [...siblings].sort((a, b) => {
      const aIndex = (a.metadata?.sortIndex as number) ?? Infinity;
      const bIndex = (b.metadata?.sortIndex as number) ?? Infinity;
      if (aIndex !== bIndex) return aIndex - bIndex;
      // Cast to access 'name' since we know these are libraries
      const aName = (a as Element & { name?: string }).name ?? '';
      const bName = (b as Element & { name?: string }).name ?? '';
      return aName.localeCompare(bName);
    });

    // Assign new indices: items before targetIndex keep their position,
    // items at or after targetIndex shift up by 1
    for (let i = 0; i < sortedSiblings.length; i++) {
      const sibling = sortedSiblings[i];
      const currentIndex = (sibling.metadata?.sortIndex as number) ?? i;
      let newIndex = i;

      // Shift items at or after target position
      if (newIndex >= targetIndex) {
        newIndex = i + 1;
      }

      if (newIndex !== currentIndex || sibling.metadata?.sortIndex === undefined) {
        await api.update(sibling.id, {
          metadata: { ...sibling.metadata, sortIndex: newIndex },
        });
      }
    }

    // Set the moved library's sortIndex
    const library = await api.get(libraryId);
    if (library) {
      await api.update(libraryId, {
        metadata: { ...library.metadata, sortIndex: targetIndex },
      });
    }
  }

  /**
   * PUT /api/libraries/:id/order
   * Reorder a library within its current parent
   * Body: { index: number }
   */
  app.put('/api/libraries/:id/order', async (c) => {
    try {
      const libraryId = c.req.param('id') as ElementId;
      const body = await c.req.json();
      const index = body.index as number;

      if (typeof index !== 'number' || index < 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'index must be a non-negative number' } }, 400);
      }

      // Verify library exists
      const library = await api.get(libraryId);
      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }
      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      // Find current parent
      const deps = await api.getDependencies(libraryId, ['parent-child']);
      let parentId: string | null = null;
      for (const dep of deps) {
        const parent = await api.get(dep.blockerId as ElementId);
        if (parent && parent.type === 'library') {
          parentId = dep.blockerId;
          break;
        }
      }

      // Get siblings and assign indices
      const siblings = await getSiblingLibraries(libraryId, parentId);
      await assignSortIndices(libraryId, siblings, index);

      return c.json({ libraryId, index, parentId });
    } catch (error) {
      console.error('[stoneforge] Failed to reorder library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to reorder library' } }, 500);
    }
  });

  /**
   * PUT /api/libraries/:id/parent
   * Move a library to a new parent (or to root level)
   * Body: { parentId: string | null, index?: number, actor?: string }
   */
  app.put('/api/libraries/:id/parent', async (c) => {
    try {
      const libraryId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Verify library exists
      const library = await api.get(libraryId);
      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }
      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      const newParentId = body.parentId as ElementId | null;
      const index = body.index as number | undefined;
      const actor = (body.actor as EntityId) || ('el-0000' as EntityId);

      // Validate new parent if provided
      if (newParentId) {
        // Verify parent library exists
        const parent = await api.get(newParentId);
        if (!parent || parent.type !== 'library') {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid parentId: library not found' } }, 400);
        }

        // Prevent circular nesting: check if new parent is a descendant of this library
        const isDescendant = async (ancestorId: ElementId, potentialDescendantId: ElementId): Promise<boolean> => {
          if (ancestorId === potentialDescendantId) return true;

          // Get children of ancestor
          const dependents = await api.getDependents(ancestorId, ['parent-child']);
          const childIds = dependents.map((d) => d.blockedId);

          for (const childId of childIds) {
            const child = await api.get(childId as ElementId);
            if (child && child.type === 'library') {
              if (await isDescendant(childId as ElementId, potentialDescendantId)) {
                return true;
              }
            }
          }
          return false;
        };

        if (await isDescendant(libraryId, newParentId)) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot move library to its own descendant (circular nesting)' } }, 400);
        }
      }

      // Find current parent
      const deps = await api.getDependencies(libraryId, ['parent-child']);
      let previousParentId: string | null = null;
      for (const dep of deps) {
        const parent = await api.get(dep.blockerId as ElementId);
        if (parent && parent.type === 'library') {
          previousParentId = dep.blockerId;
          break;
        }
      }

      // Already at requested parent — check if we need to reorder
      if (previousParentId === newParentId) {
        if (index !== undefined) {
          // Reorder within same parent
          const siblings = await getSiblingLibraries(libraryId, newParentId);
          await assignSortIndices(libraryId, siblings, index);
        }
        return c.json({ libraryId, parentId: newParentId, previousParentId });
      }

      // Remove from old parent if present
      if (previousParentId) {
        await api.removeDependency(libraryId, previousParentId as ElementId, 'parent-child');
      }

      // Add to new parent if provided
      if (newParentId) {
        await api.addDependency({
          blockedId: libraryId,
          blockerId: newParentId,
          type: 'parent-child',
          actor,
        });
      }

      // If index is provided, set sortIndex in the new parent context
      if (index !== undefined) {
        const siblings = await getSiblingLibraries(libraryId, newParentId);
        await assignSortIndices(libraryId, siblings, index);
      }

      return c.json({ libraryId, parentId: newParentId, previousParentId });
    } catch (error) {
      console.error('[stoneforge] Failed to move library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to move library' } }, 500);
    }
  });

  /**
   * DELETE /api/libraries/:id
   * Delete a library and optionally all its documents
   * Query params:
   *   - cascade: 'true' to also delete all documents in the library (default: false)
   */
  app.delete('/api/libraries/:id', async (c) => {
    try {
      const libraryId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const cascade = url.searchParams.get('cascade') === 'true';

      // Verify library exists
      const library = await api.get(libraryId);
      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }
      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      // Get all children (sub-libraries and documents)
      const dependents = await api.getDependents(libraryId, ['parent-child']);
      const childIds = dependents.map((d) => d.blockedId);

      // Categorize children
      const subLibraryIds: string[] = [];
      const documentIds: string[] = [];

      for (const childId of childIds) {
        const child = await api.get(childId as ElementId);
        if (child) {
          if (child.type === 'library') {
            subLibraryIds.push(childId);
          } else if (child.type === 'document') {
            documentIds.push(childId);
          }
        }
      }

      // Prevent deletion if library has sub-libraries
      if (subLibraryIds.length > 0) {
        return c.json({
          error: {
            code: 'HAS_CHILDREN',
            message: `Cannot delete library: it has ${subLibraryIds.length} sub-libraries. Delete them first.`,
          },
        }, 400);
      }

      // Handle documents based on cascade flag
      if (documentIds.length > 0) {
        if (cascade) {
          // Delete all documents in the library
          for (const docId of documentIds) {
            await api.delete(docId as ElementId);
          }
        } else {
          // Remove documents from library but don't delete them
          for (const docId of documentIds) {
            await api.removeDependency(docId as ElementId, libraryId, 'parent-child');
          }
        }
      }

      // Remove library from parent if it has one
      const deps = await api.getDependencies(libraryId, ['parent-child']);
      for (const dep of deps) {
        const parent = await api.get(dep.blockerId as ElementId);
        if (parent && parent.type === 'library') {
          await api.removeDependency(libraryId, dep.blockerId as ElementId, 'parent-child');
        }
      }

      // Delete the library itself
      await api.delete(libraryId);

      return c.json({
        success: true,
        id: libraryId,
        documentsDeleted: cascade ? documentIds.length : 0,
        documentsRemoved: cascade ? 0 : documentIds.length,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }
      console.error('[stoneforge] Failed to delete library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete library' } }, 500);
    }
  });

  // POST /api/libraries - Create a new library
  app.post('/api/libraries', async (c) => {
    try {
      const body = (await c.req.json()) as {
        name: string;
        createdBy: string;
        parentId?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
      };

      // Validate required fields
      if (!body.name || typeof body.name !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required and must be a string' } }, 400);
      }
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
      }

      // Create the library input
      const libraryInput: CreateLibraryInput = {
        name: body.name.trim(),
        createdBy: body.createdBy as EntityId,
        ...(body.tags && { tags: body.tags }),
        ...(body.metadata && { metadata: body.metadata }),
      };

      // Create the library using the factory function
      const library = await createLibrary(libraryInput);

      // Persist to database
      const created = await api.create(library as unknown as Element & Record<string, unknown>);

      // If parentId is provided, establish parent-child relationship
      if (body.parentId) {
        // Verify parent library exists
        const parent = await api.get(body.parentId as ElementId);
        if (!parent) {
          // Library was created but parent doesn't exist - delete and return error
          await api.delete(created.id);
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parent library not found' } }, 400);
        }
        if (parent.type !== 'library') {
          await api.delete(created.id);
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parent must be a library' } }, 400);
        }

        // Add parent-child dependency (child is blocked, parent is blocker)
        await api.addDependency({
          blockedId: created.id,
          blockerId: body.parentId as ElementId,
          type: 'parent-child',
          actor: body.createdBy as EntityId,
        });
      }

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[stoneforge] Failed to create library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create library' } }, 500);
    }
  });

  return app;
}
