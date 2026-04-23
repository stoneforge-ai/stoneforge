/**
 * Theme Toggle Component
 *
 * A button that toggles between light and dark mode.
 * Shows sun icon in dark mode, moon icon in light mode.
 */

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface ThemeToggleProps {
  /** Show a cycle toggle (light -> dark -> system) instead of simple toggle */
  showCycle?: boolean;
  /** Optional className for styling */
  className?: string;
}

export function ThemeToggle({ showCycle = false, className = '' }: ThemeToggleProps) {
  const { theme, resolvedTheme, toggleTheme, toggleDarkMode } = useTheme();

  if (showCycle) {
    // Cycle toggle: shows current mode and cycles through all options
    return (
      <button
        onClick={toggleTheme}
        className={`
          p-2 rounded-lg transition-colors
          text-gray-500 dark:text-gray-400
          hover:bg-gray-100 dark:hover:bg-[var(--color-sidebar-item-hover)]
          hover:text-gray-700 dark:hover:text-gray-200
          ${className}
        `}
        aria-label={`Current theme: ${theme}. Click to change.`}
        title={`Theme: ${theme === 'system' ? `System (${resolvedTheme})` : theme}`}
        data-testid="theme-toggle"
      >
        {theme === 'system' ? (
          <Monitor className="w-5 h-5" />
        ) : theme === 'dark' ? (
          <Moon className="w-5 h-5" />
        ) : (
          <Sun className="w-5 h-5" />
        )}
      </button>
    );
  }

  // Simple toggle: just switches between light and dark
  return (
    <button
      onClick={toggleDarkMode}
      className={`
        p-2 rounded-lg transition-colors
        text-gray-500 dark:text-gray-400
        hover:bg-gray-100 dark:hover:bg-[var(--color-sidebar-item-hover)]
        hover:text-gray-700 dark:hover:text-gray-200
        ${className}
      `}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="theme-toggle"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
}
