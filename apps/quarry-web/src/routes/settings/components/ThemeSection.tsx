/**
 * Theme Section component for settings
 */

import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Contrast } from 'lucide-react';
import type { Theme } from '../types';
import { getHighContrastBase, setHighContrastBase, getSystemTheme, applyTheme } from '../utils';

interface ThemeOptionProps {
  theme: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  isMobile?: boolean;
}

function ThemeOption({
  theme,
  label,
  description,
  icon: Icon,
  isSelected,
  onSelect,
  isMobile,
}: ThemeOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-all text-left w-full min-h-[60px]
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700'
        }
      `}
      data-testid={`theme-option-${theme}`}
    >
      <div className={`
        w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0
        ${isSelected
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }
      `}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm sm:text-base ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </span>
          {isSelected && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded">
              Active
            </span>
          )}
        </div>
        <p className={`text-xs sm:text-sm mt-0.5 ${isSelected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'} ${isMobile ? 'line-clamp-2' : ''}`}>{description}</p>
      </div>
    </button>
  );
}

interface ThemeSectionProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isMobile: boolean;
}

export function ThemeSection({ currentTheme, onThemeChange, isMobile }: ThemeSectionProps) {
  const [highContrastBase, setHighContrastBaseState] = useState<'light' | 'dark'>('light');

  // Initialize high contrast base on mount
  useEffect(() => {
    setHighContrastBaseState(getHighContrastBase());
  }, []);

  const handleHighContrastBaseChange = (base: 'light' | 'dark') => {
    setHighContrastBase(base);
    setHighContrastBaseState(base);
    if (currentTheme === 'high-contrast') {
      applyTheme('high-contrast');
    }
  };

  // Resolve the displayed theme
  const resolvedTheme = currentTheme === 'system'
    ? getSystemTheme()
    : currentTheme === 'high-contrast'
    ? highContrastBase
    : currentTheme;

  return (
    <div data-testid="settings-theme-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Theme</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Choose how the application looks. You can select light mode, dark mode, high contrast mode, or follow your system settings.
      </p>

      <div className="space-y-2 sm:space-y-3">
        <ThemeOption
          theme="light"
          label="Light"
          description="A clean, bright interface for daytime use"
          icon={Sun}
          isSelected={currentTheme === 'light'}
          onSelect={() => onThemeChange('light')}
          isMobile={isMobile}
        />
        <ThemeOption
          theme="dark"
          label="Dark"
          description="Easy on the eyes, perfect for low-light environments"
          icon={Moon}
          isSelected={currentTheme === 'dark'}
          onSelect={() => onThemeChange('dark')}
          isMobile={isMobile}
        />
        <ThemeOption
          theme="high-contrast"
          label="High Contrast"
          description="Improved readability with enhanced color contrast (WCAG AAA)"
          icon={Contrast}
          isSelected={currentTheme === 'high-contrast'}
          onSelect={() => onThemeChange('high-contrast')}
          isMobile={isMobile}
        />
        <ThemeOption
          theme="system"
          label="System"
          description={`Automatically match your system preference (currently ${resolvedTheme})`}
          icon={Monitor}
          isSelected={currentTheme === 'system'}
          onSelect={() => onThemeChange('system')}
          isMobile={isMobile}
        />
      </div>

      {/* High Contrast Base Toggle */}
      {currentTheme === 'high-contrast' && (
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50" data-testid="high-contrast-base-section">
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">High Contrast Base</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
            Choose whether high contrast mode uses a light or dark base.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => handleHighContrastBaseChange('light')}
              className={`
                flex items-center justify-center sm:justify-start gap-2 px-4 py-3 sm:py-2 rounded-lg border transition-all text-sm min-h-[44px]
                ${highContrastBase === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                }
              `}
              data-testid="high-contrast-base-light"
            >
              <Sun className="w-4 h-4" />
              Light Base
            </button>
            <button
              onClick={() => handleHighContrastBaseChange('dark')}
              className={`
                flex items-center justify-center sm:justify-start gap-2 px-4 py-3 sm:py-2 rounded-lg border transition-all text-sm min-h-[44px]
                ${highContrastBase === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                }
              `}
              data-testid="high-contrast-base-dark"
            >
              <Moon className="w-4 h-4" />
              Dark Base
            </button>
          </div>
        </div>
      )}

      {/* Theme Preview */}
      <div className="mt-6 sm:mt-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Preview</h4>
        <div className={`
          p-4 rounded-lg border
          ${currentTheme === 'high-contrast'
            ? highContrastBase === 'dark'
              ? 'bg-black border-white'
              : 'bg-white border-black border-2'
            : resolvedTheme === 'dark'
              ? 'bg-gray-900 border-gray-700'
              : 'bg-white border-gray-200'
          }
        `} data-testid="theme-preview">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full ${
              currentTheme === 'high-contrast'
                ? highContrastBase === 'dark' ? 'bg-[#66b3ff]' : 'bg-[#0052cc]'
                : resolvedTheme === 'dark' ? 'bg-blue-500' : 'bg-blue-600'
            }`} />
            <div>
              <div className={`text-sm font-medium ${
                currentTheme === 'high-contrast'
                  ? highContrastBase === 'dark' ? 'text-white' : 'text-black'
                  : resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Sample Task
              </div>
              <div className={`text-xs ${
                currentTheme === 'high-contrast'
                  ? highContrastBase === 'dark' ? 'text-[#e0e0e0]' : 'text-[#333333]'
                  : resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                This is how content will appear
              </div>
            </div>
          </div>
          <div className={`
            text-xs px-2 py-1 rounded inline-block
            ${currentTheme === 'high-contrast'
              ? highContrastBase === 'dark'
                ? 'bg-[rgba(102,178,255,0.2)] text-[#66b3ff]'
                : 'bg-[#cce5ff] text-[#0052cc]'
              : resolvedTheme === 'dark'
                ? 'bg-blue-900/50 text-blue-200'
                : 'bg-blue-100 text-blue-800'
            }
          `}>
            Open
          </div>
        </div>
      </div>
    </div>
  );
}
