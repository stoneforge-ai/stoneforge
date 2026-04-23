import * as React from 'react';
import { Users } from 'lucide-react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { Team } from './types';

/**
 * TeamCard Component
 *
 * Displays a team in a card format with consistent styling.
 * Features:
 * - Team icon with accent color
 * - Member count badge
 * - Member avatar stack slot (first 5)
 * - Tags with overflow handling
 * - Timestamps in muted text
 *
 * This component receives all data via props and makes no API calls.
 */

export interface TeamCardProps {
  team: Team;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Show the element ID below the title */
  showId?: boolean;
  /** Show creation timestamp */
  showTimestamp?: boolean;
  /** Optional slot for member avatar stack */
  memberAvatarStack?: React.ReactNode;
}

export const TeamCard = React.forwardRef<HTMLDivElement, TeamCardProps>(
  (
    {
      team,
      isSelected = false,
      onClick,
      className = '',
      showId = true,
      showTimestamp = true,
      memberAvatarStack,
    },
    ref
  ) => {
    const isActive = team.status !== 'tombstone';
    const memberCount = team.members?.length || 0;

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
        data-testid={`team-card-${team.id}`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full bg-[var(--color-accent-100)] dark:bg-[var(--color-accent-900)] flex items-center justify-center flex-shrink-0"
            data-testid={`team-avatar-${team.id}`}
          >
            <Users className="w-5 h-5 text-[var(--color-accent-600)] dark:text-[var(--color-accent-400)]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-[var(--color-text)] truncate">{team.name}</h3>
              {!isActive && (
                <Badge variant="outline" size="sm">
                  Deleted
                </Badge>
              )}
            </div>
            {showId && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate">
                {team.id}
              </p>
            )}
          </div>

          {/* Member count badge */}
          <Badge
            variant="primary"
            size="sm"
            className="flex-shrink-0"
            data-testid={`team-member-count-${team.id}`}
          >
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </Badge>
        </div>

        {/* Member Avatar Stack */}
        {memberCount > 0 && memberAvatarStack && <div className="mt-3">{memberAvatarStack}</div>}

        {/* Tags */}
        {team.tags && team.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {team.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface-active)] text-[var(--color-text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
            {team.tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                +{team.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        {showTimestamp && (
          <div className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            Created {new Date(team.createdAt).toLocaleDateString()}
          </div>
        )}
      </Card>
    );
  }
);

TeamCard.displayName = 'TeamCard';

export default TeamCard;
