/**
 * Coming Soon Section component for unimplemented settings
 */

import type { SectionNavItem } from '../types';

interface ComingSoonSectionProps {
  section: SectionNavItem;
}

export function ComingSoonSection({ section }: ComingSoonSectionProps) {
  const Icon = section.icon;

  return (
    <div className="text-center py-12" data-testid={`settings-${section.id}-section`}>
      <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <Icon className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        {section.label}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {section.description} settings are coming soon.
      </p>
    </div>
  );
}
