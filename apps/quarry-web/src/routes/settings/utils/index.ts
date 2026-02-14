/**
 * Settings utilities barrel export
 */

export {
  getStoredTheme,
  setStoredTheme,
  getHighContrastBase,
  setHighContrastBase,
  getSystemTheme,
  applyTheme,
} from './theme';

export {
  getStoredDefaults,
  setStoredDefaults,
  getDefaultTasksView,
  getDefaultDashboardLens,
  getLastVisitedDashboardSection,
  setLastVisitedDashboardSection,
  getDefaultSortOrder,
} from './defaults';

export {
  getStoredNotifications,
  setStoredNotifications,
  getNotificationSettings,
  getToastPosition,
  getToastDuration,
  shouldNotify,
  getBrowserNotificationPermission,
  requestNotificationPermission,
} from './notifications';

export {
  isMac,
  formatShortcutDisplay,
  CATEGORY_LABELS,
  groupShortcutsByCategory,
} from './shortcuts';

export {
  getStoredSyncSettings,
  setStoredSyncSettings,
} from './sync';
