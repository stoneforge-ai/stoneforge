/**
 * Router configuration for Orchestrator web app
 * Uses TanStack Router with typed routes
 */

import { createRouter, createRoute, createRootRoute, redirect, Outlet, useRouterState } from '@tanstack/react-router';
import { AppShell } from './components/layout';
import { ActivityPage } from './routes/activity';
import { TasksPage } from './routes/tasks';
import { PlansPage } from './routes/plans';
import { AgentsPage } from './routes/agents';
import { WorkspacesPage } from './routes/workspaces';
import { WorkflowsPage } from './routes/workflows';
import { MetricsPage } from './routes/metrics';
import { SettingsPage } from './routes/settings';
import { PopoutTerminalPage } from './routes/popout';
import { InboxPage } from './routes/inbox';
import { MessagesPage } from './routes/messages';
import { DocumentsPage } from './routes/documents';
import { MergeRequestsPage } from './routes/merge-requests';
import { FileEditorPage } from './routes/editor';

/**
 * Root layout component that conditionally renders AppShell or plain Outlet
 * based on whether we're in a popout route
 */
function RootLayout() {
  const { location } = useRouterState();
  const isPopout = location.pathname.startsWith('/popout');

  if (isPopout) {
    // Popout routes render without AppShell
    return <Outlet />;
  }

  // Main app routes render with AppShell
  return <AppShell />;
}

// Root route with conditional layout
const rootRoute = createRootRoute({
  component: RootLayout,
});

// Index route - redirect to activity (home page)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/activity' });
  },
});

// Activity route (home page)
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  component: ActivityPage,
});

// Tasks route
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
      status: typeof search.status === 'string' ? search.status : undefined,
      assignee: typeof search.assignee === 'string' ? search.assignee : undefined,
      showClosed: search.showClosed === true || search.showClosed === 'true' ? true : undefined,
      action: typeof search.action === 'string' ? search.action : undefined,
      backlog: search.backlog === true || search.backlog === 'true' ? true : undefined,
    };
  },
});

// Plans route
const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans',
  component: PlansPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      status: typeof search.status === 'string' ? search.status : undefined,
    };
  },
});

// Agents route
const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents',
  component: AgentsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      tab: typeof search.tab === 'string' ? search.tab : 'agents',
      role: typeof search.role === 'string' ? search.role : undefined,
    };
  },
});

// Workspaces route
const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces',
  component: WorkspacesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      layout: typeof search.layout === 'string' ? search.layout : 'single',
      agent: typeof search.agent === 'string' ? search.agent : undefined,
      resumeSessionId: typeof search.resumeSessionId === 'string' ? search.resumeSessionId : undefined,
      resumePrompt: typeof search.resumePrompt === 'string' ? search.resumePrompt : undefined,
    };
  },
});

// Workflows route
const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: WorkflowsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      tab: typeof search.tab === 'string' ? search.tab : 'templates',
      action: typeof search.action === 'string' ? search.action : undefined,
    };
  },
});

// Metrics route
const metricsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/metrics',
  component: MetricsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      range: typeof search.range === 'string' ? search.range : '7d',
    };
  },
});

// Settings route
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: typeof search.tab === 'string' ? search.tab : 'preferences',
    };
  },
});

// Inbox route
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  component: InboxPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      message: typeof search.message === 'string' ? search.message : undefined,
    };
  },
});

// Messages route
const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      channel: typeof search.channel === 'string' ? search.channel : undefined,
      message: typeof search.message === 'string' ? search.message : undefined,
    };
  },
});

// Documents route
const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents',
  component: DocumentsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      library: typeof search.library === 'string' ? search.library : undefined,
    };
  },
});

// Merge Requests route
const mergeRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merge-requests',
  component: MergeRequestsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      status: typeof search.status === 'string' ? search.status : undefined,
      showMerged: search.showMerged === true || search.showMerged === 'true' ? true : undefined,
    };
  },
});

// Editor route
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor',
  component: FileEditorPage,
});

// Popout routes - these render without AppShell via the RootLayout conditional
const popoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/popout',
});

const popoutTerminalRoute = createRoute({
  getParentRoute: () => popoutRoute,
  path: '/terminal',
  component: PopoutTerminalPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      agent: typeof search.agent === 'string' ? search.agent : undefined,
      type: typeof search.type === 'string' ? search.type as 'terminal' | 'stream' : 'terminal',
      // Additional params for "pop back in" functionality
      name: typeof search.name === 'string' ? search.name : undefined,
      role: typeof search.role === 'string' ? search.role : undefined,
      mode: typeof search.mode === 'string' ? search.mode : undefined,
    };
  },
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  activityRoute,
  tasksRoute,
  plansRoute,
  agentsRoute,
  workspacesRoute,
  workflowsRoute,
  metricsRoute,
  settingsRoute,
  inboxRoute,
  messagesRoute,
  documentsRoute,
  mergeRequestsRoute,
  editorRoute,
  popoutRoute.addChildren([
    popoutTerminalRoute,
  ]),
]);

// Create and export the router
export const router = createRouter({ routeTree });

// Type declaration for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
