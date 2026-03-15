/**
 * DirectorTabBar - Horizontal tab bar for switching between director sessions
 *
 * Shows one tab per director agent with name, status dot, and unread badge.
 * Includes a (+) button to open the agent creation modal with director role pre-selected.
 */

import { useCallback } from 'react';
import { Circle, Plus } from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import type { DirectorInfo } from '../../api/hooks/useAgents';

interface DirectorTabBarProps {
  directors: DirectorInfo[];
  activeDirectorId: string | null;
  onSelectDirector: (directorId: string) => void;
  onCreateDirector: () => void;
  unreadCounts: Record<string, number>;
}

function getStatusColor(info: DirectorInfo): string {
  if (info.error) return 'text-[var(--color-danger)]';
  if (info.isLoading) return 'text-[var(--color-warning)]';
  if (info.hasActiveSession) return 'text-[var(--color-success)]';
  return 'text-[var(--color-text-tertiary)]';
}

function getStatusDotFill(info: DirectorInfo): string {
  if (info.error) return 'fill-[var(--color-danger)]';
  if (info.isLoading) return 'fill-[var(--color-warning)]';
  if (info.hasActiveSession) return 'fill-[var(--color-success)]';
  return 'fill-[var(--color-text-tertiary)]';
}

function getStatusLabel(info: DirectorInfo): string {
  if (info.error) return 'Error';
  if (info.isLoading) return 'Connecting';
  if (info.hasActiveSession) return 'Running';
  return 'Idle';
}

export function DirectorTabBar({
  directors,
  activeDirectorId,
  onSelectDirector,
  onCreateDirector,
  unreadCounts,
}: DirectorTabBarProps) {
  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-x-auto scrollbar-hide"
      data-testid="director-tab-bar"
      role="tablist"
      aria-label="Director tabs"
    >
      {directors.map((info) => {
        const isActive = info.director.id === activeDirectorId;
        const unread = unreadCounts[info.director.id] ?? 0;
        const statusLabel = getStatusLabel(info);

        return (
          <DirectorTab
            key={info.director.id}
            info={info}
            isActive={isActive}
            unreadCount={unread}
            statusLabel={statusLabel}
            onSelect={onSelectDirector}
          />
        );
      })}

      {/* Create director button */}
      <Tooltip content="Create Director" side="bottom">
        <button
          onClick={onCreateDirector}
          className="flex-shrink-0 p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
          aria-label="Create Director"
          data-testid="director-tab-create"
        >
          <Plus className="w-4 h-4" />
        </button>
      </Tooltip>
    </div>
  );
}

function DirectorTab({
  info,
  isActive,
  unreadCount,
  statusLabel,
  onSelect,
}: {
  info: DirectorInfo;
  isActive: boolean;
  unreadCount: number;
  statusLabel: string;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(info.director.id);
  }, [info.director.id, onSelect]);

  const statusColor = getStatusColor(info);
  const statusFill = getStatusDotFill(info);

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={handleClick}
      className={`
        relative flex items-center gap-1.5 px-3 py-1.5 rounded-t-md
        text-sm font-medium transition-colors duration-150
        flex-shrink-0
        ${isActive
          ? 'text-[var(--color-text)] border-b-2 border-[var(--color-primary)] bg-[var(--color-surface-hover)]'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }
      `}
      data-testid={`director-tab-${info.director.id}`}
      title={`${info.director.name} — ${statusLabel}`}
    >
      {/* Status dot */}
      <Circle className={`w-2 h-2 flex-shrink-0 ${statusColor} ${statusFill}`} />

      {/* Director name (truncated) */}
      <span className="truncate max-w-[120px]">
        {info.director.name}
      </span>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span
          className="flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white flex-shrink-0"
          data-testid={`director-tab-unread-${info.director.id}`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default DirectorTabBar;
