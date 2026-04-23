/**
 * Defaults Section component for settings
 */

import { useState, useEffect } from 'react';
import { List, LayoutGrid, Home, GitBranch, Clock, ArrowUp, Calendar, FileText } from 'lucide-react';
import type { DefaultsSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { getStoredDefaults, setStoredDefaults } from '../utils';
import { OptionCard } from './OptionCard';

interface DefaultsSectionProps {
  isMobile: boolean;
}

export function DefaultsSection({ isMobile: _isMobile }: DefaultsSectionProps) {
  const [defaults, setDefaults] = useState<DefaultsSettings>(DEFAULT_SETTINGS);

  // Load settings on mount
  useEffect(() => {
    setDefaults(getStoredDefaults());
  }, []);

  const updateSetting = <K extends keyof DefaultsSettings>(key: K, value: DefaultsSettings[K]) => {
    const newDefaults = { ...defaults, [key]: value };
    setDefaults(newDefaults);
    setStoredDefaults(newDefaults);
  };

  return (
    <div data-testid="settings-defaults-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Default Views</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Set default view preferences that will be applied when you first load pages.
      </p>

      {/* Tasks Default View */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Tasks View</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          Choose the default view when opening the Tasks page.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OptionCard
            value="list"
            label="List View"
            description="Traditional list layout with sorting"
            icon={List}
            isSelected={defaults.tasksView === 'list'}
            onSelect={() => updateSetting('tasksView', 'list')}
            testId="default-tasks-view-list"
          />
          <OptionCard
            value="kanban"
            label="Kanban View"
            description="Drag-and-drop board by status"
            icon={LayoutGrid}
            isSelected={defaults.tasksView === 'kanban'}
            onSelect={() => updateSetting('tasksView', 'kanban')}
            testId="default-tasks-view-kanban"
          />
        </div>
      </div>

      {/* Dashboard Default Lens */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Dashboard Lens</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          Choose the default dashboard view when navigating to the Dashboard.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OptionCard
            value="overview"
            label="Overview"
            description="Key metrics and quick actions"
            icon={Home}
            isSelected={defaults.dashboardLens === 'overview'}
            onSelect={() => updateSetting('dashboardLens', 'overview')}
            testId="default-dashboard-lens-overview"
          />
          <OptionCard
            value="dependencies"
            label="Dependencies"
            description="Visual dependency graph"
            icon={GitBranch}
            isSelected={defaults.dashboardLens === 'dependencies'}
            onSelect={() => updateSetting('dashboardLens', 'dependencies')}
            testId="default-dashboard-lens-dependencies"
          />
          <OptionCard
            value="timeline"
            label="Timeline"
            description="Chronological event feed"
            icon={Clock}
            isSelected={defaults.dashboardLens === 'timeline'}
            onSelect={() => updateSetting('dashboardLens', 'timeline')}
            testId="default-dashboard-lens-timeline"
          />
        </div>
      </div>

      {/* Default Sort Order */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Default Sort Order</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          Choose how lists are sorted by default across the application.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OptionCard
            value="updated_at"
            label="Last Updated"
            description="Most recently modified first"
            icon={Clock}
            isSelected={defaults.sortOrder === 'updated_at'}
            onSelect={() => updateSetting('sortOrder', 'updated_at')}
            testId="default-sort-updated"
          />
          <OptionCard
            value="created_at"
            label="Date Created"
            description="Newest items first"
            icon={Calendar}
            isSelected={defaults.sortOrder === 'created_at'}
            onSelect={() => updateSetting('sortOrder', 'created_at')}
            testId="default-sort-created"
          />
          <OptionCard
            value="priority"
            label="Priority"
            description="Highest priority first"
            icon={ArrowUp}
            isSelected={defaults.sortOrder === 'priority'}
            onSelect={() => updateSetting('sortOrder', 'priority')}
            testId="default-sort-priority"
          />
          <OptionCard
            value="title"
            label="Title"
            description="Alphabetical order"
            icon={FileText}
            isSelected={defaults.sortOrder === 'title'}
            onSelect={() => updateSetting('sortOrder', 'title')}
            testId="default-sort-title"
          />
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        These defaults apply when you first load a page. You can still change views temporarily at any time.
      </p>
    </div>
  );
}
