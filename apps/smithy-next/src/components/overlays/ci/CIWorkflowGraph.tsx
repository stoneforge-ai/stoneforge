import { Check, X, Clock, Loader, Ban, SkipForward } from 'lucide-react'
import type { CIJob } from './ci-types'

interface CIWorkflowGraphProps {
  jobs: CIJob[]
  onClickJob?: (jobId: string) => void
}

const statusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, queued: Clock, cancelled: Ban, skipped: SkipForward,
}
const statusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
  queued: 'var(--color-text-tertiary)', cancelled: 'var(--color-text-tertiary)', skipped: 'var(--color-text-tertiary)',
}

interface LayoutNode {
  job: CIJob
  column: number
  row: number
}

export function CIWorkflowGraph({ jobs, onClickJob }: CIWorkflowGraphProps) {
  if (jobs.length === 0) return null

  // Topological sort: assign columns by dependency depth
  const jobMap = new Map(jobs.map(j => [j.id, j]))
  const depths = new Map<string, number>()

  function getDepth(jobId: string): number {
    if (depths.has(jobId)) return depths.get(jobId)!
    const job = jobMap.get(jobId)
    if (!job || !job.dependsOn || job.dependsOn.length === 0) {
      depths.set(jobId, 0)
      return 0
    }
    const maxParentDepth = Math.max(...job.dependsOn.map(d => getDepth(d)))
    const depth = maxParentDepth + 1
    depths.set(jobId, depth)
    return depth
  }

  jobs.forEach(j => getDepth(j.id))

  // Group by column
  const columns = new Map<number, CIJob[]>()
  jobs.forEach(j => {
    const col = depths.get(j.id) || 0
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col)!.push(j)
  })

  const maxCol = Math.max(...Array.from(columns.keys()))
  const layoutNodes: LayoutNode[] = []
  for (let col = 0; col <= maxCol; col++) {
    const colJobs = columns.get(col) || []
    colJobs.forEach((job, row) => {
      layoutNodes.push({ job, column: col, row })
    })
  }

  // Layout dimensions
  const nodeW = 140
  const nodeH = 40
  const colGap = 60
  const rowGap = 12
  const padX = 16
  const padY = 12

  // Calculate max rows per column for SVG height
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

  // Build edges
  const edges: { from: { col: number; row: number }; to: { col: number; row: number } }[] = []
  layoutNodes.forEach(node => {
    if (node.job.dependsOn) {
      node.job.dependsOn.forEach(depId => {
        const parent = layoutNodes.find(n => n.job.id === depId)
        if (parent) {
          edges.push({ from: { col: parent.column, row: parent.row }, to: { col: node.column, row: node.row } })
        }
      })
    }
  })

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Pipeline</div>
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
            const color = statusColor[node.job.status] || 'var(--color-text-tertiary)'
            const Icon = statusIcon[node.job.status] || Clock
            return (
              <g
                key={node.job.id}
                onClick={() => onClickJob?.(node.job.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={pos.x} y={pos.y} width={nodeW} height={nodeH}
                  rx={6} ry={6}
                  fill="var(--color-bg-elevated)"
                  stroke={color}
                  strokeWidth={1.5}
                />
                {/* Left status accent */}
                <rect
                  x={pos.x} y={pos.y} width={4} height={nodeH}
                  rx={2} ry={2}
                  fill={color}
                />
                {/* Status icon (foreignObject for React icon) */}
                <foreignObject x={pos.x + 10} y={pos.y + (nodeH - 14) / 2} width={14} height={14}>
                  <Icon size={14} strokeWidth={2} style={{ color }} />
                </foreignObject>
                {/* Job name */}
                <text
                  x={pos.x + 30} y={pos.y + nodeH / 2 - 2}
                  fill="var(--color-text)"
                  fontSize={11} fontWeight={500} fontFamily="var(--font-sans)"
                  dominantBaseline="middle"
                >
                  {node.job.name.length > 14 ? node.job.name.slice(0, 13) + '…' : node.job.name}
                </text>
                {/* Duration */}
                {node.job.duration && (
                  <text
                    x={pos.x + 30} y={pos.y + nodeH / 2 + 10}
                    fill="var(--color-text-tertiary)"
                    fontSize={9} fontFamily="var(--font-mono)"
                    dominantBaseline="middle"
                  >
                    {node.job.duration}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
