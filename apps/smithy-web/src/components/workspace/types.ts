/**
 * Workspace Pane Types
 *
 * Type definitions for the terminal multiplexer workspace system.
 */

import type { AgentRole, WorkerMode, Agent } from '../../api/types';

/** Unique identifier for a pane */
export type PaneId = string;

/** Layout preset types */
export type LayoutPreset = 'single' | 'rows' | 'columns' | 'grid' | 'flex';

/** Grid orientation - determines primary split direction */
export type GridOrientation = 'horizontal' | 'vertical';

/** Section layout - for 3-pane grid, determines if single pane is first or last */
export type SectionLayout = 'single-first' | 'single-last';

/** Pane type determines rendering behavior */
export type PaneType = 'terminal' | 'stream';

/** Pane status reflects agent connection state */
export type PaneStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Configuration for a single pane
 */
export interface WorkspacePane {
  id: PaneId;
  agentId: string;
  agentName: string;
  agentRole: AgentRole;
  workerMode?: WorkerMode;
  paneType: PaneType;
  status: PaneStatus;
  /** Position in the grid (0-indexed, for ordering) */
  position: number;
  /** Size weight for resizing (default 1) */
  weight: number;
}

/**
 * Drag state for pane reordering
 */
export interface DragState {
  /** ID of the pane being dragged */
  paneId: PaneId;
  /** Original position before drag started */
  originalPosition: number;
  /** Current drop target position */
  targetPosition: number | null;
}

/**
 * Layout configuration for persisting workspace state
 */
export interface WorkspaceLayout {
  id: string;
  name: string;
  preset: LayoutPreset;
  panes: WorkspacePane[];
  /** Grid orientation - determines primary split direction (horizontal = columns first, vertical = rows first) */
  gridOrientation?: GridOrientation;
  /** Section layout - for 3-pane grid, whether single pane is first (left/top) or last (right/bottom) */
  sectionLayout?: SectionLayout;
  createdAt: number;
  modifiedAt: number;
}

/**
 * Workspace state managed by the PaneManager hook
 */
export interface WorkspaceState {
  layout: WorkspaceLayout;
  activePane: PaneId | null;
  isDragging: boolean;
  dragState: DragState | null;
}

/**
 * Actions for workspace pane management
 */
export interface WorkspaceActions {
  /** Add a new pane with the specified agent */
  addPane: (agent: Agent) => void;
  /** Remove a pane by ID */
  removePane: (paneId: PaneId) => void;
  /** Set the active (focused) pane */
  setActivePane: (paneId: PaneId | null) => void;
  /** Update pane status */
  updatePaneStatus: (paneId: PaneId, status: PaneStatus) => void;
  /** Change layout preset */
  setLayoutPreset: (preset: LayoutPreset) => void;
  /** Reorder panes (for drag-drop) */
  reorderPanes: (fromIndex: number, toIndex: number) => void;
  /** Update pane weight for resizing */
  setPaneWeight: (paneId: PaneId, weight: number) => void;
  /** Save current layout with a name */
  saveLayout: (name: string) => void;
  /** Load a saved layout */
  loadLayout: (layout: WorkspaceLayout) => void;
  /** Clear all panes */
  clearPanes: () => void;
  /** Start dragging a pane */
  startDrag: (paneId: PaneId) => void;
  /** Update drag target position */
  updateDragTarget: (targetPosition: number | null) => void;
  /** End drag and apply reorder */
  endDrag: () => void;
  /** Cancel drag without applying */
  cancelDrag: () => void;
  /** Move a pane to a new grid position */
  movePaneToPosition: (paneId: PaneId, position: number) => void;
  /** Swap two panes by their IDs */
  swapPanes: (paneId1: PaneId, paneId2: PaneId) => void;
  /** Move a pane up in order (to lower position index) */
  movePaneUp: (paneId: PaneId) => void;
  /** Move a pane down in order (to higher position index) */
  movePaneDown: (paneId: PaneId) => void;
  /** Rotate layout orientation (toggle between row-based and column-based layouts) */
  rotateLayout: () => void;
  /** Swap grid sections (toggles between single-first and single-last layout) */
  swapGridSections: () => void;
  /** Swap rows in 2x2 grid layout (top row swaps with bottom row) */
  swap2x2Rows: () => void;
}

/**
 * Stream event from ephemeral agent
 */
export interface StreamEvent {
  id: string;
  type: 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'user' | 'result';
  timestamp: number;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  isError?: boolean;
}

/**
 * Local storage key for workspace layouts
 */
export const WORKSPACE_STORAGE_KEY = 'stoneforge-workspace-layouts';
export const ACTIVE_LAYOUT_KEY = 'stoneforge-active-workspace-layout';

/**
 * BroadcastChannel name for cross-window communication
 */
export const WORKSPACE_CHANNEL_NAME = 'stoneforge-workspace-channel';

/**
 * Message types for cross-window communication
 */
export interface PopBackInMessage {
  type: 'pop-back-in';
  pane: Omit<WorkspacePane, 'id' | 'position' | 'weight' | 'status'>;
}

export type WorkspaceChannelMessage = PopBackInMessage;

/**
 * Minimum pane size in pixels
 */
export const MIN_PANE_SIZE_PX = 150;

/**
 * Default layout configuration
 */
export const DEFAULT_LAYOUT: WorkspaceLayout = {
  id: 'default',
  name: 'Default',
  preset: 'single',
  panes: [],
  gridOrientation: 'horizontal',
  sectionLayout: 'single-first',
  createdAt: Date.now(),
  modifiedAt: Date.now(),
};
