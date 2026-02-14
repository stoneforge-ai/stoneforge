/**
 * BubbleMenu - Floating formatting toolbar that appears when text is selected
 *
 * Features:
 * - Appears above selected text
 * - Provides quick access to inline formatting (bold, italic, code, strikethrough, highlight)
 * - Keyboard shortcut hints on hover
 * - Platform-aware shortcut display (⌘ on Mac, Ctrl on Windows/Linux)
 */

import { Editor } from '@tiptap/react';
import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';
import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Code,
  Strikethrough,
  Highlighter,
  MessageSquare,
} from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';

// Detect platform for keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

interface BubbleMenuButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  testId?: string;
}

function BubbleMenuButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  label,
  shortcut,
  testId,
}: BubbleMenuButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        className={`p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
          isActive ? 'bg-gray-700 text-blue-400' : 'text-gray-300 hover:text-white'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function BubbleMenuDivider() {
  return <div className="w-px h-5 bg-gray-600 mx-0.5" />;
}

interface EditorBubbleMenuProps {
  editor: Editor;
  onComment?: (selectedText: string, from: number, to: number) => void;
}

export function EditorBubbleMenu({ editor, onComment }: EditorBubbleMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  // Track editor state to force re-renders when formatting changes
  const [, setForceUpdate] = useState(0);

  useEffect(() => {
    if (!menuRef.current || !editor) return;

    const plugin = BubbleMenuPlugin({
      pluginKey: 'bubbleMenu',
      editor,
      element: menuRef.current,
      shouldShow: ({ editor, state }) => {
        const { from, to } = state.selection;
        const text = state.doc.textBetween(from, to, ' ');

        // Only show when there's actual text selected (not just cursor position)
        // and not in a code block
        const show = text.length > 0 && !editor.isActive('codeBlock');
        setIsVisible(show);
        return show;
      },
      options: {
        placement: 'top',
        offset: { mainAxis: 10 },
      },
    });

    editor.registerPlugin(plugin);

    // Listen for selection and transaction changes to update button states
    const handleUpdate = () => {
      setForceUpdate(n => n + 1);
    };
    editor.on('selectionUpdate', handleUpdate);
    editor.on('transaction', handleUpdate);

    return () => {
      editor.unregisterPlugin('bubbleMenu');
      editor.off('selectionUpdate', handleUpdate);
      editor.off('transaction', handleUpdate);
    };
  }, [editor]);

  return (
    <div
      ref={menuRef}
      className={`bubble-menu flex items-center gap-0.5 px-1.5 py-1 bg-gray-900 rounded-lg shadow-xl border border-gray-700 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{ position: 'absolute', zIndex: 50 }}
      data-testid="bubble-menu"
    >
      {/* Text formatting */}
      <BubbleMenuButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        label="Bold"
        shortcut={`${modKey}B`}
        testId="bubble-menu-bold"
      >
        <Bold className="w-4 h-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        label="Italic"
        shortcut={`${modKey}I`}
        testId="bubble-menu-italic"
      >
        <Italic className="w-4 h-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        label="Inline Code"
        shortcut={`${modKey}E`}
        testId="bubble-menu-code"
      >
        <Code className="w-4 h-4" />
      </BubbleMenuButton>

      <BubbleMenuDivider />

      <BubbleMenuButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        label="Strikethrough"
        shortcut={`${modKey}⇧S`}
        testId="bubble-menu-strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        label="Highlight"
        shortcut={`${modKey}⇧H`}
        testId="bubble-menu-highlight"
      >
        <Highlighter className="w-4 h-4" />
      </BubbleMenuButton>

      {/* Comment button - only shown if onComment callback is provided */}
      {onComment && (
        <>
          <BubbleMenuDivider />
          <BubbleMenuButton
            onClick={() => {
              const { from, to } = editor.state.selection;
              const selectedText = editor.state.doc.textBetween(from, to, ' ');
              onComment(selectedText, from, to);
            }}
            label="Add Comment"
            testId="bubble-menu-comment"
          >
            <MessageSquare className="w-4 h-4" />
          </BubbleMenuButton>
        </>
      )}
    </div>
  );
}

export default EditorBubbleMenu;
