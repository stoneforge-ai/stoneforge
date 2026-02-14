/**
 * NotificationCenter - Header notification bell with dropdown
 *
 * Displays a bell icon with unread badge and a dropdown list of recent notifications.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  X,
  Trash2,
  Settings,
  ExternalLink,
} from 'lucide-react';
import type { Notification, NotificationType } from '../../api/hooks/useNotifications.js';
import { formatRelativeTime } from '../../api/hooks/useActivity.js';

// ============================================================================
// Types
// ============================================================================

interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onOpenSettings?: () => void;
}

// ============================================================================
// Helper Components
// ============================================================================

function NotificationIcon({ type }: { type: NotificationType }) {
  const baseClasses = 'w-2 h-2 rounded-full flex-shrink-0';

  switch (type) {
    case 'success':
      return <div className={`${baseClasses} bg-[var(--color-success)]`} />;
    case 'error':
      return <div className={`${baseClasses} bg-[var(--color-error)]`} />;
    case 'warning':
      return <div className={`${baseClasses} bg-[var(--color-warning)]`} />;
    default:
      return <div className={`${baseClasses} bg-[var(--color-primary)]`} />;
  }
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: () => void;
  onDismiss: () => void;
  onNavigate?: () => void;
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
  onNavigate,
}: NotificationItemProps) {
  return (
    <div
      className={`
        group relative px-4 py-3 border-b border-[var(--color-border)] last:border-b-0
        hover:bg-[var(--color-surface-hover)] transition-colors duration-150
        ${notification.read ? 'opacity-60' : ''}
      `}
      data-testid={`notification-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <NotificationIcon type={notification.type} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={`text-sm font-medium text-[var(--color-text)] truncate ${
                notification.read ? '' : 'font-semibold'
              }`}
            >
              {notification.title}
            </p>
            {!notification.read && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
            )}
          </div>

          {notification.message && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">
              {notification.message}
            </p>
          )}

          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {formatRelativeTime(notification.timestamp)}
          </p>
        </div>

        {/* Actions - visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {notification.navigateTo && onNavigate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
              className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-active)] transition-colors"
              title="View details"
              aria-label="View details"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead();
              }}
              className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-active)] transition-colors"
              title="Mark as read"
              aria-label="Mark as read"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-active)] transition-colors"
            title="Dismiss"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationCenter({
  notifications,
  unreadCount,
  isConnected,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClearAll,
  onOpenSettings,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleNavigate = useCallback(
    (notification: Notification) => {
      if (notification.navigateTo) {
        onMarkAsRead(notification.id);
        setIsOpen(false);
        navigate({ to: notification.navigateTo });
      }
    },
    [navigate, onMarkAsRead]
  );

  return (
    <div ref={containerRef} className="relative" data-testid="notification-center">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative p-2 rounded-md transition-colors duration-150
          ${
            isOpen
              ? 'bg-[var(--color-surface-active)] text-[var(--color-text)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
          }
        `}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        data-testid="notification-bell"
      >
        {isConnected ? (
          <Bell className="w-5 h-5" />
        ) : (
          <BellOff className="w-5 h-5 text-[var(--color-text-muted)]" />
        )}

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-[var(--color-error)] rounded-full"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-[var(--color-surface)] rounded-lg shadow-lg border border-[var(--color-border)] overflow-hidden z-50"
          role="menu"
          aria-label="Notifications"
          data-testid="notification-dropdown"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Notifications</h3>
              {!isConnected && (
                <span className="text-xs text-[var(--color-warning-text)] bg-[var(--color-warning-muted)] px-1.5 py-0.5 rounded">
                  Offline
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  title="Mark all as read"
                  aria-label="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  title="Clear all"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {onOpenSettings && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenSettings();
                  }}
                  className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  title="Notification settings"
                  aria-label="Notification settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto" data-testid="notification-list">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[var(--color-text-secondary)]">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
                <p className="text-xs mt-1">You're all caught up!</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={() => onMarkAsRead(notification.id)}
                  onDismiss={() => onDismiss(notification.id)}
                  onNavigate={
                    notification.navigateTo ? () => handleNavigate(notification) : undefined
                  }
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 20 && (
            <div className="px-4 py-2 bg-[var(--color-surface-elevated)] border-t border-[var(--color-border)] text-center">
              <span className="text-xs text-[var(--color-text-secondary)]">
                Showing 20 of {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
