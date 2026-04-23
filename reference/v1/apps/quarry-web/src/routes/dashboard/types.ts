/**
 * Types for the Dashboard page
 * Page-specific types for dashboard data and API responses
 */

export interface StatsResponse {
  totalElements: number;
  elementsByType: Record<string, number>;
  totalDependencies: number;
  totalEvents: number;
  readyTasks: number;
  blockedTasks: number;
  databaseSize: number;
  computedAt: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
}

export interface StoneforgeEvent {
  id: number;
  elementId: string;
  elementType: string;
  eventType: string;
  actor: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

export interface Entity {
  id: string;
  name: string;
  entityType: 'agent' | 'human' | 'system';
  active?: boolean;
}
