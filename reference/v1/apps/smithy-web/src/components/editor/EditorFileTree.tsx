/**
 * EditorFileTree - File tree component using react-arborist
 *
 * A performant tree view for displaying files and directories
 * using react-arborist for virtualization and improved UX.
 * Includes right-click context menu with file operations.
 */

import {
  useRef,
  useMemo,
  useCallback,
  useState,
  useEffect,
  createContext,
  useContext,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Tree, NodeRendererProps, NodeApi } from 'react-arborist';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  FileCode,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  Settings,
  FileJson,
  FileType,
  Image,
  FileAudio,
  FileVideo,
  File,
  Database,
  Lock,
  Package,
} from 'lucide-react';
import type { FileEntry } from '../../contexts';
import type { Document } from '../../api/hooks/useAllElements';
import {
  isCodeFile,
  isConfigFile,
  isDataFile,
} from '../../lib/language-detection';

// ============================================================================
// Constants
// ============================================================================

const FILE_ROW_HEIGHT = 32;

/** Delay in ms before a collapsed folder auto-expands during drag-over */
const DRAG_OVER_EXPAND_DELAY = 500;

// ============================================================================
// Types
// ============================================================================

/** Source of file tree data */
export type FileSource = 'workspace' | 'documents';

/**
 * Unified tree node interface for react-arborist
 */
export interface FileTreeNodeData {
  id: string;
  name: string;
  nodeType: 'file' | 'folder';
  path: string;
  children?: FileTreeNodeData[];
  /** For documents mode */
  document?: Document;
}

/** Clipboard state for copy/cut operations */
interface ClipboardState {
  node: FileTreeNodeData;
  operation: 'copy' | 'cut';
}

/** Context for passing menu state to FileNode */
interface FileTreeContextMenuState {
  clipboard: ClipboardState | null;
  renamingNodeId: string | null;
  onOpen: (node: FileTreeNodeData) => void;
  onCopy: (node: FileTreeNodeData) => void;
  onCut: (node: FileTreeNodeData) => void;
  onPaste: (targetFolder: FileTreeNodeData) => void;
  onCopyPath: (node: FileTreeNodeData) => void;
  onCopyRelativePath: (node: FileTreeNodeData) => void;
  onRename: (node: FileTreeNodeData) => void;
  onDelete: (node: FileTreeNodeData) => void;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
}

const FileTreeContextMenuContext = createContext<FileTreeContextMenuState | null>(null);

// ============================================================================
// Icon utilities
// ============================================================================

/**
 * Get file extension from name
 */
function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/**
 * Get appropriate icon for file based on name/extension
 */
function getFileIcon(name: string, isFolder: boolean, isExpanded: boolean) {
  if (isFolder) {
    return isExpanded ? FolderOpen : Folder;
  }

  const ext = getExtension(name);
  const lowerName = name.toLowerCase();

  // Lock files
  if (lowerName.endsWith('.lock') || lowerName.endsWith('-lock.json') || lowerName.endsWith('-lock.yaml')) {
    return Lock;
  }

  // Package files
  if (lowerName === 'package.json' || lowerName === 'cargo.toml' || lowerName === 'go.mod') {
    return Package;
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return Image;
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
    return FileAudio;
  }

  // Video
  if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext)) {
    return FileVideo;
  }

  // Database
  if (['db', 'sqlite', 'sqlite3', 'sql'].includes(ext)) {
    return Database;
  }

  // JSON files
  if (['json', 'jsonc', 'json5'].includes(ext)) {
    return FileJson;
  }

  // Code files
  if (isCodeFile(name)) {
    return FileCode;
  }

  // Config files
  if (isConfigFile(name)) {
    return Settings;
  }

  // Data files
  if (isDataFile(name)) {
    return FileType;
  }

  // Text/document files
  if (['md', 'txt', 'rtf', 'doc', 'docx', 'pdf'].includes(ext)) {
    return FileText;
  }

  // Default
  return File;
}

/**
 * Get icon color based on file type
 */
function getIconColor(name: string, isFolder: boolean): string {
  if (isFolder) {
    return 'text-amber-500';
  }

  const ext = getExtension(name);
  const lowerName = name.toLowerCase();

  // Lock files - gray
  if (lowerName.endsWith('.lock') || lowerName.endsWith('-lock.json') || lowerName.endsWith('-lock.yaml')) {
    return 'text-gray-400';
  }

  // Package files - green
  if (lowerName === 'package.json' || lowerName === 'cargo.toml' || lowerName === 'go.mod') {
    return 'text-green-500';
  }

  // TypeScript/JavaScript - blue/yellow
  if (['ts', 'tsx'].includes(ext)) return 'text-blue-500';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-500';

  // Python - blue/green
  if (['py', 'pyw', 'pyi'].includes(ext)) return 'text-blue-400';

  // Rust - orange
  if (['rs'].includes(ext)) return 'text-orange-500';

  // Go - cyan
  if (['go'].includes(ext)) return 'text-cyan-500';

  // Ruby - red
  if (['rb', 'rake'].includes(ext)) return 'text-red-500';

  // HTML/CSS
  if (['html', 'htm'].includes(ext)) return 'text-orange-400';
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'text-pink-500';

  // Shell scripts - green
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return 'text-green-400';

  // JSON - yellow
  if (['json', 'jsonc', 'json5'].includes(ext)) return 'text-yellow-400';

  // Markdown - purple
  if (['md', 'mdx'].includes(ext)) return 'text-purple-400';

  // YAML/TOML - red
  if (['yaml', 'yml', 'toml'].includes(ext)) return 'text-red-400';

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'text-purple-500';

  // Config files - gray
  if (isConfigFile(name)) return 'text-gray-400';

  return 'text-[var(--color-text-muted)]';
}

// ============================================================================
// Context Menu Component
// ============================================================================

interface FileTreeContextMenuProps {
  node: FileTreeNodeData;
  children: React.ReactNode;
}

function FileTreeContextMenu({ node, children }: FileTreeContextMenuProps) {
  const ctx = useContext(FileTreeContextMenuContext);
  if (!ctx) return <>{children}</>;

  const { clipboard, onOpen, onCopy, onCut, onPaste, onCopyPath, onCopyRelativePath, onRename, onDelete } = ctx;
  const isFolder = node.nodeType === 'folder';
  const canPaste = clipboard !== null;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[180px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 z-50"
          data-testid="file-tree-context-menu"
        >
          {/* Open */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onOpen(node)}
            data-testid="context-menu-open"
          >
            <span>Open</span>
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px bg-[var(--color-border)] my-1" />

          {/* Copy */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onCopy(node)}
            data-testid="context-menu-copy"
          >
            <span>Copy</span>
          </ContextMenu.Item>

          {/* Cut */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onCut(node)}
            data-testid="context-menu-cut"
          >
            <span>Cut</span>
          </ContextMenu.Item>

          {/* Paste */}
          <ContextMenu.Item
            className={`flex items-center justify-between px-3 py-1.5 text-sm outline-none ${
              canPaste
                ? 'text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer'
                : 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
            }`}
            disabled={!canPaste}
            onSelect={() => {
              if (!canPaste) return;
              if (isFolder) {
                onPaste(node);
              } else {
                // For files, paste into the parent directory
                const parentPath = node.path.lastIndexOf('/') > 0
                  ? node.path.slice(0, node.path.lastIndexOf('/'))
                  : '';
                onPaste({ ...node, path: parentPath, nodeType: 'folder' });
              }
            }}
            data-testid="context-menu-paste"
          >
            <span>Paste</span>
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px bg-[var(--color-border)] my-1" />

          {/* Copy Path */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onCopyPath(node)}
            data-testid="context-menu-copy-path"
          >
            <span>Copy Path</span>
          </ContextMenu.Item>

          {/* Copy Relative Path */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onCopyRelativePath(node)}
            data-testid="context-menu-copy-relative-path"
          >
            <span>Copy Relative Path</span>
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px bg-[var(--color-border)] my-1" />

          {/* Rename */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text)] data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onRename(node)}
            data-testid="context-menu-rename"
          >
            <span>Rename</span>
            <span className="text-[var(--color-text-muted)] text-xs ml-4">F2</span>
          </ContextMenu.Item>

          {/* Delete */}
          <ContextMenu.Item
            className="flex items-center justify-between px-3 py-1.5 text-sm text-red-400 data-[highlighted]:bg-[var(--color-surface-active)] cursor-pointer outline-none"
            onSelect={() => onDelete(node)}
            data-testid="context-menu-delete"
          >
            <span>Delete</span>
            <span className="text-[var(--color-text-muted)] text-xs ml-4">Del</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// ============================================================================
// Inline Rename Input Component
// ============================================================================

interface InlineRenameInputProps {
  node: FileTreeNodeData;
  onSubmit: (oldPath: string, newName: string) => void;
  onCancel: () => void;
}

function InlineRenameInput({ node, onSubmit, onCancel }: InlineRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(node.name);
  const settledRef = useRef(false);

  useEffect(() => {
    // Delay focus slightly to avoid Radix context menu focus restoration conflict
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        if (node.nodeType === 'file') {
          const lastDot = node.name.lastIndexOf('.');
          if (lastDot > 0) {
            inputRef.current.setSelectionRange(0, lastDot);
          } else {
            inputRef.current.select();
          }
        } else {
          inputRef.current.select();
        }
        settledRef.current = true;
      }
    }, 50);  // 50ms delay lets the Radix menu finish its focus cleanup

    return () => clearTimeout(timer);
  }, [node.name, node.nodeType]);

  const handleSubmit = () => {
    const trimmedValue = value.trim();
    if (trimmedValue && trimmedValue !== node.name) {
      onSubmit(node.path, trimmedValue);
    } else {
      onCancel();
    }
  };

  const handleBlur = () => {
    // Ignore blur events before the input is settled (Radix focus restoration)
    if (!settledRef.current) return;
    handleSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="flex-1 bg-[var(--color-bg)] border border-[var(--color-primary)] rounded px-1 py-0 text-sm text-[var(--color-text)] outline-none"
      data-testid="inline-rename-input"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ============================================================================
// Drag-Over Auto-Expand Hook
// ============================================================================

/**
 * Hook that auto-expands a collapsed folder node when a dragged item
 * hovers over it for DRAG_OVER_EXPAND_DELAY ms.
 *
 * Returns `isPendingExpand` — true while the timer is running so the UI
 * can show a visual cue (e.g. a subtle pulse) before the folder opens.
 */
function useDragOverExpand(node: NodeApi<FileTreeNodeData>): boolean {
  const [isPendingExpand, setIsPendingExpand] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFolder = node.data.nodeType === 'folder';
  const isClosed = !node.isOpen;
  const willReceiveDrop = node.willReceiveDrop;

  useEffect(() => {
    // Only act on collapsed folders that are receiving a drop hover
    if (isFolder && isClosed && willReceiveDrop) {
      setIsPendingExpand(true);
      timerRef.current = setTimeout(() => {
        node.open();
        setIsPendingExpand(false);
      }, DRAG_OVER_EXPAND_DELAY);
    } else {
      // Drag left or folder already open — cancel any pending timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsPendingExpand(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isFolder, isClosed, willReceiveDrop, node]);

  return isPendingExpand;
}

// ============================================================================
// Tree Node Renderer
// ============================================================================

/**
 * Custom node renderer for file tree items
 */
function FileNode({ node, style, dragHandle }: NodeRendererProps<FileTreeNodeData>) {
  const ctx = useContext(FileTreeContextMenuContext);
  const isFolder = node.data.nodeType === 'folder';
  const isExpanded = node.isOpen;
  const isSelected = node.isSelected;
  const isRenaming = ctx?.renamingNodeId === node.data.id;
  const isDropTarget = node.willReceiveDrop;
  const isDragging = node.isDragging;

  // Auto-expand collapsed folders when a dragged item hovers over them
  const isPendingExpand = useDragOverExpand(node);

  const Icon = getFileIcon(node.data.name, isFolder, isExpanded);
  const iconColor = getIconColor(node.data.name, isFolder);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      node.toggle();
    } else {
      node.select();
      node.activate();
    }
  };

  const nodeContent = (
    <div
      ref={dragHandle}
      data-testid={`file-tree-item-${node.id}`}
      style={style}
      className={`pr-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        data-testid={`file-tree-button-${node.id}`}
        onClick={handleClick}
        className={`
          w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm
          transition-colors duration-150 ease-in-out
          ${isDropTarget
            ? isPendingExpand
              ? 'bg-[var(--color-primary-muted)] ring-1 ring-[var(--color-primary)] text-[var(--color-text)] animate-pulse'
              : 'bg-[var(--color-primary-muted)] ring-1 ring-[var(--color-primary)] text-[var(--color-text)]'
            : isSelected
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
          }
        `}
      >
        {/* Chevron for folders */}
        {isFolder ? (
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* File/folder icon */}
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${
            isSelected ? 'text-white' : iconColor
          }`}
        />

        {/* File name or rename input */}
        {isRenaming && ctx ? (
          <InlineRenameInput
            node={node.data}
            onSubmit={ctx.onRenameSubmit}
            onCancel={ctx.onRenameCancel}
          />
        ) : (
          <span className="truncate flex-1 text-left">{node.data.name}</span>
        )}
      </button>
    </div>
  );

  // Wrap with context menu if context is available
  if (ctx && !isRenaming) {
    return (
      <FileTreeContextMenu node={node.data}>
        {nodeContent}
      </FileTreeContextMenu>
    );
  }

  return nodeContent;
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

interface DeleteConfirmationDialogProps {
  node: FileTreeNodeData | null;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmationDialog({
  node,
  isOpen,
  onConfirm,
  onCancel,
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <AlertDialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl z-50 w-full max-w-md p-6"
          data-testid="delete-confirmation-dialog"
        >
          <AlertDialog.Title className="text-lg font-semibold text-[var(--color-text)]">
            Are you sure you want to delete {node?.name}?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--color-text-muted)]">
            This action cannot be undone.
          </AlertDialog.Description>

          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
                data-testid="delete-cancel-button"
              >
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                data-testid="delete-confirm-button"
              >
                Delete
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ============================================================================
// Tree Data Conversion
// ============================================================================

/**
 * Convert FileEntry to tree node format
 */
function fileEntryToTreeNode(entry: FileEntry): FileTreeNodeData {
  return {
    id: entry.id,
    name: entry.name,
    nodeType: entry.type === 'directory' ? 'folder' : 'file',
    path: entry.path,
    children: entry.children?.map(fileEntryToTreeNode),
  };
}

/**
 * Convert Document to tree node format
 */
function documentToTreeNode(doc: Document): FileTreeNodeData {
  return {
    id: doc.id,
    name: doc.title || 'Untitled',
    nodeType: 'file',
    path: doc.title || 'Untitled',
    document: doc,
  };
}

/**
 * Get parent directory path from a file path
 */
function getParentPath(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash > 0 ? path.slice(0, lastSlash) : '';
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Imperative handle exposed by EditorFileTree via forwardRef.
 */
export interface EditorFileTreeHandle {
  /** Collapse all expanded folders in the tree */
  closeAll: () => void;
}

interface EditorFileTreeProps {
  /** Workspace file entries (for workspace mode) */
  workspaceEntries?: FileEntry[];
  /** Documents (for documents mode) */
  documents?: Document[];
  /** Current source mode */
  source: FileSource;
  /** Currently selected file ID */
  selectedId: string | null;
  /** Callback when a file is selected (single click) */
  onSelectFile: (node: FileTreeNodeData) => void;
  /** Callback when a file is double-clicked (pins the tab) */
  onDoubleClickFile?: (node: FileTreeNodeData) => void;
  /** Callback when a file is deleted */
  onDeleteFile?: (path: string) => Promise<void>;
  /** Callback when a file is renamed */
  onRenameFile?: (oldPath: string, newPath: string) => Promise<void>;
  /** Callback when a file is pasted */
  onPasteFile?: (sourcePath: string, destFolder: string, operation: 'copy' | 'cut') => Promise<void>;
  /** Callback when a file/folder is moved via drag-and-drop */
  onMoveFile?: (oldPath: string, newPath: string) => Promise<void>;
  /** Absolute path to the workspace root (for Copy Path feature) */
  workspaceRoot?: string | null;
  /** Optional class name */
  className?: string;
}

export const EditorFileTree = forwardRef<EditorFileTreeHandle, EditorFileTreeProps>(function EditorFileTree({
  workspaceEntries = [],
  documents = [],
  source,
  selectedId,
  onSelectFile,
  onDoubleClickFile,
  onDeleteFile,
  onRenameFile,
  onPasteFile,
  onMoveFile,
  workspaceRoot,
  className = '',
}: EditorFileTreeProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<any>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  // Expose imperative handle for parent to call closeAll
  useImperativeHandle(ref, () => ({
    closeAll: () => treeRef.current?.closeAll(),
  }));

  // Context menu state
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [deletingNode, setDeletingNode] = useState<FileTreeNodeData | null>(null);

  // Measure container height
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Subtract padding
        setTreeHeight(Math.max(entry.contentRect.height - 8, 100));
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Convert data to tree format
  const treeData = useMemo(() => {
    if (source === 'workspace') {
      return workspaceEntries.map(fileEntryToTreeNode);
    }
    return documents.map(documentToTreeNode);
  }, [source, workspaceEntries, documents]);

  // Handle node selection (single click opens as preview tab)
  const handleSelect = useCallback(
    (nodes: NodeApi<FileTreeNodeData>[]) => {
      if (nodes.length > 0 && nodes[0].data.nodeType === 'file') {
        onSelectFile(nodes[0].data);
      }
    },
    [onSelectFile]
  );

  // Handle node activation (double-click pins the tab)
  const handleActivate = useCallback(
    (node: NodeApi<FileTreeNodeData>) => {
      if (node.data.nodeType === 'file') {
        // Double-click pins the tab
        if (onDoubleClickFile) {
          onDoubleClickFile(node.data);
        } else {
          onSelectFile(node.data);
        }
      }
    },
    [onSelectFile, onDoubleClickFile]
  );

  // Context menu handlers
  const handleOpen = useCallback(
    (node: FileTreeNodeData) => {
      if (node.nodeType === 'folder') {
        // Toggle folder - find the node in the tree and toggle it
        const treeApi = treeRef.current;
        if (treeApi) {
          const treeNode = treeApi.get(node.id);
          if (treeNode) {
            treeNode.toggle();
          }
        }
      } else {
        onSelectFile(node);
      }
    },
    [onSelectFile]
  );

  const handleCopy = useCallback((node: FileTreeNodeData) => {
    setClipboard({ node, operation: 'copy' });
  }, []);

  const handleCut = useCallback((node: FileTreeNodeData) => {
    setClipboard({ node, operation: 'cut' });
  }, []);

  const handlePaste = useCallback(
    async (targetFolder: FileTreeNodeData) => {
      if (!clipboard || !onPasteFile) return;

      try {
        await onPasteFile(
          clipboard.node.path,
          targetFolder.path,
          clipboard.operation
        );

        // Clear clipboard after cut operation
        if (clipboard.operation === 'cut') {
          setClipboard(null);
        }
      } catch (error) {
        console.error('Failed to paste file:', error);
      }
    },
    [clipboard, onPasteFile]
  );

  const handleCopyPath = useCallback((node: FileTreeNodeData) => {
    const fullPath = workspaceRoot ? `${workspaceRoot}/${node.path}` : `/${node.path}`;
    navigator.clipboard.writeText(fullPath);
  }, [workspaceRoot]);

  const handleCopyRelativePath = useCallback((node: FileTreeNodeData) => {
    navigator.clipboard.writeText(node.path);
  }, []);

  const handleRename = useCallback((node: FileTreeNodeData) => {
    setRenamingNodeId(node.id);
  }, []);

  const handleRenameSubmit = useCallback(
    async (oldPath: string, newName: string) => {
      if (!onRenameFile) {
        setRenamingNodeId(null);
        return;
      }

      const parentPath = getParentPath(oldPath);
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;

      try {
        await onRenameFile(oldPath, newPath);
      } catch (error) {
        console.error('Failed to rename file:', error);
      } finally {
        setRenamingNodeId(null);
      }
    },
    [onRenameFile]
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingNodeId(null);
  }, []);

  const handleDelete = useCallback((node: FileTreeNodeData) => {
    setDeletingNode(node);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingNode || !onDeleteFile) {
      setDeletingNode(null);
      return;
    }

    try {
      await onDeleteFile(deletingNode.path);
    } catch (error) {
      console.error('Failed to delete file:', error);
    } finally {
      setDeletingNode(null);
    }
  }, [deletingNode, onDeleteFile]);

  const handleDeleteCancel = useCallback(() => {
    setDeletingNode(null);
  }, []);

  // ---- Drag-and-drop handlers ----

  // State for DnD error messages
  const [moveError, setMoveError] = useState<string | null>(null);

  // Handle drag-and-drop move
  const handleMove = useCallback(
    async (args: {
      dragIds: string[];
      dragNodes: NodeApi<FileTreeNodeData>[];
      parentId: string | null;
      parentNode: NodeApi<FileTreeNodeData> | null;
      index: number;
    }) => {
      if (!onMoveFile) return;

      // Process each dragged node (typically one at a time since multiselect is disabled)
      for (const dragNode of args.dragNodes) {
        const oldPath = dragNode.data.path;
        const fileName = dragNode.data.name;

        // Compute new path based on destination
        const newPath = args.parentNode
          ? `${args.parentNode.data.path}/${fileName}`
          : fileName;

        // No-op if moving to the same location
        if (oldPath === newPath) continue;

        // Prevent dropping a folder into itself or its descendants
        if (args.parentNode && args.parentNode.data.path.startsWith(oldPath + '/')) {
          continue;
        }
        if (args.parentNode && args.parentNode.data.path === oldPath) {
          continue;
        }

        try {
          setMoveError(null);
          await onMoveFile(oldPath, newPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to move file';
          setMoveError(message);
          console.error('Failed to move file:', error);
          // Clear error after 5 seconds
          setTimeout(() => setMoveError(null), 5000);
        }
      }
    },
    [onMoveFile]
  );

  // Disable drop handler — prevents invalid drops
  const disableDropHandler = useCallback(
    (args: {
      parentNode: NodeApi<FileTreeNodeData>;
      dragNodes: NodeApi<FileTreeNodeData>[];
      index: number;
    }): boolean => {
      const { parentNode, dragNodes } = args;

      // Allow drops on the root node (top-level workspace)
      const isRootDrop = parentNode.isRoot;

      for (const dragNode of dragNodes) {
        if (isRootDrop) {
          // Cannot drop into root if already at root level (prevents reordering)
          const dragParentPath = getParentPath(dragNode.data.path);
          if (dragParentPath === '') return true;
          // Root drops are otherwise OK
          continue;
        }

        // Cannot drop on a file (only folders are valid drop targets)
        if (parentNode.data.nodeType === 'file') return true;

        // Cannot drop a folder into itself
        if (parentNode.data.path === dragNode.data.path) return true;

        // Cannot drop a folder into its own descendants
        if (parentNode.data.path.startsWith(dragNode.data.path + '/')) return true;

        // Cannot drop into the same parent folder (prevents reordering)
        const dragParentPath = getParentPath(dragNode.data.path);
        const dropParentPath = parentNode.data.path;
        if (dragParentPath === dropParentPath) return true;
      }

      return false;
    },
    []
  );

  // Determine if DnD should be enabled (only for workspace mode)
  const isDndEnabled = source === 'workspace' && !!onMoveFile;

  // Context value for FileNode
  const contextValue = useMemo<FileTreeContextMenuState>(
    () => ({
      clipboard,
      renamingNodeId,
      onOpen: handleOpen,
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onCopyPath: handleCopyPath,
      onCopyRelativePath: handleCopyRelativePath,
      onRename: handleRename,
      onDelete: handleDelete,
      onRenameSubmit: handleRenameSubmit,
      onRenameCancel: handleRenameCancel,
    }),
    [
      clipboard,
      renamingNodeId,
      handleOpen,
      handleCopy,
      handleCut,
      handlePaste,
      handleCopyPath,
      handleCopyRelativePath,
      handleRename,
      handleDelete,
      handleRenameSubmit,
      handleRenameCancel,
    ]
  );

  return (
    <FileTreeContextMenuContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        data-testid="editor-file-tree"
        className={`flex-1 overflow-hidden p-1 relative ${className}`}
      >
        {treeData.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
            No files to display
          </div>
        ) : (
          <>
            <Tree<FileTreeNodeData>
              ref={treeRef}
              data={treeData}
              width="100%"
              height={treeHeight}
              rowHeight={FILE_ROW_HEIGHT}
              indent={16}
              paddingTop={4}
              paddingBottom={4}
              selection={selectedId ?? undefined}
              onSelect={handleSelect}
              onActivate={handleActivate}
              disableMultiSelection
              openByDefault={false}
              onMove={isDndEnabled ? handleMove : undefined}
              disableDrag={!isDndEnabled}
              disableDrop={isDndEnabled ? disableDropHandler : true}
            >
              {FileNode}
            </Tree>
            {/* DnD error message */}
            {moveError && (
              <div
                className="absolute bottom-2 left-2 right-2 px-3 py-2 text-xs text-red-400 bg-red-900/30 border border-red-800/50 rounded-md"
                data-testid="move-error-message"
              >
                {moveError}
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          node={deletingNode}
          isOpen={deletingNode !== null}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      </div>
    </FileTreeContextMenuContext.Provider>
  );
});
