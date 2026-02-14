/**
 * SlashCommands - Tiptap extension for slash command menu
 *
 * Features:
 * - Triggered by typing `/` at start of line or after space
 * - Fuzzy search filtering as user types
 * - Keyboard navigation (up/down, Enter, Escape)
 * - Categories: Headings, Lists, Blocks, Embeds
 * - Embed commands trigger picker modals via callbacks
 */

import { Extension, Range } from '@tiptap/core';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  FileCode,
  Minus,
  CheckSquare,
  FileText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ImageIcon,
  Smile,
} from 'lucide-react';

// Embed picker callbacks
export interface EmbedCallbacks {
  onTaskEmbed?: () => void;
  onDocumentEmbed?: () => void;
  onImageInsert?: () => void;
  onEmojiInsert?: () => void;
}

// Command item type
export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'headings' | 'lists' | 'blocks' | 'alignment' | 'embeds' | 'media';
  action: (props: { editor: any; range: Range }) => void;
}

// Define all available slash commands
const getSlashCommands = (embedCallbacks?: EmbedCallbacks): SlashCommandItem[] => [
  // Headings
  {
    id: 'heading1',
    title: 'Heading 1',
    description: 'Large section heading',
    icon: <Heading1 className="w-4 h-4" />,
    category: 'headings',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
    },
  },
  {
    id: 'heading2',
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: <Heading2 className="w-4 h-4" />,
    category: 'headings',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    id: 'heading3',
    title: 'Heading 3',
    description: 'Small section heading',
    icon: <Heading3 className="w-4 h-4" />,
    category: 'headings',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
    },
  },
  // Lists
  {
    id: 'bullet',
    title: 'Bullet List',
    description: 'Create a simple bullet list',
    icon: <List className="w-4 h-4" />,
    category: 'lists',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'numbered',
    title: 'Numbered List',
    description: 'Create a numbered list',
    icon: <ListOrdered className="w-4 h-4" />,
    category: 'lists',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  // Blocks
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
    id: 'code',
    title: 'Code Block',
    description: 'Insert a code block',
    icon: <FileCode className="w-4 h-4" />,
    category: 'blocks',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Insert a horizontal line',
    icon: <Minus className="w-4 h-4" />,
    category: 'blocks',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  // Alignment
  {
    id: 'left',
    title: 'Align Left',
    description: 'Align text to the left',
    icon: <AlignLeft className="w-4 h-4" />,
    category: 'alignment',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign('left').run();
    },
  },
  {
    id: 'center',
    title: 'Align Center',
    description: 'Center align text',
    icon: <AlignCenter className="w-4 h-4" />,
    category: 'alignment',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign('center').run();
    },
  },
  {
    id: 'right',
    title: 'Align Right',
    description: 'Align text to the right',
    icon: <AlignRight className="w-4 h-4" />,
    category: 'alignment',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign('right').run();
    },
  },
  {
    id: 'justify',
    title: 'Justify',
    description: 'Justify text (full width)',
    icon: <AlignJustify className="w-4 h-4" />,
    category: 'alignment',
    action: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign('justify').run();
    },
  },
  // Media - images and other media content
  {
    id: 'image',
    title: 'Image',
    description: 'Upload or paste an image',
    icon: <ImageIcon className="w-4 h-4" />,
    category: 'media',
    action: ({ editor, range }) => {
      // Delete the slash command first
      editor.chain().focus().deleteRange(range).run();
      // Then trigger the image picker/uploader
      if (embedCallbacks?.onImageInsert) {
        embedCallbacks.onImageInsert();
      }
    },
  },
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
  // Embeds - trigger picker modals via callbacks
  {
    id: 'task',
    title: 'Task',
    description: 'Embed a task reference',
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
    description: 'Embed a document reference',
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
function fuzzySearch(query: string, items: SlashCommandItem[]): SlashCommandItem[] {
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
export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Menu component props
interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

// Group items by category
function groupByCategory(items: SlashCommandItem[]) {
  const groups: Record<string, SlashCommandItem[]> = {
    headings: [],
    lists: [],
    blocks: [],
    alignment: [],
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
  headings: 'Headings',
  lists: 'Lists',
  blocks: 'Blocks',
  alignment: 'Alignment',
  media: 'Media',
  embeds: 'Embeds',
};

// The menu component that renders the slash command list
export const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
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
          data-testid="slash-command-menu"
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
        data-testid="slash-command-menu"
        className="bg-white rounded-lg shadow-lg border border-gray-200 p-1 min-w-[240px] max-h-[300px] overflow-y-auto"
      >
        {Object.entries(groups).map(([category, categoryItems]) => {
          if (categoryItems.length === 0) return null;

          return (
            <div key={category} data-testid={`slash-command-category-${category}`}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {categoryLabels[category]}
              </div>
              {categoryItems.map((item) => {
                const currentIndex = flatIndex++;
                const isSelected = currentIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    data-testid={`slash-command-item-${item.id}`}
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

SlashCommandMenu.displayName = 'SlashCommandMenu';

// Suggestion plugin configuration
function createSuggestionConfig(embedCallbacks?: EmbedCallbacks): Partial<SuggestionOptions<SlashCommandItem>> {
  return {
    char: '/',
    startOfLine: false, // Allow / anywhere but we'll filter in shouldShow

    items: ({ query }) => {
      const allCommands = getSlashCommands(embedCallbacks);
      return fuzzySearch(query, allCommands);
    },

    render: () => {
      let component: ReactRenderer<SlashCommandMenuRef> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: SuggestionProps<SlashCommandItem>) => {
          component = new ReactRenderer(SlashCommandMenu, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            animation: 'fade',
            zIndex: 9999,
          } as Partial<TippyProps>);
        },

        onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
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

    command: ({ editor, range, props }) => {
      props.action({ editor, range });
    },
  };
}

// Extension options interface
export interface SlashCommandsOptions {
  embedCallbacks?: EmbedCallbacks;
}

// The main slash commands extension
export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      embedCallbacks: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...createSuggestionConfig(this.options.embedCallbacks),
      }),
    ];
  },
});

export default SlashCommands;
