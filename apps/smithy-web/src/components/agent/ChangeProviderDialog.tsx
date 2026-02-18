/**
 * ChangeProviderDialog - Dialog for changing an agent's provider
 */

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { useChangeAgentProvider, useProviders } from '../../api/hooks/useAgents';
import { getProviderLabel } from '../../lib/providers';

/** Default executable name per provider (used as placeholder text) */
const providerDefaultExecutable: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
  codex: 'codex',
};

export interface ChangeProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  currentProvider: string;
  currentExecutablePath?: string;
  onSuccess?: () => void;
}

export function ChangeProviderDialog({
  isOpen,
  onClose,
  agentId,
  currentProvider,
  currentExecutablePath,
  onSuccess,
}: ChangeProviderDialogProps) {
  const [provider, setProvider] = useState(currentProvider);
  const [executablePath, setExecutablePath] = useState(currentExecutablePath ?? '');
  const [error, setError] = useState<string | null>(null);
  const changeProvider = useChangeAgentProvider();
  const { data: providersData, isLoading: providersLoading } = useProviders();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setProvider(currentProvider);
      setExecutablePath(currentExecutablePath ?? '');
      setError(null);
    }
  }, [isOpen, currentProvider, currentExecutablePath]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    // Clear executable path when provider changes (it's provider-specific)
    setExecutablePath('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPath = executablePath.trim();
    const currentPath = currentExecutablePath ?? '';
    const pathChanged = trimmedPath !== currentPath;

    if (provider === currentProvider && !pathChanged) {
      handleClose();
      return;
    }

    try {
      // Determine executablePath value to send:
      // - If user cleared the field, send null to remove the override
      // - If user set a value, send it
      // - If unchanged, don't include it
      let executablePathValue: string | null | undefined;
      if (pathChanged) {
        executablePathValue = trimmedPath || null; // empty string → null (clear override)
      }

      await changeProvider.mutateAsync({
        agentId,
        provider,
        executablePath: executablePathValue,
      });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change provider');
    }
  };

  const providers = providersData?.providers ?? [];
  const hasChanges = provider !== currentProvider || executablePath.trim() !== (currentExecutablePath ?? '');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="change-provider-backdrop"
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
          data-testid="change-provider-dialog"
          role="dialog"
          aria-labelledby="change-provider-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="change-provider-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Change Provider
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
              data-testid="change-provider-close"
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

            {/* Provider select */}
            <div className="space-y-1">
              <label htmlFor="agent-provider" className="text-sm font-medium text-[var(--color-text)]">
                Provider
              </label>
              {providersLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-[var(--color-text-tertiary)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading providers...
                </div>
              ) : (
                <select
                  id="agent-provider"
                  value={provider}
                  onChange={e => handleProviderChange(e.target.value)}
                  className="
                    w-full px-3 py-2
                    text-sm
                    bg-[var(--color-surface)]
                    border border-[var(--color-border)]
                    rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid="change-provider-select"
                >
                  {providers.map(p => (
                    <option key={p.name} value={p.name} disabled={!p.available}>
                      {getProviderLabel(p.name)}{!p.available ? ' (not installed)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Executable path */}
            <div className="space-y-1">
              <label htmlFor="change-provider-executable-path" className="text-sm font-medium text-[var(--color-text)]">
                Executable Path (optional)
              </label>
              <input
                id="change-provider-executable-path"
                type="text"
                value={executablePath}
                onChange={e => setExecutablePath(e.target.value)}
                placeholder={providerDefaultExecutable[provider] ?? provider}
                className="
                  w-full px-3 py-2
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  placeholder:text-[var(--color-text-tertiary)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                "
                data-testid="change-provider-executable-path"
              />
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Custom path to the provider CLI executable. Leave empty to use the default.
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
                data-testid="change-provider-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={changeProvider.isPending || !hasChanges}
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
                data-testid="change-provider-submit"
              >
                {changeProvider.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4" />
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
