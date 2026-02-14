/**
 * Constants for the Settings page
 */

import { Palette, Keyboard, Settings2, Bell, RefreshCw } from 'lucide-react';
import type { SectionNavItem, DefaultsSettings, NotificationsSettings, SyncSettings } from './types';

export const SETTINGS_SECTIONS: SectionNavItem[] = [
  { id: 'theme', label: 'Theme', icon: Palette, description: 'Customize appearance', implemented: true },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, description: 'Keyboard shortcuts', implemented: true },
  { id: 'defaults', label: 'Defaults', icon: Settings2, description: 'Default view settings', implemented: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Notification preferences', implemented: true },
  { id: 'sync', label: 'Sync', icon: RefreshCw, description: 'Sync configuration', implemented: true },
];

// Storage keys
export const THEME_STORAGE_KEY = 'settings.theme';
export const HIGH_CONTRAST_BASE_KEY = 'settings.highContrastBase';
export const DEFAULTS_STORAGE_KEY = 'settings.defaults';
export const NOTIFICATIONS_STORAGE_KEY = 'settings.notifications';
export const SYNC_STORAGE_KEY = 'settings.sync';
export const LAST_VISITED_DASHBOARD_KEY = 'dashboard.lastVisited';

// Default values
export const DEFAULT_SETTINGS: DefaultsSettings = {
  tasksView: 'list',
  dashboardLens: 'overview',
  sortOrder: 'updated_at',
};

export const DEFAULT_NOTIFICATIONS: NotificationsSettings = {
  browserNotifications: false,
  preferences: {
    taskAssigned: true,
    taskCompleted: true,
    newMessage: true,
    workflowCompleted: true,
  },
  toastDuration: 5000,
  toastPosition: 'bottom-right',
};

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  autoExport: false,
};
