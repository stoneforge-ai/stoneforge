/**
 * Content Hashing - SHA256 hashing for conflict detection
 *
 * Computes content hashes for elements to detect actual content changes
 * during merge operations. Excludes identity and attribution fields.
 */

import { createHash } from 'crypto';
import type { Element } from '@stoneforge/core';
import type { ContentHashResult } from './types.js';
import { HASH_EXCLUDED_FIELDS } from './types.js';

// ============================================================================
// Content Hash Computation
// ============================================================================

/**
 * Compute content hash for an element
 *
 * Hash computation:
 * 1. Collect content fields (exclude identity/attribution)
 * 2. Sort object keys for determinism
 * 3. JSON stringify
 * 4. Prepend type for type-specific hashing
 * 5. SHA256 hash
 *
 * @param element - Element to hash
 * @returns Hash result with hex-encoded SHA256 hash
 */
export async function computeContentHash(element: Element): Promise<ContentHashResult> {
  // Collect content fields
  const contentFields: Record<string, unknown> = {};
  const includedFields: string[] = [];

  for (const [key, value] of Object.entries(element)) {
    if (!HASH_EXCLUDED_FIELDS.includes(key as (typeof HASH_EXCLUDED_FIELDS)[number])) {
      contentFields[key] = value;
      includedFields.push(key);
    }
  }

  // Sort keys for determinism
  const sortedFields: Record<string, unknown> = {};
  const sortedKeys = Object.keys(contentFields).sort();
  for (const key of sortedKeys) {
    sortedFields[key] = contentFields[key];
  }

  // Create hash input: type prefix + JSON content
  const hashInput = `${element.type}:${JSON.stringify(sortedFields, sortKeyReplacer)}`;

  // Compute SHA256 hash
  const hash = await sha256Hex(hashInput);

  return {
    hash,
    fields: includedFields.sort(),
  };
}

/**
 * Compute content hash synchronously using Node.js crypto
 *
 * Works in both Bun and Node.js runtimes.
 *
 * @param element - Element to hash
 * @returns Hash result with hex-encoded SHA256 hash
 */
export function computeContentHashSync(element: Element): ContentHashResult {
  // Collect content fields
  const contentFields: Record<string, unknown> = {};
  const includedFields: string[] = [];

  for (const [key, value] of Object.entries(element)) {
    if (!HASH_EXCLUDED_FIELDS.includes(key as (typeof HASH_EXCLUDED_FIELDS)[number])) {
      contentFields[key] = value;
      includedFields.push(key);
    }
  }

  // Sort keys for determinism
  const sortedFields: Record<string, unknown> = {};
  const sortedKeys = Object.keys(contentFields).sort();
  for (const key of sortedKeys) {
    sortedFields[key] = contentFields[key];
  }

  // Create hash input: type prefix + JSON content
  const hashInput = `${element.type}:${JSON.stringify(sortedFields, sortKeyReplacer)}`;

  // Compute SHA256 hash using Node.js crypto (works in both Bun and Node.js)
  const hash = createHash('sha256').update(hashInput).digest('hex');

  return {
    hash,
    fields: includedFields.sort(),
  };
}

// ============================================================================
// Hash Comparison
// ============================================================================

/**
 * Check if two elements have the same content hash
 *
 * @param a - First element
 * @param b - Second element
 * @returns True if content hashes match
 */
export function hasSameContentHash(a: Element, b: Element): boolean {
  const hashA = computeContentHashSync(a);
  const hashB = computeContentHashSync(b);
  return hashA.hash === hashB.hash;
}

/**
 * Compare pre-computed hash with element
 *
 * @param element - Element to check
 * @param expectedHash - Expected hash value
 * @returns True if hash matches
 */
export function matchesContentHash(element: Element, expectedHash: string): boolean {
  const result = computeContentHashSync(element);
  return result.hash === expectedHash;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * JSON replacer that sorts object keys for deterministic stringification
 */
function sortKeyReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Compute SHA256 hash of a string, returning hex-encoded result
 * Uses Web Crypto API for async operation
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
