/**
 * CreatePoolDialog - Dialog for creating new agent pools
 *
 * Provides a form for creating agent pools with:
 * - Pool name (validated per isValidPoolName rules)
 * - Max concurrent agents (validated per isValidPoolSize rules)
 * - Agent type configurations (role, mode/focus, priority, maxSlots)
 * - Optional description and tags
 *
 * Follows the same dialog pattern as CreateAgentDialog.
 */

import { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  ChevronDown,
  Users,
} from 'lucide-react';
import type { CreatePoolInput, PoolAgentTypeConfig } from '../../api/hooks/usePools';
import { useCreatePool } from '../../api/hooks/usePools';

// ============================================================================
// Types
// ============================================================================

export interface CreatePoolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (pool: { id: string; name: string }) => void;
}

interface AgentTypeFormState {
  role: 'worker' | 'steward';
  workerMode: 'ephemeral' | 'persistent' | '';
  stewardFocus: 'merge' | 'docs' | '';
  priority: string;
  maxSlots: string;
}

interface FormState {
  name: string;
  description: string;
  maxSize: string;
  agentTypes: AgentTypeFormState[];
  enabled: boolean;
  tags: string;
}

// ============================================================================
// Validation (matches backend rules from agent-pool.ts)
// ============================================================================

const POOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function validatePoolName(name: string): string | null {
  if (!name.trim()) return 'Pool name is required';
  if (name.length < 1 || name.length > 64) return 'Pool name must be 1-64 characters';
  if (!POOL_NAME_PATTERN.test(name)) return 'Must start with a letter and contain only letters, numbers, hyphens, or underscores';
  return null;
}

function validateMaxSize(value: string): string | null {
  if (!value.trim()) return 'Max size is required';
  const num = parseInt(value, 10);
  if (isNaN(num) || !Number.isInteger(num)) return 'Must be a whole number';
  if (num < 1 || num > 1000) return 'Must be between 1 and 1000';
  return null;
}

function validatePriority(value: string): string | null {
  if (!value.trim()) return null; // Optional
  const num = parseInt(value, 10);
  if (isNaN(num) || !Number.isInteger(num)) return 'Must be a whole number';
  return null;
}

function validateMaxSlots(value: string, poolMaxSize: string): string | null {
  if (!value.trim()) return null; // Optional
  const num = parseInt(value, 10);
  if (isNaN(num) || !Number.isInteger(num)) return 'Must be a whole number';
  if (num < 1 || num > 1000) return 'Must be between 1 and 1000';
  const poolSize = parseInt(poolMaxSize, 10);
  if (!isNaN(poolSize) && num > poolSize) return `Must be <= pool max size (${poolSize})`;
  return null;
}

// ============================================================================
// Constants
// ============================================================================

const workerModeLabels: Record<string, string> = {
  ephemeral: 'Ephemeral',
  persistent: 'Persistent',
};

const stewardFocusLabels: Record<string, string> = {
  merge: 'Merge',
  docs: 'Docs',
};

const defaultFormState: FormState = {
  name: '',
  description: '',
  maxSize: '5',
  agentTypes: [],
  enabled: true,
  tags: '',
};

const defaultAgentType: AgentTypeFormState = {
  role: 'worker',
  workerMode: '',
  stewardFocus: '',
  priority: '0',
  maxSlots: '',
};

// ============================================================================
// Component
// ============================================================================

export function CreatePoolDialog({ isOpen, onClose, onSuccess }: CreatePoolDialogProps) {
  const [form, setForm] = useState<FormState>({ ...defaultFormState });
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createPool = useCreatePool();

  if (!isOpen) return null;

  const handleClose = () => {
    setForm({ ...defaultFormState });
    setError(null);
    setShowAdvanced(false);
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

    // Validate
    const nameError = validatePoolName(form.name);
    if (nameError) { setError(nameError); return; }

    const sizeError = validateMaxSize(form.maxSize);
    if (sizeError) { setError(`Max size: ${sizeError}`); return; }

    // Validate agent types
    for (let i = 0; i < form.agentTypes.length; i++) {
      const at = form.agentTypes[i];
      const priorityError = validatePriority(at.priority);
      if (priorityError) { setError(`Agent type ${i + 1} priority: ${priorityError}`); return; }

      const maxSlotsError = validateMaxSlots(at.maxSlots, form.maxSize);
      if (maxSlotsError) { setError(`Agent type ${i + 1} max slots: ${maxSlotsError}`); return; }
    }

    // Build input
    const agentTypes: PoolAgentTypeConfig[] = form.agentTypes.map(at => {
      return {
        role: at.role,
        ...(at.role === 'worker' && at.workerMode ? { workerMode: at.workerMode as 'ephemeral' | 'persistent' } : {}),
        ...(at.role === 'steward' && at.stewardFocus ? { stewardFocus: at.stewardFocus as 'merge' | 'docs' } : {}),
        ...(at.priority.trim() ? { priority: parseInt(at.priority, 10) } : {}),
        ...(at.maxSlots.trim() ? { maxSlots: parseInt(at.maxSlots, 10) } : {}),
      };
    });

    const input: CreatePoolInput = {
      name: form.name.trim(),
      maxSize: parseInt(form.maxSize, 10),
      ...(form.description.trim() && { description: form.description.trim() }),
      ...(agentTypes.length > 0 && { agentTypes }),
      enabled: form.enabled,
      ...(form.tags.trim() && { tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }),
    };

    try {
      const pool = await createPool.mutateAsync(input);
      onSuccess?.({ id: pool.id, name: pool.config.name });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pool');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="create-pool-backdrop"
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
          data-testid="create-pool-dialog"
          role="dialog"
          aria-labelledby="create-pool-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[var(--color-primary)]" />
              <h2
                id="create-pool-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Create Pool
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
              data-testid="create-pool-close"
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

            {/* Pool Name */}
            <div className="space-y-1">
              <label htmlFor="pool-name" className="text-sm font-medium text-[var(--color-text)]">
                Pool Name
              </label>
              <input
                id="pool-name"
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., worker-pool, build-agents"
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
                data-testid="pool-name"
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Must start with a letter. Letters, numbers, hyphens, underscores only.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="pool-description" className="text-sm font-medium text-[var(--color-text)]">
                Description
                <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">(optional)</span>
              </label>
              <input
                id="pool-description"
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
                data-testid="pool-description"
              />
            </div>

            {/* Max Concurrent Agents */}
            <div className="space-y-1">
              <label htmlFor="pool-max-size" className="text-sm font-medium text-[var(--color-text)]">
                Max Concurrent Agents
              </label>
              <input
                id="pool-max-size"
                type="number"
                min="1"
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
                data-testid="pool-max-size"
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Maximum number of agents that can run simultaneously in this pool (1-1000).
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
                  data-testid="add-agent-type"
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
                data-testid="toggle-advanced"
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
                      data-testid="pool-enabled"
                    />
                    <span className="text-sm text-[var(--color-text)]">Pool enabled</span>
                  </label>

                  {/* Tags */}
                  <div className="space-y-1">
                    <label htmlFor="pool-tags" className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Tags (comma-separated)
                    </label>
                    <input
                      id="pool-tags"
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
                      data-testid="pool-tags"
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
                data-testid="cancel-create-pool"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPool.isPending || !form.name.trim() || !form.maxSize.trim()}
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
                data-testid="submit-create-pool"
              >
                {createPool.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Pool
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

// ============================================================================
// Agent Type Config Row
// ============================================================================

interface AgentTypeConfigRowProps {
  index: number;
  agentType: AgentTypeFormState;
  onUpdate: (updates: Partial<AgentTypeFormState>) => void;
  onRemove: () => void;
}

function AgentTypeConfigRow({ index, agentType, onUpdate, onRemove }: AgentTypeConfigRowProps) {
  return (
    <div
      className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-2"
      data-testid={`agent-type-${index}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          Agent Type {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-[var(--color-text-tertiary)] hover:text-red-500 transition-colors"
          aria-label="Remove agent type"
          data-testid={`agent-type-${index}-remove`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Role + Mode/Focus row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Role */}
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-tertiary)]">Role</label>
          <div className="relative">
            <select
              value={agentType.role}
              onChange={e => {
                const role = e.target.value as 'worker' | 'steward';
                onUpdate({
                  role,
                  workerMode: role === 'worker' ? '' : agentType.workerMode,
                  stewardFocus: role === 'steward' ? '' : agentType.stewardFocus,
                });
              }}
              className="
                w-full px-2 py-1.5 pr-7
                text-xs
                bg-[var(--color-bg)]
                border border-[var(--color-border)]
                rounded
                appearance-none
                focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
              "
              data-testid={`agent-type-${index}-role`}
            >
              <option value="worker">Worker</option>
              <option value="steward">Steward</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-tertiary)] pointer-events-none" />
          </div>
        </div>

        {/* Mode (Worker) or Focus (Steward) */}
        <div className="space-y-1">
          {agentType.role === 'worker' ? (
            <>
              <label className="text-xs text-[var(--color-text-tertiary)]">Mode</label>
              <div className="relative">
                <select
                  value={agentType.workerMode}
                  onChange={e => onUpdate({ workerMode: e.target.value as AgentTypeFormState['workerMode'] })}
                  className="
                    w-full px-2 py-1.5 pr-7
                    text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    appearance-none
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`agent-type-${index}-worker-mode`}
                >
                  <option value="">Any</option>
                  {Object.entries(workerModeLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-tertiary)] pointer-events-none" />
              </div>
            </>
          ) : (
            <>
              <label className="text-xs text-[var(--color-text-tertiary)]">Focus</label>
              <div className="relative">
                <select
                  value={agentType.stewardFocus}
                  onChange={e => onUpdate({ stewardFocus: e.target.value as AgentTypeFormState['stewardFocus'] })}
                  className="
                    w-full px-2 py-1.5 pr-7
                    text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    appearance-none
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`agent-type-${index}-steward-focus`}
                >
                  <option value="">Any</option>
                  {Object.entries(stewardFocusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-tertiary)] pointer-events-none" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Priority + Max Slots row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-tertiary)]">Priority</label>
          <input
            type="number"
            value={agentType.priority}
            onChange={e => onUpdate({ priority: e.target.value })}
            placeholder="0"
            className="
              w-full px-2 py-1.5
              text-xs
              bg-[var(--color-bg)]
              border border-[var(--color-border)]
              rounded
              focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
            "
            data-testid={`agent-type-${index}-priority`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-tertiary)]">Max Slots</label>
          <input
            type="number"
            min="1"
            value={agentType.maxSlots}
            onChange={e => onUpdate({ maxSlots: e.target.value })}
            placeholder="No limit"
            className="
              w-full px-2 py-1.5
              text-xs
              bg-[var(--color-bg)]
              border border-[var(--color-border)]
              rounded
              focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
            "
            data-testid={`agent-type-${index}-max-slots`}
          />
        </div>
      </div>
    </div>
  );
}
