/**
 * Notifications utilities for the Settings page
 */

import type { NotificationsSettings, NotificationPreferences, ToastPosition, ToastDuration } from '../types';
import { NOTIFICATIONS_STORAGE_KEY, DEFAULT_NOTIFICATIONS } from '../constants';

export function getStoredNotifications(): NotificationsSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATIONS;
  const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_NOTIFICATIONS,
        ...parsed,
        preferences: {
          ...DEFAULT_NOTIFICATIONS.preferences,
          ...parsed.preferences,
        },
      };
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  }
  return DEFAULT_NOTIFICATIONS;
}

export function setStoredNotifications(settings: NotificationsSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(settings));
}

export function getNotificationSettings(): NotificationsSettings {
  return getStoredNotifications();
}

export function getToastPosition(): ToastPosition {
  return getStoredNotifications().toastPosition;
}

export function getToastDuration(): ToastDuration {
  return getStoredNotifications().toastDuration;
}

export function shouldNotify(type: keyof NotificationPreferences): boolean {
  const settings = getStoredNotifications();
  return settings.preferences[type];
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
}
