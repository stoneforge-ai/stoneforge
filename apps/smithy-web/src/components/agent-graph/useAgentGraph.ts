/**
 * useAgentGraph - Hook to build graph data from agents
 *
 * Transforms agent data into nodes and edges for visualization.
 */

import { useMemo } from 'react';
import type { Agent, Task, WorkerMetadata, StewardMetadata } from '../../api/types';
import type { AgentNode, AgentEdge, LayoutConfig, AgentNodeType } from './types';
import { DEFAULT_LAYOUT } from './types';

interface UseAgentGraphOptions {
  director?: Agent;
  workers: Agent[];
  stewards: Agent[];
  tasks?: Task[];
  sessionStatuses?: Map<string, 'running' | 'idle' | 'suspended' | 'terminated' | 'starting'>;
  layout?: Partial<LayoutConfig>;
}

interface UseAgentGraphResult {
  nodes: AgentNode[];
  edges: AgentEdge[];
}

// Empty array constant to avoid recreating on each render
const EMPTY_TASKS: Task[] = [];
const EMPTY_SESSION_STATUSES = new Map<string, 'running' | 'idle' | 'suspended' | 'terminated' | 'starting'>();
const EMPTY_LAYOUT: Partial<LayoutConfig> = {};

/**
 * Build graph nodes and edges from agents
 */
export function useAgentGraph({
  director,
  workers,
  stewards,
  tasks,
  sessionStatuses,
  layout: layoutOverrides,
}: UseAgentGraphOptions): UseAgentGraphResult {
  // Use stable default values
  const effectiveTasks = tasks ?? EMPTY_TASKS;
  const effectiveSessionStatuses = sessionStatuses ?? EMPTY_SESSION_STATUSES;
  const effectiveLayoutOverrides = layoutOverrides ?? EMPTY_LAYOUT;

  // Memoize layout to prevent recalculation
  const layout = useMemo(
    () => ({ ...DEFAULT_LAYOUT, ...effectiveLayoutOverrides }),
    [effectiveLayoutOverrides]
  );

  return useMemo(() => {
    const nodes: AgentNode[] = [];
    const edges: AgentEdge[] = [];

    // Create a map of task assignments for quick lookup
    const tasksByAssignee = new Map<string, Task>();
    for (const task of effectiveTasks) {
      if (task.assignee && (task.status === 'in_progress' || task.status === 'open')) {
        tasksByAssignee.set(task.assignee, task);
      }
    }

    // Human node (always present)
    const humanNode: AgentNode = {
      id: 'human',
      type: 'agentNode',
      position: { x: layout.centerX, y: layout.humanY },
      data: {
        label: 'Human',
        nodeType: 'human' as AgentNodeType,
      },
    };
    nodes.push(humanNode);

    // Director node (if exists)
    if (director) {
      const status = effectiveSessionStatuses.get(director.id) ||
        director.metadata?.agent?.sessionStatus ||
        'idle';

      const directorNode: AgentNode = {
        id: director.id,
        type: 'agentNode',
        position: { x: layout.centerX, y: layout.directorY },
        data: {
          label: director.name,
          nodeType: 'director' as AgentNodeType,
          agent: director,
          status,
          currentTask: tasksByAssignee.get(director.id),
        },
      };
      nodes.push(directorNode);

      // Edge: Human -> Director
      edges.push({
        id: 'human-director',
        source: 'human',
        target: director.id,
        type: 'smoothstep',
        animated: status === 'running',
        style: { stroke: 'var(--color-border)', strokeWidth: 2 },
        data: { relationship: 'supervises' },
      });
    }

    // Calculate positions for workers and stewards
    // Persistent workers connect to Human (left side)
    // Ephemeral workers connect to Director (center-left)
    // Stewards connect to Director (center-right)

    const persistentWorkers = workers.filter(
      w => (w.metadata?.agent as WorkerMetadata)?.workerMode === 'persistent'
    );
    const ephemeralWorkers = workers.filter(
      w => (w.metadata?.agent as WorkerMetadata)?.workerMode === 'ephemeral'
    );

    // Persistent Workers (report to Human)
    persistentWorkers.forEach((worker, index) => {
      const status = effectiveSessionStatuses.get(worker.id) ||
        worker.metadata?.agent?.sessionStatus ||
        'idle';
      const workerMeta = worker.metadata?.agent as WorkerMetadata | undefined;

      const x = layout.centerX - 300 + (index * layout.nodeSpacing);

      const workerNode: AgentNode = {
        id: worker.id,
        type: 'agentNode',
        position: { x, y: layout.workerY },
        data: {
          label: worker.name,
          nodeType: 'worker' as AgentNodeType,
          agent: worker,
          status,
          currentTask: tasksByAssignee.get(worker.id),
          branch: workerMeta?.branch,
        },
      };
      nodes.push(workerNode);

      // Edge: Human -> Persistent Worker
      edges.push({
        id: `human-${worker.id}`,
        source: 'human',
        target: worker.id,
        type: 'smoothstep',
        animated: status === 'running',
        style: { stroke: 'var(--color-border)', strokeWidth: 2 },
        data: { relationship: 'supervises' },
      });
    });

    // Ephemeral Workers (report to Director)
    if (director) {
      ephemeralWorkers.forEach((worker, index) => {
        const status = effectiveSessionStatuses.get(worker.id) ||
          worker.metadata?.agent?.sessionStatus ||
          'idle';
        const workerMeta = worker.metadata?.agent as WorkerMetadata | undefined;

        // Position ephemeral workers below director, slightly to the left
        const totalWidth = (ephemeralWorkers.length - 1) * layout.nodeSpacing;
        const startX = layout.centerX - totalWidth / 2 - 100;
        const x = startX + (index * layout.nodeSpacing);

        const workerNode: AgentNode = {
          id: worker.id,
          type: 'agentNode',
          position: { x, y: layout.workerY },
          data: {
            label: worker.name,
            nodeType: 'worker' as AgentNodeType,
            agent: worker,
            status,
            currentTask: tasksByAssignee.get(worker.id),
            branch: workerMeta?.branch,
            },
        };
        nodes.push(workerNode);

        // Edge: Director -> Ephemeral Worker
        edges.push({
          id: `${director.id}-${worker.id}`,
          source: director.id,
          target: worker.id,
          type: 'smoothstep',
          animated: status === 'running',
          style: { stroke: 'var(--color-border)', strokeWidth: 2 },
          data: { relationship: 'supervises' },
        });
      });
    }

    // Stewards (report to Director)
    if (director) {
      stewards.forEach((steward, index) => {
        const status = effectiveSessionStatuses.get(steward.id) ||
          steward.metadata?.agent?.sessionStatus ||
          'idle';
        const stewardMeta = steward.metadata?.agent as StewardMetadata | undefined;

        // Position stewards below director, to the right
        const totalWidth = (stewards.length - 1) * layout.nodeSpacing;
        const startX = layout.centerX - totalWidth / 2 + 100;
        const x = startX + (index * layout.nodeSpacing);

        const stewardNode: AgentNode = {
          id: steward.id,
          type: 'agentNode',
          position: { x, y: layout.stewardY },
          data: {
            label: steward.name,
            nodeType: 'steward' as AgentNodeType,
            agent: steward,
            status,
            healthIndicator: getHealthIndicator(stewardMeta),
            },
        };
        nodes.push(stewardNode);

        // Edge: Director -> Steward
        edges.push({
          id: `${director.id}-${steward.id}`,
          source: director.id,
          target: steward.id,
          type: 'smoothstep',
          animated: status === 'running',
          style: { stroke: 'var(--color-border)', strokeWidth: 2, strokeDasharray: '5,5' },
          data: { relationship: 'supervises' },
        });
      });
    }

    return { nodes, edges };
  }, [director, workers, stewards, effectiveTasks, effectiveSessionStatuses, layout]);
}

/**
 * Get health indicator based on steward metadata
 */
function getHealthIndicator(_meta?: StewardMetadata): 'healthy' | 'warning' | 'error' | undefined {
  return undefined;
}
