/**
 * Message content rendering utilities
 *
 * Handles parsing and rendering of:
 * - @mentions
 * - Markdown images: ![alt](url)
 * - Markdown links: [text](url)
 * - Inline markdown formatting (bold, italic, code, strikethrough)
 */

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Regex pattern to match @mentions in message content
 * Matches @ followed by a valid entity name (letter, then alphanumeric/hyphen/underscore)
 * Uses negative lookbehind to exclude email addresses
 * Also handles markdown formatting around mention names: @**name**, @_name_, @`name`
 */
export const MENTION_REGEX =
  /(?<![a-zA-Z0-9])@(?:\*\*|__)?(?:_|\*)?(`)?([a-zA-Z][a-zA-Z0-9_-]*)(`)?(?:\*|_)?(?:\*\*|__)?/g;

/**
 * Regex pattern to match markdown images: ![alt](url)
 */
export const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Regex pattern to match markdown links: [text](url)
 * Also handles escaped brackets: \[text\](url)
 */
export const LINK_REGEX = /\\?\[([^\]\\]+)\\?\]\(([^)]+)\)/g;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts the clean entity name from a mention match, stripping any markdown formatting
 */
export function extractMentionName(match: RegExpExecArray): string {
  // The entity name is in capture group 2 (after optional backtick in group 1)
  return match[2];
}

/**
 * Unescapes markdown escape sequences (backslash followed by special char)
 */
export function unescapeMarkdown(text: string): string {
  // Remove backslashes before special markdown characters
  return text.replace(/\\([[\](){}*_`~#>+\-.!|])/g, '$1');
}

/**
 * Converts inline markdown (bold, italic, code, strikethrough) to HTML
 * This is a lightweight converter for inline formatting only
 */
export function convertInlineMarkdown(text: string): string {
  // First unescape any escaped markdown characters
  let result = unescapeMarkdown(text);

  // Bold: **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (but not in the middle of words)
  result = result.replace(
    /(?<![a-zA-Z0-9])\*([^*]+)\*(?![a-zA-Z0-9])/g,
    '<em>$1</em>'
  );
  result = result.replace(
    /(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g,
    '<em>$1</em>'
  );

  // Inline code: `code`
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">$1</code>'
  );

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return result;
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Renders a single text segment with inline markdown and mentions
 */
function renderFormattedTextWithMentions(
  text: string,
  keyPrefix: string
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the mention (with markdown formatting)
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      const html = convertInlineMarkdown(textBefore);
      parts.push(
        <span
          key={`${keyPrefix}-text-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    // Extract the clean entity name (stripping any markdown formatting)
    const entityName = extractMentionName(match);
    parts.push(
      <span
        key={`${keyPrefix}-mention-${match.index}`}
        className="text-blue-600 font-medium"
        data-mention={entityName}
        title={`@${entityName}`}
      >
        @{entityName}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last mention (with markdown formatting)
  if (lastIndex < text.length) {
    const textAfter = text.slice(lastIndex);
    const html = convertInlineMarkdown(textAfter);
    parts.push(
      <span
        key={`${keyPrefix}-text-${lastIndex}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // If no mentions found, just return the formatted text
  if (parts.length === 0) {
    const html = convertInlineMarkdown(text);
    return [
      <span key={`${keyPrefix}-text-0`} dangerouslySetInnerHTML={{ __html: html }} />,
    ];
  }

  return parts;
}

/**
 * Renders text with links converted to clickable anchors
 */
function renderTextWithLinks(text: string, keyPrefix: string): React.ReactNode[] {
  // First, unescape any escaped markdown characters to properly match links
  const unescapedText = unescapeMarkdown(text);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const linkRegex = new RegExp(LINK_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(unescapedText)) !== null) {
    // Add text before the link (with mention and markdown processing)
    if (match.index > lastIndex) {
      const textBefore = unescapedText.slice(lastIndex, match.index);
      parts.push(
        ...renderFormattedTextWithMentions(textBefore, `${keyPrefix}-before-${match.index}`)
      );
    }

    // Add the link
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={`${keyPrefix}-link-${match.index}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        {linkText}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last link
  if (lastIndex < unescapedText.length) {
    const textAfter = unescapedText.slice(lastIndex);
    parts.push(
      ...renderFormattedTextWithMentions(textAfter, `${keyPrefix}-after-${lastIndex}`)
    );
  }

  return parts.length > 0
    ? parts
    : renderFormattedTextWithMentions(unescapedText, keyPrefix);
}

/**
 * Renders message content with @mentions highlighted, images displayed,
 * links, and markdown formatting (bold, italic, code)
 */
export function renderMessageContent(content: string): React.ReactNode {
  if (!content) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const imageRegex = new RegExp(IMAGE_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(content)) !== null) {
    // Add text before the image (with link, mention, and markdown processing)
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <span key={`text-${lastIndex}`}>
          {renderTextWithLinks(textBefore, `text-${lastIndex}`)}
        </span>
      );
    }

    // Add the image element - using block display to prevent overlap
    const altText = match[1] || 'Image';
    const imageUrl = match[2];
    parts.push(
      <div key={`image-${match.index}`} className="my-2 block clear-both">
        <img
          src={imageUrl}
          alt={altText}
          className="max-w-full max-h-80 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity block"
          onClick={() => window.open(imageUrl, '_blank')}
          onLoad={(e) => {
            // Force reflow after image loads to ensure proper layout
            const img = e.currentTarget;
            img.style.display = 'block';
          }}
          data-testid={`message-image-${match.index}`}
        />
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last image (with link, mention, and markdown processing)
  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    parts.push(
      <span key={`text-${lastIndex}`}>
        {renderTextWithLinks(textAfter, `text-${lastIndex}`)}
      </span>
    );
  }

  // If no special elements found, just process for links, mentions, and markdown
  if (parts.length === 0) {
    return <span>{renderTextWithLinks(content, 'content')}</span>;
  }

  return <>{parts}</>;
}

/**
 * Highlights matched substring in text (TB103)
 */
export function highlightSearchMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + query.length);
  const after = text.slice(matchIndex + query.length);

  return (
    <>
      {before}
      <mark
        className="bg-yellow-200 text-gray-900 rounded-sm px-0.5"
        data-testid="search-highlight"
      >
        {match}
      </mark>
      {after}
    </>
  );
}
