import { useState, useEffect, useCallback } from 'react'
import { ActivityRail } from './components/ActivityRail'
import { TopBar } from './components/TopBar'
import { TasksPage } from './components/TasksPage'
import { DirectorPanel } from './components/DirectorPanel'
import { BottomPanel } from './components/BottomPanel'
import { ActiveAgentsStrip } from './components/ActiveAgentsStrip'
import { MergeRequestsOverlay } from './components/overlays/MergeRequestsOverlay'
import { CIOverlay } from './components/overlays/CIOverlay'
import { EditorOverlayNew } from './components/overlays/editor/EditorOverlayNew'
import { AutomationsOverlay } from './components/overlays/AutomationsOverlay'
import { AgentsOverlay } from './components/overlays/AgentsOverlay'
import { PreviewOverlay } from './components/overlays/PreviewOverlay'
import { DiffOverlay } from './components/overlays/DiffOverlay'
import { WhiteboardOverlay } from './components/overlays/WhiteboardOverlay'
import { TaskDetailOverlay } from './components/overlays/TaskDetailOverlay'
import { PlaceholderOverlay } from './components/overlays/PlaceholderOverlay'
import { MessagesOverlay } from './components/overlays/MessagesOverlay'
import { MetricsOverlay } from './components/overlays/MetricsOverlay'
import { DocumentsOverlay } from './components/overlays/DocumentsOverlay'
// WorkspacesOverlay removed — workspace switching stays in ActivityRail picker
import { SettingsOverlay } from './components/overlays/SettingsOverlay'
import { ToastNotifications } from './components/ToastNotifications'
import type { ToastItem } from './components/ToastNotifications'
import { CreateTaskDialog } from './components/CreateTaskDialog'
import { CreateWorkspaceDialog } from './components/CreateWorkspaceDialog'
import { CommandPalette } from './components/CommandPalette'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
// mockAgentsExtended now used inside AgentsOverlay directly
import { TeamContextProvider } from './TeamContext'
import { ConflictBanner } from './components/ConflictBanner'
import {
  mockTasks as initialMockTasks,
  mockDirectors,
  mockWorkspaces as initialWorkspaces,
  mockNotifications as initialNotifications,
  mockMergeRequestsExtended,
  mockCIRuns,
  mockCIActions,
  mockWorkflows,
  mockWorkflowRuns,
  mockPreviewEnvironments as initialPreviewEnvs,
  mockPreviewTabs as initialPreviewTabs,
  mockPreviewConsoleEntries,
  mockWhiteboards,
  mockChannels,
  mockMessages,
  mockSessionCards,
  mockMsgEntities,
  currentUser,
  TEAM_MEMBERS,
  mockPresence,
  mockIncomingChanges,
  mockConflicts,
  mockDaemonState,
  type Task,
  type PreviewEnvironment,
  type PreviewTab,
  type AppMode,
  type SyncStatus,
  type IncomingChange,
  type ConflictItem,
} from './mock-data'

type View = 'kanban' | 'whiteboard' | 'editor' | 'merge-requests' | 'ci' | 'preview' | 'sessions' | 'diff' | 'task-detail' | 'automations' | 'agents' | 'settings' | 'documents' | 'channels' | 'plans' | 'metrics' | 'workspaces'

// ── URL routing with parameterized paths ──
interface RouteParams {
  taskId?: string | null
  mrId?: string | null
  mrTab?: string | null
  ciRunId?: string | null
  ciJobId?: string | null
  previewTabId?: string | null
  editorFile?: string | null
  editorBranch?: string | null
  editorLine?: number | null
  editorFrom?: string | null
  editorFromId?: string | null
  editorFromLabel?: string | null
  whiteboardDirectorId?: string | null
  sessionId?: string | null
  sessionEventId?: string | null
  automationId?: string | null
  automationTab?: string | null
  automationEdit?: boolean | null
  automationRunNumber?: number | null
  agentId?: string | null
  agentTab?: string | null
  agentPoolId?: string | null
  agentCreate?: boolean | null
  runtimeId?: string | null
  runtimeCreate?: boolean | null
  documentId?: string | null
  metricsTab?: string | null
  channelId?: string | null
  planId?: string | null
}

const simpleRoutes: Record<string, View> = {
  '/editor': 'editor', '/diff': 'diff',
  '/settings': 'settings',
  '/documents': 'documents', '/plans': 'plans',
  '/metrics': 'metrics', '/workspaces': 'workspaces',
}

function parseUrl(pathname: string, search: string): { view: View; params: RouteParams } {
  const p = pathname || '/'
  const q = new URLSearchParams(search)
  const params: RouteParams = {}

  // /tasks/{taskId}
  if (p.startsWith('/tasks/')) {
    params.taskId = p.slice('/tasks/'.length).split('/')[0] || null
    if (params.taskId) return { view: 'task-detail', params }
  }
  if (p === '/tasks' || p === '/') return { view: 'kanban', params }

  // /merge-requests/{mrId}?tab=...
  if (p.startsWith('/merge-requests')) {
    const rest = p.slice('/merge-requests'.length)
    if (rest.length > 1) {
      params.mrId = rest.slice(1).split('/')[0]
    }
    params.mrTab = q.get('tab') || null
    return { view: 'merge-requests', params }
  }

  // /ci/{runId}/jobs/{jobId}
  if (p.startsWith('/ci')) {
    const segments = p.slice(1).split('/') // ['ci', runId?, 'jobs'?, jobId?]
    if (segments.length >= 2 && segments[1]) {
      params.ciRunId = segments[1]
    }
    if (segments.length >= 4 && segments[2] === 'jobs' && segments[3]) {
      params.ciJobId = segments[3]
    }
    return { view: 'ci', params }
  }

  // /preview/{tabId}
  if (p.startsWith('/preview')) {
    const rest = p.slice('/preview'.length)
    if (rest.length > 1) {
      params.previewTabId = rest.slice(1).split('/')[0]
    }
    return { view: 'preview', params }
  }

  // /whiteboard/{directorId}
  if (p.startsWith('/whiteboard')) {
    const rest = p.slice('/whiteboard'.length)
    if (rest.length > 1) {
      params.whiteboardDirectorId = rest.slice(1).split('/')[0]
    }
    return { view: 'whiteboard', params }
  }

  // /sessions/{sessionId}?event={eventId}
  if (p.startsWith('/sessions')) {
    const rest = p.slice('/sessions'.length)
    if (rest.length > 1) {
      params.sessionId = rest.slice(1).split('/')[0]
    }
    params.sessionEventId = q.get('event') || null
    return { view: 'sessions', params }
  }

  // /automations/new, /automations/{id}/edit, /automations/{id}?tab=...
  if (p.startsWith('/automations')) {
    const rest = p.slice('/automations'.length)
    if (rest === '/new') {
      params.automationEdit = true
      return { view: 'automations', params }
    }
    if (rest.length > 1) {
      const segments = rest.slice(1).split('/')
      params.automationId = segments[0]
      if (segments[1] === 'edit') {
        params.automationEdit = true
      } else if (segments[1] === 'runs' && segments[2]) {
        params.automationRunNumber = parseInt(segments[2])
      }
    }
    params.automationTab = q.get('tab') || null
    return { view: 'automations', params }
  }

  // /agents/new, /agents/{agentId}?tab=..., /agents?pool=...
  if (p.startsWith('/agents')) {
    const rest = p.slice('/agents'.length)
    if (rest === '/new') {
      params.agentCreate = true
      return { view: 'agents', params }
    }
    if (rest.length > 1) {
      params.agentId = rest.slice(1).split('/')[0]
    }
    params.agentTab = q.get('tab') || null
    params.agentPoolId = q.get('pool') || null
    return { view: 'agents', params }
  }

  // /runtimes → redirect to agents page with runtimes tab
  if (p.startsWith('/runtimes')) {
    params.agentTab = 'runtimes'
    return { view: 'agents', params }
  }

  // /channels/{channelId} (also accept legacy /messages)
  if (p.startsWith('/channels') || p.startsWith('/messages')) {
    const prefix = p.startsWith('/channels') ? '/channels' : '/messages'
    const rest = p.slice(prefix.length)
    if (rest.length > 1) {
      params.channelId = rest.slice(1).split('/')[0]
    }
    return { view: 'channels', params }
  }

  // /documents/{docId}
  if (p.startsWith('/documents')) {
    const rest = p.slice('/documents'.length)
    if (rest.length > 1) {
      params.documentId = rest.slice(1).split('/')[0]
    }
    return { view: 'documents', params }
  }

  // /plans/{planId}
  if (p.startsWith('/plans')) {
    const rest = p.slice('/plans'.length)
    if (rest.length > 1) {
      params.planId = rest.slice(1).split('/')[0]
    }
    return { view: 'plans', params }
  }

  // /metrics?tab=...
  if (p === '/metrics') {
    params.metricsTab = q.get('tab') || null
    return { view: 'metrics' as View, params }
  }


  // /editor or /editor/{filePath}?branch=...&line=...&from=...&fromId=...&fromLabel=...
  if (p.startsWith('/editor')) {
    const rest = p.slice('/editor'.length)
    if (rest.length > 1) {
      params.editorFile = decodeURIComponent(rest.slice(1))
    }
    params.editorBranch = q.get('branch') || null
    const line = q.get('line')
    params.editorLine = line ? parseInt(line) : null
    params.editorFrom = q.get('from') || null
    params.editorFromId = q.get('fromId') || null
    params.editorFromLabel = q.get('fromLabel') || null
    return { view: 'editor', params }
  }
  // Simple routes
  const view = simpleRoutes[p]
  if (view) return { view, params }

  return { view: 'kanban', params }
}

function buildUrl(view: View, params: RouteParams = {}): string {
  switch (view) {
    case 'kanban': return '/tasks'
    case 'task-detail': return params.taskId ? `/tasks/${params.taskId}` : '/tasks'
    case 'merge-requests': {
      let url = '/merge-requests'
      if (params.mrId) url += `/${params.mrId}`
      if (params.mrTab) url += `?tab=${params.mrTab}`
      return url
    }
    case 'ci': {
      let url = '/ci'
      if (params.ciRunId) url += `/${params.ciRunId}`
      if (params.ciJobId) url += `/jobs/${params.ciJobId}`
      return url
    }
    case 'preview': {
      let url = '/preview'
      if (params.previewTabId) url += `/${params.previewTabId}`
      return url
    }
    case 'whiteboard': {
      let url = '/whiteboard'
      if (params.whiteboardDirectorId) url += `/${params.whiteboardDirectorId}`
      return url
    }
    case 'sessions': {
      let url = '/sessions'
      if (params.sessionId) url += `/${params.sessionId}`
      if (params.sessionEventId) url += `?event=${params.sessionEventId}`
      return url
    }
    case 'automations': {
      if (params.automationEdit && !params.automationId) return '/automations/new'
      let url = '/automations'
      if (params.automationId) {
        url += `/${params.automationId}`
        if (params.automationEdit) url += '/edit'
        else if (params.automationRunNumber) url += `/runs/${params.automationRunNumber}`
      }
      if (params.automationTab && !params.automationRunNumber) url += `?tab=${params.automationTab}`
      return url
    }
    case 'agents': {
      if (params.agentCreate) return '/agents/new'
      let url = '/agents'
      if (params.agentId) url += `/${params.agentId}`
      const qp = new URLSearchParams()
      if (params.agentTab) qp.set('tab', params.agentTab)
      if (params.agentPoolId) qp.set('pool', params.agentPoolId)
      const qs = qp.toString()
      if (qs) url += `?${qs}`
      return url
    }
    // 'runtimes' case removed — runtimes are now a tab within the Agents page
    case 'channels': {
      let url = '/channels'
      if (params.channelId) url += `/${params.channelId}`
      return url
    }
    case 'documents': {
      let url = '/documents'
      if (params.documentId) url += `/${params.documentId}`
      return url
    }
    case 'metrics': {
      let url = '/metrics'
      if (params.metricsTab) url += `?tab=${params.metricsTab}`
      return url
    }
    case 'plans': {
      let url = '/plans'
      if (params.planId) url += `/${params.planId}`
      return url
    }
    case 'editor': {
      let url = '/editor'
      if (params.editorFile) url += `/${encodeURIComponent(params.editorFile)}`
      const qp = new URLSearchParams()
      if (params.editorBranch) qp.set('branch', params.editorBranch)
      if (params.editorLine) qp.set('line', String(params.editorLine))
      if (params.editorFrom) qp.set('from', params.editorFrom)
      if (params.editorFromId) qp.set('fromId', params.editorFromId)
      if (params.editorFromLabel) qp.set('fromLabel', params.editorFromLabel)
      const qs = qp.toString()
      if (qs) url += `?${qs}`
      return url
    }
    default: {
      const simple = Object.entries(simpleRoutes).find(([, v]) => v === view)
      return simple ? simple[0] : '/tasks'
    }
  }
}

function getInitialRoute() {
  return parseUrl(window.location.pathname, window.location.search)
}

export default function App() {
  // ── Theme ──
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('sf-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('sf-theme', theme)
  }, [theme])

  // ── Onboarding ──
  const [onboardingComplete, setOnboardingComplete] = useState(() => {
    return localStorage.getItem('sf-onboarding-complete') === 'true'
  })

  // ── Parameterized URL routing ──
  const [activeView, setActiveViewRaw] = useState<View>(() => getInitialRoute().view)

  // Sync popstate (browser back/forward) → full state restore
  useEffect(() => {
    const onPopState = () => {
      const { view, params } = parseUrl(window.location.pathname, window.location.search)
      setActiveViewRaw(view)
      setTaskDetailId(params.taskId || null)
      setSelectedMRId(params.mrId || null)
      setSelectedMRTab(params.mrTab || null)
      setSelectedCIRunId(params.ciRunId || null)
      setSelectedCIJobId(params.ciJobId || null)
      setActivePreviewTabId(params.previewTabId || null)
      setActiveWhiteboardDirectorId(params.whiteboardDirectorId || null)
      setSelectedSessionId(params.sessionId || null)
      setSelectedSessionEventId(params.sessionEventId || null)
      setSelectedAutomationId(params.automationId || null)
      setSelectedAutomationTab(params.automationTab || null)
      setSelectedAutomationEdit(!!params.automationEdit)
      setSelectedAutomationRunNumber(params.automationRunNumber || null)
      setSelectedRuntimeId(params.runtimeId || null)
      setRuntimeCreateMode(!!params.runtimeCreate)
      setSelectedChannelId(params.channelId || null)
      setSelectedDocumentId(params.documentId || null)
      setMetricsTab(params.metricsTab || null)
      setSelectedPlanId(params.planId || null)
      setEditorFile(params.editorFile || null)
      setEditorBranch(params.editorBranch || null)
      setEditorLine(params.editorLine || null)
      setEditorFrom(params.editorFrom || null)
      setEditorFromId(params.editorFromId || null)
      setEditorFromLabel(params.editorFromLabel || null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Navigate: sets view + params + pushes URL
  const navigate = useCallback((view: View, params: RouteParams = {}) => {
    setActiveViewRaw(view)
    if (view === 'task-detail') setTaskDetailId(params.taskId || null)
    if (view === 'merge-requests') { setSelectedMRId(params.mrId || null); setSelectedMRTab(params.mrTab || null) }
    if (view === 'ci') { setSelectedCIRunId(params.ciRunId || null); setSelectedCIJobId(params.ciJobId || null) }
    if (view === 'preview') setActivePreviewTabId(params.previewTabId || null)
    if (view === 'whiteboard') setActiveWhiteboardDirectorId(params.whiteboardDirectorId || null)
    if (view === 'editor') { setEditorFile(params.editorFile || null); setEditorBranch(params.editorBranch || null); setEditorLine(params.editorLine || null); setEditorFrom(params.editorFrom || null); setEditorFromId(params.editorFromId || null); setEditorFromLabel(params.editorFromLabel || null) }
    if (view === 'sessions') { setSelectedSessionId(params.sessionId || null); setSelectedSessionEventId(params.sessionEventId || null) }
    if (view === 'automations') { setSelectedAutomationId(params.automationId || null); setSelectedAutomationTab(params.automationTab || null); setSelectedAutomationEdit(!!params.automationEdit); setSelectedAutomationRunNumber(params.automationRunNumber || null) }
    if (view === 'agents') { setSelectedAgentTab(params.agentTab || null) }
    if (view === 'channels') setSelectedChannelId(params.channelId || null)
    if (view === 'documents') setSelectedDocumentId(params.documentId || null)
    if (view === 'metrics') setMetricsTab(params.metricsTab || null)
    if (view === 'plans') setSelectedPlanId(params.planId || null)
    const url = buildUrl(view, params)
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url)
    }
  }, [])

  // Convenience: update URL without changing view (for sub-page state changes)
  const pushUrl = useCallback((view: View, params: RouteParams) => {
    const url = buildUrl(view, params)
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url)
    }
  }, [])

  // Legacy wrapper for simple view toggles (keyboard shortcuts, TopBar)
  const setActiveView = useCallback((viewOrFn: View | ((prev: View) => View)) => {
    setActiveViewRaw(prev => {
      const next = typeof viewOrFn === 'function' ? viewOrFn(prev) : viewOrFn
      const url = buildUrl(next)
      if (window.location.pathname + window.location.search !== url) {
        window.history.pushState(null, '', url)
      }
      return next
    })
  }, [])
  const [directorCollapsed, setDirectorCollapsed] = useState(() => {
    const saved = localStorage.getItem('sf-director-collapsed')
    if (saved !== null) return saved === 'true'
    // Default collapsed on mobile
    return window.innerWidth < 768
  })
  const [directorExpandState, setDirectorExpandState] = useState<'contracted' | 'expanded' | 'full'>('contracted')

  // Persist director collapsed state
  useEffect(() => {
    localStorage.setItem('sf-director-collapsed', String(directorCollapsed))
  }, [directorCollapsed])
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>(initialMockTasks)
  const [mergeRequests, setMergeRequests] = useState(mockMergeRequestsExtended)
  const [ciActions, setCIActions] = useState(mockCIActions)
  const [taskViewMode, setTaskViewMode] = useState<'kanban' | 'list'>('kanban')
  const [diffContext, setDiffContext] = useState<{ taskId: string; branch: string } | null>(null)
  const [editorFile, setEditorFile] = useState<string | null>(null)
  const [editorBranch, setEditorBranch] = useState<string | null>(null)
  const [editorLine, setEditorLine] = useState<number | null>(null)
  const [editorFrom, setEditorFrom] = useState<string | null>(null)
  const [editorFromId, setEditorFromId] = useState<string | null>(null)
  const [editorFromLabel, setEditorFromLabel] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [peekTaskId, setPeekTaskId] = useState<string | null>(null)
  const [taskDetailId, setTaskDetailId] = useState<string | null>(() => getInitialRoute().params.taskId || null)
  const [previousView, setPreviousView] = useState<View | null>(null)
  const [selectedMRId, setSelectedMRId] = useState<string | null>(() => getInitialRoute().params.mrId || null)
  const [selectedMRTab, setSelectedMRTab] = useState<string | null>(() => getInitialRoute().params.mrTab || null)
  const [selectedCIRunId, setSelectedCIRunId] = useState<string | null>(() => getInitialRoute().params.ciRunId || null)
  const [selectedCIJobId, setSelectedCIJobId] = useState<string | null>(() => getInitialRoute().params.ciJobId || null)
  const [externalDirectorId, setExternalDirectorId] = useState<string | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(() => getInitialRoute().params.documentId || null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => getInitialRoute().params.agentId || null)
  const [selectedAgentTab, setSelectedAgentTab] = useState<string | null>(() => getInitialRoute().params.agentTab || null)
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(() => getInitialRoute().params.agentPoolId || null)
  const [agentCreateMode, setAgentCreateMode] = useState<boolean>(() => !!getInitialRoute().params.agentCreate)
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(() => getInitialRoute().params.runtimeId || null)
  const [runtimeCreateMode, setRuntimeCreateMode] = useState<boolean>(() => !!getInitialRoute().params.runtimeCreate)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [previewEnvironments, setPreviewEnvironments] = useState<PreviewEnvironment[]>(initialPreviewEnvs)
  const [previewTabs, setPreviewTabs] = useState<PreviewTab[]>(initialPreviewTabs)
  const [activePreviewTabId, setActivePreviewTabId] = useState<string | null>(() => getInitialRoute().params.previewTabId || null)
  const [activeWhiteboardDirectorId, setActiveWhiteboardDirectorId] = useState<string | null>(() => getInitialRoute().params.whiteboardDirectorId || null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => getInitialRoute().params.sessionId || null)
  const [selectedSessionEventId, setSelectedSessionEventId] = useState<string | null>(() => getInitialRoute().params.sessionEventId || null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(() => getInitialRoute().params.channelId || null)

  // ── Workspace state (lifted) ──
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('ws-1')
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // ── Team mode state ──
  const [appMode, setAppMode] = useState<AppMode>(() => (localStorage.getItem('sf-app-mode') as AppMode) || 'solo')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced')
  const [incomingChanges, setIncomingChanges] = useState<IncomingChange[]>([])
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])

  // Persist appMode to localStorage
  useEffect(() => { localStorage.setItem('sf-app-mode', appMode) }, [appMode])

  // Demo timers for team-mode visual effects
  useEffect(() => {
    if (appMode !== 'team') {
      setSyncStatus('synced')
      setIncomingChanges([])
      setConflicts([])
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []

    // 7s: sync pulse
    timers.push(setTimeout(() => {
      setSyncStatus('syncing')
      timers.push(setTimeout(() => setSyncStatus('synced'), 2000))
    }, 7000))

    // 12s: incoming change toast
    timers.push(setTimeout(() => {
      const change = mockIncomingChanges[0]
      setIncomingChanges(prev => [...prev, change])
      setToasts(prev => [...prev, {
        id: `team-change-${Date.now()}`,
        type: 'team-change' as const,
        workspaceId: activeWorkspaceId,
        message: `Sarah Chen ${change.action}`,
        timestamp: 'just now',
        actorId: change.userId,
      }])
    }, 12000))

    // 20s: conflict item
    timers.push(setTimeout(() => {
      setConflicts(mockConflicts)
    }, 20000))

    return () => timers.forEach(clearTimeout)
  }, [appMode])

  const handleSwitchWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id)
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, lastOpened: Date.now() } : w))
  }, [])

  const handleUpdateActiveWorkspace = useCallback((updates: { name?: string; icon?: string; description?: string }) => {
    setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? { ...w, ...updates } : w))
  }, [activeWorkspaceId])

  const handleDismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleMarkNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  // Demo: show toast notifications after a delay
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setToasts(prev => [...prev, {
        id: 'toast-1', workspaceId: 'ws-2', type: 'agent-completed',
        message: 'Agent Bravo completed "Hero section redesign"', timestamp: 'just now',
      }])
    }, 5000)
    const timer2 = setTimeout(() => {
      setToasts(prev => [...prev, {
        id: 'toast-2', workspaceId: 'ws-3', type: 'agent-error',
        message: 'Agent Delta failed on "Push notification integration"', timestamp: 'just now',
      }])
    }, 9000)
    return () => { clearTimeout(timer1); clearTimeout(timer2) }
  }, [])
  const [metricsTab, setMetricsTab] = useState<string | null>(() => getInitialRoute().params.metricsTab || null)
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(() => getInitialRoute().params.automationId || null)
  const [selectedAutomationTab, setSelectedAutomationTab] = useState<string | null>(() => getInitialRoute().params.automationTab || null)
  const [selectedAutomationEdit, setSelectedAutomationEdit] = useState<boolean>(!!getInitialRoute().params.automationEdit)
  const [selectedAutomationRunNumber, setSelectedAutomationRunNumber] = useState<number | null>(getInitialRoute().params.automationRunNumber || null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => getInitialRoute().params.planId || null)
  const [kanbanPlanFilter, setKanbanPlanFilter] = useState<{ planId: string; planName: string } | null>(null)
  const [tasksActiveTab, setTasksActiveTab] = useState<'tasks' | 'plans'>(() => {
    const route = getInitialRoute()
    // If initial URL is /plans, show the plans tab on the tasks page
    if (route.view === 'plans') return 'plans'
    return 'tasks'
  })

  const handleUpdateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
  }, [])

  const handleToggleSelect = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const handleClearSelection = useCallback(() => setSelectedTaskIds(new Set()), [])

  const navigateTo = useCallback((view: View) => {
    navigate(view)
  }, [navigate])

  // Derived preview state
  const activePreviewTab = previewTabs.find(t => t.id === activePreviewTabId) || previewTabs[0] || null
  const activePreviewConsole = activePreviewTab ? (mockPreviewConsoleEntries[activePreviewTab.id] || []) : []

  // Navigate to preview for a given MR (or task via its linked MR)
  const handleNavigateToPreview = useCallback((mrId: string) => {
    const existing = previewTabs.find(t => t.linkedMRId === mrId)
    if (existing) {
      navigate('preview', { previewTabId: existing.id })
    } else {
      const mr = mergeRequests.find(m => m.id === mrId)
      if (mr && mr.previewUrl) {
        const newTab: PreviewTab = {
          id: `ptab-${Date.now()}`,
          envId: 'env-1',
          name: mr.branch || mr.title,
          url: mr.previewUrl,
          branch: mr.branch,
          linkedTaskId: mr.linkedTaskId,
          linkedMRId: mr.id,
          previewStatus: (mr.previewStatus as PreviewTab['previewStatus']) || 'ready',
        }
        setPreviewTabs(prev => [...prev, newTab])
        navigate('preview', { previewTabId: newTab.id })
      }
    }
  }, [previewTabs, navigate])

  const handleNavigateToPreviewFromTask = useCallback((taskId: string) => {
    // Find an MR linked to this task
    const mr = mergeRequests.find(m => m.linkedTaskId === taskId)
    if (mr) handleNavigateToPreview(mr.id)
  }, [handleNavigateToPreview])

  const handleNavigateToWhiteboard = useCallback((directorId: string) => {
    navigate('whiteboard', { whiteboardDirectorId: directorId })
  }, [navigate])

  const goHome = useCallback(() => { setKanbanPlanFilter(null); navigate('kanban') }, [navigate])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case '1': e.preventDefault(); navigateTo('kanban'); break
          case '2': e.preventDefault(); setActiveView(v => v === 'merge-requests' ? 'kanban' : 'merge-requests'); break
          case '3': e.preventDefault(); setActiveView(v => v === 'ci' ? 'kanban' : 'ci'); break
          case '4': e.preventDefault(); setActiveView(v => v === 'preview' ? 'kanban' : 'preview'); break
          case '5': e.preventDefault(); navigateTo('agents'); break
          case '6': e.preventDefault(); navigateTo('automations'); break
          case '`': e.preventDefault(); setTerminalOpen(p => !p); break
          case 'k': e.preventDefault(); setCommandPaletteOpen(true); break
        }
      }
      // C key — create task (only when not typing)
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setCreateDialogOpen(true)
      }
      if (e.key === 'Escape') {
        if (commandPaletteOpen) setCommandPaletteOpen(false)
        else if (createDialogOpen) setCreateDialogOpen(false)
        else if (activeView === 'task-detail') goHome()
        else if (activeView !== 'kanban') goHome()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeView, navigateTo, goHome])

  const isOverlay = activeView !== 'kanban'

  return (
    <TeamContextProvider appMode={appMode} syncStatus={syncStatus}>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="app-shell" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Activity Rail */}
        <ActivityRail activeView={activeView} onNavigate={navigateTo} theme={theme} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSwitchWorkspace={handleSwitchWorkspace} onNewWorkspace={() => setCreateWorkspaceOpen(true)} appMode={appMode} currentUser={currentUser} onToggleMode={() => setAppMode(m => m === 'solo' ? 'team' : 'solo')} />

        {/* Center area: top bar + main content + bottom panel */}
        <div style={{ flex: 1, display: directorExpandState === 'full' && !directorCollapsed ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TopBar
            activeView={activeView}
            onOpenSearch={() => setCommandPaletteOpen(true)}
            activeWorkspace={workspaces.find(w => w.id === activeWorkspaceId)}
            workspaces={workspaces}
            onSwitchWorkspace={handleSwitchWorkspace}
            notifications={notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            onNavigateToSettings={() => navigate('settings')}
            appMode={appMode}
            syncStatus={syncStatus}
            workspacePresence={appMode === 'team' ? mockPresence.filter(p => p.workspaceId === activeWorkspaceId && p.userId !== currentUser.id).map(p => TEAM_MEMBERS.find(m => m.id === p.userId)!).filter(Boolean) : []}
            presence={appMode === 'team' ? mockPresence : []}
            daemonState={mockDaemonState}
            onNavigateToRuntimes={() => navigate('agents', { agentTab: 'runtimes' })}
          />

          {/* Conflict resolution banner — team mode only */}
          {appMode === 'team' && conflicts.length > 0 && (
            <ConflictBanner
              conflicts={conflicts}
              onKeepMine={(id) => setConflicts(c => c.filter(x => x.id !== id))}
              onUseTheirs={(id) => setConflicts(c => c.filter(x => x.id !== id))}
            />
          )}

          {/* Main content + bottom panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {renderMainContent()}
            </div>

            {/* Active agents strip — Tasks page only */}
            {activeView === 'kanban' && (
              <ActiveAgentsStrip
                tasks={tasks}
                directors={mockDirectors}
                onSelectTask={(taskId) => {
                  setTaskDetailId(taskId)
                  navigate('task-detail', { taskId })
                }}
                onSelectDirector={(dirId) => {
                  setExternalDirectorId(dirId)
                  if (directorCollapsed) setDirectorCollapsed(false)
                }}
              />
            )}

            {/* Bottom panel (terminal) */}
            <BottomPanel
              open={terminalOpen}
              onToggle={() => setTerminalOpen(p => !p)}
              activeView={activeView}
              activePreviewTab={activePreviewTab}
              previewConsoleEntries={activePreviewConsole}
            />
          </div>
        </div>

        {/* Director Panel */}
        <DirectorPanel
          directors={mockDirectors}
          collapsed={directorCollapsed}
          onToggleCollapse={() => setDirectorCollapsed(p => !p)}
          expandState={directorExpandState}
          onCycleExpand={() => setDirectorExpandState(s => s === 'contracted' ? 'expanded' : s === 'expanded' ? 'full' : 'contracted')}
          externalActiveId={externalDirectorId}
          onNavigateToWhiteboard={handleNavigateToWhiteboard}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSwitchWorkspace={handleSwitchWorkspace}
        />
      </div>

      {/* Command palette */}
      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          onNavigate={(view) => { navigate(view as View); setCommandPaletteOpen(false) }}
          onNavigateToTask={(tid) => { navigate('task-detail', { taskId: tid }); setCommandPaletteOpen(false) }}
          onCreateTask={() => { setCommandPaletteOpen(false); setCreateDialogOpen(true) }}
          onNewWorkspace={() => { setCommandPaletteOpen(false); setCreateWorkspaceOpen(true) }}
          onToggleTerminal={() => { setTerminalOpen(p => !p); setCommandPaletteOpen(false) }}
          onToggleTheme={() => { setTheme(t => t === 'dark' ? 'light' : 'dark'); setCommandPaletteOpen(false) }}
          tasks={tasks}
          theme={theme}
        />
      )}

      {/* Create task dialog */}
      {createDialogOpen && (
        <CreateTaskDialog
          onClose={() => setCreateDialogOpen(false)}
          onCreate={(partial) => {
            const newId = `SF-${160 + tasks.length}`
            const newTask: Task = {
              id: newId,
              title: partial.title || 'Untitled',
              description: partial.description,
              status: partial.status || 'todo',
              priority: partial.priority || 'medium',
              assignee: partial.assignee,
              labels: partial.labels || [],
              updatedAt: 'just now',
            }
            setTasks(prev => [newTask, ...prev])
          }}
        />
      )}

      {/* Create workspace dialog */}
      {createWorkspaceOpen && (
        <CreateWorkspaceDialog onClose={() => setCreateWorkspaceOpen(false)} />
      )}

      {/* Toast notifications */}
      <ToastNotifications
        toasts={toasts}
        workspaces={workspaces}
        onDismiss={handleDismissToast}
        onSwitch={(id) => { handleSwitchWorkspace(id); navigate('kanban') }}
      />

      {/* Onboarding wizard (shown on first visit) */}
      {!onboardingComplete && (
        <OnboardingWizard
          onComplete={(config) => {
            localStorage.setItem('sf-onboarding-complete', 'true')
            localStorage.setItem('sf-onboarding-config', JSON.stringify(config))
            setOnboardingComplete(true)
          }}
        />
      )}
    </div>
    </TeamContextProvider>
  )

  function renderMainContent() {
    switch (activeView) {
      case 'kanban':
      case 'plans':
        return <TasksPage
          tasks={tasks}
          onSelectTask={(t) => navigate('task-detail', { taskId: t.id })}
          viewMode={taskViewMode}
          onToggleView={() => setTaskViewMode(v => v === 'kanban' ? 'list' : 'kanban')}
          onUpdateTask={handleUpdateTask}
          selectedTaskIds={selectedTaskIds}
          onToggleSelect={handleToggleSelect}
          onClearSelection={handleClearSelection}
          peekTaskId={peekTaskId}
          onPeekTask={setPeekTaskId}
          onCreateTask={() => setCreateDialogOpen(true)}
          initialPlanFilter={kanbanPlanFilter}
          activeTab={activeView === 'plans' ? 'plans' : tasksActiveTab}
          onTabChange={(tab) => {
            setTasksActiveTab(tab)
            if (tab === 'plans') { navigate('plans') }
            else { setKanbanPlanFilter(null); navigate('kanban') }
          }}
          onNavigateToTask={(tid) => { setPreviousView('kanban'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToWhiteboard={handleNavigateToWhiteboard}
          onNavigateToTasksBoard={(planId, planName) => { setKanbanPlanFilter({ planId, planName }); setTasksActiveTab('tasks'); navigate('kanban') }}
          initialPlanId={selectedPlanId}
          onPlanChange={(planId) => { setSelectedPlanId(planId); pushUrl('plans', { planId }) }}
        />
      case 'task-detail': {
        const detailTask = tasks.find(t => t.id === taskDetailId)
        if (!detailTask) return <PlaceholderOverlay title="Task not found" onBack={goHome} />
        const topLevelIds = tasks.filter(t => !t.parentId).map(t => t.id)
        const taskDetailBack = () => {
          if (previousView && previousView !== 'task-detail') {
            setActiveView(previousView)
            setPreviousView(null)
          } else {
            goHome()
          }
        }
        return <TaskDetailOverlay
          task={detailTask}
          allTasks={tasks}
          onBack={taskDetailBack}
          onUpdateTask={handleUpdateTask}
          onNavigate={(view: string) => setActiveView(view as View)}
          onViewDiff={(tid: string, branch: string) => { setDiffContext({ taskId: tid, branch }); setActiveView('diff') }}
          onNavigateToTask={(tid: string) => navigate('task-detail', { taskId: tid })}
          onNavigateToPreview={handleNavigateToPreviewFromTask}
          onSelectDirector={(dirId: string) => { setExternalDirectorId(dirId); if (directorCollapsed) setDirectorCollapsed(false) }}
          onSelectAgent={(agentId: string) => { setSelectedAgentId(agentId); setSelectedAgentTab(null); navigate('agents', { agentId }) }}
          onOpenInEditor={(branch: string) => navigate('editor', { editorBranch: branch })}
          onNavigateToWhiteboard={handleNavigateToWhiteboard}
          siblingIds={topLevelIds}
        />
      }
      case 'editor':
        return <EditorOverlayNew onBack={goHome} filePath={editorFile} branch={editorBranch} editorLine={editorLine} editorFrom={editorFrom} editorFromId={editorFromId} editorFromLabel={editorFromLabel} />
      case 'merge-requests':
        return <MergeRequestsOverlay
          mergeRequests={mergeRequests}
          onBack={goHome}
          onNavigateToTask={(tid) => { setPreviousView('merge-requests'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToAgents={() => navigate('agents')}
          initialMRId={selectedMRId}
          initialTab={selectedMRTab}
          onMRChange={(mrId, tab) => { setSelectedMRId(mrId); setSelectedMRTab(tab); pushUrl('merge-requests', { mrId, mrTab: tab }) }}
          onOpenDirector={(directorId) => { setDirectorCollapsed(false); setExternalDirectorId(directorId) }}
          onNavigateToPreview={handleNavigateToPreview}
          onOpenInEditor={(file, branch) => navigate('editor', { editorFile: file, editorBranch: branch })}
          onCreateMR={(partial) => {
            const newMR = {
              id: `MR-${44 + mergeRequests.length}`,
              title: partial.title || 'Untitled',
              description: partial.description,
              branch: partial.branch || 'feat/new-branch',
              targetBranch: partial.targetBranch || 'main',
              author: currentUser.name,
              status: 'open' as const,
              isDraft: partial.isDraft || false,
              ciStatus: 'pending' as const,
              reviewers: partial.reviewers || [],
              additions: 0, deletions: 0, filesChanged: 0,
              createdAt: 'just now',
              mergeStrategy: 'squash' as const,
              autoMergeEnabled: false,
              hasConflicts: false,
              mergeGates: [
                { label: 'CI checks pass', passed: false, required: true },
                { label: 'At least 1 approval', passed: false, required: true },
                { label: 'No merge conflicts', passed: true, required: true },
              ],
              labels: partial.labels || [],
            }
            setMergeRequests(prev => [newMR, ...prev])
          }}
        />
      case 'ci':
        return <CIOverlay
          runs={mockCIRuns}
          actions={ciActions}
          onBack={goHome}
          onNavigateToTask={(tid) => { setPreviousView('ci'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToMR={(mrId) => navigate('merge-requests', { mrId })}
          onNavigateToAutomation={(wfId) => navigate('automations', { automationId: wfId })}
          initialRunId={selectedCIRunId}
          initialJobId={selectedCIJobId}
          onRunChange={(runId, jobId) => { setSelectedCIRunId(runId); setSelectedCIJobId(jobId); pushUrl('ci', { ciRunId: runId, ciJobId: jobId }) }}
          onCreateAction={(action) => setCIActions(prev => [...prev, action])}
        />
      case 'whiteboard': {
        const wbDirId = activeWhiteboardDirectorId || mockDirectors[0]?.id
        const wbDir = mockDirectors.find(d => d.id === wbDirId)
        if (!wbDir) return <PlaceholderOverlay title="Whiteboard" onBack={goHome} />
        return <WhiteboardOverlay
          directorId={wbDir.id}
          directorName={wbDir.name}
          whiteboards={mockWhiteboards.filter(wb => wb.directorId === wbDir.id)}
          onBack={goHome}
          theme={theme}
          onDesignHandoff={(msg, agent) => console.log('Whiteboard handoff:', msg, 'to', agent)}
        />
      }
      case 'preview':
        return <PreviewOverlay
          onBack={goHome}
          environments={previewEnvironments}
          tabs={previewTabs}
          activeTabId={activePreviewTabId || activePreviewTab?.id || null}
          onTabChange={(tabId) => { setActivePreviewTabId(tabId); pushUrl('preview', { previewTabId: tabId }) }}
          onTabClose={(tabId) => {
            setPreviewTabs(prev => {
              const next = prev.filter(t => t.id !== tabId)
              if (activePreviewTabId === tabId) {
                const nextId = next[0]?.id || null
                setActivePreviewTabId(nextId)
                pushUrl('preview', { previewTabId: nextId })
              }
              return next
            })
          }}
          onTabAdd={(envId) => {
            const env = previewEnvironments.find(e => e.id === envId)
            if (!env) return
            const newTab: PreviewTab = { id: `ptab-${Date.now()}`, envId, name: env.name, url: env.url, previewStatus: 'ready' }
            setPreviewTabs(prev => [...prev, newTab])
            setActivePreviewTabId(newTab.id)
            pushUrl('preview', { previewTabId: newTab.id })
          }}
          onEnvironmentsChange={setPreviewEnvironments}
          onTabsChange={setPreviewTabs}
          onNavigateToTask={(tid) => { setPreviousView('preview'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToMR={(mrId) => navigate('merge-requests', { mrId })}
          onToggleTerminal={() => setTerminalOpen(p => !p)}
          terminalOpen={terminalOpen}
        />
      case 'diff':
        return <DiffOverlay context={diffContext} onBack={goHome} onOpenInEditor={(file) => navigate('editor', { editorFile: file, editorBranch: diffContext?.branch })} />
      case 'automations':
        return <AutomationsOverlay
          workflows={mockWorkflows}
          workflowRuns={mockWorkflowRuns}
          onBack={goHome}
          initialWorkflowId={selectedAutomationId}
          initialTab={selectedAutomationTab}
          initialEdit={selectedAutomationEdit}
          initialRunNumber={selectedAutomationRunNumber}
          onWorkflowChange={(id: string | null, tab: string | null, edit: boolean, runNumber?: number | null) => {
            setSelectedAutomationId(id)
            setSelectedAutomationTab(tab)
            setSelectedAutomationEdit(edit)
            setSelectedAutomationRunNumber(runNumber || null)
            pushUrl('automations', { automationId: id, automationTab: tab, automationEdit: edit || null, automationRunNumber: runNumber })
          }}
          onNavigateToCI={(runId) => navigate('ci', { ciRunId: runId })}
          onNavigateToMR={(mrId) => navigate('merge-requests', { mrId })}
          onNavigateToTask={(tid) => { setPreviousView('automations'); navigate('task-detail', { taskId: tid }) }}
        />
      case 'agents':
      case 'sessions':
        return <AgentsOverlay
          onBack={() => goHome()}
          onNavigateToWhiteboard={handleNavigateToWhiteboard}
          onNavigateToTask={(tid) => { setPreviousView('agents'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToMR={(mrId) => navigate('merge-requests', { mrId })}
          initialAgentId={selectedAgentId}
          initialTab={activeView === 'sessions' ? 'sessions' : selectedAgentTab}
          initialPoolId={selectedPoolId}
          initialCreate={agentCreateMode}
          initialSessionId={selectedSessionId}
          initialSessionEventId={selectedSessionEventId}
          onAgentChange={(agentId, tab) => {
            setSelectedAgentId(agentId)
            setSelectedAgentTab(tab)
            setSelectedPoolId(null)
            setAgentCreateMode(false)
            pushUrl('agents', { agentId, agentTab: tab })
          }}
          onPoolChange={(poolId) => {
            setSelectedPoolId(poolId)
            setSelectedAgentId(null)
            setAgentCreateMode(false)
            pushUrl('agents', { agentPoolId: poolId })
          }}
          onCreateChange={(creating) => {
            setAgentCreateMode(creating)
            setSelectedAgentId(null)
            setSelectedPoolId(null)
            if (creating) pushUrl('agents', { agentCreate: true })
            else pushUrl('agents', {})
          }}
          onSessionChange={(sessionId, eventId) => {
            setSelectedSessionId(sessionId)
            setSelectedSessionEventId(eventId)
            pushUrl('agents', { agentTab: 'sessions' })
          }}
          onNavigateToRuntimes={() => { navigate('agents', { agentTab: 'runtimes' }) }}
          onCreateSession={() => {}}
          tasks={tasks.map(t => ({ id: t.id, title: t.title }))}
        />
      // 'sessions' now handled above as a case alongside 'agents'
      // 'runtimes' view removed — runtimes are now a tab within the Agents page
      case 'settings':
        return <SettingsOverlay
          onBack={goHome}
          appMode={appMode}
          onToggleMode={() => setAppMode(m => m === 'solo' ? 'team' : 'solo')}
          activeWorkspace={workspaces.find(w => w.id === activeWorkspaceId)}
          onUpdateActiveWorkspace={handleUpdateActiveWorkspace}
        />
      case 'documents':
        return <DocumentsOverlay
          onBack={goHome}
          initialDocId={selectedDocumentId}
          onDocChange={(docId) => {
            setSelectedDocumentId(docId)
            pushUrl('documents', { documentId: docId })
          }}
          onNavigateToTask={(tid) => { setPreviousView('documents'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToMR={(mrId) => navigate('merge-requests', { mrId })}
        />
      case 'channels':
        return <MessagesOverlay
          channels={mockChannels}
          messages={mockMessages}
          sessionCards={mockSessionCards}
          entities={mockMsgEntities}
          onBack={goHome}
          initialChannelId={selectedChannelId}
          onChannelChange={(channelId) => {
            setSelectedChannelId(channelId)
            pushUrl('channels', { channelId })
          }}
          onNavigateToSession={(sessionId) => { setSelectedSessionId(sessionId); setSelectedSessionEventId(null); navigate('agents', { agentTab: 'sessions' }) }}
          onNavigateToTask={(taskId) => { setPreviousView('channels'); navigate('task-detail', { taskId }) }}
        />
      // 'plans' now handled above as a case alongside 'kanban'
      case 'metrics':
        return <MetricsOverlay
          onBack={goHome}
          initialTab={metricsTab}
          onTabChange={(tab) => { setMetricsTab(tab); pushUrl('metrics', { metricsTab: tab }) }}
          onNavigateToTask={(tid) => { setPreviousView('metrics'); navigate('task-detail', { taskId: tid }) }}
          onNavigateToMR={(mrId) => navigate('merge-requests', { mrId })}
          onNavigateToCIRun={(runId) => navigate('ci', { ciRunId: runId })}
        />
    }
  }
}

/* Old TaskDetail removed — replaced by TaskDetailOverlay */
function _unused_TaskDetail({ task, allTasks, onClose, onNavigate, onViewDiff }: { task: Task; allTasks: Task[]; onClose: () => void; onNavigate: (view: View) => void; onViewDiff: (taskId: string, branch: string) => void }) {
  const subTasks = task.subTaskIds ? allTasks.filter(t => task.subTaskIds!.includes(t.id)) : []
  const parentTask = task.parentId ? allTasks.find(t => t.id === task.parentId) : null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 'var(--z-overlay)' as unknown as number }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '90vw', background: 'var(--color-bg)', borderLeft: '1px solid var(--color-border)', zIndex: 'var(--z-modal)' as unknown as number, overflow: 'auto', animation: 'slideIn 0.15s ease-out', display: 'flex', flexDirection: 'column' }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{task.id}</div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>{task.title}</h2>
            </div>
            <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>

          {/* Labels */}
          {task.labels.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
              {task.labels.map(l => (
                <span key={l} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>{l}</span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
          {/* Metadata grid */}
          <div style={{ padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <MetaRow label="Status" value={task.status.replace(/_/g, ' ')} />
            <MetaRow label="Priority" value={task.priority} color={task.priority === 'urgent' ? 'var(--color-danger)' : task.priority === 'high' ? 'var(--color-warning)' : undefined} />
            {task.assignee && <MetaRow label="Assignee" value={task.assignee.name} />}
            {task.estimate && <MetaRow label="Estimate" value={`${task.estimate} points`} />}
            {task.dueDate && <MetaRow label="Due date" value={task.dueDate} />}
            {task.branch && <MetaRow label="Branch" value={task.branch} mono />}
            {parentTask && <MetaRow label="Parent" value={`${parentTask.id}: ${parentTask.title}`} />}
          </div>

          {/* Description */}
          {task.description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Description</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>{task.description}</div>
            </div>
          )}

          {/* Sub-tasks */}
          {subTasks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Sub-tasks ({subTasks.filter(s => s.status === 'done').length}/{subTasks.length})</div>
              <div style={{ background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {subTasks.map((sub, i) => (
                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: i < subTasks.length - 1 ? '1px solid var(--color-border-subtle)' : 'none', fontSize: 12 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: sub.status === 'done' ? 'none' : '1.5px solid var(--color-border)', background: sub.status === 'done' ? 'var(--color-success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {sub.status === 'done' && <span style={{ color: 'white', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, flexShrink: 0 }}>{sub.id}</span>
                    <span style={{ color: sub.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: sub.status === 'done' ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'capitalize', flexShrink: 0 }}>{sub.status.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked resources */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Linked Resources</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {/* Session */}
            {task.sessionStatus && (
              <LinkCard
                label="Director Session"
                status={task.sessionStatus}
                statusColor={task.sessionStatus === 'running' ? 'var(--color-success)' : task.sessionStatus === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'}
                detail={task.assignee?.name || 'Unassigned'}
                actionLabel={task.sessionStatus === 'running' ? 'Jump to session' : 'View session'}
                onClick={onClose}
              />
            )}
            {/* MR */}
            {task.mrStatus && task.mrStatus !== 'none' && (
              <LinkCard
                label="Merge Request"
                status={task.mrStatus.replace(/_/g, ' ')}
                statusColor={task.mrStatus === 'needs_review' ? 'var(--color-warning)' : task.mrStatus === 'merged' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}
                detail={task.branch || ''}
                actionLabel="Open MR"
                onClick={() => onNavigate('merge-requests')}
              />
            )}
            {/* CI */}
            {task.ciStatus && task.ciStatus !== 'none' && (
              <LinkCard
                label="CI/CD"
                status={task.ciStatus}
                statusColor={task.ciStatus === 'pass' ? 'var(--color-success)' : task.ciStatus === 'fail' ? 'var(--color-danger)' : 'var(--color-warning)'}
                detail={task.branch || ''}
                actionLabel="View pipeline"
                onClick={() => onNavigate('ci')}
              />
            )}
            {/* Diff — always show if branch exists */}
            {task.branch && (
              <LinkCard
                label="Changes"
                status={task.ciStatus === 'pass' ? 'Ready' : 'In progress'}
                statusColor="var(--color-text-tertiary)"
                detail={task.branch}
                actionLabel="View diff"
                onClick={() => onViewDiff(task.id, task.branch!)}
              />
            )}
          </div>

          {/* Activity log */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {getActivityForTask(task).map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < getActivityForTask(task).length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{entry.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{entry.text}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{entry.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function LinkCard({ label, status, statusColor, detail, actionLabel, onClick }: { label: string; status: string; statusColor: string; detail: string; actionLabel: string; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', cursor: 'pointer', transition: `all var(--duration-fast)` }}
      onClick={onClick}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2, fontFamily: detail.includes('/') ? 'var(--font-mono)' : undefined }}>{detail}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color: statusColor, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
        {status}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-accent)', fontWeight: 500 }}>{actionLabel} →</span>
    </div>
  )
}

function getActivityForTask(task: Task): { avatar: string; text: string; time: string }[] {
  const activity = []
  if (task.sessionStatus === 'running') {
    activity.push({ avatar: 'DA', text: `${task.assignee?.name || 'Agent'} started working on this task`, time: task.updatedAt })
  }
  if (task.mrStatus === 'needs_review') {
    activity.push({ avatar: 'DB', text: `${task.assignee?.name || 'Agent'} opened a merge request for review`, time: '20 min ago' })
  }
  if (task.mrStatus === 'open') {
    activity.push({ avatar: 'DB', text: `${task.assignee?.name || 'Agent'} pushed changes to ${task.branch}`, time: '45 min ago' })
  }
  if (task.ciStatus === 'fail') {
    activity.push({ avatar: 'CI', text: 'CI pipeline failed — 1 test failure', time: '40 min ago' })
  }
  if (task.ciStatus === 'pass') {
    activity.push({ avatar: 'CI', text: 'CI pipeline passed — all checks green', time: '25 min ago' })
  }
  if (task.mrStatus === 'merged') {
    activity.push({ avatar: 'Y', text: 'You merged the pull request', time: task.updatedAt })
  }
  activity.push({ avatar: 'Y', text: 'Task created', time: '3 days ago' })
  return activity
}

function MetaRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 70, fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: mono ? 12 : 13, color: color || 'var(--color-text-secondary)', textTransform: mono ? undefined : 'capitalize', fontFamily: mono ? 'var(--font-mono)' : undefined } as React.CSSProperties}>{value}</span>
    </div>
  )
}
