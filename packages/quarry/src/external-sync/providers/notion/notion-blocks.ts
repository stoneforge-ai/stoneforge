/**
 * Notion Blocks ↔ Markdown Converter
 *
 * Bidirectional converter between markdown text and Notion block format.
 * Internal module with no external dependencies.
 *
 * Supported conversions:
 * - Paragraphs ↔ paragraph blocks
 * - Headings (# ## ###) ↔ heading_1, heading_2, heading_3 blocks
 * - Bulleted lists (- or *) ↔ bulleted_list_item blocks
 * - Numbered lists (1. 2. 3.) ↔ numbered_list_item blocks
 * - Code blocks (```) ↔ code blocks (with language annotation)
 * - Blockquotes (>) ↔ quote blocks
 * - Checkboxes (- [ ] / - [x]) ↔ to_do blocks
 * - Rich text: **bold**, *italic*, `inline code`, [links](url)
 */

import type {
  NotionBlock,
  NotionRichText,
  NotionAnnotations,
} from './notion-types.js';
import { DEFAULT_ANNOTATIONS } from './notion-types.js';

// ============================================================================
// Markdown → Notion Blocks
// ============================================================================

/**
 * Convert markdown text to an array of Notion blocks.
 *
 * Parses markdown line-by-line, recognizing headings, lists, code blocks,
 * blockquotes, checkboxes, and paragraphs. Rich text formatting (bold,
 * italic, inline code, links) is preserved within each block.
 */
export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  if (!markdown || markdown.trim() === '') {
    return [];
  }

  const lines = markdown.split('\n');
  const blocks: NotionBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (fenced with ```)
    if (line.trimStart().startsWith('```')) {
      const indent = line.indexOf('```');
      const langMatch = line.slice(indent + 3).trim();
      const language = langMatch || 'plain text';
      const codeLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }

      // Skip closing ```
      if (i < lines.length) {
        i++;
      }

      blocks.push(createCodeBlock(codeLines.join('\n'), language));
      continue;
    }

    // Empty line — skip (paragraph breaks are implicit)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Heading (# ## ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2];
      blocks.push(createHeadingBlock(level, text));
      i++;
      continue;
    }

    // Checkbox (- [ ] or - [x] or * [ ] or * [x])
    const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      const text = checkboxMatch[2];
      blocks.push(createToDoBlock(text, checked));
      i++;
      continue;
    }

    // Bulleted list (- or *)
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[1];
      blocks.push(createBulletedListItemBlock(text));
      i++;
      continue;
    }

    // Numbered list (1. 2. etc.)
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      const text = numberedMatch[1];
      blocks.push(createNumberedListItemBlock(text));
      i++;
      continue;
    }

    // Blockquote (>)
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      // Collect consecutive blockquote lines
      const quoteLines: string[] = [quoteMatch[1]];
      i++;
      while (i < lines.length && lines[i].match(/^>\s?(.*)/)) {
        const nextQuoteMatch = lines[i].match(/^>\s?(.*)$/);
        if (nextQuoteMatch) {
          quoteLines.push(nextQuoteMatch[1]);
        }
        i++;
      }
      blocks.push(createQuoteBlock(quoteLines.join('\n')));
      continue;
    }

    // Paragraph (default)
    // Collect consecutive non-empty, non-special lines as a single paragraph
    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      // Stop paragraph on empty line or any special syntax
      if (
        nextLine.trim() === '' ||
        nextLine.match(/^#{1,3}\s+/) ||
        nextLine.match(/^[-*]\s+/) ||
        nextLine.match(/^\d+\.\s+/) ||
        nextLine.match(/^>\s?/) ||
        nextLine.trimStart().startsWith('```')
      ) {
        break;
      }
      paragraphLines.push(nextLine);
      i++;
    }
    blocks.push(createParagraphBlock(paragraphLines.join('\n')));
  }

  return blocks;
}

// ============================================================================
// Notion Blocks → Markdown
// ============================================================================

/**
 * Convert Notion blocks back to a markdown string.
 *
 * Handles all supported block types. Unsupported block types produce
 * a fallback `[Unsupported: {type}]` text.
 */
export function notionBlocksToMarkdown(blocks: readonly NotionBlock[]): string {
  if (!blocks || blocks.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = i > 0 ? blocks[i - 1] : null;

    // Add blank line between blocks of different types,
    // but not between consecutive list items of the same type
    if (prevBlock && i > 0) {
      const needsBlankLine = !isSameListType(prevBlock.type, block.type);
      if (needsBlankLine) {
        lines.push('');
      }
    }

    const markdown = blockToMarkdown(block);
    if (markdown !== null) {
      lines.push(markdown);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Block Creation Helpers (markdown → Notion)
// ============================================================================

function createParagraphBlock(text: string): NotionBlock {
  return {
    type: 'paragraph',
    paragraph: {
      rich_text: parseInlineMarkdown(text),
    },
  };
}

function createHeadingBlock(level: 1 | 2 | 3, text: string): NotionBlock {
  const type = `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3';
  return {
    type,
    [type]: {
      rich_text: parseInlineMarkdown(text),
    },
  } as NotionBlock;
}

function createBulletedListItemBlock(text: string): NotionBlock {
  return {
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: parseInlineMarkdown(text),
    },
  };
}

function createNumberedListItemBlock(text: string): NotionBlock {
  return {
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: parseInlineMarkdown(text),
    },
  };
}

function createCodeBlock(code: string, language: string): NotionBlock {
  return {
    type: 'code',
    code: {
      rich_text: [createPlainRichText(code)],
      language: normalizeLanguage(language),
    },
  };
}

function createQuoteBlock(text: string): NotionBlock {
  return {
    type: 'quote',
    quote: {
      rich_text: parseInlineMarkdown(text),
    },
  };
}

function createToDoBlock(text: string, checked: boolean): NotionBlock {
  return {
    type: 'to_do',
    to_do: {
      rich_text: parseInlineMarkdown(text),
      checked,
    },
  };
}

// ============================================================================
// Block → Markdown Helpers
// ============================================================================

function blockToMarkdown(block: NotionBlock): string | null {
  switch (block.type) {
    case 'paragraph': {
      const b = block as { type: 'paragraph'; paragraph: { rich_text: readonly NotionRichText[] } };
      return richTextToMarkdown(b.paragraph.rich_text);
    }
    case 'heading_1': {
      const b = block as { type: 'heading_1'; heading_1: { rich_text: readonly NotionRichText[] } };
      return `# ${richTextToMarkdown(b.heading_1.rich_text)}`;
    }
    case 'heading_2': {
      const b = block as { type: 'heading_2'; heading_2: { rich_text: readonly NotionRichText[] } };
      return `## ${richTextToMarkdown(b.heading_2.rich_text)}`;
    }
    case 'heading_3': {
      const b = block as { type: 'heading_3'; heading_3: { rich_text: readonly NotionRichText[] } };
      return `### ${richTextToMarkdown(b.heading_3.rich_text)}`;
    }
    case 'bulleted_list_item': {
      const b = block as { type: 'bulleted_list_item'; bulleted_list_item: { rich_text: readonly NotionRichText[] } };
      return `- ${richTextToMarkdown(b.bulleted_list_item.rich_text)}`;
    }
    case 'numbered_list_item': {
      const b = block as { type: 'numbered_list_item'; numbered_list_item: { rich_text: readonly NotionRichText[] } };
      return `1. ${richTextToMarkdown(b.numbered_list_item.rich_text)}`;
    }
    case 'code': {
      const b = block as { type: 'code'; code: { rich_text: readonly NotionRichText[]; language: string } };
      const lang = b.code.language === 'plain text' ? '' : b.code.language;
      const codeText = richTextToPlainText(b.code.rich_text);
      return `\`\`\`${lang}\n${codeText}\n\`\`\``;
    }
    case 'quote': {
      const b = block as { type: 'quote'; quote: { rich_text: readonly NotionRichText[] } };
      const quoteText = richTextToMarkdown(b.quote.rich_text);
      // Prefix each line with >
      return quoteText
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    }
    case 'to_do': {
      const b = block as { type: 'to_do'; to_do: { rich_text: readonly NotionRichText[]; checked: boolean } };
      const checkbox = b.to_do.checked ? '[x]' : '[ ]';
      return `- ${checkbox} ${richTextToMarkdown(b.to_do.rich_text)}`;
    }
    default:
      // Unsupported block type fallback
      return `[Unsupported: ${block.type}]`;
  }
}

/**
 * Check if two block types belong to the same list category
 * (so we don't insert blank lines between consecutive items).
 */
function isSameListType(typeA: string, typeB: string): boolean {
  const listTypes = new Set([
    'bulleted_list_item',
    'numbered_list_item',
    'to_do',
  ]);

  // Same exact type (e.g., both bulleted_list_item)
  if (typeA === typeB && listTypes.has(typeA)) {
    return true;
  }

  return false;
}

// ============================================================================
// Rich Text Parsing (markdown inline → Notion rich text)
// ============================================================================

/**
 * Parse inline markdown formatting into an array of NotionRichText objects.
 *
 * Supports:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `inline code`
 * - [link text](url)
 * - Combinations thereof
 */
export function parseInlineMarkdown(text: string): NotionRichText[] {
  if (!text) {
    return [];
  }

  const richTexts: NotionRichText[] = [];

  // Regex for matching inline markdown tokens
  // Order matters: bold before italic to avoid ambiguity with ** vs *
  const inlinePattern =
    /(\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_([^_]+?)_|`([^`]+?)`|\[([^\]]+?)\]\(([^)]+?)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index);
      richTexts.push(createPlainRichText(plainText));
    }

    const fullMatch = match[0];

    if (match[2] !== undefined || match[3] !== undefined) {
      // **bold** or __bold__
      const boldText = match[2] ?? match[3];
      richTexts.push(createAnnotatedRichText(boldText, { bold: true }));
    } else if (match[4] !== undefined || match[5] !== undefined) {
      // *italic* or _italic_
      const italicText = match[4] ?? match[5];
      richTexts.push(createAnnotatedRichText(italicText, { italic: true }));
    } else if (match[6] !== undefined) {
      // `inline code`
      richTexts.push(createAnnotatedRichText(match[6], { code: true }));
    } else if (match[7] !== undefined && match[8] !== undefined) {
      // [link text](url)
      richTexts.push(createLinkRichText(match[7], match[8]));
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining plain text after last match
  if (lastIndex < text.length) {
    richTexts.push(createPlainRichText(text.slice(lastIndex)));
  }

  // If no matches found at all, return the text as plain
  if (richTexts.length === 0) {
    richTexts.push(createPlainRichText(text));
  }

  return richTexts;
}

// ============================================================================
// Rich Text → Markdown (Notion rich text → inline markdown)
// ============================================================================

/**
 * Convert an array of Notion rich text objects back to inline markdown.
 */
export function richTextToMarkdown(richTexts: readonly NotionRichText[]): string {
  if (!richTexts || richTexts.length === 0) {
    return '';
  }

  return richTexts.map(richTextElementToMarkdown).join('');
}

/**
 * Convert rich text array to plain text (no formatting).
 * Used for code blocks where we want raw content.
 */
function richTextToPlainText(richTexts: readonly NotionRichText[]): string {
  if (!richTexts || richTexts.length === 0) {
    return '';
  }

  return richTexts.map((rt) => rt.plain_text).join('');
}

/**
 * Convert a single rich text element to its markdown representation.
 */
function richTextElementToMarkdown(rt: NotionRichText): string {
  let text = rt.plain_text;
  const { annotations } = rt;
  const link = rt.text?.link;

  // Apply inline code first (code takes precedence, no nesting inside code)
  if (annotations.code) {
    text = `\`${text}\``;
  } else {
    // Apply bold and italic (can be combined)
    if (annotations.bold && annotations.italic) {
      text = `***${text}***`;
    } else if (annotations.bold) {
      text = `**${text}**`;
    } else if (annotations.italic) {
      text = `*${text}*`;
    }

    // Apply link wrapping
    if (link?.url) {
      text = `[${text}](${link.url})`;
    }
  }

  return text;
}

// ============================================================================
// Rich Text Construction Helpers
// ============================================================================

/**
 * Create a plain (unformatted) rich text element.
 */
function createPlainRichText(content: string): NotionRichText {
  return {
    type: 'text',
    text: {
      content,
      link: null,
    },
    annotations: { ...DEFAULT_ANNOTATIONS },
    plain_text: content,
    href: null,
  };
}

/**
 * Create a rich text element with specific annotations.
 */
function createAnnotatedRichText(
  content: string,
  annotationOverrides: Partial<NotionAnnotations>
): NotionRichText {
  const annotations: NotionAnnotations = {
    ...DEFAULT_ANNOTATIONS,
    ...annotationOverrides,
  };

  return {
    type: 'text',
    text: {
      content,
      link: null,
    },
    annotations,
    plain_text: content,
    href: null,
  };
}

/**
 * Create a rich text element with a link.
 */
function createLinkRichText(content: string, url: string): NotionRichText {
  return {
    type: 'text',
    text: {
      content,
      link: { url },
    },
    annotations: { ...DEFAULT_ANNOTATIONS },
    plain_text: content,
    href: url,
  };
}

// ============================================================================
// Language Normalization
// ============================================================================

/**
 * Map common markdown language identifiers to Notion's supported language names.
 * Notion uses specific language names for code blocks.
 */
const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  md: 'markdown',
  '': 'plain text',
};

/**
 * Normalize a language identifier to Notion's format.
 */
function normalizeLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] ?? normalized;
}
