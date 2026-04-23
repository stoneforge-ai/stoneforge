/**
 * usePaneManager - Hook for managing workspace pane state
 *
 * Handles pane creation, removal, layout management, drag-drop, and persistence.
 * Resizing is handled by react-resizable-panels library.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Agent } from '../../api/types';
import type {
  PaneId,
  PaneStatus,
  LayoutPreset,
  GridOrientation,
  SectionLayout,
  WorkspacePane,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceActions,
  WorkspaceChannelMessage,
  DragState,
} from './types';
import {
  DEFAULT_LAYOUT,
  WORKSPACE_STORAGE_KEY,
  ACTIVE_LAYOUT_KEY,
  WORKSPACE_CHANNEL_NAME,
} from './types';

/** Generate a unique pane ID */
function generatePaneId(): PaneId {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique layout ID */
function generateLayoutId(): string {
  return `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Determine pane type based on agent role and mode */
function determinePaneType(agent: Agent): 'terminal' | 'stream' {
  const meta = agent.metadata?.agent;
  if (!meta) return 'stream';

  // Director and persistent workers get interactive terminal
  if (meta.agentRole === 'director') return 'terminal';
  if (meta.agentRole === 'worker') {
    const workerMeta = meta as { workerMode?: string };
    if (workerMeta.workerMode === 'persistent') return 'terminal';
  }

  // Ephemeral workers and stewards get stream viewer
  return 'stream';
}

/** Load saved layouts from localStorage */
function loadSavedLayouts(): WorkspaceLayout[] {
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** Save layouts to localStorage */
function saveLayouts(layouts: WorkspaceLayout[]): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Ignore storage errors
  }
}

/** Load active layout from localStorage */
function loadActiveLayout(): WorkspaceLayout {
  try {
    const saved = localStorage.getItem(ACTIVE_LAYOUT_KEY);
    if (saved) {
      const layout = JSON.parse(saved);
      // Validate the layout has required fields
      if (layout.id && layout.panes && Array.isArray(layout.panes)) {
        return layout;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_LAYOUT };
}

/** Save active layout to localStorage */
function saveActiveLayout(layout: WorkspaceLayout): void {
  try {
    localStorage.setItem(ACTIVE_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage errors
  }
}

export interface UsePaneManagerResult extends WorkspaceState, WorkspaceActions {
  /** Get all saved layout presets */
  savedLayouts: WorkspaceLayout[];
  /** Delete a saved layout */
  deleteLayout: (layoutId: string) => void;
  /** Check if there are any panes */
  hasPanes: boolean;
  /** Get number of panes */
  paneCount: number;
}

/**
 * Hook for managing workspace panes
 */
export function usePaneManager(): UsePaneManagerResult {
  const [layout, setLayout] = useState<WorkspaceLayout>(() => loadActiveLayout());
  const [activePane, setActivePane] = useState<PaneId | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<WorkspaceLayout[]>(() => loadSavedLayouts());

  const isDragging = dragState !== null;

  // Persist active layout on changes
  useEffect(() => {
    saveActiveLayout(layout);
  }, [layout]);

  // Listen for cross-window messages (pop back in)
  useEffect(() => {
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL_NAME);

    const handleMessage = (event: MessageEvent<WorkspaceChannelMessage>) => {
      if (event.data.type === 'pop-back-in') {
        const { pane } = event.data;
        const newPane: WorkspacePane = {
          id: generatePaneId(),
          ...pane,
          status: 'disconnected',
          position: 0,
          weight: 1,
        };

        setLayout(prev => {
          const updatedPanes = [...prev.panes, { ...newPane, position: prev.panes.length }];

          // Auto-switch to appropriate preset (don't auto-switch if user explicitly chose single)
          let newPreset = prev.preset;
          if (updatedPanes.length === 2 && prev.preset === 'single') {
            newPreset = 'columns';
          } else if (updatedPanes.length > 2 && prev.preset !== 'grid' && prev.preset !== 'flex' && prev.preset !== 'rows' && prev.preset !== 'columns') {
            newPreset = 'grid';
          }

          return {
            ...prev,
            preset: newPreset,
            panes: updatedPanes,
            modifiedAt: Date.now(),
          };
        });

        setActivePane(newPane.id);
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // Add a new pane
  const addPane = useCallback((agent: Agent) => {
    const newPane: WorkspacePane = {
      id: generatePaneId(),
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.metadata?.agent?.agentRole ?? 'worker',
      workerMode: agent.metadata?.agent?.agentRole === 'worker'
        ? (agent.metadata?.agent as { workerMode?: 'ephemeral' | 'persistent' })?.workerMode
        : undefined,
      paneType: determinePaneType(agent),
      status: 'disconnected',
      position: 0,
      weight: 1,
    };

    setLayout(prev => {
      const updatedPanes = [...prev.panes, { ...newPane, position: prev.panes.length }];

      // Auto-switch to appropriate preset (don't auto-switch if user explicitly chose single)
      let newPreset = prev.preset;
      if (updatedPanes.length === 2 && prev.preset === 'single') {
        newPreset = 'columns';
      } else if (updatedPanes.length > 2 && prev.preset !== 'grid' && prev.preset !== 'flex' && prev.preset !== 'rows' && prev.preset !== 'columns') {
        newPreset = 'grid';
      }

      return {
        ...prev,
        preset: newPreset,
        panes: updatedPanes,
        modifiedAt: Date.now(),
      };
    });

    setActivePane(newPane.id);
  }, []);

  // Remove a pane
  const removePane = useCallback((paneId: PaneId) => {
    setLayout(prev => {
      const filteredPanes = prev.panes.filter(p => p.id !== paneId);

      // Re-index positions
      const reindexedPanes = filteredPanes.map((p, i) => ({
        ...p,
        position: i,
      }));

      // Auto-switch layout if needed
      let newPreset = prev.preset;
      if (reindexedPanes.length <= 1) {
        newPreset = 'single';
      } else if (reindexedPanes.length === 2 && prev.preset === 'grid') {
        newPreset = 'columns';
      }

      return {
        ...prev,
        preset: newPreset,
        panes: reindexedPanes,
        modifiedAt: Date.now(),
      };
    });

    setActivePane(prev => prev === paneId ? null : prev);
  }, []);

  // Update pane status
  const updatePaneStatus = useCallback((paneId: PaneId, status: PaneStatus) => {
    setLayout(prev => ({
      ...prev,
      panes: prev.panes.map(p => p.id === paneId ? { ...p, status } : p),
    }));
  }, []);

  // Change layout preset
  const setLayoutPreset = useCallback((preset: LayoutPreset) => {
    setLayout(prev => ({
      ...prev,
      preset,
      modifiedAt: Date.now(),
    }));
  }, []);

  // Reorder panes
  const reorderPanes = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const panes = [...prev.panes];
      const [moved] = panes.splice(fromIndex, 1);
      panes.splice(toIndex, 0, moved);

      // Re-index positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Update pane weight
  const setPaneWeight = useCallback((paneId: PaneId, weight: number) => {
    setLayout(prev => ({
      ...prev,
      panes: prev.panes.map(p => p.id === paneId ? { ...p, weight: Math.max(0.5, Math.min(2, weight)) } : p),
    }));
  }, []);

  // Start dragging a pane
  const startDrag = useCallback((paneId: PaneId) => {
    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane) return;

    setDragState({
      paneId,
      originalPosition: pane.position,
      targetPosition: null,
    });
  }, [layout.panes]);

  // Update drag target position
  const updateDragTarget = useCallback((targetPosition: number | null) => {
    setDragState(prev => prev ? { ...prev, targetPosition } : null);
  }, []);

  // End drag and apply reorder
  const endDrag = useCallback(() => {
    if (dragState && dragState.targetPosition !== null && dragState.targetPosition !== dragState.originalPosition) {
      reorderPanes(dragState.originalPosition, dragState.targetPosition);
    }
    setDragState(null);
  }, [dragState, reorderPanes]);

  // Cancel drag without applying
  const cancelDrag = useCallback(() => {
    setDragState(null);
  }, []);

  // Move a pane to a new position
  const movePaneToPosition = useCallback((paneId: PaneId, newPosition: number) => {
    setLayout(prev => {
      const paneIndex = prev.panes.findIndex(p => p.id === paneId);
      if (paneIndex === -1) return prev;

      const panes = [...prev.panes];
      const [moved] = panes.splice(paneIndex, 1);

      // Insert at new position
      const insertIndex = Math.min(newPosition, panes.length);
      panes.splice(insertIndex, 0, moved);

      // Re-index positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Save current layout
  const saveLayout = useCallback((name: string) => {
    const newLayout: WorkspaceLayout = {
      ...layout,
      id: generateLayoutId(),
      name,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    const updated = [...savedLayouts, newLayout];
    setSavedLayouts(updated);
    saveLayouts(updated);
  }, [layout, savedLayouts]);

  // Load a saved layout
  const loadLayout = useCallback((layoutToLoad: WorkspaceLayout) => {
    setLayout({
      ...layoutToLoad,
      modifiedAt: Date.now(),
    });
    setActivePane(layoutToLoad.panes[0]?.id ?? null);
  }, []);

  // Delete a saved layout
  const deleteLayout = useCallback((layoutId: string) => {
    const updated = savedLayouts.filter(l => l.id !== layoutId);
    setSavedLayouts(updated);
    saveLayouts(updated);
  }, [savedLayouts]);

  // Clear all panes
  const clearPanes = useCallback(() => {
    setLayout(prev => ({
      ...prev,
      preset: 'single',
      panes: [],
      modifiedAt: Date.now(),
    }));
    setActivePane(null);
  }, []);

  // Swap two panes by their IDs
  const swapPanes = useCallback((paneId1: PaneId, paneId2: PaneId) => {
    setLayout(prev => {
      const panes = [...prev.panes];
      const index1 = panes.findIndex(p => p.id === paneId1);
      const index2 = panes.findIndex(p => p.id === paneId2);

      if (index1 === -1 || index2 === -1) return prev;

      // Swap the panes
      [panes[index1], panes[index2]] = [panes[index2], panes[index1]];

      // Re-index positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Move a pane up in order (to lower position index)
  const movePaneUp = useCallback((paneId: PaneId) => {
    setLayout(prev => {
      const paneIndex = prev.panes.findIndex(p => p.id === paneId);
      if (paneIndex <= 0) return prev; // Already at top or not found

      const panes = [...prev.panes];
      // Swap with the pane above
      [panes[paneIndex - 1], panes[paneIndex]] = [panes[paneIndex], panes[paneIndex - 1]];

      // Re-index positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Move a pane down in order (to higher position index)
  const movePaneDown = useCallback((paneId: PaneId) => {
    setLayout(prev => {
      const paneIndex = prev.panes.findIndex(p => p.id === paneId);
      if (paneIndex === -1 || paneIndex >= prev.panes.length - 1) return prev; // At bottom or not found

      const panes = [...prev.panes];
      // Swap with the pane below
      [panes[paneIndex], panes[paneIndex + 1]] = [panes[paneIndex + 1], panes[paneIndex]];

      // Re-index positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Rotate grid layout orientation (only works in grid mode with 3+ panes)
  // Toggles between horizontal (columns first) and vertical (rows first) orientation
  const rotateLayout = useCallback(() => {
    setLayout(prev => {
      const paneCount = prev.panes.length;
      // Only rotate if we're in grid mode and have 3+ panes
      if (prev.preset !== 'grid' || paneCount < 3) return prev;

      // Toggle between horizontal and vertical orientation
      const currentOrientation = prev.gridOrientation || 'horizontal';
      const newOrientation: GridOrientation = currentOrientation === 'horizontal' ? 'vertical' : 'horizontal';

      return {
        ...prev,
        gridOrientation: newOrientation,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Swap grid sections (columns or rows depending on orientation)
  // For 3-pane grid: swaps the single-pane section with the paired-pane section
  // Example: [A] | [B, C] becomes [B, C] | [A]
  const swapGridSections = useCallback(() => {
    setLayout(prev => {
      const paneCount = prev.panes.length;
      if (prev.preset !== 'grid' || paneCount < 3) return prev;

      // For 3-pane grid: toggle section layout AND reorder panes
      // This ensures the same pane stays as the "single" pane, just on the other side
      if (paneCount === 3) {
        const currentLayout = prev.sectionLayout || 'single-first';
        const newLayout: SectionLayout = currentLayout === 'single-first' ? 'single-last' : 'single-first';
        const panes = [...prev.panes];

        if (currentLayout === 'single-first') {
          // Going from single-first to single-last
          // [A, B, C] with single at index 0 → [B, C, A] with single at index 2
          // Move first pane to the end
          const single = panes.shift()!;
          panes.push(single);
        } else {
          // Going from single-last to single-first
          // [B, C, A] with single at index 2 → [A, B, C] with single at index 0
          // Move last pane to the beginning
          const single = panes.pop()!;
          panes.unshift(single);
        }

        // Re-index positions
        const reindexed = panes.map((p, i) => ({
          ...p,
          position: i,
        }));

        return {
          ...prev,
          panes: reindexed,
          sectionLayout: newLayout,
          modifiedAt: Date.now(),
        };
      }

      // For 4-pane grid (2x2): swap pairs of panes
      if (paneCount === 4) {
        const orientation = prev.gridOrientation || 'horizontal';
        const panes = [...prev.panes];

        if (orientation === 'horizontal') {
          // Swap columns: [0,2] <-> [1,3]
          [panes[0], panes[1]] = [panes[1], panes[0]];
          [panes[2], panes[3]] = [panes[3], panes[2]];
        } else {
          // Swap rows: [0,1] <-> [2,3]
          [panes[0], panes[2]] = [panes[2], panes[0]];
          [panes[1], panes[3]] = [panes[3], panes[1]];
        }

        // Re-index positions
        const reindexed = panes.map((p, i) => ({
          ...p,
          position: i,
        }));

        return {
          ...prev,
          panes: reindexed,
          modifiedAt: Date.now(),
        };
      }

      return prev;
    });
  }, []);

  // Swap rows in 2x2 grid layout
  // For a 2x2 grid with panes [0,1,2,3] arranged as:
  //   [0] [1]  <- top row
  //   [2] [3]  <- bottom row
  // This swaps the rows so they become:
  //   [2] [3]  <- was bottom, now top
  //   [0] [1]  <- was top, now bottom
  const swap2x2Rows = useCallback(() => {
    setLayout(prev => {
      const paneCount = prev.panes.length;
      if (paneCount !== 4) return prev;

      const panes = [...prev.panes];
      // Swap rows: [0,1] <-> [2,3]
      [panes[0], panes[2]] = [panes[2], panes[0]];
      [panes[1], panes[3]] = [panes[3], panes[1]];

      // Re-index positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  return {
    // State
    layout,
    activePane,
    isDragging,
    dragState,
    savedLayouts,

    // Computed
    hasPanes: layout.panes.length > 0,
    paneCount: layout.panes.length,

    // Actions
    addPane,
    removePane,
    setActivePane,
    updatePaneStatus,
    setLayoutPreset,
    reorderPanes,
    setPaneWeight,
    saveLayout,
    loadLayout,
    deleteLayout,
    clearPanes,
    startDrag,
    updateDragTarget,
    endDrag,
    cancelDrag,
    movePaneToPosition,
    swapPanes,
    movePaneUp,
    movePaneDown,
    rotateLayout,
    swapGridSections,
    swap2x2Rows,
  };
}
