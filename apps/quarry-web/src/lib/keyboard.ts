/**
 * Keyboard shortcut system supporting both modifier shortcuts (Cmd+K)
 * and sequential shortcuts (G T, G P).
 */

import { useState, useEffect } from 'react';

export type ShortcutHandler = () => void;

export interface Shortcut {
  /** Display string for the shortcut (e.g., "G T", "Cmd+K") */
  keys: string;
  /** Handler to execute when shortcut is triggered */
  handler: ShortcutHandler;
  /** Description for accessibility/help */
  description?: string;
  /** Category for grouping shortcuts */
  category?: ShortcutCategory;
  /** Action ID for customizable shortcuts */
  actionId?: string;
}

export type ShortcutCategory = 'navigation' | 'actions' | 'views' | 'editing' | 'other';

/** Default shortcuts mapping action IDs to their default key bindings */
export const DEFAULT_SHORTCUTS: Record<string, { keys: string; description: string; category: ShortcutCategory }> = {
  // Navigation
  'nav.dashboard': { keys: 'G H', description: 'Go to Dashboard', category: 'navigation' },
  'nav.dependencies': { keys: 'G G', description: 'Go to Dependencies', category: 'navigation' },
  'nav.timeline': { keys: 'G L', description: 'Go to Timeline', category: 'navigation' },
  'nav.tasks': { keys: 'G T', description: 'Go to Tasks', category: 'navigation' },
  'nav.plans': { keys: 'G P', description: 'Go to Plans', category: 'navigation' },
  'nav.workflows': { keys: 'G W', description: 'Go to Workflows', category: 'navigation' },
  'nav.messages': { keys: 'G M', description: 'Go to Messages', category: 'navigation' },
  'nav.documents': { keys: 'G D', description: 'Go to Documents', category: 'navigation' },
  'nav.entities': { keys: 'G E', description: 'Go to Entities', category: 'navigation' },
  'nav.teams': { keys: 'G R', description: 'Go to Teams', category: 'navigation' },
  'nav.inbox': { keys: 'G I', description: 'Go to Inbox', category: 'navigation' },
  'nav.settings': { keys: 'G S', description: 'Go to Settings', category: 'navigation' },
  // Actions
  'action.commandPalette': { keys: 'Cmd+K', description: 'Open Command Palette', category: 'actions' },
  'action.toggleSidebar': { keys: 'Cmd+B', description: 'Toggle Sidebar', category: 'actions' },
  'action.createTask': { keys: 'C T', description: 'Create Task', category: 'actions' },
  'action.createWorkflow': { keys: 'C W', description: 'Create Workflow', category: 'actions' },
  'action.createEntity': { keys: 'C E', description: 'Create Entity', category: 'actions' },
  'action.createTeam': { keys: 'C M', description: 'Create Team', category: 'actions' },
  'action.createDocument': { keys: 'C D', description: 'Create Document', category: 'actions' },
  'action.createPlan': { keys: 'C P', description: 'Create Plan', category: 'actions' },
  'action.createBacklogTask': { keys: 'C B', description: 'Create Backlog Task', category: 'actions' },
  // Views
  'view.list': { keys: 'V L', description: 'List View', category: 'views' },
  'view.kanban': { keys: 'V K', description: 'Kanban View', category: 'views' },
};

const CUSTOM_SHORTCUTS_KEY = 'settings.customShortcuts';

/**
 * Get custom shortcuts from localStorage
 */
export function getCustomShortcuts(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CUSTOM_SHORTCUTS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save custom shortcuts to localStorage
 */
export function setCustomShortcuts(shortcuts: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(shortcuts));
}

/**
 * Get the current binding for an action (custom or default)
 */
export function getCurrentBinding(actionId: string): string {
  const custom = getCustomShortcuts();
  if (custom[actionId]) return custom[actionId];
  return DEFAULT_SHORTCUTS[actionId]?.keys || '';
}

/**
 * Check if a key binding conflicts with existing bindings
 * Returns the action ID of the conflicting shortcut, or null if no conflict
 */
export function checkShortcutConflict(keys: string, excludeActionId?: string): string | null {
  const custom = getCustomShortcuts();
  const normalizedKeys = keys.toLowerCase().trim();

  for (const [actionId, defaultConfig] of Object.entries(DEFAULT_SHORTCUTS)) {
    if (actionId === excludeActionId) continue;

    const currentKeys = custom[actionId] || defaultConfig.keys;
    if (currentKeys.toLowerCase().trim() === normalizedKeys) {
      return actionId;
    }
  }

  return null;
}

/**
 * Reset all shortcuts to defaults
 */
export function resetAllShortcuts(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOM_SHORTCUTS_KEY);
  notifyShortcutsChanged();
}

/** Event name for shortcut changes */
export const SHORTCUTS_CHANGED_EVENT = 'stoneforge:shortcuts-changed';

/**
 * Dispatch an event when shortcuts change (for hot-reloading)
 */
function notifyShortcutsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHORTCUTS_CHANGED_EVENT));
  }
}

/**
 * Hook to track shortcut changes and trigger re-render.
 * Use this in components that display shortcut hints to keep them up-to-date.
 */
export function useShortcutVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handleShortcutsChanged = () => {
      setVersion(v => v + 1);
    };

    window.addEventListener(SHORTCUTS_CHANGED_EVENT, handleShortcutsChanged);
    return () => {
      window.removeEventListener(SHORTCUTS_CHANGED_EVENT, handleShortcutsChanged);
    };
  }, []);

  return version;
}

/**
 * Update a single custom shortcut
 */
export function setCustomShortcut(actionId: string, keys: string): void {
  const custom = getCustomShortcuts();
  if (keys === DEFAULT_SHORTCUTS[actionId]?.keys) {
    // If setting to default, remove the custom entry
    delete custom[actionId];
  } else {
    custom[actionId] = keys;
  }
  setCustomShortcuts(custom);
  notifyShortcutsChanged();
}

/**
 * Remove a custom shortcut (revert to default)
 */
export function removeCustomShortcut(actionId: string): void {
  const custom = getCustomShortcuts();
  delete custom[actionId];
  setCustomShortcuts(custom);
}

interface ParsedShortcut {
  type: 'modifier' | 'sequential';
  /** For modifier shortcuts: the key with modifiers */
  key?: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** For sequential shortcuts: array of keys to press in order */
  sequence?: string[];
}

/**
 * Parse a shortcut string into a structured format.
 * Supports:
 * - Modifier shortcuts: "Cmd+K", "Ctrl+Shift+P"
 * - Sequential shortcuts: "G T", "G P"
 */
function parseShortcut(keys: string): ParsedShortcut {
  // Check if it's a modifier shortcut (contains +)
  if (keys.includes('+')) {
    const parts = keys.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    return {
      type: 'modifier',
      key,
      meta: parts.includes('cmd') || parts.includes('meta'),
      ctrl: parts.includes('ctrl'),
      alt: parts.includes('alt'),
      shift: parts.includes('shift'),
    };
  }

  // Sequential shortcut (space-separated)
  const sequence = keys.toLowerCase().split(' ').filter(Boolean);
  return {
    type: 'sequential',
    sequence,
  };
}

export class KeyboardShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private sequentialShortcuts: Map<string, Shortcut> = new Map();
  private modifierShortcuts: Map<string, Shortcut> = new Map();
  private pendingKeys: string[] = [];
  private sequenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SEQUENCE_TIMEOUT = 1000; // 1 second to complete sequence
  private enabled = true;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Register a keyboard shortcut.
   */
  register(keys: string, handler: ShortcutHandler, description?: string): void {
    const shortcut: Shortcut = { keys, handler, description };
    this.shortcuts.set(keys, shortcut);

    const parsed = parseShortcut(keys);
    if (parsed.type === 'modifier') {
      // Store modifier shortcuts by their key
      const key = this.buildModifierKey(parsed);
      this.modifierShortcuts.set(key, shortcut);
    } else if (parsed.sequence) {
      // Store sequential shortcuts by their sequence joined
      const seqKey = parsed.sequence.join(' ');
      this.sequentialShortcuts.set(seqKey, shortcut);
    }
  }

  /**
   * Unregister a keyboard shortcut.
   */
  unregister(keys: string): void {
    const shortcut = this.shortcuts.get(keys);
    if (!shortcut) return;

    this.shortcuts.delete(keys);

    const parsed = parseShortcut(keys);
    if (parsed.type === 'modifier') {
      const key = this.buildModifierKey(parsed);
      this.modifierShortcuts.delete(key);
    } else if (parsed.sequence) {
      const seqKey = parsed.sequence.join(' ');
      this.sequentialShortcuts.delete(seqKey);
    }
  }

  /**
   * Build a unique key for modifier shortcuts.
   */
  private buildModifierKey(parsed: ParsedShortcut): string {
    const parts: string[] = [];
    if (parsed.meta) parts.push('meta');
    if (parsed.ctrl) parts.push('ctrl');
    if (parsed.alt) parts.push('alt');
    if (parsed.shift) parts.push('shift');
    parts.push(parsed.key || '');
    return parts.join('+');
  }

  /**
   * Enable or disable the shortcut system.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetSequence();
    }
  }

  /**
   * Check if shortcuts are enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reset pending sequence.
   */
  private resetSequence(): void {
    this.pendingKeys = [];
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
      this.sequenceTimeout = null;
    }
  }

  /**
   * Handle keydown events.
   */
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Ignore events when typing in inputs
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable;

    // Check for modifier shortcuts first (they work even in inputs for Cmd+K style shortcuts)
    if (event.metaKey || event.ctrlKey) {
      const modKey = this.buildModifierKey({
        type: 'modifier',
        key: event.key.toLowerCase(),
        meta: event.metaKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
      });

      const shortcut = this.modifierShortcuts.get(modKey);
      if (shortcut) {
        event.preventDefault();
        shortcut.handler();
        return;
      }
    }

    // Skip sequential shortcuts when in input fields
    if (isInput) {
      this.resetSequence();
      return;
    }

    // Handle sequential shortcuts
    const key = event.key.toLowerCase();

    // Ignore modifier keys themselves
    if (['meta', 'control', 'alt', 'shift'].includes(key)) {
      return;
    }

    // Reset sequence timeout
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    // Add key to pending sequence
    this.pendingKeys.push(key);
    const currentSequence = this.pendingKeys.join(' ');

    // Check if current sequence matches any shortcut
    const shortcut = this.sequentialShortcuts.get(currentSequence);
    if (shortcut) {
      event.preventDefault();
      this.resetSequence();
      shortcut.handler();
      return;
    }

    // Check if current sequence is a prefix of any shortcut
    const isPrefix = Array.from(this.sequentialShortcuts.keys()).some(
      seq => seq.startsWith(currentSequence + ' ')
    );

    if (isPrefix) {
      // Wait for more keys
      event.preventDefault();
      this.sequenceTimeout = setTimeout(() => {
        this.resetSequence();
      }, this.SEQUENCE_TIMEOUT);
    } else {
      // No match and not a prefix - reset
      this.resetSequence();
    }
  }

  /**
   * Start listening for keyboard events.
   */
  start(): void {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Stop listening for keyboard events.
   */
  stop(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.resetSequence();
  }

  /**
   * Get all registered shortcuts.
   */
  getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }
}

// Global singleton instance
export const keyboardManager = new KeyboardShortcutManager();

/**
 * Format a key binding string for display.
 * Converts modifier names to platform-appropriate symbols.
 */
export function formatKeyBinding(keys: string): string {
  return keys
    .replace(/Cmd\+/gi, '⌘')
    .replace(/Ctrl\+/gi, '⌃')
    .replace(/Alt\+/gi, '⌥')
    .replace(/Shift\+/gi, '⇧')
    .replace(/\s+/g, ' ');
}
