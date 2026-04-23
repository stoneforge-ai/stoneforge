import { useState, useRef, useLayoutEffect, useCallback, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type Placement = 'top' | 'right' | 'bottom' | 'left'

interface TooltipProps {
  label: string
  shortcut?: string
  placement?: Placement
  disabled?: boolean
  children: ReactNode
  style?: CSSProperties
}

export function Tooltip({ label, shortcut, placement = 'top', disabled, children, style }: TooltipProps) {
  const [show, setShow] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })

  // Measure the actual tooltip and position it, clamped to viewport
  const reposition = useCallback(() => {
    const trigger = wrapperRef.current
    const tip = tooltipRef.current
    if (!trigger || !tip) return

    const tr = trigger.getBoundingClientRect()
    const tt = tip.getBoundingClientRect()
    const gap = 5
    const pad = 8 // viewport edge padding
    const vpW = window.innerWidth
    const vpH = window.innerHeight

    let top = 0
    let left = 0

    // Initial position based on placement
    switch (placement) {
      case 'top':
        top = tr.top - gap - tt.height
        left = tr.left + tr.width / 2 - tt.width / 2
        break
      case 'bottom':
        top = tr.bottom + gap
        left = tr.left + tr.width / 2 - tt.width / 2
        break
      case 'right':
        top = tr.top + tr.height / 2 - tt.height / 2
        left = tr.right + gap
        break
      case 'left':
        top = tr.top + tr.height / 2 - tt.height / 2
        left = tr.left - gap - tt.width
        break
    }

    // Flip if overflows primary axis
    if (placement === 'top' && top < pad) {
      top = tr.bottom + gap // flip to bottom
    } else if (placement === 'bottom' && top + tt.height > vpH - pad) {
      top = tr.top - gap - tt.height // flip to top
    } else if (placement === 'right' && left + tt.width > vpW - pad) {
      left = tr.left - gap - tt.width // flip to left
    } else if (placement === 'left' && left < pad) {
      left = tr.right + gap // flip to right
    }

    // Clamp horizontal — never extend past viewport edges
    if (left + tt.width > vpW - pad) left = vpW - pad - tt.width
    if (left < pad) left = pad

    // Clamp vertical
    if (top + tt.height > vpH - pad) top = vpH - pad - tt.height
    if (top < pad) top = pad

    setPos({ top, left })
  }, [placement])

  useLayoutEffect(() => {
    if (show && !disabled) reposition()
  }, [show, disabled, reposition, label, shortcut])

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {children}
      {show && !disabled && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {label}
          {shortcut && (
            <span style={{ opacity: 0.6, fontSize: 10 }}>{shortcut}</span>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
