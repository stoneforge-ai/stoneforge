/**
 * API hooks for the dependency graph
 */

import { useQuery } from '@tanstack/react-query';
import type { Task, DependencyTree, DependencyListResponse } from './types';

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

export function useBlockedTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'blocked'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/blocked');
      if (!response.ok) throw new Error('Failed to fetch blocked tasks');
      return response.json();
    },
  });
}

export function useDependencyTree(taskId: string | null) {
  return useQuery<DependencyTree>({
    queryKey: ['dependencies', 'tree', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/dependencies/${taskId}/tree`);
      if (!response.ok) throw new Error('Failed to fetch dependency tree');
      return response.json();
    },
    enabled: !!taskId,
  });
}

// Fetch actual dependency relationships with type information
export function useDependencyList(taskId: string | null) {
  return useQuery<DependencyListResponse>({
    queryKey: ['dependencies', 'list', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/dependencies/${taskId}`);
      if (!response.ok) throw new Error('Failed to fetch dependencies');
      return response.json();
    },
    enabled: !!taskId,
  });
}
