/**
 * NotificationCenter - Header notification bell that triggers the notification sidebar
 *
 * Displays a bell icon with unread/approval badge. Clicking opens the NotificationSidebar.
 * The badge pulses when there are pending approval requests.
 */

import { Bell, BellOff } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface NotificationCenterProps {
  /** Total unread count (notifications + pending approvals) */
  unreadCount: number;
  /** Number of pending approval requests (used for pulse effect) */
  pendingApprovalCount: number;
  /** Whether SSE is connected */
  isConnected: boolean;
  /** Callback to toggle the notification sidebar */
  onToggleSidebar: () => void;
  /** Whether the sidebar is currently open */
  sidebarOpen: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationCenter({
  unreadCount,
  pendingApprovalCount,
  isConnected,
  onToggleSidebar,
  sidebarOpen,
}: NotificationCenterProps) {
  const totalCount = unreadCount + pendingApprovalCount;
  const hasPendingApprovals = pendingApprovalCount > 0;

  return (
    <div className="relative" data-testid="notification-center">
      <button
        onClick={onToggleSidebar}
        className={`
          relative p-2 rounded-md transition-colors duration-150
          ${
            sidebarOpen
              ? 'bg-[var(--color-surface-active)] text-[var(--color-text)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
          }
        `}
        aria-label={`Notifications ${totalCount > 0 ? `(${totalCount} unread)` : ''}`}
        aria-expanded={sidebarOpen}
        aria-haspopup="dialog"
        data-testid="notification-bell"
      >
        {isConnected ? (
          <Bell className="w-5 h-5" />
        ) : (
          <BellOff className="w-5 h-5 text-[var(--color-text-muted)]" />
        )}

        {/* Unread Badge */}
        {totalCount > 0 && (
          <span
            className={`
              absolute -top-0.5 -right-0.5 flex items-center justify-center
              min-w-[18px] h-[18px] px-1 text-xs font-bold text-white rounded-full
              ${hasPendingApprovals
                ? 'bg-[var(--color-warning)] animate-pulse'
                : 'bg-[var(--color-error)]'
              }
            `}
            data-testid="notification-badge"
          >
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default NotificationCenter;
