/**
 * Workspaces Page - Terminal multiplexer for managing agent sessions
 *
 * Provides a tmux-like interface for viewing and interacting with multiple
 * agent terminals simultaneously. Supports different layout presets and
 * persists layout configuration to localStorage.
 */

import { useState, useEffect, useRef } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { getCurrentBinding, formatKeyBinding } from '../../lib/keyboard';
import {
  LayoutGrid,
  Plus,
  Columns,
  Rows,
  Grid3X3,
  Square,
  Save,
  ChevronDown,
  Trash2,
  RotateCw,
} from 'lucide-react';
import {
  usePaneManager,
  WorkspaceGrid,
  AddPaneDialog,
  type LayoutPreset,
} from '../../components/workspace';
import { useAgent, useResumeAgentSession } from '../../api/hooks/useAgents';

/** Layout preset configuration */
const layoutPresets: { id: LayoutPreset; icon: typeof Square; label: string }[] = [
  { id: 'single', icon: Square, label: 'Single' },
  { id: 'columns', icon: Columns, label: 'Columns' },
  { id: 'rows', icon: Rows, label: 'Rows' },
  { id: 'grid', icon: Grid3X3, label: 'Grid' },
];

export function WorkspacesPage() {
  const search = useSearch({ from: '/workspaces' }) as {
    layout?: string;
    agent?: string;
    action?: string;
    resumeSessionId?: string;
    resumePrompt?: string;
  };
  const navigate = useNavigate();
  const [showAddPane, setShowAddPane] = useState(false);

  // Handle ?action=addPane from global keyboard shortcuts
  useEffect(() => {
    if (search.action === 'addPane') {
      setShowAddPane(true);
      // Clear the action param
      navigate({
        to: '/workspaces',
        search: { layout: search.layout ?? 'single', agent: undefined, resumeSessionId: undefined, resumePrompt: undefined },
        replace: true,
      });
    }
  }, [search.action, search.layout, navigate]);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [layoutName, setLayoutName] = useState('');

  const {
    layout,
    activePane,
    hasPanes,
    paneCount,
    savedLayouts,
    dragState,
    addPane,
    removePane,
    setActivePane,
    updatePaneStatus,
    setLayoutPreset,
    saveLayout,
    loadLayout,
    deleteLayout,
    clearPanes,
    startDrag,
    updateDragTarget,
    endDrag,
    cancelDrag,
    rotateLayout,
    swapGridSections,
    swapPanes,
    swap2x2Rows,
  } = usePaneManager();

  // Handle agent URL parameter - open agent in pane when navigating from Agents page
  // Also handles resumeSessionId and resumePrompt for session resume from task detail navigation
  const agentIdFromUrl = search.agent;
  const { data: agentResponse } = useAgent(agentIdFromUrl ?? '');
  const agentFromUrl = agentResponse?.agent;
  const processedAgentRef = useRef<string | null>(null);
  const resumeProcessedRef = useRef<string | null>(null);
  const resumeAgent = useResumeAgentSession();

  useEffect(() => {
    // If agent ID is in URL and we fetched the agent data, add it as a pane
    if (agentFromUrl && agentIdFromUrl && processedAgentRef.current !== agentIdFromUrl) {
      const existingPane = layout.panes.find(p => p.agentId === agentIdFromUrl);
      if (!existingPane) {
        // Add the agent as a new pane
        addPane(agentFromUrl);
      } else {
        // Agent already exists, just activate it
        setActivePane(existingPane.id);
      }
      // Mark as processed
      processedAgentRef.current = agentIdFromUrl;

      // If resume params are present, trigger the resume
      const resumeSessionId = search.resumeSessionId;
      if (resumeSessionId && resumeProcessedRef.current !== resumeSessionId) {
        resumeProcessedRef.current = resumeSessionId;
        resumeAgent.mutate({
          agentId: agentIdFromUrl,
          providerSessionId: resumeSessionId,
          resumePrompt: search.resumePrompt,
        });
      }

      // Clear all URL params
      navigate({
        to: '/workspaces',
        search: { layout: search.layout ?? 'single', agent: undefined, resumeSessionId: undefined, resumePrompt: undefined },
        replace: true,
      });
    }
  }, [agentFromUrl, agentIdFromUrl, layout.panes, addPane, setActivePane, navigate, search.layout, search.resumeSessionId, search.resumePrompt, resumeAgent]);

  const currentPreset = layoutPresets.find(p => p.id === layout.preset) || layoutPresets[0];
  const existingAgentIds = layout.panes.map(p => p.agentId);

  const handleSaveLayout = () => {
    if (layoutName.trim()) {
      saveLayout(layoutName.trim());
      setLayoutName('');
      setShowSaveDialog(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in" data-testid="workspaces-page">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <LayoutGrid className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Workspaces</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Terminal multiplexer for agent sessions
              {paneCount > 0 && ` • ${paneCount} pane${paneCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Layout selector */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="
                flex items-center gap-2 px-3 py-2
                text-sm font-medium
                text-[var(--color-text-secondary)]
                rounded-md border border-[var(--color-border)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors duration-150
              "
              data-testid="workspaces-layout-btn"
            >
              <currentPreset.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{currentPreset.label}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </button>

            {/* Layout dropdown */}
            {showLayoutMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowLayoutMenu(false)}
                />
                <div
                  className="
                    absolute right-0 top-full mt-1 z-20
                    min-w-48 py-1 rounded-md shadow-lg
                    bg-[var(--color-bg)] border border-[var(--color-border)]
                  "
                  data-testid="layout-menu"
                >
                  <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
                    Layout Presets
                  </div>
                  {layoutPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setLayoutPreset(preset.id);
                        setShowLayoutMenu(false);
                      }}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                        ${layout.preset === preset.id
                          ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                        }
                      `}
                      data-testid={`layout-preset-${preset.id}`}
                    >
                      <preset.icon className="w-4 h-4" />
                      {preset.label}
                    </button>
                  ))}

                  {/* Saved layouts */}
                  {savedLayouts.length > 0 && (
                    <>
                      <div className="my-1 border-t border-[var(--color-border)]" />
                      <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
                        Saved Layouts
                      </div>
                      {savedLayouts.map((saved) => (
                        <div
                          key={saved.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-[var(--color-surface-hover)]"
                        >
                          <button
                            onClick={() => {
                              loadLayout(saved);
                              setShowLayoutMenu(false);
                            }}
                            className="flex-1 text-left text-sm text-[var(--color-text-secondary)]"
                          >
                            {saved.name}
                          </button>
                          <button
                            onClick={() => deleteLayout(saved.id)}
                            className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Delete layout"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Save current layout */}
                  {hasPanes && (
                    <>
                      <div className="my-1 border-t border-[var(--color-border)]" />
                      <button
                        onClick={() => {
                          setShowLayoutMenu(false);
                          setShowSaveDialog(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                      >
                        <Save className="w-4 h-4" />
                        Save Current Layout
                      </button>
                    </>
                  )}

                  {/* Clear all */}
                  {hasPanes && (
                    <button
                      onClick={() => {
                        clearPanes();
                        setShowLayoutMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear All Panes
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Rotate Layout button (only visible in Grid mode with 3+ panes) */}
          {layout.preset === 'grid' && paneCount >= 3 && (
            <button
              onClick={rotateLayout}
              className="
                flex items-center gap-2 px-3 py-2
                text-sm font-medium
                text-[var(--color-text-secondary)]
                rounded-md border border-[var(--color-border)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors duration-150
              "
              title="Rotate grid layout"
              data-testid="workspaces-rotate-btn"
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden sm:inline">Rotate</span>
            </button>
          )}

          {/* Add pane button */}
          <button
            onClick={() => setShowAddPane(true)}
            className="
              flex items-center gap-2 px-3 py-2
              text-sm font-medium text-white
              bg-[var(--color-primary)]
              rounded-md
              hover:bg-[var(--color-primary-hover)]
              transition-colors duration-150
            "
            data-testid="workspaces-add-pane"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Pane</span>
            <kbd className="hidden sm:inline ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">
              {formatKeyBinding(getCurrentBinding('action.addPane'))}
            </kbd>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        {hasPanes ? (
          <WorkspaceGrid
            panes={layout.panes}
            preset={layout.preset}
            gridOrientation={layout.gridOrientation}
            sectionLayout={layout.sectionLayout}
            activePane={activePane}
            dragState={dragState}
            onPaneClose={removePane}
            onPaneActivate={setActivePane}
            onPaneStatusChange={updatePaneStatus}
            onStartDrag={startDrag}
            onUpdateDragTarget={updateDragTarget}
            onEndDrag={endDrag}
            onCancelDrag={cancelDrag}
            onSwapSections={swapGridSections}
            onSwapPanes={swapPanes}
            onSwap2x2Rows={swap2x2Rows}
          />
        ) : (
          /* Empty state */
          <div
            className="
              flex flex-col items-center justify-center
              h-full
              rounded-lg border-2 border-dashed border-[var(--color-border)]
              bg-[var(--color-bg-secondary)]
            "
            data-testid="workspaces-empty"
          >
            <LayoutGrid className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4 opacity-50" />
            <h2 className="text-lg font-medium text-[var(--color-text)] mb-1">
              No Terminal Panes
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4 text-center max-w-sm">
              Add panes to view and interact with your agent terminals side by side.
            </p>
            <button
              onClick={() => setShowAddPane(true)}
              className="
                flex items-center gap-2 px-4 py-2
                text-sm font-medium text-white
                bg-[var(--color-primary)]
                rounded-md
                hover:bg-[var(--color-primary-hover)]
                transition-colors duration-150
              "
            >
              <Plus className="w-4 h-4" />
              Add Your First Pane
            </button>
          </div>
        )}
      </div>

      {/* Add pane dialog */}
      <AddPaneDialog
        isOpen={showAddPane}
        onClose={() => setShowAddPane(false)}
        onSelectAgent={addPane}
        existingAgentIds={existingAgentIds}
      />

      {/* Save layout dialog */}
      {showSaveDialog && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
            onClick={() => setShowSaveDialog(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="
                w-full max-w-sm
                bg-[var(--color-bg)]
                rounded-xl shadow-2xl
                border border-[var(--color-border)]
                animate-scale-in
                pointer-events-auto
                p-4
              "
              data-testid="save-layout-dialog"
            >
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-3">
                Save Layout
              </h3>
              <input
                type="text"
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                placeholder="Layout name..."
                className="
                  w-full px-3 py-2 mb-4
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  placeholder:text-[var(--color-text-tertiary)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                "
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLayout();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="
                    px-3 py-2 text-sm font-medium
                    text-[var(--color-text-secondary)]
                    rounded-md
                    hover:bg-[var(--color-surface-hover)]
                  "
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLayout}
                  disabled={!layoutName.trim()}
                  className="
                    px-3 py-2 text-sm font-medium text-white
                    bg-[var(--color-primary)]
                    rounded-md
                    hover:bg-[var(--color-primary-hover)]
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
