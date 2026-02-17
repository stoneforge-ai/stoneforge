/**
 * EditPoolDialog - Dialog for editing existing agent pools
 *
 * Mirrors CreatePoolDialog layout but:
 * - Pre-populates form with the pool's current configuration
 * - Pool name is displayed as read-only (not editable after creation)
 * - Uses useUpdatePool hook instead of useCreatePool
 * - Validates maxSize >= activeCount (can't shrink below active agents)
 * - Shows "Save Changes" instead of "Create Pool"
 */

import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  AlertCircle,
  Loader2,
  ChevronDown,
  Settings,
  Save,
} from 'lucide-react';
import type { PoolAgentTypeConfig, AgentPool, UpdatePoolInput } from '../../api/hooks/usePools';
import { useUpdatePool } from '../../api/hooks/usePools';
import {
  AgentTypeConfigRow,
  validateMaxSize,
  validatePriority,
  validateMaxSlots,
  defaultAgentType,
} from './AgentTypeConfigRow';
import type { AgentTypeFormState, FormState } from './AgentTypeConfigRow';

// ============================================================================
// Types
// ============================================================================

export interface EditPoolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pool: AgentPool;
  onSuccess?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a pool's config into editable form state
 */
function poolToFormState(pool: AgentPool): FormState {
  const { config } = pool;
  return {
    name: config.name,
    description: config.description ?? '',
    maxSize: String(config.maxSize),
    agentTypes: config.agentTypes.map((at): AgentTypeFormState => ({
      role: at.role,
      workerMode: at.workerMode ?? '',
      stewardFocus: at.stewardFocus ?? '',
      priority: at.priority !== undefined ? String(at.priority) : '0',
      maxSlots: at.maxSlots !== undefined ? String(at.maxSlots) : '',
    })),
    enabled: config.enabled,
    tags: config.tags?.join(', ') ?? '',
  };
}

// ============================================================================
// Component
// ============================================================================

export function EditPoolDialog({ isOpen, onClose, pool, onSuccess }: EditPoolDialogProps) {
  const [form, setForm] = useState<FormState>(() => poolToFormState(pool));
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updatePool = useUpdatePool();

  // Re-initialize form when pool changes (e.g., opening dialog for a different pool)
  useEffect(() => {
    if (isOpen) {
      setForm(poolToFormState(pool));
      setError(null);
      // Show advanced if pool has non-default values for enabled or tags
      setShowAdvanced(!pool.config.enabled || (pool.config.tags && pool.config.tags.length > 0) || false);
    }
  }, [isOpen, pool]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  // ---- Agent Type Helpers ----

  const addAgentType = () => {
    setForm(prev => ({
      ...prev,
      agentTypes: [...prev.agentTypes, { ...defaultAgentType }],
    }));
  };

  const updateAgentType = (index: number, updates: Partial<AgentTypeFormState>) => {
    setForm(prev => ({
      ...prev,
      agentTypes: prev.agentTypes.map((at, i) =>
        i === index ? { ...at, ...updates } : at
      ),
    }));
  };

  const removeAgentType = (index: number) => {
    setForm(prev => ({
      ...prev,
      agentTypes: prev.agentTypes.filter((_, i) => i !== index),
    }));
  };

  // ---- Submit ----

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate max size (must be >= activeCount)
    const sizeError = validateMaxSize(form.maxSize, pool.status.activeCount);
    if (sizeError) { setError(`Max size: ${sizeError}`); return; }

    // Validate agent types
    for (let i = 0; i < form.agentTypes.length; i++) {
      const at = form.agentTypes[i];
      const priorityError = validatePriority(at.priority);
      if (priorityError) { setError(`Agent type ${i + 1} priority: ${priorityError}`); return; }

      const maxSlotsError = validateMaxSlots(at.maxSlots, form.maxSize);
      if (maxSlotsError) { setError(`Agent type ${i + 1} max slots: ${maxSlotsError}`); return; }
    }

    // Build update input
    const agentTypes: PoolAgentTypeConfig[] = form.agentTypes.map(at => {
      return {
        role: at.role,
        ...(at.role === 'worker' && at.workerMode ? { workerMode: at.workerMode as 'ephemeral' | 'persistent' } : {}),
        ...(at.role === 'steward' && at.stewardFocus ? { stewardFocus: at.stewardFocus as 'merge' | 'docs' | 'custom' } : {}),
        ...(at.priority.trim() ? { priority: parseInt(at.priority, 10) } : {}),
        ...(at.maxSlots.trim() ? { maxSlots: parseInt(at.maxSlots, 10) } : {}),
      };
    });

    const input: UpdatePoolInput & { id: string } = {
      id: pool.id,
      maxSize: parseInt(form.maxSize, 10),
      description: form.description.trim() || undefined,
      agentTypes,
      enabled: form.enabled,
      tags: form.tags.trim() ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };

    try {
      await updatePool.mutateAsync(input);
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pool');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="edit-pool-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
        <div
          className="
            w-full max-w-lg
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
            my-8
          "
          data-testid="edit-pool-dialog"
          role="dialog"
          aria-labelledby="edit-pool-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-[var(--color-primary)]" />
              <h2
                id="edit-pool-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Edit Pool
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="
                p-1.5 rounded-lg
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              aria-label="Close dialog"
              data-testid="edit-pool-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Pool Name (read-only) */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--color-text)]">
                Pool Name
              </label>
              <p
                className="
                  px-3 py-2
                  text-sm
                  text-[var(--color-text-secondary)]
                  bg-[var(--color-surface-elevated)]
                  border border-[var(--color-border)]
                  rounded-lg
                "
                data-testid="edit-pool-name"
              >
                {pool.config.name}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Pool name cannot be changed after creation.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="edit-pool-description" className="text-sm font-medium text-[var(--color-text)]">
                Description
                <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(optional)</span>
              </label>
              <input
                id="edit-pool-description"
                type="text"
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g., Pool for ephemeral build workers"
                className="
                  w-full px-3 py-2
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  placeholder:text-[var(--color-text-tertiary)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                "
                autoFocus
                data-testid="edit-pool-description"
              />
            </div>

            {/* Max Concurrent Agents */}
            <div className="space-y-1">
              <label htmlFor="edit-pool-max-size" className="text-sm font-medium text-[var(--color-text)]">
                Max Concurrent Agents
              </label>
              <input
                id="edit-pool-max-size"
                type="number"
                min={pool.status.activeCount || 1}
                max="1000"
                value={form.maxSize}
                onChange={e => setForm(prev => ({ ...prev, maxSize: e.target.value }))}
                className="
                  w-full px-3 py-2
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                "
                data-testid="edit-pool-max-size"
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Maximum number of agents that can run simultaneously in this pool (1-1000).
                {pool.status.activeCount > 0 && (
                  <> Currently {pool.status.activeCount} active — cannot set below this.</>
                )}
              </p>
            </div>

            {/* Agent Type Configurations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--color-text)]">
                  Agent Types
                  <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={addAgentType}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded transition-colors"
                  data-testid="edit-add-agent-type"
                >
                  <Plus className="w-3 h-3" />
                  Add Type
                </button>
              </div>

              {form.agentTypes.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)] italic">
                  No agent types configured. Pool will include all workers and stewards.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.agentTypes.map((agentType, index) => (
                    <AgentTypeConfigRow
                      key={index}
                      index={index}
                      agentType={agentType}
                      onUpdate={updates => updateAgentType(index, updates)}
                      onRemove={() => removeAgentType(index)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Advanced Settings (collapsible) */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                data-testid="edit-toggle-advanced"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="space-y-3 pl-6">
                  {/* Enabled */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      data-testid="edit-pool-enabled"
                    />
                    <span className="text-sm text-[var(--color-text)]">Pool enabled</span>
                  </label>

                  {/* Tags */}
                  <div className="space-y-1">
                    <label htmlFor="edit-pool-tags" className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Tags (comma-separated)
                    </label>
                    <input
                      id="edit-pool-tags"
                      type="text"
                      value={form.tags}
                      onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="e.g., production, high-priority"
                      className="
                        w-full px-3 py-1.5
                        text-sm
                        bg-[var(--color-surface)]
                        border border-[var(--color-border)]
                        rounded-lg
                        placeholder:text-[var(--color-text-tertiary)]
                        focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                      "
                      data-testid="edit-pool-tags"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="
                  px-4 py-2
                  text-sm font-medium
                  text-[var(--color-text-secondary)]
                  hover:text-[var(--color-text)]
                  hover:bg-[var(--color-surface-hover)]
                  rounded-lg
                  transition-colors
                "
                data-testid="cancel-edit-pool"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatePool.isPending || !form.maxSize.trim()}
                className="
                  flex items-center gap-2
                  px-4 py-2
                  text-sm font-medium
                  text-white
                  bg-[var(--color-primary)]
                  hover:bg-[var(--color-primary-hover)]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  rounded-lg
                  transition-colors
                "
                data-testid="submit-edit-pool"
              >
                {updatePool.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
