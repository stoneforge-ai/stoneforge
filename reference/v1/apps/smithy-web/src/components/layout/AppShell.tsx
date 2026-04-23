/**
 * AppShell - Main layout wrapper for Orchestrator web app
 * Three-column layout: Sidebar | Main Content | Director Panel
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Outlet, useRouterState, Link, useRouter } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { MobileDrawer, UserSelector } from '@stoneforge/ui';
import { DirectorPanel } from './DirectorPanel';
import { DaemonToggle } from './DaemonToggle';
import { RateLimitBanner } from './RateLimitBanner';
import { StopAllAgentsButton } from './StopAllAgentsButton';
import { ThemeToggle } from '@stoneforge/ui';
import { NotificationCenter, NotificationSidebar } from '../notification';
import { CommandPalette, useCommandPalette, QuickFileOpen, useQuickFileOpen, FileContentSearch, useFileContentSearchShortcut } from '../command';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '../../api/hooks/useNotifications';
import { usePendingApprovalCount, useApprovalRequestWatcher } from '../../api/hooks/useApprovalRequests';
import { useGlobalKeyboardShortcuts, useOnboardingTour } from '../../hooks';
import { useContainerWidthObserver, ContainerWidthProvider } from '../../hooks/useContainerBreakpoint';
import { BREAKPOINTS, useWindowSize } from '../../hooks/useBreakpoint';
import { toast } from 'sonner';
import {
  OnboardingTour,
  type TourStep,
  injectTourMockData,
  clearTourMockData,
  hasTourMockData,
  addExampleWorkflowSteps,
} from '../onboarding';
import { useWorkflowPreset } from '../../api/hooks/useWorkflowPreset';
import { useDirector, useChangeAgentProvider } from '../../api/hooks/useAgents';
import { useProviderCheck } from '../../hooks/useProviderCheck';
import { ProviderInstallModal } from '../provider/ProviderInstallModal';
import {
  ChevronRight,
  Activity,
  CheckSquare,
  Users,
  LayoutGrid,
  Workflow,
  BarChart3,
  Settings,
  Menu,
  Search,
  Command,
  Inbox,
  MessageSquare,
  FileText,
  FileCode,
  ClipboardList,
  GitMerge,
} from 'lucide-react';

// Health check hook
interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000,
  });
}

// Connection status indicator
function ConnectionStatus({ health }: { health: ReturnType<typeof useHealth> }) {
  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-text-tertiary)] animate-pulse" />
        <span className="text-sm">Connecting...</span>
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-danger-text)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
        <span className="text-sm font-medium">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[var(--color-success-text)]">
      <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
      <span className="text-sm font-medium">Connected</span>
    </div>
  );
}

// Route metadata for breadcrumbs
interface RouteConfig {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  parent?: string;
}

const ROUTE_CONFIG: Record<string, RouteConfig> = {
  '/activity': { label: 'Activity', icon: Activity },
  '/tasks': { label: 'Tasks', icon: CheckSquare },
  '/merge-requests': { label: 'Merge Requests', icon: GitMerge },
  '/plans': { label: 'Plans', icon: ClipboardList },
  '/agents': { label: 'Agents', icon: Users },
  '/workspaces': { label: 'Workspaces', icon: LayoutGrid },
  '/workflows': { label: 'Workflows', icon: Workflow },
  '/metrics': { label: 'Metrics', icon: BarChart3 },
  '/settings': { label: 'Settings', icon: Settings },
  // Collaborate section
  '/inbox': { label: 'Inbox', icon: Inbox },
  '/messages': { label: 'Messages', icon: MessageSquare },
  '/documents': { label: 'Documents', icon: FileText },
  '/editor': { label: 'Editor', icon: FileCode },
};

interface BreadcrumbItem {
  label: string;
  path: string;
  icon?: React.ComponentType<{ className?: string }>;
  isLast: boolean;
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return useMemo(() => {
    const breadcrumbs: BreadcrumbItem[] = [];
    let path = currentPath;

    // Build breadcrumb chain from current path
    const pathsToResolve: string[] = [];
    while (path) {
      const config = ROUTE_CONFIG[path];
      if (config) {
        pathsToResolve.unshift(path);
        path = config.parent || '';
      } else {
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 1) {
          path = '/' + segments.slice(0, -1).join('/');
        } else {
          break;
        }
      }
    }

    // Create breadcrumb items
    pathsToResolve.forEach((p, index) => {
      const config = ROUTE_CONFIG[p];
      if (config) {
        breadcrumbs.push({
          label: config.label,
          path: p,
          icon: config.icon,
          isLast: index === pathsToResolve.length - 1,
        });
      }
    });

    return breadcrumbs;
  }, [currentPath]);
}

function Breadcrumbs() {
  const breadcrumbs = useBreadcrumbs();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs">
      <ol className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => {
          const Icon = crumb.icon;
          return (
            <li key={crumb.path} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 mx-1 text-[var(--color-text-muted)]" />
              )}
              {crumb.isLast ? (
                <span
                  className="flex items-center gap-1.5 px-2 py-1 font-normal text-[var(--color-text)] rounded-md"
                  data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="flex items-center gap-1.5 px-2 py-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors duration-150"
                  data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BreadcrumbsMobile() {
  const breadcrumbs = useBreadcrumbs();
  const lastCrumb = breadcrumbs[breadcrumbs.length - 1];

  if (!lastCrumb) {
    return null;
  }

  const Icon = lastCrumb.icon;

  return (
    <div
      className="flex items-center justify-center gap-1.5 text-sm font-normal text-[var(--color-text)]"
      data-testid="breadcrumbs-mobile"
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span className="truncate max-w-[150px]">{lastCrumb.label}</span>
    </div>
  );
}

// Local storage keys
const SIDEBAR_COLLAPSED_KEY = 'orchestrator-sidebar-collapsed';
const DIRECTOR_COLLAPSED_KEY = 'orchestrator-director-collapsed';
const DIRECTOR_MAXIMIZED_KEY = 'orchestrator-director-maximized';

function useSidebarState() {
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(desktopCollapsed));
  }, [desktopCollapsed]);

  return {
    desktopCollapsed,
    setDesktopCollapsed,
    mobileDrawerOpen,
    setMobileDrawerOpen,
  };
}

function useDirectorPanelState() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    // Default to collapsed on initial load
    const stored = localStorage.getItem(DIRECTOR_COLLAPSED_KEY);
    return stored === null ? true : stored === 'true';
  });

  const [isMaximized, setIsMaximized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DIRECTOR_MAXIMIZED_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(DIRECTOR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(DIRECTOR_MAXIMIZED_KEY, String(isMaximized));
  }, [isMaximized]);

  return {
    collapsed,
    setCollapsed,
    isMaximized,
    setIsMaximized,
  };
}

// ============================================================================
// Onboarding Tour Step Definitions
// ============================================================================

const ONBOARDING_STEPS: TourStep[] = [
  // ── Section 1: Command Center (route: /activity) ──────────────────────
  {
    id: 'welcome',
    targetTestId: 'activity-page',
    title: 'Welcome to Stoneforge',
    description:
      'Your command center -- see all active agents, tasks, and system health at a glance.',
    section: 'Command Center',
    route: '/activity',
  },
  {
    id: 'system-status',
    targetTestId: 'system-status-bar',
    title: 'System Status',
    description:
      'These indicators show active agents, in-progress tasks, and merge request pipeline health. A quick pulse check.',
    section: 'Command Center',
    route: '/activity',
  },
  {
    id: 'agent-cards',
    targetTestId: 'active-agents-section',
    title: 'Active Agents',
    description:
      'Each card is a running agent showing its status, current task, and live output. Click one to open its terminal.',
    section: 'Command Center',
    route: '/activity',
  },
  {
    id: 'header-bar',
    targetTestId: 'header',
    title: 'Global Controls',
    description:
      'The header gives you the command palette (Cmd+K), daemon toggle, emergency stop, notifications, and theme switch -- available on every page.',
    section: 'Command Center',
    route: '/activity',
  },
  {
    id: 'stop-all-agents',
    targetTestId: 'stop-all-agents-button',
    title: 'Emergency Stop',
    description:
      'This button immediately stops all running agents. Use it as an emergency brake if you see something going wrong and need to intervene quickly.',
    section: 'Command Center',
    route: '/activity',
  },
  {
    id: 'daemon-toggle',
    targetTestId: 'daemon-toggle',
    title: 'Autopilot',
    description:
      'The Autopilot toggle controls the dispatch daemon. When enabled, tasks are automatically assigned to available agents. Turn it off when you want to pause automatic work assignment and assign tasks manually.',
    section: 'Command Center',
    route: '/activity',
  },

  // ── Section 2: Managing Work (routes: /tasks, /plans, /merge-requests) ─
  {
    id: 'tasks-overview',
    targetTestId: 'tasks-page',
    title: 'Task Board',
    description:
      'All work items live here. Switch between list and Kanban views, filter by status tabs, search, sort, and group tasks however you like.',
    section: 'Managing Work',
    route: '/tasks',
  },
  {
    id: 'tasks-create',
    targetTestId: 'tasks-create',
    title: 'Create Tasks',
    description:
      "You can manually create tasks here, but you usually won't need to. Just give work to the Director and it will plan and create tasks for you automatically.",
    section: 'Managing Work',
    route: '/tasks',
  },
  {
    id: 'tasks-views',
    targetTestId: 'tasks-tab-in_progress',
    title: 'Status Tabs',
    description:
      'Filter tasks by lifecycle stage. "In Progress" and "Awaiting Merge" show what agents are actively working on.',
    section: 'Managing Work',
    route: '/tasks',
  },
  {
    id: 'tasks-detail',
    targetTestId: 'task-detail-panel',
    title: 'Task Details',
    description:
      'Click any task to open its detail panel. View and edit the title, status, priority, assignee, and description. Track dependencies and view the full task history.',
    section: 'Managing Work',
    route: '/tasks',
  },
  {
    id: 'plans-overview',
    targetTestId: 'plans-page',
    title: 'Plans & Roadmap',
    description:
      'Plans group related tasks into a coordinated effort. Switch to Roadmap view for a timeline visualization.',
    section: 'Managing Work',
    route: '/plans',
  },
  {
    id: 'plans-detail',
    targetTestId: 'plan-detail-panel',
    title: 'Plan Details',
    description:
      'Click a plan to see its tasks, progress, and status. Add or remove tasks, activate draft plans, and track completion across the entire effort.',
    section: 'Managing Work',
    route: '/plans',
  },
  {
    id: 'merge-requests',
    targetTestId: 'merge-requests-page',
    title: 'Merge Requests',
    description:
      'When agents complete work, their branches appear here. Review diffs, approve, request changes, or merge directly.',
    section: 'Managing Work',
    route: '/merge-requests',
  },

  // ── Section 3: Agent Fleet (routes: /agents, /workspaces) ─────────────
  {
    id: 'agents-overview',
    targetTestId: 'agents-page',
    title: 'Agent Registry',
    description:
      'Meet your fleet: Directors orchestrate, Workers execute tasks, Stewards review code. Create, configure, and manage agents here.',
    section: 'Agent Fleet',
    route: '/agents',
  },
  {
    id: 'agents-create-modal',
    targetTestId: 'agents-create',
    title: 'Create Agents',
    description:
      'Click (+) to add agents. Workers execute individual tasks, Persistent Workers stay running across tasks, and Stewards handle code review and merges. Each type serves a different role in your workflow.',
    section: 'Agent Fleet',
    route: '/agents',
  },
  {
    id: 'agents-settings',
    targetTestId: 'agent-provider-model-section',
    title: 'Agent Provider & Model',
    description:
      'Each agent can use a different AI provider and model. Select the provider (Claude, OpenAI, etc.) and specific model for this agent. These settings can be changed later from the agent\'s settings.',
    section: 'Agent Fleet',
    route: '/agents',
    noAutoAdvance: true,
  },
  {
    id: 'workspaces-overview',
    targetTestId: 'workspaces-page',
    title: 'Workspaces',
    description:
      'A tmux-like multiplexer. Watch agents work in real time, interact with their terminals, or run commands yourself.',
    section: 'Agent Fleet',
    route: '/workspaces',
  },
  {
    id: 'workspaces-layout',
    targetTestId: 'workspaces-layout-btn',
    title: 'Layout Presets',
    description:
      'Choose single, columns, rows, or grid layouts. Add panes to monitor multiple agents side by side.',
    section: 'Agent Fleet',
    route: '/workspaces',
  },

  // ── Section 4: The Director (right sidebar, no route) ─────────────────
  // All conditionally enabled based on directorAgent existence.
  // onActivate callbacks are wired in the tourSteps useMemo below.
  {
    id: 'director-intro',
    targetTestId: 'director-panel',
    title: 'Meet the Director',
    description:
      'The Director is your AI orchestrator. It reads your backlog, creates plans, assigns tasks to workers, and manages the entire workflow. This panel is your primary interface.',
    section: 'The Director',
    route: '/activity',
  },
  {
    id: 'director-tabs',
    targetTestId: 'director-panel-header',
    title: 'Director Tabs',
    description:
      'Each tab is a separate director session. Click (+) to create new directors, right-click a tab to delete one.',
    section: 'The Director',
  },
  {
    id: 'director-actions',
    targetTestId: 'director-panel-header',
    targetSelector: '[data-testid^="director-sift-backlog-"]',
    title: 'Sift Backlog',
    description:
      'The pickaxe icon triggers backlog sifting — the director reads your task backlog, prioritizes work, and creates plans for your agents.',
    section: 'The Director',
    noAutoAdvance: true,
  },
  {
    id: 'director-start',
    targetTestId: 'director-panel-header',
    targetSelector: '[data-testid^="director-start-"], [data-testid^="director-restart-"]',
    title: 'Start the Director',
    description:
      'Click the green play button to start a director session. Once running, use the yellow restart button to reset it, or the red stop button to end the session.',
    section: 'The Director',
    noAutoAdvance: true,
  },
  {
    id: 'director-messages',
    targetTestId: 'director-panel-header',
    targetSelector: '[data-testid^="toggle-messages-queue-"]',
    title: 'Process Messages',
    description:
      'Toggle the mail icon to see queued messages. Process them all at once, or click the play button on individual messages. The director reads and responds to each one.',
    section: 'The Director',
    noAutoAdvance: true,
  },

  // ── Section 5: Collaboration (routes: /messages, /documents, /inbox) ──
  {
    id: 'messages-overview',
    targetTestId: 'messages-page',
    title: 'Team Messages',
    description:
      'Slack-style channels for team communication. Create channels, send messages to agents, and keep conversations organized with threading.',
    section: 'Collaboration',
    route: '/messages',
  },
  {
    id: 'messages-channel',
    targetTestId: 'message-composer',
    title: 'Send Messages',
    description:
      'Select a channel and type a message in the composer. Attach documents, embed tasks, and use threads to keep conversations organized.',
    section: 'Collaboration',
    route: '/messages',
  },
  {
    id: 'documents-overview',
    targetTestId: 'documents-page',
    title: 'Document Library',
    description:
      'A Notion-like workspace for project knowledge. Organize docs into libraries, drag-and-drop to reorder, and share documentation across the team.',
    section: 'Collaboration',
    route: '/documents',
  },
  {
    id: 'documents-detail',
    targetTestId: 'document-detail-panel',
    title: 'Edit Documents',
    description:
      'Click a document to view and edit it. Write in Markdown, track versions, link related documents, and expand to fullscreen for focused editing.',
    section: 'Collaboration',
    route: '/documents',
  },
  {
    id: 'inbox-overview',
    targetTestId: 'inbox-page',
    title: 'Inbox',
    description:
      'Your personal feed of @mentions, direct messages, and agent notifications. Filter, archive, and reply from one place.',
    section: 'Collaboration',
    route: '/inbox',
  },
  {
    id: 'notification-bell',
    targetTestId: 'notification-center',
    title: 'Notifications',
    description:
      'The bell icon shows real-time alerts: approval requests, agent errors, and important events.',
    section: 'Collaboration',
    // Conditionally enabled based on 'approve' preset — set at render time
  },

  // ── Section 6: Power Tools (routes: /editor, /workflows, /metrics) ────
  {
    id: 'editor-overview',
    targetTestId: 'file-editor-page',
    title: 'Code Editor',
    description:
      'A full Monaco editor with LSP support. Browse files, edit code with syntax highlighting and completions, and install extensions.',
    section: 'Power Tools',
    route: '/editor',
  },
  {
    id: 'workflows-overview',
    targetTestId: 'workflows-page',
    title: 'Workflows',
    description:
      'Create reusable workflow templates (playbooks) and monitor active workflow execution with dependency tracking and progress visualization.',
    section: 'Power Tools',
    route: '/workflows',
  },
  {
    id: 'workflows-editor',
    targetTestId: 'workflow-editor-dialog',
    title: 'Create Workflow Templates',
    description:
      'Build reusable workflow templates with multiple steps. Add task steps (assigned to agents) or function steps (custom code). Define variables, set dependencies between steps, and export as YAML.',
    section: 'Power Tools',
    route: '/workflows',
    noAutoAdvance: true,
  },
  {
    id: 'metrics-overview',
    targetTestId: 'metrics-page',
    title: 'Metrics Dashboard',
    description:
      'Track task throughput, agent performance, and provider usage over time. Use the time range selector to zoom into trends.',
    section: 'Power Tools',
    route: '/metrics',
  },
  {
    id: 'command-palette',
    targetTestId: 'command-palette-trigger',
    title: 'Command Palette',
    description:
      'Press Cmd+K from anywhere to navigate pages, create tasks, toggle panels, and access every action without touching the mouse.',
    section: 'Power Tools',
  },

  // ── Section 7: Settings & Wrap-Up ─────────────────────────────────────
  {
    id: 'settings-overview',
    targetTestId: 'settings-page',
    title: 'Settings',
    description:
      'Customize your theme, notification preferences, default providers, keyboard shortcuts, and workspace configuration. Restart this tour anytime from here.',
    section: 'Settings & Wrap-Up',
    route: '/settings',
  },
  {
    id: 'workflow-presets',
    targetTestId: 'settings-section-workflow-preset',
    title: 'Workflow Presets',
    description:
      'Choose how Stoneforge operates. Auto mode merges work directly to main for fast iteration. Review mode merges to a review branch for you to inspect. Approve mode requires your approval before agents take restricted actions.',
    section: 'Settings & Wrap-Up',
    route: '/settings',
  },
  {
    id: 'tour-complete',
    targetTestId: 'activity-page',
    title: "You're Ready!",
    description:
      'You have seen the full power of Stoneforge. Start by opening the Director panel and starting a session -- it will read your backlog and begin orchestrating work. Press Cmd+K anytime to find any feature.',
    section: 'Settings & Wrap-Up',
    route: '/activity',
  },
];

// Director panel dimension constants (must match DirectorPanel.tsx)
const DIRECTOR_PANEL_COLLAPSED_WIDTH = 48; // w-12
const DIRECTOR_PANEL_DEFAULT_WIDTH = 384;
const DIRECTOR_PANEL_MIN_WIDTH = 280;
const DIRECTOR_PANEL_MAX_WIDTH = 800;
const DIRECTOR_PANEL_WIDTH_KEY = 'orchestrator-director-panel-width';

export function AppShell() {
  const {
    desktopCollapsed,
    setDesktopCollapsed,
    mobileDrawerOpen,
    setMobileDrawerOpen,
  } = useSidebarState();

  const {
    collapsed: directorUserCollapsed,
    setCollapsed: setDirectorCollapsed,
    isMaximized: directorUserMaximized,
    setIsMaximized: setDirectorMaximized,
  } = useDirectorPanelState();

  // ── Content-area-aware responsive computation ────────────────────────
  const { width: viewportWidth } = useWindowSize();
  const viewportIsMobile = viewportWidth < BREAKPOINTS.md; // hides director panel entirely

  // Read director expanded width from localStorage (synced via onWidthChange callback)
  const [directorExpandedWidth, setDirectorExpandedWidth] = useState(() => {
    if (typeof window === 'undefined') return DIRECTOR_PANEL_DEFAULT_WIDTH;
    const stored = localStorage.getItem(DIRECTOR_PANEL_WIDTH_KEY);
    if (stored) {
      const p = parseInt(stored, 10);
      if (!isNaN(p) && p >= DIRECTOR_PANEL_MIN_WIDTH && p <= DIRECTOR_PANEL_MAX_WIDTH) return p;
    }
    return DIRECTOR_PANEL_DEFAULT_WIDTH;
  });

  // Effective director state (viewport-level: director hidden on mobile)
  const directorCollapsed = viewportIsMobile ? true : directorUserCollapsed;
  const directorMaximized = viewportIsMobile ? false : directorUserMaximized;

  // Director panel rendered width
  const directorPanelWidth = viewportIsMobile ? 0
    : (directorMaximized && !directorCollapsed) ? viewportWidth
    : directorCollapsed ? DIRECTOR_PANEL_COLLAPSED_WIDTH
    : directorExpandedWidth;

  // THE KEY COMPUTATION: content area width drives all responsive decisions
  const contentAreaWidth = viewportWidth - directorPanelWidth;
  const isMobile = contentAreaWidth < BREAKPOINTS.md;   // < 768
  const isTablet = contentAreaWidth >= BREAKPOINTS.md && contentAreaWidth < BREAKPOINTS.xl; // 768-1280

  // Close mobile drawer when transitioning out of mobile mode
  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [isMobile, setMobileDrawerOpen]);

  // Container-width tracking for responsive hooks inside <main>
  const { containerRef, width: containerWidth } = useContainerWidthObserver();

  const health = useHealth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Provider installation check — blocks the app if providers are missing
  const providerCheck = useProviderCheck();
  const hasProviderIssues = !providerCheck.isLoading && providerCheck.missingProviders.length > 0;
  const changeAgentProvider = useChangeAgentProvider();
  const handleChangeAgentProvider = useCallback(
    async (agentId: string, newProvider: string) => {
      await changeAgentProvider.mutateAsync({ agentId, provider: newProvider });
      // Re-run the full provider check after changing an agent's provider
      providerCheck.refetch();
    },
    [changeAgentProvider, providerCheck]
  );

  // Onboarding tour
  const workflowPreset = useWorkflowPreset();
  const { director: directorAgent } = useDirector();

  // Director step IDs that require directorAgent and auto-expand the panel
  const DIRECTOR_STEP_IDS = new Set([
    'director-intro',
    'director-tabs',
    'director-actions',
    'director-start',
    'director-messages',
  ]);

  // Step IDs that need the director panel collapsed (page demonstration steps)
  const COLLAPSE_DIRECTOR_STEP_IDS = new Set([
    'tasks-overview', 'tasks-create', 'tasks-views', 'tasks-detail',
    'plans-overview', 'plans-detail',
    'messages-overview', 'messages-channel',
    'documents-overview', 'documents-detail',
  ]);

  // Build steps with conditional enablement and onActivate callbacks
  const tourSteps = useMemo(() => {
    return ONBOARDING_STEPS.map((step) => {
      // ── Activity section: inject mock agent data ──────────────────────
      if (step.id === 'agent-cards') {
        return {
          ...step,
          onActivate: () => {
            injectTourMockData(queryClient, 'activity');
          },
        };
      }

      // ── Tasks section: inject mock tasks + collapse director ──────────
      if (step.id === 'tasks-overview') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'tasks');
          },
        };
      }
      if (step.id === 'tasks-detail') {
        return {
          ...step,
          noAutoAdvance: true,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'tasks');
            setTimeout(() => {
              router.navigate({
                to: '/tasks',
                search: {
                  selected: 'tour-mock-task-1',
                  page: 1,
                  limit: 20,
                  status: undefined,
                  assignee: undefined,
                  showClosed: undefined,
                  action: undefined,
                  backlog: undefined,
                },
              });
            }, 300);
          },
        };
      }

      // ── Merge Requests section: inject mock MR data + collapse director ─
      if (step.id === 'merge-requests') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'merge-requests');
          },
        };
      }

      // ── Plans section: inject mock plans + collapse director ──────────
      if (step.id === 'plans-overview') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'plans');
          },
        };
      }
      if (step.id === 'plans-detail') {
        return {
          ...step,
          noAutoAdvance: true,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'plans');
            setTimeout(() => {
              router.navigate({
                to: '/plans',
                search: { selected: 'tour-mock-plan-1', status: undefined },
              });
            }, 300);
          },
        };
      }

      // ── Messages section: inject mock messages + collapse director ────
      if (step.id === 'messages-overview') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'messages');
          },
        };
      }
      if (step.id === 'messages-channel') {
        return {
          ...step,
          noAutoAdvance: true,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'messages');
            setTimeout(() => {
              router.navigate({
                to: '/messages',
                search: { channel: 'tour-mock-channel-1', message: undefined },
              });
            }, 300);
          },
        };
      }

      // ── Documents section: inject mock documents + collapse director ──
      if (step.id === 'documents-overview') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'documents');
          },
        };
      }
      if (step.id === 'documents-detail') {
        return {
          ...step,
          noAutoAdvance: true,
          onActivate: () => {
            setDirectorCollapsed(true);
            injectTourMockData(queryClient, 'documents');
            setTimeout(() => {
              router.navigate({
                to: '/documents',
                search: { selected: 'tour-mock-doc-1', library: undefined },
              });
            }, 300);
          },
        };
      }

      // ── Collapse director for remaining page demo steps ───────────────
      if (COLLAPSE_DIRECTOR_STEP_IDS.has(step.id)) {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
          },
        };
      }

      // ── Workflows editor: open editor modal with example steps ──────────
      if (step.id === 'workflows-editor') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            // Open the workflow editor by clicking the create button
            setTimeout(() => {
              const createBtn =
                (document.querySelector('[data-testid="workflows-create"]') as HTMLButtonElement) ||
                (document.querySelector('[data-testid="workflows-create-empty"]') as HTMLButtonElement);
              if (createBtn) createBtn.click();

              // After the editor opens, add example steps to demonstrate the UI
              setTimeout(() => {
                addExampleWorkflowSteps();
              }, 500);
            }, 300);
          },
          onDeactivate: () => {
            // Close the editor when leaving this step
            const closeBtn = document.querySelector(
              '[data-testid="workflow-editor-close"]',
            ) as HTMLButtonElement;
            if (closeBtn) closeBtn.click();
          },
        };
      }

      // ── Agent settings: open Create Agent dialog and expand Settings & Tags ──
      if (step.id === 'agents-settings') {
        return {
          ...step,
          onActivate: () => {
            setDirectorCollapsed(true);
            // Ensure Create Agent dialog is open
            setTimeout(() => {
              const dialog = document.querySelector('[data-testid="create-agent-dialog"]');
              if (!dialog) {
                const createBtn = document.querySelector('[data-testid="agents-create"]') as HTMLButtonElement;
                if (createBtn) createBtn.click();
              }
              // Expand Settings & Tags section after dialog renders
              setTimeout(() => {
                const toggleBtn = document.querySelector('[data-testid="toggle-capabilities"]') as HTMLButtonElement;
                if (toggleBtn) {
                  // Check if already expanded by looking for the model select
                  const modelSelect = document.querySelector('[data-testid="agent-model"]');
                  if (!modelSelect) {
                    toggleBtn.click();
                  }
                }
              }, 300);
            }, 300);
          },
          onDeactivate: () => {
            // Close the dialog when leaving this step
            const closeBtn = document.querySelector('[data-testid="create-agent-close"]') as HTMLButtonElement;
            if (closeBtn) closeBtn.click();
          },
        };
      }

      // ── Workflow presets: navigate to settings workspace tab ───────────
      if (step.id === 'workflow-presets') {
        return {
          ...step,
          onActivate: () => {
            const workspaceTab = document.querySelector('[data-testid="settings-tab-workspace"]');
            if (workspaceTab instanceof HTMLElement) {
              workspaceTab.click();
            }
          },
        };
      }

      // ── Notification bell: only shown for 'approve' preset ────────────
      if (step.id === 'notification-bell') {
        return { ...step, enabled: workflowPreset.preset === 'approve' };
      }

      // ── Director steps: expand panel, clear mock data ─────────────────
      if (DIRECTOR_STEP_IDS.has(step.id)) {
        return {
          ...step,
          enabled: !!directorAgent && !isMobile,
          onActivate: () => {
            setDirectorCollapsed(false);
            clearTourMockData(queryClient);
          },
        };
      }

      // ── Tour complete: clear all mock data ────────────────────────────
      if (step.id === 'tour-complete') {
        return {
          ...step,
          onActivate: () => {
            clearTourMockData(queryClient);
          },
        };
      }

      return step;
    });
  }, [workflowPreset.preset, directorAgent, setDirectorCollapsed, isMobile, queryClient, router]);

  const onboardingTour = useOnboardingTour(tourSteps);

  // Auto-start tour on first visit after preset is configured,
  // or resume a tour in progress after browser refresh (saved step in localStorage)
  const routerState2 = useRouterState();
  useEffect(() => {
    if (
      workflowPreset.isConfigured &&
      !workflowPreset.isLoading &&
      !onboardingTour.isCompleted &&
      !onboardingTour.isActive &&
      !hasProviderIssues
    ) {
      // Check if we're resuming a tour in progress (saved step in localStorage)
      const savedStep = typeof window !== 'undefined'
        ? localStorage.getItem('stoneforge:onboarding-step')
        : null;
      const isResume = savedStep !== null && parseInt(savedStep, 10) > 0;

      if (isResume || routerState2.location.pathname === '/activity') {
        // Small delay to let the page render before starting the tour
        const timer = setTimeout(() => {
          if (isResume) {
            // Resume from saved step — goToStep sets the index, then start activates the tour
            onboardingTour.resume();
          } else {
            onboardingTour.start();
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [
    workflowPreset.isConfigured,
    workflowPreset.isLoading,
    onboardingTour.isCompleted,
    onboardingTour.isActive,
    hasProviderIssues,
    routerState2.location.pathname,
  ]);

  // Navigate to /activity when tour is restarted from settings
  useEffect(() => {
    const handleRestart = () => {
      // Navigate to /activity so the first step's target element is available
      router.navigate({ to: '/activity' });
    };
    window.addEventListener('restart-onboarding-tour', handleRestart);
    return () => window.removeEventListener('restart-onboarding-tour', handleRestart);
  }, [router]);

  // Clean up mock data when the tour ends (skip, complete, or browser close)
  useEffect(() => {
    if (!onboardingTour.isActive && hasTourMockData()) {
      clearTourMockData(queryClient);
      // Close any open detail panels by clearing search params
      const currentPath = routerState2.location.pathname;
      router.navigate({ to: currentPath, search: () => ({}) });
    }
  }, [onboardingTour.isActive]);

  // Ensure target elements are visible during the tour
  const activeSteps = useMemo(
    () => tourSteps.filter((s) => s.enabled !== false),
    [tourSteps]
  );

  const [isTourNavigating, setIsTourNavigating] = useState(false);

  useEffect(() => {
    if (!onboardingTour.isActive) return;
    const step = activeSteps[onboardingTour.currentStep];
    if (!step) return;

    // Run side effects (e.g., expand director panel)
    if (step.onActivate) step.onActivate();

    // Navigate to the step's route if we're not already there
    const currentPath = routerState2.location.pathname;
    if (step.route && currentPath !== step.route) {
      setIsTourNavigating(true);
      router.navigate({ to: step.route }).then(() => {
        // Small delay to allow the target page to render before clearing the overlay
        setTimeout(() => setIsTourNavigating(false), 100);
      });
    } else {
      // Ensure navigating state is cleared if we're already on the right page
      setIsTourNavigating(false);
    }
  }, [onboardingTour.isActive, onboardingTour.currentStep, activeSteps]);

  // Notification system
  const {
    notifications,
    unreadCount,
    isConnected: notificationsConnected,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAll,
  } = useNotifications();

  // Notification sidebar state
  const [notificationSidebarOpen, setNotificationSidebarOpen] = useState(false);

  const toggleNotificationSidebar = useCallback(() => {
    setNotificationSidebarOpen((prev) => !prev);
  }, []);

  const closeNotificationSidebar = useCallback(() => {
    setNotificationSidebarOpen(false);
  }, []);

  // Pending approval requests count (adaptive polling)
  const pendingApprovalCount = usePendingApprovalCount(notificationSidebarOpen);

  // Watch for new approval requests and show toast
  const openNotificationSidebar = useCallback(() => {
    setNotificationSidebarOpen(true);
  }, []);

  useApprovalRequestWatcher({
    sidebarOpen: notificationSidebarOpen,
    onNewRequest: useCallback(
      (request: { agentName?: string; agentId: string; toolName: string }) => {
        const agentLabel = request.agentName || request.agentId;
        toast.warning(`Approval needed: ${agentLabel}`, {
          description: `${request.toolName} requires approval`,
          duration: 8000,
          action: {
            label: 'View',
            onClick: () => openNotificationSidebar(),
          },
        });
      },
      [openNotificationSidebar]
    ),
  });

  // Command palette
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette();

  // Quick file open (Ctrl/Cmd+P)
  const { open: quickFileOpenOpen, setOpen: setQuickFileOpenOpen } = useQuickFileOpen();

  // File content search (Cmd/Ctrl+Shift+F)
  const { open: fileContentSearchOpen, setOpen: setFileContentSearchOpen } = useFileContentSearchShortcut();

  // Toggle sidebar (works for both mobile drawer and desktop sidebar)
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileDrawerOpen(prev => !prev);
    } else {
      setDesktopCollapsed(prev => !prev);
    }
  }, [isMobile, setMobileDrawerOpen, setDesktopCollapsed]);

  const toggleDirectorPanel = useCallback(() => {
    setDirectorCollapsed(prev => !prev);
  }, [setDirectorCollapsed]);

  const toggleDirectorMaximize = useCallback(() => {
    // If panel is collapsed and we're toggling maximize, uncollapse it first
    if (directorCollapsed) {
      setDirectorCollapsed(false);
    }
    setDirectorMaximized(prev => !prev);
  }, [directorCollapsed, setDirectorCollapsed, setDirectorMaximized]);

  // Open command palette
  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, [setCommandPaletteOpen]);

  // Initialize global keyboard shortcuts (G T, G A, Cmd+B, Cmd+D, Cmd+Shift+D, etc.)
  useGlobalKeyboardShortcuts({
    onToggleSidebar: toggleSidebar,
    onToggleDirector: toggleDirectorPanel,
    onToggleDirectorMaximize: toggleDirectorMaximize,
    onOpenCommandPalette: openCommandPalette,
  });

  const openMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(true);
  }, [setMobileDrawerOpen]);

  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, [setMobileDrawerOpen]);

  // Listen for toggle-director-panel event from command palette
  useEffect(() => {
    const handleToggleDirector = () => {
      setDirectorCollapsed(prev => !prev);
    };
    window.addEventListener('toggle-director-panel', handleToggleDirector);
    return () => window.removeEventListener('toggle-director-panel', handleToggleDirector);
  }, [setDirectorCollapsed]);

  // Listen for maximize-director-panel event from command palette
  useEffect(() => {
    const handleMaximizeDirector = () => {
      toggleDirectorMaximize();
    };
    window.addEventListener('maximize-director-panel', handleMaximizeDirector);
    return () => window.removeEventListener('maximize-director-panel', handleMaximizeDirector);
  }, [toggleDirectorMaximize]);

  // Listen for open-director-panel event (e.g., from Agents page "Open" button)
  // Includes optional directorId in detail to select a specific director tab
  useEffect(() => {
    const handleOpenDirector = (e: Event) => {
      setDirectorCollapsed(false);
      const detail = (e as CustomEvent<{ directorId?: string }>).detail;
      if (detail?.directorId) {
        // Relay to DirectorPanel so it can switch to the requested director tab
        window.dispatchEvent(new CustomEvent('select-director-tab', { detail: { directorId: detail.directorId } }));
      }
    };
    window.addEventListener('open-director-panel', handleOpenDirector);
    return () => window.removeEventListener('open-director-panel', handleOpenDirector);
  }, [setDirectorCollapsed]);

  // Close mobile drawer on navigation
  useEffect(() => {
    const unsubscribe = router.subscribe('onResolved', () => {
      if (isMobile && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    });
    return () => unsubscribe();
  }, [router, isMobile, mobileDrawerOpen, setMobileDrawerOpen]);

  // Dynamic document title: "Stoneforge | {Page}"
  const routerState = useRouterState();
  useEffect(() => {
    const path = routerState.location.pathname;
    const config = ROUTE_CONFIG[path];
    document.title = config ? `Stoneforge | ${config.label}` : 'Stoneforge';
  }, [routerState.location.pathname]);

  const sidebarCollapsed = isMobile ? true : isTablet ? true : desktopCollapsed;

  return (
    <div className="flex h-screen bg-[var(--color-bg)]" data-testid="app-shell">
      {/* Mobile: Sidebar as drawer */}
      {isMobile && (
        <MobileDrawer
          open={mobileDrawerOpen}
          onClose={closeMobileDrawer}
          data-testid="mobile-drawer"
        >
          <Sidebar
            collapsed={false}
            onToggle={closeMobileDrawer}
            isMobileDrawer
          />
        </MobileDrawer>
      )}

      {/* Tablet & Desktop: Static sidebar - hidden when director panel is maximized */}
      {!isMobile && !(directorMaximized && !directorCollapsed) && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setDesktopCollapsed(!desktopCollapsed)}
        />
      )}

      {/* Main content area - hidden when director panel is maximized */}
      <div className={`flex flex-col min-w-0 @container ${directorMaximized && !directorCollapsed ? 'hidden' : 'flex-1'}`}>
        {/* Header */}
        <header
          className="h-14 bg-[var(--color-header-bg)] border-b border-[var(--color-header-border)] overflow-x-auto scrollbar-hide"
          data-testid="header"
        >
          <div className="flex items-center justify-between h-full px-4 @md:px-6 min-w-max">
            {/* Mobile: Hamburger menu + centered title + search button */}
            {isMobile && (
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={openMobileDrawer}
                  className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target flex-shrink-0"
                  aria-label="Open navigation menu"
                  aria-expanded={mobileDrawerOpen}
                  data-testid="mobile-menu-button"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex-1 text-center whitespace-nowrap">
                  <BreadcrumbsMobile />
                </div>
                <button
                  className="p-2 -mr-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target flex-shrink-0"
                  aria-label="Search"
                  data-testid="mobile-search-button"
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Tablet & Desktop: Full breadcrumbs */}
            {!isMobile && (
              <div className="flex-shrink-0 whitespace-nowrap">
                <Breadcrumbs />
              </div>
            )}

            <div className="flex items-center gap-2 @md:gap-4 flex-shrink-0">
              {/* Command palette trigger - hidden on mobile */}
              {!isMobile && (
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 whitespace-nowrap"
                  aria-label="Open command palette"
                  data-testid="command-palette-trigger"
                >
                  <Search className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden @lg:inline">Search...</span>
                  <kbd className="hidden @md:flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded">
                    <Command className="w-3 h-3" />K
                  </kbd>
                </button>
              )}
              {/* User selector for switching human entities */}
              {!isMobile && <UserSelector />}
              {/* Daemon toggle for dispatch daemon control */}
              {!isMobile && <DaemonToggle />}
              {/* Stop all running agents button */}
              {!isMobile && <StopAllAgentsButton />}
              <NotificationCenter
                unreadCount={unreadCount}
                pendingApprovalCount={pendingApprovalCount}
                isConnected={notificationsConnected}
                onToggleSidebar={toggleNotificationSidebar}
                sidebarOpen={notificationSidebarOpen}
              />
              <ThemeToggle />
              {!isMobile && (
                <>
                  <div className="h-5 w-px bg-[var(--color-border)] flex-shrink-0" />
                  <ConnectionStatus health={health} />
                </>
              )}
            </div>
          </div>
        </header>

        {/* Rate limit banner - shown when daemon is paused due to rate limits */}
        <RateLimitBanner />

        {/* Main Content */}
        {/*
         * Container query context (@container) enables child components to use
         * container-width-based breakpoints (@sm:, @md:, @lg:, @xl:) instead of
         * viewport-width-based ones (sm:, md:, lg:, xl:). This is critical for
         * correct responsive behavior when the director panel is open, as the
         * main content area is narrower than the viewport.
         *
         * Tailwind v4 natively supports container queries:
         *   - @container on parent → sets container-type: inline-size
         *   - @sm:, @md:, @lg:, @xl: on children → respond to container width
         */}
        <main ref={containerRef} className="flex-1 overflow-y-auto p-4 @md:p-6 bg-[var(--color-bg)] @container">
          <ContainerWidthProvider width={containerWidth}>
            <Outlet />
          </ContainerWidthProvider>
        </main>
      </div>

      {/* Director Panel (right sidebar) - hidden on viewport mobile */}
      {!viewportIsMobile && (
        <DirectorPanel
          collapsed={directorCollapsed}
          onToggle={toggleDirectorPanel}
          isMaximized={directorMaximized}
          onToggleMaximize={toggleDirectorMaximize}
          onWidthChange={setDirectorExpandedWidth}
        />
      )}

      {/* Notification Sidebar */}
      <NotificationSidebar
        isOpen={notificationSidebarOpen}
        onClose={closeNotificationSidebar}
        notifications={notifications}
        unreadCount={unreadCount}
        isConnected={notificationsConnected}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onDismiss={dismissNotification}
        onClearAll={clearAll}
        onOpenSettings={() => {
          closeNotificationSidebar();
          router.navigate({ to: '/settings', search: { tab: 'preferences' } });
        }}
      />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {/* Quick File Open (Cmd+P) */}
      <QuickFileOpen
        open={quickFileOpenOpen}
        onOpenChange={setQuickFileOpenOpen}
      />

      {/* File Content Search (Cmd+Shift+F) */}
      <FileContentSearch
        open={fileContentSearchOpen}
        onOpenChange={setFileContentSearchOpen}
      />

      {/* Provider Installation Check Modal — blocks app until resolved */}
      {hasProviderIssues && (
        <ProviderInstallModal
          missingProviders={providerCheck.missingProviders}
          availableProviders={providerCheck.availableProviders}
          onVerify={providerCheck.verifyProvider}
          isVerifying={providerCheck.isVerifying}
          onChangeProvider={handleChangeAgentProvider}
        />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour
        isActive={onboardingTour.isActive}
        currentStep={onboardingTour.currentStep}
        steps={tourSteps}
        onNext={onboardingTour.next}
        onPrev={onboardingTour.prev}
        onSkip={onboardingTour.skip}
        onSkipSection={onboardingTour.skipSection}
        isNavigating={isTourNavigating}
      />
    </div>
  );
}
