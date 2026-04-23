/**
 * Utility functions for the dependency graph
 * Includes layout algorithms and graph building
 */

import type { Node, Edge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import dagre from 'dagre';
import type {
  Task,
  TaskNodeData,
  CustomEdgeData,
  DependencyTree,
  DependencyTreeNode,
  DependencyListResponse,
  GraphOptions,
  LayoutOptions,
  GraphBuildResult,
} from './types';
import { getEdgeColor, DEFAULT_LAYOUT_OPTIONS } from './constants';

// Storage key for layout options
const LAYOUT_STORAGE_KEY = 'dependency-graph-layout';

/**
 * Load layout options from localStorage
 */
export function loadLayoutOptions(): LayoutOptions {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_LAYOUT_OPTIONS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_LAYOUT_OPTIONS;
}

/**
 * Save layout options to localStorage
 */
export function saveLayoutOptions(options: LayoutOptions): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Apply dagre (hierarchical) layout to nodes
 */
export function applyDagreLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // Configure the graph direction
  g.setGraph({
    rankdir: options.direction,
    nodesep: options.nodeSpacing,
    ranksep: options.rankSpacing,
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to dagre
  const nodeWidth = 200;
  const nodeHeight = 100;
  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Compute the layout
  dagre.layout(g);

  // Apply computed positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (nodeWithPosition) {
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    }
    return node;
  });
}

/**
 * Apply force-directed layout (simulation-based positioning)
 */
export function applyForceLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();

  // Initialize positions in a grid
  const gridSize = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((node, i) => {
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    positions.set(node.id, {
      x: col * options.nodeSpacing * 2 + Math.random() * 50,
      y: row * options.rankSpacing + Math.random() * 50,
      vx: 0,
      vy: 0,
    });
  });

  // Build adjacency for repulsion calculation
  const edgeMap = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, new Set());
    if (!edgeMap.has(edge.target)) edgeMap.set(edge.target, new Set());
    edgeMap.get(edge.source)!.add(edge.target);
    edgeMap.get(edge.target)!.add(edge.source);
  });

  // Run simulation for a fixed number of iterations
  const iterations = 50;
  const springStrength = 0.1;
  const repulsionStrength = 5000;
  const dampening = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    const nodeList = Array.from(positions.entries());

    // Repulsion between all nodes
    for (let i = 0; i < nodeList.length; i++) {
      const [id1, pos1] = nodeList[i];
      for (let j = i + 1; j < nodeList.length; j++) {
        const [id2, pos2] = nodeList[j];
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsionStrength / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos1.vx += fx;
        pos1.vy += fy;
        pos2.vx -= fx;
        pos2.vy -= fy;
        positions.set(id1, pos1);
        positions.set(id2, pos2);
      }
    }

    // Spring attraction along edges
    edges.forEach((edge) => {
      const pos1 = positions.get(edge.source);
      const pos2 = positions.get(edge.target);
      if (pos1 && pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - options.rankSpacing) * springStrength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos1.vx += fx;
        pos1.vy += fy;
        pos2.vx -= fx;
        pos2.vy -= fy;
        positions.set(edge.source, pos1);
        positions.set(edge.target, pos2);
      }
    });

    // Apply velocities and dampen
    positions.forEach((pos, id) => {
      pos.x += pos.vx;
      pos.y += pos.vy;
      pos.vx *= dampening;
      pos.vy *= dampening;
      positions.set(id, pos);
    });
  }

  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (pos) {
      return {
        ...node,
        position: { x: pos.x, y: pos.y },
      };
    }
    return node;
  });
}

/**
 * Apply radial layout (root in center, dependencies radiating outward)
 */
export function applyRadialLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  // Find the root node (marked in data)
  const rootNode = nodes.find((n) => (n.data as TaskNodeData).isRoot);
  if (!rootNode || nodes.length <= 1) {
    // Fallback to dagre if no root or single node
    return applyDagreLayout(nodes, edges, options);
  }

  // Build adjacency list for BFS
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((edge) => {
    if (adjacency.has(edge.source)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
    if (adjacency.has(edge.target)) {
      adjacency.get(edge.target)!.push(edge.source);
    }
  });

  // BFS from root to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = [rootNode.id];
  levels.set(rootNode.id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current)!;
    const neighbors = adjacency.get(current) || [];

    for (const neighbor of neighbors) {
      if (!levels.has(neighbor)) {
        levels.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, string[]>();
  let maxLevel = 0;
  levels.forEach((level, id) => {
    if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
    nodesByLevel.get(level)!.push(id);
    maxLevel = Math.max(maxLevel, level);
  });

  // Position nodes in concentric circles
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = 0;
  const centerY = 0;

  // Root at center
  positions.set(rootNode.id, { x: centerX, y: centerY });

  // Other levels in concentric circles
  for (let level = 1; level <= maxLevel; level++) {
    const nodesAtLevel = nodesByLevel.get(level) || [];
    const radius = level * options.rankSpacing;
    const angleStep = (2 * Math.PI) / nodesAtLevel.length;

    nodesAtLevel.forEach((id, index) => {
      const angle = index * angleStep - Math.PI / 2; // Start from top
      positions.set(id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });
  }

  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (pos) {
      return {
        ...node,
        position: { x: pos.x - 100, y: pos.y - 50 }, // Offset by half node size
      };
    }
    return node;
  });
}

/**
 * Main layout function that dispatches to the appropriate algorithm
 */
export function applyAutoLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  if (nodes.length === 0) return nodes;

  switch (options.algorithm) {
    case 'force':
      return applyForceLayout(nodes, edges, options);
    case 'radial':
      return applyRadialLayout(nodes, edges, options);
    case 'hierarchical':
    default:
      return applyDagreLayout(nodes, edges, options);
  }
}

/**
 * Build a map of dependency types for quick lookup
 */
export function buildDependencyTypeMap(depList: DependencyListResponse | undefined): Map<string, string> {
  const typeMap = new Map<string, string>();
  if (!depList) return typeMap;

  // Map dependencies (outgoing from selected node)
  for (const dep of depList.dependencies) {
    const key = `${dep.blockedId}->${dep.blockerId}`;
    typeMap.set(key, dep.type);
  }

  // Map dependents (incoming to selected node)
  for (const dep of depList.dependents) {
    const key = `${dep.blockedId}->${dep.blockerId}`;
    typeMap.set(key, dep.type);
  }

  return typeMap;
}

/**
 * Build React Flow graph from dependency tree
 */
export function buildGraphFromTree(
  tree: DependencyTree,
  options: GraphOptions,
  dependencyTypeMap: Map<string, string>
): GraphBuildResult {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge<CustomEdgeData>[] = [];
  const visited = new Set<string>();

  const { searchQuery, statusFilter, showEdgeLabels } = options;
  const hasSearch = searchQuery.trim().length > 0;
  const hasStatusFilter = statusFilter.length > 0;
  const hasAnyFilter = hasSearch || hasStatusFilter;

  // Check if a task matches the search query
  function matchesSearch(task: Task): boolean {
    if (!hasSearch) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(query) ||
      task.id.toLowerCase().includes(query)
    );
  }

  // Check if a task matches the status filter
  function matchesStatus(task: Task): boolean {
    if (!hasStatusFilter) return true;
    return statusFilter.includes(task.status);
  }

  // Check if a task matches all filters
  function matchesFilters(task: Task): boolean {
    return matchesSearch(task) && matchesStatus(task);
  }

  // Helper to recursively add nodes and edges
  function processNode(
    node: DependencyTreeNode,
    level: number,
    position: number,
    direction: 'up' | 'down' | 'root'
  ) {
    if (visited.has(node.element.id)) return;
    visited.add(node.element.id);

    // Calculate Y position based on level
    const y = direction === 'up' ? -level * 150 : level * 150;
    const x = position * 250;

    const isMatch = matchesFilters(node.element);
    const isSearchMatch = hasSearch && matchesSearch(node.element);

    nodes.push({
      id: node.element.id,
      type: 'task',
      position: { x, y },
      data: {
        task: node.element,
        isRoot: direction === 'root',
        isHighlighted: !hasAnyFilter || isMatch,
        isSearchMatch: isSearchMatch,
      },
    });

    // Process dependencies (nodes this task depends on - above)
    node.dependencies.forEach((dep, i) => {
      if (!visited.has(dep.element.id)) {
        processNode(dep, level + 1, position + i - Math.floor(node.dependencies.length / 2), 'up');
      }
      const edgeId = `${node.element.id}->${dep.element.id}`;
      const depType = dependencyTypeMap.get(edgeId) || 'blocks';
      const edgeColors = getEdgeColor(depType);
      edges.push({
        id: edgeId,
        source: node.element.id,
        target: dep.element.id,
        type: 'custom',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors.stroke },
        style: { stroke: edgeColors.stroke },
        data: {
          dependencyType: depType,
          showLabels: showEdgeLabels,
        },
      });
    });

    // Process dependents (nodes that depend on this task - below)
    node.dependents.forEach((dep, i) => {
      if (!visited.has(dep.element.id)) {
        processNode(dep, level + 1, position + i - Math.floor(node.dependents.length / 2), 'down');
      }
      const edgeId = `${dep.element.id}->${node.element.id}`;
      const depType = dependencyTypeMap.get(edgeId) || 'blocks';
      const edgeColors = getEdgeColor(depType);
      edges.push({
        id: edgeId,
        source: dep.element.id,
        target: node.element.id,
        type: 'custom',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors.stroke },
        style: { stroke: edgeColors.stroke },
        data: {
          dependencyType: depType,
          showLabels: showEdgeLabels,
        },
      });
    });
  }

  processNode(tree.root, 0, 0, 'root');

  return { nodes, edges };
}
