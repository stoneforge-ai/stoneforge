/**
 * Inner dependency graph component that contains the ReactFlow canvas
 * Must be used inside a ReactFlowProvider
 */

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import { useIsMobile } from '../../../hooks';
import { TaskNode } from './TaskNode';
import { CustomEdge } from './CustomEdge';
import { GraphToolbar } from './GraphToolbar';
import { STATUS_COLORS } from '../constants';
import type { TaskNodeData, LayoutOptions } from '../types';

// Node and edge type registrations
const nodeTypes: NodeTypes = {
  task: TaskNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

export interface DependencyGraphInnerProps {
  nodes: Node<TaskNodeData>[];
  edges: Edge[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNodesChange: (changes: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdgesChange: (changes: any) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  onClearFilters: () => void;
  matchCount: number;
  totalCount: number;
  isLoadingTree: boolean;
  isError: boolean;
  hasData: boolean;
  showEdgeLabels: boolean;
  onToggleEdgeLabels: () => void;
  layoutOptions: LayoutOptions;
  onLayoutChange: (options: Partial<LayoutOptions>) => void;
  onApplyLayout: () => void;
  isLayouting: boolean;
}

export function DependencyGraphInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
  matchCount,
  totalCount,
  isLoadingTree,
  isError,
  hasData,
  showEdgeLabels,
  onToggleEdgeLabels,
  layoutOptions,
  onLayoutChange,
  onApplyLayout,
  isLayouting,
}: DependencyGraphInnerProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const isMobile = useIsMobile();

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.3, duration: 300 });
  }, [fitView]);

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <GraphToolbar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        matchCount={matchCount}
        totalCount={totalCount}
        onClearFilters={onClearFilters}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        showEdgeLabels={showEdgeLabels}
        onToggleEdgeLabels={onToggleEdgeLabels}
        layoutOptions={layoutOptions}
        onLayoutChange={onLayoutChange}
        onApplyLayout={onApplyLayout}
        isLayouting={isLayouting}
      />
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" data-testid="graph-canvas">
        {isLoadingTree && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
            Loading dependency tree...
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-full text-red-600 text-sm">
            Failed to load dependency tree
          </div>
        )}
        {hasData && nodes.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
            No dependencies found for this task
          </div>
        )}
        {hasData && nodes.length > 0 && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: isMobile ? 0.1 : 0.3 }}
            proOptions={{ hideAttribution: true }}
            panOnScroll={!isMobile}
            panOnDrag={true}
            zoomOnScroll={!isMobile}
            zoomOnPinch={true}
            zoomOnDoubleClick={true}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background />
            <Controls
              showZoom={!isMobile}
              showFitView={!isMobile}
              position="bottom-right"
            />
            {/* Hide minimap on mobile to save screen space */}
            {!isMobile && (
              <MiniMap
                nodeColor={(node) => {
                  const task = (node.data as TaskNodeData).task;
                  return STATUS_COLORS[task.status]?.border.replace('border-', '#').replace('-300', '') || '#cbd5e1';
                }}
                maskColor="rgba(255, 255, 255, 0.8)"
                data-testid="graph-minimap"
              />
            )}
          </ReactFlow>
        )}
        {!hasData && !isLoadingTree && !isError && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
            Select a task to view its dependencies
          </div>
        )}
      </div>
    </div>
  );
}
