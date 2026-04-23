/**
 * Entities Page
 *
 * Lists all entities with filtering by type and search functionality.
 * Includes detail panel with stats, activity timeline, and inbox.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Users, Plus } from 'lucide-react';
import { Pagination, PageHeader } from '../../components/shared';
import { ElementNotFound } from '../../components/shared/ElementNotFound';
import { MobileDetailSheet } from '../../components/shared/MobileDetailSheet';
import { MobileEntityCard, CreateEntityModal, EntityCard } from '../../components/entity';
import { useAllEntities as useAllEntitiesPreloaded } from '../../api/hooks/useAllElements';
import { usePaginatedData, createEntityFilter } from '../../hooks/usePaginatedData';
import { useDeepLink } from '../../hooks/useDeepLink';
import { useShortcutVersion } from '../../hooks';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { getCurrentBinding } from '../../lib/keyboard';

import { useEntityByName } from './hooks';
import { DEFAULT_PAGE_SIZE } from './constants';
import type { Entity, EntityTypeFilter } from './types';
import { FilterTabs, SearchBox, EntityDetailPanel } from './components';

export function EntitiesPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/entities' });
  const isMobile = useIsMobile();
  useShortcutVersion();

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;

  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    search.selected ?? null
  );
  const [isCreateEntityModalOpen, setIsCreateEntityModalOpen] = useState(false);

  // Use upfront-loaded data instead of server-side pagination
  const { data: allEntities, isLoading: isEntitiesLoading } = useAllEntitiesPreloaded();

  // Create filter function for client-side filtering
  const filterFn = useMemo(() => {
    return createEntityFilter({
      entityType: typeFilter,
      search: searchQuery,
    });
  }, [typeFilter, searchQuery]);

  // Client-side pagination with filtering
  const paginatedData = usePaginatedData<Entity>({
    data: allEntities as Entity[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: { field: 'updatedAt', direction: 'desc' },
  });

  // Deep-link navigation
  const deepLink = useDeepLink({
    data: allEntities as Entity[] | undefined,
    selectedId: search.selected,
    currentPage,
    pageSize,
    getId: (entity) => entity.id,
    routePath: '/entities',
    rowTestIdPrefix: 'entity-card-',
    autoNavigate: true,
    highlightDelay: 200,
  });

  // Look up entity by name if name param is provided
  const { data: entityByName } = useEntityByName(search.name ?? null);

  // Extract items from client-side paginated data
  const entityItems = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading = isEntitiesLoading || paginatedData.isLoading;

  // Sync selected entity from URL on mount and when search changes
  useEffect(() => {
    if (search.selected && search.selected !== selectedEntityId) {
      setSelectedEntityId(search.selected);
    }
    if (!search.selected && !search.name && selectedEntityId) {
      setSelectedEntityId(null);
    }
  }, [search.selected, search.name]);

  // Handle name lookup - when entity is found by name, select it and update URL
  useEffect(() => {
    if (search.name && entityByName) {
      setSelectedEntityId(entityByName.id);
      navigate({
        to: '/entities',
        search: { selected: entityByName.id, name: undefined, page: currentPage, limit: pageSize },
        replace: true,
      });
    }
  }, [search.name, entityByName, navigate, currentPage, pageSize]);

  const handleEntityCreated = (entity: Entity) => {
    setSelectedEntityId(entity.id);
    navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: currentPage, limit: pageSize } });
  };

  // Counts based on current page items
  const counts = useMemo(() => {
    return {
      all: totalItems,
      agent: entityItems.filter((e) => e.entityType === 'agent').length,
      human: entityItems.filter((e) => e.entityType === 'human').length,
      system: entityItems.filter((e) => e.entityType === 'system').length,
    };
  }, [entityItems, totalItems]);

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
    navigate({ to: '/entities', search: { selected: entityId, name: undefined, page: currentPage, limit: pageSize } });
  };

  const handleCloseDetail = () => {
    setSelectedEntityId(null);
    navigate({ to: '/entities', search: { selected: undefined, name: undefined, page: currentPage, limit: pageSize } });
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/entities', search: { page, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({ to: '/entities', search: { page: 1, limit: newPageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handleTypeFilterChange = (newFilter: EntityTypeFilter) => {
    setTypeFilter(newFilter);
    navigate({ to: '/entities', search: { page: 1, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    navigate({ to: '/entities', search: { page: 1, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    navigate({ to: '/entities', search: { page: 1, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  return (
    <div className="h-full flex" data-testid="entities-page">
      {/* Create Entity Modal */}
      <CreateEntityModal
        isOpen={isCreateEntityModalOpen}
        onClose={() => setIsCreateEntityModalOpen(false)}
        onSuccess={handleEntityCreated}
      />

      {/* Entity List */}
      <div className={`flex flex-col ${!isMobile && selectedEntityId ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
        {/* Header */}
        <PageHeader
          title="Entities"
          icon={Users}
          iconColor="text-blue-500"
          count={entityItems.length}
          totalCount={totalItems}
          bordered
          actions={[
            {
              label: 'Create Entity',
              shortLabel: 'Add',
              icon: Plus,
              onClick: () => setIsCreateEntityModalOpen(true),
              shortcut: getCurrentBinding('action.createEntity'),
              testId: 'create-entity-button',
            },
          ]}
          testId="entities-header"
        >
          {/* Filters */}
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <FilterTabs selected={typeFilter} onChange={handleTypeFilterChange} counts={counts} />
            </div>
            <div className="w-full sm:w-64 sm:ml-auto">
              <SearchBox value={searchQuery} onChange={handleSearchChange} />
            </div>
          </div>
        </PageHeader>

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[var(--color-text-muted)]" data-testid="entities-loading">
              Loading entities...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && entityItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-4" data-testid="entities-empty">
              {searchQuery || typeFilter !== 'all' ? (
                <>
                  <p className="text-[var(--color-text-muted)]">No entities match your filters</p>
                  <button
                    onClick={handleClearFilters}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 touch-target"
                    data-testid="clear-filters-button"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-text-muted)]">No entities registered</p>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                    Use <code className="bg-[var(--color-surface-hover)] px-1 rounded">sf entity register</code> to add an entity
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Entity list */}
        {!isLoading && entityItems.length > 0 && (
          <div className="flex-1 overflow-auto -mx-4 sm:mx-0" data-testid="entities-grid">
            {isMobile ? (
              <div className="divide-y divide-[var(--color-border)]">
                {entityItems.map((entity) => (
                  <MobileEntityCard
                    key={entity.id}
                    entity={entity}
                    isSelected={entity.id === selectedEntityId}
                    onClick={() => handleEntityClick(entity.id)}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            ) : (
              <div className={`grid gap-4 ${selectedEntityId ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                {entityItems.map((entity) => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    isSelected={entity.id === selectedEntityId}
                    onClick={() => handleEntityClick(entity.id)}
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
      {isMobile && selectedEntityId && (
        <MobileDetailSheet
          open={!!selectedEntityId}
          onClose={handleCloseDetail}
          title="Entity Details"
          data-testid="entity-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Entity"
              elementId={selectedEntityId}
              backRoute="/entities"
              backLabel="Back to Entities"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <EntityDetailPanel entityId={selectedEntityId} onClose={handleCloseDetail} />
          )}
        </MobileDetailSheet>
      )}

      {/* Desktop: Side panel */}
      {!isMobile && selectedEntityId && (
        <div className="w-1/2 border-l border-[var(--color-border)]" data-testid="entity-detail-container">
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Entity"
              elementId={selectedEntityId}
              backRoute="/entities"
              backLabel="Back to Entities"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <EntityDetailPanel entityId={selectedEntityId} onClose={handleCloseDetail} />
          )}
        </div>
      )}
    </div>
  );
}

// Default export for route
export default EntitiesPage;
