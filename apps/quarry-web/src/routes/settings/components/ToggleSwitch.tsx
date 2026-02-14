/**
 * Toggle Switch component for settings
 */

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId: string;
}

export function ToggleSwitch({ enabled, onToggle, disabled = false, testId }: ToggleSwitchProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        relative inline-flex h-7 w-12 sm:h-6 sm:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex-shrink-0
        ${enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      role="switch"
      aria-checked={enabled}
      data-testid={testId}
    >
      <span
        className={`
          inline-block h-5 w-5 sm:h-4 sm:w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6 sm:translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}
