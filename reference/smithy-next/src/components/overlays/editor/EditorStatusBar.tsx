import type { EditorFileContent } from './editor-mock-data'

interface Props {
  fileInfo: EditorFileContent | null
  cursorLine: number
  cursorCol: number
  /** null = in folder view */
  isFolder: boolean
  folderFileCount?: number
  branch?: string | null
}

export function EditorStatusBar({ fileInfo, cursorLine, cursorCol, isFolder, folderFileCount, branch }: Props) {
  return (
    <div style={{
      height: 24, minHeight: 24,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      borderTop: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-secondary)',
      fontSize: 11,
      color: 'var(--color-text-tertiary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isFolder ? (
          <span>{folderFileCount ?? 0} items</span>
        ) : fileInfo ? (
          <span>Ln {cursorLine}, Col {cursorCol}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {!isFolder && fileInfo && (
          <>
            <span>{fileInfo.language}</span>
            <span>UTF-8</span>
            <span>LF</span>
          </>
        )}
        {isFolder && branch && (
          <span style={{ fontFamily: 'var(--font-mono)' }}>{branch}</span>
        )}
      </div>
    </div>
  )
}
