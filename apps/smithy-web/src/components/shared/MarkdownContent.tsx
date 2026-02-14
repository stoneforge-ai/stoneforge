/**
 * MarkdownContent - Renders markdown content as HTML
 *
 * Used for rendering assistant and user messages in ephemeral agent chat panels.
 * Supports GitHub Flavored Markdown including:
 * - Headers, bold, italic, strikethrough
 * - Code blocks and inline code
 * - Lists (ordered and unordered)
 * - Links and images
 * - Blockquotes
 * - Tables
 */

import { useMemo } from 'react';
import { markdownToHtml } from '../../lib/markdown';

interface MarkdownContentProps {
  /** Markdown content to render */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Test ID for testing */
  'data-testid'?: string;
}

export function MarkdownContent({
  content,
  className = '',
  'data-testid': testId,
}: MarkdownContentProps) {
  const html = useMemo(() => {
    if (!content) return '';
    return markdownToHtml(content);
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <div
      className={`markdown-content ${className}`}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
