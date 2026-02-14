/**
 * Constants for the dependency graph visualization
 */

import { ArrowDown, ArrowRight, ArrowUp, ArrowLeft } from 'lucide-react';
import type { LayoutDirection, LayoutAlgorithm, LayoutOptions } from './types';

// Dependency types that can be created
export const DEPENDENCY_TYPES = [
  { value: 'blocks', label: 'Blocks', description: 'Blocked element cannot proceed until blocker completes' },
  { value: 'parent-child', label: 'Parent-Child', description: 'Hierarchical containment' },
  { value: 'relates-to', label: 'Relates To', description: 'Semantic bidirectional link' },
  { value: 'references', label: 'References', description: 'Citation (unidirectional)' },
  { value: 'awaits', label: 'Awaits', description: 'Waiting for external event' },
  { value: 'validates', label: 'Validates', description: 'Validation relationship' },
  { value: 'authored-by', label: 'Authored By', description: 'Attribution to creator' },
  { value: 'assigned-to', label: 'Assigned To', description: 'Work assignment' },
] as const;

// Edge colors by dependency type category
export const EDGE_TYPE_COLORS: Record<string, { stroke: string; label: string; labelBg: string }> = {
  // Blocking types - red/orange (critical path)
  'blocks': { stroke: '#ef4444', label: '#ef4444', labelBg: '#fef2f2' },
  'parent-child': { stroke: '#f97316', label: '#f97316', labelBg: '#fff7ed' },
  'awaits': { stroke: '#f59e0b', label: '#f59e0b', labelBg: '#fffbeb' },
  // Associative types - blue/gray (informational)
  'relates-to': { stroke: '#3b82f6', label: '#3b82f6', labelBg: '#eff6ff' },
  'references': { stroke: '#6b7280', label: '#6b7280', labelBg: '#f9fafb' },
  'validates': { stroke: '#8b5cf6', label: '#8b5cf6', labelBg: '#f5f3ff' },
  // Attribution types - green (people)
  'authored-by': { stroke: '#22c55e', label: '#22c55e', labelBg: '#f0fdf4' },
  'assigned-to': { stroke: '#10b981', label: '#10b981', labelBg: '#ecfdf5' },
};

export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  open: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800' },
  in_progress: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800' },
  blocked: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800' },
  completed: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800' },
  cancelled: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-500' },
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-600',
  2: 'text-orange-600',
  3: 'text-yellow-600',
  4: 'text-green-600',
  5: 'text-gray-500',
};

// Status options for filter
export const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Default layout options
export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  algorithm: 'hierarchical',
  direction: 'TB',
  nodeSpacing: 80,
  rankSpacing: 150,
};

// Layout direction labels
export const DIRECTION_LABELS: Record<LayoutDirection, { label: string; icon: typeof ArrowDown }> = {
  'TB': { label: 'Top to Bottom', icon: ArrowDown },
  'LR': { label: 'Left to Right', icon: ArrowRight },
  'BT': { label: 'Bottom to Top', icon: ArrowUp },
  'RL': { label: 'Right to Left', icon: ArrowLeft },
};

// Layout algorithm labels
export const ALGORITHM_LABELS: Record<LayoutAlgorithm, { label: string; description: string }> = {
  'hierarchical': { label: 'Hierarchical', description: 'Tree-style layout based on dependency direction' },
  'force': { label: 'Force-Directed', description: 'Physics-based layout for graphs without clear hierarchy' },
  'radial': { label: 'Radial', description: 'Root node in center, dependencies radiating outward' },
};

// Get edge color for a dependency type (with fallback)
export function getEdgeColor(type: string) {
  return EDGE_TYPE_COLORS[type] || { stroke: '#94a3b8', label: '#64748b', labelBg: '#f8fafc' };
}
