/**
 * PoolCard - Displays a single agent pool with its status
 */

import { MoreHorizontal, Play, Pause, Trash2, Settings, Users } from 'lucide-react';
import type { AgentPool } from '../../api/hooks/usePools';

interface PoolCardProps {
  pool: AgentPool;
  onToggleEnabled?: (enabled: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isUpdating?: boolean;
}

export function PoolCard({ pool, onToggleEnabled, onEdit, onDelete, isUpdating }: PoolCardProps) {
  const { config, status } = pool;
  const utilizationPercent = config.maxSize > 0 ? Math.round((status.activeCount / config.maxSize) * 100) : 0;

  return (
    <div
      className={`
        relative border rounded-lg p-4 bg-[var(--color-surface)]
        ${config.enabled ? 'border-[var(--color-border)]' : 'border-dashed border-[var(--color-border)] opacity-60'}
        transition-all duration-200
      `}
      data-testid={`pool-card-${pool.id}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${config.enabled ? 'bg-[var(--color-primary-muted)]' : 'bg-[var(--color-surface-elevated)]'}`}>
            <Users className={`w-4 h-4 ${config.enabled ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)]'}`} />
          </div>
          <div>
            <h3 className="font-medium text-[var(--color-text)]">{config.name}</h3>
            {config.description && (
              <p className="text-xs text-[var(--color-text-secondary)]">{config.description}</p>
            )}
          </div>
        </div>

        {/* Actions dropdown */}
        <div className="relative group">
          <button
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            data-testid={`pool-actions-${pool.id}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-10">
            {onToggleEnabled && (
              <button
                onClick={() => onToggleEnabled(!config.enabled)}
                disabled={isUpdating}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                {config.enabled ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Disable
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Enable
                  </>
                )}
              </button>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                <Settings className="w-4 h-4" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Capacity bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
          <span>Capacity</span>
          <span>{status.activeCount} / {config.maxSize} ({utilizationPercent}%)</span>
        </div>
        <div className="h-2 bg-[var(--color-surface-elevated)] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              utilizationPercent >= 90 ? 'bg-[var(--color-danger)]' :
              utilizationPercent >= 70 ? 'bg-[var(--color-warning)]' :
              'bg-[var(--color-primary)]'
            }`}
            style={{ width: `${utilizationPercent}%` }}
          />
        </div>
      </div>

      {/* Agent Types */}
      {config.agentTypes.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Agent Types</p>
          <div className="flex flex-wrap gap-1">
            {config.agentTypes.map((typeConfig, i) => {
              const label = typeConfig.role === 'worker'
                ? typeConfig.workerMode ? `${typeConfig.workerMode} worker` : 'worker'
                : typeConfig.stewardFocus ? `${typeConfig.stewardFocus} steward` : 'steward';
              return (
                <span
                  key={i}
                  className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] rounded"
                >
                  {label}
                  {typeConfig.priority !== undefined && ` (p:${typeConfig.priority})`}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Agents */}
      {status.activeAgentIds.length > 0 && (
        <div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Active Agents ({status.activeAgentIds.length})</p>
          <div className="flex flex-wrap gap-1">
            {status.activeAgentIds.slice(0, 5).map((agentId) => (
              <span
                key={agentId}
                className="px-1.5 py-0.5 text-xs bg-[var(--color-success-muted)] text-[var(--color-success)] rounded font-mono"
              >
                {agentId.slice(0, 8)}
              </span>
            ))}
            {status.activeAgentIds.length > 5 && (
              <span className="px-1.5 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                +{status.activeAgentIds.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Status badge */}
      <div className="absolute top-2 right-12">
        <span
          className={`px-1.5 py-0.5 text-xs rounded ${
            config.enabled
              ? status.availableSlots > 0
                ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]'
                : 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]'
              : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-tertiary)]'
          }`}
        >
          {config.enabled
            ? status.availableSlots > 0
              ? `${status.availableSlots} slots`
              : 'Full'
            : 'Disabled'}
        </span>
      </div>
    </div>
  );
}
