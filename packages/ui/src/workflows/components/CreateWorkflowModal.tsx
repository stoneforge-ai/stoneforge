/**
 * @stoneforge/ui Create Workflow Modal
 *
 * Modal for creating a workflow from a playbook template.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Play,
  AlertCircle,
  Loader2,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import type { PlaybookVariable, PlaybookStep } from '../types';
import { usePlaybooks, usePlaybook, useCreateFromPlaybook } from '../hooks';

// ============================================================================
// Types
// ============================================================================

export interface CreateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected playbook ID (optional) */
  playbookId?: string | null;
  /** Callback when workflow is successfully created */
  onSuccess?: (workflow: { id: string; title: string }) => void;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Variable input based on type
 */
function VariableInput({
  variable,
  value,
  onChange,
}: {
  variable: PlaybookVariable;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const displayValue = value !== undefined ? value : variable.default;

  if (variable.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(displayValue)}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)]"
          data-testid={`variable-input-${variable.name}`}
        />
        <span className="text-sm text-[var(--color-text-secondary)]">Enable</span>
      </label>
    );
  }

  if (variable.enum && variable.enum.length > 0) {
    return (
      <select
        value={String(displayValue ?? '')}
        onChange={(e) =>
          onChange(
            variable.type === 'number' ? Number(e.target.value) : e.target.value
          )
        }
        className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
        data-testid={`variable-input-${variable.name}`}
      >
        <option value="">Select...</option>
        {variable.enum.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={variable.type === 'number' ? 'number' : 'text'}
      value={String(displayValue ?? '')}
      onChange={(e) =>
        onChange(
          variable.type === 'number' ? Number(e.target.value) : e.target.value
        )
      }
      placeholder={variable.default !== undefined ? `Default: ${variable.default}` : ''}
      className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
      data-testid={`variable-input-${variable.name}`}
    />
  );
}

/**
 * Steps preview showing what tasks will be created
 */
function StepsPreview({ steps }: { steps: PlaybookStep[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displaySteps = isExpanded ? steps : steps.slice(0, 3);
  const hasMore = steps.length > 3;

  return (
    <div data-testid="steps-preview" className="space-y-2">
      <div className="text-sm font-medium text-[var(--color-text)]">
        Steps ({steps.length})
      </div>
      <div className="space-y-1">
        {displaySteps.map((step, index) => (
          <div
            key={step.id}
            className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
          >
            <span className="w-5 h-5 flex items-center justify-center bg-[var(--color-surface-elevated)] rounded text-xs font-medium">
              {index + 1}
            </span>
            <span className="truncate">{step.title}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          {isExpanded ? 'Show less' : `Show ${steps.length - 3} more...`}
        </button>
      )}
    </div>
  );
}

/**
 * Playbook picker dropdown
 */
function PlaybookPicker({
  selectedPlaybookId,
  onSelect,
}: {
  selectedPlaybookId: string | null;
  onSelect: (playbookId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = usePlaybooks();
  const playbooks = data?.playbooks ?? [];

  const selectedPlaybook = playbooks.find((p) => p.id === selectedPlaybookId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-secondary)]" />
        <span className="text-sm text-[var(--color-text-secondary)]">Loading playbooks...</span>
      </div>
    );
  }

  if (playbooks.length === 0) {
    return (
      <div className="px-3 py-4 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg">
        <BookOpen className="w-6 h-6 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">No playbooks available</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">Create a playbook template first</p>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="playbook-picker">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)]/50 transition-colors"
        data-testid="playbook-picker-trigger"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
          <span className="text-sm text-[var(--color-text)]">
            {selectedPlaybook?.title ?? 'Select a playbook...'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div
          className="absolute z-20 w-full mt-1 max-h-60 overflow-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg"
          data-testid="playbook-picker-dropdown"
        >
          {playbooks.map((playbook) => (
            <button
              key={playbook.id}
              onClick={() => {
                onSelect(playbook.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] ${
                selectedPlaybookId === playbook.id
                  ? 'bg-[var(--color-primary-muted)]'
                  : ''
              }`}
              data-testid={`playbook-option-${playbook.id}`}
            >
              <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
              <div>
                <div className="text-sm text-[var(--color-text)]">{playbook.title}</div>
                <div className="text-xs text-[var(--color-text-tertiary)] font-mono">{playbook.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CreateWorkflowModal({
  isOpen,
  onClose,
  playbookId: initialPlaybookId,
  onSuccess,
}: CreateWorkflowModalProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(
    initialPlaybookId ?? null
  );
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [ephemeral, setEphemeral] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch selected playbook
  const {
    data: playbookResponse,
    isLoading: isLoadingPlaybook,
  } = usePlaybook(selectedPlaybookId);
  const playbook = playbookResponse?.playbook;

  // Mutation
  const createFromPlaybook = useCreateFromPlaybook();

  // Update selected playbook when initialPlaybookId changes
  useEffect(() => {
    if (initialPlaybookId) {
      setSelectedPlaybookId(initialPlaybookId);
    }
  }, [initialPlaybookId]);

  // Initialize variables from playbook defaults
  useEffect(() => {
    if (playbook) {
      const defaults: Record<string, unknown> = {};
      for (const v of playbook.variables) {
        if (v.default !== undefined) {
          defaults[v.name] = v.default;
        }
      }
      setVariables(defaults);
      // Set default title from playbook
      if (!title) {
        setTitle(playbook.title);
      }
    }
  }, [playbook]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setSelectedPlaybookId(initialPlaybookId ?? null);
      setVariables({});
      setEphemeral(true);
      setError(null);
      createFromPlaybook.reset();
    }
  }, [isOpen, initialPlaybookId]);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!playbook) {
      errors.push('Please select a playbook');
    } else {
      // Check required variables
      for (const v of playbook.variables) {
        if (v.required && !variables[v.name] && v.default === undefined) {
          errors.push(`Required variable: ${v.name}`);
        }
      }
    }
    return errors;
  }, [playbook, variables]);

  const canCreate = validationErrors.length === 0 && !createFromPlaybook.isPending;

  // Handlers
  const handleVariableChange = useCallback((name: string, value: unknown) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = async () => {
    setError(null);

    if (!playbook || !selectedPlaybookId) {
      setError('Please select a playbook');
      return;
    }

    try {
      const result = await createFromPlaybook.mutateAsync({
        playbookId: selectedPlaybookId,
        title: title || playbook.title,
        variables,
        ephemeral,
      });
      onSuccess?.({ id: result.workflow.id, title: title || playbook.title });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="create-workflow-container">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        data-testid="create-workflow-backdrop"
      />

      {/* Dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
        <div
          className="
            w-full max-w-lg max-h-[90vh]
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
            flex flex-col
          "
          style={{ pointerEvents: 'auto' }}
          data-testid="create-workflow-dialog"
          role="dialog"
          aria-labelledby="create-workflow-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-[var(--color-primary)]" />
              <h2
                id="create-workflow-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Create Workflow
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
              aria-label="Close dialog"
              data-testid="create-workflow-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error message */}
          {(error || createFromPlaybook.error) && (
            <div className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error || createFromPlaybook.error?.message || 'An error occurred'}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Playbook Picker */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--color-text)]">
                Playbook <span className="text-red-500">*</span>
              </label>
              <PlaybookPicker
                selectedPlaybookId={selectedPlaybookId}
                onSelect={setSelectedPlaybookId}
              />
            </div>

            {isLoadingPlaybook && selectedPlaybookId && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[var(--color-primary)] animate-spin" />
              </div>
            )}

            {playbook && (
              <>
                {/* Workflow Title */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--color-text)]">
                    Workflow Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={playbook.title}
                    className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                    data-testid="create-title-input"
                  />
                </div>

                {/* Playbook Info */}
                <div className="p-3 bg-[var(--color-surface-elevated)] rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {playbook.title}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-text-tertiary)]">
                    {playbook.steps.length} steps, v{playbook.version}
                  </div>
                </div>

                {/* Variables */}
                {playbook.variables.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-[var(--color-text)]">
                      Variables
                    </div>
                    {playbook.variables.map((variable) => (
                      <div key={variable.name} className="space-y-1">
                        <label className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
                          {variable.name}
                          {variable.required && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>
                        {variable.description && (
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            {variable.description}
                          </p>
                        )}
                        <VariableInput
                          variable={variable}
                          value={variables[variable.name]}
                          onChange={(value) =>
                            handleVariableChange(variable.name, value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Steps Preview */}
                <StepsPreview steps={playbook.steps} />

                {/* Advanced Options */}
                <details className="text-sm" data-testid="advanced-options">
                  <summary className="text-[var(--color-text-secondary)] cursor-pointer hover:text-[var(--color-text)]" data-testid="toggle-advanced">
                    Advanced options
                  </summary>
                  <div className="mt-2 p-3 bg-[var(--color-surface)] rounded-lg space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ephemeral}
                        onChange={(e) => setEphemeral(e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)]"
                        data-testid="ephemeral-checkbox"
                      />
                      <div>
                        <span className="text-sm text-[var(--color-text)]">
                          Ephemeral workflow
                        </span>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          Ephemeral workflows are automatically cleaned up after completion
                        </p>
                      </div>
                    </label>
                  </div>
                </details>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
              data-testid="create-cancel-button"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              data-testid="create-submit-button"
            >
              {createFromPlaybook.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Create Workflow
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
