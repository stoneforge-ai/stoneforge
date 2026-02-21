# How to Add a Core Type

Step-by-step guide for adding new element types to `@stoneforge/core`.

## Prerequisites

- Understanding of the Element base type
- Familiarity with TypeScript branded types
- Access to `packages/core/`

## Steps

### 1. Create the Type File

Create `packages/core/src/types/{typename}.ts`:

```typescript
/**
 * Feature Type Definition
 *
 * Represents a product feature with specifications and status tracking.
 */

import type { ElementId, EntityId, Timestamp } from './element.js';
import type { DocumentId } from './document.js';
import { isElement, type Element } from './element.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Feature status values
 */
export const FeatureStatus = {
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  IN_DEVELOPMENT: 'in_development',
  RELEASED: 'released',
  DEPRECATED: 'deprecated',
} as const;

export type FeatureStatus = (typeof FeatureStatus)[keyof typeof FeatureStatus];

/**
 * Feature priority (1 = highest)
 */
export type FeaturePriority = 1 | 2 | 3 | 4 | 5;

/**
 * Branded Feature ID
 */
declare const FeatureIdBrand: unique symbol;
export type FeatureId = ElementId & { readonly [FeatureIdBrand]: typeof FeatureIdBrand };

/**
 * Feature element
 */
export interface Feature extends Element {
  readonly type: 'feature';
  readonly title: string;
  readonly status: FeatureStatus;
  readonly priority: FeaturePriority;
  readonly descriptionRef?: DocumentId;
  readonly specificationRef?: DocumentId;
  readonly ownerId?: EntityId;
  readonly targetRelease?: string;
  readonly releasedAt?: Timestamp;
}

/**
 * Input for creating a feature
 */
export interface CreateFeatureInput {
  readonly title: string;
  readonly createdBy: EntityId;
  readonly status?: FeatureStatus;
  readonly priority?: FeaturePriority;
  readonly descriptionRef?: DocumentId;
  readonly specificationRef?: DocumentId;
  readonly ownerId?: EntityId;
  readonly targetRelease?: string;
  readonly tags?: string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Input for updating a feature
 */
export interface UpdateFeatureInput {
  readonly title?: string;
  readonly status?: FeatureStatus;
  readonly priority?: FeaturePriority;
  readonly descriptionRef?: DocumentId;
  readonly specificationRef?: DocumentId;
  readonly ownerId?: EntityId;
  readonly targetRelease?: string;
  readonly releasedAt?: Timestamp;
  readonly tags?: string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Feature with resolved document references
 */
export interface HydratedFeature extends Feature {
  readonly description?: string;
  readonly specification?: string;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Valid feature status values
 */
export const VALID_FEATURE_STATUSES = Object.values(FeatureStatus);

/**
 * Checks if a value is a valid feature status
 */
export function isValidFeatureStatus(value: unknown): value is FeatureStatus {
  return typeof value === 'string' && VALID_FEATURE_STATUSES.includes(value as FeatureStatus);
}

/**
 * Checks if a value is a valid feature priority
 */
export function isValidFeaturePriority(value: unknown): value is FeaturePriority {
  return typeof value === 'number' && [1, 2, 3, 4, 5].includes(value);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for Feature
 */
export function isFeature(value: unknown): value is Feature {
  if (!isElement(value)) return false;
  const el = value as Element;
  return (
    el.type === 'feature' &&
    typeof (el as Feature).title === 'string' &&
    isValidFeatureStatus((el as Feature).status) &&
    isValidFeaturePriority((el as Feature).priority)
  );
}

// ============================================================================
// Factory Functions
// ============================================================================

import { createElementId } from '../id/generator.js';
import { ValidationError, ErrorCode } from '../errors/index.js';

/**
 * Creates a new Feature element
 */
export function createFeature(input: CreateFeatureInput): Feature {
  // Validate required fields
  if (!input.title || typeof input.title !== 'string') {
    throw new ValidationError('Title is required', ErrorCode.MISSING_REQUIRED_FIELD, { field: 'title' });
  }

  if (!input.createdBy) {
    throw new ValidationError('createdBy is required', ErrorCode.MISSING_REQUIRED_FIELD, { field: 'createdBy' });
  }

  const now = new Date().toISOString() as Timestamp;

  const feature: Feature = {
    id: createElementId({ type: 'feature', title: input.title, createdAt: now }) as FeatureId,
    type: 'feature',
    title: input.title.trim(),
    status: input.status ?? FeatureStatus.PROPOSED,
    priority: input.priority ?? 3,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    descriptionRef: input.descriptionRef,
    specificationRef: input.specificationRef,
    ownerId: input.ownerId,
    targetRelease: input.targetRelease,
  };

  return feature;
}

/**
 * Validates a Feature element
 */
export function validateFeature(feature: Feature): void {
  if (!feature.title || typeof feature.title !== 'string') {
    throw new ValidationError('Invalid title', ErrorCode.INVALID_INPUT, { field: 'title' });
  }

  if (!isValidFeatureStatus(feature.status)) {
    throw new ValidationError(
      `Invalid status: ${feature.status}`,
      ErrorCode.INVALID_INPUT,
      { field: 'status', valid: VALID_FEATURE_STATUSES }
    );
  }

  if (!isValidFeaturePriority(feature.priority)) {
    throw new ValidationError(
      'Priority must be 1-5',
      ErrorCode.INVALID_INPUT,
      { field: 'priority' }
    );
  }
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Updates a Feature with new values
 */
export function updateFeature(feature: Feature, updates: UpdateFeatureInput): Feature {
  const updated: Feature = {
    ...feature,
    ...updates,
    updatedAt: new Date().toISOString() as Timestamp,
    tags: updates.tags ?? feature.tags,
    metadata: updates.metadata
      ? { ...feature.metadata, ...updates.metadata }
      : feature.metadata,
  };

  validateFeature(updated);
  return updated;
}
```

### 2. Add to Types Index

Edit `packages/core/src/types/index.ts`:

```typescript
// Add export
export * from './feature.js';

// Add to ElementType union (if applicable)
export type ElementType =
  | 'task'
  | 'entity'
  | 'document'
  | 'message'
  | 'plan'
  | 'workflow'
  | 'channel'
  | 'library'
  | 'team'
  | 'playbook'
  | 'feature';  // Add here
```

### 3. Add Tests

Create `packages/core/src/types/feature.bun.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import {
  createFeature,
  isFeature,
  updateFeature,
  validateFeature,
  FeatureStatus,
  type CreateFeatureInput,
} from './feature.js';

describe('Feature', () => {
  const validInput: CreateFeatureInput = {
    title: 'User Authentication',
    createdBy: 'user-1' as any,
    priority: 2,
  };

  describe('createFeature', () => {
    it('creates a feature with required fields', () => {
      const feature = createFeature(validInput);

      expect(feature.type).toBe('feature');
      expect(feature.title).toBe('User Authentication');
      expect(feature.status).toBe(FeatureStatus.PROPOSED);
      expect(feature.priority).toBe(2);
      expect(feature.id).toBeDefined();
    });

    it('throws on missing title', () => {
      expect(() => createFeature({ ...validInput, title: '' })).toThrow();
    });

    it('uses default status and priority', () => {
      const feature = createFeature({
        title: 'Test',
        createdBy: 'user-1' as any,
      });

      expect(feature.status).toBe(FeatureStatus.PROPOSED);
      expect(feature.priority).toBe(3);
    });
  });

  describe('isFeature', () => {
    it('returns true for valid feature', () => {
      const feature = createFeature(validInput);
      expect(isFeature(feature)).toBe(true);
    });

    it('returns false for non-feature', () => {
      expect(isFeature({ type: 'task' })).toBe(false);
      expect(isFeature(null)).toBe(false);
      expect(isFeature({})).toBe(false);
    });
  });

  describe('updateFeature', () => {
    it('updates status', () => {
      const feature = createFeature(validInput);
      const updated = updateFeature(feature, { status: FeatureStatus.APPROVED });

      expect(updated.status).toBe(FeatureStatus.APPROVED);
      expect(updated.updatedAt).not.toBe(feature.updatedAt);
    });

    it('merges metadata', () => {
      const feature = createFeature({
        ...validInput,
        metadata: { key1: 'value1' },
      });

      const updated = updateFeature(feature, {
        metadata: { key2: 'value2' },
      });

      expect(updated.metadata).toEqual({ key1: 'value1', key2: 'value2' });
    });
  });
});
```

### 4. Update Storage Schema (if needed)

If the type needs special indexing, edit `packages/storage/src/schema.ts`:

```typescript
// Add index for feature queries
{
  version: 5,
  up: `
    CREATE INDEX IF NOT EXISTS idx_features_status ON elements(
      json_extract(data, '$.status')
    ) WHERE json_extract(data, '$.type') = 'feature';

    CREATE INDEX IF NOT EXISTS idx_features_owner ON elements(
      json_extract(data, '$.ownerId')
    ) WHERE json_extract(data, '$.type') = 'feature';
  `,
  down: `
    DROP INDEX IF EXISTS idx_features_status;
    DROP INDEX IF EXISTS idx_features_owner;
  `,
}
```

### 5. Add API Methods (if needed)

In `packages/quarry/src/api/quarry-api.ts`, add specific methods:

```typescript
/**
 * Gets features by status
 */
async getFeaturesByStatus(status: FeatureStatus): Promise<Feature[]> {
  return this.list({ type: 'feature', status }) as Promise<Feature[]>;
}

/**
 * Gets features owned by an entity
 */
async getFeaturesByOwner(ownerId: EntityId): Promise<Feature[]> {
  return this.list({ type: 'feature', ownerId }) as Promise<Feature[]>;
}

/**
 * Releases a feature
 */
async releaseFeature(featureId: FeatureId, actor: EntityId): Promise<Feature> {
  return this.update(featureId, {
    status: FeatureStatus.RELEASED,
    releasedAt: new Date().toISOString(),
  }) as Promise<Feature>;
}
```

### 6. Export from Package

Edit `packages/core/src/index.ts`:

```typescript
export * from './types/feature.js';
```

### 7. Run Tests

```bash
cd packages/core
bun test feature
```

## Checklist

- [ ] Type file created with all interfaces
- [ ] Status/priority constants defined
- [ ] Branded ID type created
- [ ] Type guard implemented (`isFeature`)
- [ ] Factory function implemented (`createFeature`)
- [ ] Validation function implemented (`validateFeature`)
- [ ] Update function implemented (`updateFeature`)
- [ ] Added to types/index.ts exports
- [ ] Added to ElementType union
- [ ] Tests written and passing
- [ ] Storage schema updated (if needed)
- [ ] API methods added (if needed)
- [ ] Exported from package index
