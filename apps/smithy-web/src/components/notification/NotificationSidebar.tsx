/**
 * NotificationSidebar - Slide-in panel showing notification history and approval requests
 *
 * Replaces the dropdown notification center with a full sidebar overlay
 * that slides in from the right. Shows both general notifications and
 * actionable approval request cards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Bell,
  Check,
  CheckCheck,
  X,
  Trash2,
  Settings,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import type { Notification, NotificationType } from '../../api/hooks/useNotifications.js';
import type { ApprovalRequest } from '../../api/types.js';
import { useApprovalRequests, useResolveApprovalRequest } from '../../api/hooks/useApprovalRequests.js';
import { useAgents } from '../../api/hooks/useAgents.js';
import { ApprovalRequestCard } from './ApprovalRequestCard.js';
import { formatRelativeTime } from '../../api/hooks/useActivity.js';

// ============================================================================
// Types
// ============================================================================

type SidebarTab = 'all' | 'approvals' | 'notifications';

interface NotificationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
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
// Notification Type Icon
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

// ============================================================================
// Notification Item
// ============================================================================

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
// Tab Buttons
// ============================================================================

function TabButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors
        ${
          active
            ? 'bg-[var(--color-surface-active)] text-[var(--color-text)]'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }
      `}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`
          min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold rounded-full px-1
          ${active ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]'}
        `}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationSidebar({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  isConnected,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClearAll,
  onOpenSettings,
}: NotificationSidebarProps) {
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('all');

  // Fetch approval requests with adaptive polling
  const { data: approvalData } = useApprovalRequests({ sidebarOpen: isOpen });
  const resolveApproval = useResolveApprovalRequest();

  // Fetch agents for name resolution
  const { data: agentsData } = useAgents();
  const agentsMap = new Map(
    (agentsData?.agents ?? []).map((a) => [a.id, a])
  );

  // Enrich approval requests with agent names
  const approvalRequests: ApprovalRequest[] = (approvalData?.requests ?? []).map((req) => {
    const agent = agentsMap.get(req.agentId);
    return {
      ...req,
      agentName: agent?.name ?? req.agentId,
      agentRole: agent?.metadata?.agent?.agentRole,
    };
  });

  const pendingApprovals = approvalRequests.filter((r) => r.status === 'pending');
  const resolvedApprovals = approvalRequests.filter((r) => r.status !== 'pending');

  // Close on escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Handle approve/deny
  const handleApprove = useCallback(
    (id: string) => resolveApproval.mutate({ requestId: id, status: 'approved' }),
    [resolveApproval]
  );

  const handleDeny = useCallback(
    (id: string) => resolveApproval.mutate({ requestId: id, status: 'denied' }),
    [resolveApproval]
  );

  const handleNavigate = useCallback(
    (notification: Notification) => {
      if (notification.navigateTo) {
        onMarkAsRead(notification.id);
        onClose();
        navigate({ to: notification.navigateTo });
      }
    },
    [navigate, onMarkAsRead, onClose]
  );

  // Filter content based on active tab
  const showApprovals = activeTab === 'all' || activeTab === 'approvals';
  const showNotifications = activeTab === 'all' || activeTab === 'notifications';

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300"
          onClick={onClose}
          data-testid="notification-sidebar-backdrop"
        />
      )}

      {/* Sidebar panel */}
      {/* viewport-based: renders as fixed overlay outside @container */}
      <div
        ref={sidebarRef}
        className={`
          fixed top-0 right-0 h-full w-full sm:w-[420px] z-50
          bg-[var(--color-surface)] border-l border-[var(--color-border)]
          shadow-2xl flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-label="Notification sidebar"
        aria-hidden={!isOpen}
        data-testid="notification-sidebar"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[var(--color-text)]" />
            <h2 className="text-base font-semibold text-[var(--color-text)]">Notifications</h2>
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
                title="Clear all notifications"
                aria-label="Clear all notifications"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                title="Notification settings"
                aria-label="Notification settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors ml-1"
              aria-label="Close notification sidebar"
              data-testid="notification-sidebar-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] flex-shrink-0">
          <TabButton
            label="All"
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
          />
          <TabButton
            label="Approvals"
            active={activeTab === 'approvals'}
            count={pendingApprovals.length}
            onClick={() => setActiveTab('approvals')}
          />
          <TabButton
            label="Notifications"
            active={activeTab === 'notifications'}
            count={unreadCount}
            onClick={() => setActiveTab('notifications')}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" data-testid="notification-sidebar-content">
          {/* Pending Approval Requests Section */}
          {showApprovals && pendingApprovals.length > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-[var(--color-warning)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  Pending Approvals
                </h3>
                <span className="min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold rounded-full px-1 bg-[var(--color-warning)] text-white">
                  {pendingApprovals.length}
                </span>
              </div>
              <div className="space-y-2">
                {pendingApprovals.map((request) => (
                  <ApprovalRequestCard
                    key={request.id}
                    request={request}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    isResolving={resolveApproval.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Resolved Approval Requests Section (only in approvals tab) */}
          {activeTab === 'approvals' && resolvedApprovals.length > 0 && (
            <div className="px-4 py-3 border-t border-[var(--color-border)]">
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                Recently Resolved
              </h3>
              <div className="space-y-2">
                {resolvedApprovals.slice(0, 20).map((request) => (
                  <ApprovalRequestCard
                    key={request.id}
                    request={request}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Divider between sections */}
          {showApprovals && pendingApprovals.length > 0 && showNotifications && notifications.length > 0 && (
            <div className="border-t border-[var(--color-border)]" />
          )}

          {/* Notifications Section */}
          {showNotifications && (
            <div data-testid="notification-list">
              {notifications.length === 0 && (activeTab === 'notifications' || (activeTab === 'all' && pendingApprovals.length === 0)) ? (
                <div className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications</p>
                  <p className="text-xs mt-1">You're all caught up!</p>
                </div>
              ) : (
                notifications.map((notification) => (
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
          )}

          {/* Empty state for approvals tab */}
          {activeTab === 'approvals' && pendingApprovals.length === 0 && resolvedApprovals.length === 0 && (
            <div className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No approval requests</p>
              <p className="text-xs mt-1">Requests will appear here when agents need permission.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default NotificationSidebar;
