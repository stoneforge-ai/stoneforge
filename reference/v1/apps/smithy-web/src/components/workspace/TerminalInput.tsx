/**
 * TerminalInput - Shared text input component for agent messaging
 *
 * Used by both StreamViewer (ephemeral workers) and WorkspacePane (persistent workers)
 * to provide a consistent input experience for sending messages to agents.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

export interface TerminalInputProps {
  /** Whether the input is connected and can send messages */
  isConnected: boolean;
  /** Called when the user sends a message */
  onSend: (message: string) => Promise<void> | void;
  /** Placeholder text when connected */
  connectedPlaceholder?: string;
  /** Placeholder text when disconnected */
  disconnectedPlaceholder?: string;
  /** Test ID for testing */
  'data-testid'?: string;
}

export function TerminalInput({
  isConnected,
  onSend,
  connectedPlaceholder = 'Type a message...',
  disconnectedPlaceholder = 'Connect to send messages',
  'data-testid': testId = 'terminal-input',
}: TerminalInputProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set to scrollHeight, but cap at a reasonable max (e.g., 200px / ~8 lines)
    const maxHeight = 200;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  // Adjust height whenever input changes
  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending || !isConnected) return;

    const message = input.trim();
    setIsSending(true);
    setInput('');

    try {
      await onSend(message);
    } catch (err) {
      console.error('[TerminalInput] Error sending message:', err);
      // Restore input on error
      setInput(message);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, isConnected, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div
      className="
        flex items-end gap-2 p-3
        border-t border-[var(--color-border)]
        bg-[var(--color-surface)]
      "
      data-testid={testId}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? connectedPlaceholder : disconnectedPlaceholder}
        disabled={!isConnected || isSending}
        rows={1}
        className="
          flex-1 px-3 py-2
          text-sm
          bg-[var(--color-bg)]
          border border-[var(--color-border)]
          rounded-md
          placeholder:text-[var(--color-text-tertiary)]
          focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-none
          overflow-y-auto
        "
        style={{ minHeight: '38px' }}
        data-testid={`${testId}-field`}
      />
      <button
        onClick={handleSend}
        disabled={!input.trim() || !isConnected || isSending}
        className="
          p-2 rounded-md
          text-white bg-[var(--color-primary)]
          hover:bg-[var(--color-primary-hover)]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
          flex-shrink-0
        "
        title="Send message (Enter)"
        data-testid={`${testId}-send-btn`}
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
