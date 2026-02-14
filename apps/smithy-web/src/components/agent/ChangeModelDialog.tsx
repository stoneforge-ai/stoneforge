/**
 * ChangeModelDialog - Dialog for changing an agent's model
 */

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Settings } from 'lucide-react';
import { useChangeAgentModel, useProviderModels } from '../../api/hooks/useAgents';

export interface ChangeModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  currentModel: string | undefined;
  currentProvider: string;
  onSuccess?: () => void;
}

export function ChangeModelDialog({
  isOpen,
  onClose,
  agentId,
  currentModel,
  currentProvider,
  onSuccess,
}: ChangeModelDialogProps) {
  // Use empty string for "default" model
  const [model, setModel] = useState(currentModel ?? '');
  const [error, setError] = useState<string | null>(null);
  const changeModel = useChangeAgentModel();
  const { data: modelsData, isLoading: modelsLoading, error: modelsError } = useProviderModels(currentProvider);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setModel(currentModel ?? '');
      setError(null);
    }
  }, [isOpen, currentModel]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Normalize: empty string means no model override (default)
    const normalizedCurrent = currentModel ?? '';
    if (model === normalizedCurrent) {
      handleClose();
      return;
    }

    try {
      // Pass null to clear model override, otherwise pass the model ID
      await changeModel.mutateAsync({ agentId, model: model || null });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change model');
    }
  };

  const allModels = modelsData?.models ?? [];
  const defaultModel = allModels.find(m => m.isDefault);
  // Filter out the default model — it's already shown in the "Default (...)" option
  const models = allModels.filter(m => !m.isDefault);
  const normalizedCurrent = currentModel ?? '';
  const hasChanged = model !== normalizedCurrent;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="change-model-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="
            w-full max-w-sm
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
          "
          data-testid="change-model-dialog"
          role="dialog"
          aria-labelledby="change-model-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="change-model-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Change Model
            </h2>
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
              data-testid="change-model-close"
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

            {/* Models fetch error */}
            {modelsError && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Failed to load models. Try again later.
              </div>
            )}

            {/* Model select */}
            <div className="space-y-1">
              <label htmlFor="agent-model" className="text-sm font-medium text-[var(--color-text)]">
                Model
              </label>
              {modelsLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-[var(--color-text-tertiary)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading models...
                </div>
              ) : (
                <select
                  id="agent-model"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="
                    w-full px-3 py-2
                    text-sm
                    bg-[var(--color-surface)]
                    border border-[var(--color-border)]
                    rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid="change-model-select"
                >
                  <option value="">
                    {defaultModel ? `Default (${defaultModel.displayName})` : '(Default)'}
                  </option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.providerName ? `${m.displayName}  —  ${m.providerName}` : m.displayName}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Select a model or use the provider's default.
              </p>
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
                data-testid="change-model-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={changeModel.isPending || !hasChanged || modelsLoading}
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
                data-testid="change-model-submit"
              >
                {changeModel.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4" />
                    Change
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
