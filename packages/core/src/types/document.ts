/**
 * Document Type - Versioned content storage
 *
 * Documents represent versioned content within Stoneforge. They store task descriptions,
 * message content, knowledge base entries, and any other textual or structured data.
 * Documents maintain full version history, enabling audit trails and rollback capabilities.
 */

import { ValidationError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import { Element, ElementId, EntityId, ElementType, createTimestamp } from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';

// ============================================================================
// Content Types
// ============================================================================

/**
 * Supported content types for documents
 */
export const ContentType = {
  /** Plain text content - no validation beyond string type */
  TEXT: 'text',
  /** Markdown-formatted content - stored as raw markdown string */
  MARKDOWN: 'markdown',
  /** Structured JSON content - must be valid JSON */
  JSON: 'json',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

// ============================================================================
// Document Category
// ============================================================================

/**
 * Rigid taxonomy of document categories for knowledge management
 */
export const DocumentCategory = {
  // Knowledge categories
  SPEC: 'spec',
  PRD: 'prd',
  DECISION_LOG: 'decision-log',
  CHANGELOG: 'changelog',
  TUTORIAL: 'tutorial',
  HOW_TO: 'how-to',
  EXPLANATION: 'explanation',
  REFERENCE: 'reference',
  RUNBOOK: 'runbook',
  MEETING_NOTES: 'meeting-notes',
  POST_MORTEM: 'post-mortem',
  // System categories (auto-assigned for structural documents)
  TASK_DESCRIPTION: 'task-description',
  MESSAGE_CONTENT: 'message-content',
  // Fallback
  OTHER: 'other',
} as const;

export type DocumentCategory = (typeof DocumentCategory)[keyof typeof DocumentCategory];

// ============================================================================
// Document Status (Lifecycle)
// ============================================================================

/**
 * Document lifecycle status
 */
export const DocumentStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

// ============================================================================
// Content Constraints
// ============================================================================

/** Maximum content size in bytes (10 MB) */
export const MAX_CONTENT_SIZE = 10 * 1024 * 1024;

/** Minimum version number */
export const MIN_VERSION = 1;

// ============================================================================
// Document ID Type
// ============================================================================

/**
 * Branded type for Document IDs (for use in references)
 */
declare const DocumentIdBrand: unique symbol;
export type DocumentId = ElementId & { readonly [DocumentIdBrand]: typeof DocumentIdBrand };

// ============================================================================
// Document Interface
// ============================================================================

/**
 * Document interface - extends Element with versioned content properties
 */
export interface Document extends Element {
  /** Document type is always 'document' */
  readonly type: typeof ElementType.DOCUMENT;
  /** Optional display title */
  title?: string;
  /** Format of the content */
  readonly contentType: ContentType;
  /** The actual content data */
  content: string;
  /** Version number, starts at 1 */
  version: number;
  /** Reference to previous version (null for version 1) */
  previousVersionId: DocumentId | null;
  /** Document category for knowledge taxonomy */
  category: DocumentCategory;
  /** Document lifecycle status */
  status: DocumentStatus;
  /** Whether this document is immutable (content cannot be updated) */
  immutable: boolean;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a content type value
 */
export function isValidContentType(value: unknown): value is ContentType {
  return (
    typeof value === 'string' && Object.values(ContentType).includes(value as ContentType)
  );
}

/**
 * Validates content type and throws if invalid
 */
export function validateContentType(value: unknown): ContentType {
  if (!isValidContentType(value)) {
    throw new ValidationError(
      `Invalid content type: ${value}. Must be one of: ${Object.values(ContentType).join(', ')}`,
      ErrorCode.INVALID_CONTENT_TYPE,
      { field: 'contentType', value, expected: Object.values(ContentType) }
    );
  }
  return value;
}

/**
 * Validates a document category value
 */
export function isValidDocumentCategory(value: unknown): value is DocumentCategory {
  return (
    typeof value === 'string' && Object.values(DocumentCategory).includes(value as DocumentCategory)
  );
}

/**
 * Validates document category and throws if invalid
 */
export function validateDocumentCategory(value: unknown): DocumentCategory {
  if (!isValidDocumentCategory(value)) {
    throw new ValidationError(
      `Invalid document category: ${value}. Must be one of: ${Object.values(DocumentCategory).join(', ')}`,
      ErrorCode.INVALID_CATEGORY,
      { field: 'category', value, expected: Object.values(DocumentCategory) }
    );
  }
  return value;
}

/**
 * Validates a document status value
 */
export function isValidDocumentStatus(value: unknown): value is DocumentStatus {
  return (
    typeof value === 'string' && Object.values(DocumentStatus).includes(value as DocumentStatus)
  );
}

/**
 * Validates document status and throws if invalid
 */
export function validateDocumentStatus(value: unknown): DocumentStatus {
  if (!isValidDocumentStatus(value)) {
    throw new ValidationError(
      `Invalid document status: ${value}. Must be one of: ${Object.values(DocumentStatus).join(', ')}`,
      ErrorCode.INVALID_DOCUMENT_STATUS,
      { field: 'status', value, expected: Object.values(DocumentStatus) }
    );
  }
  return value;
}

/**
 * Validates that content is a valid string
 */
export function isValidContentString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Check content size (in bytes using UTF-8)
  const byteLength = new TextEncoder().encode(value).length;
  return byteLength <= MAX_CONTENT_SIZE;
}

/**
 * Validates content string and throws if invalid
 */
export function validateContentString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Content must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'content', value, expected: 'string' }
    );
  }

  const byteLength = new TextEncoder().encode(value).length;
  if (byteLength > MAX_CONTENT_SIZE) {
    throw new ValidationError(
      `Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`,
      ErrorCode.INVALID_INPUT,
      {
        field: 'content',
        expected: `<= ${MAX_CONTENT_SIZE} bytes`,
        actual: byteLength,
      }
    );
  }

  return value;
}

/**
 * Validates JSON content is parseable
 */
export function isValidJsonContent(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates JSON content and throws if invalid
 */
export function validateJsonContent(value: string): string {
  try {
    JSON.parse(value);
    return value;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new ValidationError(
      `Invalid JSON content: ${message}`,
      ErrorCode.INVALID_JSON,
      { field: 'content', value: value.substring(0, 100), error: message }
    );
  }
}

/**
 * Validates content based on its content type
 */
export function validateContent(content: string, contentType: ContentType): string {
  // First validate it's a valid string within size limits
  validateContentString(content);

  // For JSON content type, validate it's parseable JSON
  if (contentType === ContentType.JSON) {
    validateJsonContent(content);
  }

  // Text and Markdown are passthroughs - no additional validation needed
  return content;
}

/**
 * Validates a version number
 */
export function isValidVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_VERSION
  );
}

/**
 * Validates version and throws if invalid
 */
export function validateVersion(value: unknown): number {
  if (typeof value !== 'number') {
    throw new ValidationError(
      'Version must be a number',
      ErrorCode.INVALID_INPUT,
      { field: 'version', value, expected: 'number' }
    );
  }

  if (!Number.isInteger(value)) {
    throw new ValidationError(
      'Version must be an integer',
      ErrorCode.INVALID_INPUT,
      { field: 'version', value, expected: 'integer' }
    );
  }

  if (value < MIN_VERSION) {
    throw new ValidationError(
      `Version must be at least ${MIN_VERSION}`,
      ErrorCode.INVALID_INPUT,
      { field: 'version', value, expected: `>= ${MIN_VERSION}`, actual: value }
    );
  }

  return value;
}

/**
 * Validates previous version ID format (can be null for version 1)
 */
export function isValidPreviousVersionId(
  value: unknown,
  version: number
): value is DocumentId | null {
  // For version 1, must be null
  if (version === 1) {
    return value === null;
  }

  // For version > 1, must be a string (document ID)
  if (typeof value !== 'string') {
    return false;
  }

  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates previous version ID and throws if invalid
 */
export function validatePreviousVersionId(
  value: unknown,
  version: number
): DocumentId | null {
  if (version === 1) {
    if (value !== null) {
      throw new ValidationError(
        'previousVersionId must be null for version 1',
        ErrorCode.INVALID_INPUT,
        { field: 'previousVersionId', value, expected: 'null for version 1' }
      );
    }
    return null;
  }

  // For version > 1, must be a valid document ID
  if (typeof value !== 'string') {
    throw new ValidationError(
      'previousVersionId must be a string for versions > 1',
      ErrorCode.INVALID_INPUT,
      { field: 'previousVersionId', value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      'previousVersionId has invalid format',
      ErrorCode.INVALID_INPUT,
      { field: 'previousVersionId', value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as DocumentId;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Document
 */
export function isDocument(value: unknown): value is Document {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.DOCUMENT) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check document-specific properties
  if (!isValidContentType(obj.contentType)) return false;
  if (!isValidContentString(obj.content)) return false;
  if (!isValidVersion(obj.version)) return false;
  if (!isValidPreviousVersionId(obj.previousVersionId, obj.version as number)) return false;
  if (!isValidDocumentCategory(obj.category)) return false;
  if (!isValidDocumentStatus(obj.status)) return false;

  // Optional title must be a string if present
  if (obj.title !== undefined && typeof obj.title !== 'string') return false;

  // Backward compat: treat missing immutable as false
  if (obj.immutable !== undefined && typeof obj.immutable !== 'boolean') return false;

  // For JSON content type, validate content is valid JSON
  if (obj.contentType === ContentType.JSON && !isValidJsonContent(obj.content as string)) {
    return false;
  }

  return true;
}

/**
 * Comprehensive validation of a document with detailed errors
 */
export function validateDocument(value: unknown): Document {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Document must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Document id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.DOCUMENT) {
    throw new ValidationError(
      `Document type must be '${ElementType.DOCUMENT}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.DOCUMENT }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError(
      'Document createdAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdAt', value: obj.createdAt }
    );
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError(
      'Document updatedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'updatedAt', value: obj.updatedAt }
    );
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Document createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError(
      'Document tags must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'tags', value: obj.tags, expected: 'array' }
    );
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError(
      'Document metadata must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'metadata', value: obj.metadata, expected: 'object' }
    );
  }

  // Validate document-specific fields
  validateContentType(obj.contentType);
  validateContentString(obj.content);
  const version = validateVersion(obj.version);
  validatePreviousVersionId(obj.previousVersionId, version);
  validateDocumentCategory(obj.category);
  validateDocumentStatus(obj.status);

  // Validate title if present
  if (obj.title !== undefined && typeof obj.title !== 'string') {
    throw new ValidationError(
      'Document title must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'title', value: obj.title, expected: 'string' }
    );
  }

  // Validate immutable field if present (backward compat: missing = false)
  if (obj.immutable !== undefined && typeof obj.immutable !== 'boolean') {
    throw new ValidationError(
      'Document immutable must be a boolean',
      ErrorCode.INVALID_INPUT,
      { field: 'immutable', value: obj.immutable, expected: 'boolean' }
    );
  }

  // For JSON content, validate the content is valid JSON
  if (obj.contentType === ContentType.JSON) {
    validateJsonContent(obj.content as string);
  }

  return value as Document;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new document
 */
export interface CreateDocumentInput {
  /** Format of the content */
  contentType: ContentType;
  /** The actual content data */
  content: string;
  /** Reference to the entity that created this document */
  createdBy: EntityId;
  /** Optional display title */
  title?: string;
  /** Optional tags */
  tags?: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Optional: Document category (default: 'other') */
  category?: DocumentCategory;
  /** Optional: Document status (default: 'active') */
  status?: DocumentStatus;
  /** Optional: Whether document is immutable (default: false) */
  immutable?: boolean;
}

/**
 * Creates a new Document with validated inputs
 *
 * @param input - Document creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Document
 */
export async function createDocument(
  input: CreateDocumentInput,
  config?: IdGeneratorConfig
): Promise<Document> {
  // Validate inputs
  const contentType = validateContentType(input.contentType);
  const content = validateContent(input.content, contentType);

  const now = createTimestamp();

  // Use content prefix for ID generation (first 50 chars or less)
  const identifier = content.substring(0, 50) || 'empty-document';
  const id = await generateId(
    { identifier, createdBy: input.createdBy },
    config
  );

  // Validate and apply defaults for category and status
  const category = input.category !== undefined
    ? validateDocumentCategory(input.category)
    : DocumentCategory.OTHER;
  const status = input.status !== undefined
    ? validateDocumentStatus(input.status)
    : DocumentStatus.ACTIVE;

  const document: Document = {
    id,
    type: ElementType.DOCUMENT,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    ...(input.title !== undefined && { title: input.title }),
    contentType,
    content,
    version: 1,
    previousVersionId: null,
    category,
    status,
    immutable: input.immutable ?? false,
  };

  return document;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a document's content
 */
export interface UpdateDocumentInput {
  /** New content */
  content: string;
  /** New content type (optional - keeps existing if not provided) */
  contentType?: ContentType;
}

/**
 * Creates an updated version of a document
 * Note: This creates the new version data but does NOT handle storage.
 * The storage layer is responsible for:
 * 1. Copying the current version to document_versions table
 * 2. Updating the main record
 *
 * @param document - The current document
 * @param input - Update input
 * @returns The updated document (new version)
 */
export function updateDocumentContent(
  document: Document,
  input: UpdateDocumentInput
): Document {
  if (document.immutable) {
    throw new ConstraintError(
      'Cannot update immutable document',
      ErrorCode.IMMUTABLE,
      { field: 'immutable', value: document.id }
    );
  }

  const contentType = input.contentType ?? document.contentType;
  const content = validateContent(input.content, contentType);

  // Create snapshot ID reference (the current document's ID becomes the previous version)
  const previousVersionId = document.id as unknown as DocumentId;

  return {
    ...document,
    content,
    contentType,
    version: document.version + 1,
    previousVersionId,
    updatedAt: createTimestamp(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a document is the first version
 */
export function isFirstVersion(document: Document): boolean {
  return document.version === 1;
}

/**
 * Checks if document has been modified (version > 1)
 */
export function hasVersionHistory(document: Document): boolean {
  return document.version > 1;
}

/**
 * Gets the content type display name
 */
export function getContentTypeDisplayName(contentType: ContentType): string {
  switch (contentType) {
    case ContentType.TEXT:
      return 'Plain Text';
    case ContentType.MARKDOWN:
      return 'Markdown';
    case ContentType.JSON:
      return 'JSON';
    default:
      return contentType;
  }
}

/**
 * Checks if content is empty
 */
export function isEmptyContent(document: Document): boolean {
  return document.content.length === 0;
}

/**
 * Gets content size in bytes
 */
export function getContentSizeBytes(document: Document): number {
  return new TextEncoder().encode(document.content).length;
}

/**
 * Parses JSON content from a document (only valid for JSON content type)
 * Throws if content type is not JSON or content is invalid
 */
export function parseJsonContent<T = unknown>(document: Document): T {
  if (document.contentType !== ContentType.JSON) {
    throw new ValidationError(
      'Cannot parse JSON from non-JSON document',
      ErrorCode.INVALID_CONTENT_TYPE,
      {
        field: 'contentType',
        value: document.contentType,
        expected: ContentType.JSON,
      }
    );
  }

  try {
    return JSON.parse(document.content) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new ValidationError(
      `Failed to parse document JSON content: ${message}`,
      ErrorCode.INVALID_JSON,
      { error: message }
    );
  }
}

/**
 * Filter documents by content type
 */
export function filterByContentType<T extends Document>(
  documents: T[],
  contentType: ContentType
): T[] {
  return documents.filter((d) => d.contentType === contentType);
}

/**
 * Checks if two documents have the same content
 */
export function hasSameContent(a: Document, b: Document): boolean {
  return a.content === b.content && a.contentType === b.contentType;
}

// ============================================================================
// Content Type Migration
// ============================================================================

/**
 * Content type migration options
 */
export interface MigrateContentTypeOptions {
  /** For json → markdown: use code block formatting (default: true) */
  useCodeBlock?: boolean;
  /** For json → text: pretty print (default: true) */
  prettyPrint?: boolean;
}

/**
 * Strip common markdown formatting to convert to plain text
 */
function stripMarkdown(markdown: string): string {
  let result = markdown;

  // Remove code blocks (both fenced and indented)
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    // Extract content between triple backticks
    const content = match.replace(/```\w*\n?/g, '').replace(/```$/g, '');
    return content.trim();
  });

  // Remove inline code
  result = result.replace(/`([^`]+)`/g, '$1');

  // Remove headers (keep the text)
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1'); // bold italic
  result = result.replace(/\*\*(.+?)\*\*/g, '$1'); // bold
  result = result.replace(/\*(.+?)\*/g, '$1'); // italic
  result = result.replace(/___(.+?)___/g, '$1'); // bold italic underscore
  result = result.replace(/__(.+?)__/g, '$1'); // bold underscore
  result = result.replace(/_(.+?)_/g, '$1'); // italic underscore

  // Remove images ![alt](url) → alt (must be before links)
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove links, keep text [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove blockquotes
  result = result.replace(/^>\s?/gm, '');

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, '');

  // Remove unordered list markers
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');

  // Remove ordered list markers
  result = result.replace(/^[\s]*\d+\.\s+/gm, '');

  // Remove strikethrough
  result = result.replace(/~~(.+?)~~/g, '$1');

  return result.trim();
}

/**
 * Convert text to JSON format
 */
function textToJson(text: string): string {
  return JSON.stringify({ text });
}

/**
 * Convert markdown to JSON format
 */
function markdownToJson(markdown: string): string {
  return JSON.stringify({ markdown });
}

/**
 * Convert JSON to text format
 */
function jsonToText(json: string, prettyPrint: boolean): string {
  try {
    const parsed = JSON.parse(json);
    return prettyPrint ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
  } catch {
    // If parsing fails, return as-is
    return json;
  }
}

/**
 * Convert JSON to markdown format
 */
function jsonToMarkdown(json: string, useCodeBlock: boolean): string {
  try {
    const parsed = JSON.parse(json);
    const formatted = JSON.stringify(parsed, null, 2);
    if (useCodeBlock) {
      return '```json\n' + formatted + '\n```';
    }
    return formatted;
  } catch {
    // If parsing fails, return as-is (possibly in code block)
    if (useCodeBlock) {
      return '```\n' + json + '\n```';
    }
    return json;
  }
}

/**
 * Migrate a document's content type to a new type
 *
 * Supported migrations:
 * - text → markdown: Direct passthrough (markdown is superset of text)
 * - text → json: Wraps content in {"text": "..."}
 * - markdown → text: Strips markdown formatting
 * - markdown → json: Wraps content in {"markdown": "..."}
 * - json → text: Pretty-prints the JSON
 * - json → markdown: Formats as markdown code block
 *
 * @param document - The document to migrate
 * @param targetType - The target content type
 * @param options - Migration options
 * @returns The migrated document (new version)
 */
export function migrateContentType(
  document: Document,
  targetType: ContentType,
  options: MigrateContentTypeOptions = {}
): Document {
  const { useCodeBlock = true, prettyPrint = true } = options;

  // If same type, no migration needed
  if (document.contentType === targetType) {
    return document;
  }

  let migratedContent: string;

  // Determine migration path
  switch (document.contentType) {
    case ContentType.TEXT:
      switch (targetType) {
        case ContentType.MARKDOWN:
          // Text is valid markdown as-is
          migratedContent = document.content;
          break;
        case ContentType.JSON:
          migratedContent = textToJson(document.content);
          break;
        default:
          migratedContent = document.content;
      }
      break;

    case ContentType.MARKDOWN:
      switch (targetType) {
        case ContentType.TEXT:
          migratedContent = stripMarkdown(document.content);
          break;
        case ContentType.JSON:
          migratedContent = markdownToJson(document.content);
          break;
        default:
          migratedContent = document.content;
      }
      break;

    case ContentType.JSON:
      switch (targetType) {
        case ContentType.TEXT:
          migratedContent = jsonToText(document.content, prettyPrint);
          break;
        case ContentType.MARKDOWN:
          migratedContent = jsonToMarkdown(document.content, useCodeBlock);
          break;
        default:
          migratedContent = document.content;
      }
      break;

    default:
      migratedContent = document.content;
  }

  // Validate the migrated content
  validateContent(migratedContent, targetType);

  // Create the updated document using updateDocumentContent
  return updateDocumentContent(document, {
    content: migratedContent,
    contentType: targetType,
  });
}

/**
 * Check if a migration between content types is supported
 */
export function isMigrationSupported(
  fromType: ContentType,
  toType: ContentType
): boolean {
  // All migrations are supported
  return isValidContentType(fromType) && isValidContentType(toType);
}

/**
 * Get a description of what a migration will do
 */
export function getMigrationDescription(
  fromType: ContentType,
  toType: ContentType
): string {
  if (fromType === toType) {
    return 'No migration needed (same type)';
  }

  const descriptions: Record<string, string> = {
    'text→markdown': 'Direct passthrough (markdown is a superset of text)',
    'text→json': 'Wraps content in {"text": "..."}',
    'markdown→text': 'Strips markdown formatting',
    'markdown→json': 'Wraps content in {"markdown": "..."}',
    'json→text': 'Pretty-prints the JSON',
    'json→markdown': 'Formats as markdown code block',
  };

  const key = `${fromType}→${toType}`;
  return descriptions[key] || `Convert from ${fromType} to ${toType}`;
}
