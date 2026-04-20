import { ArrowLeft, File, Folder, ChevronRight, ChevronDown, GitBranch } from 'lucide-react'
import { useState } from 'react'

interface EditorOverlayProps {
  onBack: () => void
  filePath?: string | null
  branch?: string | null
}

const mockFileTree = [
  { type: 'folder' as const, name: 'packages', children: [
    { type: 'folder' as const, name: 'smithy', children: [
      { type: 'folder' as const, name: 'src', children: [
        { type: 'folder' as const, name: 'auth', children: [
          { type: 'file' as const, name: 'index.ts' },
          { type: 'file' as const, name: 'pkce.ts', isNew: true },
          { type: 'file' as const, name: 'pkce-callback.ts', isNew: true },
          { type: 'file' as const, name: 'session.ts' },
        ]},
        { type: 'file' as const, name: 'server.ts' },
        { type: 'file' as const, name: 'config.ts' },
      ]},
    ]},
  ]},
  { type: 'folder' as const, name: 'apps', children: [
    { type: 'folder' as const, name: 'smithy-web', children: [
      { type: 'file' as const, name: 'package.json' },
    ]},
  ]},
]

const mockCode = `import { randomBytes, createHash } from 'crypto'

interface PKCEChallenge {
  codeVerifier: string
  codeChallenge: string
  method: 'S256'
}

export function generatePKCEChallenge(): PKCEChallenge {
  const codeVerifier = randomBytes(32)
    .toString('base64url')
    .slice(0, 128)

  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  return {
    codeVerifier,
    codeChallenge,
    method: 'S256',
  }
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(\`Token exchange failed: \${response.status}\`)
  }

  return response.json()
}`

export function EditorOverlay({ onBack, filePath, branch }: EditorOverlayProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['packages', 'packages/smithy', 'packages/smithy/src', 'packages/smithy/src/auth'])
  )

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        height: 44, minHeight: 44,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Editor</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{filePath || 'packages/smithy/src/auth/pkce.ts'}</span>
        {branch && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
            <GitBranch size={11} strokeWidth={1.5} />
            {branch}
          </span>
        )}
      </div>

      {/* Editor body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File tree */}
        <div style={{
          width: 240, minWidth: 240,
          borderRight: '1px solid var(--color-border)',
          overflow: 'auto',
          padding: '8px 0',
        }}>
          {mockFileTree.map(item => (
            <TreeItem
              key={item.name}
              item={item}
              path={item.name}
              depth={0}
              expanded={expandedFolders}
              onToggle={toggleFolder}
            />
          ))}
        </div>

        {/* Code view */}
        <div style={{
          flex: 1, overflow: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.7,
          padding: '12px 0',
        }}>
          {mockCode.split('\n').map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                padding: '0 16px',
                minHeight: 20,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{
                width: 40, minWidth: 40, textAlign: 'right',
                paddingRight: 16,
                color: 'var(--color-text-tertiary)',
                userSelect: 'none',
              }}>
                {i + 1}
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {colorize(line)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TreeItem({ item, path, depth, expanded, onToggle }: {
  item: any
  path: string
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const isFolder = item.type === 'folder'
  const isExpanded = expanded.has(path)

  return (
    <>
      <div
        onClick={() => isFolder && onToggle(path)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          fontSize: 12,
          color: item.isNew ? 'var(--color-success)' : 'var(--color-text-secondary)',
          transition: `background var(--duration-fast)`,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {isFolder ? (
          isExpanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />
        ) : (
          <span style={{ width: 12 }} />
        )}
        {isFolder ? (
          <Folder size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        ) : (
          <File size={14} strokeWidth={1.5} style={{ color: item.isNew ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
        )}
        <span>{item.name}</span>
      </div>
      {isFolder && isExpanded && item.children?.map((child: any) => (
        <TreeItem
          key={child.name}
          item={child}
          path={`${path}/${child.name}`}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

function colorize(line: string): React.ReactNode {
  // Very simple syntax highlighting for demo purposes
  if (line.trim().startsWith('import ') || line.trim().startsWith('export ')) {
    return <span style={{ color: 'var(--color-primary)' }}>{line}</span>
  }
  if (line.trim().startsWith('//')) {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>{line}</span>
  }
  if (line.includes('interface ') || line.includes('type ')) {
    return <span style={{ color: 'var(--color-warning)' }}>{line}</span>
  }
  if (line.includes('function ') || line.includes('async ')) {
    return <span style={{ color: 'var(--color-primary)' }}>{line}</span>
  }
  if (line.includes("'") || line.includes('`')) {
    return <span style={{ color: 'var(--color-success)' }}>{line}</span>
  }
  return line
}
