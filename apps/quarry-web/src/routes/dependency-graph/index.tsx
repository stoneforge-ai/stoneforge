/**
 * Dependency Graph Lens
 *
 * Read-only visualization of task dependencies using React Flow.
 * Dependencies are managed via the Task detail panel.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNodesState, useEdgesState, ReactFlowProvider, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network } from 'lucide-react';
import { useTrackDashboardSection } from '../../hooks/useTrackDashboardSection';
import { PageHeader } from '../../components/shared';

import type { Task, TaskNodeData, LayoutOptions } from './types';
import {
  useReadyTasks,
  useBlockedTasks,
  useDependencyTree,
  useDependencyList,
} from './hooks';
import {
  loadLayoutOptions,
  saveLayoutOptions,
  applyAutoLayout,
  buildDependencyTypeMap,
  buildGraphFromTree,
} from './utils';
import {
  TaskSelector,
  DependencyGraphInner,
  GraphLegend,
} from './components';

export function DependencyGraphPage() {
  // Track this dashboard section visit
  useTrackDashboardSection('dependencies');

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TaskNodeData>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Edge label visibility state (default: true)
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);

  // Layout state (persisted in localStorage)
  const [layoutOptions, setLayoutOptions] = useState<LayoutOptions>(loadLayoutOptions);
  const [isLayouting, setIsLayouting] = useState(false);

  // Handle layout option changes
  const handleLayoutChange = useCallback((newOptions: Partial<LayoutOptions>) => {
    setLayoutOptions(prev => {
      const updated = { ...prev, ...newOptions };
      saveLayoutOptions(updated);
      return updated;
    });
  }, []);

  // Apply auto-layout to nodes
  const handleApplyLayout = useCallback(() => {
    if (nodes.length === 0) return;

    setIsLayouting(true);

    // Use requestAnimationFrame to allow the loading state to render
    requestAnimationFrame(() => {
      const layoutedNodes = applyAutoLayout(nodes, edges, layoutOptions);
      setNodes(layoutedNodes);

      // Fit view after layout with a small delay for animation
      setTimeout(() => {
        setIsLayouting(false);
      }, 300);
    });
  }, [nodes, edges, layoutOptions, setNodes]);

  // API queries
  const readyTasks = useReadyTasks();
  const blockedTasks = useBlockedTasks();
  const dependencyTree = useDependencyTree(selectedTaskId);
  const dependencyList = useDependencyList(selectedTaskId);

  // Build dependency type map for looking up actual types
  const dependencyTypeMap = useMemo(() => {
    return buildDependencyTypeMap(dependencyList.data);
  }, [dependencyList.data]);

  // Combine tasks for the selector
  const allTasks = useMemo(() => {
    const ready = readyTasks.data || [];
    const blocked = blockedTasks.data || [];
    // Deduplicate by id
    const map = new Map<string, Task>();
    ready.forEach((t) => map.set(t.id, t));
    blocked.forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [readyTasks.data, blockedTasks.data]);

  // Auto-select first blocked task (they have dependencies to visualize)
  useEffect(() => {
    if (!selectedTaskId && blockedTasks.data && blockedTasks.data.length > 0) {
      setSelectedTaskId(blockedTasks.data[0].id);
    } else if (!selectedTaskId && allTasks.length > 0) {
      setSelectedTaskId(allTasks[0].id);
    }
  }, [selectedTaskId, blockedTasks.data, allTasks]);

  // Update graph when dependency tree or filters change
  useEffect(() => {
    if (dependencyTree.data) {
      const { nodes: newNodes, edges: newEdges } = buildGraphFromTree(
        dependencyTree.data,
        { searchQuery, statusFilter, showEdgeLabels },
        dependencyTypeMap
      );
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [dependencyTree.data, dependencyTypeMap, searchQuery, statusFilter, showEdgeLabels, setNodes, setEdges]);

  // Calculate match count for the filter display
  const matchCount = useMemo(() => {
    const hasSearch = searchQuery.trim().length > 0;
    const hasStatusFilter = statusFilter.length > 0;
    if (!hasSearch && !hasStatusFilter) return nodes.length;

    return nodes.filter(node => {
      const data = node.data as TaskNodeData;
      return data.isHighlighted || data.isSearchMatch;
    }).length;
  }, [nodes, searchQuery, statusFilter]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter([]);
  }, []);

  const isLoading = readyTasks.isLoading || blockedTasks.isLoading;

  return (
    <div className="h-full flex flex-col" data-testid="dependency-graph-page">
      <PageHeader
        title="Dependencies"
        icon={Network}
        iconColor="text-blue-500"
        subtitle="Visualize task dependencies"
        testId="dependency-graph-header"
      />

      {isLoading && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading tasks...</div>
      )}

      {!isLoading && allTasks.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
          No tasks available. Create some tasks to visualize their dependencies.
        </div>
      )}

      {!isLoading && allTasks.length > 0 && (
        <div className="flex-1 flex flex-col lg:flex-row gap-3 sm:gap-4 min-h-0">
          {/* Task Selector - collapsed on mobile, sidebar on desktop */}
          <div className="lg:w-56 xl:w-64 flex flex-col min-h-0 lg:shrink-0">
            <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2 text-sm sm:text-base">Select a Task</h3>
            <div className="flex-1 overflow-y-auto max-h-32 lg:max-h-none" data-testid="task-selector">
              <TaskSelector
                tasks={allTasks}
                selectedId={selectedTaskId}
                onSelect={setSelectedTaskId}
              />
            </div>
          </div>

          {/* Graph Canvas with Toolbar */}
          <ReactFlowProvider>
            <DependencyGraphInner
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onClearFilters={clearFilters}
              matchCount={matchCount}
              totalCount={nodes.length}
              isLoadingTree={dependencyTree.isLoading}
              isError={dependencyTree.isError}
              hasData={!!dependencyTree.data}
              showEdgeLabels={showEdgeLabels}
              onToggleEdgeLabels={() => setShowEdgeLabels(prev => !prev)}
              layoutOptions={layoutOptions}
              onLayoutChange={handleLayoutChange}
              onApplyLayout={handleApplyLayout}
              isLayouting={isLayouting}
            />
          </ReactFlowProvider>
        </div>
      )}

      {/* Legend */}
      <GraphLegend />
    </div>
  );
}

// Default export for route
export default DependencyGraphPage;
