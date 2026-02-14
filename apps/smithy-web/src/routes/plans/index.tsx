/**
 * Plans Page - Orchestrator Web
 *
 * Features:
 * - List view with status filtering
 * - Roadmap timeline view
 * - Search with fuzzy matching
 * - Detail panel for selected plan
 * - Create plan modal
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { ClipboardList, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '../../hooks';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { PageHeader } from '../../components/shared/PageHeader';
import { getCurrentBinding } from '../../lib/keyboard';
import {
  usePlans,
  PlanSearchBar,
  StatusFilter,
  ViewToggle,
  PlanListItem,
  MobilePlanCard,
  RoadmapView,
  PlanDetailPanel,
  CreatePlanModal,
  notifyPlanModalTaskCreated,
  fuzzySearch,
  getStoredSearch,
  setStoredSearch,
  getStoredViewMode,
  setStoredViewMode,
  SEARCH_DEBOUNCE_DELAY,
  type ViewMode,
  type HydratedPlan,
} from '@stoneforge/ui/plans';
import { CreateTaskModal } from '../../components/task/CreateTaskModal';

export function PlansPage() {
  const search = useSearch({ from: '/plans' }) as {
    selected?: string;
    status?: string;
    action?: string;
  };
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { currentUser } = useCurrentUser();

  // State
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getStoredViewMode());
  const [searchQuery, setSearchQueryState] = useState(() => getStoredSearch());
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  // Handle ?action=create from global keyboard shortcuts
  useEffect(() => {
    if (search.action === 'create') {
      setShowCreateModal(true);
      // Clear the action param
      navigate({
        to: '/plans',
        search: { selected: search.selected, status: search.status },
        replace: true,
      });
    }
  }, [search.action, search.selected, search.status, navigate]);

  // Fetch plans
  const statusFilter = search.status || null;
  const { data: plans = [], isLoading, isError, error, refetch } = usePlans(statusFilter || undefined);

  // Persist view mode
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setStoredViewMode(mode);
  }, []);

  // Persist search query
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setStoredSearch(query);
  }, []);

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, SEARCH_DEBOUNCE_DELAY);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Filter plans by search query
  const filteredPlans = useMemo(() => {
    if (!debouncedSearch) return plans;
    return plans.filter((plan: HydratedPlan) => {
      const result = fuzzySearch(plan.title, debouncedSearch);
      return result && result.matched;
    });
  }, [plans, debouncedSearch]);

  // Get search match indices for highlighting
  const getMatchIndices = useCallback(
    (title: string): number[] => {
      if (!debouncedSearch) return [];
      const result = fuzzySearch(title, debouncedSearch);
      return result?.indices || [];
    },
    [debouncedSearch]
  );

  // Navigation handlers
  const handlePlanSelect = useCallback(
    (planId: string) => {
      navigate({
        to: '/plans' as const,
        search: { selected: planId, status: search.status ?? undefined },
      });
    },
    [navigate, search.status]
  );

  const handlePlanDeselect = useCallback(() => {
    navigate({ to: '/plans' as const, search: { selected: undefined, status: search.status ?? undefined } });
  }, [navigate, search.status]);

  const handleStatusChange = useCallback(
    (status: string | null) => {
      navigate({
        to: '/plans' as const,
        search: { status: status ?? undefined, selected: undefined },
      });
    },
    [navigate]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  const handleCreateSuccess = useCallback(
    (plan: { id: string; title: string }) => {
      handlePlanSelect(plan.id);
    },
    [handlePlanSelect]
  );

  const handleTaskCreated = useCallback((taskId: string) => {
    // Notify the CreatePlanModal about the new task
    // We need to fetch the task title - for now we'll use a placeholder
    // The modal will refetch and show the task anyway
    fetch(`/api/tasks/${taskId}`)
      .then((res: Response) => res.json())
      .then((data: { task?: { id: string; title: string }; id?: string; title?: string }) => {
        const task = data.task || data as { id: string; title: string };
        notifyPlanModalTaskCreated({ id: task.id, title: task.title });
        toast.success('Task created and added to selection');
      })
      .catch(() => {
        // Even if fetch fails, invalidate queries to refresh the list
        notifyPlanModalTaskCreated({ id: taskId, title: 'New Task' });
      });
    setShowCreateTaskModal(false);
  }, []);

  // Determine if detail panel should show
  const selectedPlanId = search.selected || null;
  const showDetailPanel = selectedPlanId && !isMobile;

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Failed to load plans</h2>
        <p className="text-[var(--color-text-secondary)] mt-1">
          {(error as Error)?.message || 'An unknown error occurred'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Plans"
        icon={ClipboardList}
        iconColor="text-blue-500"
        count={filteredPlans.length}
        totalCount={plans.length !== filteredPlans.length ? plans.length : undefined}
        bordered
        actions={[
          {
            label: 'Create Plan',
            shortLabel: 'Create',
            icon: Plus,
            onClick: () => setShowCreateModal(true),
            shortcut: getCurrentBinding('action.createPlan'),
            testId: 'create-plan-btn',
          },
        ]}
        testId="plans-header"
      >
        {/* Search and filter controls */}
        <div className="space-y-3">
          {/* Search bar */}
          <PlanSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={handleClearSearch}
          />
          {/* Filter and View Controls */}
          <div className="flex items-center justify-between gap-4">
            <div className={isMobile ? 'overflow-x-auto -mx-3 px-3 scrollbar-hide flex-1' : ''}>
              <StatusFilter
                selectedStatus={statusFilter}
                onStatusChange={handleStatusChange}
              />
            </div>
            {/* View Toggle - Hide on mobile */}
            {!isMobile && (
              <ViewToggle
                view={viewMode}
                onViewChange={setViewMode}
              />
            )}
          </div>
        </div>
      </PageHeader>

      {/* Content area */}
      <div className="flex-1 flex min-h-0">
        {/* Main list/roadmap area */}
        <div className={`flex-1 overflow-hidden ${showDetailPanel ? 'hidden lg:block' : ''}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <ClipboardList className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)]">
                {debouncedSearch ? 'No plans found' : 'No plans yet'}
              </h3>
              <p className="text-[var(--color-text-secondary)] mt-1">
                {debouncedSearch
                  ? 'Try adjusting your search or filters'
                  : 'Create your first plan to get started'}
              </p>
              {!debouncedSearch && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  <Plus className="w-4 h-4" />
                  Create Plan
                </button>
              )}
            </div>
          ) : viewMode === 'roadmap' && !isMobile ? (
            <div className="h-full p-4">
              <RoadmapView
                plans={filteredPlans}
                onPlanClick={handlePlanSelect}
                selectedPlanId={selectedPlanId}
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              {isMobile ? (
                // Mobile: Card list
                <div>
                  {filteredPlans.map((plan: HydratedPlan) => (
                    <MobilePlanCard
                      key={plan.id}
                      plan={plan}
                      isSelected={selectedPlanId === plan.id}
                      onClick={() => handlePlanSelect(plan.id)}
                      searchMatchIndices={getMatchIndices(plan.title)}
                    />
                  ))}
                </div>
              ) : (
                // Desktop: List view
                <div className="p-4 space-y-3">
                  {filteredPlans.map((plan: HydratedPlan) => (
                    <PlanListItem
                      key={plan.id}
                      plan={plan}
                      isSelected={selectedPlanId === plan.id}
                      onClick={handlePlanSelect}
                      searchMatchIndices={getMatchIndices(plan.title)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail panel (desktop only) */}
        {showDetailPanel && selectedPlanId && (
          <div className="w-96 flex-shrink-0 border-l border-[var(--color-border)] overflow-hidden">
            <PlanDetailPanel
              planId={selectedPlanId}
              onClose={handlePlanDeselect}
              taskLinkBase="/tasks"
              onRemoveTaskNotAllowed={() =>
                toast.error('Cannot remove the last task. Plans must have at least one task.')
              }
              onDeleteSuccess={() => {
                toast.success('Plan deleted successfully');
                handlePlanDeselect();
              }}
              onDeleteError={(msg: string) => toast.error(msg)}
            />
          </div>
        )}
      </div>

      {/* Create plan modal */}
      <CreatePlanModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        currentUserId={currentUser?.id}
        isMobile={isMobile}
        onToastSuccess={(msg: string) => toast.success(msg)}
        onToastError={(msg: string) => toast.error(msg)}
        onCreateNewTask={() => setShowCreateTaskModal(true)}
      />

      {/* Create task modal (opened from Create Plan modal) */}
      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        onSuccess={handleTaskCreated}
      />
    </div>
  );
}
