/**
 * Types for the dependency graph visualization
 */

import type { Node, Edge, Position } from '@xyflow/react';

export interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  tags: string[];
}

export interface DependencyTreeNode {
  element: Task;
  dependencies: DependencyTreeNode[];
  dependents: DependencyTreeNode[];
}

export interface DependencyTree {
  root: DependencyTreeNode;
  dependencyDepth: number;
  dependentDepth: number;
  nodeCount: number;
}

export interface Dependency {
  blockedId: string;
  blockerId: string;
  type: string;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface DependencyListResponse {
  dependencies: Dependency[];
  dependents: Dependency[];
}

export interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  isRoot: boolean;
  isHighlighted: boolean;
  isSearchMatch: boolean;
}

export interface CustomEdgeData extends Record<string, unknown> {
  dependencyType: string;
  showLabels: boolean;
}

export interface CustomEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  style?: React.CSSProperties;
  markerEnd?: string;
  data?: CustomEdgeData;
}

export interface GraphOptions {
  searchQuery: string;
  statusFilter: string[];
  showEdgeLabels: boolean;
}

// Layout types for auto-layout
export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';
export type LayoutAlgorithm = 'hierarchical' | 'force' | 'radial';

export interface LayoutOptions {
  algorithm: LayoutAlgorithm;
  direction: LayoutDirection;
  nodeSpacing: number;
  rankSpacing: number;
}

export interface GraphBuildResult {
  nodes: Node<TaskNodeData>[];
  edges: Edge<CustomEdgeData>[];
}
