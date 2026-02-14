/**
 * Types for the Settings page
 */

export type Theme = 'light' | 'dark' | 'system' | 'high-contrast';

export type SettingsSection = 'theme' | 'shortcuts' | 'defaults' | 'notifications' | 'sync';

export interface SectionNavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  implemented: boolean;
}

// Defaults types
export type TasksViewMode = 'list' | 'kanban';
export type DashboardLens = 'overview' | 'task-flow' | 'dependencies' | 'timeline';
export type DefaultSortOrder = 'updated_at' | 'created_at' | 'priority' | 'title';

export interface DefaultsSettings {
  tasksView: TasksViewMode;
  dashboardLens: DashboardLens;
  sortOrder: DefaultSortOrder;
}

// Notifications types
export type ToastDuration = 3000 | 5000 | 10000;
export type ToastPosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

export interface NotificationPreferences {
  taskAssigned: boolean;
  taskCompleted: boolean;
  newMessage: boolean;
  workflowCompleted: boolean;
}

export interface NotificationsSettings {
  browserNotifications: boolean;
  preferences: NotificationPreferences;
  toastDuration: ToastDuration;
  toastPosition: ToastPosition;
}

// Sync types
export interface SyncStatus {
  dirtyElementCount: number;
  dirtyDependencyCount: number;
  hasPendingChanges: boolean;
  exportPath: string;
  lastExportAt?: string;
  lastImportAt?: string;
}

export interface ExportResult {
  success: boolean;
  elementsExported: number;
  dependenciesExported: number;
  elementsFile: string;
  dependenciesFile: string;
  exportedAt: string;
}

export interface ImportResult {
  success: boolean;
  elementsImported: number;
  elementsSkipped: number;
  dependenciesImported: number;
  dependenciesSkipped: number;
  conflicts: Array<{ elementId: string; resolution: string }>;
  errors: Array<{ line: number; file: string; message: string }>;
  importedAt: string;
}

export interface SyncSettings {
  autoExport: boolean;
  lastExportAt?: string;
  lastImportAt?: string;
}
