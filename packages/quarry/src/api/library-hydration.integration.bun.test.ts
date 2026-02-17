/**
 * Library Hydration Integration Tests
 *
 * Tests for Document reference resolution (hydration) in libraries:
 * - Single library hydration via get()
 * - Batch library hydration via list()
 * - Library-Document parent-child relationships
 * - Edge cases (missing documents, partial hydration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Library, HydratedLibrary, LibraryId, Document, DocumentId } from '@stoneforge/core';
import { createDocument, ContentType, createLibrary } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityA = 'el-user1' as EntityId;

function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

async function createTestDocument(
  createdBy: EntityId = mockEntityA,
  content: string = 'Test document content'
): Promise<Document> {
  // Use explicit UUID to avoid hash-based ID collisions in batch tests
  const uniqueId = `el-${crypto.randomUUID()}` as ElementId;
  const doc = await createDocument({
    content,
    contentType: ContentType.MARKDOWN,
    createdBy,
  });
  (doc as unknown as { id: ElementId }).id = uniqueId;
  return doc;
}

async function createTestLibrary(
  overrides: Partial<Parameters<typeof createLibrary>[0]> = {}
): Promise<Library> {
  // Use explicit UUID to avoid hash-based ID collisions in batch tests
  const uniqueId = `el-${crypto.randomUUID()}` as ElementId;
  const lib = await createLibrary({
    name: 'test-library',
    createdBy: mockEntityA,
    ...overrides,
  });
  (lib as unknown as { id: ElementId }).id = uniqueId;
  return lib;
}

// ============================================================================
// Tests
// ============================================================================

describe('Library Hydration', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // --------------------------------------------------------------------------
  // Single Library Hydration (get)
  // --------------------------------------------------------------------------

  describe('Single Library Hydration via get()', () => {
    it('should hydrate library description when requested', async () => {
      // Create description document
      const descDoc = await createTestDocument(mockEntityA, '# Library Documentation\n\nThis is the library description.');
      const createdDescDoc = await api.create<Document>(toCreateInput(descDoc));

      // Create library with description ref
      const library = await createTestLibrary({
        name: 'documentation-library',
        descriptionRef: createdDescDoc.id as unknown as DocumentId,
      });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Get with hydration
      const hydrated = await api.get<HydratedLibrary>(createdLibrary.id, {
        hydrate: { description: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.description).toBe('# Library Documentation\n\nThis is the library description.');
      expect(hydrated?.descriptionRef).toBe(createdDescDoc.id);
    });

    it('should not hydrate when not requested', async () => {
      // Create description document
      const descDoc = await createTestDocument(mockEntityA, 'Should not appear');
      const createdDescDoc = await api.create<Document>(toCreateInput(descDoc));

      // Create library with description ref
      const library = await createTestLibrary({
        name: 'test-lib',
        descriptionRef: createdDescDoc.id as unknown as DocumentId,
      });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Get without hydration
      const notHydrated = await api.get<HydratedLibrary>(createdLibrary.id);
      expect(notHydrated?.description).toBeUndefined();

      // Get with empty hydration options
      const emptyHydrate = await api.get<HydratedLibrary>(createdLibrary.id, {
        hydrate: {},
      });
      expect(emptyHydrate?.description).toBeUndefined();

      // Get with description: false
      const explicitFalse = await api.get<HydratedLibrary>(createdLibrary.id, {
        hydrate: { description: false },
      });
      expect(explicitFalse?.description).toBeUndefined();
    });

    it('should handle library with missing description document gracefully', async () => {
      // Create library with non-existent description ref
      const library = await createTestLibrary({
        name: 'lib-with-missing-desc',
        descriptionRef: 'el-missing' as DocumentId,
      });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Get with hydration - should not throw
      const hydrated = await api.get<HydratedLibrary>(createdLibrary.id, {
        hydrate: { description: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.description).toBeUndefined();
      expect(hydrated?.descriptionRef).toBe('el-missing');
    });

    it('should handle library without description ref', async () => {
      // Create library without description ref
      const library = await createTestLibrary({
        name: 'simple-library',
      });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Get with hydration - should not throw
      const hydrated = await api.get<HydratedLibrary>(createdLibrary.id, {
        hydrate: { description: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.description).toBeUndefined();
      expect(hydrated?.descriptionRef).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Batch Library Hydration (list)
  // --------------------------------------------------------------------------

  describe('Batch Library Hydration via list()', () => {
    it('should hydrate multiple libraries with descriptions', async () => {
      // Create documents
      const doc1 = await createTestDocument(mockEntityA, 'Description 1');
      const doc2 = await createTestDocument(mockEntityA, 'Description 2');
      const doc3 = await createTestDocument(mockEntityA, 'Description 3');
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));
      const createdDoc3 = await api.create<Document>(toCreateInput(doc3));

      // Create libraries with refs
      const lib1 = await createTestLibrary({
        name: 'Library-1',
        descriptionRef: createdDoc1.id as unknown as DocumentId,
      });
      const lib2 = await createTestLibrary({
        name: 'Library-2',
        descriptionRef: createdDoc2.id as unknown as DocumentId,
      });
      const lib3 = await createTestLibrary({
        name: 'Library-3',
        descriptionRef: createdDoc3.id as unknown as DocumentId,
      });

      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));
      const createdLib3 = await api.create<Library>(toCreateInput(lib3));

      // List with hydration
      const libraries = await api.list<HydratedLibrary>({
        type: 'library',
        hydrate: { description: true },
      });

      expect(libraries.length).toBe(3);
      const descMap = new Map(libraries.map((l) => [l.id, l.description]));
      expect(descMap.get(createdLib1.id)).toBe('Description 1');
      expect(descMap.get(createdLib2.id)).toBe('Description 2');
      expect(descMap.get(createdLib3.id)).toBe('Description 3');
    });

    it('should hydrate libraries with shared document refs efficiently', async () => {
      // Create a single shared description document
      const sharedDoc = await createTestDocument(mockEntityA, 'Shared description');
      const createdDoc = await api.create<Document>(toCreateInput(sharedDoc));

      // Create multiple libraries using the same description
      const lib1 = await createTestLibrary({
        name: 'Shared-Lib-A',
        descriptionRef: createdDoc.id as unknown as DocumentId,
      });
      const lib2 = await createTestLibrary({
        name: 'Shared-Lib-B',
        descriptionRef: createdDoc.id as unknown as DocumentId,
      });

      await api.create<Library>(toCreateInput(lib1));
      await api.create<Library>(toCreateInput(lib2));

      // List with hydration
      const libraries = await api.list<HydratedLibrary>({
        type: 'library',
        hydrate: { description: true },
      });

      expect(libraries.length).toBe(2);
      // Both should have the same description
      expect(libraries[0].description).toBe('Shared description');
      expect(libraries[1].description).toBe('Shared description');
    });

    it('should hydrate libraries via listPaginated', async () => {
      // Create documents
      const doc1 = await createTestDocument(mockEntityA, 'Page desc 1');
      const doc2 = await createTestDocument(mockEntityA, 'Page desc 2');
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));

      // Create libraries
      const lib1 = await createTestLibrary({
        name: 'Page-Library-1',
        descriptionRef: createdDoc1.id as unknown as DocumentId,
      });
      const lib2 = await createTestLibrary({
        name: 'Page-Library-2',
        descriptionRef: createdDoc2.id as unknown as DocumentId,
      });

      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));

      // List paginated with hydration
      const result = await api.listPaginated<HydratedLibrary>({
        type: 'library',
        limit: 10,
        hydrate: { description: true },
      });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);

      const descMap = new Map(result.items.map((l) => [l.id, l.description]));
      expect(descMap.get(createdLib1.id)).toBe('Page desc 1');
      expect(descMap.get(createdLib2.id)).toBe('Page desc 2');
    });

    it('should handle mixed libraries with and without descriptions', async () => {
      // Create document
      const doc = await createTestDocument(mockEntityA, 'Has description');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Create libraries - one with ref, one without
      const libWithRef = await createTestLibrary({
        name: 'with-desc',
        descriptionRef: createdDoc.id as unknown as DocumentId,
      });
      const libWithoutRef = await createTestLibrary({
        name: 'without-desc',
      });

      const createdLibWithRef = await api.create<Library>(toCreateInput(libWithRef));
      const createdLibWithoutRef = await api.create<Library>(toCreateInput(libWithoutRef));

      // List with hydration
      const libraries = await api.list<HydratedLibrary>({
        type: 'library',
        hydrate: { description: true },
      });

      expect(libraries.length).toBe(2);
      const libMap = new Map(libraries.map((l) => [l.id, l]));

      expect(libMap.get(createdLibWithRef.id)?.description).toBe('Has description');
      expect(libMap.get(createdLibWithoutRef.id)?.description).toBeUndefined();
    });

    it('should not hydrate when not requested in list', async () => {
      // Create document and library
      const doc = await createTestDocument(mockEntityA, 'Should not appear');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const library = await createTestLibrary({
        name: 'no-hydrate-lib',
        descriptionRef: createdDoc.id as unknown as DocumentId,
      });
      await api.create<Library>(toCreateInput(library));

      // List without hydration
      const libraries = await api.list<HydratedLibrary>({ type: 'library' });

      expect(libraries.length).toBe(1);
      expect(libraries[0].description).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Library-Document Parent-Child Relationships
  // --------------------------------------------------------------------------

  describe('Library-Document Parent-Child Relationships', () => {
    it('should add document to library via parent-child dependency', async () => {
      // Create library
      const library = await createTestLibrary({ name: 'knowledge-base' });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Create documents
      const doc1 = await createTestDocument(mockEntityA, 'Document 1 content');
      const doc2 = await createTestDocument(mockEntityA, 'Document 2 content');
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));

      // Add documents to library via parent-child dependency
      await api.addDependency({
        blockedId: createdDoc1.id,
        blockerId: createdLibrary.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        blockedId: createdDoc2.id,
        blockerId: createdLibrary.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Get library's children
      const dependents = await api.getDependents(createdLibrary.id, ['parent-child']);

      expect(dependents.length).toBe(2);
      const childIds = dependents.map((d) => d.blockedId);
      expect(childIds).toContain(createdDoc1.id);
      expect(childIds).toContain(createdDoc2.id);
    });

    it('should list documents in a library', async () => {
      // Create library
      const library = await createTestLibrary({ name: 'docs-library' });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Create and add documents to library
      for (let i = 0; i < 5; i++) {
        const doc = await createTestDocument(mockEntityA, `Doc ${i} content`);
        const createdDoc = await api.create<Document>(toCreateInput(doc));
        await api.addDependency({
          blockedId: createdDoc.id,
          blockerId: createdLibrary.id,
          type: 'parent-child',
          actor: mockEntityA,
        });
      }

      // Get all documents in the library
      const dependents = await api.getDependents(createdLibrary.id, ['parent-child']);
      expect(dependents.length).toBe(5);

      // Fetch the actual documents
      const documentIds = dependents.map((d) => d.blockedId);
      const documents: Document[] = [];
      for (const id of documentIds) {
        const doc = await api.get<Document>(id);
        if (doc) documents.push(doc);
      }

      expect(documents.length).toBe(5);
      documents.forEach((doc) => {
        expect(doc.type).toBe('document');
      });
    });

    it('should support nested libraries via parent-child dependency', async () => {
      // Create parent library
      const parentLib = await createTestLibrary({ name: 'parent-library' });
      const createdParentLib = await api.create<Library>(toCreateInput(parentLib));

      // Create child libraries
      const childLib1 = await createTestLibrary({ name: 'child-library-1' });
      const childLib2 = await createTestLibrary({ name: 'child-library-2' });
      const createdChildLib1 = await api.create<Library>(toCreateInput(childLib1));
      const createdChildLib2 = await api.create<Library>(toCreateInput(childLib2));

      // Add child libraries to parent via parent-child dependency
      await api.addDependency({
        blockedId: createdChildLib1.id,
        blockerId: createdParentLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        blockedId: createdChildLib2.id,
        blockerId: createdParentLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Get parent library's children
      const children = await api.getDependents(createdParentLib.id, ['parent-child']);
      expect(children.length).toBe(2);

      const childIds = children.map((d) => d.blockedId);
      expect(childIds).toContain(createdChildLib1.id);
      expect(childIds).toContain(createdChildLib2.id);
    });

    it('should allow document to belong to multiple libraries', async () => {
      // Create two libraries
      const lib1 = await createTestLibrary({ name: 'library-a' });
      const lib2 = await createTestLibrary({ name: 'library-b' });
      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));

      // Create a shared document
      const doc = await createTestDocument(mockEntityA, 'Shared document');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Add document to both libraries
      await api.addDependency({
        blockedId: createdDoc.id,
        blockerId: createdLib1.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        blockedId: createdDoc.id,
        blockerId: createdLib2.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Document should have two parent-child dependencies (to both libraries)
      const docDeps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docDeps.length).toBe(2);

      const targetIds = docDeps.map((d) => d.blockerId);
      expect(targetIds).toContain(createdLib1.id);
      expect(targetIds).toContain(createdLib2.id);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty library list gracefully', async () => {
      const libraries = await api.list<HydratedLibrary>({
        type: 'library',
        hydrate: { description: true },
      });

      expect(libraries).toEqual([]);
    });

    it('should handle large batch of libraries', async () => {
      const count = 25;
      const libs: Library[] = [];

      for (let i = 0; i < count; i++) {
        const doc = await createTestDocument(mockEntityA, `Library ${i} description`);
        const createdDoc = await api.create<Document>(toCreateInput(doc));

        const library = await createTestLibrary({
          name: `batch-library-${i}`,
          descriptionRef: createdDoc.id as unknown as DocumentId,
        });
        const createdLib = await api.create<Library>(toCreateInput(library));
        libs.push(createdLib);
      }

      // List with hydration
      const hydratedLibs = await api.list<HydratedLibrary>({
        type: 'library',
        hydrate: { description: true },
      });

      expect(hydratedLibs.length).toBe(count);

      // Verify each library has correct hydrated description
      for (let i = 0; i < count; i++) {
        const lib = hydratedLibs.find((l) => l.id === libs[i].id);
        expect(lib?.description).toBe(`Library ${i} description`);
      }
    });

    it('should preserve original library properties after hydration', async () => {
      // Create description document
      const descDoc = await createTestDocument(mockEntityA, 'Full description');
      const createdDescDoc = await api.create<Document>(toCreateInput(descDoc));

      // Create library with various properties
      const library = await createTestLibrary({
        name: 'complex-library',
        descriptionRef: createdDescDoc.id as unknown as DocumentId,
        tags: ['knowledge', 'documentation'],
        metadata: { version: '1.0', category: 'technical' },
      });
      const createdLibrary = await api.create<Library>(toCreateInput(library));

      // Get with hydration
      const hydrated = await api.get<HydratedLibrary>(createdLibrary.id, {
        hydrate: { description: true },
      });

      // Verify hydration
      expect(hydrated?.description).toBe('Full description');

      // Verify original properties are preserved
      expect(hydrated?.name).toBe('complex-library');
      expect(hydrated?.descriptionRef).toBe(createdDescDoc.id);
      expect(hydrated?.tags).toEqual(['knowledge', 'documentation']);
      expect(hydrated?.metadata).toEqual({ version: '1.0', category: 'technical' });
      expect(hydrated?.type).toBe('library');
    });
  });
});
