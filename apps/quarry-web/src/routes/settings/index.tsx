/**
 * Settings Page
 *
 * User preferences and configuration settings.
 * Includes theme selection, keyboard shortcuts, and more.
 */

import { useState, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useBreakpoint';
import type { Theme, SettingsSection } from './types';
import { SETTINGS_SECTIONS } from './constants';
import { getStoredTheme, setStoredTheme, applyTheme } from './utils';
import {
  SettingsNav,
  ThemeSection,
  ShortcutsSection,
  DefaultsSection,
  NotificationsSection,
  SyncSection,
  ComingSoonSection,
} from './components';

// Re-export types and utilities for external use
export type { Theme, SettingsSection, TasksViewMode, DashboardLens, DefaultSortOrder } from './types';
export type { NotificationsSettings, ToastPosition, ToastDuration, NotificationPreferences } from './types';

export {
  getDefaultTasksView,
  getDefaultDashboardLens,
  getLastVisitedDashboardSection,
  setLastVisitedDashboardSection,
  getDefaultSortOrder,
} from './utils';

export {
  getNotificationSettings,
  getToastPosition,
  getToastDuration,
  shouldNotify,
} from './utils';

export function SettingsPage() {
  const isMobile = useIsMobile();
  const [currentTheme, setCurrentTheme] = useState<Theme>('system');
  const [activeSection, setActiveSection] = useState<SettingsSection>('theme');

  // Initialize theme from localStorage
  useEffect(() => {
    const stored = getStoredTheme();
    setCurrentTheme(stored);
    applyTheme(stored);
  }, []);

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (currentTheme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentTheme]);

  const handleThemeChange = (theme: Theme) => {
    setCurrentTheme(theme);
    setStoredTheme(theme);
    applyTheme(theme);
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'theme':
        return (
          <ThemeSection
            currentTheme={currentTheme}
            onThemeChange={handleThemeChange}
            isMobile={isMobile}
          />
        );
      case 'shortcuts':
        return <ShortcutsSection isMobile={isMobile} />;
      case 'defaults':
        return <DefaultsSection isMobile={isMobile} />;
      case 'notifications':
        return <NotificationsSection isMobile={isMobile} />;
      case 'sync':
        return <SyncSection isMobile={isMobile} />;
      default: {
        const section = SETTINGS_SECTIONS.find((s) => s.id === activeSection);
        if (section) {
          return <ComingSoonSection section={section} />;
        }
        return null;
      }
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row" data-testid="settings-page">
      {/* Mobile Header */}
      {isMobile && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        </div>
      )}

      {/* Navigation (Mobile tabs / Desktop sidebar) */}
      <SettingsNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isMobile={isMobile}
      />

      {/* Settings Content */}
      <div className="flex-1 overflow-auto">
        <div className={`mx-auto ${isMobile ? 'p-4' : 'max-w-2xl p-8'}`}>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

// Default export for route
export default SettingsPage;
