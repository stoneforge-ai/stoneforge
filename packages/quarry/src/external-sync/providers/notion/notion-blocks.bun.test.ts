/**
 * Notion Blocks ↔ Markdown Converter Tests
 *
 * Tests for bidirectional conversion between markdown and Notion block format.
 * Covers each block type in both directions, round-trip fidelity, unsupported
 * block fallback, nested rich text formatting, and edge cases.
 */

import { describe, expect, test } from 'bun:test';
import {
  markdownToNotionBlocks,
  notionBlocksToMarkdown,
  parseInlineMarkdown,
  richTextToMarkdown,
} from './notion-blocks.js';
import type {
  NotionBlock,
  NotionRichText,
} from './notion-types.js';
import { DEFAULT_ANNOTATIONS } from './notion-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a plain rich text element for test data */
function plainRichText(content: string): NotionRichText {
  return {
    type: 'text',
    text: { content, link: null },
    annotations: { ...DEFAULT_ANNOTATIONS },
    plain_text: content,
    href: null,
  };
}

/** Create an annotated rich text element for test data */
function annotatedRichText(
  content: string,
  overrides: Partial<NotionRichText['annotations']>
): NotionRichText {
  return {
    type: 'text',
    text: { content, link: null },
    annotations: { ...DEFAULT_ANNOTATIONS, ...overrides },
    plain_text: content,
    href: null,
  };
}

/** Create a link rich text element for test data */
function linkRichText(content: string, url: string): NotionRichText {
  return {
    type: 'text',
    text: { content, link: { url } },
    annotations: { ...DEFAULT_ANNOTATIONS },
    plain_text: content,
    href: url,
  };
}

/** Extract rich text from a block's inner payload */
function getRichText(block: NotionBlock): readonly NotionRichText[] {
  const inner = (block as Record<string, unknown>)[block.type] as
    | { rich_text: readonly NotionRichText[] }
    | undefined;
  return inner?.rich_text ?? [];
}

/** Get plain text content from a block */
function getPlainText(block: NotionBlock): string {
  return getRichText(block)
    .map((rt) => rt.plain_text)
    .join('');
}

// ============================================================================
// markdownToNotionBlocks — Individual Block Types
// ============================================================================

describe('markdownToNotionBlocks', () => {
  describe('paragraphs', () => {
    test('converts a single paragraph', () => {
      const blocks = markdownToNotionBlocks('Hello world');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(getPlainText(blocks[0])).toBe('Hello world');
    });

    test('converts multiple paragraphs separated by blank lines', () => {
      const blocks = markdownToNotionBlocks('First paragraph\n\nSecond paragraph');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[1].type).toBe('paragraph');
      expect(getPlainText(blocks[0])).toBe('First paragraph');
      expect(getPlainText(blocks[1])).toBe('Second paragraph');
    });

    test('merges consecutive non-special lines into one paragraph', () => {
      const blocks = markdownToNotionBlocks('Line one\nLine two\nLine three');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(getPlainText(blocks[0])).toBe('Line one\nLine two\nLine three');
    });
  });

  describe('headings', () => {
    test('converts h1', () => {
      const blocks = markdownToNotionBlocks('# Heading 1');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_1');
      expect(getPlainText(blocks[0])).toBe('Heading 1');
    });

    test('converts h2', () => {
      const blocks = markdownToNotionBlocks('## Heading 2');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_2');
      expect(getPlainText(blocks[0])).toBe('Heading 2');
    });

    test('converts h3', () => {
      const blocks = markdownToNotionBlocks('### Heading 3');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_3');
      expect(getPlainText(blocks[0])).toBe('Heading 3');
    });

    test('preserves inline formatting in headings', () => {
      const blocks = markdownToNotionBlocks('## A **bold** heading');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_2');
      const richText = getRichText(blocks[0]);
      expect(richText).toHaveLength(3);
      expect(richText[0].plain_text).toBe('A ');
      expect(richText[1].plain_text).toBe('bold');
      expect(richText[1].annotations.bold).toBe(true);
      expect(richText[2].plain_text).toBe(' heading');
    });
  });

  describe('bulleted lists', () => {
    test('converts dash-prefixed items', () => {
      const blocks = markdownToNotionBlocks('- Item one\n- Item two');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('bulleted_list_item');
      expect(blocks[1].type).toBe('bulleted_list_item');
      expect(getPlainText(blocks[0])).toBe('Item one');
      expect(getPlainText(blocks[1])).toBe('Item two');
    });

    test('converts asterisk-prefixed items', () => {
      const blocks = markdownToNotionBlocks('* Item one\n* Item two');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('bulleted_list_item');
      expect(blocks[1].type).toBe('bulleted_list_item');
    });
  });

  describe('numbered lists', () => {
    test('converts numbered items', () => {
      const blocks = markdownToNotionBlocks('1. First\n2. Second\n3. Third');
      expect(blocks).toHaveLength(3);
      blocks.forEach((block) => {
        expect(block.type).toBe('numbered_list_item');
      });
      expect(getPlainText(blocks[0])).toBe('First');
      expect(getPlainText(blocks[1])).toBe('Second');
      expect(getPlainText(blocks[2])).toBe('Third');
    });
  });

  describe('code blocks', () => {
    test('converts code block with language', () => {
      const md = '```typescript\nconst x = 1;\nconsole.log(x);\n```';
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('code');
      const code = (blocks[0] as { type: 'code'; code: { rich_text: readonly NotionRichText[]; language: string } }).code;
      expect(code.language).toBe('typescript');
      expect(code.rich_text[0].plain_text).toBe('const x = 1;\nconsole.log(x);');
    });

    test('converts code block without language', () => {
      const md = '```\nsome code\n```';
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      const code = (blocks[0] as { type: 'code'; code: { rich_text: readonly NotionRichText[]; language: string } }).code;
      expect(code.language).toBe('plain text');
    });

    test('normalizes common language aliases', () => {
      const jsBlock = markdownToNotionBlocks('```js\ncode\n```');
      const code = (jsBlock[0] as { type: 'code'; code: { language: string } }).code;
      expect(code.language).toBe('javascript');

      const pyBlock = markdownToNotionBlocks('```py\ncode\n```');
      const pyCode = (pyBlock[0] as { type: 'code'; code: { language: string } }).code;
      expect(pyCode.language).toBe('python');

      const tsBlock = markdownToNotionBlocks('```ts\ncode\n```');
      const tsCode = (tsBlock[0] as { type: 'code'; code: { language: string } }).code;
      expect(tsCode.language).toBe('typescript');
    });

    test('preserves empty code blocks', () => {
      const md = '```python\n```';
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      const code = (blocks[0] as { type: 'code'; code: { rich_text: readonly NotionRichText[]; language: string } }).code;
      expect(code.language).toBe('python');
      expect(code.rich_text[0].plain_text).toBe('');
    });
  });

  describe('blockquotes', () => {
    test('converts single-line blockquote', () => {
      const blocks = markdownToNotionBlocks('> This is a quote');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('quote');
      expect(getPlainText(blocks[0])).toBe('This is a quote');
    });

    test('merges consecutive blockquote lines', () => {
      const blocks = markdownToNotionBlocks('> Line one\n> Line two');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('quote');
      expect(getPlainText(blocks[0])).toBe('Line one\nLine two');
    });
  });

  describe('checkboxes (to_do)', () => {
    test('converts unchecked checkbox', () => {
      const blocks = markdownToNotionBlocks('- [ ] Unchecked task');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('to_do');
      const todo = (blocks[0] as { type: 'to_do'; to_do: { checked: boolean; rich_text: readonly NotionRichText[] } }).to_do;
      expect(todo.checked).toBe(false);
      expect(todo.rich_text[0].plain_text).toBe('Unchecked task');
    });

    test('converts checked checkbox', () => {
      const blocks = markdownToNotionBlocks('- [x] Done task');
      expect(blocks).toHaveLength(1);
      const todo = (blocks[0] as { type: 'to_do'; to_do: { checked: boolean } }).to_do;
      expect(todo.checked).toBe(true);
    });

    test('handles uppercase X', () => {
      const blocks = markdownToNotionBlocks('- [X] Also done');
      expect(blocks).toHaveLength(1);
      const todo = (blocks[0] as { type: 'to_do'; to_do: { checked: boolean } }).to_do;
      expect(todo.checked).toBe(true);
    });

    test('converts multiple checkboxes', () => {
      const md = '- [ ] Task 1\n- [x] Task 2\n- [ ] Task 3';
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(3);
      blocks.forEach((b) => expect(b.type).toBe('to_do'));
    });
  });

  describe('inline formatting', () => {
    test('converts bold text', () => {
      const blocks = markdownToNotionBlocks('This is **bold** text');
      const richText = getRichText(blocks[0]);
      expect(richText).toHaveLength(3);
      expect(richText[1].annotations.bold).toBe(true);
      expect(richText[1].plain_text).toBe('bold');
    });

    test('converts italic text', () => {
      const blocks = markdownToNotionBlocks('This is *italic* text');
      const richText = getRichText(blocks[0]);
      expect(richText).toHaveLength(3);
      expect(richText[1].annotations.italic).toBe(true);
      expect(richText[1].plain_text).toBe('italic');
    });

    test('converts inline code', () => {
      const blocks = markdownToNotionBlocks('Use the `console.log` function');
      const richText = getRichText(blocks[0]);
      expect(richText).toHaveLength(3);
      expect(richText[1].annotations.code).toBe(true);
      expect(richText[1].plain_text).toBe('console.log');
    });

    test('converts links', () => {
      const blocks = markdownToNotionBlocks('Visit [Google](https://google.com) today');
      const richText = getRichText(blocks[0]);
      expect(richText).toHaveLength(3);
      expect(richText[1].text.link).toEqual({ url: 'https://google.com' });
      expect(richText[1].plain_text).toBe('Google');
      expect(richText[1].href).toBe('https://google.com');
    });

    test('handles multiple formats in one line', () => {
      const blocks = markdownToNotionBlocks('**bold** and *italic* and `code`');
      const richText = getRichText(blocks[0]);
      expect(richText.length).toBeGreaterThanOrEqual(5);
      // Check that bold, italic, and code annotations are applied to the right elements
      const boldElement = richText.find((rt) => rt.annotations.bold);
      const italicElement = richText.find((rt) => rt.annotations.italic);
      const codeElement = richText.find((rt) => rt.annotations.code);
      expect(boldElement).toBeDefined();
      expect(italicElement).toBeDefined();
      expect(codeElement).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('returns empty array for empty string', () => {
      expect(markdownToNotionBlocks('')).toEqual([]);
    });

    test('returns empty array for whitespace-only string', () => {
      expect(markdownToNotionBlocks('   \n  \n  ')).toEqual([]);
    });

    test('handles mixed block types', () => {
      const md = `# Title

Some paragraph text.

- Bullet 1
- Bullet 2

1. Number 1
2. Number 2

> A quote

\`\`\`python
print("hello")
\`\`\`

- [ ] Todo item`;
      const blocks = markdownToNotionBlocks(md);
      const types = blocks.map((b) => b.type);
      expect(types).toContain('heading_1');
      expect(types).toContain('paragraph');
      expect(types).toContain('bulleted_list_item');
      expect(types).toContain('numbered_list_item');
      expect(types).toContain('quote');
      expect(types).toContain('code');
      expect(types).toContain('to_do');
    });
  });
});

// ============================================================================
// notionBlocksToMarkdown — Individual Block Types
// ============================================================================

describe('notionBlocksToMarkdown', () => {
  describe('paragraphs', () => {
    test('converts paragraph block to text', () => {
      const blocks: NotionBlock[] = [
        { type: 'paragraph', paragraph: { rich_text: [plainRichText('Hello world')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('Hello world');
    });
  });

  describe('headings', () => {
    test('converts heading_1 to # prefix', () => {
      const blocks: NotionBlock[] = [
        { type: 'heading_1', heading_1: { rich_text: [plainRichText('Title')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('# Title');
    });

    test('converts heading_2 to ## prefix', () => {
      const blocks: NotionBlock[] = [
        { type: 'heading_2', heading_2: { rich_text: [plainRichText('Subtitle')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('## Subtitle');
    });

    test('converts heading_3 to ### prefix', () => {
      const blocks: NotionBlock[] = [
        { type: 'heading_3', heading_3: { rich_text: [plainRichText('Section')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('### Section');
    });
  });

  describe('bulleted lists', () => {
    test('converts bulleted_list_item to - prefix', () => {
      const blocks: NotionBlock[] = [
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [plainRichText('Item 1')] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [plainRichText('Item 2')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('- Item 1\n- Item 2');
    });
  });

  describe('numbered lists', () => {
    test('converts numbered_list_item to 1. prefix', () => {
      const blocks: NotionBlock[] = [
        { type: 'numbered_list_item', numbered_list_item: { rich_text: [plainRichText('First')] } },
        { type: 'numbered_list_item', numbered_list_item: { rich_text: [plainRichText('Second')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('1. First\n1. Second');
    });
  });

  describe('code blocks', () => {
    test('converts code block with language', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'code',
          code: {
            rich_text: [plainRichText('const x = 1;')],
            language: 'typescript',
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('```typescript\nconst x = 1;\n```');
    });

    test('converts code block with plain text language as no lang', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'code',
          code: {
            rich_text: [plainRichText('some code')],
            language: 'plain text',
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('```\nsome code\n```');
    });

    test('handles empty code block', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'code',
          code: {
            rich_text: [plainRichText('')],
            language: 'javascript',
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('```javascript\n\n```');
    });
  });

  describe('blockquotes', () => {
    test('converts quote block to > prefix', () => {
      const blocks: NotionBlock[] = [
        { type: 'quote', quote: { rich_text: [plainRichText('A wise quote')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('> A wise quote');
    });

    test('prefixes each line of multiline quote', () => {
      const blocks: NotionBlock[] = [
        { type: 'quote', quote: { rich_text: [plainRichText('Line 1\nLine 2')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('> Line 1\n> Line 2');
    });
  });

  describe('checkboxes (to_do)', () => {
    test('converts unchecked to_do to - [ ]', () => {
      const blocks: NotionBlock[] = [
        { type: 'to_do', to_do: { rich_text: [plainRichText('Buy milk')], checked: false } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('- [ ] Buy milk');
    });

    test('converts checked to_do to - [x]', () => {
      const blocks: NotionBlock[] = [
        { type: 'to_do', to_do: { rich_text: [plainRichText('Done task')], checked: true } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('- [x] Done task');
    });
  });

  describe('unsupported blocks', () => {
    test('produces fallback text for unsupported block types', () => {
      const blocks: NotionBlock[] = [
        { type: 'divider' } as unknown as NotionBlock,
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('[Unsupported: divider]');
    });

    test('produces fallback for image blocks', () => {
      const blocks: NotionBlock[] = [
        { type: 'image', image: { url: 'https://example.com/img.png' } } as unknown as NotionBlock,
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('[Unsupported: image]');
    });

    test('produces fallback for table blocks', () => {
      const blocks: NotionBlock[] = [
        { type: 'table' } as unknown as NotionBlock,
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('[Unsupported: table]');
    });
  });

  describe('rich text formatting', () => {
    test('converts bold rich text to **', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              plainRichText('Hello '),
              annotatedRichText('bold', { bold: true }),
              plainRichText(' world'),
            ],
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('Hello **bold** world');
    });

    test('converts italic rich text to *', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              plainRichText('Hello '),
              annotatedRichText('italic', { italic: true }),
              plainRichText(' world'),
            ],
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('Hello *italic* world');
    });

    test('converts inline code rich text to backticks', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              plainRichText('Use '),
              annotatedRichText('console.log', { code: true }),
              plainRichText(' here'),
            ],
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('Use `console.log` here');
    });

    test('converts link rich text to [text](url)', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              plainRichText('Visit '),
              linkRichText('Google', 'https://google.com'),
              plainRichText(' now'),
            ],
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('Visit [Google](https://google.com) now');
    });

    test('converts bold + italic to ***', () => {
      const blocks: NotionBlock[] = [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              annotatedRichText('bold italic', { bold: true, italic: true }),
            ],
          },
        },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('***bold italic***');
    });
  });

  describe('block spacing', () => {
    test('adds blank line between different block types', () => {
      const blocks: NotionBlock[] = [
        { type: 'heading_1', heading_1: { rich_text: [plainRichText('Title')] } },
        { type: 'paragraph', paragraph: { rich_text: [plainRichText('Text')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('# Title\n\nText');
    });

    test('no blank line between consecutive bulleted list items', () => {
      const blocks: NotionBlock[] = [
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [plainRichText('A')] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [plainRichText('B')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('- A\n- B');
    });

    test('no blank line between consecutive numbered list items', () => {
      const blocks: NotionBlock[] = [
        { type: 'numbered_list_item', numbered_list_item: { rich_text: [plainRichText('1st')] } },
        { type: 'numbered_list_item', numbered_list_item: { rich_text: [plainRichText('2nd')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('1. 1st\n1. 2nd');
    });

    test('no blank line between consecutive to_do items', () => {
      const blocks: NotionBlock[] = [
        { type: 'to_do', to_do: { rich_text: [plainRichText('A')], checked: false } },
        { type: 'to_do', to_do: { rich_text: [plainRichText('B')], checked: true } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('- [ ] A\n- [x] B');
    });

    test('blank line between different list types', () => {
      const blocks: NotionBlock[] = [
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [plainRichText('Bullet')] } },
        { type: 'numbered_list_item', numbered_list_item: { rich_text: [plainRichText('Number')] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('- Bullet\n\n1. Number');
    });
  });

  describe('edge cases', () => {
    test('returns empty string for empty array', () => {
      expect(notionBlocksToMarkdown([])).toBe('');
    });

    test('returns empty string for null/undefined-like input', () => {
      expect(notionBlocksToMarkdown(null as unknown as NotionBlock[])).toBe('');
      expect(notionBlocksToMarkdown(undefined as unknown as NotionBlock[])).toBe('');
    });

    test('handles block with empty rich_text array', () => {
      const blocks: NotionBlock[] = [
        { type: 'paragraph', paragraph: { rich_text: [] } },
      ];
      expect(notionBlocksToMarkdown(blocks)).toBe('');
    });
  });
});

// ============================================================================
// Round-Trip Fidelity
// ============================================================================

describe('round-trip fidelity', () => {
  test('paragraph round-trips', () => {
    const md = 'Hello world';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('heading round-trips', () => {
    const md = '## My Heading';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('bulleted list round-trips', () => {
    const md = '- Item A\n- Item B\n- Item C';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('code block with language round-trips', () => {
    const md = '```typescript\nconst x = 42;\n```';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('code block without language round-trips', () => {
    const md = '```\nplain code\n```';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('blockquote round-trips', () => {
    const md = '> This is a quote';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('unchecked to_do round-trips', () => {
    const md = '- [ ] Unchecked task';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('checked to_do round-trips', () => {
    const md = '- [x] Done task';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('bold text round-trips', () => {
    const md = 'This is **bold** text';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('italic text round-trips', () => {
    const md = 'This is *italic* text';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('inline code round-trips', () => {
    const md = 'Use `console.log` here';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('link round-trips', () => {
    const md = 'Visit [Google](https://google.com) today';
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });

  test('complex document round-trips', () => {
    const md = `# Main Title

This is a paragraph with **bold** and *italic* text.

## Section 1

- Bullet one
- Bullet two

1. Number one
1. Number two

> A famous quote

\`\`\`javascript
const x = 42;
\`\`\`

- [ ] Todo 1
- [x] Todo 2`;
    const blocks = markdownToNotionBlocks(md);
    const result = notionBlocksToMarkdown(blocks);
    expect(result).toBe(md);
  });
});

// ============================================================================
// parseInlineMarkdown (exported helper)
// ============================================================================

describe('parseInlineMarkdown', () => {
  test('returns empty array for empty string', () => {
    expect(parseInlineMarkdown('')).toEqual([]);
  });

  test('returns plain text for unformatted string', () => {
    const result = parseInlineMarkdown('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0].plain_text).toBe('Hello world');
    expect(result[0].annotations.bold).toBe(false);
    expect(result[0].annotations.italic).toBe(false);
    expect(result[0].annotations.code).toBe(false);
  });

  test('parses __bold__ syntax', () => {
    const result = parseInlineMarkdown('__underscored bold__');
    expect(result).toHaveLength(1);
    expect(result[0].annotations.bold).toBe(true);
    expect(result[0].plain_text).toBe('underscored bold');
  });

  test('parses _italic_ syntax', () => {
    const result = parseInlineMarkdown('_underscored italic_');
    expect(result).toHaveLength(1);
    expect(result[0].annotations.italic).toBe(true);
    expect(result[0].plain_text).toBe('underscored italic');
  });
});

// ============================================================================
// richTextToMarkdown (exported helper)
// ============================================================================

describe('richTextToMarkdown', () => {
  test('returns empty string for empty array', () => {
    expect(richTextToMarkdown([])).toBe('');
  });

  test('returns empty string for null/undefined', () => {
    expect(richTextToMarkdown(null as unknown as NotionRichText[])).toBe('');
    expect(richTextToMarkdown(undefined as unknown as NotionRichText[])).toBe('');
  });

  test('concatenates multiple plain text elements', () => {
    const result = richTextToMarkdown([
      plainRichText('Hello '),
      plainRichText('world'),
    ]);
    expect(result).toBe('Hello world');
  });

  test('applies bold formatting', () => {
    const result = richTextToMarkdown([
      annotatedRichText('bold', { bold: true }),
    ]);
    expect(result).toBe('**bold**');
  });

  test('applies italic formatting', () => {
    const result = richTextToMarkdown([
      annotatedRichText('italic', { italic: true }),
    ]);
    expect(result).toBe('*italic*');
  });

  test('applies code formatting', () => {
    const result = richTextToMarkdown([
      annotatedRichText('code', { code: true }),
    ]);
    expect(result).toBe('`code`');
  });

  test('applies link formatting', () => {
    const result = richTextToMarkdown([
      linkRichText('click here', 'https://example.com'),
    ]);
    expect(result).toBe('[click here](https://example.com)');
  });

  test('code takes precedence over bold/italic', () => {
    const result = richTextToMarkdown([
      annotatedRichText('code', { code: true, bold: true, italic: true }),
    ]);
    // code should be applied, not bold/italic wrapping
    expect(result).toBe('`code`');
  });
});
