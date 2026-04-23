/**
 * Global Quick Actions Context
 *
 * Provides global keyboard shortcuts (C T, C W, C E, C M, C D, C P) for creating tasks, workflows,
 * entities, teams, documents, and plans from any page in the application. The shortcuts are registered at the
 * app level and work consistently across dashboard, tasks, workflows, and other pages.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { keyboardManager, getCurrentBinding, SHORTCUTS_CHANGED_EVENT } from '../lib/keyboard';
import { CreateTaskModal } from '../components/task/CreateTaskModal';
import { CreateWorkflowModal } from '@stoneforge/ui/workflows';
import { CreateEntityModal } from '../components/entity/CreateEntityModal';
import { CreateTeamModal } from '../components/team/CreateTeamModal';
import { CreateDocumentModal } from '../components/document/CreateDocumentModal';
import { CreatePlanModal } from '@stoneforge/ui/plans';

interface GlobalQuickActionsContextValue {
  /** Open the create task modal */
  openCreateTaskModal: () => void;
  /** Open the create backlog task modal */
  openCreateBacklogTaskModal: () => void;
  /** Open the create workflow modal */
  openCreateWorkflowModal: () => void;
  /** Open the create entity modal */
  openCreateEntityModal: () => void;
  /** Open the create team modal */
  openCreateTeamModal: () => void;
  /** Open the create document modal */
  openCreateDocumentModal: () => void;
  /** Open the create plan modal */
  openCreatePlanModal: () => void;
  /** Whether the create task modal is open */
  isCreateTaskModalOpen: boolean;
  /** Whether the create backlog task modal is open */
  isCreateBacklogTaskModalOpen: boolean;
  /** Whether the create workflow modal is open */
  isCreateWorkflowModalOpen: boolean;
  /** Whether the create entity modal is open */
  isCreateEntityModalOpen: boolean;
  /** Whether the create team modal is open */
  isCreateTeamModalOpen: boolean;
  /** Whether the create document modal is open */
  isCreateDocumentModalOpen: boolean;
  /** Whether the create plan modal is open */
  isCreatePlanModalOpen: boolean;
}

const GlobalQuickActionsContext = createContext<GlobalQuickActionsContextValue | null>(null);

interface GlobalQuickActionsProviderProps {
  children: ReactNode;
}

export function GlobalQuickActionsProvider({ children }: GlobalQuickActionsProviderProps) {
  const navigate = useNavigate();
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isCreateBacklogTaskModalOpen, setIsCreateBacklogTaskModalOpen] = useState(false);
  const [isCreateWorkflowModalOpen, setIsCreateWorkflowModalOpen] = useState(false);
  const [isCreateEntityModalOpen, setIsCreateEntityModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreateDocumentModalOpen, setIsCreateDocumentModalOpen] = useState(false);
  const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);

  // Track shortcut version to trigger re-registration when shortcuts change
  const [shortcutVersion, setShortcutVersion] = useState(0);

  // Listen for shortcut changes to hot-reload
  useEffect(() => {
    const handleShortcutsChanged = () => {
      setShortcutVersion(v => v + 1);
    };
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, handleShortcutsChanged);
    return () => {
      window.removeEventListener(SHORTCUTS_CHANGED_EVENT, handleShortcutsChanged);
    };
  }, []);

  // Check if any modal is open
  const isAnyModalOpen = isCreateTaskModalOpen || isCreateBacklogTaskModalOpen || isCreateWorkflowModalOpen || isCreateEntityModalOpen || isCreateTeamModalOpen || isCreateDocumentModalOpen || isCreatePlanModalOpen;

  // Handlers for opening modals
  const openCreateTaskModal = useCallback(() => {
    setIsCreateTaskModalOpen(true);
  }, []);

  const openCreateBacklogTaskModal = useCallback(() => {
    setIsCreateBacklogTaskModalOpen(true);
  }, []);

  const openCreateWorkflowModal = useCallback(() => {
    setIsCreateWorkflowModalOpen(true);
  }, []);

  const openCreateEntityModal = useCallback(() => {
    setIsCreateEntityModalOpen(true);
  }, []);

  const openCreateTeamModal = useCallback(() => {
    setIsCreateTeamModalOpen(true);
  }, []);

  const openCreateDocumentModal = useCallback(() => {
    setIsCreateDocumentModalOpen(true);
  }, []);

  const openCreatePlanModal = useCallback(() => {
    setIsCreatePlanModalOpen(true);
  }, []);

  // Handlers for modal success
  const handleTaskCreated = useCallback((task: { id: string }) => {
    toast.success('Task created successfully', {
      description: 'Your new task has been created.',
      action: {
        label: 'View Task',
        onClick: () => navigate({ to: '/tasks', search: { selected: task.id, page: 1, limit: 25 } }),
      },
    });
  }, [navigate]);

  const handleWorkflowCreated = useCallback((workflow: { id: string; title: string }) => {
    toast.success('Workflow created successfully', {
      description: `"${workflow.title}" has been created.`,
      action: {
        label: 'View Workflow',
        onClick: () => navigate({ to: '/workflows', search: { selected: workflow.id } }),
      },
    });
  }, [navigate]);

  const handleEntityCreated = useCallback((entity: { id: string; name: string }) => {
    toast.success('Entity created successfully', {
      description: `"${entity.name}" has been created.`,
      action: {
        label: 'View Entity',
        onClick: () => navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: 1, limit: 25 } }),
      },
    });
  }, [navigate]);

  const handleTeamCreated = useCallback((team: { id: string; name: string }) => {
    toast.success('Team created successfully', {
      description: `"${team.name}" has been created.`,
      action: {
        label: 'View Team',
        onClick: () => navigate({ to: '/teams', search: { selected: team.id, page: 1, limit: 25 } }),
      },
    });
  }, [navigate]);

  const handleDocumentCreated = useCallback((document: { id: string }) => {
    toast.success('Document created successfully', {
      description: 'Your new document has been created.',
      action: {
        label: 'View Document',
        onClick: () => navigate({ to: '/documents', search: { selected: document.id, library: undefined } }),
      },
    });
  }, [navigate]);

  const handlePlanCreated = useCallback((plan: { id: string; title: string }) => {
    toast.success('Plan created successfully', {
      description: `"${plan.title}" has been created.`,
      action: {
        label: 'View Plan',
        onClick: () => navigate({ to: '/plans', search: { selected: plan.id, status: undefined } }),
      },
    });
  }, [navigate]);

  // Register global keyboard shortcuts for create actions
  // Uses getCurrentBinding() to respect custom shortcut bindings
  useEffect(() => {
    const createTaskHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateTaskModalOpen(true);
      }
    };

    const createBacklogTaskHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateBacklogTaskModalOpen(true);
      }
    };

    const createWorkflowHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateWorkflowModalOpen(true);
      }
    };

    const createEntityHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateEntityModalOpen(true);
      }
    };

    const createTeamHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateTeamModalOpen(true);
      }
    };

    const createDocumentHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateDocumentModalOpen(true);
      }
    };

    const createPlanHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreatePlanModalOpen(true);
      }
    };

    // Get current bindings (respects custom shortcuts from settings)
    const createTaskKeys = getCurrentBinding('action.createTask');
    const createBacklogTaskKeys = getCurrentBinding('action.createBacklogTask');
    const createWorkflowKeys = getCurrentBinding('action.createWorkflow');
    const createEntityKeys = getCurrentBinding('action.createEntity');
    const createTeamKeys = getCurrentBinding('action.createTeam');
    const createDocumentKeys = getCurrentBinding('action.createDocument');
    const createPlanKeys = getCurrentBinding('action.createPlan');

    // Track registered keys for cleanup
    const registeredKeys: string[] = [];

    if (createTaskKeys) {
      keyboardManager.register(createTaskKeys, createTaskHandler, 'Create Task');
      registeredKeys.push(createTaskKeys);
    }
    if (createBacklogTaskKeys) {
      keyboardManager.register(createBacklogTaskKeys, createBacklogTaskHandler, 'Create Backlog Task');
      registeredKeys.push(createBacklogTaskKeys);
    }
    if (createWorkflowKeys) {
      keyboardManager.register(createWorkflowKeys, createWorkflowHandler, 'Create Workflow');
      registeredKeys.push(createWorkflowKeys);
    }
    if (createEntityKeys) {
      keyboardManager.register(createEntityKeys, createEntityHandler, 'Create Entity');
      registeredKeys.push(createEntityKeys);
    }
    if (createTeamKeys) {
      keyboardManager.register(createTeamKeys, createTeamHandler, 'Create Team');
      registeredKeys.push(createTeamKeys);
    }
    if (createDocumentKeys) {
      keyboardManager.register(createDocumentKeys, createDocumentHandler, 'Create Document');
      registeredKeys.push(createDocumentKeys);
    }
    if (createPlanKeys) {
      keyboardManager.register(createPlanKeys, createPlanHandler, 'Create Plan');
      registeredKeys.push(createPlanKeys);
    }

    return () => {
      registeredKeys.forEach(keys => {
        keyboardManager.unregister(keys);
      });
    };
  }, [isAnyModalOpen, shortcutVersion]);

  // Disable keyboard shortcuts when modals are open
  useEffect(() => {
    if (isAnyModalOpen) {
      keyboardManager.setEnabled(false);
    } else {
      keyboardManager.setEnabled(true);
    }
  }, [isAnyModalOpen]);

  const contextValue: GlobalQuickActionsContextValue = {
    openCreateTaskModal,
    openCreateBacklogTaskModal,
    openCreateWorkflowModal,
    openCreateEntityModal,
    openCreateTeamModal,
    openCreateDocumentModal,
    openCreatePlanModal,
    isCreateTaskModalOpen,
    isCreateBacklogTaskModalOpen,
    isCreateWorkflowModalOpen,
    isCreateEntityModalOpen,
    isCreateTeamModalOpen,
    isCreateDocumentModalOpen,
    isCreatePlanModalOpen,
  };

  return (
    <GlobalQuickActionsContext.Provider value={contextValue}>
      {children}

      {/* Global Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        onSuccess={handleTaskCreated}
      />

      {/* Global Create Backlog Task Modal */}
      <CreateTaskModal
        isOpen={isCreateBacklogTaskModalOpen}
        onClose={() => setIsCreateBacklogTaskModalOpen(false)}
        onSuccess={handleTaskCreated}
        defaultToBacklog={true}
      />

      {/* Global Create Workflow Modal */}
      <CreateWorkflowModal
        isOpen={isCreateWorkflowModalOpen}
        onClose={() => setIsCreateWorkflowModalOpen(false)}
        onSuccess={handleWorkflowCreated}
      />

      {/* Global Create Entity Modal */}
      <CreateEntityModal
        isOpen={isCreateEntityModalOpen}
        onClose={() => setIsCreateEntityModalOpen(false)}
        onSuccess={handleEntityCreated}
      />

      {/* Global Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSuccess={handleTeamCreated}
      />

      {/* Global Create Document Modal */}
      <CreateDocumentModal
        isOpen={isCreateDocumentModalOpen}
        onClose={() => setIsCreateDocumentModalOpen(false)}
        onSuccess={handleDocumentCreated}
      />

      {/* Global Create Plan Modal */}
      <CreatePlanModal
        isOpen={isCreatePlanModalOpen}
        onClose={() => setIsCreatePlanModalOpen(false)}
        onSuccess={handlePlanCreated}
      />
    </GlobalQuickActionsContext.Provider>
  );
}

/**
 * Hook to access global quick actions (create task, workflow, entity)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { openCreateTaskModal, openCreateWorkflowModal, openCreateEntityModal } = useGlobalQuickActions();
 *
 *   return (
 *     <button onClick={openCreateTaskModal}>
 *       Create Task
 *       <kbd>C T</kbd>
 *     </button>
 *   );
 * }
 * ```
 */
export function useGlobalQuickActions(): GlobalQuickActionsContextValue {
  const context = useContext(GlobalQuickActionsContext);
  if (!context) {
    throw new Error('useGlobalQuickActions must be used within a GlobalQuickActionsProvider');
  }
  return context;
}
