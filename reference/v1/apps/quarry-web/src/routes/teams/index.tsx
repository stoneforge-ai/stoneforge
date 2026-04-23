/**
 * Teams Page
 *
 * Lists all teams with member count and avatar previews.
 * Includes detail panel for selected team.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { UsersRound, Plus } from 'lucide-react';
import { Pagination, PageHeader } from '../../components/shared';
import { ElementNotFound } from '../../components/shared/ElementNotFound';
import { MobileDetailSheet } from '../../components/shared/MobileDetailSheet';
import { MobileTeamCard } from '../../components/team/MobileTeamCard';
import { CreateTeamModal } from '../../components/team/CreateTeamModal';
import { useAllTeams } from '../../api/hooks/useAllElements';
import { usePaginatedData, createTeamFilter } from '../../hooks/usePaginatedData';
import { useDeepLink } from '../../hooks/useDeepLink';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { useShortcutVersion } from '../../hooks';
import { getCurrentBinding } from '../../lib/keyboard';

import { DEFAULT_PAGE_SIZE } from './constants';
import type { Team } from './types';
import { SearchBox, TeamCard, TeamDetailPanel } from './components';

export function TeamsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/teams' });
  const isMobile = useIsMobile();
  // Track shortcut changes to update the badge
  useShortcutVersion();

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    search.selected ?? null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Use upfront-loaded data (TB67) instead of server-side pagination
  const { data: allTeams, isLoading: isTeamsLoading } = useAllTeams();

  // Create filter function for client-side filtering
  const filterFn = useMemo(() => {
    return createTeamFilter({ search: searchQuery });
  }, [searchQuery]);

  // Client-side pagination with filtering (TB69)
  const paginatedData = usePaginatedData<Team>({
    data: allTeams as Team[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: { field: 'updatedAt', direction: 'desc' },
  });

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allTeams as Team[] | undefined,
    selectedId: search.selected,
    currentPage,
    pageSize,
    getId: (team) => team.id,
    routePath: '/teams',
    rowTestIdPrefix: 'team-card-',
    autoNavigate: true,
    highlightDelay: 200,
  });

  // Extract items from client-side paginated data (TB69)
  const teamItems = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading = isTeamsLoading || paginatedData.isLoading;

  // Sync selected team from URL on mount and when search changes
  useEffect(() => {
    // When URL has a selected param, sync it to state
    if (search.selected && search.selected !== selectedTeamId) {
      setSelectedTeamId(search.selected);
    }
    // When URL doesn't have a selected param but state has one, clear state
    if (!search.selected && selectedTeamId) {
      setSelectedTeamId(null);
    }
  }, [search.selected]);

  const handleTeamClick = (teamId: string) => {
    setSelectedTeamId(teamId);
    navigate({ to: '/teams', search: { selected: teamId, page: currentPage, limit: pageSize } });
  };

  const handleCloseDetail = () => {
    setSelectedTeamId(null);
    navigate({ to: '/teams', search: { selected: undefined, page: currentPage, limit: pageSize } });
  };

  const handleTeamCreated = (team: Team) => {
    setSelectedTeamId(team.id);
    navigate({ to: '/teams', search: { selected: team.id, page: currentPage, limit: pageSize } });
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/teams', search: { page, limit: pageSize, selected: selectedTeamId ?? undefined } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    // When page size changes, go back to page 1
    navigate({ to: '/teams', search: { page: 1, limit: newPageSize, selected: selectedTeamId ?? undefined } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Reset to first page when search changes
    navigate({ to: '/teams', search: { page: 1, limit: pageSize, selected: selectedTeamId ?? undefined } });
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    navigate({ to: '/teams', search: { page: 1, limit: pageSize, selected: selectedTeamId ?? undefined } });
  };

  // Mobile: show full-screen detail sheet
  // Desktop: show split view with list and detail panel
  return (
    <div className="h-full flex" data-testid="teams-page">
      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTeamCreated}
      />

      {/* Team List - full width on mobile, split on desktop when team selected */}
      <div className={`flex flex-col ${!isMobile && selectedTeamId ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
        {/* Header */}
        <PageHeader
          title="Teams"
          icon={UsersRound}
          iconColor="text-blue-500"
          count={teamItems.length}
          totalCount={totalItems}
          bordered
          actions={[
            {
              label: 'Create Team',
              shortLabel: 'Add',
              icon: Plus,
              onClick: () => setIsCreateModalOpen(true),
              shortcut: getCurrentBinding('action.createTeam'),
              testId: 'new-team-button',
            },
          ]}
          testId="teams-header"
        >
          <SearchBox value={searchQuery} onChange={handleSearchChange} />
        </PageHeader>

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[var(--color-text-muted)]" data-testid="teams-loading">
              Loading teams...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && teamItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-4" data-testid="teams-empty">
              {searchQuery ? (
                <>
                  <p className="text-[var(--color-text-muted)]">No teams match your search</p>
                  <button
                    onClick={handleClearSearch}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 touch-target"
                    data-testid="clear-search-button"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-text-muted)]">No teams created</p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 touch-target"
                    data-testid="create-team-empty-button"
                  >
                    Create one
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Team list - cards on mobile, grid on desktop */}
        {!isLoading && teamItems.length > 0 && (
          <div className="flex-1 overflow-auto -mx-4 sm:mx-0" data-testid="teams-grid">
            {isMobile ? (
              // Mobile: stacked cards
              <div className="divide-y divide-[var(--color-border)]">
                {teamItems.map((team) => (
                  <MobileTeamCard
                    key={team.id}
                    team={team}
                    isSelected={team.id === selectedTeamId}
                    onClick={() => handleTeamClick(team.id)}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            ) : (
              // Desktop: grid layout
              <div className={`grid gap-4 ${selectedTeamId ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                {teamItems.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    isSelected={team.id === selectedTeamId}
                    onClick={() => handleTeamClick(team.id)}
                  />
                ))}
              </div>
            )}
            {/* Pagination */}
            <div className="mt-4 sm:mt-6 px-4 sm:px-0 pb-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile: Full-screen detail sheet */}
      {isMobile && selectedTeamId && (
        <MobileDetailSheet
          open={!!selectedTeamId}
          onClose={handleCloseDetail}
          title="Team Details"
          data-testid="team-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Team"
              elementId={selectedTeamId}
              backRoute="/teams"
              backLabel="Back to Teams"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TeamDetailPanel teamId={selectedTeamId} onClose={handleCloseDetail} onDeleted={() => setSelectedTeamId(null)} />
          )}
        </MobileDetailSheet>
      )}

      {/* Desktop: Side panel */}
      {!isMobile && selectedTeamId && (
        <div className="w-1/2 border-l border-[var(--color-border)]" data-testid="team-detail-container">
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Team"
              elementId={selectedTeamId}
              backRoute="/teams"
              backLabel="Back to Teams"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TeamDetailPanel teamId={selectedTeamId} onClose={handleCloseDetail} onDeleted={() => setSelectedTeamId(null)} />
          )}
        </div>
      )}
    </div>
  );
}

// Default export for route
export default TeamsPage;
