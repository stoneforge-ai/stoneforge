import React, { useEffect, useRef } from 'react'
import Prism from 'prismjs'

// Load language grammars
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-diff'

// ── Dark theme (One Dark inspired, matching our design tokens) ──
const THEME_CSS = `
/* ── Base ── */
code[class*="language-"],
pre[class*="language-"] {
  text-shadow: none;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  tab-size: 2;
  hyphens: none;
  white-space: pre;
  word-spacing: normal;
  word-break: normal;
  word-wrap: normal;
}
.token.important,
.token.bold { font-weight: bold; }
.token.italic { font-style: italic; }

/* ── Dark theme (One Dark) ── */
.dark code[class*="language-"],
.dark pre[class*="language-"] { color: #abb2bf; }

.dark .token.comment, .dark .token.prolog,
.dark .token.doctype, .dark .token.cdata { color: #5c6370; font-style: italic; }
.dark .token.punctuation { color: #abb2bf; }
.dark .token.property, .dark .token.tag,
.dark .token.constant, .dark .token.symbol,
.dark .token.deleted { color: #e06c75; }
.dark .token.boolean, .dark .token.number { color: #d19a66; }
.dark .token.selector, .dark .token.attr-name,
.dark .token.string, .dark .token.char,
.dark .token.builtin, .dark .token.inserted { color: #98c379; }
.dark .token.operator, .dark .token.entity,
.dark .token.url { color: #56b6c2; }
.dark .token.atrule, .dark .token.attr-value,
.dark .token.keyword { color: #c678dd; }
.dark .token.function, .dark .token.class-name { color: #61afef; }
.dark .token.regex, .dark .token.important,
.dark .token.variable { color: #e06c75; }

/* ── Light theme (GitHub-inspired) ── */
:root:not(.dark) code[class*="language-"],
:root:not(.dark) pre[class*="language-"] { color: #24292f; }

:root:not(.dark) .token.comment, :root:not(.dark) .token.prolog,
:root:not(.dark) .token.doctype, :root:not(.dark) .token.cdata { color: #6a737d; font-style: italic; }
:root:not(.dark) .token.punctuation { color: #24292f; }
:root:not(.dark) .token.property, :root:not(.dark) .token.tag,
:root:not(.dark) .token.constant, :root:not(.dark) .token.symbol,
:root:not(.dark) .token.deleted { color: #e36209; }
:root:not(.dark) .token.boolean, :root:not(.dark) .token.number { color: #005cc5; }
:root:not(.dark) .token.selector, :root:not(.dark) .token.attr-name,
:root:not(.dark) .token.string, :root:not(.dark) .token.char,
:root:not(.dark) .token.builtin, :root:not(.dark) .token.inserted { color: #032f62; }
:root:not(.dark) .token.operator, :root:not(.dark) .token.entity,
:root:not(.dark) .token.url { color: #005cc5; }
:root:not(.dark) .token.atrule, :root:not(.dark) .token.attr-value,
:root:not(.dark) .token.keyword { color: #d73a49; }
:root:not(.dark) .token.function, :root:not(.dark) .token.class-name { color: #6f42c1; }
:root:not(.dark) .token.regex, :root:not(.dark) .token.important,
:root:not(.dark) .token.variable { color: #e36209; }
`

// Inject theme CSS once
let themeInjected = false
function ensureTheme() {
  if (themeInjected) return
  themeInjected = true
  const style = document.createElement('style')
  style.textContent = THEME_CSS
  document.head.appendChild(style)
}

// ── Language detection from file path ──
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  css: 'css', json: 'json', sh: 'bash', bash: 'bash',
  py: 'python', rs: 'rust', go: 'go',
  yml: 'yaml', yaml: 'yaml', toml: 'toml',
  md: 'markdown', sql: 'sql',
}

export function detectLanguage(filePath?: string): string {
  if (!filePath) return 'typescript'
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return EXT_TO_LANG[ext] || 'typescript'
}

// ── Highlight a single line (returns React elements) ──
export function highlightLine(content: string, language: string = 'typescript'): React.ReactNode {
  if (!content) return '\u00A0'
  ensureTheme()

  const grammar = Prism.languages[language]
  if (!grammar) return content

  const html = Prism.highlight(content, grammar, language)
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

// ── Highlighted code block (for suggested changes, code in comments) ──
export function HighlightedCode({ code, language = 'typescript', style }: { code: string; language?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    ensureTheme()
  }, [])

  const grammar = Prism.languages[language]
  const html = grammar ? Prism.highlight(code, grammar, language) : escapeHtml(code)

  return (
    <pre
      ref={ref}
      className={`language-${language}`}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
        padding: 8, margin: 0, whiteSpace: 'pre-wrap', overflow: 'auto',
        background: 'var(--color-bg-secondary)',
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
