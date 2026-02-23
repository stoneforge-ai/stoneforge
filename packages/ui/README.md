# @stoneforge/ui

React 19 component library, design tokens, real-time hooks, and API clients for the Stoneforge platform.

[![npm](https://img.shields.io/npm/v/@stoneforge/ui)](https://www.npmjs.com/package/@stoneforge/ui)
[![license](https://img.shields.io/npm/l/@stoneforge/ui)](https://github.com/stoneforge-ai/stoneforge/blob/master/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

## Overview

`@stoneforge/ui` provides everything needed to build Stoneforge front-ends: core UI primitives (buttons, cards, dialogs, forms), domain-specific components (task cards, entity cards, plan views), real-time communication hooks (WebSocket, SSE), keyboard shortcut management, and a full design token system with light/dark/high-contrast modes.

## Installation

```bash
npm install @stoneforge/ui
```

Peer dependencies:

```bash
npm install react react-dom @tanstack/react-query @tanstack/react-router
```

## Quick Start

```tsx
import '@stoneforge/ui/styles/tokens.css';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@stoneforge/ui';
import { useTheme, useWebSocket } from '@stoneforge/ui/hooks';

function App() {
  const { isDark, toggleDarkMode } = useTheme();
  const { connectionState } = useWebSocket({
    url: 'ws://localhost:3456/ws',
    channels: ['tasks'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Connection: {connectionState}</p>
        <Button variant="primary" onClick={toggleDarkMode}>
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

## Components

### Core UI

- **Button** — Variants: `primary`, `secondary`, `ghost`, `danger`, `outline`
- **Card** — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- **Dialog** — `Dialog`, `DialogContent`, `DialogHeader`, `DialogBody`, `DialogFooter`, `DialogTitle`, `DialogDescription`
- **Form** — `Input`, `Textarea`, `Label`
- **Select** — `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`
- **Badge** — Status and category labels with color variants
- **Tooltip** — Hover tooltips with keyboard shortcut display
- **TagInput** — Multi-tag input field
- **ThemeToggle** — Light/dark mode toggle

### Skeleton Loading

`Skeleton`, `SkeletonText`, `SkeletonAvatar`, `SkeletonCard`, `SkeletonTaskCard`, `SkeletonList`, `SkeletonStatCard`, `SkeletonPage`, `SkeletonMessageBubble`, `SkeletonDocumentCard`, `SkeletonEntityCard`

### Layout

- **AppShell** — Main layout wrapper with sidebar state
- **Sidebar** — Configurable navigation sidebar
- **MobileDrawer** — Slide-out mobile navigation
- **Header** — Application header with breadcrumbs and connection status
- **ResponsiveModal** — Adaptive modal for desktop/mobile

### Domain Components

- **Cards** — `TaskCard`, `EntityCard`, `PlanCard`, `WorkflowCard`, `TeamCard`, `MobileEntityCard`
- **Badges** — `TaskStatusBadge`, `TaskPriorityBadge`, `TaskTypeBadge`, `MergeStatusBadge`
- **EntityLink** — Entity link with hover preview
- **UserSelector** — User selection component
- **ChannelHeader** — Channel header with icon and search

## Hooks

### Theme & Responsive

| Hook | Description |
|------|-------------|
| `useTheme` | Theme management (light/dark/system, high-contrast) |
| `useBreakpoint` | Current responsive breakpoint |
| `useIsMobile` / `useIsTablet` / `useIsDesktop` | Boolean breakpoint checks |
| `useMediaQuery` | Custom media query matching |
| `useWindowSize` | Window dimensions tracking |

### Real-time Communication

| Hook | Description |
|------|-------------|
| `useWebSocket` | WebSocket with auto-reconnect and channel subscriptions |
| `useSSEStream` | Server-Sent Events streaming with event history |
| `useRealtimeEvents` | WebSocket events with React Query cache invalidation |
| `useWebSocketState` | Connection state from existing WebSocket client |
| `useSSEState` | Connection state from existing SSE client |

### Keyboard Shortcuts

| Hook | Description |
|------|-------------|
| `useKeyboardShortcut` | Register individual shortcuts |
| `useGlobalKeyboardShortcuts` | Global navigation shortcuts |
| `useDisableKeyboardShortcuts` | Temporarily disable shortcuts (e.g., in modals) |

## API Clients

```typescript
import { WebSocketClient, SSEClient, ApiClient } from '@stoneforge/ui/api';
```

| Client | Description |
|--------|-------------|
| `WebSocketClient` | Auto-reconnect, channel subscriptions, ping/heartbeat |
| `SSEClient` | Server-Sent Events with reconnection and typed listeners |
| `ApiClient` | HTTP REST client with interceptors, typed responses, error handling |

## Design Tokens

Import the CSS custom properties in your app entry point:

```css
@import '@stoneforge/ui/styles/tokens.css';
```

Provides variables for colors (with light/dark/high-contrast), typography, spacing (4px grid), border radius, shadows, transitions, z-index layers, and responsive breakpoints.

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/ui` | All components, hooks, and utilities |
| `@stoneforge/ui/components` | Core UI primitives |
| `@stoneforge/ui/layout` | AppShell, Sidebar, Header, etc. |
| `@stoneforge/ui/domain` | Domain-specific cards, badges, entity components |
| `@stoneforge/ui/hooks` | Theme, responsive, real-time, keyboard hooks |
| `@stoneforge/ui/visualizations` | Charts and data visualization components |
| `@stoneforge/ui/api` | WebSocketClient, SSEClient, ApiClient |
| `@stoneforge/ui/contexts` | React context providers |
| `@stoneforge/ui/plans` | Plan-related components |
| `@stoneforge/ui/settings` | Settings components |
| `@stoneforge/ui/workflows` | Workflow components |
| `@stoneforge/ui/documents` | Document components |
| `@stoneforge/ui/message` | Message components |
| `@stoneforge/ui/styles/tokens.css` | Design token CSS custom properties |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
