/**
 * Markdown conversion utilities for the message editor.
 *
 * This module provides functions to convert between HTML and Markdown,
 * enabling a Markdown-first architecture where:
 * - Content is stored as Markdown for AI agent compatibility
 * - Tiptap editor works with HTML internally
 * - Conversions happen at the boundary (load/save)
 *
 * Key benefits:
 * - AI agents can read/write documents naturally without schema knowledge
 * - Markdown is 3-5x more compact than structured JSON
 * - Universal interoperability with GitHub, external tools, other AI systems
 */

import TurndownService from 'turndown';
import { marked } from 'marked';

// Configure Turndown for HTML → Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx', // Use # style headings
  codeBlockStyle: 'fenced', // Use ``` style code blocks
  bulletListMarker: '-', // Use - for bullet lists
  emDelimiter: '_', // Use _ for italic
  strongDelimiter: '**', // Use ** for bold
});

// Add custom rules for Tiptap-specific elements

// Handle <mark> (highlight) elements - convert to ==text== (custom syntax)
turndownService.addRule('highlight', {
  filter: 'mark',
  replacement: function (content: string) {
    return '==' + content + '==';
  },
});

// Handle <s> (strikethrough) elements - convert to ~~text~~ (GFM syntax)
turndownService.addRule('strikethrough', {
  filter: function (node: HTMLElement) {
    return node.nodeName === 'S' || node.nodeName === 'DEL';
  },
  replacement: function (content: string) {
    return '~~' + content + '~~';
  },
});

// Handle task embeds - convert to ![[task:id]] syntax
turndownService.addRule('taskEmbed', {
  filter: function (node: HTMLElement) {
    return (
      node.nodeName === 'DIV' &&
      node.hasAttribute('data-type') &&
      node.getAttribute('data-type') === 'taskEmbed'
    );
  },
  replacement: function (_content: string, node: HTMLElement) {
    const taskId = node.getAttribute('data-task-id');
    return taskId ? `![[task:${taskId}]]` : '';
  },
});

// Handle document embeds - convert to ![[doc:id]] syntax
turndownService.addRule('documentEmbed', {
  filter: function (node: HTMLElement) {
    return (
      node.nodeName === 'DIV' &&
      node.hasAttribute('data-type') &&
      node.getAttribute('data-type') === 'documentEmbed'
    );
  },
  replacement: function (_content: string, node: HTMLElement) {
    const documentId = node.getAttribute('data-document-id');
    return documentId ? `![[doc:${documentId}]]` : '';
  },
});

// Handle @mentions - convert to @name syntax
turndownService.addRule('mention', {
  filter: function (node: HTMLElement) {
    return (
      node.nodeName === 'A' &&
      node.hasAttribute('data-mention-id')
    );
  },
  replacement: function (_content: string, node: HTMLElement) {
    const name = node.getAttribute('data-mention-name');
    return name ? `@${name}` : '';
  },
});

// Handle text alignment - preserve style="text-align: ..." on paragraphs and headings
// For non-left alignment, wrap content in a div with align attribute
turndownService.addRule('textAlign', {
  filter: function (node: HTMLElement) {
    if (!['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.nodeName)) {
      return false;
    }
    const style = node.getAttribute('style') || '';
    return /text-align:\s*(center|right|justify)/i.test(style);
  },
  replacement: function (content: string, node: HTMLElement) {
    const style = node.getAttribute('style') || '';
    const alignMatch = style.match(/text-align:\s*(center|right|justify)/i);
    if (!alignMatch) return content;

    const alignment = alignMatch[1].toLowerCase();
    const nodeName = node.nodeName.toLowerCase();

    // Generate the markdown content
    if (nodeName.startsWith('h')) {
      // Return as HTML to preserve alignment
      return `<${nodeName} style="text-align: ${alignment}">${content}</${nodeName}>\n\n`;
    }

    // For paragraphs, wrap in a div with alignment
    return `<p style="text-align: ${alignment}">${content}</p>\n\n`;
  },
});

// Configure marked for Markdown → HTML conversion
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Convert HTML content from Tiptap editor to Markdown.
 *
 * @param html - HTML string from editor.getHTML()
 * @returns Markdown string
 */
export function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') {
    return '';
  }

  // Use turndown to convert HTML to Markdown
  let markdown = turndownService.turndown(html);

  // Clean up extra whitespace while preserving intentional line breaks
  markdown = markdown.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  return markdown;
}

/**
 * Convert Markdown content to HTML for Tiptap editor.
 *
 * @param markdown - Markdown string
 * @returns HTML string suitable for Tiptap
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) {
    return '<p></p>';
  }

  // Pre-process: convert custom embed syntax to HTML
  let processed = markdown;

  // Convert task embeds: ![[task:id]] → <div data-type="taskEmbed" data-task-id="id"></div>
  processed = processed.replace(
    /!\[\[task:([\w-]+)\]\]/g,
    '<div data-type="taskEmbed" data-task-id="$1"></div>'
  );

  // Convert document embeds: ![[doc:id]] → <div data-type="documentEmbed" data-document-id="id"></div>
  processed = processed.replace(
    /!\[\[doc:([\w-]+)\]\]/g,
    '<div data-type="documentEmbed" data-document-id="$1"></div>'
  );

  // Convert highlight syntax: ==text== → <mark>text</mark>
  processed = processed.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // Convert strikethrough: ~~text~~ → <s>text</s>
  // Note: marked converts to <del>, but Tiptap uses <s>, so we do it ourselves
  processed = processed.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Use marked to convert Markdown to HTML
  const html = marked.parse(processed, { async: false }) as string;

  return html;
}

/**
 * Check if a string appears to be HTML content.
 * Used to detect legacy HTML content that needs to be converted.
 *
 * @param content - String to check
 * @returns true if content appears to be HTML
 */
export function isHtmlContent(content: string): boolean {
  if (!content) return false;
  // Check for common HTML elements used by Tiptap
  return /<(p|h[1-6]|ul|ol|li|blockquote|pre|code|strong|em|mark|s|br|hr|div)\b/i.test(content);
}

/**
 * Check if a string appears to be Markdown content.
 * Looks for common Markdown patterns.
 *
 * @param content - String to check
 * @returns true if content appears to be Markdown
 */
export function isMarkdownContent(content: string): boolean {
  if (!content) return false;
  // Check for common Markdown patterns
  return (
    /^#{1,6}\s/.test(content) || // Headings
    /^\s*[-*+]\s/.test(content) || // Bullet lists
    /^\s*\d+\.\s/.test(content) || // Numbered lists
    /\*\*[^*]+\*\*/.test(content) || // Bold
    /_[^_]+_/.test(content) || // Italic
    /`[^`]+`/.test(content) || // Inline code
    /```[\s\S]*```/.test(content) || // Code blocks
    /^\s*>/.test(content) || // Blockquotes
    /!\[\[(?:task|doc):[\w-]+\]\]/.test(content) // Embeds
  );
}

/**
 * Normalize content for comparison, removing insignificant whitespace.
 *
 * @param content - Content to normalize
 * @returns Normalized content
 */
export function normalizeContent(content: string): string {
  if (!content) return '';
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Convert legacy HTML content to Markdown for migration.
 * This should be used when loading documents that were saved as HTML.
 *
 * @param content - Possibly HTML content
 * @returns Markdown content
 */
export function migrateToMarkdown(content: string): string {
  if (!content) return '';

  // If already Markdown-like, return as-is
  if (!isHtmlContent(content)) {
    return content;
  }

  // Convert HTML to Markdown
  return htmlToMarkdown(content);
}

/**
 * Prepare content for editing - converts Markdown to HTML for Tiptap.
 *
 * @param content - Content from storage (Markdown)
 * @param contentType - Document content type
 * @returns HTML for Tiptap editor
 */
export function prepareContentForEditor(content: string, contentType: string): string {
  if (!content) return '<p></p>';

  // For JSON content, wrap in code block
  if (contentType === 'json') {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      return `<pre><code class="language-json">${escapeHtml(formatted)}</code></pre>`;
    } catch {
      return `<pre><code>${escapeHtml(content)}</code></pre>`;
    }
  }

  // For markdown content, convert to HTML
  if (contentType === 'markdown' || !isHtmlContent(content)) {
    return markdownToHtml(content);
  }

  // Legacy HTML content - return as-is for backwards compatibility
  // but also try converting it to markdown and back to normalize it
  return content;
}

/**
 * Prepare content for storage - converts HTML to Markdown.
 *
 * @param html - HTML from Tiptap editor
 * @param contentType - Document content type
 * @returns Markdown for storage
 */
export function prepareContentForStorage(html: string, contentType: string): string {
  if (!html || html === '<p></p>') return '';

  // For JSON content, extract from code block
  if (contentType === 'json') {
    // Try to extract JSON from code block
    const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
    if (codeMatch) {
      return unescapeHtml(codeMatch[1]);
    }
    return html;
  }

  // For markdown content type, convert HTML to Markdown
  if (contentType === 'markdown') {
    return htmlToMarkdown(html);
  }

  // For text content type, also convert to Markdown
  // This ensures consistent storage format
  return htmlToMarkdown(html);
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Unescape HTML special characters.
 */
function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
