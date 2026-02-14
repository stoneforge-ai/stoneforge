/**
 * Option Card component for settings selections
 */

import { Check } from 'lucide-react';

interface OptionCardProps<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  testId: string;
}

export function OptionCard<T extends string>({
  label,
  description,
  icon: Icon,
  isSelected,
  onSelect,
  testId,
}: OptionCardProps<T>) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border transition-all text-left w-full min-h-[56px] active:scale-[0.98]
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700'
        }
      `}
      data-testid={testId}
    >
      <div className={`
        w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0
        ${isSelected
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }
      `}>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 sm:gap-2">
          <span className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </span>
          {isSelected && (
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{description}</p>
      </div>
    </button>
  );
}
