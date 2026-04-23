/**
 * Constants for the Timeline page
 * Event type mappings, colors, icons, and configuration values
 */

import {
  Plus,
  Pencil,
  XCircle,
  RotateCcw,
  Trash2,
  Link,
  Unlink,
  Tag,
  Tags,
  UserPlus,
  UserMinus,
  AlertTriangle,
  CheckCircle,
  ListTodo,
  FileText,
  MessageSquare,
  Folder,
  Workflow,
  Bot,
  UsersRound,
  GitBranch,
  BookOpen,
} from 'lucide-react';
import type {
  EventType,
  TimePeriod,
  EventTypeColorConfig,
  EventTypeFilterOption,
  TimeRangeOption,
} from './types';

// Estimated event card height for virtualization
export const EVENT_CARD_HEIGHT = 140;

// Default page size for events
export const DEFAULT_EVENT_PAGE_SIZE = 100;

// Maximum events to fetch in eager loading mode
export const MAX_EAGER_LOAD_EVENTS = 20000;

// Available event type filters with icons
export const ALL_EVENT_TYPES: EventTypeFilterOption[] = [
  { value: 'created', label: 'Created', icon: Plus },
  { value: 'updated', label: 'Updated', icon: Pencil },
  { value: 'closed', label: 'Closed', icon: XCircle },
  { value: 'reopened', label: 'Reopened', icon: RotateCcw },
  { value: 'deleted', label: 'Deleted', icon: Trash2 },
  { value: 'dependency_added', label: 'Dep Added', icon: Link },
  { value: 'dependency_removed', label: 'Dep Removed', icon: Unlink },
  { value: 'tag_added', label: 'Tag Added', icon: Tag },
  { value: 'tag_removed', label: 'Tag Removed', icon: Tags },
  { value: 'member_added', label: 'Member+', icon: UserPlus },
  { value: 'member_removed', label: 'Member-', icon: UserMinus },
  { value: 'auto_blocked', label: 'Blocked', icon: AlertTriangle },
  { value: 'auto_unblocked', label: 'Unblocked', icon: CheckCircle },
];

// Event type color mapping
export const EVENT_TYPE_COLORS: Record<EventType, EventTypeColorConfig> = {
  created: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', iconBg: 'bg-green-100' },
  updated: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', iconBg: 'bg-blue-100' },
  closed: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', iconBg: 'bg-purple-100' },
  reopened: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', iconBg: 'bg-yellow-100' },
  deleted: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', iconBg: 'bg-red-100' },
  dependency_added: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', iconBg: 'bg-indigo-100' },
  dependency_removed: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', iconBg: 'bg-pink-100' },
  tag_added: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', iconBg: 'bg-cyan-100' },
  tag_removed: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', iconBg: 'bg-orange-100' },
  member_added: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', iconBg: 'bg-teal-100' },
  member_removed: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', iconBg: 'bg-rose-100' },
  auto_blocked: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', iconBg: 'bg-red-100' },
  auto_unblocked: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', iconBg: 'bg-emerald-100' },
};

// Event type icons mapping
export const EVENT_TYPE_ICONS: Record<EventType, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  closed: XCircle,
  reopened: RotateCcw,
  deleted: Trash2,
  dependency_added: Link,
  dependency_removed: Unlink,
  tag_added: Tag,
  tag_removed: Tags,
  member_added: UserPlus,
  member_removed: UserMinus,
  auto_blocked: AlertTriangle,
  auto_unblocked: CheckCircle,
};

// Element type icons
export const ELEMENT_TYPE_ICONS: Record<string, typeof ListTodo> = {
  task: ListTodo,
  plan: Folder,
  workflow: Workflow,
  channel: MessageSquare,
  message: MessageSquare,
  document: FileText,
  library: BookOpen,
  entity: Bot,
  team: UsersRound,
  playbook: GitBranch,
};

// Element type colors
export const ELEMENT_TYPE_COLORS: Record<string, string> = {
  task: 'bg-blue-100 text-blue-700',
  plan: 'bg-purple-100 text-purple-700',
  workflow: 'bg-indigo-100 text-indigo-700',
  channel: 'bg-green-100 text-green-700',
  message: 'bg-emerald-100 text-emerald-700',
  document: 'bg-orange-100 text-orange-700',
  library: 'bg-amber-100 text-amber-700',
  entity: 'bg-cyan-100 text-cyan-700',
  team: 'bg-pink-100 text-pink-700',
  playbook: 'bg-violet-100 text-violet-700',
};

// Display names for event types
export const EVENT_TYPE_DISPLAY: Record<EventType, string> = {
  created: 'Created',
  updated: 'Updated',
  closed: 'Closed',
  reopened: 'Reopened',
  deleted: 'Deleted',
  dependency_added: 'Dependency Added',
  dependency_removed: 'Dependency Removed',
  tag_added: 'Tag Added',
  tag_removed: 'Tag Removed',
  member_added: 'Member Added',
  member_removed: 'Member Removed',
  auto_blocked: 'Auto Blocked',
  auto_unblocked: 'Auto Unblocked',
};

// Time period labels
export const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  earlier: 'Earlier',
};

// Time period display order
export const TIME_PERIOD_ORDER: TimePeriod[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

// Time range presets for horizontal timeline
export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: '24h', label: 'Last 24 Hours', hours: 24 },
  { value: '7d', label: 'Last 7 Days', hours: 24 * 7 },
  { value: '30d', label: 'Last 30 Days', hours: 24 * 30 },
  { value: 'all', label: 'All Time', hours: null },
];

// Hex colors for horizontal timeline event dots
export const EVENT_DOT_COLORS: Record<EventType, string> = {
  created: '#22c55e',
  updated: '#3b82f6',
  closed: '#a855f7',
  reopened: '#eab308',
  deleted: '#ef4444',
  dependency_added: '#6366f1',
  dependency_removed: '#ec4899',
  tag_added: '#06b6d4',
  tag_removed: '#f97316',
  member_added: '#14b8a6',
  member_removed: '#f43f5e',
  auto_blocked: '#ef4444',
  auto_unblocked: '#10b981',
};

// Avatar colors for actors (700 variants for WCAG AA contrast with white text)
export const AVATAR_COLORS = [
  'bg-blue-700',
  'bg-green-700',
  'bg-purple-700',
  'bg-orange-700',
  'bg-pink-700',
  'bg-cyan-700',
  'bg-indigo-700',
  'bg-teal-700',
];
