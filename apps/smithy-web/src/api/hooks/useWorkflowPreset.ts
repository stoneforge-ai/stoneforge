/**
 * Workflow Preset Hook
 *
 * Fetches and updates the workspace workflow preset via the server API.
 * The preset is stored in the workspace config file (config.yaml) and
 * controls merge behavior and agent permissions.
 */

import { useState, useEffect, useCallback } from 'react';

export type WorkflowPreset = 'auto' | 'review' | 'approve';

export interface WorkflowPresetState {
  /** Current preset value, null if not yet selected */
  preset: WorkflowPreset | null;
  /** Whether the initial fetch is still loading */
  isLoading: boolean;
  /** Error message if fetch/update failed */
  error: string | null;
  /** Whether the preset has been selected (not null) */
  isConfigured: boolean;
  /** Set the workflow preset */
  setPreset: (preset: WorkflowPreset) => Promise<boolean>;
}

const API_BASE = '/api';

/**
 * Hook for managing the workspace workflow preset.
 *
 * Fetches the current preset on mount and provides a setter that
 * persists the choice to the server (config.yaml).
 */
export function useWorkflowPreset(): WorkflowPresetState {
  const [preset, setPresetState] = useState<WorkflowPreset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current preset on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchPreset() {
      try {
        const res = await fetch(`${API_BASE}/settings/workflow-preset`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json() as { preset: WorkflowPreset | null };
        if (!cancelled) {
          setPresetState(data.preset);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setIsLoading(false);
        }
      }
    }

    fetchPreset();
    return () => { cancelled = true; };
  }, []);

  // Update preset
  const setPreset = useCallback(async (newPreset: WorkflowPreset): Promise<boolean> => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/settings/workflow-preset`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: newPreset }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }
      setPresetState(newPreset);
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    }
  }, []);

  return {
    preset,
    isLoading,
    error,
    isConfigured: preset !== null,
    setPreset,
  };
}
