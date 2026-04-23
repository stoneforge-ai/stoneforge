/**
 * Thread panel components for threaded message conversations
 */

import { useState, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { VirtualizedChatList } from '../../../components/shared/VirtualizedChatList';
import {
  MessageRichComposer,
  type MessageRichComposerRef,
} from '@stoneforge/ui';
import { useCurrentUser } from '../../../contexts';
import { useThreadReplies, useSendMessage, useEntities } from '../../../api/hooks/useMessages';
import { MessageBubble } from './MessageBubble';
import type { Message, Channel } from '../types';

// ============================================================================
// ThreadPanel
// ============================================================================

interface ThreadPanelProps {
  parentMessage: Message;
  channel: Channel | undefined;
  onClose: () => void;
}

export function ThreadPanel({ parentMessage, channel, onClose }: ThreadPanelProps) {
  const { data: replies = [], isLoading } = useThreadReplies(parentMessage.id);

  // TB131: Use VirtualizedChatList for thread replies
  return (
    <div
      data-testid="thread-panel"
      className="w-80 border-l border-gray-200 flex flex-col bg-white"
    >
      {/* Thread Header */}
      <div
        data-testid="thread-header"
        className="p-4 border-b border-gray-200 flex items-center justify-between"
      >
        <h3 className="font-medium text-gray-900">Thread</h3>
        <button
          data-testid="thread-close-button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Parent Message */}
      <div data-testid="thread-parent-message" className="border-b border-gray-100">
        <MessageBubble message={parentMessage} isThreaded />
      </div>

      {/* Thread Replies - TB131: Virtualized */}
      <div data-testid="thread-replies" className="flex-1 overflow-hidden p-2">
        {isLoading ? (
          <div className="text-center py-4 text-gray-500 text-sm">Loading replies...</div>
        ) : (
          <VirtualizedChatList
            items={replies}
            getItemKey={(reply) => reply.id}
            estimateSize={(index) => {
              const baseHeight = 80; // Threaded messages are typically smaller
              const reply = replies[index];
              const content = reply?._content || '';
              // Add height for messages with images
              if (content.includes('![') && content.includes('](')) {
                return baseHeight + 340;
              }
              return baseHeight;
            }}
            testId="virtualized-thread-replies"
            gap={4}
            latestMessageId={replies[replies.length - 1]?.id}
            renderEmpty={() => (
              <div data-testid="thread-empty" className="text-center py-4 text-gray-500 text-sm">
                No replies yet
              </div>
            )}
            renderItem={(reply) => <MessageBubble message={reply} isThreaded />}
          />
        )}
      </div>

      {/* Thread Composer */}
      <ThreadComposer parentMessage={parentMessage} channel={channel} />
    </div>
  );
}

// ============================================================================
// ThreadComposer
// ============================================================================

interface ThreadComposerProps {
  parentMessage: Message;
  channel: Channel | undefined;
}

function ThreadComposer({ parentMessage, channel }: ThreadComposerProps) {
  const [content, setContent] = useState('');
  const sendMessage = useSendMessage();
  const editorRef = useRef<MessageRichComposerRef>(null);
  const { currentUser } = useCurrentUser();
  // Fetch entities for @mention autocomplete
  const { data: entities = [] } = useEntities();

  const handleSubmit = async () => {
    if (!content.trim() || !channel || !currentUser) return;

    const sender = currentUser.id;

    try {
      await sendMessage.mutateAsync({
        channelId: parentMessage.channelId,
        sender,
        content: content.trim(),
        threadId: parentMessage.id,
      });
      setContent('');
      editorRef.current?.clear();
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  return (
    <form
      data-testid="thread-composer"
      onSubmit={handleFormSubmit}
      className="p-3 border-t border-gray-200 bg-white"
    >
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <MessageRichComposer
            ref={editorRef}
            content={content}
            onChange={setContent}
            onSubmit={handleSubmit}
            placeholder="Reply in thread..."
            disabled={sendMessage.isPending}
            maxHeight={120}
            minHeight={48}
            mentionEntities={entities}
          />
        </div>
        <button
          type="submit"
          data-testid="thread-send-button"
          disabled={!content.trim() || sendMessage.isPending}
          className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end mb-1"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
