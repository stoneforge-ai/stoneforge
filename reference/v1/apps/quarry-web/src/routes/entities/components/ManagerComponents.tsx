/**
 * Manager-related components for entity detail panel
 * Includes: ManagerDisplay, ManagerPicker
 */

import { useMemo, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useEntity, useAllEntities } from '../hooks';
import { ENTITY_TYPE_STYLES } from '../constants';
// Entity type is used via useAllEntities result

interface ManagerDisplayProps {
  managerId: string;
  onClick: (id: string) => void;
}

/**
 * ManagerDisplay - Shows the current manager with a link
 */
export function ManagerDisplay({ managerId, onClick }: ManagerDisplayProps) {
  const { data: manager, isLoading } = useEntity(managerId);

  if (isLoading) {
    return <span className="text-sm text-gray-400">Loading...</span>;
  }

  if (!manager) {
    return <span className="text-sm text-gray-400">Unknown manager</span>;
  }

  const styles = ENTITY_TYPE_STYLES[manager.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  return (
    <button
      onClick={() => onClick(manager.id)}
      className="flex items-center gap-2 p-2 rounded border border-gray-200 hover:bg-gray-50 transition-colors w-full text-left"
      data-testid="entity-manager-display"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${styles.bg}`}>
        <Icon className={`w-4 h-4 ${styles.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{manager.name}</div>
        <div className="text-xs text-gray-500">{manager.entityType}</div>
      </div>
    </button>
  );
}

interface ManagerPickerProps {
  entityId: string;
  currentManagerId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (managerId: string | null) => void;
  isLoading: boolean;
}

/**
 * ManagerPicker - Allows selecting a manager from all entities
 */
export function ManagerPicker({
  entityId,
  currentManagerId,
  searchQuery,
  onSearchChange,
  onSelect,
  isLoading,
}: ManagerPickerProps) {
  const { data: allEntitiesData, isLoading: entitiesLoading } = useAllEntities(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter out self and current manager
  const availableEntities = useMemo(() => {
    if (!allEntitiesData?.items) return [];
    return allEntitiesData.items.filter(e =>
      e.id !== entityId && // Can't be own manager
      e.active !== false // Only active entities
    );
  }, [allEntitiesData, entityId]);

  return (
    <div className="space-y-2" data-testid="manager-picker">
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search for an entity..."
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="manager-search-input"
      />
      <div className="max-h-40 overflow-auto border border-gray-200 rounded-md divide-y divide-gray-100">
        {/* Clear manager option */}
        {currentManagerId && (
          <button
            onClick={() => onSelect(null)}
            disabled={isLoading}
            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-red-50 transition-colors disabled:opacity-50"
            data-testid="manager-clear-button"
          >
            <X className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600">Remove manager</span>
          </button>
        )}
        {entitiesLoading ? (
          <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
        ) : availableEntities.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">No entities found</div>
        ) : (
          availableEntities.map((e) => {
            const styles = ENTITY_TYPE_STYLES[e.entityType] || ENTITY_TYPE_STYLES.system;
            const Icon = styles.icon;
            const isCurrentManager = e.id === currentManagerId;

            return (
              <button
                key={e.id}
                onClick={() => onSelect(e.id)}
                disabled={isLoading || isCurrentManager}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                  isCurrentManager ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                data-testid={`manager-option-${e.id}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${styles.bg}`}>
                  <Icon className={`w-3 h-3 ${styles.text}`} />
                </div>
                <span className="text-sm text-gray-900 flex-1 truncate">{e.name}</span>
                {isCurrentManager && (
                  <span className="text-xs text-blue-600">Current</span>
                )}
              </button>
            );
          })
        )}
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Updating...
        </div>
      )}
    </div>
  );
}
