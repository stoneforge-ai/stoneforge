import { createPortal as createReactPortal } from 'react-dom'
import { useRef as useReactRef, useState as useReactState, useEffect as useReactEffect, useCallback as useReactCallback } from 'react'

/**
 * Hook that calculates viewport-safe positioning for a dropdown.
 * Returns a ref to attach to the trigger element and the calculated fixed position.
 */
export function useViewportPosition(isOpen: boolean, preferBelow = true, preferRight = false) {
  const triggerRef = useReactRef<HTMLDivElement>(null)
  const [pos, setPos] = useReactState<{ top: number; left: number; maxHeight: number; placeAbove: boolean }>({ top: 0, left: 0, maxHeight: 400, placeAbove: false })

  useReactEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const padding = 8
    const dropdownWidth = 260
    const vpW = window.innerWidth
    const vpH = window.innerHeight

    // Vertical: prefer below, flip above if not enough space
    const spaceBelow = vpH - rect.bottom - padding
    const spaceAbove = rect.top - padding
    const placeAbove = !preferBelow || (spaceBelow < 200 && spaceAbove > spaceBelow)
    const top = placeAbove ? rect.top : rect.bottom + 4
    const maxHeight = placeAbove ? spaceAbove - 4 : spaceBelow - 4

    // Horizontal: prefer aligned to left edge, shift left if overflows right
    let left = preferRight ? rect.right - dropdownWidth : rect.left
    if (left + dropdownWidth > vpW - padding) left = vpW - dropdownWidth - padding
    if (left < padding) left = padding

    setPos({ top, left, maxHeight: Math.min(maxHeight, 400), placeAbove })
  }, [isOpen, preferBelow, preferRight])

  return { triggerRef, pos }
}

/**
 * Renders children in a fixed-position portal at the document body level.
 * This ensures dropdowns and tooltips are never clipped by parent overflow.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  return createReactPortal(children, document.body)
}

/**
 * A viewport-safe tooltip that renders via portal.
 * Attaches to the nearest parent via ref positioning.
 */
export function Tooltip({ text, targetRect, visible }: { text: string; targetRect: DOMRect | null; visible: boolean }) {
  if (!visible || !targetRect) return null

  const padding = 8
  const vpW = window.innerWidth

  // Position below center of target
  let left = targetRect.left + targetRect.width / 2
  const top = targetRect.bottom + 6

  // Clamp to viewport
  const estWidth = text.length * 6.5 + 16 // rough estimate
  if (left + estWidth / 2 > vpW - padding) left = vpW - padding - estWidth / 2
  if (left - estWidth / 2 < padding) left = padding + estWidth / 2

  return createReactPortal(
    <div style={{
      position: 'fixed', top, left, transform: 'translateX(-50%)',
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)', padding: '4px 8px',
      whiteSpace: 'nowrap', fontSize: 11, color: 'var(--color-text)',
      boxShadow: 'var(--shadow-float)', zIndex: 9999, pointerEvents: 'none',
      maxWidth: `calc(100vw - ${padding * 2}px)`, overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {text}
    </div>,
    document.body,
  )
}
