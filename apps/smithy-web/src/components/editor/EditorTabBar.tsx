/**
 * EditorTabBar - Multi-tab bar for the file editor
 *
 * Features:
 * - Multiple files open as tabs
 * - Preview tab behavior (unedited tabs get replaced)
 * - Unsaved indicator (dot) for dirty tabs
 * - Close button with save confirmation dialog
 * - Drag-and-drop tab reordering
 * - Right-click context menu (Close, Close Others, Close to the Right, Close Saved, Close All)
 *
 * Follows VSCode conventions for tab management.
 */

import { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { X, FileCode, FileText, FileJson, Settings, File, Puzzle } from 'lucide-react';
import type { FileSource } from './EditorFileTree';

// ============================================================================
// Types
// ============================================================================

/** Represents an open tab in the editor */
export interface EditorTab {
  /** Unique identifier for the tab */
  id: string;
  /** Display name (filename) */
  name: string;
  /** Full path to the file */
  path: string;
  /** File content */
  content: string;
  /** Monaco language identifier */
  language: string;
  /** Source of the file (workspace, documents, or extension) */
  source: FileSource | 'extension';
  /** Whether this is a preview tab (will be replaced when opening another file) */
  isPreview: boolean;
  /** Whether the file was ever edited - controls tab replacement logic only */
  isDirty: boolean;
  /** Whether the current content differs from the last saved state - controls UI indicators */
  hasUnsavedChanges: boolean;
  /** Monaco alternative version ID at the time of last save/load */
  savedVersionId: number;
  /** Content at last load/save, used for content comparison to detect manual reverts */
  savedContent: string;
  /** Extension ID in "namespace.name" format (only when source === 'extension') */
  extensionId?: string;
}

export interface EditorTabBarProps {
  /** Array of open tabs */
  tabs: EditorTab[];
  /** ID of the currently active tab */
  activeTabId: string | null;
  /** Called when a tab is selected */
  onTabSelect: (tabId: string) => void;
  /** Called when a tab is closed */
  onTabClose: (tabId: string) => void;
  /** Called when tabs are reordered */
  onTabsReorder: (tabs: EditorTab[]) => void;
  /** Called when user wants to save a file before closing */
  onSaveRequest?: (tabId: string) => Promise<void>;
}

/** Props for the save confirmation dialog */
interface SaveConfirmDialogProps {
  isOpen: boolean;
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the appropriate icon for a file based on its name/extension
 */
function getFileIcon(name: string): React.ComponentType<{ className?: string }> {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const lowerName = name.toLowerCase();

  // JSON files
  if (['json', 'jsonc', 'json5'].includes(ext)) {
    return FileJson;
  }

  // Config files
  if (
    lowerName.endsWith('.config.js') ||
    lowerName.endsWith('.config.ts') ||
    lowerName.startsWith('.') ||
    ['yaml', 'yml', 'toml', 'ini'].includes(ext)
  ) {
    return Settings;
  }

  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'rb', 'java', 'c', 'cpp', 'h', 'hpp'].includes(ext)) {
    return FileCode;
  }

  // Text/document files
  if (['md', 'txt', 'rtf', 'doc', 'docx'].includes(ext)) {
    return FileText;
  }

  return File;
}

/**
 * Get icon color based on file type
 */
function getIconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'tsx'].includes(ext)) return 'text-blue-500';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-500';
  if (['json', 'jsonc'].includes(ext)) return 'text-yellow-400';
  if (['py'].includes(ext)) return 'text-blue-400';
  if (['md', 'mdx'].includes(ext)) return 'text-purple-400';
  if (['css', 'scss', 'sass'].includes(ext)) return 'text-pink-500';
  if (['html', 'htm'].includes(ext)) return 'text-orange-400';

  return 'text-[var(--color-text-muted)]';
}

// ============================================================================
// Save Confirmation Dialog
// ============================================================================

function SaveConfirmDialog({ isOpen, fileName, onSave, onDiscard, onCancel }: SaveConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="save-confirm-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
          Unsaved Changes
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Do you want to save the changes you made to{' '}
          <span className="font-medium text-[var(--color-text)]">"{fileName}"</span>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm font-medium text-[var(--color-danger)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)]"
            data-testid="save-confirm-discard"
          >
            Close Without Saving
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)]"
            data-testid="save-confirm-cancel"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)]"
            data-testid="save-confirm-save"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Single Tab Component
// ============================================================================

interface TabItemProps {
  tab: EditorTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  isDragging?: boolean;
}

function TabItem({ tab, isActive, onSelect, onClose, isDragging = false }: TabItemProps) {
  // Use Puzzle icon for extension tabs, otherwise use file icon
  const Icon = tab.source === 'extension' ? Puzzle : getFileIcon(tab.name);
  const iconColor = tab.source === 'extension' ? 'text-purple-500' : getIconColor(tab.name);

  return (
    <div
      onClick={onSelect}
      className={`
        group flex items-center gap-1.5 px-3 py-1.5 min-w-0 max-w-48 cursor-pointer
        border-r border-r-[var(--color-border)] transition-colors
        ${isActive
          ? 'bg-[var(--color-surface)] border-t-2 border-t-[var(--color-primary)]'
          : 'bg-[var(--color-surface-hover)] border-t-2 border-t-[var(--color-border)] hover:bg-[var(--color-surface)]'
        }
        ${isDragging ? 'opacity-50' : ''}
      `}
      data-testid={`editor-tab-${tab.id}`}
    >
      {/* Dirty indicator */}
      {tab.hasUnsavedChanges ? (
        <span
          className="w-2 h-2 rounded-full bg-[var(--color-text-secondary)] flex-shrink-0"
          data-testid={`editor-tab-dirty-${tab.id}`}
          title="Unsaved changes"
        />
      ) : (
        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? iconColor : 'text-[var(--color-text-muted)]'}`} />
      )}

      {/* File name */}
      <span
        className={`truncate text-sm ${
          isActive ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
        }`}
        title={tab.path}
      >
        {tab.name}
      </span>

      {/* Close button */}
      <button
        onClick={onClose}
        className={`
          ml-1 p-0.5 rounded flex-shrink-0 transition-colors
          ${(tab.hasUnsavedChanges || isActive)
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
          }
          hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]
        `}
        title="Close (Ctrl+W)"
        data-testid={`editor-tab-close-${tab.id}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// Tab Context Menu Component
// ============================================================================

interface TabContextMenuProps {
  tab: EditorTab;
  children: React.ReactNode;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseToRight: () => void;
  onCloseSaved: () => void;
  onCloseAll: () => void;
}

function TabContextMenu({
  children,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseSaved,
  onCloseAll,
}: TabContextMenuProps) {
  const menuItemClassName =
    'flex items-center px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none';

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[180px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 z-50"
          data-testid="tab-context-menu"
        >
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={onClose}
            data-testid="tab-context-menu-close"
          >
            Close
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={onCloseOthers}
            data-testid="tab-context-menu-close-others"
          >
            Close Others
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={onCloseToRight}
            data-testid="tab-context-menu-close-to-right"
          >
            Close to the Right
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-[var(--color-border)] my-1" />
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={onCloseSaved}
            data-testid="tab-context-menu-close-saved"
          >
            Close Saved
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={onCloseAll}
            data-testid="tab-context-menu-close-all"
          >
            Close All
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// ============================================================================
// Sortable Tab Wrapper
// ============================================================================

interface SortableTabProps extends TabItemProps {
  onContextClose: () => void;
  onContextCloseOthers: () => void;
  onContextCloseToRight: () => void;
  onContextCloseSaved: () => void;
  onContextCloseAll: () => void;
}

function SortableTab({
  onContextClose,
  onContextCloseOthers,
  onContextCloseToRight,
  onContextCloseSaved,
  onContextCloseAll,
  ...props
}: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TabContextMenu
      tab={props.tab}
      onClose={onContextClose}
      onCloseOthers={onContextCloseOthers}
      onCloseToRight={onContextCloseToRight}
      onCloseSaved={onContextCloseSaved}
      onCloseAll={onContextCloseAll}
    >
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <TabItem {...props} isDragging={isDragging} />
      </div>
    </TabContextMenu>
  );
}

// ============================================================================
// Main TabBar Component
// ============================================================================

export function EditorTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabsReorder,
  onSaveRequest,
}: EditorTabBarProps) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    tabId: string;
    fileName: string;
  }>({ isOpen: false, tabId: '', fileName: '' });
  // Queue for sequential save prompts during bulk close operations
  const pendingCloseQueueRef = useRef<string[]>([]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const draggedTab = draggedTabId ? tabs.find(t => t.id === draggedTabId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedTabId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedTabId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = tabs.findIndex(t => t.id === active.id);
    const newIndex = tabs.findIndex(t => t.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newTabs = [...tabs];
    const [movedTab] = newTabs.splice(oldIndex, 1);
    newTabs.splice(newIndex, 0, movedTab);

    onTabsReorder(newTabs);
  };

  const handleTabClose = useCallback((e: React.MouseEvent, tab: EditorTab) => {
    e.stopPropagation();

    if (tab.hasUnsavedChanges) {
      setConfirmDialog({
        isOpen: true,
        tabId: tab.id,
        fileName: tab.name,
      });
    } else {
      onTabClose(tab.id);
    }
  }, [onTabClose]);

  // Process the next unsaved tab in the bulk close queue
  const processNextInQueue = useCallback(() => {
    if (pendingCloseQueueRef.current.length === 0) return;

    const nextTabId = pendingCloseQueueRef.current[0];
    const nextTab = tabs.find(t => t.id === nextTabId);
    if (nextTab) {
      setConfirmDialog({
        isOpen: true,
        tabId: nextTab.id,
        fileName: nextTab.name,
      });
    } else {
      // Tab no longer exists, skip it
      pendingCloseQueueRef.current.shift();
      processNextInQueue();
    }
  }, [tabs]);

  const handleSaveAndClose = useCallback(async () => {
    const { tabId } = confirmDialog;
    if (onSaveRequest) {
      try {
        await onSaveRequest(tabId);
      } catch (error) {
        console.error('Failed to save file:', error);
      }
    }
    onTabClose(tabId);
    setConfirmDialog({ isOpen: false, tabId: '', fileName: '' });

    // Process next queued unsaved tab
    pendingCloseQueueRef.current.shift();
    // Use setTimeout to let React reconcile the state update before showing next dialog
    setTimeout(() => processNextInQueue(), 0);
  }, [confirmDialog, onSaveRequest, onTabClose, processNextInQueue]);

  const handleDiscardAndClose = useCallback(() => {
    onTabClose(confirmDialog.tabId);
    setConfirmDialog({ isOpen: false, tabId: '', fileName: '' });

    // Process next queued unsaved tab
    pendingCloseQueueRef.current.shift();
    setTimeout(() => processNextInQueue(), 0);
  }, [confirmDialog.tabId, onTabClose, processNextInQueue]);

  const handleCancelClose = useCallback(() => {
    setConfirmDialog({ isOpen: false, tabId: '', fileName: '' });
    // Cancel clears the entire queue — user chose to abort the bulk close
    pendingCloseQueueRef.current = [];
  }, []);

  /**
   * Close multiple tabs: closes saved tabs immediately, queues unsaved tabs
   * for sequential save prompts via the confirmation dialog.
   */
  const closeTabs = useCallback((tabIds: string[]) => {
    const targetTabs = tabIds.map(id => tabs.find(t => t.id === id)).filter(Boolean) as EditorTab[];
    const saved = targetTabs.filter(t => !t.hasUnsavedChanges);
    const unsaved = targetTabs.filter(t => t.hasUnsavedChanges);

    // Close all saved tabs immediately
    saved.forEach(t => onTabClose(t.id));

    // Queue unsaved tabs for sequential save prompts
    if (unsaved.length > 0) {
      pendingCloseQueueRef.current = unsaved.map(t => t.id);
      processNextInQueue();
    }
  }, [tabs, onTabClose, processNextInQueue]);

  // Context menu action: Close a single tab (with save prompt if unsaved)
  const handleContextClose = useCallback((tabId: string) => {
    closeTabs([tabId]);
  }, [closeTabs]);

  // Context menu action: Close all tabs except the specified one
  const handleContextCloseOthers = useCallback((tabId: string) => {
    const tabIds = tabs.filter(t => t.id !== tabId).map(t => t.id);
    closeTabs(tabIds);
  }, [tabs, closeTabs]);

  // Context menu action: Close all tabs to the right of the specified one
  const handleContextCloseToRight = useCallback((tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    const tabIds = tabs.slice(tabIndex + 1).map(t => t.id);
    if (tabIds.length === 0) return;
    closeTabs(tabIds);
  }, [tabs, closeTabs]);

  // Context menu action: Close all tabs that have no unsaved changes
  const handleContextCloseSaved = useCallback(() => {
    const savedTabIds = tabs.filter(t => !t.hasUnsavedChanges).map(t => t.id);
    if (savedTabIds.length === 0) return;
    // No save prompts needed — all these tabs are saved
    savedTabIds.forEach(id => onTabClose(id));
  }, [tabs, onTabClose]);

  // Context menu action: Close all tabs
  const handleContextCloseAll = useCallback(() => {
    const tabIds = tabs.map(t => t.id);
    closeTabs(tabIds);
  }, [tabs, closeTabs]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="flex items-stretch bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] overflow-x-auto"
        data-testid="editor-tab-bar"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabs.map(t => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSelect={() => onTabSelect(tab.id)}
                onClose={(e) => handleTabClose(e, tab)}
                onContextClose={() => handleContextClose(tab.id)}
                onContextCloseOthers={() => handleContextCloseOthers(tab.id)}
                onContextCloseToRight={() => handleContextCloseToRight(tab.id)}
                onContextCloseSaved={handleContextCloseSaved}
                onContextCloseAll={handleContextCloseAll}
              />
            ))}
          </SortableContext>

          <DragOverlay>
            {draggedTab && (
              <TabItem
                tab={draggedTab}
                isActive={draggedTab.id === activeTabId}
                onSelect={() => {}}
                onClose={() => {}}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <SaveConfirmDialog
        isOpen={confirmDialog.isOpen}
        fileName={confirmDialog.fileName}
        onSave={handleSaveAndClose}
        onDiscard={handleDiscardAndClose}
        onCancel={handleCancelClose}
      />
    </>
  );
}

export default EditorTabBar;
