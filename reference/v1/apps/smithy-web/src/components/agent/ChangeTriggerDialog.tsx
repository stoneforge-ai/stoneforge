/**
 * ChangeTriggerDialog - Dialog for editing a steward agent's triggers
 *
 * Allows adding, editing, and removing cron and event triggers
 * for steward agents. Reuses trigger UI patterns from CreateAgentDialog.
 */

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Clock, Zap, Trash2 } from 'lucide-react';
import type { StewardTrigger } from '../../api/types';
import { useChangeAgentTriggers } from '../../api/hooks/useAgents';
import { CronScheduleBuilder } from './CronScheduleBuilder';

export interface ChangeTriggerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  currentTriggers: StewardTrigger[];
  onSuccess?: () => void;
}

export function ChangeTriggerDialog({
  isOpen,
  onClose,
  agentId,
  currentTriggers,
  onSuccess,
}: ChangeTriggerDialogProps) {
  const [triggers, setTriggers] = useState<StewardTrigger[]>(currentTriggers);
  const [error, setError] = useState<string | null>(null);
  const changeTriggers = useChangeAgentTriggers();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTriggers(currentTriggers.length > 0 ? [...currentTriggers] : []);
      setError(null);
    }
  }, [isOpen, currentTriggers]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const addCronTrigger = () => {
    setTriggers(prev => [...prev, { type: 'cron', schedule: '0 * * * *' }]);
  };

  const addEventTrigger = () => {
    setTriggers(prev => [...prev, { type: 'event', event: 'task_completed' }]);
  };

  const updateTrigger = (index: number, trigger: StewardTrigger) => {
    setTriggers(prev => prev.map((t, i) => (i === index ? trigger : t)));
  };

  const removeTrigger = (index: number) => {
    setTriggers(prev => prev.filter((_, i) => i !== index));
  };

  const hasChanged = JSON.stringify(triggers) !== JSON.stringify(currentTriggers);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate triggers
    for (const trigger of triggers) {
      if (trigger.type === 'cron' && !trigger.schedule.trim()) {
        setError('Cron trigger requires a schedule');
        return;
      }
      if (trigger.type === 'event' && !trigger.event.trim()) {
        setError('Event trigger requires an event name');
        return;
      }
    }

    if (!hasChanged) {
      handleClose();
      return;
    }

    try {
      await changeTriggers.mutateAsync({ agentId, triggers });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update triggers');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="change-triggers-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="
            w-full max-w-md
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
            max-h-[80vh] flex flex-col
          "
          data-testid={`agent-change-triggers-${agentId}`}
          role="dialog"
          aria-labelledby="change-triggers-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="change-triggers-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Change Triggers
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
              data-testid="change-triggers-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Trigger management */}
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
                    data-testid="change-triggers-add-cron"
                  >
                    <Clock className="w-3 h-3" />
                    Cron
                  </button>
                  <button
                    type="button"
                    onClick={addEventTrigger}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded transition-colors"
                    data-testid="change-triggers-add-event"
                  >
                    <Zap className="w-3 h-3" />
                    Event
                  </button>
                </div>
              </div>

              {triggers.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)] italic">
                  No triggers configured. Steward will only run manually.
                </p>
              ) : (
                <div className="space-y-2">
                  {triggers.map((trigger, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg"
                      data-testid={`change-triggers-trigger-${index}`}
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
                            testIdPrefix={`change-triggers-trigger-${index}-schedule`}
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
                            data-testid={`change-triggers-trigger-${index}-event`}
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
                            data-testid={`change-triggers-trigger-${index}-condition`}
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTrigger(index)}
                        className="p-1 text-[var(--color-text-tertiary)] hover:text-red-500 transition-colors"
                        aria-label="Remove trigger"
                        data-testid={`change-triggers-trigger-${index}-remove`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
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
                data-testid="change-triggers-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={changeTriggers.isPending || !hasChanged}
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
                data-testid="change-triggers-submit"
              >
                {changeTriggers.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    Save
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
