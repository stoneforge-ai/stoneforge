/**
 * Hooks for the Dashboard page
 * All data fetching hooks for dashboard-related operations
 */

import { useQuery } from '@tanstack/react-query';
import type { Task } from '../../components/entity';
import type { StatsResponse, HealthResponse, StoneforgeEvent, Entity } from './types';

/**
 * Fetch system-wide statistics
 */
export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });
}

/**
 * Fetch server health status with auto-refresh
 */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000,
  });
}

/**
 * Fetch tasks that are ready to be worked on
 */
export function useReadyTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'ready'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      return response.json();
    },
  });
}

/**
 * Fetch recent events for the activity feed with auto-refresh
 */
export function useRecentEvents() {
  return useQuery<StoneforgeEvent[]>({
    queryKey: ['events', 'recent'],
    queryFn: async () => {
      const response = await fetch('/api/events?limit=10');
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
    refetchInterval: 30000,
  });
}

/**
 * Fetch all entities
 */
export function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

/**
 * Fetch count of tasks completed today
 */
export function useCompletedTodayCount() {
  return useQuery<number>({
    queryKey: ['tasks', 'completedToday'],
    queryFn: async () => {
      const response = await fetch('/api/tasks');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const tasks = await response.json();

      // Get today's start timestamp
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.toISOString();

      // Count tasks completed today
      const completed = tasks.filter((task: Task & { closedAt?: string }) => {
        if (task.status !== 'closed') return false;
        const closedAt = task.closedAt || task.updatedAt;
        return closedAt >= todayStart;
      });

      return completed.length;
    },
  });
}
