/**
 * Keyboard Shortcuts Hooks for Orchestrator Web App
 *
 * React hooks for registering and managing keyboard shortcuts.
 * Uses the @stoneforge/ui keyboard manager under the hood.
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  getKeyboardManager,
  getCurrentBinding,
  useShortcutVersion,
  type ShortcutHandler,
} from '@stoneforge/ui';
import { DEFAULT_SHORTCUTS } from '../lib/keyboard';

// Re-export useful utilities from @stoneforge/ui
export {
  useKeyboardShortcut,
  useDisableKeyboardShortcuts,
  useShortcutVersion,
  getCustomShortcuts,
  setCustomShortcuts,
  setCustomShortcut,
  removeCustomShortcut,
  resetAllShortcuts,
  checkShortcutConflict,
  getCurrentBinding,
  SHORTCUTS_CHANGED_EVENT,
} from '@stoneforge/ui';

/**
 * Options for global keyboard shortcuts
 */
export interface GlobalKeyboardShortcutsOptions {
  /** Handler for toggling sidebar */
  onToggleSidebar?: () => void;
  /** Handler for toggling director panel */
  onToggleDirector?: () => void;
  /** Handler for toggling director panel maximize/restore */
  onToggleDirectorMaximize?: () => void;
  /** Handler for opening command palette */
  onOpenCommandPalette?: () => void;
}

/**
 * Hook to set up all global keyboard shortcuts for the orchestrator app.
 * Should be called once in the app root (AppShell).
 *
 * Registers:
 * - Navigation shortcuts (G T, G A, etc.)
 * - Action shortcuts (Cmd+B, Cmd+D, C T, C A)
 *
 * Respects custom shortcut bindings from localStorage.
 * Hot-reloads when shortcuts are changed in settings.
 */
export function useGlobalKeyboardShortcuts(options: GlobalKeyboardShortcutsOptions = {}): void {
  const { onToggleSidebar, onToggleDirector, onToggleDirectorMaximize, onOpenCommandPalette } = options;
  const navigate = useNavigate();
  const shortcutVersion = useShortcutVersion();

  // Memoize navigation handler factory
  const createNavigationHandler = useCallback(
    (path: string): ShortcutHandler => () => {
      // Handle paths with query params
      const [pathname, search] = path.split('?');
      if (search) {
        const params = new URLSearchParams(search);
        const searchObj: Record<string, string> = {};
        params.forEach((value, key) => {
          searchObj[key] = value;
        });
        navigate({ to: pathname, search: searchObj });
      } else {
        navigate({ to: path });
      }
    },
    [navigate]
  );

  useEffect(() => {
    const manager = getKeyboardManager();

    // Start the keyboard manager
    manager.start();

    // Track registered shortcuts so we can unregister them on cleanup
    const registeredKeys: string[] = [];

    // Register navigation shortcuts
    for (const [actionId, definition] of Object.entries(DEFAULT_SHORTCUTS)) {
      const keys = getCurrentBinding(actionId, DEFAULT_SHORTCUTS);
      if (!keys) continue;

      // Skip non-navigation shortcuts that need custom handlers
      if (actionId === 'action.commandPalette') {
        if (onOpenCommandPalette) {
          manager.register(keys, onOpenCommandPalette, definition.description);
          registeredKeys.push(keys);
        }
        continue;
      }

      if (actionId === 'action.toggleSidebar') {
        if (onToggleSidebar) {
          manager.register(keys, onToggleSidebar, definition.description);
          registeredKeys.push(keys);
        }
        continue;
      }

      if (actionId === 'action.toggleDirector') {
        if (onToggleDirector) {
          manager.register(keys, onToggleDirector, definition.description);
          registeredKeys.push(keys);
        }
        continue;
      }

      if (actionId === 'action.toggleDirectorMaximize') {
        if (onToggleDirectorMaximize) {
          manager.register(keys, onToggleDirectorMaximize, definition.description);
          registeredKeys.push(keys);
        }
        continue;
      }

      // Register navigation shortcuts
      if (definition.path) {
        manager.register(
          keys,
          createNavigationHandler(definition.path),
          definition.description || `Navigate to ${definition.path}`
        );
        registeredKeys.push(keys);
      }
    }

    // Cleanup on unmount or when shortcuts change
    return () => {
      registeredKeys.forEach((keys) => {
        manager.unregister(keys);
      });
    };
  }, [
    createNavigationHandler,
    onToggleSidebar,
    onToggleDirector,
    onToggleDirectorMaximize,
    onOpenCommandPalette,
    shortcutVersion,
  ]);
}

/**
 * Get the keyboard manager instance for advanced usage.
 */
export { getKeyboardManager };
