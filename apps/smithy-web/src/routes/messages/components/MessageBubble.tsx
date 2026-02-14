/**
 * MessageBubble and DateSeparator components for displaying messages
 */

import { useState, useRef } from 'react';
import {
  MessageCircle,
  Copy,
  Check,
  FileText,
  Calendar,
  MoreVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { EntityLink } from '@stoneforge/ui/domain';
import { renderMessageContent } from '../../../lib/message-content';
import { useEntities } from '../../../api/hooks/useMessages';
import type { Message } from '../types';

// ============================================================================
// DateSeparator (TB99)
// ============================================================================

interface DateSeparatorProps {
  date: string;
  isSticky?: boolean;
}

export function DateSeparator({ date, isSticky = false }: DateSeparatorProps) {
  return (
    <div
      data-testid={`date-separator-${date.replace(/\s/g, '-').toLowerCase()}`}
      className={`flex items-center gap-3 py-3 ${
        isSticky ? 'sticky top-0 bg-white z-10 -mx-4 px-4 shadow-sm' : ''
      }`}
    >
      <div className="flex-1 h-px bg-gray-200" />
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
        <Calendar className="w-3 h-3 text-gray-500" />
        <span data-testid="date-separator-label" className="text-xs font-medium text-gray-600">
          {date}
        </span>
      </div>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ============================================================================
// MessageBubble
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  onReply?: (message: Message) => void;
  replyCount?: number;
  isThreaded?: boolean;
  isHighlighted?: boolean;
  isMobile?: boolean;
}

export function MessageBubble({
  message,
  onReply,
  replyCount = 0,
  isThreaded = false,
  isHighlighted = false,
  isMobile = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const touchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: entities } = useEntities();
  const senderEntity = entities?.find((e) => e.id === message.sender);
  const senderName = senderEntity?.name;
  const avatarInitials = senderName
    ? senderName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : message.sender.slice(-2).toUpperCase();

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = async () => {
    const content = message._content || '';
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Message copied');
      setTimeout(() => setCopied(false), 2000);
      setShowMobileActions(false);
    } catch {
      toast.error('Failed to copy message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Copy on 'c' key when focused (not with modifiers)
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      handleCopy();
    }
  };

  // Long-press handler for mobile
  const handleLongPress = () => {
    if (isMobile) {
      setShowMobileActions(true);
    }
  };

  // Touch handlers for long-press detection
  const handleTouchStart = () => {
    if (isMobile) {
      touchTimeoutRef.current = setTimeout(handleLongPress, 500);
    }
  };

  const handleTouchEnd = () => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  };

  const handleTouchMove = () => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  };

  return (
    <>
      <div
        ref={messageRef}
        data-testid={`message-${message.id}`}
        className={`flex rounded-lg group relative focus:bg-blue-50 dark:focus:bg-blue-900/20 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:outline-none transition-colors duration-300 ${
          isMobile ? 'gap-2 p-2' : 'gap-3 p-3'
        } ${
          isHighlighted
            ? 'bg-yellow-100 dark:bg-yellow-900/30 ring-2 ring-yellow-300 dark:ring-yellow-600'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {/* Avatar placeholder - smaller on mobile */}
        <div
          data-testid={`message-avatar-${message.id}`}
          className={`rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0 ${
            isMobile ? 'w-8 h-8' : 'w-10 h-10'
          }`}
        >
          <span
            className={`text-blue-600 dark:text-blue-400 font-medium ${
              isMobile ? 'text-xs' : 'text-sm'
            }`}
          >
            {avatarInitials}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className={`flex items-baseline ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <EntityLink
              entityRef={message.sender}
              className={`font-semibold ${isMobile ? 'text-sm' : ''}`}
              data-testid={`message-sender-${message.id}`}
            >
              {senderName}
            </EntityLink>
            <span
              data-testid={`message-time-${message.id}`}
              className={`text-gray-400 dark:text-gray-500 ${
                isMobile ? 'text-[10px]' : 'text-xs'
              }`}
            >
              {formattedTime}
            </span>
          </div>
          <div
            data-testid={`message-content-${message.id}`}
            className={`text-[var(--color-text-secondary)] mt-1 break-words overflow-hidden whitespace-pre-wrap ${
              isMobile ? 'text-sm' : ''
            }`}
          >
            {message._content ? (
              renderMessageContent(message._content)
            ) : (
              <span className="text-gray-400 dark:text-gray-500 italic">
                Content not loaded
              </span>
            )}
          </div>

          {/* Attachments */}
          {message._attachments && message._attachments.length > 0 && (
            <div className="mt-2 space-y-1" data-testid={`message-attachments-${message.id}`}>
              {message._attachments.map((doc) => (
                <a
                  key={doc.id}
                  href={`/documents?selected=${doc.id}`}
                  className={`flex items-center gap-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] rounded-lg border border-[var(--color-border)] transition-colors ${
                    isMobile ? 'px-2 py-1.5' : 'px-3 py-2'
                  }`}
                  data-testid={`message-attachment-${doc.id}`}
                >
                  <FileText
                    className={`text-gray-400 flex-shrink-0 ${
                      isMobile ? 'w-3 h-3' : 'w-4 h-4'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-medium text-blue-600 dark:text-blue-400 truncate ${
                        isMobile ? 'text-xs' : 'text-sm'
                      }`}
                    >
                      {doc.title || 'Untitled Document'}
                    </div>
                    <div className={isMobile ? 'text-[10px]' : 'text-xs'}>
                      <span className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px]">
                        {doc.contentType}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Thread indicators and reply button */}
          <div className={`flex items-center gap-2 ${isMobile ? 'mt-1.5' : 'mt-2'}`}>
            {/* Only show "Reply in thread" indicator when NOT already viewing inside a thread panel */}
            {message.threadId && !isThreaded && (
              <div
                data-testid={`message-thread-indicator-${message.id}`}
                className={`text-blue-500 ${isMobile ? 'text-[10px]' : 'text-xs'}`}
              >
                Reply in thread
              </div>
            )}

            {/* Show reply count for root messages */}
            {!isThreaded && replyCount > 0 && (
              <button
                data-testid={`message-replies-${message.id}`}
                onClick={() => onReply?.(message)}
                className={`flex items-center gap-1 text-blue-600 hover:text-blue-700 ${
                  isMobile ? 'text-[10px]' : 'text-xs'
                }`}
              >
                <MessageCircle className={isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                <span>
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </span>
              </button>
            )}

            {/* Reply button (shown on hover for non-threaded messages without replies - desktop only) */}
            {!isThreaded && !message.threadId && onReply && !isMobile && (
              <button
                data-testid={`message-reply-button-${message.id}`}
                onClick={() => onReply(message)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MessageCircle className="w-3 h-3" />
                <span>Reply</span>
              </button>
            )}
          </div>
        </div>

        {/* Hover action menu - positioned at top right (desktop only) */}
        {!isMobile && (
          <div
            data-testid={`message-actions-${message.id}`}
            className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-sm p-1"
          >
            <button
              data-testid={`message-copy-button-${message.id}`}
              onClick={handleCopy}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Copy message (C when focused)"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            {!isThreaded && onReply && (
              <button
                data-testid={`message-reply-action-${message.id}`}
                onClick={() => onReply(message)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title="Reply in thread"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Mobile: More actions button (always visible) */}
        {isMobile && (
          <button
            data-testid={`message-more-button-${message.id}`}
            onClick={() => setShowMobileActions(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 self-start mt-1 touch-target"
            aria-label="More actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mobile action sheet */}
      {isMobile && showMobileActions && (
        <MobileActionSheet
          message={message}
          isThreaded={isThreaded}
          onCopy={handleCopy}
          onReply={onReply}
          copied={copied}
          onClose={() => setShowMobileActions(false)}
        />
      )}
    </>
  );
}

// ============================================================================
// MobileActionSheet (extracted for clarity)
// ============================================================================

interface MobileActionSheetProps {
  message: Message;
  isThreaded: boolean;
  onCopy: () => void;
  onReply?: (message: Message) => void;
  copied: boolean;
  onClose: () => void;
}

function MobileActionSheet({
  message,
  isThreaded,
  onCopy,
  onReply,
  copied,
  onClose,
}: MobileActionSheetProps) {
  return (
    <div
      className="fixed inset-0 z-50"
      data-testid={`message-action-sheet-${message.id}`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Action sheet */}
      <div className="absolute bottom-0 inset-x-0 bg-[var(--color-bg)] rounded-t-2xl shadow-2xl p-4 space-y-2 animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />

        <button
          onClick={onCopy}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-target"
          data-testid={`message-copy-action-mobile-${message.id}`}
        >
          {copied ? (
            <Check className="w-5 h-5 text-green-500" />
          ) : (
            <Copy className="w-5 h-5 text-gray-500" />
          )}
          <span className="text-[var(--color-text)]">Copy message</span>
        </button>

        {!isThreaded && onReply && (
          <button
            onClick={() => {
              onReply(message);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-target"
            data-testid={`message-reply-action-mobile-${message.id}`}
          >
            <MessageCircle className="w-5 h-5 text-gray-500" />
            <span className="text-[var(--color-text)]">Reply in thread</span>
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full flex items-center justify-center px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors mt-2 touch-target"
        >
          <span className="text-[var(--color-text)] font-medium">Cancel</span>
        </button>
      </div>
    </div>
  );
}
