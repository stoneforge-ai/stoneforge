import * as React from 'react';
import { ChevronRight, Target } from 'lucide-react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { Plan, PlanStatus } from './types';

/**
 * PlanCard Component
 *
 * Displays a plan in a card format with consistent styling.
 * Features:
 * - Status badge with color-coded variants
 * - Progress indicator (if progress data provided)
 * - Tags with overflow handling
 * - Timestamps in muted text
 *
 * This component receives all data via props and makes no API calls.
 */

export interface PlanCardProps {
  plan: Plan;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Show the element ID below the title */
  showId?: boolean;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Optional slot for additional content below title */
  children?: React.ReactNode;
}

interface StatusConfig {
  label: string;
  variant: 'default' | 'primary' | 'success' | 'warning' | 'error';
}

const STATUS_CONFIG: Record<PlanStatus | string, StatusConfig> = {
  draft: { label: 'Draft', variant: 'default' },
  active: { label: 'Active', variant: 'primary' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
};

/**
 * Get status configuration for a plan status
 */
function getPlanStatusConfig(status: PlanStatus | string): StatusConfig {
  return STATUS_CONFIG[status] || STATUS_CONFIG.draft;
}

export const PlanCard = React.forwardRef<HTMLDivElement, PlanCardProps>(
  (
    { plan, isSelected = false, onClick, className = '', showId = false, progress, children },
    ref
  ) => {
    const config = getPlanStatusConfig(plan.status);

    return (
      <Card
        ref={ref}
        variant="default"
        clickable={!!onClick}
        onClick={onClick}
        className={[
          isSelected
            ? 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)] bg-[var(--color-surface-selected)]'
            : '',
          'transition-all duration-[var(--duration-fast)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`plan-card-${plan.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-muted)] flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                data-testid="plan-card-title"
                className="font-medium text-[var(--color-text)] truncate"
              >
                {plan.title}
              </h3>
              {showId && (
                <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate mt-0.5">
                  {plan.id}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={config.variant} size="sm">
              {config.label}
            </Badge>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
        </div>

        {/* Progress bar */}
        {typeof progress === 'number' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--color-text-secondary)]">Progress</span>
              <span className="text-xs font-medium text-[var(--color-text)]">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--color-surface-active)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Additional content slot */}
        {children}

        {/* Tags */}
        {plan.tags && plan.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {plan.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface-active)] text-[var(--color-text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
            {plan.tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                +{plan.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </Card>
    );
  }
);

PlanCard.displayName = 'PlanCard';

export default PlanCard;
