import type { DiffFile } from '../../../mock-data'

// ── Review system ──
export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'pending'

export interface MRReviewer {
  name: string
  avatar: string
  state: ReviewState
  reviewedAt?: string
}

// ── Merge flow ──
export type MergeStrategy = 'merge' | 'squash' | 'rebase'

export interface MergeGate {
  label: string
  passed: boolean
  required: boolean
}

// ── Timeline events ──
export type TimelineEventType =
  | 'comment'
  | 'review'
  | 'commit_push'
  | 'status_change'
  | 'agent_activity'
  | 'agent_review'
  | 'ci_status'
  | 'reviewer_added'

export interface InlineReviewComment {
  file: string
  line: number
  content: string
  suggestion?: string
}

export interface MRTimelineEvent {
  id: string
  type: TimelineEventType
  author: string
  avatar: string
  createdAt: string
  authorUserId?: string
  // Polymorphic payloads
  comment?: { content: string; file?: string; line?: number; isResolved?: boolean }
  review?: { state: ReviewState; body?: string; comments?: InlineReviewComment[] }
  commits?: { sha: string; shortSha: string; message: string }[]
  commitCiStatus?: 'pass' | 'fail' | 'pending' | 'running'
  commitCiRunId?: string
  agentActivity?: { action: string; sessionId?: string; details?: string }
  agentReview?: { state: ReviewState; summary: string; comments?: InlineReviewComment[] }
  ciStatus?: { jobName: string; status: 'pass' | 'fail' | 'pending' | 'running' }
  statusChange?: { from: string; to: string }
}

// ── Commits tab ──
export interface MRCommit {
  sha: string
  shortSha: string
  message: string
  author: string
  avatar: string
  createdAt: string
  additions: number
  deletions: number
  filesChanged: number
}

// ── Checks tab ──
export interface MRCheckJob {
  id: string
  name: string
  status: 'success' | 'failure' | 'running' | 'queued' | 'skipped'
  duration?: string
  logs?: string[]
}

export interface MRCheck {
  id: string
  name: string
  status: 'success' | 'failure' | 'running' | 'queued'
  duration?: string
  required: boolean
  jobs: MRCheckJob[]
  // Legacy flat logs for backward compat
  logs?: string[]
}

// ── Extended MergeRequest ──
export interface MergeRequestExtended {
  id: string
  title: string
  description?: string
  branch: string
  targetBranch: string
  author: string
  status: 'open' | 'merged' | 'closed'
  isDraft: boolean
  ciStatus: 'pass' | 'fail' | 'pending'
  reviewers: MRReviewer[]
  additions: number
  deletions: number
  filesChanged: number
  createdAt: string
  // Stoneforge-specific
  createdByAgent?: string
  agentSessionId?: string
  linkedTaskId?: string
  previewUrl?: string
  previewStatus?: 'ready' | 'building' | 'failed'
  reviewAgentStatus?: 'pending' | 'approved' | 'changes_requested' | 'reviewing'
  reviewAgentName?: string
  reviewAgentSessionId?: string
  // Merge flow
  mergeStrategy: MergeStrategy
  autoMergeEnabled: boolean
  hasConflicts: boolean
  mergeGates: MergeGate[]
  labels: string[]
  // Team-mode fields
  authorUserId?: string
  requestedReviewerIds?: string[]
}

// ── Props types ──
export interface MROverlayProps {
  mergeRequests: MergeRequestExtended[]
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
}

export type MRDetailTab = 'conversation' | 'files' | 'commits' | 'checks'
