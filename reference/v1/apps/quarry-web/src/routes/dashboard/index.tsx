/**
 * Dashboard Page - Main dashboard with overview metrics and quick actions
 *
 * Features:
 * - Key metrics overview (tasks, ready ratio, agents, completed today)
 * - Quick action buttons for common tasks
 * - Dashboard charts for visualization
 * - Ready tasks list
 * - Recent activity feed
 * - Elements by type breakdown
 * - System status display
 */

import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '../../components/shared';
import { DashboardCharts } from '../../components/dashboard/DashboardCharts';
import { useTrackDashboardSection } from '../../hooks/useTrackDashboardSection';
import { useGlobalQuickActions } from '../../hooks';
import { useStats, useHealth } from './hooks';
import {
  MetricsOverview,
  QuickActions,
  ReadyTasksList,
  RecentActivityFeed,
  ElementTypesBreakdown,
  SystemStatus,
} from './components';

export function DashboardPage() {
  // Track this dashboard section visit
  useTrackDashboardSection('overview');

  const stats = useStats();
  const health = useHealth();

  // Use global quick actions for C T and C W shortcuts
  const { openCreateTaskModal, openCreateWorkflowModal } = useGlobalQuickActions();

  return (
    <div data-testid="dashboard-page">
      <PageHeader
        title="Dashboard"
        icon={LayoutDashboard}
        iconColor="text-blue-500"
        testId="dashboard-header"
      />

      {/* Key Metrics Overview */}
      <MetricsOverview />

      {/* Quick Actions */}
      <QuickActions
        onCreateTask={openCreateTaskModal}
        onCreateWorkflow={openCreateWorkflowModal}
      />

      {/* Dashboard Charts */}
      <DashboardCharts />

      {/* Two-column layout for Ready Tasks and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {/* Ready Tasks List */}
        <ReadyTasksList />

        {/* Recent Activity Feed */}
        <RecentActivityFeed />
      </div>

      {/* Element Types Breakdown */}
      {stats.data && (
        <ElementTypesBreakdown elementsByType={stats.data.elementsByType} />
      )}

      {/* Server Info */}
      {health.data && (
        <SystemStatus health={health.data} />
      )}
    </div>
  );
}

// Default export for route
export default DashboardPage;
