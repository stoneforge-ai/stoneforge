/**
 * MetricsOverview - Key metrics display for the dashboard
 * Shows total tasks, ready vs blocked ratio, active agents, and completed today
 */

import { ListTodo, CheckCircle, Bot, Clock } from 'lucide-react';
import { useStats, useEntities, useCompletedTodayCount } from '../hooks';

export function MetricsOverview() {
  const stats = useStats();
  const entities = useEntities();
  const completedToday = useCompletedTodayCount();

  // Calculate active agents
  const activeAgents = (entities.data || []).filter(
    (e) => e.entityType === 'agent' && e.active !== false
  ).length;

  // Calculate ready vs blocked ratio
  const readyCount = stats.data?.readyTasks || 0;
  const blockedCount = stats.data?.blockedTasks || 0;
  const totalTasks = readyCount + blockedCount;
  const readyRatio = totalTasks > 0 ? Math.round((readyCount / totalTasks) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6" data-testid="metrics-overview">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-total-tasks">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
            <ListTodo className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Total Tasks</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.isLoading ? '...' : totalTasks}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-ready-ratio">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Ready vs Blocked</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.isLoading ? '...' : `${readyRatio}%`}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{readyCount} ready, {blockedCount} blocked</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-active-agents">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 shrink-0">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Active Agents</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {entities.isLoading ? '...' : activeAgents}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-completed-today">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30 shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Completed Today</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {completedToday.isLoading ? '...' : completedToday.data || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
