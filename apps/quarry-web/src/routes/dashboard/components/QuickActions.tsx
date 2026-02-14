/**
 * QuickActions - Dashboard quick action buttons
 * Provides shortcuts to common actions like creating tasks and workflows
 */

import { Link } from '@tanstack/react-router';
import { Plus, Zap, ListTodo } from 'lucide-react';
import { useShortcutVersion } from '../../../hooks';
import { getCurrentBinding } from '../../../lib/keyboard';

interface QuickActionsProps {
  onCreateTask: () => void;
  onCreateWorkflow: () => void;
}

export function QuickActions({ onCreateTask, onCreateWorkflow }: QuickActionsProps) {
  // Track shortcut changes to update badges
  useShortcutVersion();

  return (
    <div className="mt-8" data-testid="quick-actions">
      <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onCreateTask}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          data-testid="quick-action-create-task"
        >
          <Plus className="w-4 h-4" />
          Create Task
          <kbd className="ml-1 text-xs bg-blue-800/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createTask')}</kbd>
        </button>
        <button
          onClick={onCreateWorkflow}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          data-testid="quick-action-create-workflow"
        >
          <Zap className="w-4 h-4" />
          Create Workflow
          <kbd className="ml-1 text-xs bg-purple-800/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createWorkflow')}</kbd>
        </button>
        <Link
          to="/tasks"
          search={{ page: 1, limit: 25, readyOnly: true }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          data-testid="quick-action-view-tasks"
        >
          <ListTodo className="w-4 h-4" />
          View Ready Tasks
        </Link>
      </div>
    </div>
  );
}
