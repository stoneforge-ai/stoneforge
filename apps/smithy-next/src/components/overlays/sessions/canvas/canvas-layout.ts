import type { Session } from '../session-types'

export interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

export interface NodeLayout {
  id: string
  position: NodePosition
  directorId: string | null
}

export interface ClusterFrame {
  directorId: string
  x: number
  y: number
  width: number
  height: number
  label: string
}

export type SizePreset = 'compact' | 'default' | 'comfortable' | 'large'

export const SIZE_PRESETS: Record<SizePreset, { width: number; height: number; label: string }> = {
  compact: { width: 300, height: 320, label: 'Compact' },
  default: { width: 400, height: 440, label: 'Default' },
  comfortable: { width: 540, height: 520, label: 'Comfortable' },
  large: { width: 680, height: 620, label: 'Large' },
}

const DEFAULT_PRESET: SizePreset = 'default'

export type AspectMode = 'thin' | 'balanced' | 'wide'

/** Multipliers applied on top of the base SizePreset. Balanced preserves
 * the preset's native ratio; Thin narrows and heightens it; Wide stretches
 * horizontally and shortens vertically. */
export const ASPECT_MULTIPLIERS: Record<AspectMode, { w: number; h: number; label: string }> = {
  thin: { w: 0.72, h: 1.12, label: 'Thin' },
  balanced: { w: 1, h: 1, label: 'Balanced' },
  wide: { w: 1.38, h: 0.88, label: 'Wide' },
}

const DEFAULT_ASPECT: AspectMode = 'balanced'

function resolveSize(preset: SizePreset, aspect: AspectMode) {
  const { width, height } = SIZE_PRESETS[preset]
  const m = ASPECT_MULTIPLIERS[aspect]
  return { width: Math.round(width * m.w), height: Math.round(height * m.h) }
}

const CLUSTER_COLS = 3
const CLUSTER_COL_GAP = 32
const CLUSTER_ROW_GAP = 32
const CLUSTER_INNER_PADDING = 40
const CLUSTERS_PER_ROW = 2
const CLUSTER_GAP_X = 160
const CLUSTER_GAP_Y = 160

/**
 * Lay out sessions by director cluster.
 *
 * The director session (if present in the set) anchors each cluster. Worker
 * sessions grid-fill below the director. Clusters flow left-to-right, wrapping
 * every CLUSTERS_PER_ROW. Orphan sessions (no director) fall into a final
 * "Unassigned" cluster.
 */
export function clusterLayout(sessions: Session[], preset: SizePreset = DEFAULT_PRESET, aspect: AspectMode = DEFAULT_ASPECT): {
  nodes: NodeLayout[]
  frames: ClusterFrame[]
} {
  const { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT } = resolveSize(preset, aspect)
  const byDirector = new Map<string, Session[]>()
  const orphans: Session[] = []
  for (const s of sessions) {
    const key = s.linkedDirectorId
    if (!key) {
      orphans.push(s)
      continue
    }
    const arr = byDirector.get(key) ?? []
    arr.push(s)
    byDirector.set(key, arr)
  }

  // Sort each cluster: director session first (if its agent name starts with "Director"),
  // then workers by start time descending (most recent first).
  const clusters: Array<{ directorId: string; sessions: Session[] }> = []
  for (const [directorId, arr] of byDirector) {
    arr.sort((a, b) => {
      const aDirector = a.agent.name.toLowerCase().includes('director')
      const bDirector = b.agent.name.toLowerCase().includes('director')
      if (aDirector !== bDirector) return aDirector ? -1 : 1
      return 0
    })
    clusters.push({ directorId, sessions: arr })
  }
  if (orphans.length) {
    clusters.push({ directorId: 'unassigned', sessions: orphans })
  }

  const nodes: NodeLayout[] = []
  const frames: ClusterFrame[] = []

  let rowIndex = 0
  let colIndex = 0
  let rowMaxHeight = 0
  let cursorX = 0
  let cursorY = 0

  for (const cluster of clusters) {
    const count = cluster.sessions.length
    const cols = Math.min(CLUSTER_COLS, count)
    const rows = Math.ceil(count / cols)
    const innerWidth = cols * DEFAULT_WIDTH + (cols - 1) * CLUSTER_COL_GAP
    const innerHeight = rows * DEFAULT_HEIGHT + (rows - 1) * CLUSTER_ROW_GAP
    const frameWidth = innerWidth + CLUSTER_INNER_PADDING * 2
    const frameHeight = innerHeight + CLUSTER_INNER_PADDING * 2

    if (colIndex >= CLUSTERS_PER_ROW) {
      rowIndex += 1
      colIndex = 0
      cursorX = 0
      cursorY += rowMaxHeight + CLUSTER_GAP_Y
      rowMaxHeight = 0
    }

    const frameX = cursorX
    const frameY = cursorY

    frames.push({
      directorId: cluster.directorId,
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      label: cluster.directorId === 'unassigned' ? 'Unassigned' : cluster.directorId,
    })

    cluster.sessions.forEach((s, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = frameX + CLUSTER_INNER_PADDING + col * (DEFAULT_WIDTH + CLUSTER_COL_GAP)
      const y = frameY + CLUSTER_INNER_PADDING + row * (DEFAULT_HEIGHT + CLUSTER_ROW_GAP)
      nodes.push({
        id: s.id,
        directorId: s.linkedDirectorId ?? null,
        position: { x, y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
      })
    })

    cursorX += frameWidth + CLUSTER_GAP_X
    rowMaxHeight = Math.max(rowMaxHeight, frameHeight)
    colIndex += 1
  }

  return { nodes, frames }
}

/**
 * Uniform 3-column grid. Ignores director relationships; every session gets
 * equal weight. Best for "I just want to scan everything at once."
 */
export function gridLayout(sessions: Session[], preset: SizePreset = DEFAULT_PRESET, aspect: AspectMode = DEFAULT_ASPECT): {
  nodes: NodeLayout[]
  frames: ClusterFrame[]
} {
  const { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT } = resolveSize(preset, aspect)
  const COLS = 3
  const COL_GAP = 32
  const ROW_GAP = 32
  const nodes: NodeLayout[] = sessions.map((s, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return {
      id: s.id,
      directorId: s.linkedDirectorId ?? null,
      position: {
        x: col * (DEFAULT_WIDTH + COL_GAP),
        y: row * (DEFAULT_HEIGHT + ROW_GAP),
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      },
    }
  })
  return { nodes, frames: [] }
}

/**
 * Three columns keyed by status urgency: needs-input, error, active.
 * Best for triage — whatever demands attention sits on the left.
 */
export function statusStackLayout(sessions: Session[], preset: SizePreset = DEFAULT_PRESET, aspect: AspectMode = DEFAULT_ASPECT): {
  nodes: NodeLayout[]
  frames: ClusterFrame[]
} {
  const { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT } = resolveSize(preset, aspect)
  const COL_GAP = 48
  const ROW_GAP = 28
  const COL_WIDTH = DEFAULT_WIDTH

  const columns: Array<{ key: string; label: string; sessions: Session[] }> = [
    { key: 'needs-input', label: 'Needs Input', sessions: [] },
    { key: 'error', label: 'Error', sessions: [] },
    { key: 'active', label: 'Active', sessions: [] },
    { key: 'completed', label: 'Completed', sessions: [] },
  ]
  for (const s of sessions) {
    if (s.needsInput && s.status === 'active') columns[0].sessions.push(s)
    else if (s.status === 'error') columns[1].sessions.push(s)
    else if (s.status === 'completed') columns[3].sessions.push(s)
    else columns[2].sessions.push(s)
  }

  const LABEL_OFFSET = 28
  const nodes: NodeLayout[] = []
  const frames: ClusterFrame[] = []
  columns.forEach((col, ci) => {
    if (!col.sessions.length) return
    const x = ci * (COL_WIDTH + COL_GAP)
    col.sessions.forEach((s, ri) => {
      nodes.push({
        id: s.id,
        directorId: s.linkedDirectorId ?? null,
        position: {
          x,
          y: LABEL_OFFSET + ri * (DEFAULT_HEIGHT + ROW_GAP),
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        },
      })
    })
    frames.push({
      directorId: col.key,
      x,
      y: 0,
      width: COL_WIDTH,
      height: LABEL_OFFSET + col.sessions.length * DEFAULT_HEIGHT + (col.sessions.length - 1) * ROW_GAP,
      label: col.label,
    })
  })

  return { nodes, frames }
}

export type LayoutMode = 'cluster' | 'grid' | 'status-stack'

export function layoutFor(mode: LayoutMode, sessions: Session[], preset: SizePreset = DEFAULT_PRESET, aspect: AspectMode = DEFAULT_ASPECT) {
  switch (mode) {
    case 'grid': return gridLayout(sessions, preset, aspect)
    case 'status-stack': return statusStackLayout(sessions, preset, aspect)
    case 'cluster':
    default: return clusterLayout(sessions, preset, aspect)
  }
}

export function boundingBox(nodes: NodeLayout[]): { x: number; y: number; width: number; height: number } {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + n.position.width)
    maxY = Math.max(maxY, n.position.y + n.position.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
