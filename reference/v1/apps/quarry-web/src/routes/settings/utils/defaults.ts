/**
 * Defaults utilities for the Settings page
 */

import type { DefaultsSettings, TasksViewMode, DashboardLens, DefaultSortOrder } from '../types';
import { DEFAULTS_STORAGE_KEY, LAST_VISITED_DASHBOARD_KEY, DEFAULT_SETTINGS } from '../constants';

export function getStoredDefaults(): DefaultsSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const stored = localStorage.getItem(DEFAULTS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

export function setStoredDefaults(defaults: DefaultsSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));

  // Also update individual storage keys so pages pick up the settings
  localStorage.setItem('tasks.viewMode', defaults.tasksView);
}

export function getDefaultTasksView(): TasksViewMode {
  const defaults = getStoredDefaults();
  return defaults.tasksView;
}

export function getDefaultDashboardLens(): DashboardLens {
  const defaults = getStoredDefaults();
  return defaults.dashboardLens;
}

/**
 * Get the last visited dashboard section from localStorage
 * Falls back to user's default dashboard lens if not set
 */
export function getLastVisitedDashboardSection(): DashboardLens {
  if (typeof window === 'undefined') {
    return getDefaultDashboardLens();
  }
  const stored = localStorage.getItem(LAST_VISITED_DASHBOARD_KEY);
  // 'task-flow' is legacy - redirect to tasks page (handled by router)
  if (stored && ['overview', 'task-flow', 'dependencies', 'timeline'].includes(stored)) {
    return stored as DashboardLens;
  }
  return getDefaultDashboardLens();
}

/**
 * Set the last visited dashboard section in localStorage
 */
export function setLastVisitedDashboardSection(section: DashboardLens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_VISITED_DASHBOARD_KEY, section);
}

export function getDefaultSortOrder(): DefaultSortOrder {
  const defaults = getStoredDefaults();
  return defaults.sortOrder;
}
