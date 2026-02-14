/**
 * Notifications Section component for settings
 */

import { useState, useEffect } from 'react';
import { Users, CheckCircle2, MessageSquare, Workflow, AlertCircle, AlertTriangle, BellRing, Check } from 'lucide-react';
import type { NotificationsSettings, NotificationPreferences, ToastDuration, ToastPosition } from '../types';
import { DEFAULT_NOTIFICATIONS } from '../constants';
import { getStoredNotifications, setStoredNotifications, getBrowserNotificationPermission, requestNotificationPermission } from '../utils';
import { ToggleSwitch } from './ToggleSwitch';

interface NotificationToggleRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId: string;
}

function NotificationToggleRow({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  disabled = false,
  testId,
}: NotificationToggleRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-3 sm:py-4 px-3 sm:px-4 gap-3 min-h-[56px] ${disabled ? 'opacity-50' : ''}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 block">{label}</span>
          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{description}</p>
        </div>
      </div>
      <ToggleSwitch
        enabled={enabled}
        onToggle={onToggle}
        disabled={disabled}
        testId={`${testId}-toggle`}
      />
    </div>
  );
}

interface NotificationsSectionProps {
  isMobile: boolean;
}

export function NotificationsSection({ isMobile }: NotificationsSectionProps) {
  const [settings, setSettings] = useState<NotificationsSettings>(DEFAULT_NOTIFICATIONS);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [permissionRequesting, setPermissionRequesting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    setSettings(getStoredNotifications());
    setBrowserPermission(getBrowserNotificationPermission());
  }, []);

  const updateSettings = (newSettings: NotificationsSettings) => {
    setSettings(newSettings);
    setStoredNotifications(newSettings);
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    const newSettings = {
      ...settings,
      preferences: {
        ...settings.preferences,
        [key]: !settings.preferences[key],
      },
    };
    updateSettings(newSettings);
  };

  const toggleBrowserNotifications = async () => {
    if (!settings.browserNotifications) {
      // Enabling - check permission first
      if (browserPermission === 'default') {
        setPermissionRequesting(true);
        const result = await requestNotificationPermission();
        setBrowserPermission(result);
        setPermissionRequesting(false);
        if (result === 'granted') {
          updateSettings({ ...settings, browserNotifications: true });
        }
      } else if (browserPermission === 'granted') {
        updateSettings({ ...settings, browserNotifications: true });
      }
    } else {
      // Disabling
      updateSettings({ ...settings, browserNotifications: false });
    }
  };

  const setToastDuration = (duration: ToastDuration) => {
    updateSettings({ ...settings, toastDuration: duration });
  };

  const setToastPosition = (position: ToastPosition) => {
    updateSettings({ ...settings, toastPosition: position });
  };

  return (
    <div data-testid="settings-notifications-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Notifications</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Configure how you receive notifications about activity in your workspace.
      </p>

      {/* Browser Notifications */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Browser Notifications</h4>

        {browserPermission === 'unsupported' && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Browser notifications are not supported in this browser.
              </p>
            </div>
          </div>
        )}

        {browserPermission === 'denied' && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Browser notifications are blocked. Please enable them in your browser settings.
              </p>
            </div>
          </div>
        )}

        {browserPermission === 'default' && (
          <div className="mb-4">
            <button
              onClick={toggleBrowserNotifications}
              disabled={permissionRequesting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              data-testid="request-permission-button"
            >
              <BellRing className="w-4 h-4" />
              {permissionRequesting ? 'Requesting...' : 'Enable Browser Notifications'}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Click to request permission for browser notifications.
            </p>
          </div>
        )}

        {browserPermission === 'granted' && (
          <div className="mb-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Browser Notifications</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Show desktop notifications for important events
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={settings.browserNotifications}
                onToggle={toggleBrowserNotifications}
                testId="browser-notifications-toggle"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Notification Types</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Choose which events you want to be notified about.
        </p>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          <NotificationToggleRow
            icon={Users}
            label="Task assigned to me"
            description="When a task is assigned to you or your team"
            enabled={settings.preferences.taskAssigned}
            onToggle={() => togglePreference('taskAssigned')}
            testId="notification-task-assigned"
          />
          <NotificationToggleRow
            icon={CheckCircle2}
            label="Task completed"
            description="When a task you're watching is completed"
            enabled={settings.preferences.taskCompleted}
            onToggle={() => togglePreference('taskCompleted')}
            testId="notification-task-completed"
          />
          <NotificationToggleRow
            icon={MessageSquare}
            label="New message in channel"
            description="When you receive a new message in a channel"
            enabled={settings.preferences.newMessage}
            onToggle={() => togglePreference('newMessage')}
            testId="notification-new-message"
          />
          <NotificationToggleRow
            icon={Workflow}
            label="Workflow completed/failed"
            description="When a workflow finishes or encounters an error"
            enabled={settings.preferences.workflowCompleted}
            onToggle={() => togglePreference('workflowCompleted')}
            testId="notification-workflow-completed"
          />
        </div>
      </div>

      {/* Toast Settings */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Toast Notifications</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
          Configure how in-app toast notifications appear.
        </p>

        {/* Duration */}
        <div className="mb-4">
          <label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 block">Duration</label>
          <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
            {([
              { value: 3000 as ToastDuration, label: '3 seconds' },
              { value: 5000 as ToastDuration, label: '5 seconds' },
              { value: 10000 as ToastDuration, label: '10 seconds' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setToastDuration(value)}
                className={`
                  px-4 py-3 sm:py-2 text-xs sm:text-sm rounded-lg border transition-all min-h-[44px] active:scale-[0.98]
                  ${settings.toastDuration === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700'
                  }
                  ${isMobile ? 'w-full' : ''}
                `}
                data-testid={`toast-duration-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Position */}
        <div>
          <label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 block">Position</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'top-right' as ToastPosition, label: 'Top Right' },
              { value: 'top-left' as ToastPosition, label: 'Top Left' },
              { value: 'bottom-right' as ToastPosition, label: 'Bottom Right' },
              { value: 'bottom-left' as ToastPosition, label: 'Bottom Left' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setToastPosition(value)}
                className={`
                  px-4 py-3 sm:py-2 text-xs sm:text-sm rounded-lg border transition-all min-h-[44px] active:scale-[0.98]
                  ${settings.toastPosition === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700'
                  }
                `}
                data-testid={`toast-position-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Notification settings are saved automatically and apply immediately.
      </p>
    </div>
  );
}
