/**
 * Settings API Hooks
 *
 * React hooks for managing user preferences and workspace settings.
 * Settings are persisted to localStorage for immediate availability.
 */

import { useState, useCallback, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'light' | 'dark' | 'system';

export interface NotificationSettings {
  /** Show toasts for task completion */
  taskCompletion: boolean;
  /** Show toasts for agent health warnings */
  agentHealth: boolean;
  /** Show toasts for merge notifications */
  mergeNotifications: boolean;
  /** Play sound for notifications */
  sound: boolean;
  /** Toast auto-dismiss duration in ms (0 to disable) */
  toastDuration: number;
}

export interface WorkspaceSettings {
  /** Path to worktree directory relative to workspace root */
  worktreeDirectory: string;
  /** Ephemeral task retention period (e.g., '24h', '7d') */
  ephemeralRetention: string;
  /** Default branch for new worktrees */
  defaultBranch: string;
  /** Auto-merge passing branches */
  autoMerge: boolean;
}

export interface StewardScheduleSettings {
  /** Enable merge steward */
  mergeStewardEnabled: boolean;
  /** Enable docs steward */
  docsStewardEnabled: boolean;
}

/** Provider name type for agent providers */
export type AgentProvider = 'claude' | 'opencode' | 'codex';

export interface AgentDefaultsSettings {
  /** Default provider used when creating new agents */
  defaultProvider: AgentProvider;
  /** Default model per provider (provider name → model id) */
  defaultModels: Record<string, string>;
}

export interface Settings {
  theme: Theme;
  notifications: NotificationSettings;
  workspace: WorkspaceSettings;
  stewardSchedules: StewardScheduleSettings;
  agentDefaults: AgentDefaultsSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  taskCompletion: true,
  agentHealth: true,
  mergeNotifications: true,
  sound: false,
  toastDuration: 5000,
};

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  worktreeDirectory: '.stoneforge/.worktrees/',
  ephemeralRetention: '24h',
  defaultBranch: 'main',
  autoMerge: false,
};

const DEFAULT_STEWARD_SCHEDULE_SETTINGS: StewardScheduleSettings = {
  mergeStewardEnabled: true,
  docsStewardEnabled: false,
};

const DEFAULT_AGENT_DEFAULTS_SETTINGS: AgentDefaultsSettings = {
  defaultProvider: 'claude',
  defaultModels: {},
};

// Default settings (exported for testing and documentation)
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  workspace: DEFAULT_WORKSPACE_SETTINGS,
  stewardSchedules: DEFAULT_STEWARD_SCHEDULE_SETTINGS,
  agentDefaults: DEFAULT_AGENT_DEFAULTS_SETTINGS,
};

// ============================================================================
// Storage Keys
// ============================================================================

const THEME_KEY = 'settings.theme';
const NOTIFICATIONS_KEY = 'settings.notifications';
const WORKSPACE_KEY = 'settings.workspace';
const STEWARD_SCHEDULES_KEY = 'settings.stewardSchedules';
const AGENT_DEFAULTS_KEY = 'settings.agentDefaults';

// ============================================================================
// Helper Functions
// ============================================================================

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return { ...defaultValue, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for managing theme setting
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Remove all theme classes first
    root.classList.remove('dark', 'theme-dark', 'theme-light');

    const resolvedTheme = t === 'system' ? (systemDark ? 'dark' : 'light') : t;

    if (resolvedTheme === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else {
      root.classList.add('theme-light');
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, applyTheme]);

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const resolvedTheme = theme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  return {
    theme,
    setTheme,
    resolvedTheme,
  };
}

/**
 * Hook for managing notification settings
 */
export function useNotificationSettings() {
  const [settings, setSettingsState] = useState<NotificationSettings>(() =>
    loadFromStorage(NOTIFICATIONS_KEY, DEFAULT_NOTIFICATION_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(NOTIFICATIONS_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_NOTIFICATION_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    resetToDefaults,
  };
}

/**
 * Hook for managing workspace settings
 */
export function useWorkspaceSettings() {
  const [settings, setSettingsState] = useState<WorkspaceSettings>(() =>
    loadFromStorage(WORKSPACE_KEY, DEFAULT_WORKSPACE_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(WORKSPACE_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<WorkspaceSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_WORKSPACE_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    resetToDefaults,
  };
}

/**
 * Hook for managing steward schedule settings
 */
export function useStewardScheduleSettings() {
  const [settings, setSettingsState] = useState<StewardScheduleSettings>(() =>
    loadFromStorage(STEWARD_SCHEDULES_KEY, DEFAULT_STEWARD_SCHEDULE_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(STEWARD_SCHEDULES_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<StewardScheduleSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_STEWARD_SCHEDULE_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    resetToDefaults,
  };
}

/**
 * Hook for managing agent default settings (provider & model)
 */
export function useAgentDefaultsSettings() {
  const [settings, setSettingsState] = useState<AgentDefaultsSettings>(() =>
    loadFromStorage(AGENT_DEFAULTS_KEY, DEFAULT_AGENT_DEFAULTS_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(AGENT_DEFAULTS_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<AgentDefaultsSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setDefaultModel = useCallback((provider: string, model: string) => {
    setSettingsState((prev) => ({
      ...prev,
      defaultModels: { ...prev.defaultModels, [provider]: model },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_AGENT_DEFAULTS_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    setDefaultModel,
    resetToDefaults,
  };
}

/**
 * Hook for managing all settings
 */
export function useSettings() {
  const themeHook = useTheme();
  const notificationsHook = useNotificationSettings();
  const workspaceHook = useWorkspaceSettings();
  const stewardSchedulesHook = useStewardScheduleSettings();
  const agentDefaultsHook = useAgentDefaultsSettings();

  const settings: Settings = {
    theme: themeHook.theme,
    notifications: notificationsHook.settings,
    workspace: workspaceHook.settings,
    stewardSchedules: stewardSchedulesHook.settings,
    agentDefaults: agentDefaultsHook.settings,
  };

  const resetAllToDefaults = useCallback(() => {
    themeHook.setTheme('system');
    notificationsHook.resetToDefaults();
    workspaceHook.resetToDefaults();
    stewardSchedulesHook.resetToDefaults();
    agentDefaultsHook.resetToDefaults();
  }, [themeHook, notificationsHook, workspaceHook, stewardSchedulesHook, agentDefaultsHook]);

  return {
    settings,
    theme: themeHook,
    notifications: notificationsHook,
    workspace: workspaceHook,
    stewardSchedules: stewardSchedulesHook,
    agentDefaults: agentDefaultsHook,
    resetAllToDefaults,
  };
}

// ============================================================================
// Keyboard Shortcuts Reference
// ============================================================================

import { DEFAULT_SHORTCUTS, formatKeyBinding } from '../../lib/keyboard';

export interface KeyboardShortcut {
  key: string;
  label: string;
  description: string;
  actionId?: string;
}

/**
 * Build keyboard shortcuts list from DEFAULT_SHORTCUTS for display in settings.
 * Adds common UI shortcuts that aren't in the navigation/action system.
 */
function buildKeyboardShortcuts(): KeyboardShortcut[] {
  const shortcuts: KeyboardShortcut[] = [];

  // Add shortcuts from DEFAULT_SHORTCUTS
  for (const [actionId, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
    shortcuts.push({
      key: formatKeyBinding(shortcut.keys),
      label: shortcut.description || actionId,
      description: shortcut.path
        ? `Navigate to ${shortcut.path.split('?')[0]}`
        : 'Quick action',
      actionId,
    });
  }

  // Add common UI shortcuts not in the keyboard system
  shortcuts.push(
    { key: 'Esc', label: 'Close dialog', description: 'Close any open dialog or panel' },
    { key: '↑↓', label: 'Navigate', description: 'Navigate through lists and options' },
    { key: 'Enter', label: 'Select', description: 'Select the current item or confirm action' },
    { key: 'J/K', label: 'Next/Previous', description: 'Navigate items in inbox (vim-style)' }
  );

  return shortcuts;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = buildKeyboardShortcuts();
