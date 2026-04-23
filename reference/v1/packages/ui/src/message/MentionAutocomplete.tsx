/**
 * MentionAutocomplete - Tiptap extension for @mention autocomplete
 *
 * Features:
 * - Triggered by typing `@` followed by characters
 * - Fuzzy search filtering for entity names
 * - Keyboard navigation (up/down, Enter, Escape)
 * - Renders @mentions as styled chips that link to entity pages
 *
 * Architecture:
 * - Uses Tiptap Suggestion API (same pattern as EmojiAutocomplete)
 * - Entities are fetched from the pre-loaded cache (useAllEntities)
 * - Mentions are stored as @name in Markdown (e.g., @alice)
 * - Backend parses @mentions and creates dependency relationships
 */

import { Extension } from '@tiptap/core';
import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import { User, Bot, Settings } from 'lucide-react';

// Entity type for mention suggestions
export interface MentionEntity {
  id: string;
  name: string;
  entityType: string; // 'agent', 'human', 'system'
}

// ============================================================================
// Mention Node - Renders @mention as a styled chip
// ============================================================================

export const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mention-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { 'data-mention-id': attributes.id };
        },
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mention-name'),
        renderHTML: (attributes) => {
          if (!attributes.name) return {};
          return { 'data-mention-name': attributes.name };
        },
      },
      entityType: {
        default: 'human',
        parseHTML: (element) => element.getAttribute('data-entity-type'),
        renderHTML: (attributes) => {
          if (!attributes.entityType) return {};
          return { 'data-entity-type': attributes.entityType };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention-id]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: Record<string, any> }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'mention-chip',
        href: `/entities?selected=${node.attrs.id}`,
      }),
      `@${node.attrs.name}`,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }: { tr: any; state: any }) => {
          let isMention = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) return false;

          state.doc.nodesBetween(anchor - 1, anchor, (node: any, pos: number) => {
            if (node.type.name === this.name) {
              isMention = true;
              tr.insertText('', pos, pos + node.nodeSize);
              return false;
            }
          });

          return isMention;
        }),
    };
  },
});

// ============================================================================
// Fuzzy Search
// ============================================================================

function fuzzySearchEntities(query: string, entities: MentionEntity[]): MentionEntity[] {
  if (!query) {
    // Return first 10 entities when no query
    return entities.slice(0, 10);
  }

  const lowerQuery = query.toLowerCase();
  const results: MentionEntity[] = [];
  const seen = new Set<string>();

  // Exact name matches first
  for (const entity of entities) {
    if (entity.name.toLowerCase() === lowerQuery && !seen.has(entity.id)) {
      seen.add(entity.id);
      results.push(entity);
    }
  }

  // Then prefix matches
  for (const entity of entities) {
    if (
      entity.name.toLowerCase().startsWith(lowerQuery) &&
      !seen.has(entity.id)
    ) {
      seen.add(entity.id);
      results.push(entity);
    }
  }

  // Then partial matches
  for (const entity of entities) {
    if (
      entity.name.toLowerCase().includes(lowerQuery) &&
      !seen.has(entity.id)
    ) {
      seen.add(entity.id);
      results.push(entity);
    }
  }

  return results.slice(0, 10);
}

// ============================================================================
// Menu Component
// ============================================================================

export interface MentionMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionMenuProps {
  items: MentionEntity[];
  command: (item: MentionEntity) => void;
}

function getEntityIcon(entityType: string) {
  switch (entityType) {
    case 'agent':
      return <Bot className="w-4 h-4" />;
    case 'system':
      return <Settings className="w-4 h-4" />;
    case 'human':
    default:
      return <User className="w-4 h-4" />;
  }
}

function getEntityTypeLabel(entityType: string) {
  switch (entityType) {
    case 'agent':
      return 'Agent';
    case 'system':
      return 'System';
    case 'human':
    default:
      return 'Human';
  }
}

export const MentionMenu = forwardRef<MentionMenuRef, MentionMenuProps>(
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
          return true;
        }

        return false;
      },
    }));

    if (!items.length) {
      return (
        <div
          data-testid="mention-autocomplete-menu"
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]"
        >
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No matching entities
          </div>
        </div>
      );
    }

    return (
      <div
        data-testid="mention-autocomplete-menu"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1 min-w-[220px] max-h-[280px] overflow-y-auto"
      >
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;

          return (
            <button
              key={item.id}
              data-testid={`mention-item-${item.name}`}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectItem(index);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  item.entityType === 'agent'
                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400'
                    : item.entityType === 'system'
                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                }`}
              >
                {getEntityIcon(item.entityType)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">@{item.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {getEntityTypeLabel(item.entityType)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }
);

MentionMenu.displayName = 'MentionMenu';

// ============================================================================
// Extension Configuration
// ============================================================================

export interface MentionAutocompleteOptions {
  /**
   * Function to get all available entities for mentions.
   * Should return entities from the pre-loaded cache.
   */
  getEntities: () => MentionEntity[];
}

function createMentionSuggestionConfig(
  options: MentionAutocompleteOptions
): Partial<SuggestionOptions<MentionEntity>> {
  return {
    char: '@',
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }: { query: string }) => {
      const entities = options.getEntities();
      return fuzzySearchEntities(query, entities);
    },

    render: () => {
      let component: ReactRenderer<MentionMenuRef> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: SuggestionProps<MentionEntity>) => {
          component = new ReactRenderer(MentionMenu, {
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

        onUpdate: (props: SuggestionProps<MentionEntity>) => {
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

    command: ({ editor, range, props }: { editor: any; range: any; props: MentionEntity }) => {
      // Delete the @query and insert the mention node
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: 'mention',
            attrs: {
              id: props.id,
              name: props.name,
              entityType: props.entityType,
            },
          },
          {
            type: 'text',
            text: ' ',
          },
        ])
        .run();
    },
  };
}

// Unique plugin key for mention suggestion
const mentionSuggestionPluginKey = new PluginKey('mentionSuggestion');

// ============================================================================
// Main Extension
// ============================================================================

export const MentionAutocomplete = Extension.create<MentionAutocompleteOptions>({
  name: 'mentionAutocomplete',

  addOptions() {
    return {
      getEntities: () => [],
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: mentionSuggestionPluginKey,
        ...createMentionSuggestionConfig(this.options),
      }),
    ];
  },
});

export default MentionAutocomplete;
