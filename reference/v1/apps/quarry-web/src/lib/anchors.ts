/**
 * Text Anchoring System for Document Comments
 *
 * Provides utilities for creating and matching text anchors that survive
 * document edits. Anchors use surrounding context (prefix/suffix) and
 * content hashing to find where commented text appears in a document.
 *
 * Architecture:
 * - Anchor stores: hash, prefix (100 chars before), text, suffix (100 chars after)
 * - On document load: search for anchor location using fuzzy matching
 * - If text changed: try to relocate using prefix/suffix patterns
 */

export interface TextAnchor {
  /** SHA-256 hash of the selected text (first 16 chars) */
  hash: string;
  /** ~100 characters before the selected text */
  prefix: string;
  /** The selected/highlighted text itself */
  text: string;
  /** ~100 characters after the selected text */
  suffix: string;
}

export interface AnchorMatch {
  /** Found position - start offset in document */
  startOffset: number;
  /** Found position - end offset in document */
  endOffset: number;
  /** Current text at the matched position */
  matchedText: string;
  /** Confidence score 0-1 (1 = perfect match) */
  confidence: number;
  /** Whether the original text has changed */
  textChanged: boolean;
}

const CONTEXT_LENGTH = 100;

/**
 * Simple hash function (FNV-1a variant for browser compatibility)
 * Used for anchor identification, not security
 */
function simpleHash(text: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  // Convert to base36 for compact representation
  return hash.toString(36).padStart(7, '0');
}

/**
 * Creates a text anchor from selected text and its position in document
 *
 * @param documentText - The full document content
 * @param startOffset - Start position of selected text
 * @param endOffset - End position of selected text
 * @returns TextAnchor object for storage
 */
export function createTextAnchor(
  documentText: string,
  startOffset: number,
  endOffset: number
): TextAnchor {
  const selectedText = documentText.slice(startOffset, endOffset);

  // Get surrounding context
  const prefixStart = Math.max(0, startOffset - CONTEXT_LENGTH);
  const prefix = documentText.slice(prefixStart, startOffset);

  const suffixEnd = Math.min(documentText.length, endOffset + CONTEXT_LENGTH);
  const suffix = documentText.slice(endOffset, suffixEnd);

  return {
    hash: simpleHash(selectedText),
    prefix,
    text: selectedText,
    suffix,
  };
}

/**
 * Finds the current position of an anchor in a document
 *
 * Tries multiple strategies:
 * 1. Exact text match
 * 2. Hash + context match
 * 3. Fuzzy match using prefix/suffix
 *
 * @param anchor - The anchor to locate
 * @param documentText - Current document content
 * @returns AnchorMatch if found, null if anchor cannot be located
 */
export function findAnchorPosition(
  anchor: TextAnchor,
  documentText: string
): AnchorMatch | null {
  // Strategy 1: Exact text match with context
  const exactMatch = findExactMatch(anchor, documentText);
  if (exactMatch) {
    return exactMatch;
  }

  // Strategy 2: Find by context patterns (text may have changed slightly)
  const contextMatch = findByContext(anchor, documentText);
  if (contextMatch) {
    return contextMatch;
  }

  // Strategy 3: Fuzzy match on prefix/suffix (last resort)
  const fuzzyMatch = findByFuzzyContext(anchor, documentText);
  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  return null;
}

/**
 * Strategy 1: Find exact text match with full context
 */
function findExactMatch(anchor: TextAnchor, documentText: string): AnchorMatch | null {
  // Look for the exact text
  let searchStart = 0;
  let bestMatch: AnchorMatch | null = null;
  let bestScore = 0;

  while (true) {
    const index = documentText.indexOf(anchor.text, searchStart);
    if (index === -1) break;

    // Score this match based on context similarity
    const prefixStart = Math.max(0, index - CONTEXT_LENGTH);
    const currentPrefix = documentText.slice(prefixStart, index);
    const suffixEnd = Math.min(documentText.length, index + anchor.text.length + CONTEXT_LENGTH);
    const currentSuffix = documentText.slice(index + anchor.text.length, suffixEnd);

    const prefixScore = calculateSimilarity(anchor.prefix, currentPrefix);
    const suffixScore = calculateSimilarity(anchor.suffix, currentSuffix);
    const score = (prefixScore + suffixScore) / 2;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        startOffset: index,
        endOffset: index + anchor.text.length,
        matchedText: anchor.text,
        confidence: score,
        textChanged: false,
      };
    }

    searchStart = index + 1;
  }

  // Return if we found a good match (>0.5 context similarity)
  if (bestMatch && bestScore > 0.5) {
    return bestMatch;
  }

  return null;
}

/**
 * Strategy 2: Find by context patterns when exact text not found
 */
function findByContext(anchor: TextAnchor, documentText: string): AnchorMatch | null {
  // Try to find unique prefix/suffix combo
  const minContextLen = Math.min(20, anchor.prefix.length, anchor.suffix.length);
  if (minContextLen < 5) return null;

  // Search for prefix ending
  const prefixEnd = anchor.prefix.slice(-minContextLen);
  const suffixStart = anchor.suffix.slice(0, minContextLen);

  let searchStart = 0;
  let bestMatch: AnchorMatch | null = null;
  let bestScore = 0;

  while (true) {
    const prefixIndex = documentText.indexOf(prefixEnd, searchStart);
    if (prefixIndex === -1) break;

    const textStart = prefixIndex + prefixEnd.length;

    // Look for suffix within reasonable range
    const maxSearchLen = anchor.text.length * 2 + 50; // Allow some variance
    const searchEnd = Math.min(documentText.length, textStart + maxSearchLen);
    const searchArea = documentText.slice(textStart, searchEnd);
    const suffixIndex = searchArea.indexOf(suffixStart);

    if (suffixIndex !== -1) {
      const textEnd = textStart + suffixIndex;
      const matchedText = documentText.slice(textStart, textEnd);

      // Calculate confidence based on context match
      const prefixScore = calculateSimilarity(
        anchor.prefix,
        documentText.slice(Math.max(0, textStart - CONTEXT_LENGTH), textStart)
      );
      const suffixScore = calculateSimilarity(
        anchor.suffix,
        documentText.slice(textEnd, Math.min(documentText.length, textEnd + CONTEXT_LENGTH))
      );
      const score = (prefixScore + suffixScore) / 2;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          startOffset: textStart,
          endOffset: textEnd,
          matchedText,
          confidence: score * 0.8, // Reduce confidence since text changed
          textChanged: matchedText !== anchor.text,
        };
      }
    }

    searchStart = prefixIndex + 1;
  }

  if (bestMatch && bestScore > 0.4) {
    return bestMatch;
  }

  return null;
}

/**
 * Strategy 3: Fuzzy matching using substring patterns
 */
function findByFuzzyContext(anchor: TextAnchor, documentText: string): AnchorMatch | null {
  // Take unique parts of prefix and suffix
  const prefixChunk = anchor.prefix.slice(-30);
  const suffixChunk = anchor.suffix.slice(0, 30);

  if (prefixChunk.length < 10 && suffixChunk.length < 10) return null;

  let bestMatch: AnchorMatch | null = null;
  let bestScore = 0;

  // Search for prefix chunks
  for (let i = 0; i < documentText.length - 10; i++) {
    const similarity = calculateSimilarity(
      prefixChunk,
      documentText.slice(Math.max(0, i - prefixChunk.length), i)
    );

    if (similarity > 0.6) {
      // Found potential prefix location, look for suffix
      const searchStart = i;
      const searchEnd = Math.min(documentText.length, i + anchor.text.length * 3);

      for (let j = searchStart + 5; j < searchEnd; j++) {
        const suffixSim = calculateSimilarity(
          suffixChunk,
          documentText.slice(j, j + suffixChunk.length)
        );

        if (suffixSim > 0.6) {
          const score = (similarity + suffixSim) / 2;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              startOffset: i,
              endOffset: j,
              matchedText: documentText.slice(i, j),
              confidence: score * 0.5, // Low confidence for fuzzy match
              textChanged: true,
            };
          }
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses longest common subsequence ratio
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Simple character-by-character comparison for performance
  let matches = 0;
  const minLen = Math.min(a.length, b.length);

  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
  }

  return matches / maxLen;
}

/**
 * Serialize anchor to JSON string for database storage
 */
export function serializeAnchor(anchor: TextAnchor): string {
  return JSON.stringify(anchor);
}

/**
 * Deserialize anchor from JSON string
 */
export function deserializeAnchor(json: string): TextAnchor {
  return JSON.parse(json) as TextAnchor;
}

/**
 * Get plain text content from document for anchoring
 * This strips HTML/Markdown and returns raw text
 */
export function getPlainTextForAnchoring(content: string, contentType: string): string {
  if (contentType === 'text') {
    return content;
  }

  // For markdown/html, strip tags and get plain text
  // This is a simple implementation - the editor provides actual text
  return content
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/#{1,6}\s/g, '') // Remove markdown headers
    .replace(/\*{1,2}|_{1,2}/g, '') // Remove bold/italic markers
    .replace(/`{1,3}/g, '') // Remove code markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Replace images with alt text
    .replace(/>\s/g, '') // Remove blockquote markers
    .replace(/[-*+]\s/g, '') // Remove list markers
    .replace(/\d+\.\s/g, '') // Remove numbered list markers
    .trim();
}
