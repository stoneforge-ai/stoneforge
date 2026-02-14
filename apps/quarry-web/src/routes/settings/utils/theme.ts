/**
 * Theme utilities for the Settings page
 */

import type { Theme } from '../types';
import { THEME_STORAGE_KEY, HIGH_CONTRAST_BASE_KEY } from '../constants';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'high-contrast') {
    return stored;
  }
  return 'system';
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function getHighContrastBase(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(HIGH_CONTRAST_BASE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

export function setHighContrastBase(base: 'light' | 'dark'): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HIGH_CONTRAST_BASE_KEY, base);
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
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
