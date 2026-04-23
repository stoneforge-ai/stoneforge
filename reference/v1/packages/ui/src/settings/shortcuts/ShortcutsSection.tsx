/**
 * ShortcutsSection - Shared keyboard shortcuts settings component
 *
 * A complete keyboard shortcuts customization UI that can be used by any app.
 * Pass app-specific defaults to customize the available shortcuts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, X, AlertCircle, Check } from 'lucide-react';
import {
  getCurrentBinding,
  checkShortcutConflict,
  setCustomShortcut,
  resetAllShortcuts,
  getCustomShortcuts,
  useDisableKeyboardShortcuts,
  type ShortcutDefinition,
  type ShortcutCategory,
} from '../../hooks/useKeyboardShortcuts';
import { formatShortcutDisplay, CATEGORY_LABELS, groupShortcutsByCategory } from './utils';

interface ShortcutEditModalProps {
  actionId: string;
  description: string;
  currentKeys: string;
  defaultKeys: string;
  defaults: Record<string, ShortcutDefinition>;
  onSave: (keys: string) => void;
  onCancel: () => void;
  isMobile: boolean;
}

function ShortcutEditModal({
  actionId,
  description,
  currentKeys,
  defaultKeys,
  defaults,
  onSave,
  onCancel,
  isMobile,
}: ShortcutEditModalProps) {
  const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isCapturing) return;

    e.preventDefault();
    e.stopPropagation();

    const key = e.key.toLowerCase();

    // Ignore modifier keys alone
    if (['meta', 'control', 'alt', 'shift'].includes(key)) {
      return;
    }

    let newKeys: string[] = [];

    // Check for modifier shortcuts
    if (e.metaKey || e.ctrlKey) {
      const parts: string[] = [];
      if (e.metaKey) parts.push('Cmd');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      parts.push(key.toUpperCase());
      newKeys = [parts.join('+')];
    } else {
      // Sequential shortcut
      newKeys = [...capturedKeys, key.toUpperCase()];
    }

    const keysString = newKeys.join(' ');
    setCapturedKeys(newKeys);

    // Check for conflicts
    const conflictingAction = checkShortcutConflict(keysString, defaults, actionId);
    if (conflictingAction) {
      const conflictDescription = defaults[conflictingAction]?.description || conflictingAction;
      setConflict(conflictDescription);
    } else {
      setConflict(null);
    }
  }, [isCapturing, capturedKeys, actionId, defaults]);

  useEffect(() => {
    if (isCapturing) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isCapturing, handleKeyDown]);

  const handleStartCapture = () => {
    setCapturedKeys([]);
    setConflict(null);
    setIsCapturing(true);
    inputRef.current?.focus();
  };

  const handleStopCapture = () => {
    setIsCapturing(false);
  };

  const handleSave = () => {
    if (capturedKeys.length > 0 && !conflict) {
      onSave(capturedKeys.join(' '));
    }
  };

  const handleResetToDefault = () => {
    onSave(defaultKeys);
  };

  const displayKeys = capturedKeys.length > 0
    ? formatShortcutDisplay(capturedKeys.join(' '))
    : formatShortcutDisplay(currentKeys);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" data-testid="shortcut-edit-modal">
      <div className={`
        bg-white dark:bg-gray-800 shadow-xl w-full p-4 sm:p-6
        ${isMobile
          ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto pb-safe'
          : 'rounded-lg max-w-md'
        }
      `}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Shortcut</h3>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid="shortcut-edit-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>

        <div
          ref={inputRef}
          tabIndex={0}
          onClick={handleStartCapture}
          onBlur={handleStopCapture}
          className={`
            p-4 sm:p-6 rounded-lg border-2 text-center font-mono text-base sm:text-lg cursor-pointer transition-all min-h-[60px] flex items-center justify-center
            ${isCapturing
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
            }
            ${conflict ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}
          `}
          data-testid="shortcut-capture-area"
        >
          {isCapturing && capturedKeys.length === 0 ? (
            <span className="text-gray-400">Press keys...</span>
          ) : (
            <span className="text-gray-900 dark:text-gray-100">{displayKeys}</span>
          )}
        </div>

        {isCapturing && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Press a key combination. For sequential shortcuts, press keys one after another.
          </p>
        )}

        {conflict && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-red-600 dark:text-red-400" data-testid="shortcut-conflict-warning">
              Conflicts with: {conflict}
            </p>
          </div>
        )}

        <div className={`mt-6 ${isMobile ? 'space-y-3' : 'flex items-center justify-between'}`}>
          <button
            onClick={handleResetToDefault}
            className={`flex items-center justify-center gap-2 px-3 py-3 sm:py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 min-h-[44px] ${isMobile ? 'w-full border border-gray-200 dark:border-gray-700 rounded-lg' : ''}`}
            data-testid="shortcut-reset-default"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
          <div className={`flex gap-2 ${isMobile ? 'flex-col-reverse' : ''}`}>
            <button
              onClick={onCancel}
              className={`px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg min-h-[44px] ${isMobile ? 'w-full border border-gray-200 dark:border-gray-700' : ''}`}
              data-testid="shortcut-edit-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={capturedKeys.length === 0 || !!conflict}
              className={`px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 min-h-[44px] ${isMobile ? 'w-full' : ''}`}
              data-testid="shortcut-edit-save"
            >
              <Check className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ShortcutRowProps {
  actionId: string;
  description: string;
  currentKeys: string;
  isCustomized: boolean;
  onEdit: () => void;
  isMobile?: boolean;
}

function ShortcutRow({ actionId, description, currentKeys, isCustomized, onEdit, isMobile }: ShortcutRowProps) {
  return (
    <button
      onClick={onEdit}
      className={`
        w-full text-left py-3 px-3 sm:px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 rounded-lg group min-h-[56px]
        ${isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between'}
      `}
      data-testid={`shortcut-row-${actionId}`}
    >
      <div className={`${isMobile ? 'w-full' : 'flex-1'}`}>
        <span className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">{description}</span>
        {isCustomized && (
          <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
            Customized
          </span>
        )}
      </div>
      <div className={`flex items-center gap-3 ${isMobile ? 'w-full justify-between' : ''}`}>
        <kbd className="px-2 py-1 text-xs sm:text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700">
          {formatShortcutDisplay(currentKeys)}
        </kbd>
        <span
          className={`text-xs sm:text-sm text-blue-600 dark:text-blue-400 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}
        >
          {isMobile ? 'Edit' : 'Customize'}
        </span>
      </div>
    </button>
  );
}

export interface ShortcutsSectionProps {
  /** App-specific default shortcuts */
  defaults: Record<string, ShortcutDefinition>;
  /** Whether to use mobile-optimized layout */
  isMobile: boolean;
}

/**
 * Keyboard shortcuts settings section with customization support
 */
export function ShortcutsSection({ defaults, isMobile }: ShortcutsSectionProps) {
  const [customShortcuts, setCustomShortcutsState] = useState<Record<string, string>>({});
  const [editingShortcut, setEditingShortcut] = useState<{
    actionId: string;
    description: string;
    currentKeys: string;
    defaultKeys: string;
  } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Disable global keyboard shortcuts when modal is open
  useDisableKeyboardShortcuts(!!editingShortcut);

  // Load custom shortcuts on mount
  useEffect(() => {
    setCustomShortcutsState(getCustomShortcuts());
  }, []);

  const groups = groupShortcutsByCategory(defaults);

  const handleSaveShortcut = (keys: string) => {
    if (!editingShortcut) return;
    setCustomShortcut(editingShortcut.actionId, keys, defaults);
    setCustomShortcutsState(getCustomShortcuts());
    setEditingShortcut(null);
  };

  const handleResetAll = () => {
    resetAllShortcuts();
    setCustomShortcutsState({});
    setShowResetConfirm(false);
  };

  const hasCustomizations = Object.keys(customShortcuts).length > 0;

  return (
    <div data-testid="settings-shortcuts-section">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h3>
        {hasCustomizations && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 sm:py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 sm:border-0 min-h-[44px] sm:min-h-0"
            data-testid="shortcuts-reset-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        )}
      </div>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        View and customize keyboard shortcuts. {isMobile ? 'Tap' : 'Click "Customize"'} to change a shortcut.
      </p>

      {/* Shortcut Categories */}
      <div className="space-y-6">
        {(Object.entries(groups) as [ShortcutCategory, typeof groups[ShortcutCategory]][]).map(([category, shortcuts]) => {
          if (shortcuts.length === 0) return null;

          return (
            <div key={category}>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 px-4">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {shortcuts.map(({ actionId, description, defaultKeys }) => {
                  const currentKeys = getCurrentBinding(actionId, defaults);
                  const isCustomized = !!customShortcuts[actionId];

                  return (
                    <ShortcutRow
                      key={actionId}
                      actionId={actionId}
                      description={description}
                      currentKeys={currentKeys}
                      isCustomized={isCustomized}
                      onEdit={() => setEditingShortcut({ actionId, description, currentKeys, defaultKeys })}
                      isMobile={isMobile}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingShortcut && (
        <ShortcutEditModal
          actionId={editingShortcut.actionId}
          description={editingShortcut.description}
          currentKeys={editingShortcut.currentKeys}
          defaultKeys={editingShortcut.defaultKeys}
          defaults={defaults}
          onSave={handleSaveShortcut}
          onCancel={() => setEditingShortcut(null)}
          isMobile={isMobile}
        />
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" data-testid="reset-confirm-modal">
          <div className={`
            bg-white dark:bg-gray-800 shadow-xl w-full p-4 sm:p-6
            ${isMobile ? 'rounded-t-2xl' : 'rounded-lg max-w-sm'}
          `}>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Reset All Shortcuts?</h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
              This will reset all keyboard shortcuts to their default values. This action cannot be undone.
            </p>
            <div className={`flex gap-2 ${isMobile ? 'flex-col-reverse' : 'justify-end'}`}>
              <button
                onClick={() => setShowResetConfirm(false)}
                className={`px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg min-h-[44px] ${isMobile ? 'w-full border border-gray-200 dark:border-gray-700' : ''}`}
                data-testid="reset-confirm-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                className={`px-4 py-3 sm:py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg min-h-[44px] ${isMobile ? 'w-full' : ''}`}
                data-testid="reset-confirm-yes"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note about shortcuts */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Changes to keyboard shortcuts take effect immediately.
      </p>
    </div>
  );
}
