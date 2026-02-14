/**
 * Sync utilities for the Settings page
 */

import type { SyncSettings } from '../types';
import { SYNC_STORAGE_KEY, DEFAULT_SYNC_SETTINGS } from '../constants';

export function getStoredSyncSettings(): SyncSettings {
  if (typeof window === 'undefined') return DEFAULT_SYNC_SETTINGS;
  const stored = localStorage.getItem(SYNC_STORAGE_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_SYNC_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SYNC_SETTINGS;
    }
  }
  return DEFAULT_SYNC_SETTINGS;
}

export function setStoredSyncSettings(settings: SyncSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(settings));
}
