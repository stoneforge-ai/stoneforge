/**
 * Types for the Agent Workspace View graph visualization
 */

import type { Node, Edge } from '@xyflow/react';
import type { Agent, SessionStatus, Task } from '../../api/types';

/**
 * Node types in the agent hierarchy graph
 */
export type AgentNodeType = 'human' | 'director' | 'worker' | 'steward';

/**
 * Data attached to agent nodes
 */
export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  nodeType: AgentNodeType;
  agent?: Agent;
  status?: SessionStatus | 'idle';
  currentTask?: Task | null;
  branch?: string;
  healthIndicator?: 'healthy' | 'warning' | 'error';
}

/**
 * Custom node type for the graph
 */
export type AgentNode = Node<AgentNodeData>;

/**
 * Edge data for relationships
 */
export interface AgentEdgeData extends Record<string, unknown> {
  relationship: 'reports-to' | 'supervises';
  animated?: boolean;
}

/**
 * Custom edge type for the graph
 */
export type AgentEdge = Edge<AgentEdgeData>;

/**
 * Layout positions for different node types
 */
export interface LayoutConfig {
  humanY: number;
  directorY: number;
  workerY: number;
  stewardY: number;
  nodeSpacing: number;
  centerX: number;
}

/**
 * Default layout configuration
 */
export const DEFAULT_LAYOUT: LayoutConfig = {
  humanY: 50,
  directorY: 200,
  workerY: 400,
  stewardY: 400,
  nodeSpacing: 200,
  centerX: 400,
};
