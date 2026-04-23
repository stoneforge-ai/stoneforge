/**
 * Demo Mode Section component for settings
 *
 * Allows toggling demo mode, which switches all agents to the
 * opencode provider with the minimax-m2.5-free model.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Loader2, AlertCircle, Check, Users, Cpu, Server } from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';

interface DemoModeStatus {
  enabled: boolean;
  provider: string;
  model: string;
  savedConfigCount: number;
}

interface DemoModeResult {
  enabled: boolean;
  agentsUpdated: number;
  provider: string;
  model: string;
}

interface DemoModeSectionProps {
  isMobile: boolean;
}

export function DemoModeSection({ isMobile: _isMobile }: DemoModeSectionProps) {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<DemoModeResult | null>(null);

  // Fetch current demo mode status
  const {
    data: status,
    isLoading,
    isError: statusError,
  } = useQuery<DemoModeStatus>({
    queryKey: ['settings', 'demo-mode'],
    queryFn: async () => {
      const response = await fetch('/api/settings/demo-mode');
      if (!response.ok) throw new Error('Failed to fetch demo mode status');
      return response.json();
    },
    refetchInterval: 10000,
  });

  // Enable demo mode mutation
  const enableMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/settings/demo-mode/enable', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to enable demo mode');
      return response.json() as Promise<DemoModeResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['settings', 'demo-mode'] });
    },
  });

  // Disable demo mode mutation
  const disableMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/settings/demo-mode/disable', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to disable demo mode');
      return response.json() as Promise<DemoModeResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['settings', 'demo-mode'] });
    },
  });

  const isToggling = enableMutation.isPending || disableMutation.isPending;
  const toggleError = enableMutation.isError || disableMutation.isError;
  const isEnabled = status?.enabled ?? false;

  const handleToggle = () => {
    if (isToggling) return;
    setLastResult(null);
    if (isEnabled) {
      disableMutation.mutate();
    } else {
      enableMutation.mutate();
    }
  };

  return (
    <div data-testid="settings-demo-mode-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Demo Mode</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Enable demo mode to switch all agents to a free provider and model. Useful for demonstrations and testing without consuming API credits.
      </p>

      {/* Toggle Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">
                Enable Demo Mode
              </span>
              {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6">
              Switch all agents to opencode / minimax-m2.5-free
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          ) : (
            <ToggleSwitch
              enabled={isEnabled}
              onToggle={handleToggle}
              disabled={isToggling || statusError}
              testId="demo-mode-toggle"
            />
          )}
        </div>
      </div>

      {/* Status Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Status</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs sm:text-sm">Loading status...</span>
            </div>
          ) : statusError ? (
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs sm:text-sm">
                Demo mode service is not available. Make sure the server is running.
              </span>
            </div>
          ) : status ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Status</span>
                </div>
                <span
                  className={`text-xs sm:text-sm font-medium ${
                    status.enabled
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                  data-testid="demo-mode-status"
                >
                  {status.enabled ? 'Demo Mode Active' : 'Normal Mode'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Demo Provider</span>
                </div>
                <code
                  className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  data-testid="demo-mode-provider"
                >
                  {status.provider}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Demo Model</span>
                </div>
                <code
                  className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  data-testid="demo-mode-model"
                >
                  {status.model}
                </code>
              </div>
              {status.enabled && status.savedConfigCount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      Saved Configs
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400" data-testid="demo-mode-saved-count">
                    {status.savedConfigCount} agent{status.savedConfigCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Success/Error Feedback */}
      {lastResult && (
        <div
          className="mb-6 sm:mb-8 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
          data-testid="demo-mode-result"
        >
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium text-xs sm:text-sm">
              {lastResult.enabled ? 'Demo Mode Enabled' : 'Demo Mode Disabled'}
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 ml-6">
            {lastResult.enabled
              ? `${lastResult.agentsUpdated} agent${lastResult.agentsUpdated !== 1 ? 's' : ''} switched to ${lastResult.provider}/${lastResult.model}`
              : `${lastResult.agentsUpdated} agent${lastResult.agentsUpdated !== 1 ? 's' : ''} restored to previous configuration`}
          </p>
        </div>
      )}

      {toggleError && !lastResult && (
        <div className="mb-6 sm:mb-8 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-xs sm:text-sm">
              Failed to toggle demo mode. Please try again.
            </span>
          </div>
        </div>
      )}

      {/* Info Note */}
      <div className="p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> Enabling demo mode will override all agent provider/model settings.
          Previous configurations are saved and will be restored when demo mode is disabled.
        </p>
      </div>
    </div>
  );
}
