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
// Rich Text Chunking (Notion 2000-character limit)
// ============================================================================

/**
 * Maximum length for a single rich_text element's text.content in the Notion API.
 * @see https://developers.notion.com/reference/block
 */
export const NOTION_MAX_TEXT_LENGTH = 2000;

/**
 * Maximum number of elements in a single rich_text array in the Notion API.
 * When a block's rich_text array exceeds this limit, the block must be split
 * into multiple blocks of the same type.
 * @see https://developers.notion.com/reference/block
 */
export const NOTION_MAX_RICH_TEXT_ARRAY_LENGTH = 100;

/**
 * Split a text string into chunks of at most `maxLength` characters,
 * preferring word boundaries when possible.
 */
function splitTextAtWordBoundaries(
  text: string,
  maxLength = NOTION_MAX_TEXT_LENGTH
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Split at last space before maxLength
    let splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt <= 0) splitAt = maxLength; // No space found, hard split
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Split a plain text string into multiple NotionRichText elements,
 * each with text.content at most `maxLength` characters.
 * Splits at word boundaries when possible.
 */
export function chunkRichText(
  text: string,
  maxLength = NOTION_MAX_TEXT_LENGTH
): NotionRichText[] {
  if (text.length <= maxLength) {
    return [createPlainRichText(text)];
  }

  return splitTextAtWordBoundaries(text, maxLength).map((chunk) =>
    createPlainRichText(chunk)
  );
}

/**
 * Split a single NotionRichText element into multiple elements if its content
 * exceeds `maxLength`, preserving annotations and link information.
 */
function chunkRichTextElement(
  rt: NotionRichText,
  maxLength = NOTION_MAX_TEXT_LENGTH
): NotionRichText[] {
  const content = rt.text?.content ?? rt.plain_text;
  if (content.length <= maxLength) {
    return [rt];
  }

  const textChunks = splitTextAtWordBoundaries(content, maxLength);
  return textChunks.map((chunk) => ({
    type: rt.type,
    text: rt.text ? { content: chunk, link: rt.text.link } : undefined,
    annotations: { ...rt.annotations },
    plain_text: chunk,
    href: rt.href,
  } as NotionRichText));
}

/**
 * Check if two NotionRichText elements have identical annotations.
 */
function annotationsEqual(a: NotionAnnotations, b: NotionAnnotations): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strikethrough === b.strikethrough &&
    a.underline === b.underline &&
    a.code === b.code &&
    a.color === b.color
  );
}

/**
 * Check if two NotionRichText elements can be merged (same annotations and link).
 */
function canMergeRichText(a: NotionRichText, b: NotionRichText): boolean {
  if (a.type !== 'text' || b.type !== 'text') return false;
  if (!annotationsEqual(a.annotations, b.annotations)) return false;
  // Both must have same link (both null, or both same URL)
  const aLink = a.text?.link?.url ?? null;
  const bLink = b.text?.link?.url ?? null;
  return aLink === bLink;
}

/**
 * Merge consecutive rich_text elements that share the same annotations and link.
 * This reduces array length when inline-heavy markdown produces many alternating
 * plain/formatted segments that happen to be adjacent with identical formatting.
 * Respects the per-element character limit to avoid undoing character chunking.
 */
function mergeAdjacentRichText(
  richTexts: NotionRichText[],
  maxLength = NOTION_MAX_TEXT_LENGTH
): NotionRichText[] {
  if (richTexts.length <= 1) return richTexts;

  const merged: NotionRichText[] = [richTexts[0]];

  for (let i = 1; i < richTexts.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = richTexts[i];
    const prevLen = (prev.text?.content ?? prev.plain_text).length;
    const currLen = (curr.text?.content ?? curr.plain_text).length;

    if (canMergeRichText(prev, curr) && prevLen + currLen <= maxLength) {
      // Merge: concatenate content (stays within character limit)
      const content = (prev.text?.content ?? prev.plain_text) + (curr.text?.content ?? curr.plain_text);
      merged[merged.length - 1] = {
        type: prev.type,
        text: prev.text ? { content, link: prev.text.link } : undefined,
        annotations: { ...prev.annotations },
        plain_text: content,
        href: prev.href,
      } as NotionRichText;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/**
 * Ensure all elements in a rich_text array respect both:
 * 1. The Notion 2000-character-per-element limit (splits oversized elements)
 * 2. Reduced array length via merging adjacent same-formatted elements
 *
 * Merge first (to reduce count), then chunk (to enforce character limits).
 */
function ensureRichTextWithinLimits(
  richTexts: NotionRichText[],
  maxLength = NOTION_MAX_TEXT_LENGTH
): NotionRichText[] {
  // First merge adjacent elements with same formatting to reduce count
  const merged = mergeAdjacentRichText(richTexts, maxLength);
  // Then split any elements that exceed the character limit
  return merged.flatMap((rt) => chunkRichTextElement(rt, maxLength));
}

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

      blocks.push(...createCodeBlocks(codeLines.join('\n'), language));
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
      blocks.push(...createHeadingBlock(level, text));
      i++;
      continue;
    }

    // Checkbox (- [ ] or - [x] or * [ ] or * [x])
    const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      const text = checkboxMatch[2];
      blocks.push(...createToDoBlock(text, checked));
      i++;
      continue;
    }

    // Bulleted list (- or *)
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[1];
      blocks.push(...createBulletedListItemBlock(text));
      i++;
      continue;
    }

    // Numbered list (1. 2. etc.)
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      const text = numberedMatch[1];
      blocks.push(...createNumberedListItemBlock(text));
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
      blocks.push(...createQuoteBlock(quoteLines.join('\n')));
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
    blocks.push(...createParagraphBlock(paragraphLines.join('\n')));
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

/**
 * Split a rich_text array into chunks respecting the Notion 100-element limit.
 * Each chunk contains at most NOTION_MAX_RICH_TEXT_ARRAY_LENGTH elements.
 */
function splitRichTextArray(
  richTexts: NotionRichText[],
  maxArrayLength = NOTION_MAX_RICH_TEXT_ARRAY_LENGTH
): NotionRichText[][] {
  if (richTexts.length <= maxArrayLength) {
    return [richTexts];
  }

  const chunks: NotionRichText[][] = [];
  for (let i = 0; i < richTexts.length; i += maxArrayLength) {
    chunks.push(richTexts.slice(i, i + maxArrayLength));
  }
  return chunks;
}

/**
 * Prepare rich_text for a block: parse inline markdown, enforce character limits,
 * merge adjacent elements, and split into chunks if array exceeds 100 elements.
 */
function prepareRichTextChunks(text: string): NotionRichText[][] {
  const richTexts = ensureRichTextWithinLimits(parseInlineMarkdown(text));
  return splitRichTextArray(richTexts);
}

function createParagraphBlock(text: string): NotionBlock[] {
  return prepareRichTextChunks(text).map((richText) => ({
    type: 'paragraph' as const,
    paragraph: { rich_text: richText },
  }));
}

function createHeadingBlock(level: 1 | 2 | 3, text: string): NotionBlock[] {
  const type = `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3';
  const chunks = prepareRichTextChunks(text);
  // First chunk keeps the heading type; overflow chunks become paragraphs
  // (Notion doesn't support multiple consecutive headings for a single logical heading)
  return chunks.map((richText, i) => {
    if (i === 0) {
      return { type, [type]: { rich_text: richText } } as NotionBlock;
    }
    return { type: 'paragraph' as const, paragraph: { rich_text: richText } };
  });
}

function createBulletedListItemBlock(text: string): NotionBlock[] {
  return prepareRichTextChunks(text).map((richText) => ({
    type: 'bulleted_list_item' as const,
    bulleted_list_item: { rich_text: richText },
  }));
}

function createNumberedListItemBlock(text: string): NotionBlock[] {
  return prepareRichTextChunks(text).map((richText) => ({
    type: 'numbered_list_item' as const,
    numbered_list_item: { rich_text: richText },
  }));
}

/**
 * Create one or more code blocks from a code string.
 * If the code exceeds NOTION_MAX_TEXT_LENGTH, it is split into multiple
 * consecutive code blocks with the same language annotation.
 * Code splits prefer line boundaries, then word boundaries.
 */
function createCodeBlocks(
  code: string,
  language: string
): NotionBlock[] {
  const normalizedLang = normalizeLanguage(language);

  if (code.length <= NOTION_MAX_TEXT_LENGTH) {
    return [
      {
        type: 'code',
        code: {
          rich_text: [createPlainRichText(code)],
          language: normalizedLang,
        },
      },
    ];
  }

  // Split code at line boundaries when possible
  const chunks = splitCodeAtLineBoundaries(code, NOTION_MAX_TEXT_LENGTH);
  return chunks.map((chunk) => ({
    type: 'code' as const,
    code: {
      rich_text: [createPlainRichText(chunk)],
      language: normalizedLang,
    },
  }));
}

/**
 * Split code text into chunks, preferring line boundaries (\n) over word boundaries.
 */
function splitCodeAtLineBoundaries(
  text: string,
  maxLength: number
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Prefer splitting at a newline before maxLength
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt <= 0) {
      // No newline found; try word boundary
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt <= 0) {
      // No boundary found; hard split
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    // For newline splits, skip the newline character itself
    if (remaining[splitAt] === '\n') {
      remaining = remaining.slice(splitAt + 1);
    } else {
      remaining = remaining.slice(splitAt).trimStart();
    }
  }

  return chunks;
}

function createQuoteBlock(text: string): NotionBlock[] {
  return prepareRichTextChunks(text).map((richText) => ({
    type: 'quote' as const,
    quote: { rich_text: richText },
  }));
}

function createToDoBlock(text: string, checked: boolean): NotionBlock[] {
  const chunks = prepareRichTextChunks(text);
  return chunks.map((richText, i) => ({
    type: 'to_do' as const,
    to_do: {
      rich_text: richText,
      // Only the first block carries the checked state; overflow blocks are unchecked
      checked: i === 0 ? checked : false,
    },
  }));
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
// URL Validation
// ============================================================================

/**
 * Check whether a URL string is valid for use in a Notion link block.
 * Notion only accepts absolute http: or https: URLs. Relative paths,
 * fragment-only references (#section), workspace element IDs (el-xxxx),
 * empty strings, and malformed URLs are all rejected.
 */
export function isValidNotionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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
      // [link text](url) — validate URL before creating a link block
      if (isValidNotionUrl(match[8])) {
        richTexts.push(createLinkRichText(match[7], match[8]));
      } else {
        // Invalid URL — render as plain text to avoid Notion rejection
        richTexts.push(createPlainRichText(match[7]));
      }
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
 * The complete set of language identifiers accepted by the Notion API
 * for code blocks. Any language not in this set will be rejected.
 * @see https://developers.notion.com/reference/block#code
 */
export const NOTION_LANGUAGES = new Set([
  'abap', 'abc', 'agda', 'arduino', 'ascii art', 'assembly', 'bash', 'basic',
  'bnf', 'c', 'c#', 'c++', 'clojure', 'coffeescript', 'coq', 'css', 'dart',
  'dhall', 'diff', 'docker', 'ebnf', 'elixir', 'elm', 'erlang', 'f#', 'flow',
  'fortran', 'gherkin', 'glsl', 'go', 'graphql', 'groovy', 'haskell', 'hcl',
  'html', 'idris', 'java', 'javascript', 'json', 'julia', 'kotlin', 'latex',
  'less', 'lisp', 'livescript', 'llvm ir', 'lua', 'makefile', 'markdown',
  'markup', 'matlab', 'mathematica', 'mermaid', 'nix', 'notion formula',
  'objective-c', 'ocaml', 'pascal', 'perl', 'php', 'plain text', 'powershell',
  'prolog', 'protobuf', 'purescript', 'python', 'r', 'racket', 'reason',
  'ruby', 'rust', 'sass', 'scala', 'scheme', 'scss', 'shell', 'smalltalk',
  'solidity', 'sql', 'swift', 'toml', 'typescript', 'vb.net', 'verilog',
  'vhdl', 'visual basic', 'webassembly', 'xml', 'yaml', 'java/c/c++/c#',
]);

/**
 * Map common code fence language aliases to their Notion-accepted equivalents.
 * These cover short names, file extensions, and alternate spellings that
 * markdown authors commonly use but Notion does not recognize.
 */
export const LANGUAGE_ALIASES: Record<string, string> = {
  'tsx': 'typescript',
  'ts': 'typescript',
  'jsx': 'javascript',
  'js': 'javascript',
  'sh': 'shell',
  'zsh': 'shell',
  'yml': 'yaml',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'cs': 'c#',
  'cpp': 'c++',
  'objc': 'objective-c',
  'dockerfile': 'docker',
  'tf': 'hcl',
  'hs': 'haskell',
  'ex': 'elixir',
  'exs': 'elixir',
  'kt': 'kotlin',
  'fs': 'f#',
  'fsharp': 'f#',
  'csharp': 'c#',
  'jsonc': 'json',
  'md': 'markdown',
  'text': 'plain text',
  'txt': 'plain text',
  'plaintext': 'plain text',
  '': 'plain text',
};

/**
 * Map a code fence language identifier to a Notion-accepted language value.
 *
 * 1. If the lowercased input is already in NOTION_LANGUAGES, return it.
 * 2. If it matches a known alias, return the mapped value.
 * 3. Otherwise, fall back to 'plain text' (always accepted by Notion).
 */
export function mapLanguageToNotion(lang: string): string {
  const lower = lang.toLowerCase().trim();
  if (NOTION_LANGUAGES.has(lower)) return lower;
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  return 'plain text'; // safe fallback
}

/**
 * Normalize a language identifier to Notion's format.
 * Delegates to mapLanguageToNotion for full allowlist validation.
 */
function normalizeLanguage(lang: string): string {
  return mapLanguageToNotion(lang);
}
