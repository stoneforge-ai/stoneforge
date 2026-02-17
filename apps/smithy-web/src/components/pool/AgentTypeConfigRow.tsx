/**
 * AgentTypeConfigRow - Shared agent type configuration row for pool dialogs
 *
 * Extracted from CreatePoolDialog to be reused by EditPoolDialog.
 * Provides:
 * - AgentTypeFormState type
 * - FormState type
 * - Validation functions for pool forms
 * - AgentTypeConfigRow component
 */

import { Trash2, ChevronDown } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface AgentTypeFormState {
  role: 'worker' | 'steward';
  workerMode: 'ephemeral' | 'persistent' | '';
  stewardFocus: 'merge' | 'docs' | 'recovery' | 'custom' | '';
  priority: string;
  maxSlots: string;
  provider: string;
  model: string;
}

export interface FormState {
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

export function validatePoolName(name: string): string | null {
  if (!name.trim()) return 'Pool name is required';
  if (name.length < 1 || name.length > 64) return 'Pool name must be 1-64 characters';
  if (!POOL_NAME_PATTERN.test(name)) return 'Must start with a letter and contain only letters, numbers, hyphens, or underscores';
  return null;
}

export function validateMaxSize(value: string, minSize?: number): string | null {
  if (!value.trim()) return 'Max size is required';
  const num = parseInt(value, 10);
  if (isNaN(num) || !Number.isInteger(num)) return 'Must be a whole number';
  if (num < 1 || num > 1000) return 'Must be between 1 and 1000';
  if (minSize !== undefined && num < minSize) return `Must be >= ${minSize} (current active agents)`;
  return null;
}

export function validatePriority(value: string): string | null {
  if (!value.trim()) return null; // Optional
  const num = parseInt(value, 10);
  if (isNaN(num) || !Number.isInteger(num)) return 'Must be a whole number';
  return null;
}

export function validateMaxSlots(value: string, poolMaxSize: string): string | null {
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

export const workerModeLabels: Record<string, string> = {
  ephemeral: 'Ephemeral',
  persistent: 'Persistent',
};

export const stewardFocusLabels: Record<string, string> = {
  merge: 'Merge',
  docs: 'Docs',
  recovery: 'Recovery',
  custom: 'Custom',
};

export const defaultFormState: FormState = {
  name: '',
  description: '',
  maxSize: '5',
  agentTypes: [],
  enabled: true,
  tags: '',
};

export const defaultAgentType: AgentTypeFormState = {
  role: 'worker',
  workerMode: '',
  stewardFocus: '',
  priority: '0',
  maxSlots: '',
  provider: '',
  model: '',
};

// ============================================================================
// Component
// ============================================================================

interface AgentTypeConfigRowProps {
  index: number;
  agentType: AgentTypeFormState;
  onUpdate: (updates: Partial<AgentTypeFormState>) => void;
  onRemove: () => void;
}

export function AgentTypeConfigRow({ index, agentType, onUpdate, onRemove }: AgentTypeConfigRowProps) {
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

      {/* Provider + Model row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-tertiary)]">Provider</label>
          <input
            type="text"
            value={agentType.provider}
            onChange={e => onUpdate({ provider: e.target.value })}
            placeholder="e.g., claude, opencode"
            className="
              w-full px-2 py-1.5
              text-xs
              bg-[var(--color-bg)]
              border border-[var(--color-border)]
              rounded
              focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
            "
            data-testid={`agent-type-${index}-provider`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-tertiary)]">Model</label>
          <input
            type="text"
            value={agentType.model}
            onChange={e => onUpdate({ model: e.target.value })}
            placeholder="e.g., claude-sonnet-4-20250514"
            className="
              w-full px-2 py-1.5
              text-xs
              bg-[var(--color-bg)]
              border border-[var(--color-border)]
              rounded
              focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
            "
            data-testid={`agent-type-${index}-model`}
          />
        </div>
      </div>
    </div>
  );
}
