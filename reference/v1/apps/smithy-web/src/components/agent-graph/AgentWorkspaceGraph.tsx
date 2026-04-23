/**
 * AgentWorkspaceGraph - Graph visualization for agent hierarchy
 *
 * Shows the relationship between Human, Director, Workers, and Stewards.
 * Clicking an agent opens it in the Workspaces terminal multiplexer.
 */

import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

import type { Agent, Task } from '../../api/types';
import { AgentNode } from './AgentNode';
import { useAgentGraph } from './useAgentGraph';

// Stable empty map to avoid creating new reference on each render
const EMPTY_SESSION_STATUSES = new Map<string, 'running' | 'idle' | 'suspended' | 'terminated' | 'starting'>();

interface AgentWorkspaceGraphProps {
  director?: Agent;
  workers: Agent[];
  stewards: Agent[];
  tasks?: Task[];
  sessionStatuses?: Map<string, 'running' | 'idle' | 'suspended' | 'terminated' | 'starting'>;
  isLoading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
}

// Define custom node types
const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
};

// Style the minimap nodes based on their status
function minimapNodeColor(node: Node): string {
  const data = node.data as Record<string, unknown>;
  const status = data?.status as string | undefined;

  switch (status) {
    case 'running':
      return 'var(--color-success)';
    case 'starting':
      return 'var(--color-info)';
    case 'suspended':
      return 'var(--color-warning)';
    case 'terminated':
      return 'var(--color-text-tertiary)';
    default:
      return 'var(--color-border)';
  }
}

export function AgentWorkspaceGraph({
  director,
  workers,
  stewards,
  tasks = [],
  sessionStatuses = EMPTY_SESSION_STATUSES,
  isLoading = false,
  error = null,
  onRefresh,
}: AgentWorkspaceGraphProps) {
  const navigate = useNavigate();

  // Build graph nodes and edges without the callback to avoid triggering updates
  const { nodes: initialNodes, edges: initialEdges } = useAgentGraph({
    director,
    workers,
    stewards,
    tasks,
    sessionStatuses,
    // Note: We don't pass onAgentClick here to avoid re-render loops
    // Instead, we handle clicks at the ReactFlow level via onNodeClick
  });

  // Handle clicking on an agent node to open in Workspaces
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string; data: { agent?: Agent } }) => {
      const agent = node.data?.agent;
      if (agent) {
        navigate({
          to: '/workspaces',
          search: { layout: 'single', agent: agent.id, resumeSessionId: undefined, resumePrompt: undefined },
        });
      }
    },
    [navigate]
  );

  // Use React Flow state management
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when data changes
  // Note: We intentionally exclude setNodes and setEdges from deps to prevent infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  // Fit view options
  const fitViewOptions = useMemo(
    () => ({
      padding: 0.2,
      maxZoom: 1.5,
      minZoom: 0.5,
    }),
    []
  );

  // Show loading state
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full min-h-[400px] bg-[var(--color-bg)]"
        data-testid="agent-graph-loading"
      >
        <div className="flex flex-col items-center gap-3 text-[var(--color-text-secondary)]">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>Loading agents...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div
        className="flex items-center justify-center h-full min-h-[400px] bg-[var(--color-bg)]"
        data-testid="agent-graph-error"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-8 h-8 text-[var(--color-error)]" />
          <p className="text-[var(--color-text)]">Failed to load agents</p>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md">
            {error.message}
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-primary)] border border-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-muted)] transition-colors"
              data-testid="agent-graph-retry"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show empty state
  if (!director && workers.length === 0 && stewards.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full min-h-[400px] bg-[var(--color-bg)]"
        data-testid="agent-graph-empty"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="p-3 rounded-full bg-[var(--color-surface-elevated)]">
            <AlertCircle className="w-8 h-8 text-[var(--color-text-tertiary)]" />
          </div>
          <p className="text-[var(--color-text)]">No agents registered</p>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md">
            Register agents to see them visualized in the hierarchy graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full min-h-[400px] bg-[var(--color-bg)]"
      data-testid="agent-workspace-graph"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll
        panOnScroll
        panOnDrag
        attributionPosition="bottom-left"
        className="bg-[var(--color-bg)]"
      >
        <Background
          gap={16}
          size={1}
          color="var(--color-border-subtle)"
        />
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          className="!bg-[var(--color-surface)] !border-[var(--color-border)] !rounded-lg !shadow-sm"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.1)"
          className="!bg-[var(--color-surface)] !border-[var(--color-border)] !rounded-lg"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
}
