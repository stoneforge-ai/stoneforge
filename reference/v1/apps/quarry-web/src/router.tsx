import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { AppShell } from './components/layout';
import { DashboardPage } from './routes/dashboard';
import { TasksPage } from './routes/tasks';
import { DependencyGraphPage } from './routes/dependency-graph';
import { TimelinePage } from './routes/timeline';
import { MessagesPage } from './routes/messages';
import { DocumentsPage } from './routes/documents';
import { PlansPage } from './routes/plans';
import { WorkflowsPage } from './routes/workflows';
import { EntitiesPage } from './routes/entities';
import { TeamsPage } from './routes/teams';
import { SettingsPage, getDefaultDashboardLens, getLastVisitedDashboardSection } from './routes/settings';
import { InboxPage } from './routes/inbox';

// Map dashboard lens settings to routes
// Note: 'task-flow' lens now redirects to /tasks (kanban view has task-flow columns)
const DASHBOARD_LENS_ROUTES: Record<ReturnType<typeof getDefaultDashboardLens>, string> = {
  'overview': '/dashboard/overview',
  'task-flow': '/tasks',
  'dependencies': '/dependencies',
  'timeline': '/dashboard/timeline',
};

// Root route with the AppShell layout
const rootRoute = createRootRoute({
  component: AppShell,
});

// Index route - redirect to user's preferred dashboard lens
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const defaultLens = getDefaultDashboardLens();
    const targetRoute = DASHBOARD_LENS_ROUTES[defaultLens] || '/dashboard';
    throw redirect({ to: targetRoute });
  },
});

// Dashboard index redirect - redirects /dashboard to last-visited lens or /dashboard/overview
const dashboardIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: () => {
    const lastVisited = getLastVisitedDashboardSection();
    const targetRoute = DASHBOARD_LENS_ROUTES[lastVisited] || '/dashboard/overview';
    throw redirect({ to: targetRoute });
  },
});

// Dashboard Overview route
const dashboardOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/overview',
  component: DashboardPage,
});

// Tasks route with pagination URL sync
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string; page: number; limit: number; readyOnly?: boolean; assignee?: string } => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
      readyOnly: search.readyOnly === true || search.readyOnly === 'true',
      assignee: typeof search.assignee === 'string' ? search.assignee : undefined,
    };
  },
});

// Legacy task-flow route - redirects to /tasks (kanban has task flow columns now)
const taskFlowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/task-flow',
  beforeLoad: () => {
    throw redirect({ to: '/tasks', search: { page: 1, limit: 25 } });
  },
});

// Dependency Graph route (Work section)
const dependencyGraphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dependencies',
  component: DependencyGraphPage,
});

// Timeline Lens route (Dashboard sub-view)
const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/timeline',
  component: TimelinePage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 100 : 100,
      // TB109: Support actor filter for "View all activity" from EntityDetailPanel
      actor: typeof search.actor === 'string' ? search.actor : undefined,
      // TB117: Support brush selection time range for shareability
      startTime: typeof search.startTime === 'number' ? search.startTime :
                 typeof search.startTime === 'string' ? parseInt(search.startTime, 10) || undefined : undefined,
      endTime: typeof search.endTime === 'number' ? search.endTime :
               typeof search.endTime === 'string' ? parseInt(search.endTime, 10) || undefined : undefined,
    };
  },
});

const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans',
  component: PlansPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string; status?: string } => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      status: typeof search.status === 'string' ? search.status : undefined,
    };
  },
});

const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: WorkflowsPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string; tab?: string; action?: string } => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      tab: typeof search.tab === 'string' ? search.tab : undefined,
      action: typeof search.action === 'string' ? search.action : undefined,
    };
  },
});

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

const entitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entities',
  component: EntitiesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      name: typeof search.name === 'string' ? search.name : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
    };
  },
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: TeamsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
    };
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

// Inbox route (TB137)
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

// Build the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardIndexRoute,
  dashboardOverviewRoute,
  taskFlowRoute,
  dependencyGraphRoute,
  timelineRoute,
  tasksRoute,
  plansRoute,
  workflowsRoute,
  messagesRoute,
  documentsRoute,
  entitiesRoute,
  teamsRoute,
  settingsRoute,
  inboxRoute,
]);

// Create and export the router
export const router = createRouter({ routeTree });

// Type declaration for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
