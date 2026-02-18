# Core Types Reference

All types exported from `@stoneforge/core` (`packages/core/src/types/`).

## Element (Base Type)

**File:** `types/element.ts`

All elements share these properties:

```typescript
interface Element {
  id: ElementId;           // Hash-based unique identifier
  type: ElementType;       // Discriminator: 'task', 'entity', 'document', etc.
  createdAt: Timestamp;    // ISO 8601
  updatedAt: Timestamp;    // ISO 8601
  createdBy: EntityId;     // Reference to creator entity
  tags: string[];          // Categorization
  metadata: Record<string, unknown>;  // Arbitrary JSON (64KB limit)
  deletedAt?: Timestamp;   // ISO 8601 soft-delete timestamp, undefined if active
}
```

**Key functions:**
- `isElement(value)` - Type guard
- `generateId(input)` - Generate hash-based ID

---

## Task

**File:** `types/task.ts`

```typescript
interface Task extends Element {
  type: 'task';
  title: string;
  descriptionRef?: DocumentId;
  acceptanceCriteria?: string;
  status: TaskStatus;
  priority: Priority;          // 1 (critical) to 5 (minimal)
  complexity: Complexity;      // 1 (simplest) to 5 (most complex)
  taskType: TaskTypeValue;
  closeReason?: string;
  assignee?: EntityId;
  owner?: EntityId;
  deadline?: Timestamp;
  scheduledFor?: Timestamp;
  closedAt?: Timestamp;
  deletedAt?: Timestamp;
  deletedBy?: EntityId;
  deleteReason?: string;
  externalRef?: string;
}

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'backlog' | 'review' | 'closed' | 'tombstone';
const TaskTypeValue = { BUG: 'bug', FEATURE: 'feature', TASK: 'task', CHORE: 'chore' } as const;
type TaskTypeValue = (typeof TaskTypeValue)[keyof typeof TaskTypeValue];
type Priority = 1 | 2 | 3 | 4 | 5;
type Complexity = 1 | 2 | 3 | 4 | 5;
```

**Key functions:**
- `createTask(input)` - Factory
- `updateTaskStatus(task, newStatus)` - Validated status transition
- `isTask(element)` - Type guard

**Status transitions:**
- `open` → `in_progress`, `blocked`, `deferred`, `backlog`, `closed`
- `in_progress` → `open`, `blocked`, `deferred`, `review`, `closed`
- `blocked` → `open`, `in_progress`, `deferred`, `closed` (can also be set via direct transition or computed automatically from dependencies)
- `deferred` → `open`, `in_progress`, `backlog`
- `backlog` → `open`, `deferred`, `closed`
- `review` → `closed`, `in_progress` (merge completes or reopen for fixes)
- `closed` → only `open` (cannot go to in_progress, blocked, or deferred)
- `tombstone` is terminal

**Note:** `deletedAt` is also defined on Element (soft-delete support). Task re-declares it along with `deletedBy` and `deleteReason` for explicit soft-delete handling.

---

## Entity

**File:** `types/entity.ts`

```typescript
interface Entity extends Element {
  type: 'entity';
  name: string;              // Unique, case-sensitive
  entityType: EntityTypeValue;
  reportsTo?: EntityId;      // Reports to
  publicKey?: string;        // Ed25519 public key (for crypto mode)
}

const EntityTypeValue = { AGENT: 'agent', HUMAN: 'human', SYSTEM: 'system' } as const;
type EntityTypeValue = (typeof EntityTypeValue)[keyof typeof EntityTypeValue];
```

**Key functions:**
- `createEntity(input)` - Factory
- `isEntity(element)` - Type guard
- `validateEntity(entity)` - Validation

**Constraints:**
- Names must start with letter: `/^[a-zA-Z][a-zA-Z0-9_-]*$/`
- Reserved names (case-insensitive): `system`, `anonymous`, `unknown`

---

## Message

**File:** `types/message.ts`

```typescript
interface Message extends Element {
  type: 'message';
  sender: EntityId;
  channelId: ChannelId;      // Required (mutable for channel merge operations)
  threadId: MessageId | null; // null for non-threaded messages
  contentRef: DocumentId;    // Reference to content Document
  attachments: readonly DocumentId[];  // Attachment Documents
}
```

**Key functions:**
- `createMessage(input)` - Factory
- `isMessage(element)` - Type guard

**Constraints:**
- Messages are **immutable** after creation (except `channelId`)
- Content is stored as Document reference, not inline text
- Both `channelId` and `threadId` are always present (`threadId` is `null` for non-threaded messages)
- `channelId` is mutable (not readonly) to support channel merge operations

---

## Document

**File:** `types/document.ts`

```typescript
interface Document extends Element {
  type: 'document';
  title?: string;                       // Optional display title
  contentType: ContentType;
  content: string;
  version: number;                      // Starts at 1
  previousVersionId: DocumentId | null; // null for version 1
  category: DocumentCategory;           // Defaults to 'other'
  status: DocumentStatus;               // Defaults to 'active'
  immutable: boolean;                   // Defaults to false
}

type ContentType = 'text' | 'markdown' | 'json';

type DocumentCategory =
  | 'spec' | 'prd' | 'decision-log' | 'changelog'
  | 'tutorial' | 'how-to' | 'explanation' | 'reference'
  | 'runbook' | 'meeting-notes' | 'post-mortem'
  | 'task-description'   // System-managed
  | 'message-content'    // System-managed
  | 'other';             // Default

type DocumentStatus = 'active' | 'archived';
```

**Document links:** Bidirectional references between documents use the dependency system with `type: 'references'`. See `/api/documents/:id/links` endpoints.

**Task attachments:** Tasks attach documents using the same dependency mechanism. See `/api/tasks/:id/attachments` endpoints.

**Key functions:**
- `createDocument(input)` - Factory
- `isDocument(element)` - Type guard
- `validateJsonContent(content)` - JSON validation

**Constraints:**
- Content size limited to 10MB (UTF-8 bytes)
- Version history preserved in `document_versions` table
- `category` and `status` are required fields (defaults applied at creation)
- `task-description` and `message-content` are system-managed categories (set automatically)
- Archived documents (`status: 'archived'`) are hidden from default list/search results
- When `immutable` is true, `updateDocumentContent()` rejects content updates (throws `ConstraintError` with `IMMUTABLE` code)
- Documents with `message-content` category are automatically set to `immutable: true`
- For backward compatibility, a missing `immutable` field is treated as `false`

---

## Dependency

**File:** `types/dependency.ts`

```typescript
interface Dependency {
  blockedId: ElementId;
  blockerId: ElementId;
  type: DependencyType;
  createdAt: Timestamp;
  createdBy: EntityId;
  metadata: Record<string, unknown>;
}

type DependencyType =
  | 'blocks'       // blockedId waits for blockerId
  | 'parent-child' // blockedId (child) → blockerId (parent)
  | 'awaits'       // blockedId (waiter) → blockerId (gate)
  | 'relates-to'   // Bidirectional association
  | 'references'   // Citation
  | 'supersedes'   // Replacement
  | 'duplicates'   // Duplicate of
  | 'caused-by'    // Causal link
  | 'validates'    // Validates another element
  | 'replies-to'   // Message threading
  | 'mentions'     // @mention reference
  | 'authored-by'  // Author attribution
  | 'assigned-to'  // Assignment
  | 'approved-by'; // Approval attribution
```

**Blocking types:** `blocks`, `awaits`, `parent-child`
- Only these trigger `blocked` status

**Direction semantics:**
| Type | Who waits |
|------|-----------|
| `blocks` | **blockedId** waits for blockerId |
| `parent-child` | **blockedId** (child) waits for blockerId (parent) |
| `awaits` | **blockedId** (waiter) waits for blockerId (gate) |
| `relates-to` | Neither (associative) |

**Gate metadata (for `awaits`):**

`AwaitsMetadata` is a discriminated union based on `gateType` (required):

```typescript
interface AwaitsMetadataBase {
  gateType: GateType;  // Required, not optional
}

interface TimerGateMetadata extends AwaitsMetadataBase {
  gateType: 'timer';
  waitUntil: Timestamp;  // Required
}

interface ApprovalGateMetadata extends AwaitsMetadataBase {
  gateType: 'approval';
  requiredApprovers: EntityId[];  // Required, min 1
  currentApprovers?: EntityId[];
  approvalCount?: number;
}

interface ExternalGateMetadata extends AwaitsMetadataBase {
  gateType: 'external';
  externalSystem: string;  // Required
  externalId: string;      // Required
  satisfied?: boolean;
  satisfiedAt?: Timestamp;
  satisfiedBy?: EntityId;
}

interface WebhookGateMetadata extends AwaitsMetadataBase {
  gateType: 'webhook';
  webhookUrl?: string;
  callbackId?: string;
  satisfied?: boolean;
  satisfiedAt?: Timestamp;
  satisfiedBy?: EntityId;
}

type AwaitsMetadata =
  | TimerGateMetadata
  | ApprovalGateMetadata
  | ExternalGateMetadata
  | WebhookGateMetadata;
```

---

## Collections

### Plan

**File:** `types/plan.ts`

```typescript
interface Plan extends Element {
  type: 'plan';
  title: string;
  descriptionRef?: DocumentId;
  status: PlanStatus;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelReason?: string;
}

type PlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';
```

Contains tasks via `parent-child` dependencies. **Tasks in a plan are NOT blocked by plan status.**

### Workflow

**File:** `types/workflow.ts`

```typescript
interface Workflow extends Element {
  type: 'workflow';
  title: string;
  descriptionRef?: DocumentId;
  status: WorkflowStatus;
  playbookId?: PlaybookId;
  ephemeral: boolean;               // Required, not optional
  variables: Record<string, unknown>;
  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  failureReason?: string;
  cancelReason?: string;
}

type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
```

**Related files:**
- `types/workflow-ops.ts` - Ephemeral workflow operations
- `types/workflow-create.ts` - Instantiate from playbook

### Channel

**File:** `types/channel.ts`

```typescript
interface Channel extends Element {
  type: 'channel';
  name: string;
  description: string | null;
  channelType: ChannelType;
  members: EntityId[];
  permissions: ChannelPermissions;
}

interface ChannelPermissions {
  visibility: 'public' | 'private';
  joinPolicy: 'open' | 'invite-only' | 'request';
  modifyMembers: EntityId[];
}

type ChannelType = 'direct' | 'group';
```

**Direct channels:** Names are deterministic `entityA:entityB` (sorted alphabetically, no brackets).

**Note:** Channel uses a plain `description` string rather than a `descriptionRef` Document reference (as used by Task, Plan, and Library). As a result, `HydratedChannel` is simply a type alias for `Channel` since the description no longer requires hydration.

### Library

**File:** `types/library.ts`

```typescript
interface Library extends Element {
  type: 'library';
  name: string;
  descriptionRef?: DocumentId;
}
```

Contains documents and sub-libraries via `parent-child` dependencies:
- **Document membership:** Document is child (`blockedId`), Library is parent (`blockerId`)
- **Library nesting:** Sub-library is child (`blockedId`), parent library is parent (`blockerId`)
- Circular nesting is prevented at the API level

### Team

**File:** `types/team.ts`

```typescript
interface Team extends Element {
  type: 'team';
  name: string;
  members: EntityId[];
  descriptionRef?: DocumentId;
  status?: TeamStatus;
  deletedAt?: Timestamp;
  deletedBy?: EntityId;
  deleteReason?: string;
}

type TeamStatus = 'active' | 'tombstone';
```

### Playbook

**File:** `types/playbook.ts`

```typescript
interface Playbook extends Element {
  type: 'playbook';
  name: string;
  title: string;
  descriptionRef?: DocumentId;
  version: number;
  steps: PlaybookStep[];
  variables: PlaybookVariable[];
  extends?: string[];        // Parent playbook names
}
```

**Variable substitution:** `{{varName}}` pattern.

---

## Inbox

**File:** `types/inbox.ts`

```typescript
interface InboxItem {
  id: string;
  recipientId: EntityId;
  messageId: MessageId;
  channelId: ChannelId;
  status: InboxStatus;
  sourceType: InboxSourceType;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

type InboxStatus = 'unread' | 'read' | 'archived';
type InboxSourceType = 'direct' | 'mention' | 'thread_reply';
```

**Note:** `readAt` is null if archived without reading.

---

## Event

**File:** `types/event.ts`

```typescript
interface Event {
  id: number;                                      // Auto-incrementing integer
  elementId: ElementId;
  eventType: EventType;
  actor: EntityId;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: Timestamp;
}

type EventType =
  | 'created' | 'updated' | 'closed' | 'reopened' | 'deleted'
  | 'dependency_added' | 'dependency_removed'
  | 'tag_added' | 'tag_removed'
  | 'member_added' | 'member_removed'
  | 'comment_added' | 'comment_updated' | 'comment_deleted'
  | 'comment_resolved' | 'comment_unresolved'
  | 'auto_blocked' | 'auto_unblocked';
```

Events are stored for audit trail. Auto-generated events use actor `'system:blocked-cache'`.

---

## ID Types (Branded)

```typescript
// Uses unique symbol branding pattern
declare const ElementIdBrand: unique symbol;
type ElementId = string & { readonly [ElementIdBrand]: typeof ElementIdBrand };

declare const EntityIdBrand: unique symbol;
type EntityId = string & { readonly [EntityIdBrand]: typeof EntityIdBrand };

declare const DocumentIdBrand: unique symbol;
type DocumentId = ElementId & { readonly [DocumentIdBrand]: typeof DocumentIdBrand };

declare const MessageIdBrand: unique symbol;
type MessageId = ElementId & { readonly [MessageIdBrand]: typeof MessageIdBrand };

declare const ChannelIdBrand: unique symbol;
type ChannelId = ElementId & { readonly [ChannelIdBrand]: typeof ChannelIdBrand };

declare const WorkflowIdBrand: unique symbol;
type WorkflowId = ElementId & { readonly [WorkflowIdBrand]: typeof WorkflowIdBrand };

declare const TeamIdBrand: unique symbol;
type TeamId = ElementId & { readonly [TeamIdBrand]: typeof TeamIdBrand };

declare const LibraryIdBrand: unique symbol;
type LibraryId = ElementId & { readonly [LibraryIdBrand]: typeof LibraryIdBrand };

declare const PlaybookIdBrand: unique symbol;
type PlaybookId = ElementId & { readonly [PlaybookIdBrand]: typeof PlaybookIdBrand };
```

**Warning:** Using wrong ID type may cause runtime issues even though TypeScript allows it.

### Cast Utilities

Utility functions for casting strings to branded ID types at trust boundaries:

```typescript
import { asEntityId, asElementId } from '@stoneforge/core';

// At trust boundaries (API responses, database rows, config values)
const entityId = asEntityId('ent-abc123');
const elementId = asElementId('el-xyz789');
```

These replace the verbose `x as unknown as EntityId` double-cast pattern. Use only at trust boundaries where the string value is known to be a valid ID.

---

## Error Types

**File:** `errors/codes.ts`

```typescript
// Categorized const objects (NOT a single enum)
const ValidationErrorCode = {
  INVALID_INPUT, INVALID_ID, INVALID_STATUS, TITLE_TOO_LONG,
  INVALID_CONTENT_TYPE, INVALID_JSON, MISSING_REQUIRED_FIELD,
  INVALID_TAG, INVALID_TIMESTAMP, INVALID_METADATA,
  INVALID_CATEGORY, INVALID_DOCUMENT_STATUS,
} as const;

const NotFoundErrorCode = {
  NOT_FOUND, ENTITY_NOT_FOUND, DOCUMENT_NOT_FOUND,
  CHANNEL_NOT_FOUND, PLAYBOOK_NOT_FOUND, DEPENDENCY_NOT_FOUND,
} as const;

const ConflictErrorCode = {
  ALREADY_EXISTS, DUPLICATE_NAME, CYCLE_DETECTED,
  SYNC_CONFLICT, DUPLICATE_DEPENDENCY, CONCURRENT_MODIFICATION,
} as const;

const ConstraintErrorCode = {
  IMMUTABLE, HAS_DEPENDENTS, INVALID_PARENT,
  MAX_DEPTH_EXCEEDED, MEMBER_REQUIRED, TYPE_MISMATCH, ALREADY_IN_PLAN,
} as const;

const StorageErrorCode = {
  DATABASE_ERROR, DATABASE_BUSY, EXPORT_FAILED, IMPORT_FAILED, MIGRATION_FAILED,
} as const;

const IdentityErrorCode = {
  INVALID_SIGNATURE, SIGNATURE_VERIFICATION_FAILED, SIGNATURE_EXPIRED,
  INVALID_PUBLIC_KEY, ACTOR_NOT_FOUND, SIGNATURE_REQUIRED, NO_PUBLIC_KEY,
} as const;

const ErrorCode = {
  ...ValidationErrorCode,
  ...NotFoundErrorCode,
  ...ConflictErrorCode,
  ...ConstraintErrorCode,
  ...StorageErrorCode,
  ...IdentityErrorCode,
} as const;
```

**Error classes:**
- `StoneforgeError` - Base class (has `code`, `details`, `httpStatus`)
- `ValidationError` - Input validation failures
- `NotFoundError` - Element/entity not found
- `ConflictError` - Duplicate or cycle conflicts
- `ConstraintError` - Immutability, dependency, and structural constraints
- `StorageError` - Database errors
- `IdentityError` - Authentication/signature errors
