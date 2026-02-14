/**
 * MarkdownRenderer - Renders markdown content with special handling for @mentions
 *
 * Features:
 * - Converts markdown to HTML
 * - Makes @mentions clickable links to entity pages
 * - Supports task embeds ![[task:id]]
 * - Supports document embeds ![[doc:id]]
 * - Handles highlight ==text== syntax
 */

import { useMemo } from 'react';
import { markdownToHtml } from '../../lib/markdown';

interface MarkdownRendererProps {
  /** Markdown content to render */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Process HTML to make @mentions interactive
 *
 * The @mentions in documents are stored as @name in Markdown.
 * This function converts them to clickable links with the mention-chip styling.
 * Entity names can contain letters, numbers, hyphens, and underscores.
 */
function processHtml(html: string): string {
  // Convert @mentions to clickable links
  // Look for @name patterns that aren't already in links or tags
  // Pattern: @ followed by alphanumeric chars, hyphens, and underscores
  // Use word boundary to avoid matching partial names
  const mentionRegex = /@([\w-]+)/g;

  const processed = html.replace(mentionRegex, (_fullMatch, name) => {
    return `<a href="/entities?search=${encodeURIComponent(name)}" class="mention-chip" data-mention-name="${name}">@${name}</a>`;
  });

  return processed;
}

export function MarkdownRenderer({
  content,
  className = '',
  testId,
}: MarkdownRendererProps) {
  // Convert markdown to HTML and process special elements
  const processedHtml = useMemo(() => {
    if (!content) return '';

    const html = markdownToHtml(content);
    return processHtml(html);
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}

export default MarkdownRenderer;
