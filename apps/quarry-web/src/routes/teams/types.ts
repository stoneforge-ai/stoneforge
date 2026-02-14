/**
 * Types for the Teams page
 * Page-specific types for team-related operations
 */

export interface Team {
  id: string;
  type: 'team';
  name: string;
  members: string[];
  status?: 'active' | 'tombstone';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamStats {
  memberCount: number;
  totalTasksAssigned: number;
  activeTasksAssigned: number;
  completedTasksAssigned: number;
  createdByTeamMembers: number;
  tasksByMember: Record<string, { assigned: number; active: number; completed: number }>;
  workloadDistribution: { memberId: string; taskCount: number; percentage: number }[];
}

export interface UpdateTeamInput {
  name?: string;
  tags?: string[];
  addMembers?: string[];
  removeMembers?: string[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
