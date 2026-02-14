/**
 * Keyboard Shortcuts Hook
 *
 * A comprehensive keyboard shortcut system supporting both modifier shortcuts (Cmd+K)
 * and sequential shortcuts (G T, G P).
 *
 * @example
 * ```tsx
 * // Register a single shortcut
 * function MyComponent() {
 *   useKeyboardShortcut('Cmd+K', () => openCommandPalette());
 *   return <div>...</div>;
 * }
 *
 * // Set up global shortcuts with navigation
 * function App() {
 *   const navigate = useNavigate();
 *   useGlobalKeyboardShortcuts({
 *     navigate,
 *     shortcuts: {
 *       'nav.tasks': { keys: 'G T', path: '/tasks' },
 *       'nav.settings': { keys: 'G S', path: '/settings' },
 *     },
 *   });
 *   return <RouterOutlet />;
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Shortcut handler function
 */
export type ShortcutHandler = () => void;

/**
 * Shortcut category for grouping
 */
export type ShortcutCategory = 'navigation' | 'actions' | 'views' | 'editing' | 'other';

/**
 * Registered shortcut
 */
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

/**
 * Shortcut definition with navigation path
 */
export interface ShortcutDefinition {
  /** Key binding (e.g., "G T", "Cmd+K") */
  keys: string;
  /** Route path to navigate to (if navigation shortcut) */
  path?: string;
  /** Description for accessibility/help */
  description?: string;
  /** Category for grouping */
  category?: ShortcutCategory;
}

/**
 * Parsed shortcut structure
 */
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
 * Storage key for custom shortcuts
 */
const CUSTOM_SHORTCUTS_KEY = 'settings.customShortcuts';

/**
 * Event name for shortcut changes
 */
export const SHORTCUTS_CHANGED_EVENT = 'stoneforge:shortcuts-changed';

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

/**
 * Keyboard Shortcut Manager
 *
 * Manages registration and dispatch of keyboard shortcuts.
 */
export class KeyboardShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private sequentialShortcuts: Map<string, Shortcut> = new Map();
  private modifierShortcuts: Map<string, Shortcut> = new Map();
  private pendingKeys: string[] = [];
  private sequenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SEQUENCE_TIMEOUT = 1000; // 1 second to complete sequence
  private enabled = true;
  private started = false;

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
      const key = this.buildModifierKey(parsed);
      this.modifierShortcuts.set(key, shortcut);
    } else if (parsed.sequence) {
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
   * Check if the manager is listening for events.
   */
  isStarted(): boolean {
    return this.started;
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
    if (this.started) return;
    document.addEventListener('keydown', this.handleKeyDown);
    this.started = true;
  }

  /**
   * Stop listening for keyboard events.
   */
  stop(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.resetSequence();
    this.started = false;
  }

  /**
   * Get all registered shortcuts.
   */
  getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Clear all registered shortcuts.
   */
  clear(): void {
    this.shortcuts.clear();
    this.sequentialShortcuts.clear();
    this.modifierShortcuts.clear();
    this.resetSequence();
  }
}

// Global singleton instance
let globalManager: KeyboardShortcutManager | null = null;

/**
 * Get the global keyboard manager instance
 */
export function getKeyboardManager(): KeyboardShortcutManager {
  if (!globalManager) {
    globalManager = new KeyboardShortcutManager();
  }
  return globalManager;
}

/**
 * Create a new keyboard manager instance (for isolated usage)
 */
export function createKeyboardManager(): KeyboardShortcutManager {
  return new KeyboardShortcutManager();
}

// ============================================================================
// Custom Shortcuts Persistence
// ============================================================================

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
  notifyShortcutsChanged();
}

/**
 * Get the current binding for an action (custom or default)
 */
export function getCurrentBinding(
  actionId: string,
  defaults: Record<string, ShortcutDefinition>
): string {
  const custom = getCustomShortcuts();
  if (custom[actionId]) return custom[actionId];
  return defaults[actionId]?.keys || '';
}

/**
 * Check if a key binding conflicts with existing bindings
 */
export function checkShortcutConflict(
  keys: string,
  defaults: Record<string, ShortcutDefinition>,
  excludeActionId?: string
): string | null {
  const custom = getCustomShortcuts();
  const normalizedKeys = keys.toLowerCase().trim();

  for (const [actionId, defaultConfig] of Object.entries(defaults)) {
    if (actionId === excludeActionId) continue;

    const currentKeys = custom[actionId] || defaultConfig.keys;
    if (currentKeys.toLowerCase().trim() === normalizedKeys) {
      return actionId;
    }
  }

  return null;
}

/**
 * Update a single custom shortcut
 */
export function setCustomShortcut(
  actionId: string,
  keys: string,
  defaults: Record<string, ShortcutDefinition>
): void {
  const custom = getCustomShortcuts();
  if (keys === defaults[actionId]?.keys) {
    // If setting to default, remove the custom entry
    delete custom[actionId];
  } else {
    custom[actionId] = keys;
  }
  setCustomShortcuts(custom);
}

/**
 * Remove a custom shortcut (revert to default)
 */
export function removeCustomShortcut(actionId: string): void {
  const custom = getCustomShortcuts();
  delete custom[actionId];
  setCustomShortcuts(custom);
}

/**
 * Reset all shortcuts to defaults
 */
export function resetAllShortcuts(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOM_SHORTCUTS_KEY);
  notifyShortcutsChanged();
}

/**
 * Dispatch an event when shortcuts change (for hot-reloading)
 */
function notifyShortcutsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHORTCUTS_CHANGED_EVENT));
  }
}

// ============================================================================
// React Hooks
// ============================================================================

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
 * Hook to register a custom keyboard shortcut.
 * The shortcut will be automatically unregistered when the component unmounts.
 */
export function useKeyboardShortcut(
  keys: string,
  handler: ShortcutHandler,
  description?: string
): void {
  useEffect(() => {
    const manager = getKeyboardManager();
    manager.register(keys, handler, description);

    // Ensure manager is started
    if (!manager.isStarted()) {
      manager.start();
    }

    return () => {
      manager.unregister(keys);
    };
  }, [keys, handler, description]);
}

/**
 * Hook to temporarily disable keyboard shortcuts.
 * Useful when showing modals or other overlays.
 */
export function useDisableKeyboardShortcuts(disabled: boolean): void {
  useEffect(() => {
    const manager = getKeyboardManager();
    if (disabled) {
      manager.setEnabled(false);
    } else {
      manager.setEnabled(true);
    }
    return () => {
      manager.setEnabled(true);
    };
  }, [disabled]);
}

/**
 * Navigation function type
 */
export type NavigateFunction = (options: { to: string }) => void;

/**
 * Options for global keyboard shortcuts
 */
export interface GlobalKeyboardShortcutsOptions {
  /** Navigation function from your router */
  navigate: NavigateFunction;
  /** Shortcut definitions mapping action IDs to shortcuts */
  shortcuts: Record<string, ShortcutDefinition>;
  /** Additional custom handlers (non-navigation) */
  handlers?: Record<string, ShortcutHandler>;
}

/**
 * Hook to set up all global navigation shortcuts.
 * Should be called once in the app root.
 * Reads custom shortcut bindings from localStorage.
 * Hot-reloads when shortcuts are changed in settings.
 */
export function useGlobalKeyboardShortcuts(options: GlobalKeyboardShortcutsOptions): void {
  const { navigate, shortcuts, handlers = {} } = options;
  const shortcutVersion = useShortcutVersion();

  // Memoize navigation handler factory
  const createNavigationHandler = useCallback(
    (path: string): ShortcutHandler => () => {
      navigate({ to: path });
    },
    [navigate]
  );

  useEffect(() => {
    const manager = getKeyboardManager();

    // Start the keyboard manager
    manager.start();

    // Track registered shortcuts so we can unregister them on cleanup
    const registeredKeys: string[] = [];

    // Register navigation shortcuts using current bindings (respects custom shortcuts)
    for (const [actionId, definition] of Object.entries(shortcuts)) {
      const keys = getCurrentBinding(actionId, shortcuts);
      if (keys && definition.path) {
        manager.register(
          keys,
          createNavigationHandler(definition.path),
          definition.description || `Navigate to ${definition.path}`
        );
        registeredKeys.push(keys);
      }
    }

    // Register custom handlers
    for (const [keys, handler] of Object.entries(handlers)) {
      manager.register(keys, handler);
      registeredKeys.push(keys);
    }

    // Cleanup on unmount or when shortcuts change
    return () => {
      registeredKeys.forEach((keys) => {
        manager.unregister(keys);
      });
    };
  }, [createNavigationHandler, shortcuts, handlers, shortcutVersion]);
}
