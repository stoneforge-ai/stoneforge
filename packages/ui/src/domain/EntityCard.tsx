import * as React from 'react';
import { Bot, User, Server } from 'lucide-react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { Entity, EntityType } from './types';
import { getEntityTypeConfig } from './types';

/**
 * EntityCard Component
 *
 * Displays an entity (agent, human, or system) in a card format with consistent styling.
 * Features:
 * - Entity type icon and badge
 * - Active/inactive status indicator
 * - Tags with overflow handling
 * - Timestamps in muted text
 *
 * This component receives all data via props and makes no API calls.
 */

export interface EntityCardProps {
  entity: Entity;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Show the element ID below the name */
  showId?: boolean;
  /** Show creation timestamp */
  showTimestamp?: boolean;
}

/**
 * Get the icon component for an entity type
 */
function getEntityTypeIcon(entityType: EntityType | string): typeof Bot {
  switch (entityType) {
    case 'agent':
      return Bot;
    case 'human':
      return User;
    case 'system':
      return Server;
    default:
      return Server;
  }
}

export const EntityCard = React.forwardRef<HTMLDivElement, EntityCardProps>(
  (
    {
      entity,
      isSelected = false,
      onClick,
      className = '',
      showId = true,
      showTimestamp = true,
    },
    ref
  ) => {
    const config = getEntityTypeConfig(entity.entityType);
    const Icon = getEntityTypeIcon(entity.entityType);
    const isActive = entity.active !== false;

    return (
      <Card
        ref={ref}
        variant="default"
        clickable={!!onClick}
        onClick={onClick}
        className={[
          isSelected
            ? 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]'
            : '',
          !isActive ? 'opacity-60' : '',
          'transition-all duration-[var(--duration-fast)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`entity-card-${entity.id}`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bgColor} flex-shrink-0`}
            data-testid={`entity-avatar-${entity.id}`}
          >
            <Icon className={`w-5 h-5 ${config.textColor}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-[var(--color-text)] truncate">{entity.name}</h3>
              {!isActive && (
                <Badge variant="outline" size="sm">
                  Inactive
                </Badge>
              )}
            </div>
            {showId && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate">
                {entity.id}
              </p>
            )}
          </div>

          {/* Type badge */}
          <Badge
            variant={config.variant}
            size="sm"
            className="capitalize flex-shrink-0"
            data-testid={`entity-type-badge-${entity.id}`}
          >
            {entity.entityType}
          </Badge>
        </div>

        {/* Tags */}
        {entity.tags && entity.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {entity.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface-active)] text-[var(--color-text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
            {entity.tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                +{entity.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        {showTimestamp && (
          <div className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            Created {new Date(entity.createdAt).toLocaleDateString()}
          </div>
        )}
      </Card>
    );
  }
);

EntityCard.displayName = 'EntityCard';

export default EntityCard;
