/**
 * EntityLink Component
 *
 * A configurable link that displays entity names with optional hover preview cards
 * and stats. Supports both full-featured (with HoverCard preview) and simplified
 * (display-only) modes via props.
 *
 * Usage:
 * - Full-featured (apps/quarry-web): <EntityLink entityRef="el-xxx" showHoverCard onNavigate={...} />
 * - Simplified (orchestrator-web): <EntityLink entityRef="el-xxx" />
 */

import * as HoverCard from '@radix-ui/react-hover-card';
import { useQuery } from '@tanstack/react-query';
import { Bot, User, Server, Loader2, ExternalLink, Clock } from 'lucide-react';
import { type ReactNode } from 'react';
import type { Entity, EntityType } from './types';

/**
 * Stats data for entity hover preview
 */
export interface EntityStats {
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  currentTask?: {
    id: string;
    title: string;
    status: string;
  };
}

export interface EntityLinkProps {
  /**
   * Entity ID or name - if it starts with "el-", treated as ID, otherwise as name
   */
  entityRef: string;
  /**
   * Optional display text. If not provided, will show the entity name (once loaded)
   * or the entityRef as fallback.
   */
  children?: ReactNode;
  /**
   * Additional CSS classes for the link
   */
  className?: string;
  /**
   * Whether to show the hover preview card with entity details.
   * Requires onNavigate to be provided for the "View full profile" link.
   * @default false
   */
  showHoverCard?: boolean;
  /**
   * Whether to show task stats in the hover preview card.
   * Only used when showHoverCard is true.
   * @default true
   */
  showStats?: boolean;
  /**
   * Icon to show before the name
   */
  showIcon?: boolean;
  /**
   * Whether the link is clickable/navigable.
   * When true, renders as a button with onClick handler.
   * When false, renders as a span (display only).
   * @default false
   */
  navigable?: boolean;
  /**
   * Callback when the entity link is clicked. Only used when navigable is true.
   * Receives the resolved entity (or null if not found) and the original entityRef.
   */
  onNavigate?: (entity: Entity | null, entityRef: string) => void;
  /**
   * Render prop for the "View full profile" link in the hover card.
   * Receives the entity. If not provided, defaults to a button using onNavigate.
   */
  renderProfileLink?: (entity: Entity) => ReactNode;
  /**
   * Data test ID for testing
   */
  'data-testid'?: string;
}

const ENTITY_TYPE_STYLES: Record<
  EntityType | string,
  {
    icon: typeof Bot;
    bg: string;
    text: string;
    darkBg: string;
    darkText: string;
  }
> = {
  agent: {
    icon: Bot,
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    darkBg: 'dark:bg-purple-900/30',
    darkText: 'dark:text-purple-300',
  },
  human: {
    icon: User,
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    darkBg: 'dark:bg-blue-900/30',
    darkText: 'dark:text-blue-300',
  },
  system: {
    icon: Server,
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    darkBg: 'dark:bg-gray-800/50',
    darkText: 'dark:text-gray-300',
  },
};

function getEntityStyles(entityType?: EntityType | string) {
  return ENTITY_TYPE_STYLES[entityType ?? 'system'] || ENTITY_TYPE_STYLES.system;
}

/**
 * Hook to fetch an entity by ID or name
 */
function useEntityByRef(entityRef: string | null) {
  const isId = entityRef?.startsWith('el-');

  return useQuery<Entity | null>({
    queryKey: ['entities', 'byRef', entityRef],
    queryFn: async () => {
      if (!entityRef) return null;

      if (isId) {
        const response = await fetch(`/api/entities/${entityRef}`);
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error('Failed to fetch entity');
        }
        return response.json();
      } else {
        const response = await fetch(`/api/entities?search=${encodeURIComponent(entityRef)}&limit=100`);
        if (!response.ok) throw new Error('Failed to fetch entity');
        const result: { items: Entity[] } = await response.json();
        const entity = result.items.find(
          (e) => e.name.toLowerCase() === entityRef.toLowerCase()
        );
        return entity ?? null;
      }
    },
    enabled: !!entityRef,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch entity stats (task counts)
 */
function useEntityStats(entityId: string | null) {
  return useQuery<EntityStats>({
    queryKey: ['entities', entityId, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${entityId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch entity stats');
      return response.json();
    },
    enabled: !!entityId,
    staleTime: 30000,
  });
}

export function EntityLink({
  entityRef,
  children,
  className = '',
  showHoverCard = false,
  showStats = true,
  showIcon = false,
  navigable = false,
  onNavigate,
  renderProfileLink,
  'data-testid': testId,
}: EntityLinkProps) {
  const { data: entity, isLoading: entityLoading } = useEntityByRef(entityRef);
  const { data: stats, isLoading: statsLoading } = useEntityStats(
    showHoverCard && showStats ? (entity?.id ?? null) : null
  );

  const displayName = children ?? entity?.name ?? entityRef;
  const styles = getEntityStyles(entity?.entityType);
  const Icon = styles.icon;

  const handleClick = navigable
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onNavigate?.(entity ?? null, entityRef);
      }
    : undefined;

  // Simplified (orchestrator-web) mode: show loading state inline
  if (!navigable && !showHoverCard && entityLoading) {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        {entityRef}
      </span>
    );
  }

  // Build the link/span content
  const linkContent = navigable ? (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium ${className}`}
      data-testid={testId || `entity-link-${entityRef}`}
    >
      {showIcon && <Icon className={`w-3.5 h-3.5 ${styles.text} ${styles.darkText}`} />}
      {displayName}
    </button>
  ) : (
    <span
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium ${className}`}
      data-testid={testId || `entity-link-${entityRef}`}
      title={entity ? `${entity.name} (${entity.entityType})` : entityRef}
    >
      {showIcon && <Icon className={`w-3.5 h-3.5 ${styles.text} ${styles.darkText}`} />}
      {displayName}
    </span>
  );

  if (!showHoverCard) {
    return linkContent;
  }

  return (
    <HoverCard.Root openDelay={400} closeDelay={200}>
      <HoverCard.Trigger asChild>{linkContent}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className="w-72 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50
                     animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
                     data-[side=top]:slide-in-from-bottom-2
                     data-[side=bottom]:slide-in-from-top-2"
          sideOffset={5}
          data-testid={`entity-preview-${entityRef}`}
        >
          {entityLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : entity ? (
            <EntityPreviewContent
              entity={entity}
              stats={showStats ? stats : undefined}
              statsLoading={showStats ? statsLoading : false}
              onNavigate={onNavigate}
              renderProfileLink={renderProfileLink}
            />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Entity not found: {entityRef}
            </div>
          )}
          <HoverCard.Arrow className="fill-white dark:fill-gray-900" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function EntityPreviewContent({
  entity,
  stats,
  statsLoading,
  onNavigate,
  renderProfileLink,
}: {
  entity: Entity;
  stats?: EntityStats;
  statsLoading: boolean;
  onNavigate?: (entity: Entity | null, entityRef: string) => void;
  renderProfileLink?: (entity: Entity) => ReactNode;
}) {
  const styles = getEntityStyles(entity.entityType);
  const Icon = styles.icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${styles.bg} ${styles.darkBg}`}>
          <Icon className={`w-5 h-5 ${styles.text} ${styles.darkText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {entity.name}
          </div>
          <div className={`text-xs ${styles.text} ${styles.darkText} capitalize`}>
            {entity.entityType}
          </div>
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading stats...
        </div>
      ) : stats ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.openTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Open</div>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.completedTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Done</div>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.totalTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
          </div>
        </div>
      ) : null}

      {/* Current Task */}
      {stats?.currentTask && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-100 dark:border-blue-800">
          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 mb-1">
            <Clock className="w-3 h-3" />
            Currently working on
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {stats.currentTask.title}
          </div>
        </div>
      )}

      {/* Tags */}
      {entity.tags && entity.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entity.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
          {entity.tags.length > 3 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{entity.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Footer link */}
      {renderProfileLink ? (
        renderProfileLink(entity)
      ) : onNavigate ? (
        <button
          onClick={() => onNavigate(entity, entity.id)}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          data-testid={`entity-preview-link-${entity.id}`}
        >
          View full profile
          <ExternalLink className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * EntityName - convenience wrapper for EntityLink without hover preview.
 * A simple inline display of an entity name.
 */
export function EntityName({
  entityRef,
  children,
  className = '',
  showIcon = false,
  'data-testid': testId,
}: Omit<EntityLinkProps, 'showHoverCard' | 'showStats' | 'navigable' | 'onNavigate' | 'renderProfileLink'>) {
  return (
    <EntityLink
      entityRef={entityRef}
      className={className}
      showHoverCard={false}
      showIcon={showIcon}
      data-testid={testId}
    >
      {children}
    </EntityLink>
  );
}
