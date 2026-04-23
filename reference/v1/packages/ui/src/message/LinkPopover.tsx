/**
 * LinkPopover - An inline popover for creating, editing, and removing links
 * in the MessageRichComposer Tiptap editor.
 *
 * Features:
 * - Inline URL input (no window.prompt/alert)
 * - Create links from selected text
 * - Edit existing link URLs
 * - Remove links
 * - Auto-prepend https:// if no protocol provided
 * - Keyboard shortcuts: Enter to apply, Escape to cancel
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link2Off, ExternalLink } from 'lucide-react';
import type { Editor } from '@tiptap/core';

interface LinkPopoverProps {
  editor: Editor;
  onClose: () => void;
  /** Position anchor element for the popover */
  anchorRect?: DOMRect | null;
}

/**
 * Normalize a URL by adding https:// if no protocol is present.
 */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  // If it already has a protocol, return as-is
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Validate that a URL is well-formed.
 */
function isValidUrl(url: string): boolean {
  try {
    const normalized = normalizeUrl(url);
    if (!normalized) return false;
    new URL(normalized);
    return true;
  } catch {
    return false;
  }
}

export function LinkPopover({ editor, onClose, anchorRect }: LinkPopoverProps) {
  const isExistingLink = editor.isActive('link');
  const currentUrl = isExistingLink
    ? (editor.getAttributes('link').href || '')
    : '';

  const [url, setUrl] = useState(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    // Small delay to ensure the popover is rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const applyLink = useCallback(() => {
    const normalized = normalizeUrl(url);
    if (!normalized || !isValidUrl(url)) {
      // If empty/invalid, remove link if one exists
      if (isExistingLink) {
        editor.chain().focus().unsetLink().run();
      }
      onClose();
      return;
    }

    editor
      .chain()
      .focus()
      .setLink({ href: normalized })
      .run();
    onClose();
  }, [editor, url, isExistingLink, onClose]);

  const removeLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    onClose();
  }, [editor, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyLink();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [applyLink, onClose]
  );

  // Calculate position relative to the toolbar or selection
  const style: React.CSSProperties = {};
  if (anchorRect) {
    style.position = 'fixed';
    style.top = `${anchorRect.bottom + 4}px`;
    style.left = `${anchorRect.left}px`;
    style.zIndex = 50;
  }

  return (
    <div
      ref={popoverRef}
      data-testid="link-popover"
      className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex items-center gap-2 min-w-[320px]"
      style={style}
    >
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter URL (e.g., https://example.com)"
        data-testid="link-popover-input"
        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        type="button"
        onClick={applyLink}
        disabled={!url.trim()}
        data-testid="link-popover-apply"
        title="Apply link"
        className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isExistingLink ? 'Update' : 'Apply'}
      </button>
      {isExistingLink && (
        <>
          <button
            type="button"
            onClick={removeLink}
            data-testid="link-popover-remove"
            title="Remove link"
            className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Link2Off className="w-4 h-4" />
          </button>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open link in new tab"
            data-testid="link-popover-open"
            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </>
      )}
    </div>
  );
}

export default LinkPopover;
