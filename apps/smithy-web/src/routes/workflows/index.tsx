/**
 * Workflows Page - View and manage workflow templates and active workflows
 * Templates tab shows playbooks, Active tab shows running workflows
 *
 * TB-O33: Visual Workflow Editor
 * TB-O34: Create Workflow from Template
 * TB-O35: Workflow Progress Dashboard
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { getCurrentBinding, formatKeyBinding } from '../../lib/keyboard';
import {
  Workflow,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import {
  // Components
  CreateWorkflowModal,
  WorkflowEditorModal,
  WorkflowProgressDashboard,
  PlaybookCard,
  WorkflowCard,
  // Hooks
  useWorkflows,
  usePlaybooks,
  useCancelWorkflow,
  useDeleteWorkflow,
  useWorkflowDetail,
  // Types
  type Workflow as WorkflowType,
  type Playbook,
} from '@stoneforge/ui/workflows';

type TabValue = 'templates' | 'active';

export function WorkflowsPage() {
  const search = useSearch({ from: '/workflows' }) as { tab?: string; selected?: string; action?: string };
  const navigate = useNavigate();

  const currentTab = (search.tab as TabValue) || 'templates';
  const selectedWorkflowId = search.selected;
  const [searchQuery, setSearchQuery] = useState('');

  // Create workflow modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);

  // Editor modal state (TB-O33)
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = useState<string | null>(null);

  // Handle ?action=create from global keyboard shortcuts
  useEffect(() => {
    if (search.action === 'create') {
      // Switch to templates tab and open editor
      setEditorModalOpen(true);
      setEditingPlaybookId(null);
      // Clear the action param and switch to templates tab
      navigate({
        to: '/workflows',
        search: { tab: 'templates', selected: undefined },
        replace: true,
      });
    }
  }, [search.action, navigate]);

  // Fetch playbooks for templates tab
  const { data: playbooksData, isLoading: playbooksLoading, error: playbooksError, refetch: refetchPlaybooks } = usePlaybooks();
  const playbooks = playbooksData?.playbooks ?? [];

  // Fetch workflows for active tab
  const { data: workflowsData, isLoading: workflowsLoading, error: workflowsError, refetch: refetchWorkflows } = useWorkflows();
  const allWorkflows = workflowsData?.workflows ?? [];

  // Fetch workflow detail when a workflow is selected (TB-O35)
  const {
    workflow: selectedWorkflow,
    tasks: workflowTasks,
    progress: workflowProgress,
    dependencies: workflowDependencies,
    isLoading: workflowDetailLoading,
    error: workflowDetailError,
  } = useWorkflowDetail(selectedWorkflowId);

  // Split workflows into active and terminal
  const activeWorkflows = useMemo(() =>
    allWorkflows.filter((w: WorkflowType) => w.status === 'pending' || w.status === 'running'),
    [allWorkflows]
  );

  const terminalWorkflows = useMemo(() =>
    allWorkflows.filter((w: WorkflowType) => ['completed', 'failed', 'cancelled'].includes(w.status)),
    [allWorkflows]
  );

  // Mutations
  const cancelWorkflow = useCancelWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  // Filter based on search query
  const filteredPlaybooks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return playbooks;
    return playbooks.filter(
      (p: Playbook) => p.name.toLowerCase().includes(query) || p.title.toLowerCase().includes(query)
    );
  }, [searchQuery, playbooks]);

  const filteredActiveWorkflows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return activeWorkflows;
    return activeWorkflows.filter((w: WorkflowType) => w.title.toLowerCase().includes(query));
  }, [searchQuery, activeWorkflows]);

  const filteredTerminalWorkflows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return terminalWorkflows;
    return terminalWorkflows.filter((w: WorkflowType) => w.title.toLowerCase().includes(query));
  }, [searchQuery, terminalWorkflows]);

  const setTab = (tab: TabValue) => {
    navigate({ to: '/workflows', search: { selected: search.selected, tab } });
  };

  const handleCreateFromPlaybook = (playbookId: string) => {
    setSelectedPlaybookId(playbookId);
    setCreateModalOpen(true);
  };

  const handleCreateSuccess = (workflow: { id: string; title: string }) => {
    console.log('Workflow created:', workflow.id, workflow.title);
    // Switch to Active tab to show the new workflow
    setTab('active');
  };

  // Workflow editor handlers (TB-O33)
  const handleCreatePlaybook = () => {
    setEditingPlaybookId(null);
    setEditorModalOpen(true);
  };

  const handleEditPlaybook = (playbookId: string) => {
    setEditingPlaybookId(playbookId);
    setEditorModalOpen(true);
  };

  const handleEditorSuccess = () => {
    // Refetch playbooks to show the new/updated one
    refetchPlaybooks();
  };

  const handleCancelWorkflow = async (workflowId: string) => {
    try {
      await cancelWorkflow.mutateAsync({ workflowId, reason: 'Cancelled by user' });
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    try {
      await deleteWorkflow.mutateAsync({ workflowId });
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
  };

  // Handle viewing workflow details (TB-O35)
  const handleViewDetails = (workflowId: string) => {
    navigate({ to: '/workflows', search: { tab: search.tab ?? 'active', selected: workflowId } });
  };

  // Handle going back from detail view
  const handleBackToList = () => {
    navigate({ to: '/workflows', search: { tab: search.tab ?? 'active', selected: undefined } });
  };

  const isLoading = currentTab === 'templates' ? playbooksLoading : workflowsLoading;
  const error = currentTab === 'templates' ? playbooksError : workflowsError;
  const refetch = currentTab === 'templates' ? refetchPlaybooks : refetchWorkflows;

  // If a workflow is selected, show the detail/progress view (TB-O35)
  if (selectedWorkflowId && selectedWorkflow) {
    return (
      <div className="space-y-6 animate-fade-in" data-testid="workflow-detail-page">
        {/* Back button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="workflow-back-button"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Workflows
          </button>
        </div>

        {/* Error state */}
        {workflowDetailError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Error loading workflow</p>
              <p className="text-sm text-red-600 dark:text-red-400">{workflowDetailError.message}</p>
            </div>
          </div>
        )}

        {/* Workflow Progress Dashboard */}
        <WorkflowProgressDashboard
          workflow={selectedWorkflow}
          tasks={workflowTasks}
          progress={workflowProgress}
          dependencies={workflowDependencies}
          isLoading={workflowDetailLoading}
        />
      </div>
    );
  }

  // Loading state for detail view
  if (selectedWorkflowId && workflowDetailLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="workflows-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <Workflow className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Workflows</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage workflow templates and active workflows
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {currentTab === 'templates' && (
            <button
              onClick={handleCreatePlaybook}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
              data-testid="workflows-create"
            >
              <Plus className="w-4 h-4" />
              Create Template
              <kbd className="ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">
                {formatKeyBinding(getCurrentBinding('action.createWorkflow'))}
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder={currentTab === 'templates' ? 'Search templates...' : 'Search workflows...'}
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
          data-testid="workflows-search"
        />
      </div>

      {/* Tabs: Templates | Active */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            onClick={() => setTab('templates')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'templates'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="workflows-tab-templates"
          >
            Templates
            {playbooks.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary)]">
                {playbooks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('active')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'active'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="workflows-tab-active"
          >
            Active
            {activeWorkflows.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                {activeWorkflows.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Error loading data</p>
            <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="ml-auto px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="workflows-loading">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
        </div>
      )}

      {/* Templates Tab Content */}
      {!isLoading && !error && currentTab === 'templates' && (
        <>
          {filteredPlaybooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
              <BookOpen className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)]">
                {searchQuery ? 'No matching templates' : 'No workflow templates'}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
                {searchQuery
                  ? 'Try adjusting your search query.'
                  : 'Create workflow templates to define reusable sequences of tasks. Templates can be used to create active workflows.'}
              </p>
              {!searchQuery && (
                <div className="mt-4">
                  <button
                    onClick={handleCreatePlaybook}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
                    data-testid="workflows-create-empty"
                  >
                    <Plus className="w-4 h-4" />
                    Create Template
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="playbooks-grid">
              {filteredPlaybooks.map((playbook: Playbook) => (
                <PlaybookCard
                  key={playbook.id}
                  playbook={playbook}
                  onCreate={handleCreateFromPlaybook}
                  onEdit={handleEditPlaybook}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Active Tab Content */}
      {!isLoading && !error && currentTab === 'active' && (
        <>
          {filteredActiveWorkflows.length === 0 && filteredTerminalWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
              <Workflow className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)]">
                {searchQuery ? 'No matching workflows' : 'No workflows'}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
                {searchQuery
                  ? 'Try adjusting your search query.'
                  : 'Use a template to create a new workflow, or create an ad-hoc workflow.'}
              </p>
              {!searchQuery && (
                <div className="mt-4">
                  <button
                    onClick={() => setTab('templates')}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
                  >
                    <BookOpen className="w-4 h-4" />
                    View Templates
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Workflows Section */}
              {filteredActiveWorkflows.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                    Active ({filteredActiveWorkflows.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="active-workflows-grid">
                    {filteredActiveWorkflows.map((workflow: WorkflowType) => (
                      <WorkflowCard
                        key={workflow.id}
                        workflow={workflow}
                        onCancel={handleCancelWorkflow}
                        onDelete={handleDeleteWorkflow}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent/Terminal Workflows Section */}
              {filteredTerminalWorkflows.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                    Recent ({filteredTerminalWorkflows.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="terminal-workflows-grid">
                    {filteredTerminalWorkflows.slice(0, 9).map((workflow: WorkflowType) => (
                      <WorkflowCard
                        key={workflow.id}
                        workflow={workflow}
                        onCancel={handleCancelWorkflow}
                        onDelete={handleDeleteWorkflow}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                  {filteredTerminalWorkflows.length > 9 && (
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)] text-center">
                      Showing 9 of {filteredTerminalWorkflows.length} completed workflows
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create Workflow Modal */}
      <CreateWorkflowModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setSelectedPlaybookId(null);
        }}
        playbookId={selectedPlaybookId}
        onSuccess={handleCreateSuccess}
      />

      {/* Workflow Editor Modal (TB-O33) */}
      <WorkflowEditorModal
        isOpen={editorModalOpen}
        onClose={() => {
          setEditorModalOpen(false);
          setEditingPlaybookId(null);
        }}
        playbookId={editingPlaybookId}
        onSuccess={handleEditorSuccess}
      />
    </div>
  );
}
