/**
 * Keyboard Shortcut Definitions for Orchestrator Web App
 *
 * Defines default shortcuts that match the Command Palette commands.
 * Shortcuts are registered at app startup and can be customized by users.
 */

import type { ShortcutCategory, ShortcutDefinition } from '@stoneforge/ui';
import {
  getCurrentBinding as getBindingFromUI,
  checkShortcutConflict as checkConflictFromUI,
  setCustomShortcut as setShortcutFromUI,
  resetAllShortcuts as resetAllFromUI,
  getCustomShortcuts,
} from '@stoneforge/ui';

/**
 * Default keyboard shortcuts for the orchestrator app.
 * Maps action IDs to their key bindings and metadata.
 */
export const DEFAULT_SHORTCUTS: Record<string, ShortcutDefinition> = {
  // Navigation shortcuts (G prefix = "Go to")
  'nav.activity': {
    keys: 'G A',
    path: '/activity',
    description: 'Go to Activity',
    category: 'navigation',
  },
  'nav.tasks': {
    keys: 'G T',
    path: '/tasks',
    description: 'Go to Tasks',
    category: 'navigation',
  },
  'nav.agents': {
    keys: 'G E',
    path: '/agents',
    description: 'Go to Agents',
    category: 'navigation',
  },
  'nav.workspaces': {
    keys: 'G W',
    path: '/workspaces',
    description: 'Go to Workspaces',
    category: 'navigation',
  },
  'nav.workflows': {
    keys: 'G F',
    path: '/workflows',
    description: 'Go to Workflows',
    category: 'navigation',
  },
  'nav.metrics': {
    keys: 'G M',
    path: '/metrics',
    description: 'Go to Metrics',
    category: 'navigation',
  },
  'nav.settings': {
    keys: 'G S',
    path: '/settings',
    description: 'Go to Settings',
    category: 'navigation',
  },
  'nav.inbox': {
    keys: 'G I',
    path: '/inbox',
    description: 'Go to Inbox',
    category: 'navigation',
  },
  'nav.messages': {
    keys: 'G C',
    path: '/messages',
    description: 'Go to Messages',
    category: 'navigation',
  },
  'nav.documents': {
    keys: 'G D',
    path: '/documents',
    description: 'Go to Documents',
    category: 'navigation',
  },
  'nav.plans': {
    keys: 'G P',
    path: '/plans',
    description: 'Go to Plans',
    category: 'navigation',
  },
  'nav.mergeRequests': {
    keys: 'G R',
    path: '/merge-requests',
    description: 'Go to Merge Requests',
    category: 'navigation',
  },

  // Action shortcuts (C prefix = "Create", Cmd+ for global actions)
  'action.commandPalette': {
    keys: 'Cmd+K',
    description: 'Open Command Palette',
    category: 'actions',
  },
  'action.toggleSidebar': {
    keys: 'Cmd+B',
    description: 'Toggle Sidebar',
    category: 'actions',
  },
  'action.toggleDirector': {
    keys: 'Cmd+D',
    description: 'Toggle Director Panel',
    category: 'actions',
  },
  'action.toggleDirectorMaximize': {
    keys: 'Cmd+Shift+D',
    description: 'Maximize/Restore Director Panel',
    category: 'actions',
  },
  'action.createTask': {
    keys: 'C T',
    path: '/tasks?action=create',
    description: 'Create Task',
    category: 'actions',
  },
  'action.createBacklogTask': {
    keys: 'C B',
    path: '/tasks?backlog=true',
    description: 'Create Backlog Task',
    category: 'actions',
  },
  'action.createAgent': {
    keys: 'C A',
    path: '/agents?action=create',
    description: 'Create Agent',
    category: 'actions',
  },
  'action.createPlan': {
    keys: 'C P',
    path: '/plans?action=create',
    description: 'Create Plan',
    category: 'actions',
  },
  'action.createDocument': {
    keys: 'C D',
    path: '/documents?action=create',
    description: 'Create Document',
    category: 'actions',
  },
  'action.createWorkflow': {
    keys: 'C W',
    path: '/workflows?action=create',
    description: 'Create Template',
    category: 'actions',
  },
  'action.addPane': {
    keys: 'A P',
    path: '/workspaces?action=addPane',
    description: 'Add Pane',
    category: 'actions',
  },
  'action.refreshActivity': {
    keys: 'R A',
    description: 'Refresh Activity',
    category: 'actions',
  },
  'action.quickFileOpen': {
    keys: 'Cmd+P',
    description: 'Quick File Open',
    category: 'actions',
  },
};

// Re-export getCustomShortcuts for use in settings
export { getCustomShortcuts };

/**
 * Get the current binding for an action (custom or default)
 */
export function getCurrentBinding(actionId: string): string {
  return getBindingFromUI(actionId, DEFAULT_SHORTCUTS);
}

/**
 * Check if a key binding conflicts with existing bindings
 */
export function checkShortcutConflict(keys: string, excludeActionId?: string): string | null {
  return checkConflictFromUI(keys, DEFAULT_SHORTCUTS, excludeActionId);
}

/**
 * Update a single custom shortcut
 */
export function setCustomShortcut(actionId: string, keys: string): void {
  setShortcutFromUI(actionId, keys, DEFAULT_SHORTCUTS);
}

/**
 * Reset all shortcuts to defaults
 */
export function resetAllShortcuts(): void {
  resetAllFromUI();
}

/**
 * Get shortcuts grouped by category for display in settings
 */
export function getShortcutsByCategory(): Record<ShortcutCategory, Array<{ actionId: string } & ShortcutDefinition>> {
  const grouped: Record<ShortcutCategory, Array<{ actionId: string } & ShortcutDefinition>> = {
    navigation: [],
    actions: [],
    views: [],
    editing: [],
    other: [],
  };

  for (const [actionId, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
    const category = shortcut.category || 'other';
    grouped[category].push({ actionId, ...shortcut });
  }

  return grouped;
}

/**
 * Format a key binding for display (e.g., "Cmd+K" -> "⌘K")
 */
export function formatKeyBinding(keys: string): string {
  return keys
    .replace(/Cmd\+/gi, '⌘')
    .replace(/Ctrl\+/gi, '⌃')
    .replace(/Alt\+/gi, '⌥')
    .replace(/Shift\+/gi, '⇧')
    .replace(/\s+/g, ' ');
}

/**
 * Get all keyboard shortcuts as a flat array for display
 */
export function getAllShortcuts(): Array<{ actionId: string; keys: string; description: string; category: ShortcutCategory }> {
  return Object.entries(DEFAULT_SHORTCUTS).map(([actionId, shortcut]) => ({
    actionId,
    keys: shortcut.keys,
    description: shortcut.description || '',
    category: shortcut.category || 'other',
  }));
}
