import { useState, useRef, useEffect } from 'react'
import type { ActivityDay } from './metrics-types'

// ── Sparkline ──

export function Sparkline({ data, width = 64, height = 24, color = 'var(--color-primary)', fill = false }: {
  data: number[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
}) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return `${x},${y}`
  })

  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      {fill && (
        <polygon
          points={`${pad},${height - pad} ${points.join(' ')} ${width - pad},${height - pad}`}
          fill={color}
          opacity={0.15}
        />
      )}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Area Chart (fixed-pixel SVG with HTML labels) ──

export function AreaChart({ series, labels, height = 200 }: {
  series: { data: number[]; color: string; label: string }[]
  labels: string[]
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setW(entry.contentRect.width)
    })
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const chartH = height - 24 // leave room for HTML labels below
  const pad = { top: 8, right: 8, bottom: 4, left: 8 }
  const allValues = series.flatMap(s => s.data)
  const maxVal = Math.max(...allValues, 1)
  const innerW = w - pad.left - pad.right
  const innerH = chartH - pad.top - pad.bottom

  function toX(i: number) { return pad.left + (i / Math.max(labels.length - 1, 1)) * innerW }
  function toY(v: number) { return pad.top + innerH - (v / maxVal) * innerH }

  const gridLines = [0.25, 0.5, 0.75].map(frac => pad.top + innerH * (1 - frac))
  const labelStep = Math.max(1, Math.ceil(labels.length / 7))

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* SVG chart — fixed pixel dimensions, no viewBox scaling */}
      <svg width={w} height={chartH} style={{ display: 'block' }}>
        {gridLines.map((y, i) => (
          <line key={i} x1={pad.left} y1={y} x2={w - pad.right} y2={y}
            stroke="var(--color-border-subtle)" strokeWidth={0.5} strokeDasharray="4 4" />
        ))}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
          const fillPts = `${toX(0)},${toY(0)} ${pts} ${toX(s.data.length - 1)},${toY(0)}`
          return (
            <g key={si}>
              <polygon points={fillPts} fill={s.color} opacity={0.12} />
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>

      {/* HTML x-axis labels — fixed 11px, never scales */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px 0' }}>
        {labels.map((label, i) => {
          if (i % labelStep !== 0) return <span key={i} />
          return (
            <span key={i} style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              {label.slice(5)}
            </span>
          )
        })}
      </div>

      {/* Legend */}
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 16, padding: '4px 0 0', justifyContent: 'center' }}>
          {series.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Horizontal Bar ──

export function HorizontalBar({ value, max, color = 'var(--color-primary)', height = 6 }: {
  value: number
  max: number
  color?: string
  height?: number
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ width: '100%', height, background: 'var(--color-surface)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: height / 2, transition: 'width 0.3s ease' }} />
    </div>
  )
}

// ── Mini Donut ──

export function MiniDonut({ segments, size = 48 }: {
  segments: { value: number; color: string; label: string }[]
  size?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null
  const r = size / 2 - 4
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circumference
        const o = offset
        offset += dash
        return (
          <circle key={i} cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={seg.color} strokeWidth={6}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-o}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )
      })}
    </svg>
  )
}

// ── Trend Badge ──

export function TrendBadge({ value, inverted = false }: {
  value: number
  inverted?: boolean
}) {
  if (value === 0) return null
  const isPositive = inverted ? value < 0 : value > 0
  const color = isPositive ? 'var(--color-success)' : 'var(--color-danger)'
  const arrow = value > 0 ? '\u2191' : '\u2193'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 500, color }}>
      {arrow} {Math.abs(value)}%
    </span>
  )
}

// ── Activity Heatmap (GitHub-style, HTML labels for fixed font size) ──

export function ActivityHeatmap({ data }: {
  data: ActivityDay[]
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: ActivityDay } | null>(null)

  const maxTasks = Math.max(...data.map(d => d.tasks), 1)
  const maxMrs = Math.max(...data.map(d => d.mrs), 1)

  const cellSize = 11
  const cellGap = 2
  const step = cellSize + cellGap

  // Group into week columns (Mon=row 0)
  const weekCols: (ActivityDay | null)[][] = []
  let currentCol: (ActivityDay | null)[] = []

  for (const day of data) {
    const d = new Date(day.date)
    const dow = (d.getDay() + 6) % 7
    if (dow === 0 && currentCol.length > 0) {
      weekCols.push(currentCol)
      currentCol = []
    }
    while (currentCol.length < dow) currentCol.push(null)
    currentCol.push(day)
  }
  if (currentCol.length > 0) {
    while (currentCol.length < 7) currentCol.push(null)
    weekCols.push(currentCol)
  }

  const numWeeks = weekCols.length
  const gridW = numWeeks * step
  const gridH = 7 * step

  // Month labels positioned as % of grid width
  const monthLabels: { label: string; pct: number }[] = []
  let lastMonth = ''
  weekCols.forEach((col, wi) => {
    const first = col.find(d => d !== null)
    if (first) {
      const m = new Date(first.date).toLocaleString('en', { month: 'short' })
      if (m !== lastMonth) {
        monthLabels.push({ label: m, pct: (wi / numWeeks) * 100 })
        lastMonth = m
      }
    }
  })

  function taskAlpha(tasks: number) { return tasks === 0 ? 0 : 0.15 + (tasks / maxTasks) * 0.85 }
  function mrAlpha(mrs: number) { return mrs === 0 ? 0 : 0.15 + (mrs / maxMrs) * 0.85 }

  // Day label vertical positions as % of grid height
  const dayLabelRows = [
    { label: 'Mon', pct: (0.5 * step / gridH) * 100 },
    { label: 'Wed', pct: (2.5 * step / gridH) * 100 },
    { label: 'Fri', pct: (4.5 * step / gridH) * 100 },
  ]

  return (
    <div style={{ position: 'relative' }}>
      {/* Month labels row — HTML, fixed font */}
      <div style={{ display: 'flex', position: 'relative', height: 16, marginLeft: 30, marginBottom: 4 }}>
        {monthLabels.map((m, i) => (
          <span key={i} style={{
            position: 'absolute', left: `${m.pct}%`,
            fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
          }}>
            {m.label}
          </span>
        ))}
      </div>

      {/* Grid area: day labels overlaid on SVG */}
      <div style={{ position: 'relative', paddingLeft: 30 }}>
        {/* Day labels — absolutely positioned using % of SVG height */}
        {dayLabelRows.map(d => (
          <span key={d.label} style={{
            position: 'absolute', left: 0, top: `${d.pct}%`,
            transform: 'translateY(-50%)',
            fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)',
            pointerEvents: 'none',
          }}>
            {d.label}
          </span>
        ))}

        {/* SVG grid — cells only, no text */}
        <div style={{ overflow: 'hidden' }} onMouseLeave={() => setTooltip(null)}>
          <svg width="100%" viewBox={`0 0 ${gridW} ${gridH}`} style={{ display: 'block' }} preserveAspectRatio="xMinYMin meet">
            <defs>
              <clipPath id="hm-tl">
                <polygon points={`0,0 ${cellSize},0 0,${cellSize}`} />
              </clipPath>
              <clipPath id="hm-br">
                <polygon points={`${cellSize},0 ${cellSize},${cellSize} 0,${cellSize}`} />
              </clipPath>
            </defs>

            {weekCols.map((col, wi) =>
              col.map((day, di) => {
                if (!day) return null
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                if (new Date(day.date) > today) return null

                const x = wi * step
                const y = di * step
                const ta = taskAlpha(day.tasks)
                const ma = mrAlpha(day.mrs)

                return (
                  <g key={`${wi}-${di}`}
                    onMouseEnter={(e) => {
                      const svg = e.currentTarget.closest('svg') as SVGSVGElement
                      const rect = svg.getBoundingClientRect()
                      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, day })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ cursor: 'default' }}>
                    <rect x={x} y={y} width={cellSize} height={cellSize} rx={2} fill="var(--color-surface)" />
                    <g clipPath="url(#hm-tl)" transform={`translate(${x},${y})`}>
                      <rect width={cellSize} height={cellSize} fill="var(--color-primary)" opacity={ta} />
                    </g>
                    <g clipPath="url(#hm-br)" transform={`translate(${x},${y})`}>
                      <rect width={cellSize} height={cellSize} fill="var(--color-success)" opacity={ma} />
                    </g>
                    <rect x={x} y={y} width={cellSize} height={cellSize} rx={2}
                      fill="none" stroke="var(--color-bg)" strokeWidth={0.5} />
                  </g>
                )
              })
            )}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              position: 'absolute', left: tooltip.x + 40, top: tooltip.y + 16,
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 11,
              color: 'var(--color-text)', pointerEvents: 'none', zIndex: 10,
              whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>{tooltip.day.date}</div>
              <div style={{ color: 'var(--color-primary)' }}>{tooltip.day.tasks} tasks completed</div>
              <div style={{ color: 'var(--color-success)' }}>{tooltip.day.mrs} MRs merged</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: color legend (HTML) + Less/More */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingLeft: 30 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, background: 'var(--color-primary)', opacity: 0.7 }} />
            Tasks completed
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, background: 'var(--color-success)', opacity: 0.7 }} />
            MRs merged
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Less
          {[0.05, 0.25, 0.5, 0.75, 1].map((a, i) => (
            <span key={i} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--color-primary)', opacity: a }} />
          ))}
          More
        </div>
      </div>
    </div>
  )
}
