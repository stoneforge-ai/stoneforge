import { useCallback, useEffect, useRef } from 'react'
import { Tldraw, Editor, createShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { mockWhiteboardShapes } from '../../../mock-data'

interface WhiteboardCanvasProps {
  whiteboardId: string
  theme?: 'dark' | 'light'
}

export function WhiteboardCanvas({ whiteboardId, theme }: WhiteboardCanvasProps) {
  const editorRef = useRef<Editor | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    const content = mockWhiteboardShapes.find(c => c.whiteboardId === whiteboardId)
    if (content && content.shapes.length > 0) {
      const shapes = content.shapes.map((s, i) => ({
        id: createShapeId(`${whiteboardId}-${i}`),
        type: s.type as any,
        x: s.x,
        y: s.y,
        props: s.props,
      }))
      editor.createShapes(shapes)
      editor.zoomToFit({ animation: { duration: 0 } })
      editor.zoomOut()
    }

    editor.user.updateUserPreferences({ colorScheme: theme || 'light' })
    editor.updateInstanceState({ isReadonly: true })
  }, [whiteboardId])

  // Sync theme changes to tldraw
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.user.updateUserPreferences({ colorScheme: theme || 'light' })
    }
  }, [theme])

  return (
    <div style={{ position: 'absolute', inset: 0 }} className="whiteboard-canvas-wrapper">
      <Tldraw
        onMount={handleMount}
        hideUi
      />
    </div>
  )
}
