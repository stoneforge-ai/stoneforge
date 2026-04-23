import { useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { keyboardManager, getCurrentBinding, useShortcutVersion, type ShortcutHandler } from '../lib/keyboard';

/**
 * Navigation action IDs mapped to their routes.
 * The actual key bindings are read from getCurrentBinding() which respects custom shortcuts.
 */
const NAVIGATION_ACTION_ROUTES: Record<string, string> = {
  'nav.dashboard': '/dashboard/overview',
  'nav.timeline': '/dashboard/timeline',
  'nav.tasks': '/tasks',
  'nav.plans': '/plans',
  'nav.workflows': '/workflows',
  'nav.dependencies': '/dependencies',
  'nav.inbox': '/inbox', // TB137: Inbox page
  'nav.messages': '/messages',
  'nav.documents': '/documents',
  'nav.entities': '/entities',
  'nav.teams': '/teams',
  'nav.settings': '/settings',
};

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
    keyboardManager.register(keys, handler, description);
    return () => {
      keyboardManager.unregister(keys);
    };
  }, [keys, handler, description]);
}

/**
 * Hook to temporarily disable keyboard shortcuts.
 * Useful when showing modals or other overlays.
 */
export function useDisableKeyboardShortcuts(disabled: boolean): void {
  useEffect(() => {
    if (disabled) {
      keyboardManager.setEnabled(false);
    } else {
      keyboardManager.setEnabled(true);
    }
    return () => {
      keyboardManager.setEnabled(true);
    };
  }, [disabled]);
}

/**
 * Hook to set up all global navigation shortcuts.
 * Should be called once in the app root.
 * Reads custom shortcut bindings from localStorage via getCurrentBinding().
 * Hot-reloads when shortcuts are changed in settings.
 */
export function useGlobalKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const shortcutVersion = useShortcutVersion();

  // Memoize navigation handler factory
  const createNavigationHandler = useCallback(
    (path: string): ShortcutHandler => () => {
      navigate({ to: path });
    },
    [navigate]
  );

  useEffect(() => {
    // Start the keyboard manager
    keyboardManager.start();

    // Track registered shortcuts so we can unregister them on cleanup
    const registeredKeys: string[] = [];

    // Register navigation shortcuts using current bindings (respects custom shortcuts)
    Object.entries(NAVIGATION_ACTION_ROUTES).forEach(([actionId, path]) => {
      const keys = getCurrentBinding(actionId);
      if (keys) {
        keyboardManager.register(
          keys,
          createNavigationHandler(path),
          `Navigate to ${path}`
        );
        registeredKeys.push(keys);
      }
    });

    // Cleanup on unmount or when shortcuts change
    return () => {
      // Unregister navigation shortcuts
      registeredKeys.forEach((keys) => {
        keyboardManager.unregister(keys);
      });
      keyboardManager.stop();
    };
  }, [createNavigationHandler, shortcutVersion]);
}

/**
 * Get the keyboard manager instance for advanced usage.
 */
export function getKeyboardManager() {
  return keyboardManager;
}
