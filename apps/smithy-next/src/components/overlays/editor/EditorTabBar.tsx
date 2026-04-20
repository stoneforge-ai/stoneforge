import { X, FileText, FileJson, FileCode, File } from 'lucide-react'
import { useState } from 'react'
import type { EditorTab } from './editor-mock-data'

interface Props {
  tabs: EditorTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onPinTab: (id: string) => void
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return { icon: FileCode, color: '#3b82f6' }
    case 'js': case 'jsx': return { icon: FileCode, color: '#eab308' }
    case 'json': return { icon: FileJson, color: '#eab308' }
    case 'md': return { icon: FileText, color: '#a855f7' }
    case 'css': case 'scss': return { icon: FileCode, color: '#ec4899' }
    case 'py': return { icon: FileCode, color: '#3b82f6' }
    default: return { icon: File, color: 'var(--color-text-tertiary)' }
  }
}

export function EditorTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onPinTab }: Props) {
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)

  if (tabs.length === 0) return null

  return (
    <>
      <div style={{
        height: 35, minHeight: 35,
        display: 'flex', alignItems: 'stretch',
        background: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          const fileName = tab.filePath.split('/').pop() || tab.filePath
          const { icon: FileIcon, color: iconColor } = getFileIcon(tab.filePath)

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => onPinTab(tab.id)}
              onContextMenu={e => {
                e.preventDefault()
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px',
                minWidth: 0, maxWidth: 180,
                cursor: 'pointer',
                borderRight: '1px solid var(--color-border-subtle)',
                borderTop: isActive
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
                background: isActive ? 'var(--color-bg)' : 'var(--color-bg-secondary)',
                transition: `background var(--duration-fast)`,
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'var(--color-bg-secondary)'
              }}
            >
              {tab.isModified ? (
                <span style={{
                  width: 8, height: 8, minWidth: 8,
                  borderRadius: '50%',
                  background: 'var(--color-text-secondary)',
                }} />
              ) : (
                <FileIcon size={14} strokeWidth={1.5} style={{ color: isActive ? iconColor : 'var(--color-text-tertiary)', minWidth: 14 }} />
              )}
              <span style={{
                fontSize: 12,
                color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontStyle: tab.isPinned ? 'normal' : 'italic',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
              }} title={tab.filePath}>
                {fileName}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.id) }}
                style={{
                  width: 16, height: 16, minWidth: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                  opacity: isActive || tab.isModified ? 1 : 0,
                  transition: `opacity var(--duration-fast)`,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--color-surface-hover)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                }}
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' as any }}
            onClick={() => setContextMenu(null)}
          />
          <div style={{
            position: 'fixed',
            left: contextMenu.x, top: contextMenu.y,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 0',
            boxShadow: 'var(--shadow-float)',
            zIndex: 'var(--z-dropdown)' as any,
            minWidth: 160,
          }}>
            {[
              { label: 'Close', action: () => onCloseTab(contextMenu.tabId) },
              { label: 'Close Others', action: () => {
                tabs.forEach(t => { if (t.id !== contextMenu.tabId) onCloseTab(t.id) })
              }},
              { label: 'Close All', action: () => {
                tabs.forEach(t => onCloseTab(t.id))
              }},
            ].map(item => (
              <button
                key={item.label}
                onClick={() => { item.action(); setContextMenu(null) }}
                style={{
                  display: 'block', width: '100%',
                  padding: '6px 12px',
                  background: 'none', border: 'none',
                  fontSize: 12, color: 'var(--color-text)',
                  textAlign: 'left', cursor: 'pointer',
                  transition: `background var(--duration-fast)`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-active)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
