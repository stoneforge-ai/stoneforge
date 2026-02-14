/**
 * HashAutocomplete - Tiptap extension for # autocomplete in message composer
 *
 * Features:
 * - Triggered by typing `#` followed by text
 * - Shows recent tasks and documents that match the query
 * - Keyboard navigation (up/down, Enter, Escape)
 * - Inserts element reference as ![[type:id]] syntax
 *
 * TB128 Implementation
 */

import { Extension } from '@tiptap/core';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance, Props as TippyProps } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import {
  CheckSquare,
  FileText,
  Loader2,
  Search,
} from 'lucide-react';

// Element item type for autocomplete
export interface HashAutocompleteItem {
  id: string;
  type: 'task' | 'document';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
}

// Fetch callback type
export interface HashAutocompleteFetchCallbacks {
  fetchElements: (query: string) => Promise<HashAutocompleteItem[]>;
}

// Menu component ref interface
export interface HashAutocompleteMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Menu component props
interface HashAutocompleteMenuProps {
  items: HashAutocompleteItem[];
  command: (item: HashAutocompleteItem) => void;
  isLoading?: boolean;
  query?: string;
}

// The menu component that renders the autocomplete list
export const HashAutocompleteMenu = forwardRef<HashAutocompleteMenuRef, HashAutocompleteMenuProps>(
  ({ items, command, isLoading = false, query = '' }, ref) => {
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
          if (items.length > 0) {
            selectItem(selectedIndex);
          }
          return true;
        }

        if (event.key === 'Escape') {
          return true;
        }

        return false;
      },
    }));

    // Loading state
    if (isLoading) {
      return (
        <div
          data-testid="hash-autocomplete-menu"
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[280px]"
        >
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Searching...</span>
          </div>
        </div>
      );
    }

    // Empty state
    if (!items.length) {
      return (
        <div
          data-testid="hash-autocomplete-menu"
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[280px]"
        >
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Search className="w-4 h-4" />
            <span>{query ? `No results for "${query}"` : 'Type to search tasks and documents'}</span>
          </div>
        </div>
      );
    }

    // Group items by type
    const tasks = items.filter((item) => item.type === 'task');
    const documents = items.filter((item) => item.type === 'document');
    let flatIndex = 0;

    return (
      <div
        data-testid="hash-autocomplete-menu"
        className="bg-white rounded-lg shadow-lg border border-gray-200 p-1 min-w-[280px] max-h-[300px] overflow-y-auto"
      >
        {tasks.length > 0 && (
          <div data-testid="hash-autocomplete-tasks">
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Tasks
            </div>
            {tasks.map((item) => {
              const currentIndex = flatIndex++;
              const isSelected = currentIndex === selectedIndex;

              return (
                <button
                  key={`task-${item.id}`}
                  data-testid={`hash-item-task-${item.id}`}
                  className={`w-full flex items-start gap-3 px-3 py-2 rounded text-left transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectItem(currentIndex);
                  }}
                  onMouseDown={(e) => {
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
                    <div className="text-sm font-medium truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {documents.length > 0 && (
          <div data-testid="hash-autocomplete-documents">
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Documents
            </div>
            {documents.map((item) => {
              const currentIndex = flatIndex++;
              const isSelected = currentIndex === selectedIndex;

              return (
                <button
                  key={`doc-${item.id}`}
                  data-testid={`hash-item-doc-${item.id}`}
                  className={`w-full flex items-start gap-3 px-3 py-2 rounded text-left transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectItem(currentIndex);
                  }}
                  onMouseDown={(e) => {
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
                    <div className="text-sm font-medium truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

HashAutocompleteMenu.displayName = 'HashAutocompleteMenu';

// Default fetch function (to be overridden)
async function defaultFetchElements(_query: string): Promise<HashAutocompleteItem[]> {
  return [];
}

// Create suggestion configuration
function createHashSuggestionConfig(
  fetchCallback: (query: string) => Promise<HashAutocompleteItem[]>
): Partial<SuggestionOptions<HashAutocompleteItem>> {
  let currentItems: HashAutocompleteItem[] = [];
  let isLoading = false;
  let currentQuery = '';
  let fetchAbortController: AbortController | null = null;

  return {
    char: '#',
    startOfLine: false,
    allowSpaces: false,

    items: async ({ query }: { query: string }) => {
      currentQuery = query;

      // Cancel previous fetch if exists
      if (fetchAbortController) {
        fetchAbortController.abort();
      }
      fetchAbortController = new AbortController();

      // Start loading
      isLoading = true;

      try {
        // Debounce by waiting a bit
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Check if aborted
        if (fetchAbortController.signal.aborted) {
          return currentItems;
        }

        const items = await fetchCallback(query);
        currentItems = items;
        isLoading = false;
        return items;
      } catch (error) {
        isLoading = false;
        currentItems = [];
        return [];
      }
    },

    render: () => {
      let component: ReactRenderer<HashAutocompleteMenuRef> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: SuggestionProps<HashAutocompleteItem>) => {
          component = new ReactRenderer(HashAutocompleteMenu, {
            props: {
              items: props.items,
              command: props.command,
              isLoading,
              query: currentQuery,
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
            placement: 'top-start',
            animation: 'fade',
            zIndex: 9999,
          } as Partial<TippyProps>);
        },

        onUpdate: (props: SuggestionProps<HashAutocompleteItem>) => {
          if (component) {
            component.updateProps({
              items: props.items,
              command: props.command,
              isLoading,
              query: currentQuery,
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
          fetchAbortController?.abort();
        },
      };
    },

    command: ({ editor, range, props }: { editor: any; range: any; props: HashAutocompleteItem }) => {
      // Insert the embed reference
      const embedText = `![[${props.type}:${props.id}]]`;

      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(embedText + ' ')
        .run();
    },
  };
}

// Extension options interface
export interface HashAutocompleteOptions {
  fetchElements?: (query: string) => Promise<HashAutocompleteItem[]>;
}

// Unique plugin key for hash autocomplete (distinct from other suggestion plugins)
const hashAutocompletePluginKey = new PluginKey('hashAutocomplete');

// The main hash autocomplete extension
export const HashAutocomplete = Extension.create<HashAutocompleteOptions>({
  name: 'hashAutocomplete',

  addOptions() {
    return {
      fetchElements: defaultFetchElements,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: hashAutocompletePluginKey,
        ...createHashSuggestionConfig(this.options.fetchElements || defaultFetchElements),
      }),
    ];
  },
});

// Helper to create a fetch function using the API
export function createElementFetcher(baseUrl: string = '/api') {
  return async (query: string): Promise<HashAutocompleteItem[]> => {
    const results: HashAutocompleteItem[] = [];

    try {
      // Fetch tasks and documents in parallel
      const [tasksResponse, documentsResponse] = await Promise.all([
        fetch(`${baseUrl}/tasks?search=${encodeURIComponent(query)}&limit=5`),
        fetch(`${baseUrl}/documents?search=${encodeURIComponent(query)}&limit=5`),
      ]);

      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        const tasks = tasksData.items || tasksData;

        for (const task of tasks.slice(0, 5)) {
          results.push({
            id: task.id,
            type: 'task',
            title: task.title,
            subtitle: task.status ? `Status: ${task.status}` : undefined,
            icon: <CheckSquare className="w-4 h-4" />,
          });
        }
      }

      if (documentsResponse.ok) {
        const documentsData = await documentsResponse.json();
        const documents = documentsData.items || documentsData;

        for (const doc of documents.slice(0, 5)) {
          results.push({
            id: doc.id,
            type: 'document',
            title: doc.title,
            subtitle: doc.contentType || 'Document',
            icon: <FileText className="w-4 h-4" />,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching elements for autocomplete:', error);
    }

    return results;
  };
}

export default HashAutocomplete;
