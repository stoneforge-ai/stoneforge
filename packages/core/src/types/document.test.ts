import { describe, expect, test } from 'bun:test';
import {
  ContentType,
  MAX_CONTENT_SIZE,
  MIN_VERSION,
  Document,
  DocumentId,
  DocumentCategory,
  DocumentStatus,
  isValidContentType,
  validateContentType,
  isValidContentString,
  validateContentString,
  isValidJsonContent,
  validateJsonContent,
  validateContent,
  isValidVersion,
  validateVersion,
  isValidPreviousVersionId,
  validatePreviousVersionId,
  isValidDocumentCategory,
  validateDocumentCategory,
  isValidDocumentStatus,
  validateDocumentStatus,
  isDocument,
  validateDocument,
  createDocument,
  CreateDocumentInput,
  updateDocumentContent,
  isFirstVersion,
  hasVersionHistory,
  getContentTypeDisplayName,
  isEmptyContent,
  getContentSizeBytes,
  parseJsonContent,
  filterByContentType,
  hasSameContent,
  migrateContentType,
  isMigrationSupported,
  getMigrationDescription,
} from './document.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { ValidationError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid document for testing
function createTestDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.DOCUMENT,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    contentType: ContentType.TEXT,
    content: 'Test content',
    version: 1,
    previousVersionId: null,
    category: DocumentCategory.OTHER,
    status: DocumentStatus.ACTIVE,
    immutable: false,
    ...overrides,
  };
}

// ============================================================================
// ContentType Tests
// ============================================================================

describe('ContentType', () => {
  test('contains all expected types', () => {
    expect(ContentType.TEXT).toBe('text');
    expect(ContentType.MARKDOWN).toBe('markdown');
    expect(ContentType.JSON).toBe('json');
  });

  test('has exactly 3 types', () => {
    expect(Object.keys(ContentType)).toHaveLength(3);
  });
});

describe('isValidContentType', () => {
  test('accepts all valid content types', () => {
    expect(isValidContentType('text')).toBe(true);
    expect(isValidContentType('markdown')).toBe(true);
    expect(isValidContentType('json')).toBe(true);
  });

  test('rejects invalid types', () => {
    expect(isValidContentType('invalid')).toBe(false);
    expect(isValidContentType('html')).toBe(false);
    expect(isValidContentType(null)).toBe(false);
    expect(isValidContentType(undefined)).toBe(false);
    expect(isValidContentType(123)).toBe(false);
    expect(isValidContentType({})).toBe(false);
  });
});

describe('validateContentType', () => {
  test('returns valid content type', () => {
    expect(validateContentType('text')).toBe('text');
    expect(validateContentType('markdown')).toBe('markdown');
    expect(validateContentType('json')).toBe('json');
  });

  test('throws ValidationError for invalid type', () => {
    expect(() => validateContentType('invalid')).toThrow(ValidationError);
    try {
      validateContentType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_CONTENT_TYPE);
      expect(err.details.field).toBe('contentType');
    }
  });
});

// ============================================================================
// DocumentCategory Tests
// ============================================================================

describe('DocumentCategory', () => {
  test('contains all expected categories', () => {
    expect(DocumentCategory.SPEC).toBe('spec');
    expect(DocumentCategory.PRD).toBe('prd');
    expect(DocumentCategory.DECISION_LOG).toBe('decision-log');
    expect(DocumentCategory.CHANGELOG).toBe('changelog');
    expect(DocumentCategory.TUTORIAL).toBe('tutorial');
    expect(DocumentCategory.HOW_TO).toBe('how-to');
    expect(DocumentCategory.EXPLANATION).toBe('explanation');
    expect(DocumentCategory.REFERENCE).toBe('reference');
    expect(DocumentCategory.RUNBOOK).toBe('runbook');
    expect(DocumentCategory.MEETING_NOTES).toBe('meeting-notes');
    expect(DocumentCategory.POST_MORTEM).toBe('post-mortem');
    expect(DocumentCategory.TASK_DESCRIPTION).toBe('task-description');
    expect(DocumentCategory.MESSAGE_CONTENT).toBe('message-content');
    expect(DocumentCategory.OTHER).toBe('other');
  });

  test('has exactly 14 categories', () => {
    expect(Object.keys(DocumentCategory)).toHaveLength(14);
  });
});

describe('isValidDocumentCategory', () => {
  test('accepts all valid categories', () => {
    for (const category of Object.values(DocumentCategory)) {
      expect(isValidDocumentCategory(category)).toBe(true);
    }
  });

  test('rejects invalid categories', () => {
    expect(isValidDocumentCategory('invalid')).toBe(false);
    expect(isValidDocumentCategory('blog')).toBe(false);
    expect(isValidDocumentCategory(null)).toBe(false);
    expect(isValidDocumentCategory(undefined)).toBe(false);
    expect(isValidDocumentCategory(123)).toBe(false);
  });
});

describe('validateDocumentCategory', () => {
  test('returns valid category', () => {
    expect(validateDocumentCategory('spec')).toBe('spec');
    expect(validateDocumentCategory('other')).toBe('other');
  });

  test('throws ValidationError for invalid category', () => {
    expect(() => validateDocumentCategory('invalid')).toThrow(ValidationError);
    try {
      validateDocumentCategory('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_CATEGORY);
    }
  });
});

// ============================================================================
// DocumentStatus Tests
// ============================================================================

describe('DocumentStatus', () => {
  test('contains all expected statuses', () => {
    expect(DocumentStatus.ACTIVE).toBe('active');
    expect(DocumentStatus.ARCHIVED).toBe('archived');
  });

  test('has exactly 2 statuses', () => {
    expect(Object.keys(DocumentStatus)).toHaveLength(2);
  });
});

describe('isValidDocumentStatus', () => {
  test('accepts all valid statuses', () => {
    expect(isValidDocumentStatus('active')).toBe(true);
    expect(isValidDocumentStatus('archived')).toBe(true);
  });

  test('rejects invalid statuses', () => {
    expect(isValidDocumentStatus('deleted')).toBe(false);
    expect(isValidDocumentStatus('draft')).toBe(false);
    expect(isValidDocumentStatus(null)).toBe(false);
    expect(isValidDocumentStatus(undefined)).toBe(false);
  });
});

describe('validateDocumentStatus', () => {
  test('returns valid status', () => {
    expect(validateDocumentStatus('active')).toBe('active');
    expect(validateDocumentStatus('archived')).toBe('archived');
  });

  test('throws ValidationError for invalid status', () => {
    expect(() => validateDocumentStatus('invalid')).toThrow(ValidationError);
    try {
      validateDocumentStatus('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_DOCUMENT_STATUS);
    }
  });
});

// ============================================================================
// Content String Validation Tests
// ============================================================================

describe('isValidContentString', () => {
  test('accepts valid strings', () => {
    expect(isValidContentString('')).toBe(true);
    expect(isValidContentString('Hello, world!')).toBe(true);
    expect(isValidContentString('Multi\nline\ncontent')).toBe(true);
  });

  test('rejects non-strings', () => {
    expect(isValidContentString(null)).toBe(false);
    expect(isValidContentString(undefined)).toBe(false);
    expect(isValidContentString(123)).toBe(false);
    expect(isValidContentString({})).toBe(false);
    expect(isValidContentString([])).toBe(false);
  });

  test('rejects content exceeding max size', () => {
    const largeContent = 'x'.repeat(MAX_CONTENT_SIZE + 1);
    expect(isValidContentString(largeContent)).toBe(false);
  });

  test('accepts content at exactly max size', () => {
    const maxContent = 'x'.repeat(MAX_CONTENT_SIZE);
    expect(isValidContentString(maxContent)).toBe(true);
  });
});

describe('validateContentString', () => {
  test('returns valid string', () => {
    expect(validateContentString('test')).toBe('test');
    expect(validateContentString('')).toBe('');
  });

  test('throws for non-string', () => {
    expect(() => validateContentString(123)).toThrow(ValidationError);
    try {
      validateContentString(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('content');
    }
  });

  test('throws for content exceeding max size', () => {
    const largeContent = 'x'.repeat(MAX_CONTENT_SIZE + 1);
    expect(() => validateContentString(largeContent)).toThrow(ValidationError);
    try {
      validateContentString(largeContent);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.actual).toBeGreaterThan(MAX_CONTENT_SIZE);
    }
  });
});

// ============================================================================
// JSON Content Validation Tests
// ============================================================================

describe('isValidJsonContent', () => {
  test('accepts valid JSON', () => {
    expect(isValidJsonContent('{}')).toBe(true);
    expect(isValidJsonContent('[]')).toBe(true);
    expect(isValidJsonContent('{"key": "value"}')).toBe(true);
    expect(isValidJsonContent('[1, 2, 3]')).toBe(true);
    expect(isValidJsonContent('null')).toBe(true);
    expect(isValidJsonContent('"string"')).toBe(true);
    expect(isValidJsonContent('123')).toBe(true);
    expect(isValidJsonContent('true')).toBe(true);
  });

  test('rejects invalid JSON', () => {
    expect(isValidJsonContent('')).toBe(false);
    expect(isValidJsonContent('{')).toBe(false);
    expect(isValidJsonContent('{invalid}')).toBe(false);
    expect(isValidJsonContent("{'single': 'quotes'}")).toBe(false);
    expect(isValidJsonContent('undefined')).toBe(false);
  });
});

describe('validateJsonContent', () => {
  test('returns valid JSON string', () => {
    expect(validateJsonContent('{}')).toBe('{}');
    expect(validateJsonContent('{"key": "value"}')).toBe('{"key": "value"}');
  });

  test('throws for invalid JSON', () => {
    expect(() => validateJsonContent('{')).toThrow(ValidationError);
    try {
      validateJsonContent('{invalid}');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_JSON);
      expect(err.details.field).toBe('content');
    }
  });
});

describe('validateContent', () => {
  test('validates text content (passthrough)', () => {
    expect(validateContent('any text', ContentType.TEXT)).toBe('any text');
    expect(validateContent('', ContentType.TEXT)).toBe('');
    expect(validateContent('{not json}', ContentType.TEXT)).toBe('{not json}');
  });

  test('validates markdown content (passthrough)', () => {
    expect(validateContent('# Heading', ContentType.MARKDOWN)).toBe('# Heading');
    expect(validateContent('**bold**', ContentType.MARKDOWN)).toBe('**bold**');
  });

  test('validates JSON content (must be parseable)', () => {
    expect(validateContent('{}', ContentType.JSON)).toBe('{}');
    expect(validateContent('{"key": "value"}', ContentType.JSON)).toBe('{"key": "value"}');
  });

  test('throws for invalid JSON content', () => {
    expect(() => validateContent('{invalid}', ContentType.JSON)).toThrow(ValidationError);
  });
});

// ============================================================================
// Version Validation Tests
// ============================================================================

describe('isValidVersion', () => {
  test('accepts valid versions', () => {
    expect(isValidVersion(1)).toBe(true);
    expect(isValidVersion(2)).toBe(true);
    expect(isValidVersion(100)).toBe(true);
    expect(isValidVersion(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  test('rejects invalid versions', () => {
    expect(isValidVersion(0)).toBe(false);
    expect(isValidVersion(-1)).toBe(false);
    expect(isValidVersion(1.5)).toBe(false);
    expect(isValidVersion(null)).toBe(false);
    expect(isValidVersion(undefined)).toBe(false);
    expect(isValidVersion('1')).toBe(false);
  });
});

describe('validateVersion', () => {
  test('returns valid version', () => {
    expect(validateVersion(1)).toBe(1);
    expect(validateVersion(100)).toBe(100);
  });

  test('throws for non-number', () => {
    expect(() => validateVersion('1')).toThrow(ValidationError);
    try {
      validateVersion('1');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('version');
    }
  });

  test('throws for non-integer', () => {
    expect(() => validateVersion(1.5)).toThrow(ValidationError);
  });

  test('throws for version < 1', () => {
    expect(() => validateVersion(0)).toThrow(ValidationError);
    expect(() => validateVersion(-1)).toThrow(ValidationError);
  });
});

// ============================================================================
// Previous Version ID Validation Tests
// ============================================================================

describe('isValidPreviousVersionId', () => {
  test('accepts null for version 1', () => {
    expect(isValidPreviousVersionId(null, 1)).toBe(true);
  });

  test('rejects non-null for version 1', () => {
    expect(isValidPreviousVersionId('el-abc123', 1)).toBe(false);
  });

  test('accepts valid ID for version > 1', () => {
    expect(isValidPreviousVersionId('el-abc123', 2)).toBe(true);
    expect(isValidPreviousVersionId('el-abc', 3)).toBe(true);
    expect(isValidPreviousVersionId('el-12345678', 10)).toBe(true);
  });

  test('rejects null for version > 1', () => {
    expect(isValidPreviousVersionId(null, 2)).toBe(false);
  });

  test('rejects invalid ID format', () => {
    expect(isValidPreviousVersionId('invalid', 2)).toBe(false);
    expect(isValidPreviousVersionId('el-AB', 2)).toBe(false); // uppercase
    expect(isValidPreviousVersionId('el-ab', 2)).toBe(false); // too short
    expect(isValidPreviousVersionId('el-123456789', 2)).toBe(false); // too long
  });
});

describe('validatePreviousVersionId', () => {
  test('returns null for version 1', () => {
    expect(validatePreviousVersionId(null, 1)).toBe(null);
  });

  test('throws for non-null with version 1', () => {
    expect(() => validatePreviousVersionId('el-abc123', 1)).toThrow(ValidationError);
  });

  test('returns valid ID for version > 1', () => {
    expect(validatePreviousVersionId('el-abc123', 2)).toBe('el-abc123' as DocumentId);
  });

  test('throws for null with version > 1', () => {
    expect(() => validatePreviousVersionId(null, 2)).toThrow(ValidationError);
  });

  test('throws for invalid ID format', () => {
    expect(() => validatePreviousVersionId('invalid', 2)).toThrow(ValidationError);
  });
});

// ============================================================================
// isDocument Type Guard Tests
// ============================================================================

describe('isDocument', () => {
  test('accepts valid document', () => {
    expect(isDocument(createTestDocument())).toBe(true);
  });

  test('accepts document with all content types', () => {
    expect(isDocument(createTestDocument({ contentType: ContentType.TEXT }))).toBe(true);
    expect(isDocument(createTestDocument({ contentType: ContentType.MARKDOWN }))).toBe(true);
    expect(
      isDocument(createTestDocument({ contentType: ContentType.JSON, content: '{}' }))
    ).toBe(true);
  });

  test('accepts document with version > 1', () => {
    expect(
      isDocument(
        createTestDocument({
          version: 2,
          previousVersionId: 'el-prev123' as DocumentId,
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isDocument(null)).toBe(false);
    expect(isDocument(undefined)).toBe(false);
    expect(isDocument('string')).toBe(false);
    expect(isDocument(123)).toBe(false);
  });

  test('rejects documents with missing fields', () => {
    expect(isDocument({ ...createTestDocument(), id: undefined })).toBe(false);
    expect(isDocument({ ...createTestDocument(), type: undefined })).toBe(false);
    expect(isDocument({ ...createTestDocument(), contentType: undefined })).toBe(false);
    expect(isDocument({ ...createTestDocument(), content: undefined })).toBe(false);
    expect(isDocument({ ...createTestDocument(), version: undefined })).toBe(false);
  });

  test('rejects documents with wrong type', () => {
    expect(isDocument({ ...createTestDocument(), type: 'task' })).toBe(false);
    expect(isDocument({ ...createTestDocument(), type: 'entity' })).toBe(false);
  });

  test('rejects documents with invalid content type', () => {
    expect(isDocument({ ...createTestDocument(), contentType: 'html' })).toBe(false);
  });

  test('rejects documents with invalid version', () => {
    expect(isDocument({ ...createTestDocument(), version: 0 })).toBe(false);
    expect(isDocument({ ...createTestDocument(), version: -1 })).toBe(false);
  });

  test('rejects documents with invalid previousVersionId', () => {
    // Version 1 must have null previousVersionId
    expect(isDocument({ ...createTestDocument(), previousVersionId: 'el-abc123' })).toBe(
      false
    );
    // Version > 1 must have valid previousVersionId
    expect(
      isDocument({ ...createTestDocument(), version: 2, previousVersionId: null })
    ).toBe(false);
  });

  test('rejects JSON documents with invalid JSON content', () => {
    expect(
      isDocument(
        createTestDocument({ contentType: ContentType.JSON, content: '{invalid}' })
      )
    ).toBe(false);
  });

  test('rejects documents with missing category', () => {
    const doc = { ...createTestDocument() };
    delete (doc as any).category;
    expect(isDocument(doc)).toBe(false);
  });

  test('rejects documents with invalid category', () => {
    expect(isDocument({ ...createTestDocument(), category: 'invalid' })).toBe(false);
  });

  test('rejects documents with missing status', () => {
    const doc = { ...createTestDocument() };
    delete (doc as any).status;
    expect(isDocument(doc)).toBe(false);
  });

  test('rejects documents with invalid status', () => {
    expect(isDocument({ ...createTestDocument(), status: 'deleted' })).toBe(false);
  });

  test('accepts documents with all valid categories', () => {
    for (const category of Object.values(DocumentCategory)) {
      expect(isDocument(createTestDocument({ category }))).toBe(true);
    }
  });

  test('accepts documents with all valid statuses', () => {
    for (const status of Object.values(DocumentStatus)) {
      expect(isDocument(createTestDocument({ status }))).toBe(true);
    }
  });

  test('accepts documents with immutable true or false', () => {
    expect(isDocument(createTestDocument({ immutable: false }))).toBe(true);
    expect(isDocument(createTestDocument({ immutable: true }))).toBe(true);
  });

  test('accepts documents with missing immutable (backward compat)', () => {
    const doc = { ...createTestDocument() };
    delete (doc as any).immutable;
    expect(isDocument(doc)).toBe(true);
  });

  test('rejects documents with non-boolean immutable', () => {
    expect(isDocument({ ...createTestDocument(), immutable: 'true' })).toBe(false);
    expect(isDocument({ ...createTestDocument(), immutable: 1 })).toBe(false);
    expect(isDocument({ ...createTestDocument(), immutable: null })).toBe(false);
  });
});

// ============================================================================
// validateDocument Tests
// ============================================================================

describe('validateDocument', () => {
  test('returns valid document', () => {
    const doc = createTestDocument();
    expect(validateDocument(doc)).toEqual(doc);
  });

  test('throws for non-object', () => {
    expect(() => validateDocument(null)).toThrow(ValidationError);
    expect(() => validateDocument('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateDocument({ ...createTestDocument(), id: '' })).toThrow(
      ValidationError
    );
    expect(() => validateDocument({ ...createTestDocument(), createdBy: '' })).toThrow(
      ValidationError
    );
    try {
      validateDocument({ ...createTestDocument(), contentType: undefined });
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.INVALID_CONTENT_TYPE);
    }
  });

  test('throws for wrong type value', () => {
    try {
      validateDocument({ ...createTestDocument(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('document');
    }
  });

  test('throws for non-boolean immutable', () => {
    expect(() =>
      validateDocument({ ...createTestDocument(), immutable: 'true' })
    ).toThrow(ValidationError);
    try {
      validateDocument({ ...createTestDocument(), immutable: 42 });
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('immutable');
    }
  });

  test('validates document-specific fields', () => {
    expect(() =>
      validateDocument({ ...createTestDocument(), contentType: 'invalid' })
    ).toThrow(ValidationError);
    expect(() => validateDocument({ ...createTestDocument(), version: 0 })).toThrow(
      ValidationError
    );
    expect(() =>
      validateDocument({
        ...createTestDocument(),
        contentType: ContentType.JSON,
        content: '{invalid}',
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// createDocument Factory Tests
// ============================================================================

describe('createDocument', () => {
  const validInput: CreateDocumentInput = {
    contentType: ContentType.TEXT,
    content: 'Test content',
    createdBy: 'el-system1' as EntityId,
  };

  test('creates document with required fields', async () => {
    const doc = await createDocument(validInput);

    expect(doc.contentType).toBe('text');
    expect(doc.content).toBe('Test content');
    expect(doc.type).toBe(ElementType.DOCUMENT);
    expect(doc.createdBy).toBe('el-system1' as EntityId);
    expect(doc.tags).toEqual([]);
    expect(doc.metadata).toEqual({});
    expect(doc.id).toMatch(/^el-[0-9a-z]{3,8}$/);
    expect(doc.version).toBe(1);
    expect(doc.previousVersionId).toBe(null);
  });

  test('creates document with optional fields', async () => {
    const doc = await createDocument({
      ...validInput,
      tags: ['spec', 'design'],
      metadata: { author: 'test' },
    });

    expect(doc.tags).toEqual(['spec', 'design']);
    expect(doc.metadata).toEqual({ author: 'test' });
  });

  test('creates markdown document', async () => {
    const doc = await createDocument({
      ...validInput,
      contentType: ContentType.MARKDOWN,
      content: '# Heading\n\nParagraph',
    });

    expect(doc.contentType).toBe('markdown');
    expect(doc.content).toBe('# Heading\n\nParagraph');
  });

  test('creates JSON document', async () => {
    const doc = await createDocument({
      ...validInput,
      contentType: ContentType.JSON,
      content: '{"key": "value"}',
    });

    expect(doc.contentType).toBe('json');
    expect(doc.content).toBe('{"key": "value"}');
  });

  test('validates content type', async () => {
    await expect(
      createDocument({ ...validInput, contentType: 'invalid' as ContentType })
    ).rejects.toThrow(ValidationError);
  });

  test('validates JSON content', async () => {
    await expect(
      createDocument({
        ...validInput,
        contentType: ContentType.JSON,
        content: '{invalid}',
      })
    ).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different documents', async () => {
    const doc1 = await createDocument(validInput);
    const doc2 = await createDocument({ ...validInput, content: 'Different content' });

    expect(doc1.id).not.toBe(doc2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const doc = await createDocument(validInput);
    const after = new Date().toISOString();

    expect(doc.createdAt >= before).toBe(true);
    expect(doc.createdAt <= after).toBe(true);
    expect(doc.createdAt).toBe(doc.updatedAt);
  });

  test('creates document with empty content', async () => {
    const doc = await createDocument({
      ...validInput,
      content: '',
    });

    expect(doc.content).toBe('');
  });

  test('defaults immutable to false', async () => {
    const doc = await createDocument(validInput);
    expect(doc.immutable).toBe(false);
  });

  test('creates document with explicit immutable true', async () => {
    const doc = await createDocument({ ...validInput, immutable: true });
    expect(doc.immutable).toBe(true);
  });

  test('defaults category to other', async () => {
    const doc = await createDocument(validInput);
    expect(doc.category).toBe(DocumentCategory.OTHER);
  });

  test('defaults status to active', async () => {
    const doc = await createDocument(validInput);
    expect(doc.status).toBe(DocumentStatus.ACTIVE);
  });

  test('creates document with explicit category', async () => {
    const doc = await createDocument({
      ...validInput,
      category: DocumentCategory.SPEC,
    });
    expect(doc.category).toBe('spec');
  });

  test('creates document with explicit status', async () => {
    const doc = await createDocument({
      ...validInput,
      status: DocumentStatus.ARCHIVED,
    });
    expect(doc.status).toBe('archived');
  });

  test('validates invalid category', async () => {
    await expect(
      createDocument({ ...validInput, category: 'invalid' as any })
    ).rejects.toThrow(ValidationError);
  });

  test('validates invalid status', async () => {
    await expect(
      createDocument({ ...validInput, status: 'invalid' as any })
    ).rejects.toThrow(ValidationError);
  });
});

// ============================================================================
// updateDocumentContent Tests
// ============================================================================

describe('updateDocumentContent', () => {
  test('increments version number', () => {
    const original = createTestDocument({ version: 1 });
    const updated = updateDocumentContent(original, { content: 'New content' });

    expect(updated.version).toBe(2);
  });

  test('sets previousVersionId to original document ID', () => {
    const original = createTestDocument({ id: 'el-orig123' as ElementId, version: 1 });
    const updated = updateDocumentContent(original, { content: 'New content' });

    expect(updated.previousVersionId).toBe('el-orig123' as DocumentId);
  });

  test('updates content', () => {
    const original = createTestDocument({ content: 'Old content' });
    const updated = updateDocumentContent(original, { content: 'New content' });

    expect(updated.content).toBe('New content');
  });

  test('keeps content type if not provided', () => {
    const original = createTestDocument({ contentType: ContentType.MARKDOWN });
    const updated = updateDocumentContent(original, { content: '# New heading' });

    expect(updated.contentType).toBe(ContentType.MARKDOWN);
  });

  test('changes content type if provided', () => {
    const original = createTestDocument({ contentType: ContentType.TEXT });
    const updated = updateDocumentContent(original, {
      content: '{"data": true}',
      contentType: ContentType.JSON,
    });

    expect(updated.contentType).toBe(ContentType.JSON);
  });

  test('updates updatedAt timestamp', () => {
    const original = createTestDocument({
      updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const updated = updateDocumentContent(original, { content: 'New content' });

    expect(updated.updatedAt).not.toBe(original.updatedAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(original.updatedAt).getTime()
    );
  });

  test('preserves original document fields', () => {
    const original = createTestDocument({
      tags: ['important'],
      metadata: { author: 'test' },
    });
    const updated = updateDocumentContent(original, { content: 'New content' });

    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.createdBy).toBe(original.createdBy);
    expect(updated.tags).toEqual(original.tags);
    expect(updated.metadata).toEqual(original.metadata);
  });

  test('validates new JSON content', () => {
    const original = createTestDocument({ contentType: ContentType.JSON, content: '{}' });

    expect(() =>
      updateDocumentContent(original, { content: '{invalid}' })
    ).toThrow(ValidationError);
  });

  test('rejects update of immutable document', () => {
    const original = createTestDocument({ immutable: true });

    expect(() =>
      updateDocumentContent(original, { content: 'New content' })
    ).toThrow(ConstraintError);
    try {
      updateDocumentContent(original, { content: 'New content' });
    } catch (e) {
      const err = e as ConstraintError;
      expect(err.code).toBe(ErrorCode.IMMUTABLE);
    }
  });

  test('allows update of mutable document', () => {
    const original = createTestDocument({ immutable: false });
    const updated = updateDocumentContent(original, { content: 'New content' });
    expect(updated.content).toBe('New content');
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isFirstVersion', () => {
  test('returns true for version 1', () => {
    expect(isFirstVersion(createTestDocument({ version: 1 }))).toBe(true);
  });

  test('returns false for version > 1', () => {
    expect(
      isFirstVersion(
        createTestDocument({ version: 2, previousVersionId: 'el-prev123' as DocumentId })
      )
    ).toBe(false);
  });
});

describe('hasVersionHistory', () => {
  test('returns false for version 1', () => {
    expect(hasVersionHistory(createTestDocument({ version: 1 }))).toBe(false);
  });

  test('returns true for version > 1', () => {
    expect(
      hasVersionHistory(
        createTestDocument({ version: 2, previousVersionId: 'el-prev123' as DocumentId })
      )
    ).toBe(true);
  });
});

describe('getContentTypeDisplayName', () => {
  test('returns display name for each content type', () => {
    expect(getContentTypeDisplayName(ContentType.TEXT)).toBe('Plain Text');
    expect(getContentTypeDisplayName(ContentType.MARKDOWN)).toBe('Markdown');
    expect(getContentTypeDisplayName(ContentType.JSON)).toBe('JSON');
  });
});

describe('isEmptyContent', () => {
  test('returns true for empty content', () => {
    expect(isEmptyContent(createTestDocument({ content: '' }))).toBe(true);
  });

  test('returns false for non-empty content', () => {
    expect(isEmptyContent(createTestDocument({ content: 'text' }))).toBe(false);
    expect(isEmptyContent(createTestDocument({ content: ' ' }))).toBe(false);
  });
});

describe('getContentSizeBytes', () => {
  test('returns size in bytes for ASCII content', () => {
    expect(getContentSizeBytes(createTestDocument({ content: 'hello' }))).toBe(5);
  });

  test('returns size in bytes for UTF-8 content', () => {
    // Emoji takes 4 bytes in UTF-8
    expect(getContentSizeBytes(createTestDocument({ content: '👋' }))).toBe(4);
  });

  test('returns 0 for empty content', () => {
    expect(getContentSizeBytes(createTestDocument({ content: '' }))).toBe(0);
  });
});

describe('parseJsonContent', () => {
  test('parses valid JSON document', () => {
    const doc = createTestDocument({
      contentType: ContentType.JSON,
      content: '{"key": "value", "num": 42}',
    });

    const parsed = parseJsonContent<{ key: string; num: number }>(doc);
    expect(parsed.key).toBe('value');
    expect(parsed.num).toBe(42);
  });

  test('throws for non-JSON content type', () => {
    const doc = createTestDocument({
      contentType: ContentType.TEXT,
      content: '{"key": "value"}',
    });

    expect(() => parseJsonContent(doc)).toThrow(ValidationError);
    try {
      parseJsonContent(doc);
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.INVALID_CONTENT_TYPE);
    }
  });

  test('throws for invalid JSON content', () => {
    // Force an invalid state (shouldn't happen in practice with validation)
    const doc = {
      ...createTestDocument({
        contentType: ContentType.JSON,
      }),
      content: '{invalid}',
    };

    expect(() => parseJsonContent(doc)).toThrow(ValidationError);
    try {
      parseJsonContent(doc);
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.INVALID_JSON);
    }
  });
});

describe('filterByContentType', () => {
  test('filters documents by content type', () => {
    const documents: Document[] = [
      createTestDocument({ id: 'el-1' as ElementId, contentType: ContentType.TEXT }),
      createTestDocument({ id: 'el-2' as ElementId, contentType: ContentType.MARKDOWN }),
      createTestDocument({ id: 'el-3' as ElementId, contentType: ContentType.TEXT }),
      createTestDocument({
        id: 'el-4' as ElementId,
        contentType: ContentType.JSON,
        content: '{}',
      }),
    ];

    const textDocs = filterByContentType(documents, ContentType.TEXT);
    expect(textDocs).toHaveLength(2);
    expect(textDocs.map((d) => d.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);

    const markdownDocs = filterByContentType(documents, ContentType.MARKDOWN);
    expect(markdownDocs).toHaveLength(1);
    expect(markdownDocs[0].id).toBe('el-2' as ElementId);

    const jsonDocs = filterByContentType(documents, ContentType.JSON);
    expect(jsonDocs).toHaveLength(1);
    expect(jsonDocs[0].id).toBe('el-4' as ElementId);
  });

  test('returns empty array when no matches', () => {
    const documents: Document[] = [
      createTestDocument({ contentType: ContentType.TEXT }),
    ];

    expect(filterByContentType(documents, ContentType.JSON)).toEqual([]);
  });

  test('handles empty input', () => {
    expect(filterByContentType([], ContentType.TEXT)).toEqual([]);
  });
});

describe('hasSameContent', () => {
  test('returns true for same content and type', () => {
    const a = createTestDocument({ content: 'test', contentType: ContentType.TEXT });
    const b = createTestDocument({ content: 'test', contentType: ContentType.TEXT });

    expect(hasSameContent(a, b)).toBe(true);
  });

  test('returns false for different content', () => {
    const a = createTestDocument({ content: 'test1' });
    const b = createTestDocument({ content: 'test2' });

    expect(hasSameContent(a, b)).toBe(false);
  });

  test('returns false for different content type', () => {
    const a = createTestDocument({ content: '# test', contentType: ContentType.TEXT });
    const b = createTestDocument({ content: '# test', contentType: ContentType.MARKDOWN });

    expect(hasSameContent(a, b)).toBe(false);
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles maximum content size at boundary', async () => {
    const maxContent = 'x'.repeat(MAX_CONTENT_SIZE);
    const doc = await createDocument({
      contentType: ContentType.TEXT,
      content: maxContent,
      createdBy: 'el-system1' as EntityId,
    });
    expect(doc.content).toBe(maxContent);
  });

  test('handles unicode content correctly', async () => {
    const unicodeContent = '你好世界 🌍 مرحبا';
    const doc = await createDocument({
      contentType: ContentType.TEXT,
      content: unicodeContent,
      createdBy: 'el-system1' as EntityId,
    });
    expect(doc.content).toBe(unicodeContent);
  });

  test('handles multiline content', async () => {
    const multilineContent = 'Line 1\nLine 2\nLine 3';
    const doc = await createDocument({
      contentType: ContentType.TEXT,
      content: multilineContent,
      createdBy: 'el-system1' as EntityId,
    });
    expect(doc.content).toBe(multilineContent);
  });

  test('handles nested JSON content', async () => {
    const nestedJson = JSON.stringify({
      level1: {
        level2: {
          level3: { value: 'deep' },
        },
      },
      array: [1, 2, [3, 4]],
    });

    const doc = await createDocument({
      contentType: ContentType.JSON,
      content: nestedJson,
      createdBy: 'el-system1' as EntityId,
    });

    expect(doc.content).toBe(nestedJson);
    const parsed = parseJsonContent<any>(doc);
    expect(parsed.level1.level2.level3.value).toBe('deep');
  });

  test('multiple sequential updates maintain version chain', () => {
    let doc = createTestDocument({ id: 'el-v1' as ElementId, version: 1 });

    doc = updateDocumentContent(doc, { content: 'Version 2' });
    expect(doc.version).toBe(2);
    expect(doc.previousVersionId).toBe('el-v1' as DocumentId);

    doc = updateDocumentContent(doc, { content: 'Version 3' });
    expect(doc.version).toBe(3);
    expect(doc.previousVersionId).toBe('el-v1' as DocumentId); // Points to original ID

    doc = updateDocumentContent(doc, { content: 'Version 4' });
    expect(doc.version).toBe(4);
  });
});

describe('Property-based tests', () => {
  test('all content types create valid documents', async () => {
    for (const contentType of Object.values(ContentType)) {
      let content = 'test content';
      if (contentType === ContentType.JSON) {
        content = '{"test": true}';
      }

      const doc = await createDocument({
        contentType,
        content,
        createdBy: 'el-system1' as EntityId,
      });

      expect(isDocument(doc)).toBe(true);
      expect(doc.contentType).toBe(contentType);
    }
  });

  test('version validation is consistent', () => {
    for (let v = 1; v <= 100; v++) {
      expect(isValidVersion(v)).toBe(true);
      expect(validateVersion(v)).toBe(v);
    }

    for (let v = -10; v <= 0; v++) {
      expect(isValidVersion(v)).toBe(false);
      expect(() => validateVersion(v)).toThrow(ValidationError);
    }
  });

  test('content type validation is consistent', () => {
    for (const ct of Object.values(ContentType)) {
      expect(isValidContentType(ct)).toBe(true);
      expect(validateContentType(ct)).toBe(ct);
    }
  });
});

describe('Version chain integrity', () => {
  test('version 1 always has null previousVersionId', async () => {
    const doc = await createDocument({
      contentType: ContentType.TEXT,
      content: 'test',
      createdBy: 'el-system1' as EntityId,
    });

    expect(doc.version).toBe(1);
    expect(doc.previousVersionId).toBe(null);
    expect(isDocument(doc)).toBe(true);
  });

  test('version > 1 always has non-null previousVersionId', () => {
    const doc = createTestDocument({
      version: 2,
      previousVersionId: 'el-prev' as DocumentId,
    });

    expect(isDocument(doc)).toBe(true);
  });

  test('document fails validation with mismatched version/previousVersionId', () => {
    // Version 1 with previousVersionId should fail
    expect(
      isDocument(
        createTestDocument({ version: 1, previousVersionId: 'el-prev' as DocumentId })
      )
    ).toBe(false);

    // Version > 1 without previousVersionId should fail
    expect(isDocument(createTestDocument({ version: 2, previousVersionId: null }))).toBe(
      false
    );
  });
});

// ============================================================================
// Content Type Migration Tests
// ============================================================================

describe('migrateContentType', () => {
  describe('text to other types', () => {
    test('text → markdown: passthrough', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: 'Hello world',
      });

      const migrated = migrateContentType(doc, ContentType.MARKDOWN);

      expect(migrated.contentType).toBe(ContentType.MARKDOWN);
      expect(migrated.content).toBe('Hello world');
      expect(migrated.version).toBe(2);
    });

    test('text → json: wraps in object', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: 'Hello world',
      });

      const migrated = migrateContentType(doc, ContentType.JSON);

      expect(migrated.contentType).toBe(ContentType.JSON);
      expect(migrated.content).toBe('{"text":"Hello world"}');
      expect(JSON.parse(migrated.content)).toEqual({ text: 'Hello world' });
    });

    test('text → json: handles special characters', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: 'Hello "world"\nNew line',
      });

      const migrated = migrateContentType(doc, ContentType.JSON);

      expect(migrated.contentType).toBe(ContentType.JSON);
      const parsed = JSON.parse(migrated.content);
      expect(parsed.text).toBe('Hello "world"\nNew line');
    });
  });

  describe('markdown to other types', () => {
    test('markdown → text: strips headers', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: '# Heading\n\nParagraph text',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.contentType).toBe(ContentType.TEXT);
      expect(migrated.content).toBe('Heading\n\nParagraph text');
    });

    test('markdown → text: strips bold and italic', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: '**bold** and *italic* and ***both***',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toBe('bold and italic and both');
    });

    test('markdown → text: strips links', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: 'Check [this link](https://example.com) out',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toBe('Check this link out');
    });

    test('markdown → text: strips images', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: 'See ![alt text](https://example.com/img.png) here',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toBe('See alt text here');
    });

    test('markdown → text: strips code blocks', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: 'Code:\n```javascript\nconsole.log("hi");\n```\nEnd',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toContain('console.log("hi");');
      expect(migrated.content).not.toContain('```');
    });

    test('markdown → text: strips inline code', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: 'Use `console.log()` for debugging',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toBe('Use console.log() for debugging');
    });

    test('markdown → text: strips blockquotes', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: '> This is a quote\n> More quote',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toBe('This is a quote\nMore quote');
    });

    test('markdown → text: strips list markers', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: '- Item 1\n- Item 2\n1. First\n2. Second',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).toBe('Item 1\nItem 2\nFirst\nSecond');
    });

    test('markdown → json: wraps in object', () => {
      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: '# Hello\n\n**World**',
      });

      const migrated = migrateContentType(doc, ContentType.JSON);

      expect(migrated.contentType).toBe(ContentType.JSON);
      const parsed = JSON.parse(migrated.content);
      expect(parsed.markdown).toBe('# Hello\n\n**World**');
    });
  });

  describe('json to other types', () => {
    test('json → text: pretty prints by default', () => {
      const doc = createTestDocument({
        contentType: ContentType.JSON,
        content: '{"key":"value","nested":{"a":1}}',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.contentType).toBe(ContentType.TEXT);
      expect(migrated.content).toBe(JSON.stringify({ key: 'value', nested: { a: 1 } }, null, 2));
    });

    test('json → text: can disable pretty print', () => {
      const doc = createTestDocument({
        contentType: ContentType.JSON,
        content: '{"key":"value"}',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT, { prettyPrint: false });

      expect(migrated.content).toBe('{"key":"value"}');
    });

    test('json → markdown: uses code block by default', () => {
      const doc = createTestDocument({
        contentType: ContentType.JSON,
        content: '{"key":"value"}',
      });

      const migrated = migrateContentType(doc, ContentType.MARKDOWN);

      expect(migrated.contentType).toBe(ContentType.MARKDOWN);
      expect(migrated.content).toContain('```json');
      expect(migrated.content).toContain('```');
      expect(migrated.content).toContain('"key"');
    });

    test('json → markdown: can disable code block', () => {
      const doc = createTestDocument({
        contentType: ContentType.JSON,
        content: '{"key":"value"}',
      });

      const migrated = migrateContentType(doc, ContentType.MARKDOWN, { useCodeBlock: false });

      expect(migrated.content).not.toContain('```');
      expect(migrated.content).toContain('"key"');
    });
  });

  describe('same type migration', () => {
    test('returns same document when types match', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: 'Hello',
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated).toBe(doc);
      expect(migrated.version).toBe(1); // No version increment
    });
  });

  describe('version handling', () => {
    test('migration increments version', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: 'Hello',
        version: 3,
        previousVersionId: 'el-prev' as DocumentId,
      });

      const migrated = migrateContentType(doc, ContentType.MARKDOWN);

      expect(migrated.version).toBe(4);
      expect(migrated.previousVersionId).toBe(doc.id as unknown as DocumentId);
    });

    test('migration updates timestamp', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: 'Hello',
        updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      });

      const migrated = migrateContentType(doc, ContentType.MARKDOWN);

      expect(migrated.updatedAt).not.toBe(doc.updatedAt);
    });
  });

  describe('preserves document properties', () => {
    test('preserves id, tags, metadata', () => {
      const doc = createTestDocument({
        id: 'el-test123' as ElementId,
        contentType: ContentType.TEXT,
        content: 'Hello',
        tags: ['important', 'test'],
        metadata: { author: 'test-user' },
      });

      const migrated = migrateContentType(doc, ContentType.MARKDOWN);

      expect(migrated.id).toBe('el-test123' as ElementId);
      expect(migrated.tags).toEqual(['important', 'test']);
      expect(migrated.metadata).toEqual({ author: 'test-user' });
    });
  });

  describe('edge cases', () => {
    test('handles empty content', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: '',
      });

      const migrated = migrateContentType(doc, ContentType.JSON);

      expect(migrated.content).toBe('{"text":""}');
    });

    test('handles unicode content', () => {
      const doc = createTestDocument({
        contentType: ContentType.TEXT,
        content: '你好世界 🌍',
      });

      const migrated = migrateContentType(doc, ContentType.JSON);

      const parsed = JSON.parse(migrated.content);
      expect(parsed.text).toBe('你好世界 🌍');
    });

    test('handles complex markdown', () => {
      const complexMarkdown = `# Title

## Section 1

This is a paragraph with **bold**, *italic*, and ***bold italic*** text.

- List item 1
- List item 2

> A blockquote

\`\`\`typescript
const x = 1;
\`\`\`

[A link](https://example.com) and ![an image](img.png)`;

      const doc = createTestDocument({
        contentType: ContentType.MARKDOWN,
        content: complexMarkdown,
      });

      const migrated = migrateContentType(doc, ContentType.TEXT);

      expect(migrated.content).not.toContain('#');
      expect(migrated.content).not.toContain('**');
      expect(migrated.content).not.toContain('[A link]');
      expect(migrated.content).toContain('Title');
      expect(migrated.content).toContain('bold');
      expect(migrated.content).toContain('A link');
    });
  });
});

describe('isMigrationSupported', () => {
  test('all valid content type combinations are supported', () => {
    const types = [ContentType.TEXT, ContentType.MARKDOWN, ContentType.JSON];

    for (const from of types) {
      for (const to of types) {
        expect(isMigrationSupported(from, to)).toBe(true);
      }
    }
  });

  test('invalid content types return false', () => {
    expect(isMigrationSupported('invalid' as ContentType, ContentType.TEXT)).toBe(false);
    expect(isMigrationSupported(ContentType.TEXT, 'invalid' as ContentType)).toBe(false);
  });
});

describe('getMigrationDescription', () => {
  test('returns description for same type', () => {
    expect(getMigrationDescription(ContentType.TEXT, ContentType.TEXT)).toBe(
      'No migration needed (same type)'
    );
  });

  test('returns descriptions for all migrations', () => {
    expect(getMigrationDescription(ContentType.TEXT, ContentType.MARKDOWN)).toBe(
      'Direct passthrough (markdown is a superset of text)'
    );
    expect(getMigrationDescription(ContentType.TEXT, ContentType.JSON)).toBe(
      'Wraps content in {"text": "..."}'
    );
    expect(getMigrationDescription(ContentType.MARKDOWN, ContentType.TEXT)).toBe(
      'Strips markdown formatting'
    );
    expect(getMigrationDescription(ContentType.MARKDOWN, ContentType.JSON)).toBe(
      'Wraps content in {"markdown": "..."}'
    );
    expect(getMigrationDescription(ContentType.JSON, ContentType.TEXT)).toBe(
      'Pretty-prints the JSON'
    );
    expect(getMigrationDescription(ContentType.JSON, ContentType.MARKDOWN)).toBe(
      'Formats as markdown code block'
    );
  });
});
