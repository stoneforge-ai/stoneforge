/**
 * useEntityNavigation
 *
 * Provides TanStack Router-based navigation callbacks for EntityLink.
 * Extracted from the former apps/quarry-web EntityLink wrapper so that consumers
 * can import EntityLink directly from @stoneforge/ui/domain and wire up
 * app-specific navigation via this hook.
 *
 * Usage:
 *   import { EntityLink } from '@stoneforge/ui/domain';
 *   import { useEntityNavigation } from '../../hooks/useEntityNavigation';
 *
 *   const { onNavigate, renderProfileLink } = useEntityNavigation();
 *   <EntityLink entityRef="el-xxx" navigable showHoverCard onNavigate={onNavigate} renderProfileLink={renderProfileLink} />
 */

import { Link, useNavigate } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import type { Entity } from '@stoneforge/ui/domain';
import type { ReactNode } from 'react';

export function useEntityNavigation() {
  const navigate = useNavigate();

  const onNavigate = (entity: Entity | null, ref: string) => {
    if (entity) {
      navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: 1, limit: 25 } });
    } else {
      navigate({ to: '/entities', search: { selected: undefined, name: ref, page: 1, limit: 25 } });
    }
  };

  const renderProfileLink = (entity: Entity): ReactNode => (
    <Link
      to="/entities"
      search={{ selected: entity.id, name: undefined, page: 1, limit: 25 }}
      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      data-testid={`entity-preview-link-${entity.id}`}
    >
      View full profile
      <ExternalLink className="w-3 h-3" />
    </Link>
  );

  return { onNavigate, renderProfileLink };
}
