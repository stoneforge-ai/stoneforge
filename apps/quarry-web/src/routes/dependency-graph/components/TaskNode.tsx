/**
 * Custom ReactFlow node for displaying tasks in the dependency graph
 */

import { Handle, Position } from '@xyflow/react';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';
import type { TaskNodeData } from '../types';

interface TaskNodeProps {
  data: TaskNodeData;
}

export function TaskNode({ data }: TaskNodeProps) {
  const { task, isRoot, isHighlighted, isSearchMatch } = data;
  // Handle cases where task properties may be undefined (e.g., non-task elements in dependency tree)
  const status = task.status || 'open';
  const title = task.title || task.id;
  const priority = task.priority ?? 3;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[priority] || PRIORITY_COLORS[3];

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px]
        ${colors.bg} ${colors.border}
        ${isRoot ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${isSearchMatch ? 'ring-2 ring-yellow-400 ring-offset-2 shadow-lg shadow-yellow-200' : ''}
        ${isHighlighted && !isSearchMatch ? 'opacity-100' : ''}
        ${!isHighlighted && !isSearchMatch ? 'opacity-40' : ''}
        transition-all duration-200
      `}
      data-testid="graph-node"
      data-node-id={task.id}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-xs font-medium ${colors.text} uppercase`}>
          {status.replace('_', ' ')}
        </span>
        <span className={`text-xs font-medium ${priorityColor}`}>P{priority}</span>
      </div>
      <div className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">
        {title}
      </div>
      <div className="mt-1 text-xs text-gray-600 font-mono truncate">{task.id}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}
