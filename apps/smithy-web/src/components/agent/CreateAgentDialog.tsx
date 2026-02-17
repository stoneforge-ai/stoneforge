/**
 * CreateAgentDialog - Dialog for creating new agents and stewards
 *
 * Provides forms for creating:
 * - Director (strategic agent)
 * - Worker (ephemeral or persistent)
 * - Steward (merge, docs, custom)
 *
 * TB-O22: Steward Configuration UI
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Bot,
  Terminal,
  Radio,
  Plus,
  Trash2,
  Clock,
  Zap,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { CronScheduleBuilder } from './CronScheduleBuilder';
import type {
  AgentRole,
  WorkerMode,
  StewardFocus,
  StewardTrigger,
  CreateAgentInput,
  Agent,
} from '../../api/types';
import { useCreateAgent, useAgents, useProviders, useProviderModels } from '../../api/hooks/useAgents';
import { useAgentDefaultsSettings } from '../../api/hooks/useSettings';

export interface CreateAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-select a specific role (for "Create Steward" button) */
  initialRole?: AgentRole;
  /** Pre-select a steward focus */
  initialStewardFocus?: StewardFocus;
  /** Whether a Director already exists (prevents creating another) */
  hasDirector?: boolean;
  onSuccess?: (agent: { id: string; name: string }) => void;
}

const roleDescriptions: Record<AgentRole, { icon: typeof Bot; color: string; description: string }> = {
  director: {
    icon: Bot,
    color: 'purple',
    description: 'Strategic agent that creates and assigns tasks. One per workspace.',
  },
  worker: {
    icon: Terminal,
    color: 'blue',
    description: 'Execution agent that produces code and completes tasks.',
  },
  steward: {
    icon: Radio,
    color: 'amber',
    description: 'Support agent that performs automated maintenance tasks.',
  },
};

const stewardFocusOptions: Record<StewardFocus, { label: string; description: string }> = {
  merge: {
    label: 'Merge Steward',
    description: 'Handles merging completed branches, running tests, and cleanup.',
  },
  docs: {
    label: 'Documentation Steward',
    description: 'Reviews, updates, and maintains workspace documents.',
  },
  custom: {
    label: 'Custom Steward',
    description: 'User-defined steward with a custom playbook executed when triggers fire.',
  },
};

const workerModeOptions: Record<WorkerMode, { label: string; description: string }> = {
  ephemeral: {
    label: 'Ephemeral',
    description: 'Short-lived worker spawned per task, reports to Director.',
  },
  persistent: {
    label: 'Persistent',
    description: 'Long-lived worker that handles multiple tasks, human-supervised.',
  },
};

/**
 * Generate a suggested name for a new agent based on role, mode, and focus.
 *
 * Naming conventions:
 * - Director: "director" (only one allowed)
 * - Ephemeral workers: "e-worker-1", "e-worker-2", etc.
 * - Persistent workers: "p-worker-1", "p-worker-2", etc.
 * - Merge stewards: "m-steward-1", "m-steward-2", etc.
 * - Doc stewards: "d-steward-1", "d-steward-2", etc.
 */
function generateAgentName(
  role: AgentRole,
  workerMode: WorkerMode,
  stewardFocus: StewardFocus,
  existingAgents: Agent[]
): string {
  if (role === 'director') {
    return 'director';
  }

  // Determine prefix based on role and mode/focus
  let prefix: string;
  let baseName: string;

  if (role === 'worker') {
    prefix = workerMode === 'ephemeral' ? 'e-worker' : 'p-worker';
    baseName = prefix;
  } else {
    // Steward - use first letter of focus
    const focusPrefix = stewardFocus.charAt(0); // m, h, r, o
    prefix = `${focusPrefix}-steward`;
    baseName = prefix;
  }

  // Find existing agents with matching prefix pattern
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let maxNumber = 0;

  for (const agent of existingAgents) {
    const match = agent.name.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  return `${baseName}-${maxNumber + 1}`;
}

interface FormState {
  name: string;
  role: AgentRole;
  // Worker fields
  workerMode: WorkerMode;
  // Steward fields
  stewardFocus: StewardFocus;
  triggers: StewardTrigger[];
  // Custom steward playbook
  playbook: string;
  // Tags
  tags: string;
  // Provider
  provider: string;
  // Model override (empty string means use provider default)
  model: string;
}

const defaultState: FormState = {
  name: '',
  role: 'steward',
  workerMode: 'ephemeral',
  stewardFocus: 'merge',
  triggers: [],
  playbook: '',
  tags: '',
  provider: 'claude',
  model: '',
};

export function CreateAgentDialog({
  isOpen,
  onClose,
  initialRole,
  initialStewardFocus,
  hasDirector = false,
  onSuccess,
}: CreateAgentDialogProps) {
  // Fetch existing agents to determine sequential naming
  const { data: agentsData } = useAgents();
  const existingAgents = useMemo(() => agentsData?.agents ?? [], [agentsData?.agents]);

  // Fetch available providers
  const { data: providersData } = useProviders();
  const providers = useMemo(() => providersData?.providers ?? [], [providersData?.providers]);
  const hasMultipleProviders = providers.length > 1;

  // Load agent defaults from settings
  const { settings: agentDefaults } = useAgentDefaultsSettings();

  const [form, setForm] = useState<FormState>({
    ...defaultState,
    role: initialRole ?? 'steward',
    stewardFocus: initialStewardFocus ?? 'merge',
    provider: agentDefaults.defaultProvider || 'claude',
    model: agentDefaults.defaultModels[agentDefaults.defaultProvider] ?? '',
  });

  // Fetch models for the selected provider (must be after form state declaration)
  const { data: modelsData, isLoading: modelsLoading } = useProviderModels(form.provider);
  const allModels = useMemo(() => modelsData?.models ?? [], [modelsData?.models]);
  const defaultModel = useMemo(() => allModels.find(m => m.isDefault), [allModels]);
  // Filter out the default model — it's already shown in the "Default (...)" option
  const models = useMemo(() => allModels.filter(m => !m.isDefault), [allModels]);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether user has manually edited the name
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  // Generate suggested name based on current role/mode/focus
  const generateSuggestedName = useCallback(() => {
    return generateAgentName(form.role, form.workerMode, form.stewardFocus, existingAgents);
  }, [form.role, form.workerMode, form.stewardFocus, existingAgents]);

  // Auto-fill name when dialog opens or when role/mode/focus changes
  useEffect(() => {
    if (isOpen && !nameManuallyEdited) {
      const suggestedName = generateSuggestedName();
      setForm(prev => ({ ...prev, name: suggestedName }));
    }
  }, [isOpen, generateSuggestedName, nameManuallyEdited]);

  // Reset manual edit flag when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setNameManuallyEdited(false);
    }
  }, [isOpen]);

  // Apply agent default settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      setForm(prev => ({
        ...prev,
        provider: agentDefaults.defaultProvider || prev.provider,
        model: agentDefaults.defaultModels[agentDefaults.defaultProvider] ?? '',
      }));
    }
  }, [isOpen, agentDefaults.defaultProvider, agentDefaults.defaultModels]);

  const createAgent = useCreateAgent();

  if (!isOpen) return null;

  const handleClose = () => {
    setForm({
      ...defaultState,
      role: initialRole ?? 'steward',
      stewardFocus: initialStewardFocus ?? 'merge',
      provider: agentDefaults.defaultProvider || 'claude',
      model: agentDefaults.defaultModels[agentDefaults.defaultProvider] ?? '',
    });
    setError(null);
    setNameManuallyEdited(false);
    onClose();
  };

  // Handler for provider change - apply default model from settings for the new provider
  const handleProviderChange = (newProvider: string) => {
    const defaultModelForProvider = agentDefaults.defaultModels[newProvider] ?? '';
    setForm(prev => ({ ...prev, provider: newProvider, model: defaultModelForProvider }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    if (form.role === 'steward' && form.stewardFocus === 'custom' && !form.playbook.trim()) {
      setError('Playbook is required for custom stewards');
      return;
    }

    // Build input
    const input: CreateAgentInput = {
      name: form.name.trim(),
      role: form.role,
      tags: form.tags.trim() ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      provider: form.provider !== 'claude' ? form.provider : undefined,
      model: form.model || undefined, // Only include if not empty (not using default)
    };

    // Add role-specific fields
    if (form.role === 'worker') {
      input.workerMode = form.workerMode;
    } else if (form.role === 'steward') {
      input.stewardFocus = form.stewardFocus;
      if (form.triggers.length > 0) {
        input.triggers = form.triggers;
      }
      if (form.stewardFocus === 'custom' && form.playbook.trim()) {
        input.playbook = form.playbook.trim();
      }
    }

    try {
      const result = await createAgent.mutateAsync(input);
      onSuccess?.({ id: result.agent.id, name: result.agent.name });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    }
  };

  const addCronTrigger = () => {
    setForm(prev => ({
      ...prev,
      triggers: [...prev.triggers, { type: 'cron', schedule: '0 * * * *' }],
    }));
  };

  const addEventTrigger = () => {
    setForm(prev => ({
      ...prev,
      triggers: [...prev.triggers, { type: 'event', event: 'task_completed' }],
    }));
  };

  const updateTrigger = (index: number, trigger: StewardTrigger) => {
    setForm(prev => ({
      ...prev,
      triggers: prev.triggers.map((t, i) => (i === index ? trigger : t)),
    }));
  };

  const removeTrigger = (index: number) => {
    setForm(prev => ({
      ...prev,
      triggers: prev.triggers.filter((_, i) => i !== index),
    }));
  };

  const roleConfig = roleDescriptions[form.role];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="create-agent-backdrop"
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
          data-testid="create-agent-dialog"
          role="dialog"
          aria-labelledby="create-agent-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="create-agent-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Create {form.role === 'steward' ? 'Steward' : form.role === 'worker' ? 'Worker' : 'Agent'}
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
              data-testid="create-agent-close"
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

            {/* Role selector (only if not pre-selected) */}
            {!initialRole && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--color-text)]">
                  Agent Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(roleDescriptions) as AgentRole[]).map(role => {
                    const config = roleDescriptions[role];
                    const Icon = config.icon;
                    const isSelected = form.role === role;
                    const isDisabled = role === 'director' && hasDirector;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => !isDisabled && setForm(prev => ({ ...prev, role }))}
                        disabled={isDisabled}
                        className={`
                          flex flex-col items-center gap-2 p-3 rounded-lg border transition-all
                          ${isDisabled
                            ? 'opacity-50 cursor-not-allowed border-[var(--color-border)] bg-[var(--color-surface)]'
                            : isSelected
                              ? `border-${config.color}-500 bg-${config.color}-50 dark:bg-${config.color}-900/20`
                              : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
                          }
                        `}
                        title={isDisabled ? 'A Director already exists. Use the menu on the existing Director card to rename it.' : undefined}
                        data-testid={`role-${role}`}
                      >
                        <Icon className={`w-6 h-6 ${isDisabled ? 'text-[var(--color-text-tertiary)]' : isSelected ? `text-${config.color}-600 dark:text-${config.color}-400` : 'text-[var(--color-text-secondary)]'}`} />
                        <span className={`text-sm font-medium capitalize ${isDisabled ? 'text-[var(--color-text-tertiary)]' : isSelected ? `text-${config.color}-700 dark:text-${config.color}-300` : 'text-[var(--color-text)]'}`}>
                          {role}
                        </span>
                        {isDisabled && (
                          <span className="text-xs text-[var(--color-text-tertiary)]">(exists)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {roleConfig.description}
                </p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1">
              <label htmlFor="agent-name" className="text-sm font-medium text-[var(--color-text)]">
                Name
              </label>
              <input
                id="agent-name"
                type="text"
                value={form.name}
                onChange={e => {
                  setNameManuallyEdited(true);
                  setForm(prev => ({ ...prev, name: e.target.value }));
                }}
                placeholder={`e.g., ${form.role === 'steward' ? 'Merge Bot' : form.role === 'worker' ? 'Alice' : 'Director'}`}
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
                data-testid="agent-name"
              />
            </div>

            {/* Worker-specific: Mode */}
            {form.role === 'worker' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--color-text)]">
                  Worker Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(workerModeOptions) as WorkerMode[]).map(mode => {
                    const config = workerModeOptions[mode];
                    const isSelected = form.workerMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, workerMode: mode }))}
                        className={`
                          flex items-center gap-2 p-3 rounded-lg border text-left transition-all
                          ${isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
                          }
                        `}
                        data-testid={`worker-mode-${mode}`}
                      >
                        {mode === 'ephemeral' ? (
                          <Zap className={`w-5 h-5 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--color-text-secondary)]'}`} />
                        ) : (
                          <Terminal className={`w-5 h-5 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--color-text-secondary)]'}`} />
                        )}
                        <div>
                          <div className={`text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-[var(--color-text)]'}`}>
                            {config.label}
                          </div>
                          <div className="text-xs text-[var(--color-text-tertiary)]">
                            {config.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Steward-specific: Focus */}
            {form.role === 'steward' && (
              <div className="space-y-2">
                <label htmlFor="steward-focus" className="text-sm font-medium text-[var(--color-text)]">
                  Focus Area
                </label>
                <div className="relative">
                  <select
                    id="steward-focus"
                    value={form.stewardFocus}
                    onChange={e => setForm(prev => ({ ...prev, stewardFocus: e.target.value as StewardFocus }))}
                    className="
                      w-full px-3 py-2 pr-8
                      text-sm
                      bg-[var(--color-surface)]
                      border border-[var(--color-border)]
                      rounded-lg
                      appearance-none
                      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                    "
                    data-testid="steward-focus"
                  >
                    {(Object.keys(stewardFocusOptions) as StewardFocus[]).map(focus => (
                      <option key={focus} value={focus}>
                        {stewardFocusOptions[focus].label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {stewardFocusOptions[form.stewardFocus].description}
                </p>
              </div>
            )}

            {/* Custom Steward: Playbook */}
            {form.role === 'steward' && form.stewardFocus === 'custom' && (
              <div className="space-y-2">
                <label htmlFor="steward-playbook" className="text-sm font-medium text-[var(--color-text)]">
                  Playbook
                </label>
                <textarea
                  id="steward-playbook"
                  value={form.playbook}
                  onChange={e => setForm(prev => ({ ...prev, playbook: e.target.value }))}
                  placeholder="Describe what this steward should do when triggered. Supports markdown.&#10;&#10;Example:&#10;1. Check for stale branches older than 7 days&#10;2. Post a reminder message to the branch owner&#10;3. Archive branches with no activity for 30 days"
                  rows={6}
                  className="
                    w-full px-3 py-2
                    text-sm font-mono
                    bg-[var(--color-surface)]
                    border border-[var(--color-border)]
                    rounded-lg
                    placeholder:text-[var(--color-text-tertiary)]
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                    resize-y
                  "
                  data-testid="steward-playbook"
                />
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  The playbook defines the steward&apos;s behavior when its triggers fire. Use markdown to describe the workflow steps.
                </p>
              </div>
            )}

            {/* Steward-specific: Triggers */}
            {form.role === 'steward' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--color-text)]">
                    Triggers
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={addCronTrigger}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded transition-colors"
                      data-testid="add-cron-trigger"
                    >
                      <Clock className="w-3 h-3" />
                      Cron
                    </button>
                    <button
                      type="button"
                      onClick={addEventTrigger}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded transition-colors"
                      data-testid="add-event-trigger"
                    >
                      <Zap className="w-3 h-3" />
                      Event
                    </button>
                  </div>
                </div>
                {form.triggers.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-tertiary)] italic">
                    No triggers configured. Steward will only run manually.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.triggers.map((trigger, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg"
                        data-testid={`trigger-${index}`}
                      >
                        {trigger.type === 'cron' ? (
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-[var(--color-text-secondary)]" />
                              <span className="text-xs font-medium text-[var(--color-text-secondary)]">Cron Schedule</span>
                            </div>
                            <CronScheduleBuilder
                              value={trigger.schedule}
                              onChange={schedule => updateTrigger(index, { ...trigger, schedule })}
                              testIdPrefix={`trigger-${index}-schedule`}
                            />
                          </div>
                        ) : (
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-[var(--color-text-secondary)]" />
                              <span className="text-xs font-medium text-[var(--color-text-secondary)]">Event</span>
                            </div>
                            <input
                              type="text"
                              value={trigger.event}
                              onChange={e => updateTrigger(index, { ...trigger, event: e.target.value })}
                              placeholder="task_completed"
                              className="
                                w-full px-2 py-1
                                text-xs
                                bg-[var(--color-bg)]
                                border border-[var(--color-border)]
                                rounded
                                focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                              "
                              data-testid={`trigger-${index}-event`}
                            />
                            <input
                              type="text"
                              value={trigger.condition ?? ''}
                              onChange={e => updateTrigger(index, { ...trigger, condition: e.target.value || undefined })}
                              placeholder="Condition (optional)"
                              className="
                                w-full px-2 py-1
                                text-xs
                                bg-[var(--color-bg)]
                                border border-[var(--color-border)]
                                rounded
                                focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                              "
                              data-testid={`trigger-${index}-condition`}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeTrigger(index)}
                          className="p-1 text-[var(--color-text-tertiary)] hover:text-red-500 transition-colors"
                          aria-label="Remove trigger"
                          data-testid={`trigger-${index}-remove`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settings (collapsible) */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowCapabilities(!showCapabilities)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                data-testid="toggle-capabilities"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showCapabilities ? 'rotate-180' : ''}`} />
                Settings & Tags
              </button>
              {showCapabilities && (
                <div className="space-y-3 pl-6">
                  <div className="space-y-1">
                    <label htmlFor="agent-tags" className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Tags (comma-separated)
                    </label>
                    <input
                      id="agent-tags"
                      type="text"
                      value={form.tags}
                      onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="e.g., team-alpha, high-priority"
                      className="
                        w-full px-3 py-1.5
                        text-sm
                        bg-[var(--color-surface)]
                        border border-[var(--color-border)]
                        rounded-lg
                        placeholder:text-[var(--color-text-tertiary)]
                        focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                      "
                      data-testid="agent-tags"
                    />
                  </div>
                  {hasMultipleProviders && (
                    <div className="space-y-1">
                      <label htmlFor="agent-provider" className="text-xs font-medium text-[var(--color-text-secondary)]">
                        Provider
                      </label>
                      <div className="relative">
                        <select
                          id="agent-provider"
                          value={form.provider}
                          onChange={e => handleProviderChange(e.target.value)}
                          className="
                            w-full px-3 py-1.5 pr-8
                            text-sm
                            bg-[var(--color-surface)]
                            border border-[var(--color-border)]
                            rounded-lg
                            appearance-none
                            focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                          "
                          data-testid="agent-provider"
                        >
                          {providers.map(p => (
                            <option key={p.name} value={p.name} disabled={!p.available}>
                              {p.name}{!p.available ? ' (not installed)' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
                      </div>
                    </div>
                  )}
                  {/* Model selector */}
                  <div className="space-y-1">
                    <label htmlFor="agent-model" className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Model
                    </label>
                    <div className="relative">
                      {modelsLoading ? (
                        <div className="flex items-center gap-2 py-1.5 text-xs text-[var(--color-text-tertiary)]">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading models...
                        </div>
                      ) : (
                        <select
                          id="agent-model"
                          value={form.model}
                          onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
                          disabled={!form.provider}
                          className="
                            w-full px-3 py-1.5 pr-8
                            text-sm
                            bg-[var(--color-surface)]
                            border border-[var(--color-border)]
                            rounded-lg
                            appearance-none
                            focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                            disabled:opacity-50 disabled:cursor-not-allowed
                          "
                          data-testid="agent-model"
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
                      {!modelsLoading && (
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
                      )}
                    </div>
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
                data-testid="cancel-create-agent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createAgent.isPending || !form.name.trim() || (form.role === 'steward' && form.stewardFocus === 'custom' && !form.playbook.trim())}
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
                data-testid="submit-create-agent"
              >
                {createAgent.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create {form.role === 'steward' ? 'Steward' : form.role === 'worker' ? 'Worker' : 'Agent'}
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
