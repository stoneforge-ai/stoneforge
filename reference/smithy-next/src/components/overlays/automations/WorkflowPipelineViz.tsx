import { Bot, Terminal } from 'lucide-react'
import type { WFStep } from './wf-types'

interface WorkflowPipelineVizProps {
  steps: WFStep[]
  onStepClick?: (stepId: string) => void
}

interface LayoutNode {
  step: WFStep
  column: number
  row: number
}

export function WorkflowPipelineViz({ steps, onStepClick }: WorkflowPipelineVizProps) {
  if (steps.length === 0) return null

  // If no step has dependsOn, treat as sequential chain
  const hasDeps = steps.some(s => s.dependsOn && s.dependsOn.length > 0)
  const effectiveSteps = hasDeps ? steps : steps.map((s, i) => ({
    ...s,
    dependsOn: i > 0 ? [steps[i - 1].id] : undefined,
  }))

  // Topological sort: assign columns by dependency depth
  const stepMap = new Map(effectiveSteps.map(s => [s.id, s]))
  const depths = new Map<string, number>()

  function getDepth(stepId: string): number {
    if (depths.has(stepId)) return depths.get(stepId)!
    const step = stepMap.get(stepId)
    if (!step || !step.dependsOn || step.dependsOn.length === 0) {
      depths.set(stepId, 0)
      return 0
    }
    const maxParentDepth = Math.max(...step.dependsOn.map(d => getDepth(d)))
    const depth = maxParentDepth + 1
    depths.set(stepId, depth)
    return depth
  }

  effectiveSteps.forEach(s => getDepth(s.id))

  // Group by column
  const columns = new Map<number, WFStep[]>()
  effectiveSteps.forEach(s => {
    const col = depths.get(s.id) || 0
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col)!.push(s)
  })

  const maxCol = Math.max(...Array.from(columns.keys()))
  const layoutNodes: LayoutNode[] = []
  for (let col = 0; col <= maxCol; col++) {
    const colSteps = columns.get(col) || []
    colSteps.forEach((step, row) => {
      layoutNodes.push({ step, column: col, row })
    })
  }

  // Layout dimensions
  const nodeW = 140
  const nodeH = 40
  const colGap = 60
  const rowGap = 12
  const padX = 16
  const padY = 12

  const maxRows = Math.max(...Array.from(columns.values()).map(c => c.length))
  const svgW = (maxCol + 1) * (nodeW + colGap) - colGap + padX * 2
  const svgH = maxRows * (nodeH + rowGap) - rowGap + padY * 2

  const getNodeCenter = (col: number, row: number) => ({
    x: padX + col * (nodeW + colGap) + nodeW / 2,
    y: padY + row * (nodeH + rowGap) + nodeH / 2,
  })

  const getNodePos = (col: number, row: number) => ({
    x: padX + col * (nodeW + colGap),
    y: padY + row * (nodeH + rowGap),
  })

  // Build edges from dependsOn
  const edges: { from: { col: number; row: number }; to: { col: number; row: number } }[] = []
  layoutNodes.forEach(node => {
    if (node.step.dependsOn) {
      node.step.dependsOn.forEach(depId => {
        const parent = layoutNodes.find(n => n.step.id === depId)
        if (parent) {
          edges.push({ from: { col: parent.column, row: parent.row }, to: { col: node.column, row: node.row } })
        }
      })
    }
  })

  // For steps without dependsOn (other than column 0), add implicit edges from previous column
  layoutNodes.forEach(node => {
    if (node.column > 0 && (!node.step.dependsOn || node.step.dependsOn.length === 0)) {
      const prevCol = columns.get(node.column - 1) || []
      if (prevCol.length === 1) {
        const parent = layoutNodes.find(n => n.step.id === prevCol[0].id)
        if (parent) {
          edges.push({ from: { col: parent.column, row: parent.row }, to: { col: node.column, row: node.row } })
        }
      }
    }
  })

  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)', padding: 4 }}>
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = getNodeCenter(edge.from.col, edge.from.row)
          const to = getNodeCenter(edge.to.col, edge.to.row)
          const midX = (from.x + to.x) / 2
          return (
            <path
              key={i}
              d={`M ${from.x + nodeW / 2 - 4} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x - nodeW / 2 + 4} ${to.y}`}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={1.5}
            />
          )
        })}

        {/* Nodes */}
        {layoutNodes.map(node => {
          const pos = getNodePos(node.column, node.row)
          const isAgent = node.step.type === 'agent'
          const accentColor = isAgent ? 'var(--color-primary)' : 'var(--color-border)'
          const Icon = isAgent ? Bot : Terminal
          return (
            <g key={node.step.id} style={{ cursor: onStepClick ? 'pointer' : 'default' }} onClick={() => onStepClick?.(node.step.id)}>
              <title>{node.step.name}</title>
              <rect
                x={pos.x} y={pos.y} width={nodeW} height={nodeH}
                rx={6} ry={6}
                fill="var(--color-bg-elevated)"
                stroke={accentColor}
                strokeWidth={1.5}
              />
              {/* Left accent bar */}
              <rect
                x={pos.x} y={pos.y} width={4} height={nodeH}
                rx={2} ry={2}
                fill={accentColor}
              />
              {/* Type icon */}
              <foreignObject x={pos.x + 10} y={pos.y + (nodeH - 14) / 2} width={14} height={14}>
                <Icon size={14} strokeWidth={1.5} style={{ color: isAgent ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }} />
              </foreignObject>
              {/* Step name */}
              <text
                x={pos.x + 30} y={pos.y + nodeH / 2}
                fill="var(--color-text)"
                fontSize={11} fontWeight={500} fontFamily="var(--font-sans)"
                dominantBaseline="middle"
              >
                {node.step.name.length > 14 ? node.step.name.slice(0, 13) + '…' : node.step.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
