/**
 * MessageSlashCommands - Tiptap extension for slash command menu in message composer
 *
 * Features:
 * - Triggered by typing `/` at start of line or after space
 * - Fuzzy search filtering as user types
 * - Keyboard navigation (up/down, Enter, Escape)
 * - Commands appropriate for messages: formatting, embeds, media
 *
 * TB127 Implementation
 */

import { Extension, Range } from '@tiptap/core';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Code,
  FileCode,
  List,
  ListOrdered,
  Quote,
  CheckSquare,
  FileText,
  Smile,
} from 'lucide-react';

// Embed picker callbacks
export interface MessageEmbedCallbacks {
  onTaskEmbed?: () => void;
  onDocumentEmbed?: () => void;
  onEmojiInsert?: () => void;
}

// Command item type
export interface MessageSlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'formatting' | 'blocks' | 'embeds' | 'media';
  action: (props: { editor: any; range: Range }) => void;
}

// Define all available slash commands for messages
const getMessageSlashCommands = (embedCallbacks?: MessageEmbedCallbacks): MessageSlashCommandItem[] => [
  // Formatting
  {
    id: 'bold',
    title: 'Bold',
    description: 'Make text bold',
    icon: <Bold className="w-4 h-4" />,
    category: 'formatting',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBold().run();
    },
  },
  {
    id: 'italic',
    title: 'Italic',
    description: 'Make text italic',
    icon: <Italic className="w-4 h-4" />,
    category: 'formatting',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleItalic().run();
    },
  },
  {
    id: 'code',
    title: 'Inline Code',
    description: 'Format as inline code',
    icon: <Code className="w-4 h-4" />,
    category: 'formatting',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCode().run();
    },
  },
  // Blocks
  {
    id: 'codeblock',
    title: 'Code Block',
    description: 'Insert a code block',
    icon: <FileCode className="w-4 h-4" />,
    category: 'blocks',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Insert a block quote',
    icon: <Quote className="w-4 h-4" />,
    category: 'blocks',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: 'bullet',
    title: 'Bullet List',
    description: 'Create a simple bullet list',
    icon: <List className="w-4 h-4" />,
    category: 'blocks',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'numbered',
    title: 'Numbered List',
    description: 'Create a numbered list',
    icon: <ListOrdered className="w-4 h-4" />,
    category: 'blocks',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  // Media
  {
    id: 'emoji',
    title: 'Emoji',
    description: 'Insert an emoji',
    icon: <Smile className="w-4 h-4" />,
    category: 'media',
    action: ({ editor, range }) => {
      // Delete the slash command first
      editor.chain().focus().deleteRange(range).run();
      // Then trigger the emoji picker modal
      if (embedCallbacks?.onEmojiInsert) {
        embedCallbacks.onEmojiInsert();
      }
    },
  },
  // Embeds
  {
    id: 'task',
    title: 'Task',
    description: 'Reference a task',
    icon: <CheckSquare className="w-4 h-4" />,
    category: 'embeds',
    action: ({ editor, range }) => {
      // Delete the slash command first
      editor.chain().focus().deleteRange(range).run();
      // Then trigger the task picker modal
      if (embedCallbacks?.onTaskEmbed) {
        embedCallbacks.onTaskEmbed();
      }
    },
  },
  {
    id: 'doc',
    title: 'Document',
    description: 'Reference a document',
    icon: <FileText className="w-4 h-4" />,
    category: 'embeds',
    action: ({ editor, range }) => {
      // Delete the slash command first
      editor.chain().focus().deleteRange(range).run();
      // Then trigger the document picker modal
      if (embedCallbacks?.onDocumentEmbed) {
        embedCallbacks.onDocumentEmbed();
      }
    },
  },
];

// Fuzzy search for commands
function fuzzySearch(query: string, items: MessageSlashCommandItem[]): MessageSlashCommandItem[] {
  if (!query) return items;

  const lowerQuery = query.toLowerCase();

  return items.filter((item) => {
    const titleMatch = item.title.toLowerCase().includes(lowerQuery);
    const descMatch = item.description.toLowerCase().includes(lowerQuery);
    const idMatch = item.id.toLowerCase().includes(lowerQuery);
    return titleMatch || descMatch || idMatch;
  });
}

// Menu component ref interface
export interface MessageSlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Menu component props
interface MessageSlashCommandMenuProps {
  items: MessageSlashCommandItem[];
  command: (item: MessageSlashCommandItem) => void;
}

// Group items by category
function groupByCategory(items: MessageSlashCommandItem[]) {
  const groups: Record<string, MessageSlashCommandItem[]> = {
    formatting: [],
    blocks: [],
    media: [],
    embeds: [],
  };

  for (const item of items) {
    if (groups[item.category]) {
      groups[item.category].push(item);
    }
  }

  return groups;
}

// Category labels
const categoryLabels: Record<string, string> = {
  formatting: 'Formatting',
  blocks: 'Blocks',
  media: 'Media',
  embeds: 'Embeds',
};

// The menu component that renders the slash command list
export const MessageSlashCommandMenu = forwardRef<MessageSlashCommandMenuRef, MessageSlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [items, command]
    );

    // Expose keyboard handler to Tiptap
    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
          return true;
        }

        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
          return true;
        }

        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === 'Escape') {
          // This will close the menu
          return true;
        }

        return false;
      },
    }));

    if (!items.length) {
      return (
        <div
          data-testid="message-slash-command-menu"
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[240px]"
        >
          <div className="text-sm text-gray-500">No matching commands</div>
        </div>
      );
    }

    const groups = groupByCategory(items);
    let flatIndex = 0;

    return (
      <div
        data-testid="message-slash-command-menu"
        className="bg-white rounded-lg shadow-lg border border-gray-200 p-1 min-w-[240px] max-h-[300px] overflow-y-auto"
      >
        {Object.entries(groups).map(([category, categoryItems]) => {
          if (categoryItems.length === 0) return null;

          return (
            <div key={category} data-testid={`message-slash-category-${category}`}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {categoryLabels[category]}
              </div>
              {categoryItems.map((item) => {
                const currentIndex = flatIndex++;
                const isSelected = currentIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    data-testid={`message-slash-item-${item.id}`}
                    className={`w-full flex items-start gap-3 px-3 py-2 rounded text-left transition-colors ${
                      isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectItem(currentIndex);
                    }}
                    onMouseDown={(e) => {
                      // Prevent blur on the editor to keep command execution working
                      e.preventDefault();
                    }}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <div
                      className={`mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-xs text-gray-500 truncate">{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }
);

MessageSlashCommandMenu.displayName = 'MessageSlashCommandMenu';

// Suggestion plugin configuration
function createSuggestionConfig(embedCallbacks?: MessageEmbedCallbacks): Partial<SuggestionOptions<MessageSlashCommandItem>> {
  return {
    char: '/',
    startOfLine: false, // Allow / anywhere but we'll filter in shouldShow

    items: ({ query }: { query: string }) => {
      const allCommands = getMessageSlashCommands(embedCallbacks);
      return fuzzySearch(query, allCommands);
    },

    render: () => {
      let component: ReactRenderer<MessageSlashCommandMenuRef> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: SuggestionProps<MessageSlashCommandItem>) => {
          component = new ReactRenderer(MessageSlashCommandMenu, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          // Position above the composer (like Slack)
          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'top-start', // Position above composer
            animation: 'fade',
            zIndex: 9999,
          } as Partial<TippyProps>);
        },

        onUpdate: (props: SuggestionProps<MessageSlashCommandItem>) => {
          if (component) {
            component.updateProps({
              items: props.items,
              command: props.command,
            });
          }

          if (popup && props.clientRect) {
            popup.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            popup?.hide();
            return true;
          }

          if (component?.ref) {
            return component.ref.onKeyDown(props);
          }

          return false;
        },

        onExit: () => {
          popup?.destroy();
          component?.destroy();
        },
      };
    },

    command: ({ editor, range, props }: { editor: any; range: any; props: MessageSlashCommandItem }) => {
      props.action({ editor, range });
    },
  };
}

// Extension options interface
export interface MessageSlashCommandsOptions {
  embedCallbacks?: MessageEmbedCallbacks;
}

// Unique plugin key for message slash commands (distinct from other suggestion plugins)
const messageSlashCommandsPluginKey = new PluginKey('messageSlashCommands');

// The main slash commands extension for messages
export const MessageSlashCommands = Extension.create<MessageSlashCommandsOptions>({
  name: 'messageSlashCommands',

  addOptions() {
    return {
      embedCallbacks: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: messageSlashCommandsPluginKey,
        ...createSuggestionConfig(this.options.embedCallbacks),
      }),
    ];
  },
});

export default MessageSlashCommands;
