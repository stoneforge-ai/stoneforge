// ── Entity types ──
export interface MsgEntity {
  id: string
  name: string
  entityType: 'human' | 'agent' | 'system'
}

// ── Channel types ──
export interface MsgChannel {
  id: string
  name: string
  channelType: 'direct' | 'group'
  description?: string
  members: MsgEntity[]
  visibility: 'public' | 'private'
  lastMessageAt: string
  lastMessagePreview: string
  lastMessageSender: MsgEntity
  unreadCount: number
  unreadHumanCount: number
}

// ── Message types ──
export interface MsgMessage {
  id: string
  channelId: string
  sender: MsgEntity
  content: string // markdown
  timestamp: string
  threadId?: string
  replyCount?: number
  attachments?: { name: string; type: string }[]
}

// ── Session summary card (rendered inline in channel timeline) ──
export interface MsgSessionCard {
  id: string
  channelId: string
  agentEntity: MsgEntity
  sessionId: string
  status: 'completed' | 'error' | 'running'
  taskTitle?: string
  taskId?: string
  branch?: string
  duration?: string
  filesChanged?: number
  testsAdded?: number
  timestamp: string
}

// ── Timeline item union ──
export type TimelineItem =
  | { type: 'message'; data: MsgMessage }
  | { type: 'session-card'; data: MsgSessionCard }
  | { type: 'date-separator'; date: string }

// ── Filter/sort types ──
export type ChannelFilterField = 'visibility' | 'hasUnread'
export interface ChannelActiveFilter { field: ChannelFilterField; value: string }
export type ChannelSortField = 'recent' | 'name' | 'unread'
export type ChannelGroupField = 'type' | 'none'
export type TimelineFilterMode = 'all' | 'messages' | 'sessions'
