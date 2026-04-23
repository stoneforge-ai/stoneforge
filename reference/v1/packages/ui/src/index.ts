/**
 * @stoneforge/ui
 *
 * Shared UI components, design tokens, and hooks for Stoneforge platform.
 *
 * Usage:
 * - Import components: import { Button, Dialog, Card } from '@stoneforge/ui'
 * - Import layout: import { AppShell, Sidebar, MobileDrawer } from '@stoneforge/ui'
 * - Import domain: import { TaskCard, EntityCard, TaskStatusBadge } from '@stoneforge/ui/domain'
 * - Import hooks: import { useTheme, useIsMobile, useWebSocket, useSSEStream } from '@stoneforge/ui'
 * - Import API clients: import { WebSocketClient, SSEClient, ApiClient } from '@stoneforge/ui/api'
 * - Import design tokens CSS: import '@stoneforge/ui/styles/tokens.css'
 */

// Components
export * from './components';

// Layout Components
export * from './layout';

// Domain Components (also available via '@stoneforge/ui/domain')
export * from './domain';

// Visualization Components (also available via '@stoneforge/ui/visualizations')
export * from './visualizations';

// Hooks
export * from './hooks';

// Contexts (also available via '@stoneforge/ui/contexts')
export * from './contexts';

// API Clients (also available via '@stoneforge/ui/api')
export * from './api';

// Plans Module (also available via '@stoneforge/ui/plans')
export * from './plans';

// Settings Module (also available via '@stoneforge/ui/settings')
export * from './settings';

// Documents Module (also available via '@stoneforge/ui/documents')
export * from './documents';

// Message Module (also available via '@stoneforge/ui/message')
export * from './message';

// Workflows Module (also available via '@stoneforge/ui/workflows')
export * from './workflows';

// Resolve export name conflicts introduced by workflows re-export:
// Domain types take precedence for TaskStatus, Workflow, WorkflowStatus (different definitions)
export type { TaskStatus, Workflow, WorkflowStatus } from './domain';
// Domain WorkflowCard component takes precedence (display-layer card)
export { WorkflowCard } from './domain';
// Plans components/utils take precedence for StatusBadge, StatusFilter, TaskStatusSummary, formatRelativeTime
export { StatusBadge, StatusFilter, TaskStatusSummary } from './plans';
export { formatRelativeTime } from './plans';
