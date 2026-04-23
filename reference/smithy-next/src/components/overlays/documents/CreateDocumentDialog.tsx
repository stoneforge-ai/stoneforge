import { useState, useEffect, useRef } from 'react'
import { X, FileText, FileCode, FileType, ChevronDown } from 'lucide-react'
import type { Document, Library, ContentType, DocumentCategory } from './doc-types'

interface CreateDocumentDialogProps {
  isOpen: boolean
  libraries: Library[]
  selectedLibraryId: string | null
  onClose: () => void
  onCreate: (doc: Document) => void
}

const categoryOptions: { value: DocumentCategory; label: string }[] = [
  { value: 'spec', label: 'Spec' },
  { value: 'prd', label: 'PRD' },
  { value: 'decision-log', label: 'Decision Log (ADR)' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'how-to', label: 'How-to Guide' },
  { value: 'explanation', label: 'Explanation' },
  { value: 'reference', label: 'Reference' },
  { value: 'runbook', label: 'Runbook' },
  { value: 'meeting-notes', label: 'Meeting Notes' },
  { value: 'changelog', label: 'Changelog' },
  { value: 'post-mortem', label: 'Post-mortem' },
  { value: 'other', label: 'Other' },
]

const contentTypeIcons: Record<ContentType, typeof FileText> = {
  markdown: FileText,
  text: FileType,
  json: FileCode,
}

export function CreateDocumentDialog({ isOpen, libraries, selectedLibraryId, onClose, onCreate }: CreateDocumentDialogProps) {
  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState<ContentType>('markdown')
  const [category, setCategory] = useState<DocumentCategory>('spec')
  const [libraryId, setLibraryId] = useState<string | null>(selectedLibraryId)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setContentType('markdown')
      setCategory('spec')
      setLibraryId(selectedLibraryId)
      setTagInput('')
      setTags([])
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [isOpen, selectedLibraryId])

  if (!isOpen) return null

  const handleCreate = () => {
    const allTags = tagInput.trim() ? [...tags, ...tagInput.split(',').map(t => t.trim()).filter(Boolean)] : tags
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: title.trim() || 'Untitled',
      content: contentType === 'markdown' ? `# ${title.trim() || 'Untitled'}\n\n` : contentType === 'json' ? '{\n  \n}' : '',
      contentType,
      category,
      status: 'active',
      version: 1,
      tags: allTags,
      libraryId,
      createdAt: '2026-04-13',
      updatedAt: '2026-04-13',
      createdBy: 'Adam',
      linkedDocIds: [],
      linkedTaskIds: [],
      linkedMRIds: [],
    }
    onCreate(newDoc)
    onClose()
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const tag = tagInput.trim().replace(/,$/, '')
      if (tag && !tags.includes(tag)) {
        setTags(prev => [...prev, tag])
        setTagInput('')
      }
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  // Build flat library options with indentation
  const libraryOptions: { id: string | null; name: string; depth: number }[] = [{ id: null, name: 'No library', depth: 0 }]
  const addLibChildren = (parentId: string | null, depth: number) => {
    libraries.filter(l => l.parentId === parentId).forEach(l => {
      libraryOptions.push({ id: l.id, name: l.name, depth })
      addLibChildren(l.id, depth + 1)
    })
  }
  addLibChildren(null, 0)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)',
          zIndex: 'var(--z-modal)' as any,
        }}
      />

      {/* Dialog */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 420, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 'var(--z-modal)' as any, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>New Document</span>
          <button
            onClick={onClose}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Title</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Untitled"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              style={{
                width: '100%', height: 32, padding: '0 10px', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
                color: 'var(--color-text)', fontSize: 13, outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          {/* Content Type */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Content type</label>
            <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
              {(['markdown', 'text', 'json'] as ContentType[]).map(ct => {
                const Icon = contentTypeIcons[ct]
                const isActive = contentType === ct
                return (
                  <button
                    key={ct}
                    onClick={() => setContentType(ct)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      padding: '5px 0', border: 'none', borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                      color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                      fontSize: 12, fontWeight: isActive ? 500 : 400, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    <Icon size={12} />
                    {ct.charAt(0).toUpperCase() + ct.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category + Library row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Category */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Category</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as DocumentCategory)}
                  style={{
                    width: '100%', height: 32, padding: '0 28px 0 10px', appearance: 'none',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface)', color: 'var(--color-text)',
                    fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  }}
                >
                  {categoryOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* Library */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Library</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={libraryId || ''}
                  onChange={e => setLibraryId(e.target.value || null)}
                  style={{
                    width: '100%', height: 32, padding: '0 28px 0 10px', appearance: 'none',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface)', color: 'var(--color-text)',
                    fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  }}
                >
                  {libraryOptions.map(opt => (
                    <option key={opt.id || '__none__'} value={opt.id || ''}>
                      {'  '.repeat(opt.depth)}{opt.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Tags</label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px', minHeight: 32,
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)', alignItems: 'center',
            }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 6px', borderRadius: 'var(--radius-full)',
                  background: 'var(--color-primary-subtle)', color: 'var(--color-primary)',
                  fontSize: 11, fontWeight: 500,
                }}>
                  {tag}
                  <X size={10} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => setTags(prev => prev.filter(t => t !== tag))} />
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? 'Add tags (press Enter)' : ''}
                style={{
                  flex: 1, minWidth: 80, border: 'none', background: 'transparent',
                  color: 'var(--color-text)', fontSize: 12, outline: 'none',
                  fontFamily: 'var(--font-sans)', padding: 0,
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px',
          borderTop: '1px solid var(--color-border-subtle)',
        }}>
          <button
            onClick={onClose}
            style={{
              height: 30, padding: '0 14px', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', background: 'transparent',
              color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            style={{
              height: 30, padding: '0 14px', border: 'none',
              borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)',
              color: 'white', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            Create
          </button>
        </div>
      </div>
    </>
  )
}
