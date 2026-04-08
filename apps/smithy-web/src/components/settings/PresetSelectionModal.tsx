/**
 * Preset Selection Modal
 *
 * Full-screen overlay for selecting a workflow preset. Shown on first load
 * of the dashboard when no preset has been configured, and re-accessible
 * from the Settings page.
 */

import { useState, useCallback } from 'react';
import {
  Zap,
  Eye,
  Shield,
  Check,
  Loader2,
} from 'lucide-react';
import type { WorkflowPreset } from '../../api/hooks/useWorkflowPreset';

// ============================================================================
// Preset Definitions
// ============================================================================

interface PresetInfo {
  id: WorkflowPreset;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
}

const PRESETS: PresetInfo[] = [
  {
    id: 'auto',
    name: 'Auto',
    icon: Zap,
    tagline: 'Fast iteration, no human review',
    description:
      'Agents merge directly to main. Tests must pass. Best for solo developers and rapid prototyping.',
  },
  {
    id: 'review',
    name: 'Review',
    icon: Eye,
    tagline: 'Human reviews before main',
    description:
      'Agents merge to a review branch. You review and merge to main when ready. Best for teams wanting oversight without blocking agents.',
  },
  {
    id: 'approve',
    name: 'Approve',
    icon: Shield,
    tagline: 'Full control, explicit approval',
    description:
      'Agents need permission for restricted actions. Merges via GitHub PRs. Best for production codebases and regulated environments.',
  },
];

// ============================================================================
// PresetSelectionModal Component
// ============================================================================

export interface PresetSelectionModalProps {
  /** Called when a preset is confirmed. Return value indicates success. */
  onSelect: (preset: WorkflowPreset) => Promise<boolean>;
  /** Called after successful selection to dismiss the modal */
  onDismiss: () => void;
  /** Optional: currently active preset (for settings page re-selection) */
  currentPreset?: WorkflowPreset | null;
}

export function PresetSelectionModal({
  onSelect,
  onDismiss,
  currentPreset,
}: PresetSelectionModalProps) {
  const [selected, setSelected] = useState<WorkflowPreset | null>(currentPreset ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!selected) return;

    setIsSaving(true);
    setError(null);

    const success = await onSelect(selected);

    if (success) {
      onDismiss();
    } else {
      setError('Failed to save preset. Please try again.');
    }

    setIsSaving(false);
  }, [selected, onSelect, onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      data-testid="preset-selection-modal"
    >
      <div className="w-full max-w-4xl mx-4 p-8 rounded-2xl bg-[var(--color-card-bg)] border border-[var(--color-border)] shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[var(--color-text)]">
            Choose your workflow
          </h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            Select how agents should interact with your codebase. You can change this later in Settings.
          </p>
        </div>

        {/* Preset Cards */}
        {/* viewport-based: renders in fixed overlay outside @container */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selected === preset.id}
              onClick={() => setSelected(preset.id)}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-2 text-sm text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-lg text-center">
            {error}
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            disabled={!selected || isSaving}
            className={`flex items-center gap-2 px-8 py-3 text-sm font-semibold rounded-lg transition-all duration-150 ${
              selected && !isSaving
                ? 'bg-[var(--color-primary)] text-white hover:opacity-90 shadow-lg'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-tertiary)] cursor-not-allowed'
            }`}
            data-testid="preset-selection-confirm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PresetCard Component
// ============================================================================

interface PresetCardProps {
  preset: PresetInfo;
  isSelected: boolean;
  onClick: () => void;
}

function PresetCard({ preset, isSelected, onClick }: PresetCardProps) {
  const Icon = preset.icon;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center text-center p-6 rounded-xl border-2 transition-all duration-150 cursor-pointer ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] shadow-md'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)]'
      }`}
      data-testid={`preset-card-${preset.id}`}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Icon */}
      <div
        className={`p-3 rounded-xl mb-4 ${
          isSelected
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]'
        }`}
      >
        <Icon className="w-8 h-8" />
      </div>

      {/* Name */}
      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">
        {preset.name}
      </h3>

      {/* Tagline */}
      <p className="text-sm font-medium text-[var(--color-primary)] mb-3">
        {preset.tagline}
      </p>

      {/* Description */}
      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {preset.description}
      </p>
    </button>
  );
}

// ============================================================================
// Inline Preset Selector (for Settings page)
// ============================================================================

export interface InlinePresetSelectorProps {
  currentPreset: WorkflowPreset | null;
  onSelect: (preset: WorkflowPreset) => Promise<boolean>;
}

export function InlinePresetSelector({
  currentPreset,
  onSelect,
}: InlinePresetSelectorProps) {
  const [selected, setSelected] = useState<WorkflowPreset | null>(currentPreset);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChanged = selected !== currentPreset;

  const handleSave = useCallback(async () => {
    if (!selected || !hasChanged) return;

    setIsSaving(true);
    setError(null);

    const success = await onSelect(selected);

    if (!success) {
      setError('Failed to save preset. Please try again.');
      setSelected(currentPreset);
    }

    setIsSaving(false);
  }, [selected, hasChanged, onSelect, currentPreset]);

  return (
    <div data-testid="inline-preset-selector">
      {/* viewport-based: renders in fixed overlay outside @container */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {PRESETS.map((preset) => (
          <InlinePresetCard
            key={preset.id}
            preset={preset}
            isSelected={selected === preset.id}
            isCurrent={currentPreset === preset.id}
            onClick={() => setSelected(preset.id)}
          />
        ))}
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 text-xs text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-md">
          {error}
        </div>
      )}

      {hasChanged && selected && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          data-testid="preset-save-button"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              Apply Preset
            </>
          )}
        </button>
      )}
    </div>
  );
}

function InlinePresetCard({
  preset,
  isSelected,
  isCurrent,
  onClick,
}: {
  preset: PresetInfo;
  isSelected: boolean;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const Icon = preset.icon;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-start p-4 rounded-lg border transition-all duration-150 cursor-pointer text-left ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-tertiary)]'
      }`}
      data-testid={`inline-preset-${preset.id}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={`w-4 h-4 ${
            isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'
          }`}
        />
        <span className="text-sm font-semibold text-[var(--color-text)]">
          {preset.name}
        </span>
        {isCurrent && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-success-muted)] text-[var(--color-success)]">
            current
          </span>
        )}
        {isSelected && !isCurrent && (
          <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />
        )}
      </div>
      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
        {preset.description}
      </p>
    </button>
  );
}
