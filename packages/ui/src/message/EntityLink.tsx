/**
 * EntityLink Component - Simplified for orchestrator-web
 *
 * A styled link that displays entity names.
 * Simplified version without hover preview cards (missing dependency).
 */

import { useQuery } from '@tanstack/react-query';
import { Bot, User, Server, Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { type Entity } from './entity-types';

interface EntityLinkProps {
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
   * Whether to show the hover preview card (ignored in this simplified version)
   * @default true
   */
  showPreview?: boolean;
  /**
   * Icon to show before the name
   */
  showIcon?: boolean;
  /**
   * Data test ID for testing
   */
  'data-testid'?: string;
}

const ENTITY_TYPE_STYLES = {
  agent: {
    icon: Bot,
    text: 'text-purple-700',
    darkText: 'dark:text-purple-300',
  },
  human: {
    icon: User,
    text: 'text-blue-700',
    darkText: 'dark:text-blue-300',
  },
  system: {
    icon: Server,
    text: 'text-gray-700',
    darkText: 'dark:text-gray-300',
  },
};

function useEntityByRef(entityRef: string | null) {
  const isId = entityRef?.startsWith('el-');

  return useQuery<Entity | null>({
    queryKey: ['entities', 'byRef', entityRef],
    queryFn: async () => {
      if (!entityRef) return null;

      if (isId) {
        // Fetch by ID
        const response = await fetch(`/api/entities/${entityRef}`);
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error('Failed to fetch entity');
        }
        return response.json();
      } else {
        // Search by name
        const response = await fetch(`/api/entities?search=${encodeURIComponent(entityRef)}&limit=100`);
        if (!response.ok) throw new Error('Failed to fetch entity');
        const result: { items: Entity[] } = await response.json();
        // Find exact match (case-insensitive)
        const entity = result.items.find(
          (e) => e.name.toLowerCase() === entityRef.toLowerCase()
        );
        return entity ?? null;
      }
    },
    enabled: !!entityRef,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function EntityLink({
  entityRef,
  children,
  className = '',
  showPreview: _showPreview = true,
  showIcon = false,
  'data-testid': testId,
}: EntityLinkProps) {
  const { data: entity, isLoading } = useEntityByRef(entityRef);

  const displayName = children ?? entity?.name ?? entityRef;
  const styles = entity ? ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system : ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  if (isLoading) {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        {entityRef}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium ${className}`}
      data-testid={testId || `entity-link-${entityRef}`}
      title={entity ? `${entity.name} (${entity.entityType})` : entityRef}
    >
      {showIcon && <Icon className={`w-3.5 h-3.5 ${styles.text} ${styles.darkText}`} />}
      {displayName}
    </span>
  );
}

// Export a simple version for contexts where hover preview isn't needed
export function EntityName({
  entityRef,
  children,
  className = '',
  showIcon = false,
  'data-testid': testId,
}: Omit<EntityLinkProps, 'showPreview'>) {
  return (
    <EntityLink
      entityRef={entityRef}
      className={className}
      showPreview={false}
      showIcon={showIcon}
      data-testid={testId}
    >
      {children}
    </EntityLink>
  );
}
