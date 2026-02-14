/**
 * Settings Navigation components
 */

import { SETTINGS_SECTIONS } from '../constants';
import type { SettingsSection } from '../types';

interface SettingsNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  isMobile: boolean;
}

export function SettingsNav({ activeSection, onSectionChange, isMobile }: SettingsNavProps) {
  if (isMobile) {
    return <MobileSettingsNav activeSection={activeSection} onSectionChange={onSectionChange} />;
  }
  return <DesktopSettingsNav activeSection={activeSection} onSectionChange={onSectionChange} />;
}

function MobileSettingsNav({ activeSection, onSectionChange }: Omit<SettingsNavProps, 'isMobile'>) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
      <nav
        className="flex overflow-x-auto px-2 py-2 gap-1 no-scrollbar"
        data-testid="settings-nav"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 min-h-[44px]
                ${isActive
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 active:bg-white dark:active:bg-gray-800'
                }
              `}
              data-testid={`settings-nav-${section.id}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function DesktopSettingsNav({ activeSection, onSectionChange }: Omit<SettingsNavProps, 'isMobile'>) {
  return (
    <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
      <div className="p-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Customize your experience</p>
      </div>
      <nav className="px-2 py-2 space-y-1" data-testid="settings-nav">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
                ${isActive
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }
              `}
              data-testid={`settings-nav-${section.id}`}
            >
              <Icon className="w-5 h-5" />
              <div className="flex-1">
                <span className="font-medium">{section.label}</span>
                {!section.implemented && (
                  <span className="ml-2 text-xs text-gray-400">Soon</span>
                )}
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
