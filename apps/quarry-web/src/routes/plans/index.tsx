/**
 * Plans Page - Plan management with progress visualization
 *
 * Features:
 * - List all plans with status badges
 * - Progress bars showing completion percentage
 * - Plan detail panel with task breakdown
 * - Filter by status
 * - Edit plan title and status
 * - Add/remove tasks from plan
 * - Status transition buttons
 * - Search plans by title
 * - Roadmap view showing plans as horizontal bars on timeline
 * - Plans must have at least one task
 */

import { useState, useEffect, useMemo } from 'react';
import { useDebounce, useIsMobile, useGlobalQuickActions, useShortcutVersion } from '../../hooks';
import { getCurrentBinding } from '../../lib/keyboard';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { ElementNotFound } from '../../components/shared/ElementNotFound';
import { PageHeader } from '../../components/shared';
import { MobileDetailSheet } from '../../components/shared/MobileDetailSheet';
import {
  PlanSearchBar,
  StatusFilter,
  ViewToggle,
  PlanListItem,
  MobilePlanCard,
  RoadmapView,
  PlanDetailPanel,
  getStoredSearch,
  setStoredSearch,
  fuzzySearch,
  getStoredViewMode,
  setStoredViewMode,
  SEARCH_DEBOUNCE_DELAY,
  type HydratedPlan,
  type ViewMode,
} from '@stoneforge/ui/plans';
import { useAllPlans } from '../../api/hooks/useAllElements';
import { usePlans } from '../../api/hooks/usePlanApi';
import { useDeepLink } from '../../hooks/useDeepLink';
import { ClipboardList, Plus } from 'lucide-react';

/**
 * Main Plans Page Component with search and responsive design
 */
export function PlansPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/plans' });
  const isMobile = useIsMobile();
  const { openCreatePlanModal } = useGlobalQuickActions();
  // Track shortcut changes to update the badge
  useShortcutVersion();

  const [selectedStatus, setSelectedStatus] = useState<string | null>(search.status ?? null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(search.selected ?? null);

  // View mode state - Default to list on mobile, roadmap only on desktop
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Force list view on mobile since roadmap isn't mobile-optimized
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return 'list';
    }
    return getStoredViewMode();
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>(getStoredSearch());
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_DELAY);

  // Use upfront-loaded data - but note it doesn't include progress
  const { data: allPlans } = useAllPlans();

  // Use server-side query with progress hydration
  // This is the primary data source for plans with progress info
  const { data: serverPlans = [], isLoading: isServerLoading, error } = usePlans(selectedStatus ?? undefined);

  // Prefer server data with progress, fall back to allPlans for deep-linking checks
  const basePlans = useMemo(() => {
    // Server query returns plans with progress hydration - always use if available
    if (serverPlans && serverPlans.length > 0) {
      return serverPlans;
    }
    // Fallback to upfront-loaded data (may not have progress)
    if (allPlans && allPlans.length > 0) {
      if (selectedStatus) {
        return (allPlans as HydratedPlan[]).filter(p => p.status === selectedStatus);
      }
      return allPlans as HydratedPlan[];
    }
    return [];
  }, [allPlans, serverPlans, selectedStatus]);

  // Filter plans by search query and compute match indices
  const { filteredPlans, matchIndicesMap } = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return { filteredPlans: basePlans, matchIndicesMap: new Map<string, number[]>() };
    }

    const matchMap = new Map<string, number[]>();
    const filtered = basePlans.filter((plan) => {
      const match = fuzzySearch(plan.title, debouncedSearchQuery);
      if (match && match.matched) {
        matchMap.set(plan.id, match.indices);
        return true;
      }
      return false;
    });

    return { filteredPlans: filtered, matchIndicesMap: matchMap };
  }, [basePlans, debouncedSearchQuery]);

  const plans = filteredPlans;
  const isLoading = isServerLoading;

  // Deep-link navigation
  const deepLink = useDeepLink({
    data: allPlans as HydratedPlan[] | undefined,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 1000, // Plans don't have pagination
    getId: (plan) => plan.id,
    routePath: '/plans',
    rowTestIdPrefix: 'plan-item-',
    autoNavigate: false, // No pagination
    highlightDelay: 200,
  });

  // Sync with URL on mount
  useEffect(() => {
    if (search.selected && search.selected !== selectedPlanId) {
      setSelectedPlanId(search.selected);
    }
    if (search.status && search.status !== selectedStatus) {
      setSelectedStatus(search.status);
    }
  }, [search.selected, search.status]);

  // Persist search query to localStorage
  useEffect(() => {
    setStoredSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const handlePlanClick = (planId: string) => {
    setSelectedPlanId(planId);
    navigate({ to: '/plans', search: { selected: planId, status: selectedStatus ?? undefined } });
  };

  const handleCloseDetail = () => {
    setSelectedPlanId(null);
    navigate({ to: '/plans', search: { selected: undefined, status: selectedStatus ?? undefined } });
  };

  const handleStatusFilterChange = (status: string | null) => {
    setSelectedStatus(status);
    navigate({ to: '/plans', search: { selected: selectedPlanId ?? undefined, status: status ?? undefined } });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSearchClear = () => {
    setSearchQuery('');
  };

  // View mode change handler
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  };

  // Determine what to show in empty state
  const isSearchActive = debouncedSearchQuery.trim().length > 0;
  const totalBeforeSearch = basePlans.length;

  return (
    <div data-testid="plans-page" className="h-full flex flex-col">
      {/* Header */}
      <PageHeader
        title="Plans"
        icon={ClipboardList}
        iconColor="text-blue-500"
        count={plans.length > 0 ? plans.length : undefined}
        totalCount={isSearchActive && totalBeforeSearch !== plans.length ? totalBeforeSearch : undefined}
        bordered
        actions={[
          {
            label: 'Create Plan',
            shortLabel: 'Create',
            icon: Plus,
            onClick: openCreatePlanModal,
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
            onChange={handleSearchChange}
            onClear={handleSearchClear}
          />
          {/* Filter and View Controls */}
          <div className="flex items-center justify-between gap-4">
            <div className={isMobile ? 'overflow-x-auto -mx-3 px-3 scrollbar-hide flex-1' : ''}>
              <StatusFilter
                selectedStatus={selectedStatus}
                onStatusChange={handleStatusFilterChange}
              />
            </div>
            {/* View Toggle - Hide on mobile */}
            {!isMobile && (
              <ViewToggle
                view={viewMode}
                onViewChange={handleViewModeChange}
              />
            )}
          </div>
        </div>
      </PageHeader>

      {/* Content - Responsive layout */}
      <div className={`flex-1 flex overflow-hidden ${selectedPlanId && isMobile ? 'hidden' : ''}`}>
        {/* Plan Content - List or Roadmap View */}
        <div className={`flex-1 overflow-y-auto bg-[var(--color-bg)] ${viewMode === 'roadmap' ? 'overflow-x-auto p-4' : isMobile ? '' : 'p-4'}`} tabIndex={0} role="region" aria-label="Plan content">
          {isLoading && (
            <div
              data-testid="plans-loading"
              className="text-center py-12 text-[var(--color-text-secondary)]"
            >
              Loading plans...
            </div>
          )}

          {error && (
            <div
              data-testid="plans-error"
              className="text-center py-12 text-red-500"
            >
              Failed to load plans
            </div>
          )}

          {!isLoading && !error && plans.length === 0 && (
            <div
              data-testid="plans-empty"
              className="text-center py-12"
            >
              <ClipboardList className="w-12 h-12 text-[var(--color-border)] mx-auto mb-3" />
              {isSearchActive ? (
                <>
                  <p className="text-[var(--color-text-secondary)]" data-testid="plans-no-search-results">
                    No plans matching "{debouncedSearchQuery}"
                  </p>
                  <button
                    onClick={handleSearchClear}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                    data-testid="plans-clear-search"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-text-secondary)]">No plans found</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {selectedStatus
                      ? `No ${selectedStatus} plans available`
                      : 'Create your first plan to get started'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Mobile List View with Cards */}
          {!isLoading && !error && plans.length > 0 && viewMode === 'list' && isMobile && (
            <div data-testid="mobile-plans-list">
              {plans.map((plan) => (
                <MobilePlanCard
                  key={plan.id}
                  plan={plan}
                  isSelected={selectedPlanId === plan.id}
                  onClick={() => handlePlanClick(plan.id)}
                  searchMatchIndices={matchIndicesMap.get(plan.id)}
                />
              ))}
            </div>
          )}

          {/* Desktop List View */}
          {!isLoading && !error && plans.length > 0 && viewMode === 'list' && !isMobile && (
            <div data-testid="plans-list" className="space-y-3">
              {plans.map((plan) => (
                <PlanListItem
                  key={plan.id}
                  plan={plan}
                  isSelected={selectedPlanId === plan.id}
                  onClick={handlePlanClick}
                  searchMatchIndices={matchIndicesMap.get(plan.id)}
                />
              ))}
            </div>
          )}

          {/* Roadmap View - Desktop only */}
          {!isLoading && !error && plans.length > 0 && viewMode === 'roadmap' && !isMobile && (
            <RoadmapView
              plans={plans}
              onPlanClick={handlePlanClick}
              selectedPlanId={selectedPlanId}
            />
          )}
        </div>

        {/* Plan Detail Panel - Desktop (side panel) */}
        {selectedPlanId && !isMobile && (
          <div className="w-96 flex-shrink-0 border-l border-[var(--color-border)]" data-testid="plan-detail-container">
            {deepLink.notFound ? (
              <ElementNotFound
                elementType="Plan"
                elementId={selectedPlanId}
                backRoute="/plans"
                backLabel="Back to Plans"
                onDismiss={handleCloseDetail}
              />
            ) : (
              <PlanDetailPanel
                planId={selectedPlanId}
                onClose={handleCloseDetail}
              />
            )}
          </div>
        )}
      </div>

      {/* Plan Detail Panel - Mobile (full-screen sheet) */}
      {selectedPlanId && isMobile && (
        <MobileDetailSheet
          open={!!selectedPlanId}
          onClose={handleCloseDetail}
          title="Plan Details"
          data-testid="mobile-plan-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Plan"
              elementId={selectedPlanId}
              backRoute="/plans"
              backLabel="Back to Plans"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <PlanDetailPanel
              planId={selectedPlanId}
              onClose={handleCloseDetail}
            />
          )}
        </MobileDetailSheet>
      )}

      {/* Mobile Floating Action Button for Create Plan */}
      {isMobile && !selectedPlanId && (
        <button
          onClick={openCreatePlanModal}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg z-40 touch-target"
          aria-label="Create new plan"
          data-testid="mobile-create-plan-fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// Default export for route
export default PlansPage;
