/**
 * Tour Mock Data Module
 *
 * Injects realistic sample data into the React Query cache during onboarding
 * tour steps. This allows the tour to show populated pages (agent cards, tasks,
 * plans, documents, messages) even when the workspace is empty.
 *
 * Uses queryClient.setQueryData() so injected data immediately appears in every
 * component using the corresponding React Query hooks — zero component changes needed.
 */

import type { QueryClient } from '@tanstack/react-query';

import type {
  Agent,
  AgentMetadata,
  AgentsResponse,
  SessionsResponse,
  SessionRecord,
} from '../../api/types';

import type {
  Task,
  Plan,
  Document,
  Channel,
  Message,
  Library,
  Entity,
} from '../../api/hooks/useAllElements';

import { ELEMENT_KEYS } from '../../api/hooks/useAllElements';

// ============================================================================
// Types
// ============================================================================

export type TourMockContext = 'activity' | 'tasks' | 'plans' | 'documents' | 'messages';

// ============================================================================
// State Tracking
// ============================================================================

let currentContext: TourMockContext | null = null;

/** All query keys that were injected, for cleanup */
let injectedKeys: readonly (readonly unknown[])[] = [];

// ============================================================================
// Timestamp Helpers
// ============================================================================

const now = Date.now();
const hour = 3_600_000;
const day = 86_400_000;

function isoAgo(ms: number): string {
  return new Date(now - ms).toISOString();
}

// ============================================================================
// Mock IDs
// ============================================================================

const ID = {
  // Agents
  agentDirector: 'tour-mock-agent-director',
  agentWorker1: 'tour-mock-agent-worker-1',
  agentWorker2: 'tour-mock-agent-worker-2',
  agentSteward1: 'tour-mock-agent-steward-1',
  // Sessions
  sessionDirector: 'tour-mock-session-director',
  sessionWorker1: 'tour-mock-session-worker-1',
  sessionSteward1: 'tour-mock-session-steward-1',
  // Tasks
  task1: 'tour-mock-task-1',
  task2: 'tour-mock-task-2',
  task3: 'tour-mock-task-3',
  task4: 'tour-mock-task-4',
  task5: 'tour-mock-task-5',
  task6: 'tour-mock-task-6',
  task7: 'tour-mock-task-7',
  task8: 'tour-mock-task-8',
  task9: 'tour-mock-task-9',
  task10: 'tour-mock-task-10',
  // Plans
  plan1: 'tour-mock-plan-1',
  plan2: 'tour-mock-plan-2',
  plan3: 'tour-mock-plan-3',
  // Documents
  doc1: 'tour-mock-doc-1',
  doc2: 'tour-mock-doc-2',
  doc3: 'tour-mock-doc-3',
  doc4: 'tour-mock-doc-4',
  doc5: 'tour-mock-doc-5',
  // Libraries
  lib1: 'tour-mock-lib-1',
  // Channels
  channel1: 'tour-mock-channel-1',
  channel2: 'tour-mock-channel-2',
  channel3: 'tour-mock-channel-3',
  // Messages
  msg1: 'tour-mock-msg-1',
  msg2: 'tour-mock-msg-2',
  msg3: 'tour-mock-msg-3',
  msg4: 'tour-mock-msg-4',
  msg5: 'tour-mock-msg-5',
  msg6: 'tour-mock-msg-6',
  msg7: 'tour-mock-msg-7',
  msg8: 'tour-mock-msg-8',
  msg9: 'tour-mock-msg-9',
  msg10: 'tour-mock-msg-10',
  msg11: 'tour-mock-msg-11',
  // Operator
  operator: 'tour-mock-operator',
} as const;

// ============================================================================
// Mock Agent Data
// ============================================================================

function makeAgent(
  id: string,
  name: string,
  agentMeta: AgentMetadata
): Agent {
  return {
    id,
    name,
    type: 'entity' as const,
    entityType: 'agent',
    tags: [],
    status: 'active',
    createdAt: now - 7 * day,
    modifiedAt: now - hour,
    metadata: {
      agent: {
        ...agentMeta,
        lastActivityAt: now - 5 * 60_000,
      },
    },
  };
}

const mockAgents: Agent[] = [
  makeAgent(ID.agentDirector, 'director', {
    agentRole: 'director',
    targetBranch: 'master',
    sessionId: ID.sessionDirector,
    sessionStatus: 'running',
  }),
  makeAgent(ID.agentWorker1, 'e-worker-1', {
    agentRole: 'worker',
    workerMode: 'ephemeral',
    branch: 'agent/e-worker-1/tour-mock-task-3',
    sessionId: ID.sessionWorker1,
    sessionStatus: 'running',
  }),
  makeAgent(ID.agentWorker2, 'e-worker-2', {
    agentRole: 'worker',
    workerMode: 'ephemeral',
    // No sessionStatus = idle/no active session
  }),
  makeAgent(ID.agentSteward1, 'm-steward-1', {
    agentRole: 'steward',
    stewardFocus: 'merge',
    sessionId: ID.sessionSteward1,
    sessionStatus: 'running',
    triggers: [{ type: 'event', event: 'task.completed' }],
  }),
];

const mockAgentsResponse: AgentsResponse = { agents: mockAgents };

// ============================================================================
// Mock Session Data
// ============================================================================

function makeSession(
  id: string,
  agentId: string,
  agentRole: 'director' | 'worker' | 'steward',
  status: 'running' | 'terminated' = 'running'
): SessionRecord {
  return {
    id,
    agentId,
    agentRole,
    pid: 10000 + Math.floor(Math.random() * 50000),
    status,
    createdAt: now - 2 * hour,
    startedAt: now - 2 * hour,
    lastActivityAt: now - 60_000,
    ...(agentRole === 'worker' ? { workerMode: 'ephemeral' as const } : {}),
  };
}

const mockSessions: SessionRecord[] = [
  makeSession(ID.sessionDirector, ID.agentDirector, 'director'),
  makeSession(ID.sessionWorker1, ID.agentWorker1, 'worker'),
  makeSession(ID.sessionSteward1, ID.agentSteward1, 'steward'),
];

const mockSessionsResponse: SessionsResponse = { sessions: mockSessions };

// ============================================================================
// Mock Task Data (useAllElements format - Task from useAllElements)
// ============================================================================

function makeElementTask(
  id: string,
  title: string,
  status: string,
  opts: Partial<Task> = {}
): Task {
  return {
    id,
    type: 'task',
    title,
    status,
    priority: 2,
    complexity: 2,
    taskType: 'task',
    tags: [],
    createdAt: isoAgo(3 * day),
    updatedAt: isoAgo(hour),
    createdBy: ID.agentDirector,
    ...opts,
  };
}

const activityTasks: Task[] = [
  makeElementTask(ID.task1, 'Add user authentication', 'in_progress', {
    assignee: ID.agentWorker1,
    priority: 1,
  }),
  makeElementTask(ID.task2, 'Fix pagination bug on tasks page', 'in_progress', {
    assignee: ID.agentWorker1,
    taskType: 'bug',
  }),
  makeElementTask(ID.task3, 'Update API documentation', 'closed', {
    updatedAt: isoAgo(2 * hour),
  }),
];

const fullTaskSet: Task[] = [
  // Backlog (2)
  makeElementTask(ID.task1, 'Set up CI/CD pipeline', 'backlog', {
    priority: 3,
    taskType: 'chore',
  }),
  makeElementTask(ID.task2, 'Add dark mode support', 'backlog', {
    priority: 4,
    taskType: 'feature',
  }),
  // Open / unassigned (2)
  makeElementTask(ID.task3, 'Add user authentication', 'open', {
    priority: 1,
    taskType: 'feature',
  }),
  makeElementTask(ID.task4, 'Create API rate limiting', 'open', {
    priority: 2,
    taskType: 'feature',
  }),
  // In-progress / assigned (2)
  makeElementTask(ID.task5, 'Fix pagination bug on tasks page', 'in_progress', {
    assignee: ID.agentWorker1,
    priority: 1,
    taskType: 'bug',
  }),
  makeElementTask(ID.task6, 'Implement search functionality', 'in_progress', {
    assignee: ID.agentWorker2,
    priority: 2,
    taskType: 'feature',
    complexity: 3,
  }),
  // Awaiting merge (1) — stored as review with mergeStatus metadata
  makeElementTask(ID.task7, 'Update API documentation', 'review', {
    priority: 2,
    taskType: 'task',
    assignee: ID.agentWorker1,
  }),
  // Closed (2)
  makeElementTask(ID.task8, 'Fix login redirect loop', 'closed', {
    priority: 1,
    taskType: 'bug',
    updatedAt: isoAgo(day),
  }),
  makeElementTask(ID.task9, 'Add unit tests for auth module', 'closed', {
    priority: 2,
    taskType: 'task',
    updatedAt: isoAgo(2 * day),
  }),
  // One more open for variety
  makeElementTask(ID.task10, 'Optimize database queries', 'open', {
    priority: 3,
    taskType: 'chore',
    complexity: 4,
  }),
];

// ============================================================================
// Mock Plan Data
// ============================================================================

function makePlan(id: string, title: string, status: string, opts: Partial<Plan> = {}): Plan {
  return {
    id,
    type: 'plan',
    title,
    status,
    createdBy: ID.agentDirector,
    tags: [],
    createdAt: isoAgo(5 * day),
    updatedAt: isoAgo(hour),
    ...opts,
  };
}

const mockPlans: Plan[] = [
  makePlan(ID.plan1, 'User Authentication System', 'active', {
    tags: ['auth', 'security'],
  }),
  makePlan(ID.plan2, 'Performance Optimization Sprint', 'draft'),
  makePlan(ID.plan3, 'API Documentation Overhaul', 'completed', {
    updatedAt: isoAgo(2 * day),
  }),
];

// Plan-associated tasks (for the plans context)
const planTasks: Task[] = [
  // Plan 1: active with 4 tasks in mixed statuses
  makeElementTask(ID.task1, 'Design auth database schema', 'closed', {
    owner: ID.plan1,
  }),
  makeElementTask(ID.task2, 'Implement JWT token generation', 'in_progress', {
    assignee: ID.agentWorker1,
    owner: ID.plan1,
  }),
  makeElementTask(ID.task3, 'Add login and registration endpoints', 'open', {
    owner: ID.plan1,
  }),
  makeElementTask(ID.task4, 'Write auth integration tests', 'backlog', {
    owner: ID.plan1,
  }),
  // Plan 2: draft with 2 tasks
  makeElementTask(ID.task5, 'Profile slow database queries', 'backlog', {
    owner: ID.plan2,
  }),
  makeElementTask(ID.task6, 'Add response caching layer', 'backlog', {
    owner: ID.plan2,
    taskType: 'feature',
  }),
];

// ============================================================================
// Mock Document Data
// ============================================================================

function makeDocument(
  id: string,
  title: string,
  opts: Partial<Document> = {}
): Document {
  return {
    id,
    type: 'document',
    title,
    contentType: 'markdown',
    version: 1,
    tags: [],
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(day),
    ...opts,
  };
}

const mockDocuments: Document[] = [
  makeDocument(ID.doc1, 'Architecture Overview', {
    content: '# Architecture Overview\n\nThis document describes the high-level architecture of the system, including the main components and their interactions.',
    tags: ['architecture'],
  }),
  makeDocument(ID.doc2, 'API Reference', {
    content: '# API Reference\n\nComplete reference for all REST API endpoints including authentication, request/response formats, and error codes.',
    tags: ['api', 'reference'],
  }),
  makeDocument(ID.doc3, 'Getting Started Guide', {
    content: '# Getting Started\n\nStep-by-step guide to set up the development environment and run the project locally.',
    tags: ['onboarding', 'guide'],
  }),
  makeDocument(ID.doc4, 'Decision Log', {
    content: '# Decision Log\n\n## 2026-03-20: Chose PostgreSQL over MongoDB\nRationale: Relational data model better fits our task/entity schema.',
    tags: ['decisions'],
    version: 3,
  }),
  makeDocument(ID.doc5, 'Deployment Runbook', {
    content: '# Deployment Runbook\n\nSteps to deploy to production, including pre-flight checks, rollback procedures, and monitoring verification.',
    tags: ['ops', 'runbook'],
  }),
];

// ============================================================================
// Mock Library Data
// ============================================================================

const mockLibraries: Library[] = [
  {
    id: ID.lib1,
    type: 'library',
    name: 'Documentation',
    createdBy: ID.operator,
    tags: [],
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(day),
  },
];

// ============================================================================
// Mock Channel Data
// ============================================================================

function makeChannel(
  id: string,
  name: string,
  channelType: 'group' | 'direct',
  members: string[]
): Channel {
  return {
    id,
    type: 'channel',
    name,
    channelType,
    members,
    createdBy: ID.operator,
    permissions: {
      visibility: 'public',
      joinPolicy: 'open',
      modifyMembers: [ID.operator],
    },
    tags: [],
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(hour),
  };
}

const mockChannels: Channel[] = [
  makeChannel(ID.channel1, '#general', 'group', [
    ID.operator,
    ID.agentDirector,
    ID.agentWorker1,
    ID.agentWorker2,
    ID.agentSteward1,
  ]),
  makeChannel(ID.channel2, '#director-updates', 'group', [
    ID.operator,
    ID.agentDirector,
  ]),
  makeChannel(ID.channel3, 'DM: operator ↔ director', 'direct', [
    ID.operator,
    ID.agentDirector,
  ]),
];

// ============================================================================
// Mock Message Data (useAllElements format)
// ============================================================================

function makeElementMessage(
  id: string,
  channel: string,
  sender: string,
  content: string,
  agoMs: number
): Message {
  return {
    id,
    type: 'message',
    channel,
    sender,
    content,
    tags: [],
    createdAt: isoAgo(agoMs),
    updatedAt: isoAgo(agoMs),
  };
}

const mockMessages: Message[] = [
  // #general messages
  makeElementMessage(
    ID.msg1, ID.channel1, ID.agentDirector,
    'Good morning team. I\'ve reviewed the backlog and prioritized 3 tasks for today.',
    3 * hour
  ),
  makeElementMessage(
    ID.msg2, ID.channel1, ID.agentWorker1,
    'Starting work on the authentication endpoint. Will update when I have a draft PR.',
    2.5 * hour
  ),
  makeElementMessage(
    ID.msg3, ID.channel1, ID.agentSteward1,
    'Merged PR #42 — the pagination fix is now on master.',
    2 * hour
  ),
  makeElementMessage(
    ID.msg4, ID.channel1, ID.operator,
    'Great progress everyone! Let\'s aim to close the auth tasks by end of day.',
    hour
  ),
  // #director-updates messages
  makeElementMessage(
    ID.msg5, ID.channel2, ID.agentDirector,
    'Plan "User Authentication System" is now active with 4 tasks. Assigning worker agents.',
    4 * hour
  ),
  makeElementMessage(
    ID.msg6, ID.channel2, ID.agentDirector,
    'e-worker-1 assigned to "Implement JWT token generation". ETA: 2 hours.',
    3.5 * hour
  ),
  makeElementMessage(
    ID.msg7, ID.channel2, ID.agentDirector,
    'Task "Fix login redirect loop" completed and merged. 2 tasks remaining in auth plan.',
    hour
  ),
  // DM messages
  makeElementMessage(
    ID.msg8, ID.channel3, ID.operator,
    'Can you prioritize the API rate limiting task? We\'re getting close to launch.',
    5 * hour
  ),
  makeElementMessage(
    ID.msg9, ID.channel3, ID.agentDirector,
    'Understood. I\'ll move it to priority 1 and assign a worker once the auth tasks wrap up.',
    4.5 * hour
  ),
  makeElementMessage(
    ID.msg10, ID.channel3, ID.operator,
    'Perfect, thank you. Also please update the deployment runbook when you get a chance.',
    4 * hour
  ),
  makeElementMessage(
    ID.msg11, ID.channel3, ID.agentDirector,
    'Will do. I\'ve created a task for it and added it to the documentation plan.',
    3.5 * hour
  ),
];

// Mock entities for message sender resolution
const mockEntities: Entity[] = [
  {
    id: ID.operator,
    type: 'entity',
    name: 'operator',
    entityType: 'human',
    active: true,
    tags: [],
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(day),
  },
  {
    id: ID.agentDirector,
    type: 'entity',
    name: 'director',
    entityType: 'agent',
    active: true,
    tags: [],
    metadata: { agent: { agentRole: 'director' } },
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(hour),
  },
  {
    id: ID.agentWorker1,
    type: 'entity',
    name: 'e-worker-1',
    entityType: 'agent',
    active: true,
    tags: [],
    metadata: { agent: { agentRole: 'worker', workerMode: 'ephemeral' } },
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(hour),
  },
  {
    id: ID.agentWorker2,
    type: 'entity',
    name: 'e-worker-2',
    entityType: 'agent',
    active: true,
    tags: [],
    metadata: { agent: { agentRole: 'worker', workerMode: 'ephemeral' } },
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(2 * hour),
  },
  {
    id: ID.agentSteward1,
    type: 'entity',
    name: 'm-steward-1',
    entityType: 'agent',
    active: true,
    tags: [],
    metadata: { agent: { agentRole: 'steward', stewardFocus: 'merge' } },
    createdAt: isoAgo(7 * day),
    updatedAt: isoAgo(hour),
  },
];

// ============================================================================
// Mock Channel Messages (useChannelMessages format)
// ============================================================================

interface ChannelMessage {
  id: string;
  channelId: string;
  sender: string;
  contentRef: string;
  attachments: string[];
  threadId: string | null;
  createdAt: string;
  createdBy: string;
  _content?: string;
}

function makeChannelMessage(
  id: string,
  channelId: string,
  sender: string,
  content: string,
  agoMs: number
): ChannelMessage {
  return {
    id,
    channelId,
    sender,
    contentRef: `${id}-content`,
    attachments: [],
    threadId: null,
    createdAt: isoAgo(agoMs),
    createdBy: sender,
    _content: content,
  };
}

function getChannelMessages(channelId: string): ChannelMessage[] {
  const messageMap: Record<string, ChannelMessage[]> = {
    [ID.channel1]: [
      makeChannelMessage(ID.msg1, ID.channel1, ID.agentDirector,
        'Good morning team. I\'ve reviewed the backlog and prioritized 3 tasks for today.', 3 * hour),
      makeChannelMessage(ID.msg2, ID.channel1, ID.agentWorker1,
        'Starting work on the authentication endpoint. Will update when I have a draft PR.', 2.5 * hour),
      makeChannelMessage(ID.msg3, ID.channel1, ID.agentSteward1,
        'Merged PR #42 — the pagination fix is now on master.', 2 * hour),
      makeChannelMessage(ID.msg4, ID.channel1, ID.operator,
        'Great progress everyone! Let\'s aim to close the auth tasks by end of day.', hour),
    ],
    [ID.channel2]: [
      makeChannelMessage(ID.msg5, ID.channel2, ID.agentDirector,
        'Plan "User Authentication System" is now active with 4 tasks. Assigning worker agents.', 4 * hour),
      makeChannelMessage(ID.msg6, ID.channel2, ID.agentDirector,
        'e-worker-1 assigned to "Implement JWT token generation". ETA: 2 hours.', 3.5 * hour),
      makeChannelMessage(ID.msg7, ID.channel2, ID.agentDirector,
        'Task "Fix login redirect loop" completed and merged. 2 tasks remaining in auth plan.', hour),
    ],
    [ID.channel3]: [
      makeChannelMessage(ID.msg8, ID.channel3, ID.operator,
        'Can you prioritize the API rate limiting task? We\'re getting close to launch.', 5 * hour),
      makeChannelMessage(ID.msg9, ID.channel3, ID.agentDirector,
        'Understood. I\'ll move it to priority 1 and assign a worker once the auth tasks wrap up.', 4.5 * hour),
      makeChannelMessage(ID.msg10, ID.channel3, ID.operator,
        'Perfect, thank you. Also please update the deployment runbook when you get a chance.', 4 * hour),
      makeChannelMessage(ID.msg11, ID.channel3, ID.agentDirector,
        'Will do. I\'ve created a task for it and added it to the documentation plan.', 3.5 * hour),
    ],
  };
  return messageMap[channelId] ?? [];
}

// ============================================================================
// Context Injection Functions
// ============================================================================

function injectActivityContext(queryClient: QueryClient): void {
  const keys: (readonly unknown[])[] = [];

  // Agents (useAgents uses ['agents', role] — inject for undefined role = all agents)
  queryClient.setQueryData(['agents', undefined], mockAgentsResponse);
  keys.push(['agents', undefined]);

  // Sessions (useSessions uses ['sessions', filters])
  queryClient.setQueryData(['sessions', { status: 'running' }], mockSessionsResponse);
  keys.push(['sessions', { status: 'running' }]);

  // Tasks via useAllElements cache
  queryClient.setQueryData(ELEMENT_KEYS.tasks, activityTasks);
  keys.push(ELEMENT_KEYS.tasks);

  // Entities for resolving agent names
  queryClient.setQueryData(ELEMENT_KEYS.entities, mockEntities);
  keys.push(ELEMENT_KEYS.entities);

  injectedKeys = keys;
}

function injectTasksContext(queryClient: QueryClient): void {
  const keys: (readonly unknown[])[] = [];

  // Tasks via useAllElements cache (primary source for task board)
  queryClient.setQueryData(ELEMENT_KEYS.tasks, fullTaskSet);
  keys.push(ELEMENT_KEYS.tasks);

  // Also inject into the useTasks hook keys for filtered views
  queryClient.setQueryData(['tasks', undefined], { tasks: fullTaskSet, total: fullTaskSet.length });
  keys.push(['tasks', undefined]);

  // Inject individual task queries for detail panel (useTask uses ['task', taskId] → TaskResponse)
  for (const task of fullTaskSet) {
    queryClient.setQueryData(['task', task.id], { task });
    keys.push(['task', task.id]);
  }

  // Inject empty dependency data for detail panel
  for (const task of fullTaskSet) {
    queryClient.setQueryData(['tasks', task.id, 'dependency-tasks'], { blockedBy: [], blocks: [] });
    keys.push(['tasks', task.id, 'dependency-tasks']);
  }

  // Entities for assignee resolution
  queryClient.setQueryData(ELEMENT_KEYS.entities, mockEntities);
  keys.push(ELEMENT_KEYS.entities);

  injectedKeys = keys;
}

function injectPlansContext(queryClient: QueryClient): void {
  const keys: (readonly unknown[])[] = [];

  // Plans via useAllElements cache
  queryClient.setQueryData(ELEMENT_KEYS.plans, mockPlans);
  keys.push(ELEMENT_KEYS.plans);

  // Tasks associated with plans
  queryClient.setQueryData(ELEMENT_KEYS.tasks, planTasks);
  keys.push(ELEMENT_KEYS.tasks);

  // Inject individual plan queries for detail panel (usePlan uses ['plans', planId] → HydratedPlan)
  for (const plan of mockPlans) {
    const ownerTasks = planTasks.filter(t => t.owner === plan.id);
    const hydratedPlan = {
      ...plan,
      _progress: {
        totalTasks: ownerTasks.length,
        completedTasks: ownerTasks.filter(t => t.status === 'closed').length,
        inProgressTasks: ownerTasks.filter(t => t.status === 'in_progress').length,
        blockedTasks: 0,
        remainingTasks: ownerTasks.filter(t => t.status !== 'closed').length,
        completionPercentage: ownerTasks.length > 0
          ? Math.round((ownerTasks.filter(t => t.status === 'closed').length / ownerTasks.length) * 100)
          : 0,
      },
    };
    queryClient.setQueryData(['plans', plan.id], hydratedPlan);
    keys.push(['plans', plan.id]);
  }

  // Inject plan tasks for detail panel (usePlanTasks uses ['plans', planId, 'tasks'])
  for (const plan of mockPlans) {
    const ownerTasks = planTasks.filter(t => t.owner === plan.id);
    queryClient.setQueryData(['plans', plan.id, 'tasks'], ownerTasks);
    keys.push(['plans', plan.id, 'tasks']);
  }

  // Entities for assignee resolution
  queryClient.setQueryData(ELEMENT_KEYS.entities, mockEntities);
  keys.push(ELEMENT_KEYS.entities);

  injectedKeys = keys;
}

function injectDocumentsContext(queryClient: QueryClient): void {
  const keys: (readonly unknown[])[] = [];

  // Documents via useAllElements cache
  queryClient.setQueryData(ELEMENT_KEYS.documents, mockDocuments);
  keys.push(ELEMENT_KEYS.documents);

  // Inject individual document queries for detail panel (useDocument uses ['documents', docId])
  for (const doc of mockDocuments) {
    queryClient.setQueryData(['documents', doc.id], doc);
    keys.push(['documents', doc.id]);
  }

  // Libraries via useAllElements cache
  queryClient.setQueryData(ELEMENT_KEYS.libraries, mockLibraries);
  keys.push(ELEMENT_KEYS.libraries);

  injectedKeys = keys;
}

function injectMessagesContext(queryClient: QueryClient): void {
  const keys: (readonly unknown[])[] = [];

  // Channels via useAllElements cache
  queryClient.setQueryData(ELEMENT_KEYS.channels, mockChannels);
  keys.push(ELEMENT_KEYS.channels);

  // Messages via useAllElements cache (for global message list)
  queryClient.setQueryData(ELEMENT_KEYS.messages, mockMessages);
  keys.push(ELEMENT_KEYS.messages);

  // Entities for sender name resolution
  queryClient.setQueryData(ELEMENT_KEYS.entities, mockEntities);
  keys.push(ELEMENT_KEYS.entities);
  queryClient.setQueryData(['entities'], mockEntities.map(e => ({ id: e.id, name: e.name, entityType: e.entityType })));
  keys.push(['entities']);

  // Channel-specific message lists (useChannelMessages uses ['channels', channelId, 'messages'])
  for (const channel of mockChannels) {
    const channelMessages = getChannelMessages(channel.id);
    queryClient.setQueryData(['channels', channel.id, 'messages'], channelMessages);
    keys.push(['channels', channel.id, 'messages']);
  }

  // Channel detail (useChannel uses ['channels', channelId])
  for (const channel of mockChannels) {
    queryClient.setQueryData(['channels', channel.id], channel);
    keys.push(['channels', channel.id]);
  }

  injectedKeys = keys;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Inject mock data for a specific tour context into the React Query cache.
 * If another context was previously injected, it is cleared first.
 */
export function injectTourMockData(
  queryClient: QueryClient,
  context: TourMockContext
): void {
  // Clear previous context if different
  if (currentContext !== null && currentContext !== context) {
    clearTourMockData(queryClient);
  }

  currentContext = context;

  switch (context) {
    case 'activity':
      injectActivityContext(queryClient);
      break;
    case 'tasks':
      injectTasksContext(queryClient);
      break;
    case 'plans':
      injectPlansContext(queryClient);
      break;
    case 'documents':
      injectDocumentsContext(queryClient);
      break;
    case 'messages':
      injectMessagesContext(queryClient);
      break;
  }
}

/**
 * Clear all tour mock data from the React Query cache and refetch real data.
 */
export function clearTourMockData(queryClient: QueryClient): void {
  if (currentContext === null) return;

  // Remove all injected query data
  for (const key of injectedKeys) {
    queryClient.removeQueries({ queryKey: key as string[] });
  }

  // Refetch the main data sources to restore real data
  // Invalidate element caches so they refetch from the server
  queryClient.invalidateQueries({ queryKey: ['elements'] });
  queryClient.invalidateQueries({ queryKey: ['agents'] });
  queryClient.invalidateQueries({ queryKey: ['sessions'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['channels'] });
  queryClient.invalidateQueries({ queryKey: ['entities'] });

  currentContext = null;
  injectedKeys = [];
}

/**
 * Check if tour mock data is currently injected.
 */
export function hasTourMockData(): boolean {
  return currentContext !== null;
}
