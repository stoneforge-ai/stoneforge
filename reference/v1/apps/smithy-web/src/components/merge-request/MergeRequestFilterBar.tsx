/**
 * MergeRequestFilterBar - Underline-style tabs matching Tasks page
 *
 * Features:
 * - Underline tabs: All, Needs Review, Testing, Conflicts
 * - Each tab shows count of items
 * - Toggle for showing merged items on the right
 */

import {
  CheckSquare,
  AlertCircle,
  FlaskConical,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { MergeRequestFilterStatus, MergeRequestCounts } from '../../api/hooks/useMergeRequests';

interface MergeRequestFilterBarProps {
  currentFilter: MergeRequestFilterStatus;
  counts: MergeRequestCounts;
  showMerged: boolean;
  onFilterChange: (filter: MergeRequestFilterStatus) => void;
  onShowMergedChange: (show: boolean) => void;
}

interface TabConfig {
  value: MergeRequestFilterStatus;
  label: string;
  countKey: keyof MergeRequestCounts;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { value: 'all', label: 'All', countKey: 'all', icon: CheckSquare },
  { value: 'needs_review', label: 'Needs Review', countKey: 'needsReview', icon: AlertCircle },
  { value: 'testing', label: 'Testing', countKey: 'testing', icon: FlaskConical },
  { value: 'conflicts', label: 'Conflicts', countKey: 'conflicts', icon: AlertTriangle },
];

export function MergeRequestFilterBar({
  currentFilter,
  counts,
  showMerged,
  onFilterChange,
  onShowMergedChange,
}: MergeRequestFilterBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] overflow-x-auto">
      {/* Tabs */}
      <nav className="flex gap-1 min-w-max" aria-label="Merge request filters" data-testid="merge-request-filters">
        {TABS.map((tab) => {
          const count = counts[tab.countKey];
          const isActive = currentFilter === tab.value;
          const Icon = tab.icon;

          return (
            <button
              key={tab.value}
              onClick={() => onFilterChange(tab.value)}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
              }`}
              data-testid={`filter-tab-${tab.value}`}
            >
              <span className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {tab.label}
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)]">
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Show Merged Toggle */}
      <button
        onClick={() => onShowMergedChange(!showMerged)}
        className={`
          flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md ml-4 mb-1
          transition-all duration-150 ease-out border
          ${showMerged
            ? 'bg-[var(--color-success-muted)] text-[var(--color-success)] border-[var(--color-success)]'
            : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
          }
        `}
        data-testid="toggle-show-merged"
      >
        {showMerged ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
        <span>Merged ({counts.merged})</span>
      </button>
    </div>
  );
}
