/**
 * Workspace Components Export
 *
 * Terminal multiplexer components for managing multiple agent sessions.
 */

// Types (excluding WorkspacePane type to avoid conflict with component)
export type {
  PaneId,
  LayoutPreset,
  GridOrientation,
  SectionLayout,
  PaneType,
  PaneStatus,
  WorkspacePane as WorkspacePaneData,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceActions,
  StreamEvent,
  DragState,
} from './types';
export {
  WORKSPACE_STORAGE_KEY,
  ACTIVE_LAYOUT_KEY,
  DEFAULT_LAYOUT,
  MIN_PANE_SIZE_PX,
} from './types';

// Hooks
export * from './usePaneManager';

// Components
export { WorkspacePane, type WorkspacePaneHandle } from './WorkspacePane';
export { WorkspaceGrid } from './WorkspaceGrid';
export { StreamViewer } from './StreamViewer';
export { TerminalInput, type TerminalInputProps } from './TerminalInput';
export { AddPaneDialog } from './AddPaneDialog';
