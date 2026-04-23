/**
 * Document Routes Factory
 *
 * CRUD operations for documents, versioning, links, and comments.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Element, Document, DocumentId, CreateDocumentInput, DocumentCategory, DocumentStatus, EventType } from '@stoneforge/core';
import { createDocument, isValidDocumentCategory, isValidDocumentStatus, DocumentStatus as DocumentStatusEnum, ContentType, validateContent, createEvent, createTimestamp } from '@stoneforge/core';
import type { CollaborateServices } from './types.js';

// Comment type for the comments table
interface CommentRow {
  [key: string]: unknown; // Index signature for Row compatibility
  id: string;
  document_id: string;
  author_id: string;
  content: string;
  anchor: string;
  start_offset: number | null;
  end_offset: number | null;
  resolved: number;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function createDocumentRoutes(services: CollaborateServices) {
  const { api, storageBackend } = services;
  const app = new Hono();

  // GET /api/documents - List documents
  app.get('/api/documents', async (c) => {
    try {
      const url = new URL(c.req.url);

      // Parse pagination and filter parameters
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const orderByParam = url.searchParams.get('orderBy');
      const orderDirParam = url.searchParams.get('orderDir');
      const searchParam = url.searchParams.get('search');
      const categoryParam = url.searchParams.get('category');
      const statusParam = url.searchParams.get('status');

      // Build filter
      const filter: Record<string, unknown> = {
        type: 'document',
      };

      // Category filter
      if (categoryParam) {
        const categories = categoryParam.split(',');
        for (const cat of categories) {
          if (!isValidDocumentCategory(cat)) {
            return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${cat}` } }, 400);
          }
        }
        filter.category = categories.length === 1 ? categories[0] : categories;
      }

      // Status filter (default: active only, unless explicitly specified)
      if (statusParam) {
        const statuses = statusParam.split(',');
        for (const s of statuses) {
          if (!isValidDocumentStatus(s)) {
            return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${s}` } }, 400);
          }
        }
        filter.status = statuses.length === 1 ? statuses[0] : statuses;
      }

      // Validate limit and offset
      const MAX_LIMIT = 500;
      let requestedLimit = 50;
      let requestedOffset = 0;

      if (limitParam) {
        requestedLimit = parseInt(limitParam, 10);
        if (isNaN(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid limit: must be 1-${MAX_LIMIT}` } }, 400);
        }
      }
      if (offsetParam) {
        requestedOffset = parseInt(offsetParam, 10);
        if (isNaN(requestedOffset) || requestedOffset < 0) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid offset: must be >= 0' } }, 400);
        }
      }

      // Validate orderBy — whitelist allowed columns
      const ALLOWED_ORDER_COLUMNS = ['updated_at', 'created_at', 'title', 'type'];
      if (orderByParam) {
        if (!ALLOWED_ORDER_COLUMNS.includes(orderByParam)) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid orderBy: ${orderByParam}. Must be one of: ${ALLOWED_ORDER_COLUMNS.join(', ')}` } }, 400);
        }
        filter.orderBy = orderByParam;
      } else {
        filter.orderBy = 'updated_at';
      }

      // Validate orderDir
      if (orderDirParam) {
        if (orderDirParam !== 'asc' && orderDirParam !== 'desc') {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid orderDir: ${orderDirParam}. Must be 'asc' or 'desc'` } }, 400);
        }
        filter.orderDir = orderDirParam;
      } else {
        filter.orderDir = 'desc';
      }

      // If search param is provided, use the search API for better results
      if (searchParam && searchParam.trim()) {
        const searchResults = await api.search(searchParam.trim(), filter as Parameters<typeof api.search>[1]);
        const slicedResults = searchResults.slice(requestedOffset, requestedOffset + requestedLimit);
        return c.json({
          items: slicedResults,
          total: searchResults.length,
          offset: requestedOffset,
          limit: requestedLimit,
          hasMore: requestedOffset + requestedLimit < searchResults.length,
        });
      }

      // Standard paginated query when no search
      filter.limit = requestedLimit;
      filter.offset = requestedOffset;

      const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

      // Return paginated response format
      return c.json({
        items: result.items,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to get documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get documents' } }, 500);
    }
  });

  /**
   * GET /api/documents/search
   * Search documents using FTS5 full-text search with BM25 ranking.
   *
   * Query params:
   * - q: Search query (required)
   * - limit: Hard cap on results (default: 50)
   * - category: Filter by category
   * - status: Filter by status (default: active)
   * - sensitivity: Elbow detection sensitivity (default: 1.5)
   * - mode: Search mode — 'relevance' (FTS5 only, default), 'semantic' (vector), 'hybrid' (RRF fusion)
   */
  app.get('/api/documents/search', async (c) => {
    try {
      const url = new URL(c.req.url);
      const query = url.searchParams.get('q');
      const limitParam = url.searchParams.get('limit');
      const categoryParam = url.searchParams.get('category');
      const statusParam = url.searchParams.get('status');
      const sensitivityParam = url.searchParams.get('sensitivity');
      const mode = url.searchParams.get('mode') ?? 'relevance';

      if (!query || query.trim().length === 0) {
        return c.json({ results: [] });
      }

      // Validate mode
      if (!['relevance', 'semantic', 'hybrid'].includes(mode)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid mode: ${mode}. Must be relevance, semantic, or hybrid` } }, 400);
      }

      // Semantic and hybrid modes require a registered EmbeddingService (currently CLI-only)
      if (mode === 'semantic' || mode === 'hybrid') {
        return c.json({ error: { code: 'NOT_IMPLEMENTED', message: `${mode} search requires an embedding provider to be configured. Use mode=relevance for FTS5 keyword search. See documentation for embedding setup instructions.` } }, 501);
      }

      // Validate category if provided
      if (categoryParam && !isValidDocumentCategory(categoryParam)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${categoryParam}` } }, 400);
      }

      // Validate status if provided
      if (statusParam && !isValidDocumentStatus(statusParam)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${statusParam}` } }, 400);
      }

      // Validate limit
      let searchLimit = 50;
      if (limitParam) {
        searchLimit = parseInt(limitParam, 10);
        if (isNaN(searchLimit) || searchLimit < 1 || searchLimit > 500) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid limit: must be 1-500' } }, 400);
        }
      }

      // Validate sensitivity
      let sensitivity = 1.5;
      if (sensitivityParam) {
        sensitivity = parseFloat(sensitivityParam);
        if (isNaN(sensitivity) || sensitivity <= 0 || sensitivity > 10) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sensitivity: must be between 0 and 10' } }, 400);
        }
      }

      const results = await api.searchDocumentsFTS(query.trim(), {
        hardCap: searchLimit,
        ...(categoryParam && { category: categoryParam as DocumentCategory }),
        ...(statusParam && { status: statusParam as DocumentStatus }),
        elbowSensitivity: sensitivity,
      });

      return c.json({
        results: results.map((r) => ({
          id: r.document.id,
          title: r.document.title,
          contentType: r.document.contentType,
          category: r.document.category,
          status: r.document.status,
          score: r.score,
          snippet: r.snippet,
          updatedAt: r.document.updatedAt,
        })),
        query: query.trim(),
        mode,
        total: results.length,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to search documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search documents' } }, 500);
    }
  });

  // GET /api/documents/:id - Get single document
  app.get('/api/documents/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const document = await api.get(id);

      if (!document) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      if (document.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      return c.json(document);
    } catch (error) {
      console.error('[stoneforge] Failed to get document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document' } }, 500);
    }
  });

  // POST /api/documents - Create document
  app.post('/api/documents', async (c) => {
    try {
      const body = await c.req.json();

      // Validate required fields
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
      }

      // Default content type to 'text' if not provided
      const contentType = body.contentType || 'text';

      // Validate contentType
      const validContentTypes = Object.values(ContentType) as string[];
      if (!validContentTypes.includes(contentType)) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`,
            },
          },
          400
        );
      }

      // Default content to empty string if not provided
      const content = body.content || '';

      // Validate JSON content if contentType is json
      if (contentType === 'json' && content) {
        try {
          JSON.parse(content);
        } catch {
          return c.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid JSON content',
              },
            },
            400
          );
        }
      }

      // Validate category if provided
      if (body.category !== undefined && !isValidDocumentCategory(body.category)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${body.category}` } }, 400);
      }

      // Validate status if provided
      if (body.status !== undefined && !isValidDocumentStatus(body.status)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${body.status}` } }, 400);
      }

      // Build CreateDocumentInput
      const docInput: CreateDocumentInput = {
        contentType,
        content,
        createdBy: body.createdBy as EntityId,
        ...(body.title !== undefined && { title: body.title }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.metadata !== undefined && { metadata: body.metadata }),
        ...(body.category !== undefined && { category: body.category as DocumentCategory }),
        ...(body.status !== undefined && { status: body.status as DocumentStatus }),
      };

      // Validate libraryId before creating the document
      if (body.libraryId) {
        const library = await api.get(body.libraryId as ElementId);
        if (!library || library.type !== 'library') {
          return c.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Invalid libraryId: library not found' } },
            400
          );
        }
      }

      // Create the document using the factory function
      const document = await createDocument(docInput);

      // Create in database
      const created = await api.create(document as unknown as Element & Record<string, unknown>);

      // Add to library (already validated above)
      if (body.libraryId) {
        await api.addDependency({
          blockedId: created.id,
          blockerId: body.libraryId as ElementId,
          type: 'parent-child',
        });
      }

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[stoneforge] Failed to create document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create document' } }, 500);
    }
  });

  // PATCH /api/documents/:id - Update document
  app.patch('/api/documents/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // First verify it's a document
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Reject content updates on immutable documents
      const existingDoc = existing as unknown as { immutable?: boolean };
      if (existingDoc.immutable === true && body.content !== undefined) {
        return c.json(
          { error: { code: 'IMMUTABLE', message: 'Cannot update content of immutable document' } },
          403
        );
      }

      // Extract allowed updates (prevent changing immutable fields)
      const updates: Record<string, unknown> = {};
      const allowedFields = ['title', 'content', 'contentType', 'tags', 'metadata', 'category', 'status'];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      }

      // Validate contentType if provided
      if (updates.contentType) {
        const validTypes = Object.values(ContentType) as string[];
        if (!validTypes.includes(updates.contentType as string)) {
          return c.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid contentType. Must be one of: ${validTypes.join(', ')}`,
              },
            },
            400
          );
        }
      }

      // Validate category if provided
      if (updates.category !== undefined && !isValidDocumentCategory(updates.category as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${updates.category}` } }, 400);
      }

      // Validate status if provided
      if (updates.status !== undefined && !isValidDocumentStatus(updates.status as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${updates.status}` } }, 400);
      }

      // Validate content (size limit + JSON validation if applicable)
      if (updates.content !== undefined) {
        const contentTypeVal = (updates.contentType || (existing as unknown as { contentType: string }).contentType) as string;
        try {
          validateContent(updates.content as string, contentTypeVal as ContentType);
        } catch (err) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } }, 400);
        }
      }

      // Update the document
      const updated = await api.update(id, updates);

      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if ((error as { code?: string }).code === 'CONCURRENT_MODIFICATION') {
        return c.json({ error: { code: 'CONFLICT', message: 'Document was modified by another process' } }, 409);
      }
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[stoneforge] Failed to update document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update document' } }, 500);
    }
  });

  // POST /api/documents/:id/archive - Archive a document
  app.post('/api/documents/:id/archive', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      const updated = await api.update(id, { status: DocumentStatusEnum.ARCHIVED } as unknown as Partial<Document>);
      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[stoneforge] Failed to archive document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to archive document' } }, 500);
    }
  });

  // POST /api/documents/:id/unarchive - Unarchive a document
  app.post('/api/documents/:id/unarchive', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      const updated = await api.update(id, { status: DocumentStatusEnum.ACTIVE } as unknown as Partial<Document>);
      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[stoneforge] Failed to unarchive document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to unarchive document' } }, 500);
    }
  });

  // DELETE /api/documents/:id - Delete a document (soft-delete via tombstone)
  app.delete('/api/documents/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      await api.delete(id);
      return c.json({ success: true, id }, 200);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[stoneforge] Failed to delete document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete document' } }, 500);
    }
  });

  // GET /api/documents/:id/versions - Get document version history
  app.get('/api/documents/:id/versions', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      // First verify it's a document
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Get version history using the API method
      const versions = await api.getDocumentHistory(id as unknown as DocumentId);

      return c.json(versions);
    } catch (error) {
      console.error('[stoneforge] Failed to get document versions:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document versions' } }, 500);
    }
  });

  // GET /api/documents/:id/versions/:version - Get specific version
  app.get('/api/documents/:id/versions/:version', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const versionParam = c.req.param('version');
      const version = parseInt(versionParam, 10);

      if (isNaN(version) || version < 1) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } }, 400);
      }

      // Get the specific version
      const document = await api.getDocumentVersion(id as unknown as DocumentId, version);

      if (!document) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document version not found' } }, 404);
      }

      return c.json(document);
    } catch (error) {
      console.error('[stoneforge] Failed to get document version:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document version' } }, 500);
    }
  });

  // POST /api/documents/:id/restore - Restore document to a specific version
  app.post('/api/documents/:id/restore', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();
      const version = body.version;

      if (typeof version !== 'number' || version < 1) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } }, 400);
      }

      // First verify it's a document
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Get the version to restore
      const versionToRestore = await api.getDocumentVersion(id as unknown as DocumentId, version);
      if (!versionToRestore) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document version not found' } }, 404);
      }

      // Update the document with the restored content (including optional fields if present in snapshot)
      const restorePayload: Record<string, unknown> = {
        content: versionToRestore.content,
        contentType: versionToRestore.contentType,
      };
      if (versionToRestore.tags !== undefined) restorePayload.tags = versionToRestore.tags;
      if (versionToRestore.metadata !== undefined) restorePayload.metadata = versionToRestore.metadata;
      if (versionToRestore.title !== undefined) restorePayload.title = versionToRestore.title;
      if (versionToRestore.category !== undefined) restorePayload.category = versionToRestore.category;

      const restored = await api.update(id, restorePayload as unknown as Partial<Document>);

      return c.json(restored);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[stoneforge] Failed to restore document version:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to restore document version' } }, 500);
    }
  });

  // POST /api/documents/:id/clone - Clone a document
  app.post('/api/documents/:id/clone', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Get the source document
      const sourceDoc = await api.get(id);
      if (!sourceDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (sourceDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      const sourceDocument = sourceDoc as Document;

      // Validate createdBy
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
      }

      // Use the new title or generate one from the original
      const originalTitle = sourceDocument.title || `Document ${sourceDocument.id}`;
      const newTitle = body.title || `${originalTitle} (Copy)`;

      // Create a new document with the same content
      const docInput: CreateDocumentInput = {
        contentType: sourceDocument.contentType,
        content: sourceDocument.content || '',
        createdBy: body.createdBy as EntityId,
        title: newTitle,
        tags: sourceDocument.tags || [],
        metadata: sourceDocument.metadata || {},
        category: sourceDocument.category,
      };

      // Validate libraryId before creating the document
      if (body.libraryId) {
        const library = await api.get(body.libraryId as ElementId);
        if (!library || library.type !== 'library') {
          return c.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Invalid libraryId: library not found' } },
            400
          );
        }
      }

      const newDoc = await createDocument(docInput);

      // Create in database
      const created = await api.create(newDoc as unknown as Element & Record<string, unknown>);

      // Add to library (already validated above)
      if (body.libraryId) {
        await api.addDependency({
          blockedId: created.id,
          blockerId: body.libraryId as ElementId,
          type: 'parent-child',
        });
      }

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[stoneforge] Failed to clone document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to clone document' } }, 500);
    }
  });

  /**
   * GET /api/documents/:id/links
   * Returns documents linked from this document (outgoing) and documents linking to it (incoming)
   * Query params:
   *   - direction: 'outgoing' | 'incoming' | 'both' (default: 'both')
   */
  app.get('/api/documents/:id/links', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const direction = url.searchParams.get('direction') || 'both';

      // Verify document exists
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Fetch document details based on direction
      let outgoing: (typeof doc)[] = [];
      let incoming: (typeof doc)[] = [];

      if (direction === 'outgoing' || direction === 'both') {
        // Outgoing links: documents this document references (blockedId = this document)
        const outgoingDeps = await api.getDependencies(documentId, ['references']);
        const outgoingDocs = await Promise.all(
          outgoingDeps.map(async (dep) => {
            const linkedDoc = await api.get(dep.blockerId as ElementId);
            if (linkedDoc && linkedDoc.type === 'document') {
              return linkedDoc;
            }
            return null;
          })
        );
        outgoing = outgoingDocs.filter(Boolean) as (typeof doc)[];
      }

      if (direction === 'incoming' || direction === 'both') {
        // Incoming links: documents that reference this document (blockerId = this document)
        const incomingDeps = await api.getDependents(documentId, ['references']);
        const incomingDocs = await Promise.all(
          incomingDeps.map(async (dep) => {
            const linkedDoc = await api.get(dep.blockedId as ElementId);
            if (linkedDoc && linkedDoc.type === 'document') {
              return linkedDoc;
            }
            return null;
          })
        );
        incoming = incomingDocs.filter(Boolean) as (typeof doc)[];
      }

      return c.json({ outgoing, incoming });
    } catch (error) {
      console.error('[stoneforge] Failed to get document links:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document links' } }, 500);
    }
  });

  /**
   * POST /api/documents/:id/links
   * Creates a link from this document to another document
   * Body: { targetDocumentId: string, actor?: string }
   */
  app.post('/api/documents/:id/links', async (c) => {
    try {
      const sourceId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Validate target document ID
      if (!body.targetDocumentId || typeof body.targetDocumentId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'targetDocumentId is required' } }, 400);
      }

      const targetId = body.targetDocumentId as ElementId;

      // Prevent self-reference
      if (sourceId === targetId) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot link a document to itself' } }, 400);
      }

      // Verify source document exists
      const sourceDoc = await api.get(sourceId);
      if (!sourceDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }
      if (sourceDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }

      // Verify target document exists
      const targetDoc = await api.get(targetId);
      if (!targetDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Target document not found' } }, 404);
      }
      if (targetDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Target document not found' } }, 404);
      }

      // Check if link already exists
      const existingDeps = await api.getDependencies(sourceId);
      const alreadyLinked = existingDeps.some(
        (dep) => dep.blockedId === sourceId && dep.blockerId === targetId && dep.type === 'references'
      );
      if (alreadyLinked) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Link already exists between these documents' } }, 400);
      }

      // Create the references dependency (source document references target document)
      await api.addDependency({
        blockedId: sourceId,
        blockerId: targetId,
        type: 'references',
        actor: (body.actor as EntityId) || ('el-0000' as EntityId),
      });

      return c.json({ sourceId, targetId, targetDocument: targetDoc }, 201);
    } catch (error) {
      console.error('[stoneforge] Failed to link documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to link documents' } }, 500);
    }
  });

  /**
   * DELETE /api/documents/:sourceId/links/:targetId
   * Removes a link between two documents
   */
  app.delete('/api/documents/:sourceId/links/:targetId', async (c) => {
    try {
      const sourceId = c.req.param('sourceId') as ElementId;
      const targetId = c.req.param('targetId') as ElementId;

      // Verify source document exists
      const sourceDoc = await api.get(sourceId);
      if (!sourceDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }
      if (sourceDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }

      // Find the link dependency
      const dependencies = await api.getDependencies(sourceId);
      const linkDep = dependencies.find(
        (dep) => dep.blockedId === sourceId && dep.blockerId === targetId && dep.type === 'references'
      );

      if (!linkDep) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Link not found between these documents' } }, 404);
      }

      // Remove the dependency
      await api.removeDependency(sourceId, targetId, 'references');

      return c.json({ success: true, sourceId, targetId });
    } catch (error) {
      console.error('[stoneforge] Failed to remove document link:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove document link' } }, 500);
    }
  });

  /**
   * PUT /api/documents/:id/library
   * Move a document to a library (or between libraries)
   * Body: { libraryId: string, actor?: string }
   */
  app.put('/api/documents/:id/library', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Verify document exists and is not tombstoned
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Validate libraryId
      if (!body.libraryId || typeof body.libraryId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'libraryId is required' } }, 400);
      }

      const libraryId = body.libraryId as ElementId;

      // Verify library exists
      const library = await api.get(libraryId);
      if (!library || library.type !== 'library') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid libraryId: library not found' } }, 400);
      }

      const actor = (body.actor as EntityId) || ('el-0000' as EntityId);

      // Find current library
      const deps = await api.getDependencies(documentId, ['parent-child']);
      let previousLibraryId: string | null = null;
      for (const dep of deps) {
        // The blocker is the parent (library)
        const parent = await api.get(dep.blockerId as ElementId);
        if (parent && parent.type === 'library') {
          previousLibraryId = dep.blockerId;
          break;
        }
      }

      // Already in requested library — no-op
      if (previousLibraryId === libraryId) {
        return c.json({ documentId, libraryId, previousLibraryId });
      }

      // Remove from old library if present
      if (previousLibraryId) {
        await api.removeDependency(documentId, previousLibraryId as ElementId, 'parent-child');
      }

      // Add to new library
      await api.addDependency({
        blockedId: documentId,
        blockerId: libraryId,
        type: 'parent-child',
        actor,
      });

      return c.json({ documentId, libraryId, previousLibraryId });
    } catch (error) {
      console.error('[stoneforge] Failed to move document to library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to move document to library' } }, 500);
    }
  });

  /**
   * DELETE /api/documents/:id/library
   * Remove a document from its library
   */
  app.delete('/api/documents/:id/library', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;

      // Verify document exists and is not tombstoned
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Find current library
      const deps = await api.getDependencies(documentId, ['parent-child']);
      let libraryDep: { blockerId: string } | null = null;
      for (const dep of deps) {
        const parent = await api.get(dep.blockerId as ElementId);
        if (parent && parent.type === 'library') {
          libraryDep = dep;
          break;
        }
      }

      if (!libraryDep) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document is not in any library' } }, 404);
      }

      await api.removeDependency(documentId, libraryDep.blockerId as ElementId, 'parent-child');

      return c.json({ success: true, documentId, removedFromLibrary: libraryDep.blockerId });
    } catch (error) {
      console.error('[stoneforge] Failed to remove document from library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove document from library' } }, 500);
    }
  });

  /**
   * GET /api/documents/:id/comments
   * Returns all comments for a document
   * Query params:
   *   - includeResolved: 'true' to include resolved comments (default: false)
   */
  app.get('/api/documents/:id/comments', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const includeResolved = url.searchParams.get('includeResolved') === 'true';

      // Pagination params
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      // Verify document exists
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Count total comments
      let countQuery = 'SELECT COUNT(*) as total FROM comments WHERE document_id = ? AND deleted_at IS NULL';
      if (!includeResolved) countQuery += ' AND resolved = 0';
      const total = storageBackend.queryOne<{ total: number }>(countQuery, [documentId])?.total ?? 0;

      // Query comments from the database with pagination
      let query = `
        SELECT * FROM comments
        WHERE document_id = ? AND deleted_at IS NULL
      `;
      if (!includeResolved) {
        query += ' AND resolved = 0';
      }
      query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';

      const comments = storageBackend.query<CommentRow>(query, [documentId, limit, offset]);

      // Batch-fetch entities (Fix 3: N+1 → 1 query)
      const entityIds = new Set<string>();
      for (const comment of comments) {
        entityIds.add(comment.author_id);
        if (comment.resolved_by) entityIds.add(comment.resolved_by);
      }

      const entityMap = new Map<string, { id: string; name: string; entityType: string }>();
      if (entityIds.size > 0) {
        const ids = [...entityIds];
        const placeholders = ids.map(() => '?').join(', ');
        const rows = storageBackend.query<{ id: string; data: string }>(
          `SELECT id, data FROM elements WHERE id IN (${placeholders})`,
          ids
        );
        for (const row of rows) {
          try {
            const data = JSON.parse(row.data);
            entityMap.set(row.id, { id: row.id, name: data.name ?? 'Unknown', entityType: data.entityType ?? 'unknown' });
          } catch { /* skip corrupt */ }
        }
      }

      // Hydrate comments synchronously using entityMap
      const hydratedComments = comments.map((comment) => {
        const author = entityMap.get(comment.author_id);
        const resolvedByEntity = comment.resolved_by ? entityMap.get(comment.resolved_by) : null;

        return {
          id: comment.id,
          documentId: comment.document_id,
          author: author
            ? { id: author.id, name: author.name, entityType: author.entityType }
            : { id: comment.author_id, name: 'Unknown', entityType: 'unknown' },
          content: comment.content,
          anchor: (() => {
            try {
              return JSON.parse(comment.anchor);
            } catch {
              console.warn(`[stoneforge] Malformed anchor JSON for comment ${comment.id}`);
              return { hash: '', prefix: '', text: comment.anchor, suffix: '' };
            }
          })(),
          startOffset: comment.start_offset,
          endOffset: comment.end_offset,
          resolved: comment.resolved === 1,
          resolvedBy: resolvedByEntity
            ? { id: resolvedByEntity.id, name: resolvedByEntity.name }
            : null,
          resolvedAt: comment.resolved_at,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
        };
      });

      return c.json({
        comments: hydratedComments,
        total,
        limit,
        offset,
        hasMore: offset + comments.length < total,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to get document comments:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document comments' } }, 500);
    }
  });

  /**
   * POST /api/documents/:id/comments
   * Creates a new comment on a document
   * Body: {
   *   authorId: string,
   *   content: string,
   *   anchor: { hash: string, prefix: string, text: string, suffix: string },
   *   startOffset?: number,
   *   endOffset?: number
   * }
   */
  app.post('/api/documents/:id/comments', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Validate required fields
      if (!body.authorId || typeof body.authorId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'authorId is required' } }, 400);
      }
      if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
      }
      if (!body.anchor || typeof body.anchor !== 'object') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'anchor is required' } }, 400);
      }
      if (!body.anchor.hash || !body.anchor.text) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'anchor must include hash and text' } }, 400);
      }

      // Verify document exists
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Verify author exists
      const author = await api.get(body.authorId as ElementId);
      if (!author) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Author not found' } }, 404);
      }
      if (author.type !== 'entity') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'authorId must be an entity' } }, 400);
      }

      // Generate comment ID
      const commentId = `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      // Insert comment
      storageBackend.run(
        `
        INSERT INTO comments (id, document_id, author_id, content, anchor, start_offset, end_offset, resolved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `,
        [
          commentId,
          documentId,
          body.authorId,
          body.content.trim(),
          JSON.stringify(body.anchor),
          body.startOffset ?? null,
          body.endOffset ?? null,
          now,
          now,
        ]
      );

      // Record comment_added event
      const event = createEvent({
        elementId: documentId,
        eventType: 'comment_added' as EventType,
        actor: body.authorId as EntityId,
        oldValue: null,
        newValue: { commentId, content: body.content.trim(), anchor: body.anchor },
      });
      storageBackend.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [event.elementId, event.eventType, event.actor, null, JSON.stringify(event.newValue), event.createdAt]
      );

      return c.json(
        {
          id: commentId,
          documentId,
          author: {
            id: author.id,
            name: (author as unknown as { name: string }).name,
            entityType: (author as unknown as { entityType: string }).entityType,
          },
          content: body.content.trim(),
          anchor: body.anchor,
          startOffset: body.startOffset ?? null,
          endOffset: body.endOffset ?? null,
          resolved: false,
          resolvedBy: null,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        201
      );
    } catch (error) {
      console.error('[stoneforge] Failed to create comment:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create comment' } }, 500);
    }
  });

  /**
   * PATCH /api/documents/:id/comments/:commentId
   * Update a comment's content
   * Body: { content: string }
   */
  app.patch('/api/documents/:id/comments/:commentId', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const commentId = c.req.param('commentId');
      const body = await c.req.json();

      // Verify document exists and is not tombstoned
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Validate content
      if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
      }

      // Verify comment exists
      const existing = storageBackend.queryOne<CommentRow>(
        `SELECT * FROM comments WHERE id = ? AND document_id = ? AND deleted_at IS NULL`,
        [commentId, documentId]
      );
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
      }

      const now = createTimestamp();
      storageBackend.run(
        `UPDATE comments SET content = ?, updated_at = ? WHERE id = ?`,
        [body.content.trim(), now, commentId]
      );

      // Record comment_updated event
      const event = createEvent({
        elementId: documentId,
        eventType: 'comment_updated' as EventType,
        actor: existing.author_id as EntityId,
        oldValue: { commentId, content: existing.content },
        newValue: { commentId, content: body.content.trim() },
      });
      storageBackend.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [event.elementId, event.eventType, event.actor, JSON.stringify(event.oldValue), JSON.stringify(event.newValue), event.createdAt]
      );

      return c.json({
        id: commentId,
        documentId,
        content: body.content.trim(),
        updatedAt: now,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to update comment:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update comment' } }, 500);
    }
  });

  /**
   * DELETE /api/documents/:id/comments/:commentId
   * Soft-delete a comment
   */
  app.delete('/api/documents/:id/comments/:commentId', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const commentId = c.req.param('commentId');

      // Verify document exists and is not tombstoned
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Verify comment exists and not already deleted
      const existing = storageBackend.queryOne<CommentRow>(
        `SELECT * FROM comments WHERE id = ? AND document_id = ? AND deleted_at IS NULL`,
        [commentId, documentId]
      );
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
      }

      const now = createTimestamp();
      storageBackend.run(
        `UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, commentId]
      );

      // Record comment_deleted event
      const event = createEvent({
        elementId: documentId,
        eventType: 'comment_deleted' as EventType,
        actor: existing.author_id as EntityId,
        oldValue: { commentId, content: existing.content },
        newValue: null,
      });
      storageBackend.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [event.elementId, event.eventType, event.actor, JSON.stringify(event.oldValue), null, event.createdAt]
      );

      return c.json({ success: true, id: commentId });
    } catch (error) {
      console.error('[stoneforge] Failed to delete comment:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete comment' } }, 500);
    }
  });

  /**
   * POST /api/documents/:id/comments/:commentId/resolve
   * Resolve or unresolve a comment
   * Body: { resolved: boolean, actor: string }
   */
  app.post('/api/documents/:id/comments/:commentId/resolve', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const commentId = c.req.param('commentId');
      const body = await c.req.json();

      // Verify document exists and is not tombstoned
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      const docData = doc as unknown as Record<string, unknown>;
      if (docData.status === 'tombstone' || docData.deletedAt) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Validate body
      if (typeof body.resolved !== 'boolean') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'resolved (boolean) is required' } }, 400);
      }
      if (!body.actor || typeof body.actor !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor is required' } }, 400);
      }

      // Verify actor is an entity
      const actorEntity = await api.get(body.actor as ElementId);
      if (!actorEntity) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Actor not found' } }, 404);
      }
      if (actorEntity.type !== 'entity') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor must be an entity' } }, 400);
      }

      // Verify comment exists and not deleted
      const existing = storageBackend.queryOne<CommentRow>(
        `SELECT * FROM comments WHERE id = ? AND document_id = ? AND deleted_at IS NULL`,
        [commentId, documentId]
      );
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
      }

      const now = createTimestamp();

      if (body.resolved) {
        storageBackend.run(
          `UPDATE comments SET resolved = 1, resolved_by = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
          [body.actor, now, now, commentId]
        );
      } else {
        storageBackend.run(
          `UPDATE comments SET resolved = 0, resolved_by = NULL, resolved_at = NULL, updated_at = ? WHERE id = ?`,
          [now, commentId]
        );
      }

      // Record resolve/unresolve event
      const eventType = body.resolved ? 'comment_resolved' : 'comment_unresolved';
      const event = createEvent({
        elementId: documentId,
        eventType: eventType as EventType,
        actor: body.actor as EntityId,
        oldValue: { commentId, resolved: existing.resolved === 1 },
        newValue: { commentId, resolved: body.resolved },
      });
      storageBackend.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [event.elementId, event.eventType, event.actor, JSON.stringify(event.oldValue), JSON.stringify(event.newValue), event.createdAt]
      );

      return c.json({
        id: commentId,
        documentId,
        resolved: body.resolved,
        resolvedBy: body.resolved ? body.actor : null,
        resolvedAt: body.resolved ? now : null,
        updatedAt: now,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to resolve comment:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve comment' } }, 500);
    }
  });

  return app;
}
