// ── Onboarding Types & Constants ──

export type WorkflowPreset = 'auto' | 'review' | 'approve'
export type AgentProviderType = 'claude-code' | 'codex' | 'opencode'
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type RuntimeMode = 'worktrees' | 'docker' | 'sandbox'

export type IssueSyncOption = 'none' | 'linear' | 'github'
export type MRSyncOption = 'none' | 'github'
export type DocSyncOption = 'none' | 'repo-folder' | 'notion' | 'obsidian'
export type NotificationOption = 'none' | 'slack' | 'discord' | 'telegram'

export interface AgentConfig {
  name: string
  provider: AgentProviderType
  model: string
  effort: EffortLevel
}

export interface OnboardingState {
  step: number
  // Screen 1
  workflowPreset: WorkflowPreset
  agentProvider: AgentProviderType
  defaultBranch: string
  // Screen 2
  agents: AgentConfig[]
  // Screen 3
  issueSync: IssueSyncOption
  mrSync: MRSyncOption
  docSync: DocSyncOption
  docPath: string
  notificationEndpoint: NotificationOption
  // Screen 4 — Default Runtime
  runtimeName: string
  runtimeMode: RuntimeMode
  worktreePath: string
  dockerImage: string
}

// ── Action Types ──

export type OnboardingAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'SET_WORKFLOW_PRESET'; preset: WorkflowPreset }
  | { type: 'SET_AGENT_PROVIDER'; provider: AgentProviderType }
  | { type: 'SET_BRANCH'; branch: string }
  | { type: 'UPDATE_AGENT'; index: number; updates: Partial<Pick<AgentConfig, 'provider' | 'model' | 'effort'>> }
  | { type: 'ADD_AGENT' }
  | { type: 'REMOVE_AGENT'; index: number }
  | { type: 'SET_ISSUE_SYNC'; value: IssueSyncOption }
  | { type: 'SET_MR_SYNC'; value: MRSyncOption }
  | { type: 'SET_DOC_SYNC'; value: DocSyncOption }
  | { type: 'SET_DOC_PATH'; path: string }
  | { type: 'SET_NOTIFICATION'; value: NotificationOption }
  | { type: 'SET_RUNTIME_NAME'; name: string }
  | { type: 'SET_RUNTIME_MODE'; mode: RuntimeMode }
  | { type: 'SET_WORKTREE_PATH'; path: string }
  | { type: 'SET_DOCKER_IMAGE'; image: string }

// ── Constants ──

export const WORKFLOW_PRESETS: { id: WorkflowPreset; name: string; description: string; icon: string }[] = [
  { id: 'auto', name: 'Auto', icon: 'zap', description: 'Agents merge directly to main. Tests must pass. Best for solo developers and rapid prototyping.' },
  { id: 'review', name: 'Review', icon: 'eye', description: 'Agents merge to a review branch. You review and merge to main when ready. Best for teams wanting oversight without blocking agents.' },
  { id: 'approve', name: 'Approve', icon: 'shield-check', description: 'Agents need permission for restricted actions. Merges via GitHub PRs. Best for production codebases and regulated environments.' },
]

export const AGENT_PROVIDERS: { id: AgentProviderType; name: string }[] = [
  { id: 'claude-code', name: 'Claude Code' },
  { id: 'codex', name: 'OpenAI Codex' },
  { id: 'opencode', name: 'OpenCode' },
]

export const MODELS_BY_PROVIDER: Record<AgentProviderType, { id: string; name: string }[]> = {
  'claude-code': [
    { id: 'opus-4.6-1m', name: 'Claude Opus 4.6 1M' },
    { id: 'opus-4.6', name: 'Claude Opus 4.6' },
    { id: 'sonnet-4.6', name: 'Claude Sonnet 4.6' },
    { id: 'haiku-4.5', name: 'Claude Haiku 4.5' },
  ],
  'codex': [
    { id: 'gpt-5.4', name: 'GPT 5.4' },
    { id: 'gpt-5-mini', name: 'GPT 5 Mini' },
  ],
  'opencode': [
    { id: 'gpt-5.4', name: 'GPT 5.4' },
    { id: 'gpt-5-mini', name: 'GPT 5 Mini' },
  ],
}

export const EFFORT_LEVELS: { id: EffortLevel; name: string }[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

export const MOCK_BRANCHES = [
  'main', 'master', 'develop', 'staging',
  'feature/auth', 'feature/payments', 'feature/dashboard',
  'fix/login-redirect', 'release/v2.0', 'hotfix/cors',
]

export const STEP_LABELS = [
  'Workspace',
  'Runtime',
  'Agents',
  'Integrations',
  'Summary',
]

// ── Default Agent Names ──

const DEFAULT_AGENT_NAMES = [
  'Agent Alpha', 'Agent Beta', 'Agent Gamma', 'Agent Delta',
  'Agent Epsilon', 'Agent Zeta', 'Agent Eta', 'Agent Theta',
]

function getDefaultConfig(provider: AgentProviderType): Pick<AgentConfig, 'provider' | 'model' | 'effort'> {
  const isClaudeCode = provider === 'claude-code'
  const models = MODELS_BY_PROVIDER[provider]
  return { provider, model: isClaudeCode ? 'sonnet-4.6' : models[0].id, effort: 'high' }
}

export function createAgent(provider: AgentProviderType, existingAgents: AgentConfig[]): AgentConfig {
  const count = existingAgents.length
  const name = count < DEFAULT_AGENT_NAMES.length ? DEFAULT_AGENT_NAMES[count] : `Agent ${count + 1}`
  return { name, ...getDefaultConfig(provider) }
}

export function getDefaultAgents(provider: AgentProviderType): AgentConfig[] {
  const cfg = getDefaultConfig
  return [
    { name: 'Agent Alpha', ...cfg(provider) },
    { name: 'Agent Beta', ...cfg(provider) },
    { name: 'Agent Gamma', ...cfg(provider) },
  ]
}

// ── Initial State ──

export const INITIAL_STATE: OnboardingState = {
  step: 0,
  workflowPreset: 'review',
  agentProvider: 'claude-code',
  defaultBranch: 'main',
  agents: getDefaultAgents('claude-code'),
  issueSync: 'none',
  mrSync: 'none',
  docSync: 'repo-folder',
  docPath: 'docs/',
  notificationEndpoint: 'none',
  runtimeName: '',
  runtimeMode: 'worktrees',
  worktreePath: '.stoneforge/worktrees',
  dockerImage: 'ghcr.io/stoneforge/worker:latest',
}

// ── Reducer ──

export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step }
    case 'SET_WORKFLOW_PRESET':
      return { ...state, workflowPreset: action.preset }
    case 'SET_AGENT_PROVIDER':
      return { ...state, agentProvider: action.provider, agents: getDefaultAgents(action.provider) }
    case 'SET_BRANCH':
      return { ...state, defaultBranch: action.branch }
    case 'UPDATE_AGENT': {
      const agents = [...state.agents]
      const agent = { ...agents[action.index] }
      if (action.updates.provider !== undefined) {
        agent.provider = action.updates.provider
        const models = MODELS_BY_PROVIDER[agent.provider]
        agent.model = models[0].id
      }
      if (action.updates.model !== undefined) agent.model = action.updates.model
      if (action.updates.effort !== undefined) agent.effort = action.updates.effort
      agents[action.index] = agent
      return { ...state, agents }
    }
    case 'ADD_AGENT': {
      const newAgent = createAgent(state.agentProvider, state.agents)
      return { ...state, agents: [...state.agents, newAgent] }
    }
    case 'REMOVE_AGENT': {
      if (state.agents.length <= 1) return state
      return { ...state, agents: state.agents.filter((_, i) => i !== action.index) }
    }
    case 'SET_ISSUE_SYNC':
      return { ...state, issueSync: action.value }
    case 'SET_MR_SYNC':
      return { ...state, mrSync: action.value }
    case 'SET_DOC_SYNC':
      return { ...state, docSync: action.value }
    case 'SET_DOC_PATH':
      return { ...state, docPath: action.path }
    case 'SET_NOTIFICATION':
      return { ...state, notificationEndpoint: action.value }
    case 'SET_RUNTIME_NAME':
      return { ...state, runtimeName: action.name }
    case 'SET_RUNTIME_MODE':
      return { ...state, runtimeMode: action.mode }
    case 'SET_WORKTREE_PATH':
      return { ...state, worktreePath: action.path }
    case 'SET_DOCKER_IMAGE':
      return { ...state, dockerImage: action.image }
    default:
      return state
  }
}
