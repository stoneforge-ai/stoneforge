/**
 * Dependency Type - Relationship management between elements
 *
 * The Dependency type provides:
 * - Blocking relationships for task orchestration
 * - Associative links for knowledge graphs
 * - Attribution tracking for audit trails
 * - Message threading support
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  type ElementId,
  type EntityId,
  type Timestamp,
  isValidTimestamp,
  validateTimestamp,
  createTimestamp,
  isValidMetadata,
  validateMetadata,
} from './element.js';

// ============================================================================
// Dependency Type Constants
// ============================================================================

/**
 * Blocking dependency types - affect work readiness
 * Tasks cannot proceed until blockers resolve
 */
export const BlockingDependencyType = {
  /** Blocked element waits for blocker to close */
  BLOCKS: 'blocks',
  /** Hierarchical containment with transitive blocking */
  PARENT_CHILD: 'parent-child',
  /** External gate dependency */
  AWAITS: 'awaits',
} as const;

export type BlockingDependencyType =
  (typeof BlockingDependencyType)[keyof typeof BlockingDependencyType];

/**
 * Associative dependency types - non-blocking knowledge graph connections
 */
export const AssociativeDependencyType = {
  /** Semantic bidirectional link */
  RELATES_TO: 'relates-to',
  /** Citation (unidirectional) */
  REFERENCES: 'references',
  /** Version chain */
  SUPERSEDES: 'supersedes',
  /** Deduplication marker */
  DUPLICATES: 'duplicates',
  /** Audit trail causation */
  CAUSED_BY: 'caused-by',
  /** Test verification link */
  VALIDATES: 'validates',
  /** @mention link from message to entity */
  MENTIONS: 'mentions',
} as const;

export type AssociativeDependencyType =
  (typeof AssociativeDependencyType)[keyof typeof AssociativeDependencyType];

/**
 * Attribution dependency types - link elements to entities
 */
export const AttributionDependencyType = {
  /** Creator attribution */
  AUTHORED_BY: 'authored-by',
  /** Responsibility assignment */
  ASSIGNED_TO: 'assigned-to',
  /** Sign-off approval */
  APPROVED_BY: 'approved-by',
} as const;

export type AttributionDependencyType =
  (typeof AttributionDependencyType)[keyof typeof AttributionDependencyType];

/**
 * Threading dependency types - message conversations
 */
export const ThreadingDependencyType = {
  /** Thread parent reference */
  REPLIES_TO: 'replies-to',
} as const;

export type ThreadingDependencyType =
  (typeof ThreadingDependencyType)[keyof typeof ThreadingDependencyType];

/**
 * All dependency types combined
 */
export const DependencyType = {
  ...BlockingDependencyType,
  ...AssociativeDependencyType,
  ...AttributionDependencyType,
  ...ThreadingDependencyType,
} as const;

export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];

/**
 * Array of all valid dependency types for validation
 */
export const VALID_DEPENDENCY_TYPES = Object.values(DependencyType);

/**
 * Array of blocking dependency types for cycle detection
 */
export const BLOCKING_DEPENDENCY_TYPES: DependencyType[] = Object.values(BlockingDependencyType);

/**
 * Array of associative dependency types
 */
export const ASSOCIATIVE_DEPENDENCY_TYPES: DependencyType[] =
  Object.values(AssociativeDependencyType);

/**
 * Array of attribution dependency types
 */
export const ATTRIBUTION_DEPENDENCY_TYPES: DependencyType[] =
  Object.values(AttributionDependencyType);

/**
 * Array of threading dependency types
 */
export const THREADING_DEPENDENCY_TYPES: DependencyType[] =
  Object.values(ThreadingDependencyType);

// ============================================================================
// Gate Types for Awaits Dependencies
// ============================================================================

/**
 * Gate types for awaits dependencies
 */
export const GateType = {
  /** Time-based gate */
  TIMER: 'timer',
  /** Requires approval from specific entities */
  APPROVAL: 'approval',
  /** External system confirmation */
  EXTERNAL: 'external',
  /** Webhook callback */
  WEBHOOK: 'webhook',
} as const;

export type GateType = (typeof GateType)[keyof typeof GateType];

/**
 * Array of all valid gate types
 */
export const VALID_GATE_TYPES = Object.values(GateType);

// ============================================================================
// Test Types for Validates Dependencies
// ============================================================================

/**
 * Test types for validates dependencies
 */
export const TestType = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  MANUAL: 'manual',
  E2E: 'e2e',
  PROPERTY: 'property',
} as const;

export type TestType = (typeof TestType)[keyof typeof TestType];

/**
 * Array of all valid test types
 */
export const VALID_TEST_TYPES = Object.values(TestType);

/**
 * Test result values
 */
export const TestResult = {
  PASS: 'pass',
  FAIL: 'fail',
} as const;

export type TestResult = (typeof TestResult)[keyof typeof TestResult];

// ============================================================================
// Metadata Interfaces
// ============================================================================

/**
 * Base metadata for all awaits dependencies
 */
export interface AwaitsMetadataBase {
  /** Type of gate */
  gateType: GateType;
}

/**
 * Timer gate metadata
 */
export interface TimerGateMetadata extends AwaitsMetadataBase {
  gateType: typeof GateType.TIMER;
  /** When the gate opens (ISO 8601 timestamp) */
  waitUntil: Timestamp;
}

/**
 * Approval gate metadata
 */
export interface ApprovalGateMetadata extends AwaitsMetadataBase {
  gateType: typeof GateType.APPROVAL;
  /** Entities that must approve */
  requiredApprovers: EntityId[];
  /** Number of approvals needed (defaults to all) */
  approvalCount?: number;
  /** Current approvers (tracked separately but may be included in metadata) */
  currentApprovers?: EntityId[];
}

/**
 * External gate metadata
 */
export interface ExternalGateMetadata extends AwaitsMetadataBase {
  gateType: typeof GateType.EXTERNAL;
  /** External system identifier */
  externalSystem: string;
  /** External reference ID */
  externalId: string;
  /** Whether this gate has been marked as satisfied */
  satisfied?: boolean;
  /** Timestamp when gate was satisfied */
  satisfiedAt?: Timestamp;
  /** Actor who satisfied the gate */
  satisfiedBy?: EntityId;
}

/**
 * Webhook gate metadata
 */
export interface WebhookGateMetadata extends AwaitsMetadataBase {
  gateType: typeof GateType.WEBHOOK;
  /** Webhook endpoint URL */
  webhookUrl?: string;
  /** Expected callback identifier */
  callbackId?: string;
  /** Whether this gate has been marked as satisfied */
  satisfied?: boolean;
  /** Timestamp when gate was satisfied */
  satisfiedAt?: Timestamp;
  /** Actor who satisfied the gate */
  satisfiedBy?: EntityId;
}

/**
 * Union of all awaits metadata types
 */
export type AwaitsMetadata =
  | TimerGateMetadata
  | ApprovalGateMetadata
  | ExternalGateMetadata
  | WebhookGateMetadata;

/**
 * Validates metadata for test verification
 */
export interface ValidatesMetadata {
  /** Type of test */
  testType: TestType | string;
  /** Test result */
  result: TestResult;
  /** Test output or notes */
  details?: string;
}

// ============================================================================
// Dependency Interface
// ============================================================================

/**
 * Dependency - Represents a relationship between two elements
 *
 * Dependencies connect a blocked element to a blocker element with
 * a specific relationship type. The composite key is (blockedId, blockerId, type)
 * allowing multiple dependency types between the same elements.
 */
export interface Dependency {
  /** Element that is waiting/blocked */
  readonly blockedId: ElementId;
  /** Element doing the blocking/being depended on */
  readonly blockerId: ElementId;
  /** Category of relationship */
  readonly type: DependencyType;
  /** When dependency was created */
  readonly createdAt: Timestamp;
  /** Who created the dependency */
  readonly createdBy: EntityId;
  /** Type-specific additional data */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Validation Functions - Type Guards
// ============================================================================

/**
 * Check if a value is a valid DependencyType
 */
export function isValidDependencyType(value: unknown): value is DependencyType {
  return typeof value === 'string' && VALID_DEPENDENCY_TYPES.includes(value as DependencyType);
}

/**
 * Check if a value is a valid BlockingDependencyType
 */
export function isBlockingDependencyType(value: unknown): value is BlockingDependencyType {
  return (
    typeof value === 'string' && BLOCKING_DEPENDENCY_TYPES.includes(value as BlockingDependencyType)
  );
}

/**
 * Check if a value is a valid AssociativeDependencyType
 */
export function isAssociativeDependencyType(value: unknown): value is AssociativeDependencyType {
  return (
    typeof value === 'string' &&
    ASSOCIATIVE_DEPENDENCY_TYPES.includes(value as AssociativeDependencyType)
  );
}

/**
 * Check if a value is a valid AttributionDependencyType
 */
export function isAttributionDependencyType(value: unknown): value is AttributionDependencyType {
  return (
    typeof value === 'string' &&
    ATTRIBUTION_DEPENDENCY_TYPES.includes(value as AttributionDependencyType)
  );
}

/**
 * Check if a value is a valid ThreadingDependencyType
 */
export function isThreadingDependencyType(value: unknown): value is ThreadingDependencyType {
  return (
    typeof value === 'string' &&
    THREADING_DEPENDENCY_TYPES.includes(value as ThreadingDependencyType)
  );
}

/**
 * Check if a dependency type is MENTIONS
 */
export function isMentionsDependency(dependency: Dependency): boolean {
  return dependency.type === DependencyType.MENTIONS;
}

/**
 * Check if a value is a valid GateType
 */
export function isValidGateType(value: unknown): value is GateType {
  return typeof value === 'string' && VALID_GATE_TYPES.includes(value as GateType);
}

/**
 * Check if a value is a valid TestType
 */
export function isValidTestType(value: unknown): value is TestType {
  return typeof value === 'string' && VALID_TEST_TYPES.includes(value as TestType);
}

/**
 * Check if a value is a valid TestResult
 */
export function isValidTestResult(value: unknown): value is TestResult {
  return value === TestResult.PASS || value === TestResult.FAIL;
}

/**
 * Check if metadata is valid AwaitsMetadata
 */
export function isValidAwaitsMetadata(value: unknown): value is AwaitsMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (!isValidGateType(obj.gateType)) {
    return false;
  }

  switch (obj.gateType) {
    case GateType.TIMER:
      return isValidTimestamp(obj.waitUntil);

    case GateType.APPROVAL:
      if (!Array.isArray(obj.requiredApprovers)) return false;
      if (obj.requiredApprovers.length === 0) return false;
      if (!obj.requiredApprovers.every((a) => typeof a === 'string' && a.length > 0)) return false;
      if (obj.approvalCount !== undefined) {
        if (typeof obj.approvalCount !== 'number') return false;
        if (obj.approvalCount < 1 || obj.approvalCount > obj.requiredApprovers.length) return false;
      }
      if (obj.currentApprovers !== undefined) {
        if (!Array.isArray(obj.currentApprovers)) return false;
        if (!obj.currentApprovers.every((a) => typeof a === 'string')) return false;
      }
      return true;

    case GateType.EXTERNAL:
      if (typeof obj.externalSystem !== 'string' || obj.externalSystem.length === 0) return false;
      if (typeof obj.externalId !== 'string' || obj.externalId.length === 0) return false;
      if (obj.satisfied !== undefined && typeof obj.satisfied !== 'boolean') return false;
      if (obj.satisfiedAt !== undefined && !isValidTimestamp(obj.satisfiedAt)) return false;
      if (obj.satisfiedBy !== undefined && typeof obj.satisfiedBy !== 'string') return false;
      return true;

    case GateType.WEBHOOK:
      // Webhook has optional fields
      if (obj.webhookUrl !== undefined && typeof obj.webhookUrl !== 'string') return false;
      if (obj.callbackId !== undefined && typeof obj.callbackId !== 'string') return false;
      if (obj.satisfied !== undefined && typeof obj.satisfied !== 'boolean') return false;
      if (obj.satisfiedAt !== undefined && !isValidTimestamp(obj.satisfiedAt)) return false;
      if (obj.satisfiedBy !== undefined && typeof obj.satisfiedBy !== 'string') return false;
      return true;

    default:
      return false;
  }
}

/**
 * Check if metadata is valid ValidatesMetadata
 */
export function isValidValidatesMetadata(value: unknown): value is ValidatesMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // testType can be a known TestType or a custom string
  if (typeof obj.testType !== 'string' || obj.testType.length === 0) {
    return false;
  }

  if (!isValidTestResult(obj.result)) {
    return false;
  }

  if (obj.details !== undefined && typeof obj.details !== 'string') {
    return false;
  }

  return true;
}

/**
 * Type guard to check if a value is a valid Dependency
 */
export function isDependency(value: unknown): value is Dependency {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (typeof obj.blockedId !== 'string' || obj.blockedId.length === 0) return false;
  if (typeof obj.blockerId !== 'string' || obj.blockerId.length === 0) return false;
  if (!isValidDependencyType(obj.type)) return false;
  if (!isValidTimestamp(obj.createdAt)) return false;
  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) return false;
  if (!isValidMetadata(obj.metadata)) return false;

  // Self-reference check
  if (obj.blockedId === obj.blockerId) return false;

  // Type-specific metadata validation
  if (obj.type === DependencyType.AWAITS) {
    if (!isValidAwaitsMetadata(obj.metadata)) return false;
  }

  if (obj.type === DependencyType.VALIDATES) {
    if (!isValidValidatesMetadata(obj.metadata)) return false;
  }

  return true;
}

// ============================================================================
// Validation Functions - Validators
// ============================================================================

/**
 * Validates a DependencyType and throws if invalid
 */
export function validateDependencyType(value: unknown): DependencyType {
  if (!isValidDependencyType(value)) {
    throw new ValidationError(
      `Invalid dependency type: ${value}. Must be one of: ${VALID_DEPENDENCY_TYPES.join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value, expected: VALID_DEPENDENCY_TYPES }
    );
  }
  return value;
}

/**
 * Validates a GateType and throws if invalid
 */
export function validateGateType(value: unknown): GateType {
  if (!isValidGateType(value)) {
    throw new ValidationError(
      `Invalid gate type: ${value}. Must be one of: ${VALID_GATE_TYPES.join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'gateType', value, expected: VALID_GATE_TYPES }
    );
  }
  return value;
}

/**
 * Validates a TestType and throws if invalid
 */
export function validateTestType(value: unknown): TestType {
  if (!isValidTestType(value)) {
    throw new ValidationError(
      `Invalid test type: ${value}. Must be one of: ${VALID_TEST_TYPES.join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'testType', value, expected: VALID_TEST_TYPES }
    );
  }
  return value;
}

/**
 * Validates a TestResult and throws if invalid
 */
export function validateTestResult(value: unknown): TestResult {
  if (!isValidTestResult(value)) {
    throw new ValidationError(
      `Invalid test result: ${value}. Must be 'pass' or 'fail'`,
      ErrorCode.INVALID_INPUT,
      { field: 'result', value, expected: [TestResult.PASS, TestResult.FAIL] }
    );
  }
  return value;
}

/**
 * Validates AwaitsMetadata and throws if invalid
 */
export function validateAwaitsMetadata(value: unknown): AwaitsMetadata {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('AwaitsMetadata must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate gateType
  const gateType = validateGateType(obj.gateType);

  switch (gateType) {
    case GateType.TIMER:
      validateTimestamp(obj.waitUntil, 'waitUntil');
      break;

    case GateType.APPROVAL:
      if (!Array.isArray(obj.requiredApprovers)) {
        throw new ValidationError(
          'ApprovalGateMetadata requires requiredApprovers array',
          ErrorCode.MISSING_REQUIRED_FIELD,
          { field: 'requiredApprovers', value: obj.requiredApprovers }
        );
      }
      if (obj.requiredApprovers.length === 0) {
        throw new ValidationError(
          'requiredApprovers must contain at least one entity',
          ErrorCode.INVALID_INPUT,
          { field: 'requiredApprovers', value: obj.requiredApprovers }
        );
      }
      for (const approver of obj.requiredApprovers) {
        if (typeof approver !== 'string' || approver.length === 0) {
          throw new ValidationError(
            'Each requiredApprover must be a non-empty string',
            ErrorCode.INVALID_INPUT,
            { field: 'requiredApprovers', value: approver }
          );
        }
      }
      if (obj.approvalCount !== undefined) {
        if (typeof obj.approvalCount !== 'number' || !Number.isInteger(obj.approvalCount)) {
          throw new ValidationError('approvalCount must be an integer', ErrorCode.INVALID_INPUT, {
            field: 'approvalCount',
            value: obj.approvalCount,
          });
        }
        if (obj.approvalCount < 1) {
          throw new ValidationError(
            'approvalCount must be at least 1',
            ErrorCode.INVALID_INPUT,
            { field: 'approvalCount', value: obj.approvalCount }
          );
        }
        if (obj.approvalCount > obj.requiredApprovers.length) {
          throw new ValidationError(
            'approvalCount cannot exceed the number of required approvers',
            ErrorCode.INVALID_INPUT,
            {
              field: 'approvalCount',
              value: obj.approvalCount,
              expected: `<= ${obj.requiredApprovers.length}`,
            }
          );
        }
      }
      break;

    case GateType.EXTERNAL:
      if (typeof obj.externalSystem !== 'string' || obj.externalSystem.length === 0) {
        throw new ValidationError(
          'ExternalGateMetadata requires externalSystem string',
          ErrorCode.MISSING_REQUIRED_FIELD,
          { field: 'externalSystem', value: obj.externalSystem }
        );
      }
      if (typeof obj.externalId !== 'string' || obj.externalId.length === 0) {
        throw new ValidationError(
          'ExternalGateMetadata requires externalId string',
          ErrorCode.MISSING_REQUIRED_FIELD,
          { field: 'externalId', value: obj.externalId }
        );
      }
      if (obj.satisfied !== undefined && typeof obj.satisfied !== 'boolean') {
        throw new ValidationError('satisfied must be a boolean', ErrorCode.INVALID_INPUT, {
          field: 'satisfied',
          value: obj.satisfied,
        });
      }
      if (obj.satisfiedAt !== undefined) {
        validateTimestamp(obj.satisfiedAt, 'satisfiedAt');
      }
      if (obj.satisfiedBy !== undefined && typeof obj.satisfiedBy !== 'string') {
        throw new ValidationError('satisfiedBy must be a string', ErrorCode.INVALID_INPUT, {
          field: 'satisfiedBy',
          value: obj.satisfiedBy,
        });
      }
      break;

    case GateType.WEBHOOK:
      if (obj.webhookUrl !== undefined && typeof obj.webhookUrl !== 'string') {
        throw new ValidationError('webhookUrl must be a string', ErrorCode.INVALID_INPUT, {
          field: 'webhookUrl',
          value: obj.webhookUrl,
        });
      }
      if (obj.callbackId !== undefined && typeof obj.callbackId !== 'string') {
        throw new ValidationError('callbackId must be a string', ErrorCode.INVALID_INPUT, {
          field: 'callbackId',
          value: obj.callbackId,
        });
      }
      if (obj.satisfied !== undefined && typeof obj.satisfied !== 'boolean') {
        throw new ValidationError('satisfied must be a boolean', ErrorCode.INVALID_INPUT, {
          field: 'satisfied',
          value: obj.satisfied,
        });
      }
      if (obj.satisfiedAt !== undefined) {
        validateTimestamp(obj.satisfiedAt, 'satisfiedAt');
      }
      if (obj.satisfiedBy !== undefined && typeof obj.satisfiedBy !== 'string') {
        throw new ValidationError('satisfiedBy must be a string', ErrorCode.INVALID_INPUT, {
          field: 'satisfiedBy',
          value: obj.satisfiedBy,
        });
      }
      break;
  }

  return value as AwaitsMetadata;
}

/**
 * Validates ValidatesMetadata and throws if invalid
 */
export function validateValidatesMetadata(value: unknown): ValidatesMetadata {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('ValidatesMetadata must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // testType is required but can be any non-empty string (allows custom types)
  if (typeof obj.testType !== 'string' || obj.testType.length === 0) {
    throw new ValidationError(
      'ValidatesMetadata requires testType string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'testType', value: obj.testType }
    );
  }

  // result is required
  validateTestResult(obj.result);

  // details is optional but must be string if present
  if (obj.details !== undefined && typeof obj.details !== 'string') {
    throw new ValidationError('details must be a string', ErrorCode.INVALID_INPUT, {
      field: 'details',
      value: obj.details,
    });
  }

  return value as ValidatesMetadata;
}

/**
 * Validates an ElementId (source or target)
 */
export function validateElementId(value: unknown, field: string): ElementId {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, ErrorCode.INVALID_INPUT, {
      field,
      value,
      expected: 'string',
    });
  }
  if (value.length === 0) {
    throw new ValidationError(`${field} is required and cannot be empty`, ErrorCode.INVALID_ID, {
      field,
      value,
    });
  }
  return value as ElementId;
}

/**
 * Validates an EntityId (createdBy)
 */
export function validateEntityId(value: unknown, field: string): EntityId {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, ErrorCode.INVALID_INPUT, {
      field,
      value,
      expected: 'string',
    });
  }
  if (value.length === 0) {
    throw new ValidationError(`${field} is required and cannot be empty`, ErrorCode.INVALID_ID, {
      field,
      value,
    });
  }
  return value as EntityId;
}

/**
 * Comprehensive validation of a Dependency with detailed errors
 */
export function validateDependency(value: unknown): Dependency {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Dependency must be an object', ErrorCode.INVALID_INPUT, { value });
  }

  const obj = value as Record<string, unknown>;

  // Validate blockedId
  const blockedId = validateElementId(obj.blockedId, 'blockedId');

  // Validate blockerId
  const blockerId = validateElementId(obj.blockerId, 'blockerId');

  // Check for self-reference
  if (blockedId === blockerId) {
    throw new ValidationError(
      'Dependency cannot reference itself (blockedId must differ from blockerId)',
      ErrorCode.INVALID_INPUT,
      { blockedId, blockerId }
    );
  }

  // Validate type
  const type = validateDependencyType(obj.type);

  // Validate createdAt
  validateTimestamp(obj.createdAt, 'createdAt');

  // Validate createdBy
  validateEntityId(obj.createdBy, 'createdBy');

  // Validate metadata
  validateMetadata(obj.metadata);

  // Type-specific metadata validation
  if (type === DependencyType.AWAITS) {
    validateAwaitsMetadata(obj.metadata);
  }

  if (type === DependencyType.VALIDATES) {
    validateValidatesMetadata(obj.metadata);
  }

  return value as Dependency;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Input for creating a dependency
 */
export interface CreateDependencyInput {
  /** Element that is waiting/blocked */
  blockedId: ElementId;
  /** Element doing the blocking/being depended on */
  blockerId: ElementId;
  /** Type of dependency */
  type: DependencyType;
  /** Who is creating this dependency */
  createdBy: EntityId;
  /** Type-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating an awaits dependency
 */
export interface CreateAwaitsDependencyInput {
  blockedId: ElementId;
  blockerId: ElementId;
  createdBy: EntityId;
  awaitsMetadata: AwaitsMetadata;
}

/**
 * Input for creating a validates dependency
 */
export interface CreateValidatesDependencyInput {
  blockedId: ElementId;
  blockerId: ElementId;
  createdBy: EntityId;
  validatesMetadata: ValidatesMetadata;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new Dependency
 */
export function createDependency(input: CreateDependencyInput): Dependency {
  // Validate blockedId
  const blockedId = validateElementId(input.blockedId, 'blockedId');

  // Validate blockerId
  const blockerId = validateElementId(input.blockerId, 'blockerId');

  // Check for self-reference
  if (blockedId === blockerId) {
    throw new ValidationError(
      'Dependency cannot reference itself (blockedId must differ from blockerId)',
      ErrorCode.INVALID_INPUT,
      { blockedId, blockerId }
    );
  }

  // Validate type
  const type = validateDependencyType(input.type);

  // Validate createdBy
  const createdBy = validateEntityId(input.createdBy, 'createdBy');

  // Validate metadata
  const metadata = input.metadata !== undefined ? validateMetadata(input.metadata) : {};

  // Type-specific metadata validation
  if (type === DependencyType.AWAITS) {
    validateAwaitsMetadata(metadata);
  }

  if (type === DependencyType.VALIDATES) {
    validateValidatesMetadata(metadata);
  }

  const dependency: Dependency = {
    blockedId,
    blockerId,
    type,
    createdAt: createTimestamp(),
    createdBy,
    metadata,
  };

  return dependency;
}

/**
 * Creates an awaits dependency with proper metadata structure
 */
export function createAwaitsDependency(input: CreateAwaitsDependencyInput): Dependency {
  // Validate awaits metadata
  const awaitsMetadata = validateAwaitsMetadata(input.awaitsMetadata);

  return createDependency({
    blockedId: input.blockedId,
    blockerId: input.blockerId,
    type: DependencyType.AWAITS,
    createdBy: input.createdBy,
    metadata: awaitsMetadata as unknown as Record<string, unknown>,
  });
}

/**
 * Creates a validates dependency with proper metadata structure
 */
export function createValidatesDependency(input: CreateValidatesDependencyInput): Dependency {
  // Validate validates metadata
  const validatesMetadata = validateValidatesMetadata(input.validatesMetadata);

  return createDependency({
    blockedId: input.blockedId,
    blockerId: input.blockerId,
    type: DependencyType.VALIDATES,
    createdBy: input.createdBy,
    metadata: validatesMetadata as unknown as Record<string, unknown>,
  });
}

// ============================================================================
// Utility Functions - Type Predicates
// ============================================================================

/**
 * Check if a dependency is a blocking type
 */
export function isBlockingDependency(dependency: Dependency): boolean {
  return BLOCKING_DEPENDENCY_TYPES.includes(dependency.type as BlockingDependencyType);
}

/**
 * Check if a dependency is an associative type
 */
export function isAssociativeDependency(dependency: Dependency): boolean {
  return ASSOCIATIVE_DEPENDENCY_TYPES.includes(dependency.type as AssociativeDependencyType);
}

/**
 * Check if a dependency is an attribution type
 */
export function isAttributionDependency(dependency: Dependency): boolean {
  return ATTRIBUTION_DEPENDENCY_TYPES.includes(dependency.type as AttributionDependencyType);
}

/**
 * Check if a dependency is a threading type
 */
export function isThreadingDependency(dependency: Dependency): boolean {
  return THREADING_DEPENDENCY_TYPES.includes(dependency.type as ThreadingDependencyType);
}

/**
 * Check if a dependency type participates in cycle detection
 * Note: relates-to is excluded as it's bidirectional by design
 */
export function participatesInCycleDetection(type: DependencyType): boolean {
  return BLOCKING_DEPENDENCY_TYPES.includes(type as BlockingDependencyType);
}

// ============================================================================
// Utility Functions - Metadata Extraction
// ============================================================================

/**
 * Get awaits metadata from a dependency (if applicable)
 */
export function getAwaitsMetadata(dependency: Dependency): AwaitsMetadata | null {
  if (dependency.type !== DependencyType.AWAITS) {
    return null;
  }
  if (!isValidAwaitsMetadata(dependency.metadata)) {
    return null;
  }
  return dependency.metadata as unknown as AwaitsMetadata;
}

/**
 * Get validates metadata from a dependency (if applicable)
 */
export function getValidatesMetadata(dependency: Dependency): ValidatesMetadata | null {
  if (dependency.type !== DependencyType.VALIDATES) {
    return null;
  }
  if (!isValidValidatesMetadata(dependency.metadata)) {
    return null;
  }
  return dependency.metadata as unknown as ValidatesMetadata;
}

// ============================================================================
// Utility Functions - Filtering
// ============================================================================

/**
 * Filter dependencies by type
 */
export function filterByType<T extends Dependency>(
  dependencies: T[],
  type: DependencyType
): T[] {
  return dependencies.filter((d) => d.type === type);
}

/**
 * Filter to only blocking dependencies
 */
export function filterBlocking<T extends Dependency>(dependencies: T[]): T[] {
  return dependencies.filter(isBlockingDependency);
}

/**
 * Filter to only associative dependencies
 */
export function filterAssociative<T extends Dependency>(dependencies: T[]): T[] {
  return dependencies.filter(isAssociativeDependency);
}

/**
 * Filter dependencies by blocked element
 */
export function filterByBlocked<T extends Dependency>(
  dependencies: T[],
  blockedId: ElementId
): T[] {
  return dependencies.filter((d) => d.blockedId === blockedId);
}

/**
 * Filter dependencies by blocker element
 */
export function filterByBlocker<T extends Dependency>(
  dependencies: T[],
  blockerId: ElementId
): T[] {
  return dependencies.filter((d) => d.blockerId === blockerId);
}

// ============================================================================
// Utility Functions - Display
// ============================================================================

/**
 * Get display name for a dependency type
 */
export function getDependencyTypeDisplayName(type: DependencyType): string {
  switch (type) {
    case DependencyType.BLOCKS:
      return 'Blocks';
    case DependencyType.PARENT_CHILD:
      return 'Parent-Child';
    case DependencyType.AWAITS:
      return 'Awaits';
    case DependencyType.RELATES_TO:
      return 'Relates To';
    case DependencyType.REFERENCES:
      return 'References';
    case DependencyType.SUPERSEDES:
      return 'Supersedes';
    case DependencyType.DUPLICATES:
      return 'Duplicates';
    case DependencyType.CAUSED_BY:
      return 'Caused By';
    case DependencyType.VALIDATES:
      return 'Validates';
    case DependencyType.MENTIONS:
      return 'Mentions';
    case DependencyType.AUTHORED_BY:
      return 'Authored By';
    case DependencyType.ASSIGNED_TO:
      return 'Assigned To';
    case DependencyType.APPROVED_BY:
      return 'Approved By';
    case DependencyType.REPLIES_TO:
      return 'Replies To';
    default:
      return type;
  }
}

/**
 * Get display name for a gate type
 */
export function getGateTypeDisplayName(gateType: GateType): string {
  switch (gateType) {
    case GateType.TIMER:
      return 'Timer';
    case GateType.APPROVAL:
      return 'Approval';
    case GateType.EXTERNAL:
      return 'External System';
    case GateType.WEBHOOK:
      return 'Webhook';
    default:
      return gateType;
  }
}

/**
 * Get a human-readable description of a dependency
 */
export function describeDependency(dependency: Dependency): string {
  const typeName = getDependencyTypeDisplayName(dependency.type);
  return `${dependency.blockedId} ${typeName.toLowerCase()} ${dependency.blockerId}`;
}

// ============================================================================
// Bidirectional relates-to Helper
// ============================================================================

/**
 * Normalize relates-to dependencies to ensure consistent ordering
 * For bidirectional relationships, the smaller ID is always the blockedId
 */
export function normalizeRelatesToDependency(
  blockedId: ElementId,
  blockerId: ElementId
): { blockedId: ElementId; blockerId: ElementId } {
  if (blockedId <= blockerId) {
    return { blockedId, blockerId };
  }
  return { blockedId: blockerId, blockerId: blockedId };
}

/**
 * Check if two elements are related (in either direction) for relates-to
 */
export function areRelated(
  dependencies: Dependency[],
  elementA: ElementId,
  elementB: ElementId
): boolean {
  const normalized = normalizeRelatesToDependency(elementA, elementB);
  return dependencies.some(
    (d) =>
      d.type === DependencyType.RELATES_TO &&
      d.blockedId === normalized.blockedId &&
      d.blockerId === normalized.blockerId
  );
}
