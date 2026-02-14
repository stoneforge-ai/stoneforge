import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import { createQuarryAPI, InboxService } from '@stoneforge/quarry';
import type { QuarryAPI } from '@stoneforge/quarry';
import { createDocumentRoutes } from './documents.js';
import {
  createDocument,
  createEntity,
  createLibrary,
  ContentType,
  EntityTypeValue,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';

let backend: StorageBackend;
let api: QuarryAPI;
let app: ReturnType<typeof createDocumentRoutes>;

beforeEach(() => {
  backend = createStorage({ path: ':memory:' });
  initializeSchema(backend);
  api = createQuarryAPI(backend);
  const inboxService = new InboxService(backend);
  inboxService.initSchema();
  app = createDocumentRoutes({ api, inboxService, storageBackend: backend });
});

afterEach(() => {
  if (backend.isOpen) backend.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createAndPersistDocument(
  overrides: Partial<{
    title: string;
    content: string;
    contentType: string;
    tags: string[];
    metadata: Record<string, unknown>;
    category: string;
    immutable: boolean;
  }> = {}
) {
  const doc = await createDocument({
    contentType: (overrides.contentType as any) ?? ContentType.TEXT,
    content: overrides.content ?? 'test content',
    createdBy: 'el-0000' as EntityId,
    title: overrides.title ?? 'Test Document',
    tags: overrides.tags,
    metadata: overrides.metadata,
    category: overrides.category as any,
  });

  // Inject immutable flag if requested
  if (overrides.immutable) {
    (doc as any).immutable = true;
  }

  return api.create(doc as unknown as Element & Record<string, unknown>);
}

async function createAndPersistEntity(name: string) {
  const entity = await createEntity({
    name,
    entityType: EntityTypeValue.AGENT,
    createdBy: 'el-0000' as EntityId,
  });
  return api.create(entity as unknown as Element & Record<string, unknown>);
}

async function createAndPersistLibrary(name: string) {
  const lib = await createLibrary({
    name,
    createdBy: 'el-0000' as EntityId,
  });
  return api.create(lib as unknown as Element & Record<string, unknown>);
}

async function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

// ===========================================================================
// Comment System Routes
// ===========================================================================

describe('Comment System Routes', () => {
  // -------------------------------------------------------------------------
  // GET /api/documents/:id/comments
  // -------------------------------------------------------------------------
  describe('GET /api/documents/:id/comments', () => {
    test('returns empty comments for doc with no comments', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('GET', `/api/documents/${doc.id}/comments`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.comments).toEqual([]);
      expect(json.total).toBe(0);
      expect(json.hasMore).toBe(false);
    });

    test('returns created comments with hydrated author', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Alice');

      // Create a comment
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Great document!',
        anchor: { hash: 'h1', text: 'paragraph one' },
      });
      expect(createRes.status).toBe(201);

      const res = await req('GET', `/api/documents/${doc.id}/comments`);
      const json = await res.json() as any;
      expect(json.comments.length).toBe(1);
      expect(json.comments[0].content).toBe('Great document!');
      expect(json.comments[0].author.id).toBe(author.id);
      expect(json.comments[0].author.name).toBe('Alice');
    });

    test('paginates with limit and offset; hasMore correct', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Bob');

      // Create 3 comments
      for (let i = 0; i < 3; i++) {
        await req('POST', `/api/documents/${doc.id}/comments`, {
          authorId: author.id,
          content: `Comment ${i}`,
          anchor: { hash: `h${i}`, text: `text ${i}` },
        });
      }

      const res = await req('GET', `/api/documents/${doc.id}/comments?limit=2&offset=0`);
      const json = await res.json() as any;
      expect(json.comments.length).toBe(2);
      expect(json.total).toBe(3);
      expect(json.hasMore).toBe(true);

      const res2 = await req('GET', `/api/documents/${doc.id}/comments?limit=2&offset=2`);
      const json2 = await res2.json() as any;
      expect(json2.comments.length).toBe(1);
      expect(json2.hasMore).toBe(false);
    });

    test('excludes resolved comments by default', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Carol');

      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'To resolve',
        anchor: { hash: 'h1', text: 'text' },
      });
      const created = await createRes.json() as any;

      // Resolve the comment
      await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
        actor: author.id,
      });

      const res = await req('GET', `/api/documents/${doc.id}/comments`);
      const json = await res.json() as any;
      expect(json.comments.length).toBe(0);
      expect(json.total).toBe(0);
    });

    test('includes resolved when includeResolved=true', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Dave');

      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Resolved comment',
        anchor: { hash: 'h1', text: 'text' },
      });
      const created = await createRes.json() as any;

      await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
        actor: author.id,
      });

      const res = await req('GET', `/api/documents/${doc.id}/comments?includeResolved=true`);
      const json = await res.json() as any;
      expect(json.comments.length).toBe(1);
      expect(json.comments[0].resolved).toBe(true);
    });

    test('returns 404 for non-existent document', async () => {
      const res = await req('GET', '/api/documents/el-nonexistent/comments');
      expect(res.status).toBe(404);
    });

    test('hydrates multiple authors in batch', async () => {
      const doc = await createAndPersistDocument();
      const author1 = await createAndPersistEntity('Eve');
      const author2 = await createAndPersistEntity('Frank');

      await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author1.id,
        content: 'From Eve',
        anchor: { hash: 'h1', text: 'text' },
      });
      await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author2.id,
        content: 'From Frank',
        anchor: { hash: 'h2', text: 'text2' },
      });

      const res = await req('GET', `/api/documents/${doc.id}/comments`);
      const json = await res.json() as any;
      expect(json.comments.length).toBe(2);
      const names = json.comments.map((c: any) => c.author.name);
      expect(names).toContain('Eve');
      expect(names).toContain('Frank');
    });

    test('returns 404 for tombstoned document', async () => {
      const doc = await createAndPersistDocument();
      // Soft-delete (tombstone)
      await req('DELETE', `/api/documents/${doc.id}`);

      const res = await req('GET', `/api/documents/${doc.id}/comments`);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/documents/:id/comments
  // -------------------------------------------------------------------------
  describe('POST /api/documents/:id/comments', () => {
    test('creates comment with valid input → 201', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('TestUser');

      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Hello world',
        anchor: { hash: 'abc123', text: 'selected text' },
      });
      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.id).toMatch(/^cmt-/);
      expect(json.content).toBe('Hello world');
      expect(json.author.id).toBe(author.id);
      expect(json.resolved).toBe(false);
    });

    test('400 when authorId missing', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        content: 'No author',
        anchor: { hash: 'h1', text: 'txt' },
      });
      expect(res.status).toBe(400);
    });

    test('400 when content empty', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('TestUser2');
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: '',
        anchor: { hash: 'h1', text: 'txt' },
      });
      expect(res.status).toBe(400);
    });

    test('400 when anchor missing', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('TestUser3');
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'No anchor',
      });
      expect(res.status).toBe(400);
    });

    test('400 when anchor lacks hash or text', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('TestUser4');
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Bad anchor',
        anchor: { prefix: 'nope' },
      });
      expect(res.status).toBe(400);
    });

    test('404 when author entity does not exist', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: 'el-nonexistent',
        content: 'Ghost author',
        anchor: { hash: 'h1', text: 'txt' },
      });
      expect(res.status).toBe(404);
    });

    test('400 when authorId is not entity type', async () => {
      const doc = await createAndPersistDocument();
      // Use a document ID as authorId — type is 'document', not 'entity'
      const otherDoc = await createAndPersistDocument({ title: 'Not an entity' });
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: otherDoc.id,
        content: 'Wrong type',
        anchor: { hash: 'h1', text: 'txt' },
      });
      expect(res.status).toBe(400);
    });

    test('404 for non-existent document', async () => {
      const author = await createAndPersistEntity('TestUser5');
      const res = await req('POST', '/api/documents/el-nonexistent/comments', {
        authorId: author.id,
        content: 'Orphan comment',
        anchor: { hash: 'h1', text: 'txt' },
      });
      expect(res.status).toBe(404);
    });

    test('trims whitespace from content', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('TestUser6');
      const res = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: '  trimmed  ',
        anchor: { hash: 'h1', text: 'txt' },
      });
      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.content).toBe('trimmed');
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/documents/:id/comments/:commentId
  // -------------------------------------------------------------------------
  describe('PATCH /api/documents/:id/comments/:commentId', () => {
    test('updates comment content → 200', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Updater');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Original',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const res = await req('PATCH', `/api/documents/${doc.id}/comments/${created.id}`, {
        content: 'Updated',
      });
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.content).toBe('Updated');
    });

    test('400 for empty content', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Updater2');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Original',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const res = await req('PATCH', `/api/documents/${doc.id}/comments/${created.id}`, {
        content: '',
      });
      expect(res.status).toBe(400);
    });

    test('404 for non-existent comment', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('PATCH', `/api/documents/${doc.id}/comments/cmt-fake`, {
        content: 'Update ghost',
      });
      expect(res.status).toBe(404);
    });

    test('404 for soft-deleted comment', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Updater3');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'To delete',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      await req('DELETE', `/api/documents/${doc.id}/comments/${created.id}`);

      const res = await req('PATCH', `/api/documents/${doc.id}/comments/${created.id}`, {
        content: 'After delete',
      });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/documents/:id/comments/:commentId
  // -------------------------------------------------------------------------
  describe('DELETE /api/documents/:id/comments/:commentId', () => {
    test('soft-deletes → 200; excluded from subsequent GET', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Deleter');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Delete me',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const delRes = await req('DELETE', `/api/documents/${doc.id}/comments/${created.id}`);
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json() as any;
      expect(delJson.success).toBe(true);

      // Confirm excluded from GET
      const getRes = await req('GET', `/api/documents/${doc.id}/comments`);
      const getJson = await getRes.json() as any;
      expect(getJson.comments.length).toBe(0);
    });

    test('404 for non-existent comment', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('DELETE', `/api/documents/${doc.id}/comments/cmt-fake`);
      expect(res.status).toBe(404);
    });

    test('404 for already-deleted comment', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Deleter2');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Double delete',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      await req('DELETE', `/api/documents/${doc.id}/comments/${created.id}`);
      const res = await req('DELETE', `/api/documents/${doc.id}/comments/${created.id}`);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/documents/:id/comments/:commentId/resolve
  // -------------------------------------------------------------------------
  describe('POST /api/documents/:id/comments/:commentId/resolve', () => {
    test('resolves a comment → resolved: true, resolvedBy, resolvedAt', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Resolver');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Resolve me',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const res = await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
        actor: author.id,
      });
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.resolved).toBe(true);
      expect(json.resolvedBy).toBe(author.id);
      expect(json.resolvedAt).toBeTruthy();
    });

    test('unresolves → resolved: false, resolvedBy: null', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('Unresolver');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Toggle resolve',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      // Resolve first
      await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
        actor: author.id,
      });

      // Unresolve
      const res = await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: false,
        actor: author.id,
      });
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.resolved).toBe(false);
      expect(json.resolvedBy).toBeNull();
    });

    test('400 when resolved not boolean', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('BadResolve');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Bad resolve',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const res = await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: 'yes',
        actor: author.id,
      });
      expect(res.status).toBe(400);
    });

    test('400 when actor missing', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('NoActor');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'No actor',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const res = await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
      });
      expect(res.status).toBe(400);
    });

    test('404 when actor entity does not exist', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('RealAuthor');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Ghost actor',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      const res = await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
        actor: 'el-nonexistent',
      });
      expect(res.status).toBe(404);
    });

    test('400 when actor not entity type', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('RealAuthor2');
      const createRes = await req('POST', `/api/documents/${doc.id}/comments`, {
        authorId: author.id,
        content: 'Doc as actor',
        anchor: { hash: 'h1', text: 'txt' },
      });
      const created = await createRes.json() as any;

      // Use a document ID as actor
      const otherDoc = await createAndPersistDocument({ title: 'Not entity' });
      const res = await req('POST', `/api/documents/${doc.id}/comments/${created.id}/resolve`, {
        resolved: true,
        actor: otherDoc.id,
      });
      expect(res.status).toBe(400);
    });

    test('404 for non-existent comment', async () => {
      const doc = await createAndPersistDocument();
      const author = await createAndPersistEntity('GhostComment');
      const res = await req('POST', `/api/documents/${doc.id}/comments/cmt-fake/resolve`, {
        resolved: true,
        actor: author.id,
      });
      expect(res.status).toBe(404);
    });
  });
});

// ===========================================================================
// Document Links Routes
// ===========================================================================

describe('Document Links Routes', () => {
  // -------------------------------------------------------------------------
  // GET /api/documents/:id/links
  // -------------------------------------------------------------------------
  describe('GET /api/documents/:id/links', () => {
    test('returns empty links', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('GET', `/api/documents/${doc.id}/links`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.outgoing).toEqual([]);
      expect(json.incoming).toEqual([]);
    });

    test('returns outgoing links (direction=outgoing)', async () => {
      const docA = await createAndPersistDocument({ title: 'Source' });
      const docB = await createAndPersistDocument({ title: 'Target' });

      await req('POST', `/api/documents/${docA.id}/links`, {
        targetDocumentId: docB.id,
      });

      const res = await req('GET', `/api/documents/${docA.id}/links?direction=outgoing`);
      const json = await res.json() as any;
      expect(json.outgoing.length).toBe(1);
      expect(json.outgoing[0].id).toBe(docB.id);
    });

    test('returns incoming links (direction=incoming)', async () => {
      const docA = await createAndPersistDocument({ title: 'Source' });
      const docB = await createAndPersistDocument({ title: 'Target' });

      await req('POST', `/api/documents/${docA.id}/links`, {
        targetDocumentId: docB.id,
      });

      const res = await req('GET', `/api/documents/${docB.id}/links?direction=incoming`);
      const json = await res.json() as any;
      expect(json.incoming.length).toBe(1);
      expect(json.incoming[0].id).toBe(docA.id);
    });

    test('returns both directions by default', async () => {
      const docA = await createAndPersistDocument({ title: 'A' });
      const docB = await createAndPersistDocument({ title: 'B' });
      const docC = await createAndPersistDocument({ title: 'C' });

      // A -> B (outgoing from A, incoming to B)
      await req('POST', `/api/documents/${docA.id}/links`, { targetDocumentId: docB.id });
      // C -> A (incoming to A)
      await req('POST', `/api/documents/${docC.id}/links`, { targetDocumentId: docA.id });

      const res = await req('GET', `/api/documents/${docA.id}/links`);
      const json = await res.json() as any;
      expect(json.outgoing.length).toBe(1);
      expect(json.incoming.length).toBe(1);
    });

    test('404 for non-existent document', async () => {
      const res = await req('GET', '/api/documents/el-nonexistent/links');
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/documents/:id/links
  // -------------------------------------------------------------------------
  describe('POST /api/documents/:id/links', () => {
    test('creates link → 201', async () => {
      const docA = await createAndPersistDocument({ title: 'Source' });
      const docB = await createAndPersistDocument({ title: 'Target' });

      const res = await req('POST', `/api/documents/${docA.id}/links`, {
        targetDocumentId: docB.id,
      });
      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.sourceId).toBe(docA.id);
      expect(json.targetId).toBe(docB.id);
    });

    test('400 when targetDocumentId missing', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('POST', `/api/documents/${doc.id}/links`, {});
      expect(res.status).toBe(400);
    });

    test('400 for self-reference', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('POST', `/api/documents/${doc.id}/links`, {
        targetDocumentId: doc.id,
      });
      expect(res.status).toBe(400);
    });

    test('404 when source doc does not exist', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('POST', '/api/documents/el-nonexistent/links', {
        targetDocumentId: doc.id,
      });
      expect(res.status).toBe(404);
    });

    test('404 when target doc does not exist', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('POST', `/api/documents/${doc.id}/links`, {
        targetDocumentId: 'el-nonexistent',
      });
      expect(res.status).toBe(404);
    });

    test('400 for duplicate link', async () => {
      const docA = await createAndPersistDocument({ title: 'A' });
      const docB = await createAndPersistDocument({ title: 'B' });

      await req('POST', `/api/documents/${docA.id}/links`, { targetDocumentId: docB.id });
      const res = await req('POST', `/api/documents/${docA.id}/links`, { targetDocumentId: docB.id });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/documents/:sourceId/links/:targetId
  // -------------------------------------------------------------------------
  describe('DELETE /api/documents/:sourceId/links/:targetId', () => {
    test('removes link → success: true; confirmed via GET', async () => {
      const docA = await createAndPersistDocument({ title: 'A' });
      const docB = await createAndPersistDocument({ title: 'B' });

      await req('POST', `/api/documents/${docA.id}/links`, { targetDocumentId: docB.id });

      const delRes = await req('DELETE', `/api/documents/${docA.id}/links/${docB.id}`);
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json() as any;
      expect(delJson.success).toBe(true);

      // Confirm no links
      const getRes = await req('GET', `/api/documents/${docA.id}/links`);
      const getJson = await getRes.json() as any;
      expect(getJson.outgoing.length).toBe(0);
    });

    test('404 when link does not exist', async () => {
      const docA = await createAndPersistDocument({ title: 'A' });
      const docB = await createAndPersistDocument({ title: 'B' });
      const res = await req('DELETE', `/api/documents/${docA.id}/links/${docB.id}`);
      expect(res.status).toBe(404);
    });

    test('404 when source doc does not exist', async () => {
      const doc = await createAndPersistDocument();
      const res = await req('DELETE', `/api/documents/el-nonexistent/links/${doc.id}`);
      expect(res.status).toBe(404);
    });
  });
});

// ===========================================================================
// Clone Route
// ===========================================================================

describe('Clone Route', () => {
  test('clones with " (Copy)" title suffix, matching content/tags', async () => {
    const doc = await createAndPersistDocument({
      title: 'Original',
      content: 'Original content',
      tags: ['tag1', 'tag2'],
    });

    const res = await req('POST', `/api/documents/${doc.id}/clone`, {
      createdBy: 'el-0000',
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.title).toBe('Original (Copy)');
    expect(json.content).toBe('Original content');
    expect(json.tags).toEqual(['tag1', 'tag2']);
    expect(json.id).not.toBe(doc.id);
  });

  test('clones with custom title', async () => {
    const doc = await createAndPersistDocument({ title: 'Source' });
    const res = await req('POST', `/api/documents/${doc.id}/clone`, {
      createdBy: 'el-0000',
      title: 'Custom Clone Title',
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.title).toBe('Custom Clone Title');
  });

  test('copies tags, metadata, category', async () => {
    const doc = await createAndPersistDocument({
      tags: ['a', 'b'],
      metadata: { key: 'value' },
      category: 'spec',
    });

    const res = await req('POST', `/api/documents/${doc.id}/clone`, {
      createdBy: 'el-0000',
    });
    const json = await res.json() as any;
    expect(json.tags).toEqual(['a', 'b']);
    expect(json.metadata).toEqual({ key: 'value' });
    expect(json.category).toBe('spec');
  });

  test('clone into a library (verify dependency created)', async () => {
    const doc = await createAndPersistDocument({ title: 'Lib Doc' });
    const lib = await createAndPersistLibrary('TestLib');

    const res = await req('POST', `/api/documents/${doc.id}/clone`, {
      createdBy: 'el-0000',
      libraryId: lib.id,
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;

    // Verify the dependency was created
    const deps = await api.getDependencies(json.id as ElementId);
    const libDep = deps.find((d) => d.blockerId === lib.id && d.type === 'parent-child');
    expect(libDep).toBeTruthy();
  });

  test('400 for invalid libraryId', async () => {
    const doc = await createAndPersistDocument();
    const res = await req('POST', `/api/documents/${doc.id}/clone`, {
      createdBy: 'el-0000',
      libraryId: 'el-nonexistent',
    });
    expect(res.status).toBe(400);
  });

  test('400 when createdBy missing', async () => {
    const doc = await createAndPersistDocument();
    const res = await req('POST', `/api/documents/${doc.id}/clone`, {});
    expect(res.status).toBe(400);
  });

  test('404 for non-existent source', async () => {
    const res = await req('POST', '/api/documents/el-nonexistent/clone', {
      createdBy: 'el-0000',
    });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Restore Route
// ===========================================================================

describe('Restore Route', () => {
  test('restores to previous version (content matches, version increments)', async () => {
    const doc = await createAndPersistDocument({ content: 'Version 1' });

    // Create version 2
    await api.update(doc.id as ElementId, { content: 'Version 2' } as any);

    // Restore to version 1
    const res = await req('POST', `/api/documents/${doc.id}/restore`, { version: 1 });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.content).toBe('Version 1');
    expect(json.version).toBeGreaterThan(2);
  });

  test('restores tags/metadata from snapshot', async () => {
    const doc = await createAndPersistDocument({
      content: 'V1',
      tags: ['original'],
      metadata: { v: 1 },
    });

    // Update to v2 with different tags/metadata
    await api.update(doc.id as ElementId, {
      content: 'V2',
      tags: ['updated'],
      metadata: { v: 2 },
    } as any);

    // Restore to version 1
    const res = await req('POST', `/api/documents/${doc.id}/restore`, { version: 1 });
    const json = await res.json() as any;
    expect(json.content).toBe('V1');
    // Tags and metadata should come from the snapshot if present
    expect(json.tags).toEqual(['original']);
  });

  test('400 for invalid version (0 or negative)', async () => {
    const doc = await createAndPersistDocument();
    const res = await req('POST', `/api/documents/${doc.id}/restore`, { version: 0 });
    expect(res.status).toBe(400);

    const res2 = await req('POST', `/api/documents/${doc.id}/restore`, { version: -1 });
    expect(res2.status).toBe(400);
  });

  test('400 for non-numeric version', async () => {
    const doc = await createAndPersistDocument();
    const res = await req('POST', `/api/documents/${doc.id}/restore`, { version: 'abc' });
    expect(res.status).toBe(400);
  });

  test('404 for non-existent version', async () => {
    const doc = await createAndPersistDocument();
    const res = await req('POST', `/api/documents/${doc.id}/restore`, { version: 999 });
    expect(res.status).toBe(404);
  });

  test('404 for non-existent document', async () => {
    const res = await req('POST', '/api/documents/el-nonexistent/restore', { version: 1 });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Immutable Document Rejection
// ===========================================================================

describe('Immutable Document Rejection', () => {
  test('403 IMMUTABLE when patching content on immutable doc', async () => {
    const doc = await createAndPersistDocument({ immutable: true });
    const res = await req('PATCH', `/api/documents/${doc.id}`, { content: 'new content' });
    expect(res.status).toBe(403);
    const json = await res.json() as any;
    expect(json.error.code).toBe('IMMUTABLE');
  });

  test('allows title update on immutable doc → 200', async () => {
    const doc = await createAndPersistDocument({ immutable: true });
    const res = await req('PATCH', `/api/documents/${doc.id}`, { title: 'New Title' });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.title).toBe('New Title');
  });

  test('allows tags update on immutable doc → 200', async () => {
    const doc = await createAndPersistDocument({ immutable: true });
    const res = await req('PATCH', `/api/documents/${doc.id}`, { tags: ['new-tag'] });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.tags).toEqual(['new-tag']);
  });

  test('allows metadata update on immutable doc → 200', async () => {
    const doc = await createAndPersistDocument({ immutable: true });
    const res = await req('PATCH', `/api/documents/${doc.id}`, { metadata: { key: 'val' } });
    expect(res.status).toBe(200);
  });

  test('allows content update on normal (non-immutable) doc → 200', async () => {
    const doc = await createAndPersistDocument();
    const res = await req('PATCH', `/api/documents/${doc.id}`, { content: 'updated content' });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.content).toBe('updated content');
  });
});
