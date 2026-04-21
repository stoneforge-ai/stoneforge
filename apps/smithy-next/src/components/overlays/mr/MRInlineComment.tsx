import { useState } from 'react'
import { Send, CheckCircle } from 'lucide-react'
import type { InlineReviewComment } from './mr-types'
import { MRSuggestedChange } from './MRSuggestedChange'
import { RichTextEditor } from './RichTextEditor'

interface MRInlineCommentProps {
  comments: InlineReviewComment[]
  onAddComment?: (content: string) => void
}

export function MRInlineComment({ comments, onAddComment }: MRInlineCommentProps) {
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)

  return (
    <div style={{
      margin: '0 24px 4px 24px', background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      {comments.map((c, i) => (
        <div key={i} style={{ padding: '10px 12px', borderBottom: i < comments.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {c.content}
          </div>
          {c.suggestion && (
            <MRSuggestedChange suggestion={c.suggestion} />
          )}
        </div>
      ))}

      {/* Reply area */}
      {replying ? (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <RichTextEditor value={replyText} onChange={setReplyText} placeholder="Reply..." minHeight={50} maxHeight={120} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button onClick={() => { setReplying(false); setReplyText('') }} style={{ height: 24, padding: '0 8px', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
            <button style={{ height: 24, padding: '0 8px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Reply</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setReplying(true)}
          style={{
            display: 'block', width: '100%', padding: '6px 12px', borderTop: '1px solid var(--color-border-subtle)',
            background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          Reply...
        </button>
      )}
    </div>
  )
}
