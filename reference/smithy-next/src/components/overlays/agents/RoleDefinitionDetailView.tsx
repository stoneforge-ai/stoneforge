import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2, MoreHorizontal, ChevronDown, ChevronRight, X, Plus, Copy, Code, AlertTriangle } from 'lucide-react'
import type { RoleDefinition, RoleDefinitionCategory, WorkspaceResourceRef, HookBinding, HookEvent } from './agent-types'
import { DEFAULT_TOOL_NAMES, HOOK_EVENT_CATEGORIES } from './agent-types'

interface RoleDefinitionDetailViewProps {
  roleDefinition: RoleDefinition
  onBack: () => void
  onSave?: (updated: RoleDefinition) => void
  onDelete?: (id: string) => void
  isNew?: boolean
  onOpenInEditor?: (path: string) => void
}

const categoryBadgeColors: Record<string, { bg: string; text: string }> = {
  orchestrator: { bg: 'rgba(124,58,237,0.1)', text: '#7c3aed' },
  executor: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  reviewer: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
}

function getCategoryBadge(category?: RoleDefinitionCategory) {
  if (!category) return { bg: 'var(--color-surface)', text: 'var(--color-text-secondary)' }
  return categoryBadgeColors[category] || { bg: 'var(--color-surface)', text: 'var(--color-text-secondary)' }
}

const inputStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical' as const,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6,
}

const sectionLabelStyle: React.CSSProperties = {
  ...labelStyle,
  display: 'flex', alignItems: 'center', gap: 6,
}

// ── Shared resource list item for view mode ──
function ResourceViewItem({ name, path, description, onOpenInEditor }: {
  name: string; path: string; description?: string; onOpenInEditor?: (path: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{name}</div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{description}</div>}
      </div>
      {onOpenInEditor && (
        <button
          onClick={() => onOpenInEditor(path)}
          title="Open in Editor"
          style={{
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Code size={12} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

// ── Editable resource ref row ──
function ResourceEditRow({ item, onChange, onRemove, onOpenInEditor, namePlaceholder, pathPlaceholder }: {
  item: WorkspaceResourceRef
  onChange: (updated: WorkspaceResourceRef) => void
  onRemove: () => void
  onOpenInEditor?: (path: string) => void
  namePlaceholder?: string
  pathPlaceholder?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={item.name}
            onChange={e => onChange({ ...item, name: e.target.value })}
            placeholder={namePlaceholder || 'Name'}
            style={{ ...inputStyle, height: 28, fontSize: 11, flex: 1 }}
          />
          <input
            value={item.path}
            onChange={e => onChange({ ...item, path: e.target.value })}
            placeholder={pathPlaceholder || 'File path'}
            style={{ ...inputStyle, height: 28, fontSize: 11, fontFamily: 'var(--font-mono)', flex: 2 }}
          />
        </div>
        <input
          value={item.description || ''}
          onChange={e => onChange({ ...item, description: e.target.value || undefined })}
          placeholder="Description (optional)"
          style={{ ...inputStyle, height: 26, fontSize: 11 }}
        />
      </div>
      {onOpenInEditor && item.path && (
        <button
          onClick={() => onOpenInEditor(item.path)}
          title="Open in Editor"
          style={{
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Code size={12} strokeWidth={1.5} />
        </button>
      )}
      <button
        onClick={onRemove}
        style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-danger)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Hook edit row ──
function HookEditRow({ hook, onChange, onRemove, onOpenInEditor }: {
  hook: HookBinding
  onChange: (updated: HookBinding) => void
  onRemove: () => void
  onOpenInEditor?: (path: string) => void
}) {
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!eventDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setEventDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [eventDropdownOpen])

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Event selector */}
          <div style={{ position: 'relative', flex: 1 }} ref={dropdownRef}>
            <button
              onClick={() => setEventDropdownOpen(!eventDropdownOpen)}
              style={{
                ...inputStyle, height: 28, fontSize: 11, fontFamily: 'var(--font-mono)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ color: hook.event ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
                {hook.event || 'Select event...'}
              </span>
              <ChevronDown size={10} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
            </button>
            {eventDropdownOpen && (
              <div style={{
                position: 'absolute', top: 32, left: 0, zIndex: 1060, width: 220,
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                padding: 4, maxHeight: 280, overflow: 'auto',
              }}>
                {Object.entries(HOOK_EVENT_CATEGORIES).map(([category, events]) => (
                  <div key={category}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '6px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {category}
                    </div>
                    {events.map(event => (
                      <button
                        key={event}
                        onClick={() => { onChange({ ...hook, event }); setEventDropdownOpen(false) }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', padding: '5px 8px',
                          background: hook.event === event ? 'var(--color-primary-subtle)' : 'transparent',
                          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          color: hook.event === event ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                          fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (hook.event !== event) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                        onMouseLeave={e => { if (hook.event !== event) e.currentTarget.style.background = 'transparent' }}
                      >
                        {event}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* File path */}
          <input
            value={hook.path}
            onChange={e => onChange({ ...hook, path: e.target.value })}
            placeholder="File path"
            style={{ ...inputStyle, height: 28, fontSize: 11, fontFamily: 'var(--font-mono)', flex: 2 }}
          />
        </div>
        <input
          value={hook.name || ''}
          onChange={e => onChange({ ...hook, name: e.target.value || undefined })}
          placeholder="Display name (optional)"
          style={{ ...inputStyle, height: 26, fontSize: 11 }}
        />
      </div>
      {onOpenInEditor && hook.path && (
        <button
          onClick={() => onOpenInEditor(hook.path)}
          title="Open in Editor"
          style={{
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Code size={12} strokeWidth={1.5} />
        </button>
      )}
      <button
        onClick={onRemove}
        style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-danger)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Add button ──
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
        background: 'transparent', border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)',
        cursor: 'pointer', fontSize: 11, fontWeight: 500, marginTop: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.borderColor = 'var(--color-text-tertiary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
    >
      <Plus size={11} strokeWidth={2} /> {label}
    </button>
  )
}

export function RoleDefinitionDetailView({ roleDefinition, onBack, onSave, onDelete, isNew, onOpenInEditor }: RoleDefinitionDetailViewProps) {
  const [editing, setEditing] = useState(!!isNew)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Form state — core
  const [formName, setFormName] = useState(roleDefinition.name)
  const [formDescription, setFormDescription] = useState(roleDefinition.description || '')
  const [formCategory, setFormCategory] = useState<string>(roleDefinition.category || '')
  const [formCustomCategory, setFormCustomCategory] = useState(
    roleDefinition.category && !['orchestrator', 'executor', 'reviewer'].includes(roleDefinition.category)
      ? roleDefinition.category : ''
  )
  const [formRolePrompt, setFormRolePrompt] = useState(roleDefinition.rolePrompt)
  const [formTags, setFormTags] = useState<string[]>([...roleDefinition.tags])
  const [formTagInput, setFormTagInput] = useState('')

  // Form state — new fields
  const [formDefaultTools, setFormDefaultTools] = useState<string[]>([...(roleDefinition.defaultTools || [])])
  const [formCustomTools, setFormCustomTools] = useState<WorkspaceResourceRef[]>([...(roleDefinition.customTools || [])])
  const [formSkills, setFormSkills] = useState<WorkspaceResourceRef[]>([...(roleDefinition.skills || [])])
  const [formHooks, setFormHooks] = useState<HookBinding[]>([...(roleDefinition.hooks || [])])
  const [formSystemPromptOverride, setFormSystemPromptOverride] = useState(roleDefinition.systemPromptOverride || '')
  const [systemPromptOverrideEnabled, setSystemPromptOverrideEnabled] = useState(!!roleDefinition.systemPromptOverride)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

  const tagInputRef = useRef<HTMLInputElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Reset form state when toggling edit
  const startEditing = () => {
    setFormName(roleDefinition.name)
    setFormDescription(roleDefinition.description || '')
    setFormCategory(roleDefinition.category || '')
    setFormCustomCategory(
      roleDefinition.category && !['orchestrator', 'executor', 'reviewer'].includes(roleDefinition.category)
        ? roleDefinition.category : ''
    )
    setFormRolePrompt(roleDefinition.rolePrompt)
    setFormTags([...roleDefinition.tags])
    setFormTagInput('')
    setFormDefaultTools([...(roleDefinition.defaultTools || [])])
    setFormCustomTools([...(roleDefinition.customTools || [])])
    setFormSkills([...(roleDefinition.skills || [])])
    setFormHooks([...(roleDefinition.hooks || [])])
    setFormSystemPromptOverride(roleDefinition.systemPromptOverride || '')
    setSystemPromptOverrideEnabled(!!roleDefinition.systemPromptOverride)
    setAdvancedExpanded(false)
    setEditing(true)
  }

  const cancelEditing = () => {
    if (isNew) {
      onBack()
    } else {
      setEditing(false)
    }
  }

  const handleSave = () => {
    const resolvedCategory = formCategory === 'custom' ? (formCustomCategory || undefined) : (formCategory || undefined)
    const updated: RoleDefinition = {
      ...roleDefinition,
      name: formName,
      description: formDescription || undefined,
      category: resolvedCategory,
      rolePrompt: formRolePrompt,
      tags: formTags,
      defaultTools: formDefaultTools.length > 0 ? formDefaultTools : undefined,
      customTools: formCustomTools.length > 0 ? formCustomTools : undefined,
      skills: formSkills.length > 0 ? formSkills : undefined,
      hooks: formHooks.length > 0 ? formHooks : undefined,
      systemPromptOverride: systemPromptOverrideEnabled && formSystemPromptOverride ? formSystemPromptOverride : undefined,
      updatedAt: new Date().toISOString(),
    }
    onSave?.(updated)
    setEditing(false)
  }

  // Default tools helpers
  const allDefaultToolsSelected = formDefaultTools.length === DEFAULT_TOOL_NAMES.length
  const noDefaultToolsSelected = formDefaultTools.length === 0
  const toggleDefaultTool = (tool: string) => {
    setFormDefaultTools(prev =>
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    )
  }
  const toggleAllDefaultTools = () => {
    if (allDefaultToolsSelected) {
      setFormDefaultTools([])
    } else {
      setFormDefaultTools([...DEFAULT_TOOL_NAMES])
    }
  }

  const badge = getCategoryBadge(roleDefinition.category)
  const hasCustomTools = roleDefinition.customTools && roleDefinition.customTools.length > 0
  const hasSkills = roleDefinition.skills && roleDefinition.skills.length > 0
  const hasHooks = roleDefinition.hooks && roleDefinition.hooks.length > 0
  const [viewAdvancedExpanded, setViewAdvancedExpanded] = useState(false)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Back button */}
          <button onClick={onBack} style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0,
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>

          {/* Name */}
          <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0, flexShrink: 0 }}>
            {editing ? (formName || 'New Role Definition') : roleDefinition.name}
          </h1>

          {/* Category badge */}
          {roleDefinition.category && (
            <span style={{
              fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: badge.bg, color: badge.text, flexShrink: 0, textTransform: 'capitalize',
            }}>
              {roleDefinition.category}
            </span>
          )}

          {/* Built-in badge */}
          {roleDefinition.builtIn && (
            <span style={{
              fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', flexShrink: 0,
            }}>
              Built-in
            </span>
          )}

          <div style={{ flex: 1, minWidth: 0 }} />

          {/* Action buttons */}
          {editing ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button onClick={cancelEditing} style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                Cancel
              </button>
              <button onClick={handleSave} style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                Save
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {/* Edit button */}
              <button onClick={startEditing} style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Pencil size={11} strokeWidth={1.5} /> Edit
              </button>

              {/* Delete button */}
              <button
                onClick={() => !roleDefinition.builtIn && onDelete?.(roleDefinition.id)}
                disabled={roleDefinition.builtIn}
                style={{
                  height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                  background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-danger)', cursor: roleDefinition.builtIn ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 500,
                  opacity: roleDefinition.builtIn ? 0.3 : 1,
                }}
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>

              {/* More menu */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setMenuOpen(!menuOpen)} style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-tertiary)', cursor: 'pointer',
                }}>
                  <MoreHorizontal size={13} strokeWidth={1.5} />
                </button>
                {menuOpen && (
                  <div ref={menuRef} style={{
                    position: 'absolute', top: 32, right: 0, zIndex: 1060,
                    width: 160, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
                  }}>
                    <MenuItem icon={<Copy size={12} strokeWidth={1.5} />} label="Duplicate" onClick={() => setMenuOpen(false)} />
                    <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                    <MenuItem label="Export as JSON" onClick={() => setMenuOpen(false)} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {editing ? (
          /* ── Edit Mode ── */
          <>
            {/* Name */}
            <div>
              <div style={labelStyle}>Name</div>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Frontend Specialist" style={inputStyle} />
            </div>

            {/* Description */}
            <div>
              <div style={labelStyle}>Description</div>
              <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={3} placeholder="Brief description of what this role does..." style={textareaStyle} />
            </div>

            {/* Category */}
            <div>
              <div style={labelStyle}>Category</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['orchestrator', 'executor', 'reviewer', 'custom'] as const).map(cat => {
                  const isActive = cat === 'custom'
                    ? (formCategory === 'custom' || (formCategory && !['orchestrator', 'executor', 'reviewer'].includes(formCategory)))
                    : formCategory === cat
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        if (cat === 'custom') {
                          setFormCategory('custom')
                        } else {
                          setFormCategory(cat)
                          setFormCustomCategory('')
                        }
                      }}
                      style={{
                        height: 28, padding: '0 12px', fontSize: 11, fontWeight: 500, border: 'none',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', textTransform: 'capitalize',
                        background: isActive ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                        color: isActive ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                      }}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
              {(formCategory === 'custom' || (formCategory && !['orchestrator', 'executor', 'reviewer'].includes(formCategory))) && (
                <input
                  value={formCustomCategory}
                  onChange={e => setFormCustomCategory(e.target.value)}
                  placeholder="Custom category name..."
                  style={{ ...inputStyle, marginTop: 8, maxWidth: 240 }}
                />
              )}
            </div>

            {/* Role Prompt */}
            <div>
              <div style={labelStyle}>Role Prompt</div>
              <textarea
                value={formRolePrompt}
                onChange={e => setFormRolePrompt(e.target.value)}
                rows={6}
                placeholder="Instructions sent to the agent at the start of each session. Define the role's behavior, constraints, and approach..."
                style={{
                  ...textareaStyle,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  minHeight: 120,
                }}
              />
            </div>

            {/* Tags */}
            <div>
              <div style={labelStyle}>Tags</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {formTags.map(tag => (
                  <span key={tag} style={{ fontSize: 11, padding: '3px 6px 3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {tag}
                    <X size={10} strokeWidth={2} style={{ cursor: 'pointer', color: 'var(--color-text-tertiary)' }} onClick={() => setFormTags(prev => prev.filter(t => t !== tag))} />
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  value={formTagInput}
                  onChange={e => {
                    const val = e.target.value
                    if (val.includes(',')) {
                      const parts = val.split(',').map(s => s.trim()).filter(s => s && !formTags.includes(s))
                      if (parts.length) setFormTags(prev => [...prev, ...parts])
                      setFormTagInput('')
                    } else { setFormTagInput(val) }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && formTagInput.trim()) { const t = formTagInput.trim(); if (!formTags.includes(t)) setFormTags(prev => [...prev, t]); setFormTagInput(''); e.preventDefault() }
                    if (e.key === 'Backspace' && !formTagInput && formTags.length > 0) setFormTags(prev => prev.slice(0, -1))
                  }}
                  placeholder={formTags.length === 0 ? 'Add tags (comma-separated)...' : 'Add tag...'}
                  style={{ flex: 1, minWidth: 100, height: 26, padding: '0 6px', fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-text)', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ marginTop: -1, height: 1, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
            </div>

            {/* Default Tools — checkbox grid */}
            <div>
              <div style={{ ...sectionLabelStyle, justifyContent: 'space-between' }}>
                <span>Default Tools</span>
                <button
                  onClick={toggleAllDefaultTools}
                  style={{
                    fontSize: 10, fontWeight: 500, color: 'var(--color-text-accent)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    textTransform: 'none', letterSpacing: 'normal',
                  }}
                >
                  {allDefaultToolsSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              {noDefaultToolsSelected && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
                  No tools selected — all default tools will be enabled
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {DEFAULT_TOOL_NAMES.map(tool => (
                  <label
                    key={tool}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                      cursor: 'pointer', fontSize: 12, color: 'var(--color-text)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formDefaultTools.includes(tool)}
                      onChange={() => toggleDefaultTool(tool)}
                      style={{ accentColor: 'var(--color-primary)', width: 13, height: 13, margin: 0 }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{tool}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom Tools — file path references */}
            <div>
              <div style={labelStyle}>Custom Tools</div>
              {formCustomTools.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                  No custom tools configured
                </div>
              )}
              {formCustomTools.map((tool, i) => (
                <ResourceEditRow
                  key={i}
                  item={tool}
                  onChange={updated => setFormCustomTools(prev => prev.map((t, j) => j === i ? updated : t))}
                  onRemove={() => setFormCustomTools(prev => prev.filter((_, j) => j !== i))}
                  onOpenInEditor={onOpenInEditor}
                  namePlaceholder="Tool name"
                  pathPlaceholder=".stoneforge/tools/my-tool.ts"
                />
              ))}
              <AddButton label="Add Custom Tool" onClick={() => setFormCustomTools(prev => [...prev, { name: '', path: '' }])} />
            </div>

            {/* Skills — file path references */}
            <div>
              <div style={labelStyle}>Skills</div>
              {formSkills.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                  No skills configured
                </div>
              )}
              {formSkills.map((skill, i) => (
                <ResourceEditRow
                  key={i}
                  item={skill}
                  onChange={updated => setFormSkills(prev => prev.map((s, j) => j === i ? updated : s))}
                  onRemove={() => setFormSkills(prev => prev.filter((_, j) => j !== i))}
                  onOpenInEditor={onOpenInEditor}
                  namePlaceholder="Skill name"
                  pathPlaceholder=".stoneforge/skills/my-skill.md"
                />
              ))}
              <AddButton label="Add Skill" onClick={() => setFormSkills(prev => [...prev, { name: '', path: '' }])} />
            </div>

            {/* Hooks — event + file path */}
            <div>
              <div style={labelStyle}>Hooks</div>
              {formHooks.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                  No hooks configured
                </div>
              )}
              {formHooks.map((hook, i) => (
                <HookEditRow
                  key={i}
                  hook={hook}
                  onChange={updated => setFormHooks(prev => prev.map((h, j) => j === i ? updated : h))}
                  onRemove={() => setFormHooks(prev => prev.filter((_, j) => j !== i))}
                  onOpenInEditor={onOpenInEditor}
                />
              ))}
              <AddButton label="Add Hook" onClick={() => setFormHooks(prev => [...prev, { event: 'agent:start' as HookEvent, path: '' }])} />
            </div>

            {/* Advanced — System Prompt Override */}
            <div>
              <button
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, color: 'var(--color-text-secondary)',
                }}
              >
                {advancedExpanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
                <span style={{ ...labelStyle, marginBottom: 0 }}>Advanced</span>
              </button>
              {advancedExpanded && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={systemPromptOverrideEnabled}
                      onChange={e => {
                        setSystemPromptOverrideEnabled(e.target.checked)
                        if (!e.target.checked) setFormSystemPromptOverride('')
                      }}
                      style={{ accentColor: 'var(--color-primary)', width: 13, height: 13, margin: 0 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--color-text)' }}>Override system prompt</span>
                  </label>
                  {systemPromptOverrideEnabled && (
                    <>
                      {/* Warning */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 8px', background: 'rgba(245,158,11,0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <AlertTriangle size={12} strokeWidth={1.5} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
                          Overrides the default provider system prompt. Most roles don't need this.
                        </span>
                      </div>
                      {/* Textarea */}
                      <div style={{ borderLeft: '2px solid rgba(245,158,11,0.3)', paddingLeft: 12 }}>
                        <textarea
                          value={formSystemPromptOverride}
                          onChange={e => setFormSystemPromptOverride(e.target.value)}
                          rows={6}
                          placeholder="Custom system prompt..."
                          style={{
                            ...textareaStyle,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            lineHeight: 1.6,
                            minHeight: 100,
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── View Mode ── */
          <>
            {/* Description */}
            {roleDefinition.description && (
              <div>
                <div style={labelStyle}>Description</div>
                <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
                  {roleDefinition.description}
                </div>
              </div>
            )}

            {/* Role Prompt */}
            <div>
              <div style={labelStyle}>Role Prompt</div>
              <div style={{
                padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-mono)',
                fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto',
              }}>
                {roleDefinition.rolePrompt}
              </div>
            </div>

            {/* Tags */}
            {roleDefinition.tags.length > 0 && (
              <div>
                <div style={labelStyle}>Tags</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {roleDefinition.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Default Tools */}
            <div>
              <div style={labelStyle}>Default Tools</div>
              {roleDefinition.defaultTools && roleDefinition.defaultTools.length > 0 ? (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {roleDefinition.defaultTools.map(tool => (
                    <span key={tool} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {tool}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  All default tools enabled
                </div>
              )}
            </div>

            {/* Custom Tools */}
            {hasCustomTools && (
              <div>
                <div style={labelStyle}>Custom Tools</div>
                {roleDefinition.customTools!.map((tool, i) => (
                  <ResourceViewItem key={i} {...tool} onOpenInEditor={onOpenInEditor} />
                ))}
              </div>
            )}

            {/* Skills */}
            {hasSkills && (
              <div>
                <div style={labelStyle}>Skills</div>
                {roleDefinition.skills!.map((skill, i) => (
                  <ResourceViewItem key={i} {...skill} onOpenInEditor={onOpenInEditor} />
                ))}
              </div>
            )}

            {/* Hooks */}
            {hasHooks && (
              <div>
                <div style={labelStyle}>Hooks</div>
                {roleDefinition.hooks!.map((hook, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0' }}>
                    <span style={{
                      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 500,
                      padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}>
                      {hook.event}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {hook.name && <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{hook.name}</div>}
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {hook.path}
                      </div>
                    </div>
                    {onOpenInEditor && (
                      <button
                        onClick={() => onOpenInEditor(hook.path)}
                        title="Open in Editor"
                        style={{
                          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Code size={12} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Advanced — System Prompt Override (only if set) */}
            {roleDefinition.systemPromptOverride && (
              <div>
                <button
                  onClick={() => setViewAdvancedExpanded(!viewAdvancedExpanded)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, color: 'var(--color-text-secondary)',
                  }}
                >
                  {viewAdvancedExpanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Advanced</span>
                </button>
                {viewAdvancedExpanded && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8, padding: '6px 8px', background: 'rgba(245,158,11,0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <AlertTriangle size={12} strokeWidth={1.5} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
                        Custom system prompt overrides the default provider prompt.
                      </span>
                    </div>
                    <div style={{
                      borderLeft: '2px solid rgba(245,158,11,0.3)', paddingLeft: 12,
                    }}>
                      <div style={{
                        padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-mono)',
                        fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6,
                        whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto',
                      }}>
                        {roleDefinition.systemPromptOverride}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metadata footer */}
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              <span>Created: {new Date(roleDefinition.createdAt).toLocaleDateString()}</span>
              <span>Updated: {new Date(roleDefinition.updatedAt).toLocaleDateString()}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({ label, icon, danger, onClick }: { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {icon}
      {label}
    </button>
  )
}
