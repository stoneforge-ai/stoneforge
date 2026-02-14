# @stoneforge/shared-routes

Hono route factories for building Stoneforge-compatible HTTP servers.

[![npm](https://img.shields.io/npm/v/@stoneforge/shared-routes)](https://www.npmjs.com/package/@stoneforge/shared-routes)
[![license](https://img.shields.io/npm/l/@stoneforge/shared-routes)](https://github.com/stoneforge-ai/stoneforge/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/shared-routes` provides pre-built [Hono](https://hono.dev) route factories that expose the Stoneforge data model over HTTP. Each factory returns a Hono app instance that can be mounted at any path. The package also includes WebSocket utilities for real-time event broadcasting. Used by `quarry-server` and `smithy-server` to share API surface.

## Installation

```bash
npm install @stoneforge/shared-routes
```

Requires `hono` as a dependency (included).

## Quick Start

```typescript
import { Hono } from 'hono';
import {
  createElementsRoutes,
  createEntityRoutes,
  createChannelRoutes,
  createMessageRoutes,
} from '@stoneforge/shared-routes';

const app = new Hono();

// Mount route groups
app.route('/api/elements', createElementsRoutes(services));
app.route('/api/entities', createEntityRoutes(services));
app.route('/api/channels', createChannelRoutes(services));
app.route('/api/messages', createMessageRoutes(services));

export default app;
```

## Route Factories

| Factory | Endpoints |
|---------|-----------|
| `createElementsRoutes(services)` | CRUD for elements (tasks, documents, etc.) |
| `createEntityRoutes(services)` | Entity registration and lookup |
| `createChannelRoutes(services)` | Channel creation, membership, listing |
| `createMessageRoutes(services)` | Send and query messages |
| `createLibraryRoutes(services)` | Library and playbook management |
| `createDocumentRoutes(services)` | Document versioning and content |
| `createInboxRoutes(services)` | Per-entity notification inbox |
| `createPlanRoutes(services)` | Plan creation and status tracking |

All factories accept a `CollaborateServices` (or `CollaborateServicesWithBroadcast`) object that provides the backing `QuarryAPI` and optional broadcast function.

## WebSocket

```typescript
import { createWsBroadcaster, type WsEventHandler } from '@stoneforge/shared-routes';

const broadcast = createWsBroadcaster(wsConnections);
const services: CollaborateServicesWithBroadcast = { api, broadcast };
```

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
