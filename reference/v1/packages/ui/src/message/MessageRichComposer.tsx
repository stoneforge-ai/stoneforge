/**
 * MessageRichComposer - A mini Tiptap editor for rich text message composition
 *
 * Features:
 * - Rich text formatting: bold, italic, underline, strikethrough
 * - Inline code and code blocks
 * - Bullet lists and numbered lists
 * - Block quotes
 * - Links (create, edit, remove via toolbar button or Cmd/Ctrl+K)
 * - Compact toolbar (toggleable)
 * - Markdown shortcuts (e.g., **bold**, _italic_)
 * - Enter to send, Shift+Enter for newline
 * - Image paste support (TB102)
 * - Slash commands for quick block insertion (TB127)
 * - # autocomplete for element embedding (TB128)
 * - @ mention autocomplete for entity tagging
 *
 * TB101, TB102, TB127, TB128 Implementation
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { MessageSlashCommands, type MessageEmbedCallbacks } from './MessageSlashCommands';
import { HashAutocomplete, createElementFetcher } from './HashAutocomplete';
import { MentionAutocomplete, MentionNode, type MentionEntity } from './MentionAutocomplete';
import { LinkPopover } from './LinkPopover';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  prepareContentForEditor,
  prepareContentForStorage,
} from './markdown';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  FileCode,
  List,
  ListOrdered,
  Quote,
  Link2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Detect platform for keyboard shortcut display
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

interface MessageRichComposerProps {
  content: string;
  onChange: (content: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxHeight?: number;
  minHeight?: number;
  channelName?: string;
  /** Called when an image is pasted from clipboard (TB102) */
  onImagePaste?: (file: File) => void;
  /** Embed callbacks for slash commands (TB127) */
  embedCallbacks?: MessageEmbedCallbacks;
  /** Entities available for @mention autocomplete */
  mentionEntities?: MentionEntity[];
}

export interface MessageRichComposerRef {
  focus: () => void;
  clear: () => void;
  isEmpty: () => boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  testId?: string;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
  testId,
  buttonRef,
}: ToolbarButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
        isActive ? 'bg-gray-200 text-blue-600' : 'text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

export const MessageRichComposer = forwardRef<
  MessageRichComposerRef,
  MessageRichComposerProps
>(function MessageRichComposer(
  {
    content,
    onChange,
    onSubmit,
    placeholder = 'Message...',
    disabled = false,
    maxHeight = 200,
    minHeight = 60,
    channelName,
    onImagePaste,
    embedCallbacks,
    mentionEntities = [],
  },
  ref
) {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkAnchorRect, setLinkAnchorRect] = useState<DOMRect | null>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store mentionEntities in a ref to avoid recreation of getEntities callback
  const mentionEntitiesRef = useRef(mentionEntities);
  mentionEntitiesRef.current = mentionEntities;

  // Memoize getEntities callback
  const getEntities = useCallback(() => mentionEntitiesRef.current, []);

  // Convert content (Markdown or legacy HTML) to HTML for Tiptap editor
  const getInitialContent = useCallback(() => {
    if (!content) return '<p></p>';
    return prepareContentForEditor(content, 'markdown');
  }, [content]);

  // Open link popover - uses a ref so it can be called from handleKeyDown
  // before the editor variable is available in closure scope
  const openLinkPopover = useCallback(() => {
    if (linkButtonRef.current) {
      setLinkAnchorRect(linkButtonRef.current.getBoundingClientRect());
    } else {
      // Fallback: position near the container
      if (containerRef.current) {
        setLinkAnchorRect(containerRef.current.getBoundingClientRect());
      }
    }
    setShowToolbar(true); // Ensure toolbar is visible to show link button state
    setShowLinkPopover(true);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Disable default, use lowlight version
        heading: false, // Messages don't need headings
        dropcursor: false,
        gapcursor: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'message-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: channelName ? `Message ${channelName}...` : placeholder,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      // TB127: Slash commands for quick block insertion
      MessageSlashCommands.configure({
        embedCallbacks,
      }),
      // TB128: Hash autocomplete for element embedding
      HashAutocomplete.configure({
        fetchElements: createElementFetcher(),
      }),
      // @mention autocomplete for entity tagging
      MentionNode,
      MentionAutocomplete.configure({
        getEntities,
      }),
    ],
    content: getInitialContent(),
    editable: !disabled,
    onUpdate: ({ editor }: { editor: any }) => {
      // Convert HTML to Markdown for storage
      const html = editor.getHTML();
      const markdown = prepareContentForStorage(html, 'markdown');
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[40px] px-3 py-2',
        'data-testid': 'message-input',
        style: `max-height: ${maxHeight - 40}px; overflow-y: auto;`,
      },
      handleKeyDown: (_view: any, event: KeyboardEvent) => {
        // Cmd/Ctrl+K to toggle link editing
        if (event.key === 'k' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
          event.preventDefault();
          openLinkPopover();
          return true;
        }
        // Enter to send, Shift+Enter for newline
        if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          // Don't send if content is in a list or code block (allow natural enter behavior)
          const isInList = editor?.isActive('bulletList') || editor?.isActive('orderedList');
          const isInCodeBlock = editor?.isActive('codeBlock');

          // TB127/TB128: Check if suggestion menu is active by looking for tippy popups
          // If a tippy popup exists with slash command, hash autocomplete, or mention menu, don't intercept Enter
          const slashMenuOpen = document.querySelector('[data-testid="message-slash-command-menu"]');
          const hashMenuOpen = document.querySelector('[data-testid="hash-autocomplete-menu"]');
          const mentionMenuOpen = document.querySelector('[data-testid="mention-autocomplete-menu"]');
          if (slashMenuOpen || hashMenuOpen || mentionMenuOpen) {
            // Let the suggestion plugin handle Enter
            return false;
          }

          if (!isInList && !isInCodeBlock) {
            event.preventDefault();
            onSubmit();
            return true;
          }
        }
        return false;
      },
      // Handle paste for image support (TB102)
      handlePaste: (_view: any, event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items || !onImagePaste) return false;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              onImagePaste(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    clear: () => {
      editor?.commands.clearContent();
      editor?.commands.focus();
    },
    isEmpty: () => {
      if (!editor) return true;
      const text = editor.getText().trim();
      return text.length === 0;
    },
  }));

  // Update editor content when prop changes (for clearing)
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentText = editor.getText().trim();
      // Only reset if content was cleared externally
      if (content === '' && currentText !== '') {
        editor.commands.clearContent();
      }
    }
  }, [editor, content]);

  // Sync disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Auto-focus when channel name changes (new channel selected)
  useEffect(() => {
    if (editor && channelName) {
      editor.commands.focus();
    }
  }, [editor, channelName]);

  if (!editor) {
    return (
      <div
        data-testid="message-rich-composer-loading"
        className="px-3 py-2 text-gray-400 text-sm"
      >
        Loading editor...
      </div>
    );
  }

  const toolbarActions = [
    {
      id: 'bold',
      icon: <Bold className="w-4 h-4" />,
      title: `Bold (${modKey}B)`,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
    },
    {
      id: 'italic',
      icon: <Italic className="w-4 h-4" />,
      title: `Italic (${modKey}I)`,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
    },
    {
      id: 'underline',
      icon: <UnderlineIcon className="w-4 h-4" />,
      title: `Underline (${modKey}U)`,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
    },
    {
      id: 'strike',
      icon: <Strikethrough className="w-4 h-4" />,
      title: 'Strikethrough',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
    { id: 'divider1', type: 'divider' },
    {
      id: 'code',
      icon: <Code className="w-4 h-4" />,
      title: `Inline Code (${modKey}E)`,
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
    },
    {
      id: 'codeBlock',
      icon: <FileCode className="w-4 h-4" />,
      title: 'Code Block',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: editor.isActive('codeBlock'),
    },
    { id: 'divider2', type: 'divider' },
    {
      id: 'bulletList',
      icon: <List className="w-4 h-4" />,
      title: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
    },
    {
      id: 'orderedList',
      icon: <ListOrdered className="w-4 h-4" />,
      title: 'Numbered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
    },
    { id: 'divider3', type: 'divider' },
    {
      id: 'blockquote',
      icon: <Quote className="w-4 h-4" />,
      title: 'Block Quote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive('blockquote'),
    },
    { id: 'divider4', type: 'divider' },
    {
      id: 'link',
      icon: <Link2 className="w-4 h-4" />,
      title: `Link (${modKey}K)`,
      action: () => openLinkPopover(),
      isActive: editor.isActive('link'),
      ref: linkButtonRef,
    },
  ];

  return (
    <div
      ref={containerRef}
      data-testid="message-rich-composer"
      className={`border border-gray-300 rounded-lg bg-white transition-all ${
        disabled ? 'opacity-50' : ''
      }`}
      style={{ minHeight: `${minHeight}px` }}
    >
      {/* Editor Content */}
      <div
        className="message-rich-editor"
        style={{
          maxHeight: `${maxHeight - (showToolbar ? 40 : 0)}px`,
          overflow: 'auto',
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Compact Toolbar (toggleable) */}
      <div className="flex items-center justify-between border-t border-gray-100 px-2 py-1 bg-gray-50 rounded-b-lg">
        <div className="flex items-center gap-0.5">
          {showToolbar ? (
            <>
              {toolbarActions.map((action) =>
                action.type === 'divider' ? (
                  <ToolbarDivider key={action.id} />
                ) : (
                  <ToolbarButton
                    key={action.id}
                    onClick={action.action!}
                    isActive={action.isActive}
                    disabled={disabled}
                    title={action.title!}
                    testId={`message-toolbar-${action.id}`}
                    buttonRef={(action as any).ref}
                  >
                    {action.icon}
                  </ToolbarButton>
                )
              )}
            </>
          ) : (
            // Condensed toolbar: just show commonly used formatting
            <>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                disabled={disabled}
                title={`Bold (${modKey}B)`}
                testId="message-toolbar-bold"
              >
                <Bold className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                disabled={disabled}
                title={`Italic (${modKey}I)`}
                testId="message-toolbar-italic"
              >
                <Italic className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCode().run()}
                isActive={editor.isActive('code')}
                disabled={disabled}
                title={`Inline Code (${modKey}E)`}
                testId="message-toolbar-code"
              >
                <Code className="w-4 h-4" />
              </ToolbarButton>
            </>
          )}
        </div>

        {/* Toggle toolbar button */}
        <button
          type="button"
          onClick={() => setShowToolbar(!showToolbar)}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title={showToolbar ? 'Hide formatting options' : 'Show more formatting options'}
          data-testid="message-toolbar-toggle"
        >
          {showToolbar ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Link Popover */}
      {showLinkPopover && (
        <LinkPopover
          editor={editor}
          onClose={() => setShowLinkPopover(false)}
          anchorRect={linkAnchorRect}
        />
      )}
    </div>
  );
});

export default MessageRichComposer;
