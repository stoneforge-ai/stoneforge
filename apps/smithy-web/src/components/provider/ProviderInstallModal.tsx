/**
 * ProviderInstallModal
 *
 * Non-dismissable modal that blocks the app when one or more providers
 * required by registered agents are not installed on the machine.
 * Shows install instructions and a per-provider "Verify Installation" button.
 * Also offers a "change provider" option so users can switch affected agents
 * to an already-installed provider.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@stoneforge/ui';
import { AlertTriangle, CheckCircle2, Loader2, Package, ArrowLeftRight, AlertCircle } from 'lucide-react';
import type { MissingProvider } from '../../hooks/useProviderCheck';
import type { ProviderInfo, Agent } from '../../api/types';
import { getProviderLabel } from '../../lib/providers';

// ============================================================================
// Types
// ============================================================================

export interface ProviderInstallModalProps {
  /** Providers that are missing */
  missingProviders: MissingProvider[];
  /** Providers that are installed and available (for the change-provider UI) */
  availableProviders: ProviderInfo[];
  /** Called when the user clicks "Verify Installation" */
  onVerify: (providerName: string) => Promise<unknown>;
  /** Whether a given provider is currently being verified */
  isVerifying: (providerName: string) => boolean;
  /** Called when the user wants to change an agent's provider */
  onChangeProvider: (agentId: string, newProvider: string) => Promise<unknown>;
}

// ============================================================================
// Sub-components
// ============================================================================

/** Per-agent row showing a dropdown to switch to an available provider */
interface AgentProviderChangeRowProps {
  agent: Agent;
  availableProviders: ProviderInfo[];
  onChangeProvider: (agentId: string, newProvider: string) => Promise<unknown>;
}

function AgentProviderChangeRow({ agent, availableProviders, onChangeProvider }: AgentProviderChangeRowProps) {
  const [selectedProvider, setSelectedProvider] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(async () => {
    if (!selectedProvider) return;
    setIsChanging(true);
    setError(null);
    try {
      await onChangeProvider(agent.id, selectedProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change provider');
    } finally {
      setIsChanging(false);
    }
  }, [agent.id, selectedProvider, onChangeProvider]);

  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`agent-provider-change-${agent.id}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--color-text)] font-medium min-w-0 truncate flex-shrink-0">
          {agent.name}
        </span>
        <select
          value={selectedProvider}
          onChange={(e) => {
            setSelectedProvider(e.target.value);
            setError(null);
          }}
          className="
            flex-1 min-w-0 px-2 py-1
            text-sm
            bg-[var(--color-surface)]
            border border-[var(--color-border)]
            rounded-md
            focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
          "
          data-testid={`agent-provider-select-${agent.id}`}
        >
          <option value="">Select provider...</option>
          {availableProviders.map((p) => (
            <option key={p.name} value={p.name}>
              {getProviderLabel(p.name)}
            </option>
          ))}
        </select>
        <button
          onClick={handleChange}
          disabled={!selectedProvider || isChanging}
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'text-[var(--color-text)]',
            'hover:bg-[var(--color-surface-hover)]',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
            'transition-colors duration-150',
          ].join(' ')}
          data-testid={`agent-provider-change-btn-${agent.id}`}
        >
          {isChanging ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Changing...
            </>
          ) : (
            <>
              <ArrowLeftRight className="w-3 h-3" />
              Change
            </>
          )}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

interface ProviderCardProps {
  provider: MissingProvider;
  availableProviders: ProviderInfo[];
  onVerify: () => void;
  isVerifying: boolean;
  isVerified: boolean;
  onChangeProvider: (agentId: string, newProvider: string) => Promise<unknown>;
}

function ProviderCard({
  provider,
  availableProviders,
  onVerify,
  isVerifying,
  isVerified,
  onChangeProvider,
}: ProviderCardProps) {
  const agentNames = provider.agents.map((a) => a.name).join(', ');
  const hasAlternatives = availableProviders.length > 0;

  return (
    <div
      className={[
        'rounded-lg border p-4',
        isVerified
          ? 'border-[var(--color-success)] bg-[var(--color-success)]/5'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]',
        'transition-colors duration-200',
      ].join(' ')}
      data-testid={`provider-card-${provider.name}`}
    >
      {/* Provider header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-5 h-5 flex-shrink-0 text-[var(--color-text-secondary)]" />
          <h3 className="font-semibold text-[var(--color-text)] truncate">
            {provider.name}
          </h3>
          {isVerified && (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[var(--color-success)]" />
          )}
        </div>
      </div>

      {/* Agents using this provider */}
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        <span className="font-medium">Used by:</span> {agentNames}
      </p>

      {/* Installation instructions */}
      {!isVerified && (
        <div className="mt-3 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] p-3">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 uppercase tracking-wide">
            Installation Instructions
          </p>
          <pre className="text-sm text-[var(--color-text)] whitespace-pre-wrap font-mono leading-relaxed">
            {provider.installInstructions}
          </pre>
        </div>
      )}

      {/* Verify button */}
      {!isVerified && (
        <div className="mt-3">
          <button
            onClick={onVerify}
            disabled={isVerifying}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-[var(--color-primary)] text-white',
              'hover:bg-[var(--color-primary-hover)]',
              'active:bg-[var(--color-primary-active)]',
              'focus-visible:ring-2 focus-visible:ring-[var(--color-primary-200)] focus-visible:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
              'transition-colors duration-150',
            ].join(' ')}
            data-testid={`verify-provider-${provider.name}`}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Installation'
            )}
          </button>
        </div>
      )}

      {/* Change provider option — only show if alternatives exist and not verified */}
      {!isVerified && hasAlternatives && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2 uppercase tracking-wide">
            Or change provider
          </p>
          <div className="flex flex-col gap-2">
            {provider.agents.map((agent) => (
              <AgentProviderChangeRow
                key={agent.id}
                agent={agent}
                availableProviders={availableProviders}
                onChangeProvider={onChangeProvider}
              />
            ))}
          </div>
        </div>
      )}

      {/* Success feedback */}
      {isVerified && (
        <p className="mt-2 text-sm font-medium text-[var(--color-success)]">
          Provider installed and verified successfully.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProviderInstallModal({
  missingProviders,
  availableProviders,
  onVerify,
  isVerifying,
  onChangeProvider,
}: ProviderInstallModalProps) {
  // Track which providers have been verified (verified = was missing, now available)
  const [verifiedProviders, setVerifiedProviders] = useState<Set<string>>(new Set());

  // Compute which providers are still missing (not yet verified)
  const stillMissing = missingProviders.filter((p) => !verifiedProviders.has(p.name));
  const isOpen = stillMissing.length > 0;
  const isPlural = missingProviders.length > 1;

  // Reset verified set if missingProviders changes (e.g. full refetch)
  useEffect(() => {
    setVerifiedProviders(new Set());
  }, [missingProviders]);

  const handleVerify = useCallback(
    async (providerName: string) => {
      try {
        await onVerify(providerName);
        // Mark as verified on success
        setVerifiedProviders((prev) => {
          const next = new Set(prev);
          next.add(providerName);
          return next;
        });
      } catch {
        // Verification failed — provider still not available.
        // The button returns to its normal state so the user can retry.
      }
    },
    [onVerify]
  );

  // Auto-close is handled by isOpen becoming false when all are verified

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        size="lg"
        hideClose
        // Prevent closing on escape or pointer down outside
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />
            <DialogTitle>
              {isPlural ? 'Providers Not Installed' : 'Provider Not Installed'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {isPlural
              ? 'Some providers required by your agents are not installed. Install them and click "Verify Installation" to continue, or change affected agents to use an installed provider.'
              : 'A provider required by your agents is not installed. Install it and click "Verify Installation" to continue, or change affected agents to use an installed provider.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            {missingProviders.map((provider) => (
              <ProviderCard
                key={provider.name}
                provider={provider}
                availableProviders={availableProviders}
                onVerify={() => handleVerify(provider.name)}
                isVerifying={isVerifying(provider.name)}
                isVerified={verifiedProviders.has(provider.name)}
                onChangeProvider={onChangeProvider}
              />
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
