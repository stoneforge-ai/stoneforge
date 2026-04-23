import { describe, expect, test } from 'bun:test';
import {
  Dependency,
  DependencyType,
  BlockingDependencyType,
  AssociativeDependencyType,
  AttributionDependencyType,
  ThreadingDependencyType,
  GateType,
  TestType,
  TestResult,
  AwaitsMetadata,
  ValidatesMetadata,
  TimerGateMetadata,
  ApprovalGateMetadata,
  ExternalGateMetadata,
  WebhookGateMetadata,
  VALID_DEPENDENCY_TYPES,
  BLOCKING_DEPENDENCY_TYPES,
  ASSOCIATIVE_DEPENDENCY_TYPES,
  ATTRIBUTION_DEPENDENCY_TYPES,
  THREADING_DEPENDENCY_TYPES,
  VALID_GATE_TYPES,
  VALID_TEST_TYPES,
  isValidDependencyType,
  isBlockingDependencyType,
  isAssociativeDependencyType,
  isAttributionDependencyType,
  isThreadingDependencyType,
  isValidGateType,
  isValidTestType,
  isValidTestResult,
  isValidAwaitsMetadata,
  isValidValidatesMetadata,
  isDependency,
  validateDependencyType,
  validateGateType,
  validateTestType,
  validateTestResult,
  validateAwaitsMetadata,
  validateValidatesMetadata,
  validateElementId,
  validateEntityId,
  validateDependency,
  createDependency,
  createAwaitsDependency,
  createValidatesDependency,
  CreateDependencyInput,
  isBlockingDependency,
  isAssociativeDependency,
  isAttributionDependency,
  isThreadingDependency,
  isMentionsDependency,
  participatesInCycleDetection,
  getAwaitsMetadata,
  getValidatesMetadata,
  filterByType,
  filterBlocking,
  filterAssociative,
  filterByBlocked,
  filterByBlocker,
  getDependencyTypeDisplayName,
  getGateTypeDisplayName,
  describeDependency,
  normalizeRelatesToDependency,
  areRelated,
} from './dependency.js';
import { ElementId, EntityId, Timestamp } from './element.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid dependency for testing
function createTestDependency(overrides: Partial<Dependency> = {}): Dependency {
  return {
    blockedId: 'el-target456' as ElementId,
    blockerId: 'el-source123' as ElementId,
    type: DependencyType.BLOCKS,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// DependencyType Constants Tests
// ============================================================================

describe('BlockingDependencyType', () => {
  test('contains all expected types', () => {
    expect(BlockingDependencyType.BLOCKS).toBe('blocks');
    expect(BlockingDependencyType.PARENT_CHILD).toBe('parent-child');
    expect(BlockingDependencyType.AWAITS).toBe('awaits');
  });

  test('has exactly 3 types', () => {
    expect(Object.keys(BlockingDependencyType)).toHaveLength(3);
  });
});

describe('AssociativeDependencyType', () => {
  test('contains all expected types', () => {
    expect(AssociativeDependencyType.RELATES_TO).toBe('relates-to');
    expect(AssociativeDependencyType.REFERENCES).toBe('references');
    expect(AssociativeDependencyType.SUPERSEDES).toBe('supersedes');
    expect(AssociativeDependencyType.DUPLICATES).toBe('duplicates');
    expect(AssociativeDependencyType.CAUSED_BY).toBe('caused-by');
    expect(AssociativeDependencyType.VALIDATES).toBe('validates');
    expect(AssociativeDependencyType.MENTIONS).toBe('mentions');
  });

  test('has exactly 7 types', () => {
    expect(Object.keys(AssociativeDependencyType)).toHaveLength(7);
  });
});

describe('AttributionDependencyType', () => {
  test('contains all expected types', () => {
    expect(AttributionDependencyType.AUTHORED_BY).toBe('authored-by');
    expect(AttributionDependencyType.ASSIGNED_TO).toBe('assigned-to');
    expect(AttributionDependencyType.APPROVED_BY).toBe('approved-by');
  });

  test('has exactly 3 types', () => {
    expect(Object.keys(AttributionDependencyType)).toHaveLength(3);
  });
});

describe('ThreadingDependencyType', () => {
  test('contains all expected types', () => {
    expect(ThreadingDependencyType.REPLIES_TO).toBe('replies-to');
  });

  test('has exactly 1 type', () => {
    expect(Object.keys(ThreadingDependencyType)).toHaveLength(1);
  });
});

describe('DependencyType', () => {
  test('contains all types from all categories', () => {
    // Blocking
    expect(DependencyType.BLOCKS).toBe('blocks');
    expect(DependencyType.PARENT_CHILD).toBe('parent-child');
    expect(DependencyType.AWAITS).toBe('awaits');
    // Associative
    expect(DependencyType.RELATES_TO).toBe('relates-to');
    expect(DependencyType.REFERENCES).toBe('references');
    expect(DependencyType.SUPERSEDES).toBe('supersedes');
    expect(DependencyType.DUPLICATES).toBe('duplicates');
    expect(DependencyType.CAUSED_BY).toBe('caused-by');
    expect(DependencyType.VALIDATES).toBe('validates');
    expect(DependencyType.MENTIONS).toBe('mentions');
    // Attribution
    expect(DependencyType.AUTHORED_BY).toBe('authored-by');
    expect(DependencyType.ASSIGNED_TO).toBe('assigned-to');
    expect(DependencyType.APPROVED_BY).toBe('approved-by');
    // Threading
    expect(DependencyType.REPLIES_TO).toBe('replies-to');
  });

  test('has exactly 14 types total', () => {
    expect(Object.keys(DependencyType)).toHaveLength(14);
    expect(VALID_DEPENDENCY_TYPES).toHaveLength(14);
  });
});

describe('BLOCKING_DEPENDENCY_TYPES', () => {
  test('contains only blocking types', () => {
    expect(BLOCKING_DEPENDENCY_TYPES).toContain('blocks');
    expect(BLOCKING_DEPENDENCY_TYPES).toContain('parent-child');
    expect(BLOCKING_DEPENDENCY_TYPES).toContain('awaits');
    expect(BLOCKING_DEPENDENCY_TYPES).toHaveLength(3);
  });

  test('does not contain associative types', () => {
    expect(BLOCKING_DEPENDENCY_TYPES).not.toContain('relates-to');
    expect(BLOCKING_DEPENDENCY_TYPES).not.toContain('references');
  });
});

// ============================================================================
// GateType Constants Tests
// ============================================================================

describe('GateType', () => {
  test('contains all expected gate types', () => {
    expect(GateType.TIMER).toBe('timer');
    expect(GateType.APPROVAL).toBe('approval');
    expect(GateType.EXTERNAL).toBe('external');
    expect(GateType.WEBHOOK).toBe('webhook');
  });

  test('has exactly 4 gate types', () => {
    expect(Object.keys(GateType)).toHaveLength(4);
    expect(VALID_GATE_TYPES).toHaveLength(4);
  });
});

// ============================================================================
// TestType and TestResult Constants Tests
// ============================================================================

describe('TestType', () => {
  test('contains all expected test types', () => {
    expect(TestType.UNIT).toBe('unit');
    expect(TestType.INTEGRATION).toBe('integration');
    expect(TestType.MANUAL).toBe('manual');
    expect(TestType.E2E).toBe('e2e');
    expect(TestType.PROPERTY).toBe('property');
  });

  test('has exactly 5 test types', () => {
    expect(Object.keys(TestType)).toHaveLength(5);
    expect(VALID_TEST_TYPES).toHaveLength(5);
  });
});

describe('TestResult', () => {
  test('contains pass and fail', () => {
    expect(TestResult.PASS).toBe('pass');
    expect(TestResult.FAIL).toBe('fail');
  });

  test('has exactly 2 results', () => {
    expect(Object.keys(TestResult)).toHaveLength(2);
  });
});

// ============================================================================
// Type Guard Tests - DependencyType
// ============================================================================

describe('isValidDependencyType', () => {
  test('accepts all valid dependency types', () => {
    for (const type of VALID_DEPENDENCY_TYPES) {
      expect(isValidDependencyType(type)).toBe(true);
    }
  });

  test('rejects invalid dependency types', () => {
    expect(isValidDependencyType('invalid')).toBe(false);
    expect(isValidDependencyType('BLOCKS')).toBe(false); // case sensitive
    expect(isValidDependencyType(null)).toBe(false);
    expect(isValidDependencyType(undefined)).toBe(false);
    expect(isValidDependencyType(123)).toBe(false);
    expect(isValidDependencyType({})).toBe(false);
  });
});

describe('isBlockingDependencyType', () => {
  test('accepts blocking types', () => {
    expect(isBlockingDependencyType('blocks')).toBe(true);
    expect(isBlockingDependencyType('parent-child')).toBe(true);
    expect(isBlockingDependencyType('awaits')).toBe(true);
  });

  test('rejects non-blocking types', () => {
    expect(isBlockingDependencyType('relates-to')).toBe(false);
    expect(isBlockingDependencyType('references')).toBe(false);
    expect(isBlockingDependencyType('authored-by')).toBe(false);
    expect(isBlockingDependencyType('replies-to')).toBe(false);
    expect(isBlockingDependencyType('invalid')).toBe(false);
  });
});

describe('isAssociativeDependencyType', () => {
  test('accepts associative types', () => {
    expect(isAssociativeDependencyType('relates-to')).toBe(true);
    expect(isAssociativeDependencyType('references')).toBe(true);
    expect(isAssociativeDependencyType('supersedes')).toBe(true);
    expect(isAssociativeDependencyType('duplicates')).toBe(true);
    expect(isAssociativeDependencyType('caused-by')).toBe(true);
    expect(isAssociativeDependencyType('validates')).toBe(true);
    expect(isAssociativeDependencyType('mentions')).toBe(true);
  });

  test('rejects non-associative types', () => {
    expect(isAssociativeDependencyType('blocks')).toBe(false);
    expect(isAssociativeDependencyType('authored-by')).toBe(false);
    expect(isAssociativeDependencyType('invalid')).toBe(false);
  });
});

describe('isAttributionDependencyType', () => {
  test('accepts attribution types', () => {
    expect(isAttributionDependencyType('authored-by')).toBe(true);
    expect(isAttributionDependencyType('assigned-to')).toBe(true);
    expect(isAttributionDependencyType('approved-by')).toBe(true);
  });

  test('rejects non-attribution types', () => {
    expect(isAttributionDependencyType('blocks')).toBe(false);
    expect(isAttributionDependencyType('relates-to')).toBe(false);
    expect(isAttributionDependencyType('invalid')).toBe(false);
  });
});

describe('isThreadingDependencyType', () => {
  test('accepts threading types', () => {
    expect(isThreadingDependencyType('replies-to')).toBe(true);
  });

  test('rejects non-threading types', () => {
    expect(isThreadingDependencyType('blocks')).toBe(false);
    expect(isThreadingDependencyType('relates-to')).toBe(false);
    expect(isThreadingDependencyType('authored-by')).toBe(false);
    expect(isThreadingDependencyType('invalid')).toBe(false);
  });
});

// ============================================================================
// Type Guard Tests - GateType
// ============================================================================

describe('isValidGateType', () => {
  test('accepts all valid gate types', () => {
    expect(isValidGateType('timer')).toBe(true);
    expect(isValidGateType('approval')).toBe(true);
    expect(isValidGateType('external')).toBe(true);
    expect(isValidGateType('webhook')).toBe(true);
  });

  test('rejects invalid gate types', () => {
    expect(isValidGateType('invalid')).toBe(false);
    expect(isValidGateType('TIMER')).toBe(false);
    expect(isValidGateType(null)).toBe(false);
    expect(isValidGateType(123)).toBe(false);
  });
});

// ============================================================================
// Type Guard Tests - TestType and TestResult
// ============================================================================

describe('isValidTestType', () => {
  test('accepts all valid test types', () => {
    expect(isValidTestType('unit')).toBe(true);
    expect(isValidTestType('integration')).toBe(true);
    expect(isValidTestType('manual')).toBe(true);
    expect(isValidTestType('e2e')).toBe(true);
    expect(isValidTestType('property')).toBe(true);
  });

  test('rejects invalid test types', () => {
    expect(isValidTestType('invalid')).toBe(false);
    expect(isValidTestType('UNIT')).toBe(false);
    expect(isValidTestType(null)).toBe(false);
  });
});

describe('isValidTestResult', () => {
  test('accepts pass and fail', () => {
    expect(isValidTestResult('pass')).toBe(true);
    expect(isValidTestResult('fail')).toBe(true);
  });

  test('rejects invalid results', () => {
    expect(isValidTestResult('success')).toBe(false);
    expect(isValidTestResult('PASS')).toBe(false);
    expect(isValidTestResult(null)).toBe(false);
    expect(isValidTestResult(true)).toBe(false);
  });
});

// ============================================================================
// Type Guard Tests - AwaitsMetadata
// ============================================================================

describe('isValidAwaitsMetadata', () => {
  describe('timer gate', () => {
    test('accepts valid timer metadata', () => {
      const metadata: TimerGateMetadata = {
        gateType: GateType.TIMER,
        waitUntil: '2025-01-22T15:00:00.000Z',
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(true);
    });

    test('rejects timer metadata without waitUntil', () => {
      const metadata = { gateType: 'timer' };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });

    test('rejects timer metadata with invalid waitUntil', () => {
      const metadata = { gateType: 'timer', waitUntil: 'not-a-timestamp' };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });
  });

  describe('approval gate', () => {
    test('accepts valid approval metadata', () => {
      const metadata: ApprovalGateMetadata = {
        gateType: GateType.APPROVAL,
        requiredApprovers: ['el-user1' as EntityId, 'el-user2' as EntityId],
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(true);
    });

    test('accepts approval metadata with approvalCount', () => {
      const metadata: ApprovalGateMetadata = {
        gateType: GateType.APPROVAL,
        requiredApprovers: ['el-user1' as EntityId, 'el-user2' as EntityId],
        approvalCount: 1,
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(true);
    });

    test('rejects approval metadata with empty approvers', () => {
      const metadata = { gateType: 'approval', requiredApprovers: [] };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });

    test('rejects approval metadata with approvalCount > approvers', () => {
      const metadata = {
        gateType: 'approval',
        requiredApprovers: ['el-user1'],
        approvalCount: 2,
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });

    test('rejects approval metadata with invalid approvalCount', () => {
      const metadata = {
        gateType: 'approval',
        requiredApprovers: ['el-user1'],
        approvalCount: 0,
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });
  });

  describe('external gate', () => {
    test('accepts valid external metadata', () => {
      const metadata: ExternalGateMetadata = {
        gateType: GateType.EXTERNAL,
        externalSystem: 'jira',
        externalId: 'PROJ-123',
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(true);
    });

    test('rejects external metadata without externalSystem', () => {
      const metadata = { gateType: 'external', externalId: 'PROJ-123' };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });

    test('rejects external metadata without externalId', () => {
      const metadata = { gateType: 'external', externalSystem: 'jira' };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });
  });

  describe('webhook gate', () => {
    test('accepts valid webhook metadata with all fields', () => {
      const metadata: WebhookGateMetadata = {
        gateType: GateType.WEBHOOK,
        webhookUrl: 'https://example.com/callback',
        callbackId: 'cb-123',
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(true);
    });

    test('accepts webhook metadata without optional fields', () => {
      const metadata: WebhookGateMetadata = {
        gateType: GateType.WEBHOOK,
      };
      expect(isValidAwaitsMetadata(metadata)).toBe(true);
    });

    test('rejects webhook metadata with non-string webhookUrl', () => {
      const metadata = { gateType: 'webhook', webhookUrl: 123 };
      expect(isValidAwaitsMetadata(metadata)).toBe(false);
    });
  });

  describe('invalid cases', () => {
    test('rejects null', () => {
      expect(isValidAwaitsMetadata(null)).toBe(false);
    });

    test('rejects non-object', () => {
      expect(isValidAwaitsMetadata('string')).toBe(false);
    });

    test('rejects invalid gateType', () => {
      expect(isValidAwaitsMetadata({ gateType: 'invalid' })).toBe(false);
    });
  });
});

// ============================================================================
// Type Guard Tests - ValidatesMetadata
// ============================================================================

describe('isValidValidatesMetadata', () => {
  test('accepts valid validates metadata', () => {
    const metadata: ValidatesMetadata = {
      testType: TestType.UNIT,
      result: TestResult.PASS,
    };
    expect(isValidValidatesMetadata(metadata)).toBe(true);
  });

  test('accepts metadata with details', () => {
    const metadata: ValidatesMetadata = {
      testType: TestType.INTEGRATION,
      result: TestResult.FAIL,
      details: 'Test failed due to timeout',
    };
    expect(isValidValidatesMetadata(metadata)).toBe(true);
  });

  test('accepts custom test types', () => {
    const metadata = {
      testType: 'custom-type',
      result: 'pass',
    };
    expect(isValidValidatesMetadata(metadata)).toBe(true);
  });

  test('rejects metadata without testType', () => {
    const metadata = { result: 'pass' };
    expect(isValidValidatesMetadata(metadata)).toBe(false);
  });

  test('rejects metadata with empty testType', () => {
    const metadata = { testType: '', result: 'pass' };
    expect(isValidValidatesMetadata(metadata)).toBe(false);
  });

  test('rejects metadata without result', () => {
    const metadata = { testType: 'unit' };
    expect(isValidValidatesMetadata(metadata)).toBe(false);
  });

  test('rejects metadata with invalid result', () => {
    const metadata = { testType: 'unit', result: 'success' };
    expect(isValidValidatesMetadata(metadata)).toBe(false);
  });

  test('rejects metadata with non-string details', () => {
    const metadata = { testType: 'unit', result: 'pass', details: 123 };
    expect(isValidValidatesMetadata(metadata)).toBe(false);
  });

  test('rejects null', () => {
    expect(isValidValidatesMetadata(null)).toBe(false);
  });
});

// ============================================================================
// Type Guard Tests - isDependency
// ============================================================================

describe('isDependency', () => {
  test('accepts valid dependency', () => {
    const dep = createTestDependency();
    expect(isDependency(dep)).toBe(true);
  });

  test('accepts dependency with all types', () => {
    for (const type of VALID_DEPENDENCY_TYPES) {
      const dep = createTestDependency({ type });
      // Skip awaits and validates - they require special metadata
      if (type === DependencyType.AWAITS || type === DependencyType.VALIDATES) {
        continue;
      }
      expect(isDependency(dep)).toBe(true);
    }
  });

  test('accepts awaits dependency with valid metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.AWAITS,
      metadata: {
        gateType: GateType.TIMER,
        waitUntil: '2025-01-22T15:00:00.000Z',
      },
    });
    expect(isDependency(dep)).toBe(true);
  });

  test('accepts validates dependency with valid metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.VALIDATES,
      metadata: {
        testType: 'unit',
        result: 'pass',
      },
    });
    expect(isDependency(dep)).toBe(true);
  });

  test('rejects null', () => {
    expect(isDependency(null)).toBe(false);
  });

  test('rejects non-object', () => {
    expect(isDependency('string')).toBe(false);
    expect(isDependency(123)).toBe(false);
  });

  test('rejects dependency without blockedId', () => {
    const dep = createTestDependency();
    delete (dep as unknown as Record<string, unknown>).blockedId;
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency with empty blockedId', () => {
    const dep = createTestDependency({ blockedId: '' as ElementId });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency without blockerId', () => {
    const dep = createTestDependency();
    delete (dep as unknown as Record<string, unknown>).blockerId;
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency with empty blockerId', () => {
    const dep = createTestDependency({ blockerId: '' as ElementId });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects self-referencing dependency', () => {
    const dep = createTestDependency({
      blockedId: 'el-same123' as ElementId,
      blockerId: 'el-same123' as ElementId,
    });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency with invalid type', () => {
    const dep = createTestDependency({ type: 'invalid' as DependencyType });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency with invalid createdAt', () => {
    const dep = createTestDependency({ createdAt: 'invalid' as Timestamp });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency without createdBy', () => {
    const dep = createTestDependency();
    delete (dep as unknown as Record<string, unknown>).createdBy;
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects dependency with invalid metadata', () => {
    const dep = createTestDependency({ metadata: 'invalid' as unknown as Record<string, unknown> });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects awaits dependency with invalid metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.AWAITS,
      metadata: { invalid: true },
    });
    expect(isDependency(dep)).toBe(false);
  });

  test('rejects validates dependency with invalid metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.VALIDATES,
      metadata: { invalid: true },
    });
    expect(isDependency(dep)).toBe(false);
  });
});

// ============================================================================
// Validator Tests
// ============================================================================

describe('validateDependencyType', () => {
  test('returns valid type', () => {
    expect(validateDependencyType('blocks')).toBe('blocks');
    expect(validateDependencyType('relates-to')).toBe('relates-to');
  });

  test('throws ValidationError for invalid type', () => {
    expect(() => validateDependencyType('invalid')).toThrow(ValidationError);
    try {
      validateDependencyType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('type');
    }
  });
});

describe('validateGateType', () => {
  test('returns valid gate type', () => {
    expect(validateGateType('timer')).toBe('timer');
    expect(validateGateType('approval')).toBe('approval');
  });

  test('throws ValidationError for invalid gate type', () => {
    expect(() => validateGateType('invalid')).toThrow(ValidationError);
  });
});

describe('validateTestType', () => {
  test('returns valid test type', () => {
    expect(validateTestType('unit')).toBe('unit');
  });

  test('throws ValidationError for invalid test type', () => {
    expect(() => validateTestType('invalid')).toThrow(ValidationError);
  });
});

describe('validateTestResult', () => {
  test('returns valid result', () => {
    expect(validateTestResult('pass')).toBe('pass');
    expect(validateTestResult('fail')).toBe('fail');
  });

  test('throws ValidationError for invalid result', () => {
    expect(() => validateTestResult('success')).toThrow(ValidationError);
  });
});

describe('validateAwaitsMetadata', () => {
  test('validates timer metadata', () => {
    const metadata = {
      gateType: 'timer' as const,
      waitUntil: '2025-01-22T15:00:00.000Z',
    };
    expect(validateAwaitsMetadata(metadata)).toEqual(metadata);
  });

  test('validates approval metadata', () => {
    const metadata = {
      gateType: 'approval' as const,
      requiredApprovers: ['el-user1' as EntityId],
      approvalCount: 1,
    };
    expect(validateAwaitsMetadata(metadata)).toEqual(metadata);
  });

  test('validates external metadata', () => {
    const metadata = {
      gateType: 'external' as const,
      externalSystem: 'jira',
      externalId: 'PROJ-123',
    };
    expect(validateAwaitsMetadata(metadata)).toEqual(metadata);
  });

  test('validates webhook metadata', () => {
    const metadata = {
      gateType: 'webhook' as const,
      webhookUrl: 'https://example.com',
    };
    expect(validateAwaitsMetadata(metadata)).toEqual(metadata);
  });

  test('throws for non-object', () => {
    expect(() => validateAwaitsMetadata(null)).toThrow(ValidationError);
    expect(() => validateAwaitsMetadata('string')).toThrow(ValidationError);
  });

  test('throws for invalid gateType', () => {
    expect(() => validateAwaitsMetadata({ gateType: 'invalid' })).toThrow(ValidationError);
  });

  test('throws for timer without waitUntil', () => {
    expect(() => validateAwaitsMetadata({ gateType: 'timer' })).toThrow(ValidationError);
  });

  test('throws for approval without requiredApprovers', () => {
    expect(() => validateAwaitsMetadata({ gateType: 'approval' })).toThrow(ValidationError);
  });

  test('throws for approval with empty requiredApprovers', () => {
    expect(() =>
      validateAwaitsMetadata({ gateType: 'approval', requiredApprovers: [] })
    ).toThrow(ValidationError);
  });

  test('throws for approval with invalid approvalCount', () => {
    expect(() =>
      validateAwaitsMetadata({
        gateType: 'approval',
        requiredApprovers: ['el-user1'],
        approvalCount: 0,
      })
    ).toThrow(ValidationError);
  });

  test('throws for approval with approvalCount > approvers', () => {
    expect(() =>
      validateAwaitsMetadata({
        gateType: 'approval',
        requiredApprovers: ['el-user1'],
        approvalCount: 2,
      })
    ).toThrow(ValidationError);
  });

  test('throws for external without externalSystem', () => {
    expect(() =>
      validateAwaitsMetadata({ gateType: 'external', externalId: 'id' })
    ).toThrow(ValidationError);
  });

  test('throws for external without externalId', () => {
    expect(() =>
      validateAwaitsMetadata({ gateType: 'external', externalSystem: 'jira' })
    ).toThrow(ValidationError);
  });
});

describe('validateValidatesMetadata', () => {
  test('validates correct metadata', () => {
    const metadata = {
      testType: 'unit' as const,
      result: 'pass' as const,
      details: 'All tests passed',
    };
    expect(validateValidatesMetadata(metadata)).toEqual(metadata);
  });

  test('throws for non-object', () => {
    expect(() => validateValidatesMetadata(null)).toThrow(ValidationError);
  });

  test('throws for missing testType', () => {
    expect(() => validateValidatesMetadata({ result: 'pass' })).toThrow(ValidationError);
  });

  test('throws for empty testType', () => {
    expect(() => validateValidatesMetadata({ testType: '', result: 'pass' })).toThrow(
      ValidationError
    );
  });

  test('throws for invalid result', () => {
    expect(() =>
      validateValidatesMetadata({ testType: 'unit', result: 'success' })
    ).toThrow(ValidationError);
  });

  test('throws for non-string details', () => {
    expect(() =>
      validateValidatesMetadata({ testType: 'unit', result: 'pass', details: 123 })
    ).toThrow(ValidationError);
  });
});

describe('validateElementId', () => {
  test('returns valid element ID', () => {
    expect(validateElementId('el-abc123', 'blockedId')).toBe('el-abc123' as ElementId);
  });

  test('throws for non-string', () => {
    expect(() => validateElementId(123, 'blockedId')).toThrow(ValidationError);
  });

  test('throws for empty string', () => {
    expect(() => validateElementId('', 'blockedId')).toThrow(ValidationError);
    try {
      validateElementId('', 'blockedId');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
    }
  });
});

describe('validateEntityId', () => {
  test('returns valid entity ID', () => {
    expect(validateEntityId('el-system1', 'createdBy')).toBe('el-system1' as EntityId);
  });

  test('throws for non-string', () => {
    expect(() => validateEntityId(123, 'createdBy')).toThrow(ValidationError);
  });

  test('throws for empty string', () => {
    expect(() => validateEntityId('', 'createdBy')).toThrow(ValidationError);
  });
});

describe('validateDependency', () => {
  test('validates correct dependency', () => {
    const dep = createTestDependency();
    expect(validateDependency(dep)).toEqual(dep);
  });

  test('throws for non-object', () => {
    expect(() => validateDependency(null)).toThrow(ValidationError);
    expect(() => validateDependency('string')).toThrow(ValidationError);
  });

  test('throws for self-reference', () => {
    const dep = createTestDependency({
      blockedId: 'el-same' as ElementId,
      blockerId: 'el-same' as ElementId,
    });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('throws for invalid blockedId', () => {
    const dep = createTestDependency({ blockedId: '' as ElementId });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('throws for invalid blockerId', () => {
    const dep = createTestDependency({ blockerId: '' as ElementId });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('throws for invalid type', () => {
    const dep = createTestDependency({ type: 'invalid' as DependencyType });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('throws for invalid createdAt', () => {
    const dep = createTestDependency({ createdAt: 'invalid' as Timestamp });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('throws for invalid createdBy', () => {
    const dep = createTestDependency({ createdBy: '' as EntityId });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('validates awaits metadata when type is awaits', () => {
    const dep = createTestDependency({
      type: DependencyType.AWAITS,
      metadata: { gateType: 'timer', waitUntil: '2025-01-22T15:00:00.000Z' },
    });
    expect(validateDependency(dep)).toEqual(dep);
  });

  test('throws for invalid awaits metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.AWAITS,
      metadata: { invalid: true },
    });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });

  test('validates validates metadata when type is validates', () => {
    const dep = createTestDependency({
      type: DependencyType.VALIDATES,
      metadata: { testType: 'unit', result: 'pass' },
    });
    expect(validateDependency(dep)).toEqual(dep);
  });

  test('throws for invalid validates metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.VALIDATES,
      metadata: { invalid: true },
    });
    expect(() => validateDependency(dep)).toThrow(ValidationError);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createDependency', () => {
  test('creates dependency with required fields', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-target1' as ElementId,
      blockerId: 'el-source1' as ElementId,
      type: DependencyType.BLOCKS,
      createdBy: 'el-user1' as EntityId,
    };

    const dep = createDependency(input);

    expect(dep.blockedId).toBe('el-target1' as ElementId);
    expect(dep.blockerId).toBe('el-source1' as ElementId);
    expect(dep.type).toBe('blocks');
    expect(dep.createdBy).toBe('el-user1' as EntityId);
    expect(dep.metadata).toEqual({});
    expect(dep.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('creates dependency with metadata', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.REFERENCES,
      createdBy: 'el-user1' as EntityId,
      metadata: { note: 'Important reference' },
    };

    const dep = createDependency(input);

    expect(dep.metadata).toEqual({ note: 'Important reference' });
  });

  test('throws for self-reference', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-same' as ElementId,
      blockerId: 'el-same' as ElementId,
      type: DependencyType.BLOCKS,
      createdBy: 'el-user1' as EntityId,
    };

    expect(() => createDependency(input)).toThrow(ValidationError);
  });

  test('throws for invalid blockedId', () => {
    const input: CreateDependencyInput = {
      blockedId: '' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.BLOCKS,
      createdBy: 'el-user1' as EntityId,
    };

    expect(() => createDependency(input)).toThrow(ValidationError);
  });

  test('throws for invalid type', () => {
    const input = {
      blockedId: 'el-target1' as ElementId,
      blockerId: 'el-source1' as ElementId,
      type: 'invalid' as DependencyType,
      createdBy: 'el-user1' as EntityId,
    };

    expect(() => createDependency(input)).toThrow(ValidationError);
  });

  test('validates awaits metadata', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.AWAITS,
      createdBy: 'el-user1' as EntityId,
      metadata: { gateType: 'timer', waitUntil: '2025-01-22T15:00:00.000Z' },
    };

    const dep = createDependency(input);

    expect(dep.type).toBe('awaits');
    expect(dep.metadata).toEqual({
      gateType: 'timer',
      waitUntil: '2025-01-22T15:00:00.000Z',
    });
  });

  test('throws for awaits without valid metadata', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.AWAITS,
      createdBy: 'el-user1' as EntityId,
      metadata: {},
    };

    expect(() => createDependency(input)).toThrow(ValidationError);
  });

  test('validates validates metadata', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.VALIDATES,
      createdBy: 'el-user1' as EntityId,
      metadata: { testType: 'unit', result: 'pass' },
    };

    const dep = createDependency(input);

    expect(dep.type).toBe('validates');
    expect(dep.metadata).toEqual({ testType: 'unit', result: 'pass' });
  });

  test('throws for validates without valid metadata', () => {
    const input: CreateDependencyInput = {
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.VALIDATES,
      createdBy: 'el-user1' as EntityId,
      metadata: {},
    };

    expect(() => createDependency(input)).toThrow(ValidationError);
  });
});

describe('createAwaitsDependency', () => {
  test('creates timer gate dependency', () => {
    const dep = createAwaitsDependency({
      blockedId: 'el-task1' as ElementId,
      blockerId: 'el-gate1' as ElementId,
      createdBy: 'el-user1' as EntityId,
      awaitsMetadata: {
        gateType: GateType.TIMER,
        waitUntil: '2025-01-22T18:00:00.000Z',
      },
    });

    expect(dep.type).toBe(DependencyType.AWAITS);
    expect((dep.metadata as unknown as TimerGateMetadata).gateType).toBe(GateType.TIMER);
    expect((dep.metadata as unknown as TimerGateMetadata).waitUntil).toBe('2025-01-22T18:00:00.000Z');
  });

  test('creates approval gate dependency', () => {
    const dep = createAwaitsDependency({
      blockedId: 'el-task1' as ElementId,
      blockerId: 'el-gate1' as ElementId,
      createdBy: 'el-user1' as EntityId,
      awaitsMetadata: {
        gateType: GateType.APPROVAL,
        requiredApprovers: ['el-manager1' as EntityId],
        approvalCount: 1,
      },
    });

    expect(dep.type).toBe(DependencyType.AWAITS);
    expect((dep.metadata as unknown as ApprovalGateMetadata).gateType).toBe(GateType.APPROVAL);
    expect((dep.metadata as unknown as ApprovalGateMetadata).requiredApprovers).toEqual(['el-manager1' as EntityId]);
  });

  test('creates external gate dependency', () => {
    const dep = createAwaitsDependency({
      blockedId: 'el-task1' as ElementId,
      blockerId: 'el-gate1' as ElementId,
      createdBy: 'el-user1' as EntityId,
      awaitsMetadata: {
        gateType: GateType.EXTERNAL,
        externalSystem: 'jira',
        externalId: 'PROJ-456',
      },
    });

    expect(dep.type).toBe(DependencyType.AWAITS);
    expect((dep.metadata as unknown as ExternalGateMetadata).gateType).toBe(GateType.EXTERNAL);
    expect((dep.metadata as unknown as ExternalGateMetadata).externalSystem).toBe('jira');
  });

  test('creates webhook gate dependency', () => {
    const dep = createAwaitsDependency({
      blockedId: 'el-task1' as ElementId,
      blockerId: 'el-gate1' as ElementId,
      createdBy: 'el-user1' as EntityId,
      awaitsMetadata: {
        gateType: GateType.WEBHOOK,
        webhookUrl: 'https://example.com/webhook',
        callbackId: 'cb-789',
      },
    });

    expect(dep.type).toBe(DependencyType.AWAITS);
    expect((dep.metadata as unknown as WebhookGateMetadata).gateType).toBe(GateType.WEBHOOK);
  });

  test('throws for invalid metadata', () => {
    expect(() =>
      createAwaitsDependency({
        blockedId: 'el-task1' as ElementId,
        blockerId: 'el-gate1' as ElementId,
        createdBy: 'el-user1' as EntityId,
        awaitsMetadata: { gateType: 'invalid' } as unknown as AwaitsMetadata,
      })
    ).toThrow(ValidationError);
  });
});

describe('createValidatesDependency', () => {
  test('creates validates dependency with pass result', () => {
    const dep = createValidatesDependency({
      blockedId: 'el-test1' as ElementId,
      blockerId: 'el-task1' as ElementId,
      createdBy: 'el-system1' as EntityId,
      validatesMetadata: {
        testType: TestType.UNIT,
        result: TestResult.PASS,
        details: 'All 42 tests passed',
      },
    });

    expect(dep.type).toBe(DependencyType.VALIDATES);
    expect((dep.metadata as unknown as ValidatesMetadata).testType).toBe(TestType.UNIT);
    expect((dep.metadata as unknown as ValidatesMetadata).result).toBe(TestResult.PASS);
    expect((dep.metadata as unknown as ValidatesMetadata).details).toBe('All 42 tests passed');
  });

  test('creates validates dependency with fail result', () => {
    const dep = createValidatesDependency({
      blockedId: 'el-test1' as ElementId,
      blockerId: 'el-task1' as ElementId,
      createdBy: 'el-system1' as EntityId,
      validatesMetadata: {
        testType: TestType.INTEGRATION,
        result: TestResult.FAIL,
        details: 'Database connection timeout',
      },
    });

    expect(dep.type).toBe(DependencyType.VALIDATES);
    expect((dep.metadata as unknown as ValidatesMetadata).result).toBe(TestResult.FAIL);
  });

  test('throws for invalid metadata', () => {
    expect(() =>
      createValidatesDependency({
        blockedId: 'el-test1' as ElementId,
        blockerId: 'el-task1' as ElementId,
        createdBy: 'el-system1' as EntityId,
        validatesMetadata: { testType: 'unit' } as unknown as ValidatesMetadata,
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// Utility Function Tests - Type Predicates
// ============================================================================

describe('isBlockingDependency', () => {
  test('returns true for blocking types', () => {
    expect(isBlockingDependency(createTestDependency({ type: DependencyType.BLOCKS }))).toBe(true);
    expect(isBlockingDependency(createTestDependency({ type: DependencyType.PARENT_CHILD }))).toBe(
      true
    );
    expect(isBlockingDependency(createTestDependency({ type: DependencyType.AWAITS }))).toBe(true);
  });

  test('returns false for non-blocking types', () => {
    expect(isBlockingDependency(createTestDependency({ type: DependencyType.RELATES_TO }))).toBe(
      false
    );
    expect(isBlockingDependency(createTestDependency({ type: DependencyType.REFERENCES }))).toBe(
      false
    );
    expect(isBlockingDependency(createTestDependency({ type: DependencyType.AUTHORED_BY }))).toBe(
      false
    );
  });
});

describe('isAssociativeDependency', () => {
  test('returns true for associative types', () => {
    expect(isAssociativeDependency(createTestDependency({ type: DependencyType.RELATES_TO }))).toBe(
      true
    );
    expect(isAssociativeDependency(createTestDependency({ type: DependencyType.REFERENCES }))).toBe(
      true
    );
    expect(isAssociativeDependency(createTestDependency({ type: DependencyType.VALIDATES }))).toBe(
      true
    );
  });

  test('returns false for non-associative types', () => {
    expect(isAssociativeDependency(createTestDependency({ type: DependencyType.BLOCKS }))).toBe(
      false
    );
    expect(isAssociativeDependency(createTestDependency({ type: DependencyType.AUTHORED_BY }))).toBe(
      false
    );
  });
});

describe('isAttributionDependency', () => {
  test('returns true for attribution types', () => {
    expect(isAttributionDependency(createTestDependency({ type: DependencyType.AUTHORED_BY }))).toBe(
      true
    );
    expect(isAttributionDependency(createTestDependency({ type: DependencyType.ASSIGNED_TO }))).toBe(
      true
    );
    expect(isAttributionDependency(createTestDependency({ type: DependencyType.APPROVED_BY }))).toBe(
      true
    );
  });

  test('returns false for non-attribution types', () => {
    expect(isAttributionDependency(createTestDependency({ type: DependencyType.BLOCKS }))).toBe(
      false
    );
    expect(isAttributionDependency(createTestDependency({ type: DependencyType.RELATES_TO }))).toBe(
      false
    );
  });
});

describe('isThreadingDependency', () => {
  test('returns true for threading types', () => {
    expect(isThreadingDependency(createTestDependency({ type: DependencyType.REPLIES_TO }))).toBe(
      true
    );
  });

  test('returns false for non-threading types', () => {
    expect(isThreadingDependency(createTestDependency({ type: DependencyType.BLOCKS }))).toBe(
      false
    );
    expect(isThreadingDependency(createTestDependency({ type: DependencyType.RELATES_TO }))).toBe(
      false
    );
  });
});

describe('isMentionsDependency', () => {
  test('returns true for mentions type', () => {
    expect(isMentionsDependency(createTestDependency({ type: DependencyType.MENTIONS }))).toBe(
      true
    );
  });

  test('returns false for non-mentions types', () => {
    expect(isMentionsDependency(createTestDependency({ type: DependencyType.BLOCKS }))).toBe(false);
    expect(isMentionsDependency(createTestDependency({ type: DependencyType.RELATES_TO }))).toBe(
      false
    );
    expect(isMentionsDependency(createTestDependency({ type: DependencyType.AUTHORED_BY }))).toBe(
      false
    );
    expect(isMentionsDependency(createTestDependency({ type: DependencyType.REPLIES_TO }))).toBe(
      false
    );
  });
});

describe('participatesInCycleDetection', () => {
  test('returns true for blocking types', () => {
    expect(participatesInCycleDetection(DependencyType.BLOCKS)).toBe(true);
    expect(participatesInCycleDetection(DependencyType.PARENT_CHILD)).toBe(true);
    expect(participatesInCycleDetection(DependencyType.AWAITS)).toBe(true);
  });

  test('returns false for non-blocking types', () => {
    expect(participatesInCycleDetection(DependencyType.RELATES_TO)).toBe(false);
    expect(participatesInCycleDetection(DependencyType.REFERENCES)).toBe(false);
    expect(participatesInCycleDetection(DependencyType.AUTHORED_BY)).toBe(false);
    expect(participatesInCycleDetection(DependencyType.REPLIES_TO)).toBe(false);
  });
});

// ============================================================================
// Utility Function Tests - Metadata Extraction
// ============================================================================

describe('getAwaitsMetadata', () => {
  test('returns metadata for awaits dependency', () => {
    const dep = createTestDependency({
      type: DependencyType.AWAITS,
      metadata: {
        gateType: 'timer',
        waitUntil: '2025-01-22T15:00:00.000Z',
      },
    });
    const metadata = getAwaitsMetadata(dep);
    expect(metadata).not.toBeNull();
    expect(metadata!.gateType).toBe('timer');
    expect((metadata as TimerGateMetadata).waitUntil).toBe('2025-01-22T15:00:00.000Z');
  });

  test('returns null for non-awaits dependency', () => {
    const dep = createTestDependency({ type: DependencyType.BLOCKS });
    expect(getAwaitsMetadata(dep)).toBeNull();
  });

  test('returns null for awaits with invalid metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.AWAITS,
      metadata: { invalid: true },
    });
    expect(getAwaitsMetadata(dep)).toBeNull();
  });
});

describe('getValidatesMetadata', () => {
  test('returns metadata for validates dependency', () => {
    const dep = createTestDependency({
      type: DependencyType.VALIDATES,
      metadata: {
        testType: 'unit',
        result: 'pass',
        details: 'Tests passed',
      },
    });
    const metadata = getValidatesMetadata(dep);
    expect(metadata).not.toBeNull();
    expect(metadata!.testType).toBe('unit');
    expect(metadata!.result).toBe('pass');
    expect(metadata!.details).toBe('Tests passed');
  });

  test('returns null for non-validates dependency', () => {
    const dep = createTestDependency({ type: DependencyType.BLOCKS });
    expect(getValidatesMetadata(dep)).toBeNull();
  });

  test('returns null for validates with invalid metadata', () => {
    const dep = createTestDependency({
      type: DependencyType.VALIDATES,
      metadata: { invalid: true },
    });
    expect(getValidatesMetadata(dep)).toBeNull();
  });
});

// ============================================================================
// Utility Function Tests - Filtering
// ============================================================================

describe('filterByType', () => {
  const dependencies = [
    createTestDependency({ type: DependencyType.BLOCKS }),
    createTestDependency({ type: DependencyType.RELATES_TO }),
    createTestDependency({ type: DependencyType.BLOCKS }),
    createTestDependency({ type: DependencyType.AUTHORED_BY }),
  ];

  test('filters by specific type', () => {
    const blocks = filterByType(dependencies, DependencyType.BLOCKS);
    expect(blocks).toHaveLength(2);
    blocks.forEach((d) => expect(d.type).toBe(DependencyType.BLOCKS));
  });

  test('returns empty array for non-existent type', () => {
    const replies = filterByType(dependencies, DependencyType.REPLIES_TO);
    expect(replies).toHaveLength(0);
  });
});

describe('filterBlocking', () => {
  const dependencies = [
    createTestDependency({ type: DependencyType.BLOCKS }),
    createTestDependency({ type: DependencyType.RELATES_TO }),
    createTestDependency({ type: DependencyType.PARENT_CHILD }),
    createTestDependency({ type: DependencyType.AUTHORED_BY }),
  ];

  test('returns only blocking dependencies', () => {
    const blocking = filterBlocking(dependencies);
    expect(blocking).toHaveLength(2);
    blocking.forEach((d) => expect(isBlockingDependency(d)).toBe(true));
  });
});

describe('filterAssociative', () => {
  const dependencies = [
    createTestDependency({ type: DependencyType.BLOCKS }),
    createTestDependency({ type: DependencyType.RELATES_TO }),
    createTestDependency({ type: DependencyType.REFERENCES }),
    createTestDependency({ type: DependencyType.AUTHORED_BY }),
  ];

  test('returns only associative dependencies', () => {
    const associative = filterAssociative(dependencies);
    expect(associative).toHaveLength(2);
    associative.forEach((d) => expect(isAssociativeDependency(d)).toBe(true));
  });
});

describe('filterByBlocked', () => {
  const dependencies = [
    createTestDependency({ blockedId: 'el-a' as ElementId }),
    createTestDependency({ blockedId: 'el-b' as ElementId }),
    createTestDependency({ blockedId: 'el-a' as ElementId }),
  ];

  test('filters by blocked element', () => {
    const fromA = filterByBlocked(dependencies, 'el-a' as ElementId);
    expect(fromA).toHaveLength(2);
    fromA.forEach((d) => expect(d.blockedId).toBe('el-a' as ElementId));
  });
});

describe('filterByBlocker', () => {
  const dependencies = [
    createTestDependency({ blockerId: 'el-x' as ElementId }),
    createTestDependency({ blockerId: 'el-y' as ElementId }),
    createTestDependency({ blockerId: 'el-x' as ElementId }),
  ];

  test('filters by blocker element', () => {
    const toX = filterByBlocker(dependencies, 'el-x' as ElementId);
    expect(toX).toHaveLength(2);
    toX.forEach((d) => expect(d.blockerId).toBe('el-x' as ElementId));
  });
});

// ============================================================================
// Utility Function Tests - Display
// ============================================================================

describe('getDependencyTypeDisplayName', () => {
  test('returns display names for all types', () => {
    expect(getDependencyTypeDisplayName(DependencyType.BLOCKS)).toBe('Blocks');
    expect(getDependencyTypeDisplayName(DependencyType.PARENT_CHILD)).toBe('Parent-Child');
    expect(getDependencyTypeDisplayName(DependencyType.AWAITS)).toBe('Awaits');
    expect(getDependencyTypeDisplayName(DependencyType.RELATES_TO)).toBe('Relates To');
    expect(getDependencyTypeDisplayName(DependencyType.REFERENCES)).toBe('References');
    expect(getDependencyTypeDisplayName(DependencyType.SUPERSEDES)).toBe('Supersedes');
    expect(getDependencyTypeDisplayName(DependencyType.DUPLICATES)).toBe('Duplicates');
    expect(getDependencyTypeDisplayName(DependencyType.CAUSED_BY)).toBe('Caused By');
    expect(getDependencyTypeDisplayName(DependencyType.VALIDATES)).toBe('Validates');
    expect(getDependencyTypeDisplayName(DependencyType.MENTIONS)).toBe('Mentions');
    expect(getDependencyTypeDisplayName(DependencyType.AUTHORED_BY)).toBe('Authored By');
    expect(getDependencyTypeDisplayName(DependencyType.ASSIGNED_TO)).toBe('Assigned To');
    expect(getDependencyTypeDisplayName(DependencyType.APPROVED_BY)).toBe('Approved By');
    expect(getDependencyTypeDisplayName(DependencyType.REPLIES_TO)).toBe('Replies To');
  });
});

describe('getGateTypeDisplayName', () => {
  test('returns display names for all gate types', () => {
    expect(getGateTypeDisplayName(GateType.TIMER)).toBe('Timer');
    expect(getGateTypeDisplayName(GateType.APPROVAL)).toBe('Approval');
    expect(getGateTypeDisplayName(GateType.EXTERNAL)).toBe('External System');
    expect(getGateTypeDisplayName(GateType.WEBHOOK)).toBe('Webhook');
  });
});

describe('describeDependency', () => {
  test('returns human-readable description', () => {
    const dep = createTestDependency({
      blockedId: 'el-task2' as ElementId,
      blockerId: 'el-task1' as ElementId,
      type: DependencyType.BLOCKS,
    });
    expect(describeDependency(dep)).toBe('el-task2 blocks el-task1');
  });

  test('works for all dependency types', () => {
    expect(
      describeDependency(
        createTestDependency({
          blockedId: 'el-a' as ElementId,
          blockerId: 'el-b' as ElementId,
          type: DependencyType.RELATES_TO,
        })
      )
    ).toBe('el-a relates to el-b');

    expect(
      describeDependency(
        createTestDependency({
          blockedId: 'el-doc' as ElementId,
          blockerId: 'el-user' as ElementId,
          type: DependencyType.AUTHORED_BY,
        })
      )
    ).toBe('el-doc authored by el-user');
  });
});

// ============================================================================
// Utility Function Tests - Bidirectional relates-to
// ============================================================================

describe('normalizeRelatesToDependency', () => {
  test('keeps order when blocked < blocker', () => {
    const result = normalizeRelatesToDependency('el-aaa' as ElementId, 'el-bbb' as ElementId);
    expect(result.blockedId).toBe('el-aaa' as ElementId);
    expect(result.blockerId).toBe('el-bbb' as ElementId);
  });

  test('swaps order when blocked > blocker', () => {
    const result = normalizeRelatesToDependency('el-zzz' as ElementId, 'el-aaa' as ElementId);
    expect(result.blockedId).toBe('el-aaa' as ElementId);
    expect(result.blockerId).toBe('el-zzz' as ElementId);
  });

  test('keeps order when blocked = blocker', () => {
    const result = normalizeRelatesToDependency('el-same' as ElementId, 'el-same' as ElementId);
    expect(result.blockedId).toBe('el-same' as ElementId);
    expect(result.blockerId).toBe('el-same' as ElementId);
  });
});

describe('areRelated', () => {
  test('finds relation when stored in normalized order', () => {
    const dependencies = [
      createTestDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
      }),
    ];

    expect(areRelated(dependencies, 'el-aaa' as ElementId, 'el-bbb' as ElementId)).toBe(true);
    expect(areRelated(dependencies, 'el-bbb' as ElementId, 'el-aaa' as ElementId)).toBe(true);
  });

  test('returns false when no relation exists', () => {
    const dependencies = [
      createTestDependency({
        blockedId: 'el-bbb' as ElementId,
        blockerId: 'el-aaa' as ElementId,
        type: DependencyType.BLOCKS, // Not relates-to
      }),
    ];

    expect(areRelated(dependencies, 'el-aaa' as ElementId, 'el-bbb' as ElementId)).toBe(false);
  });

  test('returns false for unrelated elements', () => {
    const dependencies = [
      createTestDependency({
        blockedId: 'el-aaa' as ElementId,
        blockerId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
      }),
    ];

    expect(areRelated(dependencies, 'el-aaa' as ElementId, 'el-ccc' as ElementId)).toBe(false);
  });

  test('handles empty dependency list', () => {
    expect(areRelated([], 'el-aaa' as ElementId, 'el-bbb' as ElementId)).toBe(false);
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  test('dependency with very long IDs', () => {
    const longId = 'el-' + 'a'.repeat(1000);
    const dep = createDependency({
      blockedId: ('el-' + 'b'.repeat(1000)) as ElementId,
      blockerId: longId as ElementId,
      type: DependencyType.BLOCKS,
      createdBy: 'el-user1' as EntityId,
    });
    expect(dep.blockerId).toBe(longId as ElementId);
  });

  test('dependency metadata with nested objects', () => {
    const dep = createDependency({
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.REFERENCES,
      createdBy: 'el-user1' as EntityId,
      metadata: {
        nested: {
          deep: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
      },
    });
    expect(dep.metadata).toEqual({
      nested: { deep: { value: 'test' } },
      array: [1, 2, 3],
    });
  });

  test('dependency with unicode in metadata', () => {
    const dep = createDependency({
      blockedId: 'el-source1' as ElementId,
      blockerId: 'el-target1' as ElementId,
      type: DependencyType.REFERENCES,
      createdBy: 'el-user1' as EntityId,
      metadata: {
        note: '日本語テスト',
        emoji: '🚀✨',
      },
    });
    expect(dep.metadata).toEqual({
      note: '日本語テスト',
      emoji: '🚀✨',
    });
  });
});
