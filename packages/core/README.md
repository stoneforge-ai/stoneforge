# @stoneforge/core

Shared type definitions, branded IDs, error hierarchy, and utilities for the Stoneforge platform.

[![npm](https://img.shields.io/npm/v/@stoneforge/core)](https://www.npmjs.com/package/@stoneforge/core)
[![license](https://img.shields.io/npm/l/@stoneforge/core)](https://github.com/stoneforge-ai/stoneforge/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@stoneforge/core)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/core` is the foundation layer for every Stoneforge package. It defines the canonical types for elements (tasks, entities, documents, plans, workflows, channels, messages), a structured error hierarchy with factory functions, a collision-resistant hierarchical ID system, and mention-parsing utilities.

## Installation

```bash
npm install @stoneforge/core
```

## Quick Start

```typescript
import { generateId, generateChildId, parseId } from '@stoneforge/core/id';
import type { Task, Entity } from '@stoneforge/core/types';
import { notFound, invalidInput } from '@stoneforge/core/errors';

// Generate a root ID
const taskId = generateId({ type: 'task', title: 'Implement auth' });

// Generate a child ID scoped to a parent
const subtaskId = generateChildId(taskId, { type: 'task', title: 'Add login form' });

// Parse an ID back into its components
const { root, depth } = parseId(subtaskId);

// Throw structured errors with factory functions
throw notFound('task', taskId);
throw invalidInput('title', 'Title is required');
```

## API

### Types

Core domain types used across all Stoneforge packages:

| Type | Description |
|------|-------------|
| `Element` | Base type for all stored objects |
| `Task` | Work item with status, priority, assignments |
| `Entity` | Actor in the system (human or agent) |
| `Document` | Versioned content with content type |
| `Plan` | Collection of related tasks with status tracking |
| `Workflow` | Multi-step process with triggers |
| `Channel` | Communication channel (direct, group) |
| `Message` | Message within a channel |
| `Team` | Named group of entities with roles |
| `Library` | Collection of related documents |
| `Playbook` | Templated multi-step process definition |
| `Inbox` | Notification items for entities |
| `Dependency` | Blocking relationship between elements |
| `Event` | Immutable record of a state change |

### Errors

Structured error hierarchy with typed error codes:

```typescript
import {
  StoneforgeError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ConstraintError,
  StorageError,
  IdentityError,
} from '@stoneforge/core/errors';

// Factory functions for common errors
import {
  notFound,
  entityNotFound,
  invalidInput,
  alreadyExists,
} from '@stoneforge/core/errors';
```

### ID System

Collision-resistant, hierarchical, human-readable IDs:

| Export | Description |
|--------|-------------|
| `generateId(input)` | Create a root ID from type + title |
| `generateChildId(parentId, input)` | Create a scoped child ID |
| `generateIdHash(input)` | Raw hash without prefix |
| `parseId(id)` | Extract root, depth, components |
| `getIdRoot(id)` | Get the root segment |
| `getIdParent(id)` | Get the parent ID |
| `getIdDepth(id)` | Get nesting depth |
| `isValidIdFormat(id)` | Validate ID format |
| `isValidRootId(id)` | Check if root-level ID |
| `isValidHierarchicalId(id)` | Check if hierarchical ID |

### Utilities

```typescript
import { parseMentions, extractMentionedNames, hasMentions } from '@stoneforge/core/utils';

const mentions = parseMentions('Assign to @alice and @bob');
// [{ name: 'alice', ... }, { name: 'bob', ... }]
```

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/core` | Everything (re-exports all subpaths) |
| `@stoneforge/core/types` | Type definitions only |
| `@stoneforge/core/errors` | Error classes and factory functions |
| `@stoneforge/core/id` | ID generation, parsing, validation |
| `@stoneforge/core/utils` | Mention parsing utilities |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
