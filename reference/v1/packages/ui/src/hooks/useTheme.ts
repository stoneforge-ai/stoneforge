/**
 * Theme management hook
 *
 * Provides global theme state management for dark/light mode switching.
 * Supports light, dark, high-contrast, and system preferences.
 */

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system' | 'high-contrast';

const THEME_STORAGE_KEY = 'settings.theme';
const HIGH_CONTRAST_BASE_KEY = 'settings.highContrastBase';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'high-contrast') {
    return stored;
  }
  return 'system';
}

function setStoredTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function getHighContrastBase(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(HIGH_CONTRAST_BASE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

export function setHighContrastBase(base: 'light' | 'dark') {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HIGH_CONTRAST_BASE_KEY, base);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  // Remove all theme classes first
  root.classList.remove('dark', 'theme-dark', 'theme-light', 'high-contrast');

  if (theme === 'high-contrast') {
    // High contrast mode - use stored base (light or dark)
    const base = getHighContrastBase();
    root.classList.add('high-contrast');
    if (base === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else {
      root.classList.add('theme-light');
    }
  } else {
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else {
      root.classList.add('theme-light');
    }
  }
}

/**
 * Hook for managing theme state
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [highContrastBase, setHighContrastBaseState] = useState<'light' | 'dark'>('light');

  // Resolve the actual theme being used (always returns 'light' or 'dark')
  const resolveTheme = useCallback((t: Theme): 'light' | 'dark' => {
    if (t === 'high-contrast') {
      return getHighContrastBase();
    }
    if (t === 'system') {
      return getSystemTheme();
    }
    // t is 'light' or 'dark' here
    return t;
  }, []);

  // Initialize theme from localStorage
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
    setResolvedTheme(resolveTheme(stored));
    setHighContrastBaseState(getHighContrastBase());
  }, [resolveTheme]);

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme('system');
      setResolvedTheme(getSystemTheme());
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
    applyTheme(newTheme);
    setResolvedTheme(resolveTheme(newTheme));
  }, [resolveTheme]);

  const setHighContrastThemeBase = useCallback((base: 'light' | 'dark') => {
    setHighContrastBase(base);
    setHighContrastBaseState(base);
    if (theme === 'high-contrast') {
      applyTheme('high-contrast');
      setResolvedTheme(base);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    // Cycle through: light -> dark -> high-contrast -> system -> light
    const nextTheme: Theme =
      theme === 'light' ? 'dark' :
      theme === 'dark' ? 'high-contrast' :
      theme === 'high-contrast' ? 'system' :
      'light';
    setTheme(nextTheme);
  }, [theme, setTheme]);

  const toggleDarkMode = useCallback(() => {
    // Simple toggle between light and dark (ignoring system and high-contrast)
    const newTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  return {
    theme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    isHighContrast: theme === 'high-contrast',
    highContrastBase,
    setTheme,
    setHighContrastThemeBase,
    toggleTheme,
    toggleDarkMode,
  };
}
