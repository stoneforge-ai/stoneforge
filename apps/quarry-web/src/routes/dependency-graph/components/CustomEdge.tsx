/**
 * Custom ReactFlow edge with labels for dependency type visualization
 */

import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import { DEPENDENCY_TYPES, getEdgeColor } from '../constants';
import type { CustomEdgeProps } from '../types';

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const dependencyType = data?.dependencyType || 'blocks';
  const showLabels = data?.showLabels ?? true;
  const colors = getEdgeColor(dependencyType);

  // Get a short display label for the edge
  const displayLabel = dependencyType.replace('-', ' ');

  return (
    <g>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, stroke: colors.stroke }}
      />
      {/* Wider invisible path for hover interactions */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        data-testid="edge-interaction-zone"
        data-edge-id={id}
        data-edge-type={dependencyType}
      />
      {/* Edge label */}
      {showLabels && (
        <foreignObject
          x={labelX - 40}
          y={labelY - 10}
          width={80}
          height={20}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
          data-testid="edge-label"
          data-edge-type={dependencyType}
        >
          <div
            style={{
              backgroundColor: colors.labelBg,
              color: colors.label,
              border: `1px solid ${colors.stroke}`,
            }}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-center whitespace-nowrap"
            title={DEPENDENCY_TYPES.find(t => t.value === dependencyType)?.description || dependencyType}
          >
            {displayLabel}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
