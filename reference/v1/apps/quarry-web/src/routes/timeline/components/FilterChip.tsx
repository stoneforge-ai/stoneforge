/**
 * FilterChip component
 * Toggle chip for filtering events by type
 */

import { X } from 'lucide-react';

interface FilterChipProps {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  color?: { bg: string; text: string };
}

export function FilterChip({ label, icon: Icon, active, onClick, color }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      data-testid={`filter-chip-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`
        inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-full transition-all shrink-0
        ${active
          ? color
            ? `${color.bg} ${color.text} ring-2 ring-offset-1 ring-current`
            : 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
        }
      `}
    >
      {Icon && <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.length > 8 ? label.slice(0, 6) + '...' : label}</span>
      {active && <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
    </button>
  );
}
