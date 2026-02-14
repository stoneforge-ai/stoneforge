/**
 * EntityDetailPanel - Main detail panel for viewing/editing an entity
 * Includes overview, inbox, and history tabs
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  X,
  Pencil,
  Save,
  Loader2,
  Inbox,
  History,
  Tag,
  Power,
  PowerOff,
  GitBranch,
  ChevronRight,
  ChevronDown,
  Bot,
  User,
  Server,
  ListTodo,
  Clock,
  CheckCircle,
  MessageSquare,
  FileText,
  Activity,
  AtSign,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Mail,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useKeyboardShortcut } from '../../../hooks';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import { ContributionChart } from '../../../components/shared/ContributionChart';
import { groupByTimePeriod, formatCompactTime } from '../../../lib';
import {
  useEntity,
  useEntityStats,
  useEntityTasks,
  useEntityEvents,
  useEntityActivity,
  useEntityMentions,
  useEntityInbox,
  useEntityInboxCount,
  useEntityInboxViewCount,
  useMarkInboxRead,
  useMarkAllInboxRead,
  useEntityDirectReports,
  useEntityManagementChain,
  useSetEntityManager,
  useUpdateEntity,
} from '../hooks';
import {
  getStoredInboxView,
  setStoredInboxView,
  getStoredSourceFilter,
  setStoredSourceFilter,
  getStoredSortOrder,
  setStoredSortOrder,
} from '../utils';
import { ENTITY_TYPE_STYLES, INBOX_VIEW_TABS } from '../constants';
import type {
  Entity,
  EntityDetailTab,
  InboxViewType,
  InboxSourceFilter,
  InboxSortOrder,
  UpdateEntityInput,
} from '../types';
import { StatCard } from './StatCard';
import { TaskMiniCard } from './TaskMiniCard';
import { ActivityFeedItem } from './ActivityFeedItem';
import { HistoryTabContent } from './HistoryTabContent';
import {
  InboxTimePeriodHeader,
  InboxMessageListItem,
  InboxMessageContent,
  InboxMessageEmptyState,
} from './InboxComponents';
import { ManagerDisplay, ManagerPicker } from './ManagerComponents';
import { OrgChartView } from './OrgChartView';

interface EntityDetailPanelProps {
  entityId: string;
  onClose: () => void;
}

export function EntityDetailPanel({ entityId, onClose }: EntityDetailPanelProps) {
  const navigate = useNavigate();
  const { data: entity, isLoading: entityLoading } = useEntity(entityId);
  const { data: stats, isLoading: statsLoading } = useEntityStats(entityId);
  const { data: tasks, isLoading: tasksLoading } = useEntityTasks(entityId);
  const { data: events, isLoading: eventsLoading } = useEntityEvents(entityId);
  const { data: activityData, isLoading: activityLoading } = useEntityActivity(entityId);
  const { data: mentionsData, isLoading: mentionsLoading } = useEntityMentions(entityId);
  const { data: inboxCount } = useEntityInboxCount(entityId);
  const { data: archivedData } = useEntityInboxViewCount(entityId, 'archived');
  const [inboxView, setInboxView] = useState<InboxViewType>(() => getStoredInboxView());
  const { data: inboxData, isLoading: inboxLoading, isError: inboxError, refetch: refetchInbox } = useEntityInbox(entityId, inboxView);
  const { data: directReports, isLoading: reportsLoading } = useEntityDirectReports(entityId);
  const { data: managementChain, isLoading: chainLoading } = useEntityManagementChain(entityId);
  const updateEntity = useUpdateEntity(entityId);
  const setEntityManager = useSetEntityManager(entityId);
  const markInboxRead = useMarkInboxRead(entityId);
  const markAllRead = useMarkAllInboxRead(entityId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<EntityDetailTab>('overview');
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const [managerSearchQuery, setManagerSearchQuery] = useState('');
  const [showOrgChart, setShowOrgChart] = useState(false);
  const [selectedInboxItemId, setSelectedInboxItemId] = useState<string | null>(null);
  const [inboxSourceFilter, setInboxSourceFilter] = useState<InboxSourceFilter>(() => getStoredSourceFilter());
  const [inboxSortOrder, setInboxSortOrder] = useState<InboxSortOrder>(() => getStoredSortOrder());

  // Handle inbox view change and persist to localStorage
  const handleInboxViewChange = (view: InboxViewType) => {
    setInboxView(view);
    setStoredInboxView(view);
  };

  const handleSourceFilterChange = (filter: InboxSourceFilter) => {
    setInboxSourceFilter(filter);
    setStoredSourceFilter(filter);
    setSelectedInboxItemId(null);
  };

  const handleSortOrderChange = (order: InboxSortOrder) => {
    setInboxSortOrder(order);
    setStoredSortOrder(order);
  };

  // Initialize edit values when entity loads or editing starts
  useEffect(() => {
    if (entity && isEditing) {
      setEditName(entity.name);
      setEditTags(entity.tags?.join(', ') || '');
    }
  }, [entity, isEditing]);

  // Reset edit mode and tab when entity changes
  useEffect(() => {
    setIsEditing(false);
    setShowDeactivateConfirm(false);
    setActiveTab('overview');
  }, [entityId]);

  const handleMarkInboxRead = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'read' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleMarkInboxUnread = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'unread' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleArchiveInbox = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'archived' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleRestoreInbox = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'read' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
  };

  const handleNavigateToMessage = (channelId: string, messageId: string) => {
    navigate({
      to: '/messages',
      search: { channel: channelId, message: messageId },
    });
  };

  const handleNavigateToEntity = (targetEntityId: string) => {
    navigate({
      to: '/entities',
      search: { selected: targetEntityId, name: undefined, page: 1, limit: 25 },
    });
  };

  const handleNavigateToTask = (taskId: string) => {
    navigate({
      to: '/tasks',
      search: { selected: taskId, page: 1, limit: 25 },
    });
  };

  // Client-side filtering and sorting of inbox items
  const filteredAndSortedInboxItems = useMemo(() => {
    if (!inboxData?.items) return [];

    let items = [...inboxData.items];

    if (inboxSourceFilter !== 'all') {
      items = items.filter((item) => item.sourceType === inboxSourceFilter);
    }

    items.sort((a, b) => {
      switch (inboxSortOrder) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'sender':
          const senderA = a.sender?.name || '';
          const senderB = b.sender?.name || '';
          return senderA.localeCompare(senderB);
        default:
          return 0;
      }
    });

    return items;
  }, [inboxData?.items, inboxSourceFilter, inboxSortOrder]);

  // Group inbox items by time period
  const groupedInboxItems = useMemo(() => {
    if (filteredAndSortedInboxItems.length === 0) return [];

    if (inboxSortOrder === 'sender') {
      return filteredAndSortedInboxItems.map((item) => ({
        item,
        period: 'today' as const,
        isFirstInGroup: false,
      }));
    }

    return groupByTimePeriod(filteredAndSortedInboxItems, (item) => item.createdAt);
  }, [filteredAndSortedInboxItems, inboxSortOrder]);

  // Periodic update trigger for relative times
  const [timeUpdateTrigger, setTimeUpdateTrigger] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUpdateTrigger((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const selectedInboxItem = useMemo(() => {
    if (!selectedInboxItemId || !filteredAndSortedInboxItems) return null;
    return filteredAndSortedInboxItems.find((item) => item.id === selectedInboxItemId) ?? null;
  }, [selectedInboxItemId, filteredAndSortedInboxItems]);

  // Keyboard navigation for inbox
  const handleInboxKeyNavigation = useCallback(
    (direction: 'next' | 'prev') => {
      if (!filteredAndSortedInboxItems || filteredAndSortedInboxItems.length === 0) return;

      const items = filteredAndSortedInboxItems;
      const currentIndex = selectedInboxItemId
        ? items.findIndex((item) => item.id === selectedInboxItemId)
        : -1;

      let newIndex: number;
      if (direction === 'next') {
        newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : currentIndex;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      }

      if (newIndex !== currentIndex && items[newIndex]) {
        setSelectedInboxItemId(items[newIndex].id);
      }
    },
    [filteredAndSortedInboxItems, selectedInboxItemId]
  );

  useEffect(() => {
    setSelectedInboxItemId(null);
  }, [inboxView, entityId]);

  useKeyboardShortcut(
    'J',
    useCallback(() => {
      if (activeTab === 'inbox') {
        handleInboxKeyNavigation('next');
      }
    }, [activeTab, handleInboxKeyNavigation]),
    'Select next inbox message'
  );

  useKeyboardShortcut(
    'K',
    useCallback(() => {
      if (activeTab === 'inbox') {
        handleInboxKeyNavigation('prev');
      }
    }, [activeTab, handleInboxKeyNavigation]),
    'Select previous inbox message'
  );

  const handleSave = async () => {
    if (!entity) return;

    const updates: UpdateEntityInput = {};

    if (editName.trim() && editName.trim() !== entity.name) {
      updates.name = editName.trim();
    }

    const newTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
    const currentTags = entity.tags || [];
    if (JSON.stringify(newTags) !== JSON.stringify(currentTags)) {
      updates.tags = newTags;
    }

    if (Object.keys(updates).length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      await updateEntity.mutateAsync(updates);
      setIsEditing(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggleActive = async () => {
    if (!entity) return;
    const newActive = entity.active === false;

    try {
      await updateEntity.mutateAsync({ active: newActive });
      setShowDeactivateConfirm(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!entity) return;
    const newTags = (entity.tags || []).filter((t) => t !== tagToRemove);

    try {
      await updateEntity.mutateAsync({ tags: newTags });
    } catch {
      // Error handled by mutation
    }
  };

  if (entityLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="entity-detail-loading">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="entity-detail-error">
        <span className="text-red-600">Entity not found</span>
      </div>
    );
  }

  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;
  const isActive = entity.active !== false;
  const activeTasks = tasks?.filter((t) => t.status !== 'closed' && t.status !== 'cancelled') || [];

  return (
    <div className="h-full flex flex-col" data-testid="entity-detail-panel">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${styles.bg}`}>
            <Icon className={`w-6 h-6 ${styles.text}`} />
          </div>
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-lg font-medium text-gray-900 border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="entity-edit-name-input"
              />
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-gray-900">{entity.name}</h2>
                {!isActive && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                    Inactive
                  </span>
                )}
              </div>
            )}
            <p className="text-sm text-gray-500 font-mono">{entity.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateEntity.isPending}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                data-testid="entity-save-button"
              >
                {updateEntity.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                data-testid="entity-cancel-edit-button"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              data-testid="entity-edit-button"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            data-testid="entity-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error message */}
      {updateEntity.isError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600" data-testid="entity-update-error">
          {updateEntity.error.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4" data-testid="entity-detail-tabs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="entity-tab-overview"
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'inbox'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="entity-tab-inbox"
        >
          <Inbox className="w-4 h-4" />
          Inbox
          {inboxCount && inboxCount.count > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full" data-testid="inbox-count-badge">
              {inboxCount.count}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="entity-tab-history"
        >
          <History className="w-4 h-4" />
          History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {activeTab === 'overview' ? (
          <OverviewTabContent
            entity={entity}
            stats={stats}
            statsLoading={statsLoading}
            tasks={activeTasks}
            tasksLoading={tasksLoading}
            events={events}
            eventsLoading={eventsLoading}
            activityData={activityData}
            activityLoading={activityLoading}
            mentionsData={mentionsData}
            mentionsLoading={mentionsLoading}
            directReports={directReports}
            reportsLoading={reportsLoading}
            managementChain={managementChain}
            chainLoading={chainLoading}
            isEditing={isEditing}
            editTags={editTags}
            setEditTags={setEditTags}
            showDeactivateConfirm={showDeactivateConfirm}
            setShowDeactivateConfirm={setShowDeactivateConfirm}
            showManagerPicker={showManagerPicker}
            setShowManagerPicker={setShowManagerPicker}
            managerSearchQuery={managerSearchQuery}
            setManagerSearchQuery={setManagerSearchQuery}
            showOrgChart={showOrgChart}
            setShowOrgChart={setShowOrgChart}
            updateEntity={updateEntity}
            setEntityManager={setEntityManager}
            onToggleActive={handleToggleActive}
            onRemoveTag={handleRemoveTag}
            onNavigateToTask={handleNavigateToTask}
            navigate={navigate}
          />
        ) : activeTab === 'inbox' ? (
          <InboxTabContent
            inboxView={inboxView}
            inboxCount={inboxCount}
            archivedData={archivedData}
            inboxData={inboxData}
            inboxLoading={inboxLoading}
            inboxError={inboxError}
            inboxSourceFilter={inboxSourceFilter}
            inboxSortOrder={inboxSortOrder}
            filteredAndSortedInboxItems={filteredAndSortedInboxItems}
            groupedInboxItems={groupedInboxItems}
            selectedInboxItemId={selectedInboxItemId}
            selectedInboxItem={selectedInboxItem}
            pendingItemId={pendingItemId}
            timeUpdateTrigger={timeUpdateTrigger}
            markAllRead={markAllRead}
            onInboxViewChange={handleInboxViewChange}
            onSourceFilterChange={handleSourceFilterChange}
            onSortOrderChange={handleSortOrderChange}
            onSelectInboxItem={setSelectedInboxItemId}
            onMarkRead={handleMarkInboxRead}
            onMarkUnread={handleMarkInboxUnread}
            onArchive={handleArchiveInbox}
            onRestore={handleRestoreInbox}
            onMarkAllRead={handleMarkAllRead}
            onNavigateToMessage={handleNavigateToMessage}
            onNavigateToEntity={handleNavigateToEntity}
            refetchInbox={refetchInbox}
          />
        ) : (
          <HistoryTabContent entityId={entityId} />
        )}
      </div>
    </div>
  );
}

// Overview tab content (extracted for readability)
function OverviewTabContent({
  entity,
  stats,
  statsLoading,
  tasks,
  tasksLoading,
  events,
  eventsLoading,
  activityData,
  activityLoading,
  mentionsData,
  mentionsLoading,
  directReports,
  reportsLoading,
  managementChain,
  chainLoading,
  isEditing,
  editTags,
  setEditTags,
  showDeactivateConfirm,
  setShowDeactivateConfirm,
  showManagerPicker,
  setShowManagerPicker,
  managerSearchQuery,
  setManagerSearchQuery,
  showOrgChart,
  setShowOrgChart,
  updateEntity,
  setEntityManager,
  onToggleActive,
  onRemoveTag,
  onNavigateToTask,
  navigate,
}: {
  entity: Entity;
  stats: any;
  statsLoading: boolean;
  tasks: any[];
  tasksLoading: boolean;
  events: any;
  eventsLoading: boolean;
  activityData: any;
  activityLoading: boolean;
  mentionsData: any;
  mentionsLoading: boolean;
  directReports: any;
  reportsLoading: boolean;
  managementChain: any;
  chainLoading: boolean;
  isEditing: boolean;
  editTags: string;
  setEditTags: (tags: string) => void;
  showDeactivateConfirm: boolean;
  setShowDeactivateConfirm: (show: boolean) => void;
  showManagerPicker: boolean;
  setShowManagerPicker: (show: boolean) => void;
  managerSearchQuery: string;
  setManagerSearchQuery: (query: string) => void;
  showOrgChart: boolean;
  setShowOrgChart: (show: boolean) => void;
  updateEntity: any;
  setEntityManager: any;
  onToggleActive: () => void;
  onRemoveTag: (tag: string) => void;
  onNavigateToTask: (taskId: string) => void;
  navigate: any;
}) {
  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const isActive = entity.active !== false;

  return (
    <>
      {/* Entity Info */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-1 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
            {entity.entityType}
          </span>
          {entity.publicKey && (
            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
              Has Public Key
            </span>
          )}
        </div>

        {/* Active Status Toggle */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Status</span>
            {showDeactivateConfirm ? (
              <div className="flex items-center gap-2" data-testid="entity-deactivate-confirm">
                <span className="text-sm text-gray-600">
                  {isActive ? 'Deactivate?' : 'Reactivate?'}
                </span>
                <button
                  onClick={onToggleActive}
                  disabled={updateEntity.isPending}
                  className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                  data-testid="entity-confirm-toggle-button"
                >
                  {updateEntity.isPending ? 'Saving...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowDeactivateConfirm(false)}
                  className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                  data-testid="entity-cancel-toggle-button"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeactivateConfirm(true)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  isActive
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                data-testid="entity-toggle-active-button"
              >
                {isActive ? (
                  <>
                    <Power className="w-3 h-3" />
                    Active
                  </>
                ) : (
                  <>
                    <PowerOff className="w-3 h-3" />
                    Inactive
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tags Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Tags</span>
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="Enter tags separated by commas..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="entity-edit-tags-input"
            />
          ) : entity.tags && entity.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1" data-testid="entity-tags-list">
              {entity.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded group"
                >
                  {tag}
                  <button
                    onClick={() => onRemoveTag(tag)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                    data-testid={`entity-remove-tag-${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-gray-400">No tags</span>
          )}
        </div>
      </div>

      {/* Management Hierarchy Section */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900">Organization</h3>
        </div>

        {/* Reports To (Manager) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Reports To</span>
            {!showManagerPicker ? (
              <button
                onClick={() => {
                  setShowManagerPicker(true);
                  setManagerSearchQuery('');
                }}
                className="text-xs text-blue-600 hover:text-blue-700"
                data-testid="entity-edit-manager-button"
              >
                {entity.reportsTo ? 'Change' : 'Set Manager'}
              </button>
            ) : (
              <button
                onClick={() => setShowManagerPicker(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
                data-testid="entity-cancel-manager-edit"
              >
                Cancel
              </button>
            )}
          </div>
          {showManagerPicker ? (
            <ManagerPicker
              entityId={entity.id}
              currentManagerId={entity.reportsTo || null}
              searchQuery={managerSearchQuery}
              onSearchChange={setManagerSearchQuery}
              onSelect={async (managerId) => {
                try {
                  await setEntityManager.mutateAsync(managerId);
                  setShowManagerPicker(false);
                } catch {
                  // Error handled by mutation
                }
              }}
              isLoading={setEntityManager.isPending}
            />
          ) : entity.reportsTo ? (
            <ManagerDisplay
              managerId={entity.reportsTo}
              onClick={(id) => navigate({ to: '/entities', search: { selected: id, name: undefined, page: 1, limit: 25 } })}
            />
          ) : (
            <span className="text-sm text-gray-400" data-testid="entity-no-manager">No manager assigned</span>
          )}
          {setEntityManager.isError && (
            <p className="mt-1 text-xs text-red-600" data-testid="entity-manager-error">
              {setEntityManager.error.message}
            </p>
          )}
        </div>

        {/* Management Chain */}
        {managementChain && managementChain.length > 0 && (
          <div className="mb-4" data-testid="entity-management-chain">
            <div className="text-xs text-gray-500 mb-2">Management Chain</div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-sm text-gray-700">{entity.name}</span>
              {managementChain.map((manager: Entity, index: number) => (
                <span key={manager.id} className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                  <button
                    onClick={() => navigate({ to: '/entities', search: { selected: manager.id, name: undefined, page: 1, limit: 25 } })}
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    data-testid={`chain-entity-${index}`}
                  >
                    {manager.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        {chainLoading && (
          <div className="text-xs text-gray-400 mb-4">Loading management chain...</div>
        )}

        {/* Direct Reports */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              Direct Reports {directReports && directReports.length > 0 && `(${directReports.length})`}
            </span>
            {directReports && directReports.length > 0 && (
              <button
                onClick={() => setShowOrgChart(!showOrgChart)}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                data-testid="entity-toggle-org-chart"
              >
                {showOrgChart ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Hide chart
                  </>
                ) : (
                  <>
                    <GitBranch className="w-3 h-3" />
                    Show chart
                  </>
                )}
              </button>
            )}
          </div>
          {reportsLoading ? (
            <div className="text-xs text-gray-400">Loading reports...</div>
          ) : !directReports || directReports.length === 0 ? (
            <span className="text-sm text-gray-400" data-testid="entity-no-reports">No direct reports</span>
          ) : showOrgChart ? (
            <OrgChartView
              rootEntity={entity}
              directReports={directReports}
              onEntityClick={(id) => navigate({ to: '/entities', search: { selected: id, name: undefined, page: 1, limit: 25 } })}
            />
          ) : (
            <div className="space-y-1" data-testid="entity-direct-reports-list">
              {directReports.map((report: Entity) => (
                <button
                  key={report.id}
                  onClick={() => navigate({ to: '/entities', search: { selected: report.id, name: undefined, page: 1, limit: 25 } })}
                  className="flex items-center gap-2 w-full p-2 text-left rounded hover:bg-gray-50 transition-colors"
                  data-testid={`direct-report-${report.id}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${ENTITY_TYPE_STYLES[report.entityType]?.bg || 'bg-gray-100'}`}>
                    {report.entityType === 'agent' ? <Bot className="w-3 h-3 text-blue-600" /> :
                     report.entityType === 'human' ? <User className="w-3 h-3 text-green-600" /> :
                     <Server className="w-3 h-3 text-purple-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{report.name}</div>
                    <div className="text-xs text-gray-500">{report.entityType}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Statistics</h3>
        {statsLoading ? (
          <div className="text-sm text-gray-500">Loading stats...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3" data-testid="entity-stats">
            <StatCard icon={ListTodo} label="Assigned Tasks" value={stats.assignedTaskCount} />
            <StatCard icon={Clock} label="Active Tasks" value={stats.activeTaskCount} color="text-yellow-600" />
            <StatCard icon={CheckCircle} label="Completed" value={stats.completedTaskCount} color="text-green-600" />
            <StatCard icon={ListTodo} label="Created Tasks" value={stats.createdTaskCount} color="text-blue-600" />
            <StatCard icon={MessageSquare} label="Messages Sent" value={stats.messageCount} />
            <StatCard icon={FileText} label="Documents Created" value={stats.documentCount} />
          </div>
        ) : null}
      </div>

      {/* Activity Contribution Chart */}
      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Activity
        </h3>
        <ContributionChart
          activity={activityData?.activity || []}
          startDate={activityData?.startDate}
          endDate={activityData?.endDate}
          isLoading={activityLoading}
          testId="entity-contribution-chart"
        />
      </div>

      {/* Active Tasks */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          Assigned Tasks ({tasks.length})
        </h3>
        {tasksLoading ? (
          <div className="text-sm text-gray-500">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-gray-500">No active tasks assigned</div>
        ) : (
          <div className="space-y-2" data-testid="entity-tasks">
            {tasks.slice(0, 5).map((task: any) => (
              <TaskMiniCard key={task.id} task={task} onClick={onNavigateToTask} />
            ))}
            {tasks.length > 5 && (
              <button
                onClick={() => navigate({ to: '/tasks', search: { assignee: entity.id, page: 1, limit: 25 } })}
                className="w-full text-xs text-blue-600 hover:text-blue-700 text-center py-1 hover:bg-blue-50 rounded transition-colors"
                data-testid="view-all-tasks"
              >
                +{tasks.length - 5} more tasks
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Recent Activity
        </h3>
        {eventsLoading ? (
          <div className="text-sm text-gray-500">Loading activity...</div>
        ) : !events || events.length === 0 ? (
          <div className="text-sm text-gray-500">No recent activity</div>
        ) : (
          <>
            <div className="divide-y divide-gray-100" data-testid="entity-events">
              {events.slice(0, 10).map((event: any) => (
                <ActivityFeedItem key={event.id} event={event} />
              ))}
            </div>
            {events.length > 0 && (
              <button
                onClick={() => navigate({ to: '/dashboard/timeline', search: { page: 1, limit: 100, actor: entity.id, startTime: undefined, endTime: undefined } })}
                className="w-full mt-3 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded py-2 transition-colors flex items-center justify-center gap-1"
                data-testid="view-all-activity"
              >
                View all activity
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Mentioned In Section */}
      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <AtSign className="w-4 h-4" />
          Mentioned In
          {mentionsData && mentionsData.totalCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full" data-testid="mentions-count-badge">
              {mentionsData.totalCount}
            </span>
          )}
        </h3>
        {mentionsLoading ? (
          <div className="text-sm text-gray-500">Loading mentions...</div>
        ) : !mentionsData || mentionsData.totalCount === 0 ? (
          <div className="text-sm text-gray-500" data-testid="no-mentions">
            No documents or tasks mention this entity
          </div>
        ) : (
          <div className="space-y-2" data-testid="entity-mentions">
            {mentionsData.mentions.slice(0, 5).map((mention: any) => (
              <button
                key={mention.id}
                onClick={() => {
                  if (mention.type === 'document') {
                    navigate({ to: '/documents', search: { selected: mention.id, library: undefined } });
                  } else {
                    navigate({ to: '/tasks', search: { selected: mention.id, page: 1, limit: 25 } });
                  }
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                data-testid={`mention-item-${mention.id}`}
              >
                <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                  mention.type === 'document' ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  {mention.type === 'document' ? (
                    <FileText className="w-4 h-4 text-blue-600" />
                  ) : (
                    <ListTodo className="w-4 h-4 text-green-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                    {mention.title}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="capitalize">{mention.type}</span>
                    {mention.status && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        mention.status === 'closed' ? 'bg-green-100 text-green-700' :
                        mention.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        mention.status === 'blocked' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {mention.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            {mentionsData.totalCount > 5 && (
              <div className="text-xs text-gray-500 text-center py-1">
                +{mentionsData.totalCount - 5} more mentions
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
        <div>Created: {new Date(entity.createdAt).toLocaleString()}</div>
        <div>Updated: {new Date(entity.updatedAt).toLocaleString()}</div>
      </div>
    </>
  );
}

// Inbox tab content (extracted for readability)
function InboxTabContent({
  inboxView,
  inboxCount,
  archivedData,
  inboxData,
  inboxLoading,
  inboxError,
  inboxSourceFilter,
  inboxSortOrder,
  filteredAndSortedInboxItems,
  groupedInboxItems,
  selectedInboxItemId,
  selectedInboxItem,
  pendingItemId,
  timeUpdateTrigger,
  markAllRead,
  onInboxViewChange,
  onSourceFilterChange,
  onSortOrderChange,
  onSelectInboxItem,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  onMarkAllRead,
  onNavigateToMessage,
  onNavigateToEntity,
  refetchInbox,
}: {
  inboxView: InboxViewType;
  inboxCount: any;
  archivedData: any;
  inboxData: any;
  inboxLoading: boolean;
  inboxError: boolean;
  inboxSourceFilter: InboxSourceFilter;
  inboxSortOrder: InboxSortOrder;
  filteredAndSortedInboxItems: any[];
  groupedInboxItems: any[];
  selectedInboxItemId: string | null;
  selectedInboxItem: any;
  pendingItemId: string | null;
  timeUpdateTrigger: number;
  markAllRead: any;
  onInboxViewChange: (view: InboxViewType) => void;
  onSourceFilterChange: (filter: InboxSourceFilter) => void;
  onSortOrderChange: (order: InboxSortOrder) => void;
  onSelectInboxItem: (id: string | null) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigateToMessage: (channelId: string, messageId: string) => void;
  onNavigateToEntity: (entityId: string) => void;
  refetchInbox: () => void;
}) {
  return (
    <div className="flex flex-col h-full -m-4" data-testid="entity-inbox-tab">
      {/* Inbox Header with View Tabs */}
      <div className="flex flex-col gap-2 p-3 border-b border-gray-200 bg-gray-50/50">
        {/* Title and Mark All Read */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Inbox
          </h3>
          {inboxView !== 'archived' && inboxCount && inboxCount.count > 0 && (
            <button
              onClick={onMarkAllRead}
              disabled={markAllRead.isPending}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
              data-testid="inbox-mark-all-read"
            >
              {markAllRead.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3" />
              )}
              Mark all read
            </button>
          )}
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg" data-testid="inbox-view-tabs">
          {INBOX_VIEW_TABS.map((tab) => {
            const isSelected = inboxView === tab.value;
            let countBadge = null;
            if (tab.value === 'unread' && inboxCount && inboxCount.count > 0) {
              countBadge = (
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                  }`}
                  data-testid="inbox-unread-count-badge"
                >
                  {inboxCount.count}
                </span>
              );
            } else if (tab.value === 'archived' && archivedData && archivedData.total > 0) {
              countBadge = (
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    isSelected ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                  }`}
                  data-testid="inbox-archived-count-badge"
                >
                  {archivedData.total}
                </span>
              );
            }

            return (
              <button
                key={tab.value}
                onClick={() => onInboxViewChange(tab.value)}
                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isSelected
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                data-testid={`inbox-view-${tab.value}`}
              >
                {tab.label}
                {countBadge}
              </button>
            );
          })}
        </div>

        {/* Filter and Sort Controls */}
        <div className="flex items-center gap-2" data-testid="inbox-filter-sort-controls">
          {/* Source Filter Dropdown */}
          <div className="relative">
            <button
              className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                inboxSourceFilter !== 'all'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => {
                const dropdown = document.getElementById('inbox-filter-dropdown');
                if (dropdown) {
                  dropdown.classList.toggle('hidden');
                }
              }}
              data-testid="inbox-filter-button"
            >
              <Filter className="w-3 h-3" />
              Filter
              <ChevronDown className="w-3 h-3" />
            </button>
            <div
              id="inbox-filter-dropdown"
              className="hidden absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10"
              data-testid="inbox-filter-dropdown"
            >
              <div className="p-1">
                <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Source Type</div>
                {[
                  { value: 'all', label: 'All Messages', icon: Mail },
                  { value: 'direct', label: 'Direct Messages', icon: MessageSquare },
                  { value: 'mention', label: 'Mentions', icon: AtSign },
                ].map((option) => {
                  const OptionIcon = option.icon;
                  const isSelected = inboxSourceFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        onSourceFilterChange(option.value as InboxSourceFilter);
                        const dropdown = document.getElementById('inbox-filter-dropdown');
                        if (dropdown) dropdown.classList.add('hidden');
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      data-testid={`inbox-filter-${option.value}`}
                    >
                      <OptionIcon className="w-3.5 h-3.5" />
                      {option.label}
                      {isSelected && <CheckCircle className="w-3 h-3 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                inboxSortOrder !== 'newest'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => {
                const dropdown = document.getElementById('inbox-sort-dropdown');
                if (dropdown) {
                  dropdown.classList.toggle('hidden');
                }
              }}
              data-testid="inbox-sort-button"
            >
              <ArrowUpDown className="w-3 h-3" />
              Sort
              <ChevronDown className="w-3 h-3" />
            </button>
            <div
              id="inbox-sort-dropdown"
              className="hidden absolute left-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-10"
              data-testid="inbox-sort-dropdown"
            >
              <div className="p-1">
                {[
                  { value: 'newest', label: 'Newest First', icon: ArrowDown },
                  { value: 'oldest', label: 'Oldest First', icon: ArrowUp },
                  { value: 'sender', label: 'By Sender', icon: User },
                ].map((option) => {
                  const OptionIcon = option.icon;
                  const isSelected = inboxSortOrder === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        onSortOrderChange(option.value as InboxSortOrder);
                        const dropdown = document.getElementById('inbox-sort-dropdown');
                        if (dropdown) dropdown.classList.add('hidden');
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      data-testid={`inbox-sort-${option.value}`}
                    >
                      <OptionIcon className="w-3.5 h-3.5" />
                      {option.label}
                      {isSelected && <CheckCircle className="w-3 h-3 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(inboxSourceFilter !== 'all' || inboxSortOrder !== 'newest') && (
          <div className="flex flex-wrap gap-1.5" data-testid="inbox-active-filters">
            {inboxSourceFilter !== 'all' && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full"
                data-testid={`inbox-filter-chip-${inboxSourceFilter}`}
              >
                {inboxSourceFilter === 'direct' ? (
                  <>
                    <MessageSquare className="w-3 h-3" />
                    Direct Messages
                  </>
                ) : (
                  <>
                    <AtSign className="w-3 h-3" />
                    Mentions
                  </>
                )}
                <button
                  onClick={() => onSourceFilterChange('all')}
                  className="ml-0.5 hover:text-blue-900"
                  data-testid="inbox-clear-source-filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {inboxSortOrder !== 'newest' && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
                data-testid={`inbox-sort-chip-${inboxSortOrder}`}
              >
                {inboxSortOrder === 'oldest' ? (
                  <>
                    <ArrowUp className="w-3 h-3" />
                    Oldest First
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3" />
                    By Sender
                  </>
                )}
                <button
                  onClick={() => onSortOrderChange('newest')}
                  className="ml-0.5 hover:text-gray-900"
                  data-testid="inbox-clear-sort"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {inboxSourceFilter !== 'all' && inboxSortOrder !== 'newest' && (
              <button
                onClick={() => {
                  onSourceFilterChange('all');
                  onSortOrderChange('newest');
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                data-testid="inbox-clear-all-filters"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Split Layout - Message List + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Message List */}
        <div
          className="w-2/5 min-w-[200px] max-w-[300px] border-r border-gray-200 overflow-auto"
          data-testid="inbox-message-list"
        >
          {inboxLoading ? (
            <div className="p-4 text-sm text-gray-500">Loading inbox...</div>
          ) : inboxError ? (
            <div className="text-center py-8 px-4" data-testid="inbox-error">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-gray-700">Failed to load inbox</p>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                There was an error loading your messages
              </p>
              <button
                onClick={() => refetchInbox()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                data-testid="inbox-retry"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          ) : !inboxData || inboxData.items.length === 0 ? (
            <div className="text-center py-8 px-4" data-testid="inbox-empty">
              <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {inboxView === 'unread'
                  ? 'No unread messages'
                  : inboxView === 'archived'
                  ? 'No archived messages'
                  : 'No messages in inbox'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {inboxView === 'archived'
                  ? 'Archived messages will appear here'
                  : 'Direct messages and @mentions will appear here'}
              </p>
            </div>
          ) : filteredAndSortedInboxItems.length === 0 ? (
            <div className="text-center py-8 px-4" data-testid="inbox-filtered-empty">
              <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No messages match your filters</p>
              <p className="text-xs text-gray-400 mt-1">
                Try adjusting your filter settings
              </p>
              <button
                onClick={() => onSourceFilterChange('all')}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                data-testid="inbox-clear-filters-link"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <VirtualizedList
              items={groupedInboxItems}
              getItemKey={(groupedItem) => groupedItem.item.id}
              estimateSize={(index) => {
                const groupedItem = groupedInboxItems[index];
                if (groupedItem?.isFirstInGroup && inboxSortOrder !== 'sender') {
                  return 56 + 28;
                }
                return 56;
              }}
              height="100%"
              testId="inbox-items-list"
              renderItem={(groupedItem) => (
                <>
                  {groupedItem.isFirstInGroup && inboxSortOrder !== 'sender' && (
                    <InboxTimePeriodHeader period={groupedItem.period} />
                  )}
                  <InboxMessageListItem
                    item={groupedItem.item}
                    isSelected={selectedInboxItemId === groupedItem.item.id}
                    onSelect={() => onSelectInboxItem(groupedItem.item.id)}
                    formattedTime={formatCompactTime(groupedItem.item.createdAt)}
                    key={`${groupedItem.item.id}-${timeUpdateTrigger}`}
                  />
                </>
              )}
            />
          )}
          {inboxData && inboxData.items.length > 0 && (
            <div className="text-center text-xs text-gray-500 py-2 border-t border-gray-100">
              {inboxSourceFilter !== 'all' ? (
                <>
                  Showing {filteredAndSortedInboxItems.length} of {inboxData.items.length} (filtered)
                </>
              ) : inboxData.hasMore ? (
                <>
                  Showing {inboxData.items.length} of {inboxData.total} items
                </>
              ) : (
                <>
                  {inboxData.items.length} {inboxData.items.length === 1 ? 'item' : 'items'}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Message Content */}
        <div className="flex-1 overflow-hidden bg-white" data-testid="inbox-message-content-panel">
          {selectedInboxItem ? (
            <InboxMessageContent
              item={selectedInboxItem}
              onMarkRead={() => onMarkRead(selectedInboxItem.id)}
              onMarkUnread={() => onMarkUnread(selectedInboxItem.id)}
              onArchive={() => onArchive(selectedInboxItem.id)}
              onRestore={() => onRestore(selectedInboxItem.id)}
              isPending={pendingItemId === selectedInboxItem.id}
              onNavigateToMessage={() => onNavigateToMessage(selectedInboxItem.channelId, selectedInboxItem.messageId)}
              onNavigateToEntity={onNavigateToEntity}
              onReply={() => onNavigateToMessage(selectedInboxItem.channelId, selectedInboxItem.messageId)}
            />
          ) : (
            <InboxMessageEmptyState />
          )}
        </div>
      </div>
    </div>
  );
}
