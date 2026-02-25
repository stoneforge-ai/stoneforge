/**
 * Workflow and Playbook Routes
 *
 * REST API endpoints for managing workflows and playbooks.
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('workflows');
import {
  createWorkflow,
  updateWorkflowStatus,
  WorkflowStatus,
  type Workflow,
  type WorkflowId,
  createPlaybook,
  updatePlaybook,
  type Playbook,
  type PlaybookId,
  type ElementId,
  type EntityId,
  type Task,
  type Dependency,
  type ExternalProvider,
  type SyncDirection,
  createWorkflowFromPlaybook,
  getTaskIdsInWorkflow,
  getDependenciesInWorkflow,
  DependencyType,
} from '@stoneforge/core';
import {
  autoLinkTask,
  createGitHubProvider,
  createLinearProvider,
  getValue,
} from '@stoneforge/quarry';

// ============================================================================
// Type Definitions
// ============================================================================

interface WorkflowResponse {
  workflow: Workflow;
}

interface WorkflowsResponse {
  workflows: Workflow[];
  total: number;
}

interface PlaybookResponse {
  playbook: Playbook;
}

interface PlaybooksResponse {
  playbooks: Playbook[];
  total: number;
}

interface WorkflowTasksResponse {
  tasks: Task[];
  total: number;
  progress: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    open: number;
    percentage: number;
  };
  dependencies: {
    blockedId: ElementId;
    blockerId: ElementId;
    type: string;
  }[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatWorkflowResponse(workflow: Workflow): Workflow {
  return {
    ...workflow,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    startedAt: workflow.startedAt,
    finishedAt: workflow.finishedAt,
  };
}

function formatPlaybookResponse(playbook: Playbook): Playbook {
  return {
    ...playbook,
    createdAt: playbook.createdAt,
    updatedAt: playbook.updatedAt,
  };
}

// ============================================================================
// Auto-Link Helper
// ============================================================================

/**
 * Create an ExternalProvider instance for auto-linking.
 *
 * Uses the settingsService from Services to read provider token and config.
 * Returns the provider instance or undefined if the provider cannot be created.
 */
function createAutoLinkProvider(
  providerName: string,
  services: Services
): ExternalProvider | undefined {
  const providerConfig = services.settingsService.getProviderConfig(providerName);
  if (!providerConfig?.token) {
    logger.warn(`Auto-link: provider "${providerName}" has no token configured`);
    return undefined;
  }

  if (providerName === 'github') {
    return createGitHubProvider({
      provider: 'github',
      token: providerConfig.token,
      apiBaseUrl: providerConfig.apiBaseUrl,
      defaultProject: providerConfig.defaultProject,
    });
  } else if (providerName === 'linear') {
    return createLinearProvider({
      apiKey: providerConfig.token,
    });
  }

  logger.warn(`Auto-link: unsupported provider "${providerName}"`);
  return undefined;
}

// ============================================================================
// Route Factory
// ============================================================================

export function createWorkflowRoutes(services: Services) {
  const { api } = services;
  const app = new Hono();

  // ==========================================================================
  // Workflow Routes
  // ==========================================================================

  /**
   * GET /api/workflows - List all workflows
   */
  app.get('/api/workflows', async (c) => {
    try {
      const status = c.req.query('status');
      const playbookId = c.req.query('playbookId');
      const ephemeralParam = c.req.query('ephemeral');
      const limitParam = c.req.query('limit');

      // Get all workflows using generic list
      const allWorkflows = await api.list<Workflow>({ type: 'workflow' });

      // Apply filters
      let workflows = allWorkflows;

      if (status) {
        if (status === 'active') {
          workflows = workflows.filter((w: Workflow) => w.status === 'pending' || w.status === 'running');
        } else if (status === 'terminal') {
          workflows = workflows.filter((w: Workflow) => ['completed', 'failed', 'cancelled'].includes(w.status));
        } else {
          workflows = workflows.filter((w: Workflow) => w.status === status);
        }
      }

      if (playbookId) {
        workflows = workflows.filter((w: Workflow) => w.playbookId === playbookId);
      }

      if (ephemeralParam !== undefined) {
        const isEphemeral = ephemeralParam === 'true';
        workflows = workflows.filter((w: Workflow) => w.ephemeral === isEphemeral);
      }

      // Sort by createdAt descending (newest first)
      workflows = [...workflows].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Apply limit
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      if (limit && limit > 0) {
        workflows = workflows.slice(0, limit);
      }

      const response: WorkflowsResponse = {
        workflows: workflows.map(formatWorkflowResponse),
        total: allWorkflows.length,
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error listing workflows:', error);
      return c.json({ error: { code: 'LIST_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * GET /api/workflows/:id - Get a single workflow
   */
  app.get('/api/workflows/:id', async (c) => {
    try {
      const workflowId = c.req.param('id') as WorkflowId;
      const workflow = await api.get<Workflow>(workflowId as ElementId);

      if (!workflow) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
      }

      const response: WorkflowResponse = {
        workflow: formatWorkflowResponse(workflow),
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error getting workflow:', error);
      return c.json({ error: { code: 'GET_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * GET /api/workflows/:id/tasks - Get tasks in a workflow with progress stats
   * Returns all tasks belonging to the workflow along with progress metrics
   *
   * TB-O35: Workflow Progress Dashboard
   */
  app.get('/api/workflows/:id/tasks', async (c) => {
    try {
      const workflowId = c.req.param('id') as WorkflowId;

      // Verify workflow exists
      const workflow = await api.get<Workflow>(workflowId as ElementId);
      if (!workflow) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
      }

      // Get all dependencies to find tasks in workflow
      // Tasks are linked to workflows via parent-child dependencies
      const allDependencies = await api.getDependents(workflowId as ElementId, [DependencyType.PARENT_CHILD]);

      // Task IDs are the blockedIds of parent-child deps pointing to workflow
      const taskIds = allDependencies.map(d => d.blockedId);

      // Fetch all tasks
      const tasks: Task[] = [];
      for (const taskId of taskIds) {
        const task = await api.get<Task>(taskId);
        if (task && task.type === 'task') {
          tasks.push(task);
        }
      }

      // Get inter-task dependencies (blocks relationships)
      const taskIdSet = new Set(taskIds);
      const internalDependencies: { blockedId: ElementId; blockerId: ElementId; type: string }[] = [];

      for (const taskId of taskIds) {
        const taskDeps = await api.getDependencies(taskId, [DependencyType.BLOCKS]);
        for (const dep of taskDeps) {
          // Only include if both blocked and blocker are in the workflow
          if (taskIdSet.has(dep.blockerId)) {
            internalDependencies.push({
              blockedId: dep.blockedId,
              blockerId: dep.blockerId,
              type: dep.type,
            });
          }
        }
      }

      // Calculate progress stats
      const completed = tasks.filter(t => t.status === 'closed').length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const blocked = tasks.filter(t => t.status === 'blocked').length;
      const open = tasks.filter(t => t.status === 'open').length;
      const total = tasks.length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      const response: WorkflowTasksResponse = {
        tasks,
        total,
        progress: {
          total,
          completed,
          inProgress,
          blocked,
          open,
          percentage,
        },
        dependencies: internalDependencies,
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error getting workflow tasks:', error);
      return c.json({ error: { code: 'GET_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * POST /api/workflows - Create a new workflow
   */
  app.post('/api/workflows', async (c) => {
    try {
      const body = await c.req.json();
      const { title, descriptionRef, playbookId, ephemeral, variables, tags } = body;

      if (!title) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } }, 400);
      }

      // Get system entity for createdBy
      const systemEntity = await api.lookupEntityByName('system');
      const createdBy = (systemEntity?.id ?? 'system') as EntityId;

      const workflow = await createWorkflow({
        title,
        descriptionRef,
        playbookId: playbookId as PlaybookId | undefined,
        ephemeral: ephemeral ?? false,
        variables: variables ?? {},
        tags: tags ?? [],
        createdBy,
      });

      // Save the workflow using create
      const savedWorkflow = await api.create<Workflow>({
        ...workflow,
      });

      const response: WorkflowResponse = {
        workflow: formatWorkflowResponse(savedWorkflow),
      };

      return c.json(response, 201);
    } catch (error) {
      logger.error('Error creating workflow:', error);
      return c.json({ error: { code: 'CREATE_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * PATCH /api/workflows/:id - Update a workflow
   */
  app.patch('/api/workflows/:id', async (c) => {
    try {
      const workflowId = c.req.param('id') as WorkflowId;
      const body = await c.req.json();
      const { status, failureReason, cancelReason } = body;

      const workflow = await api.get<Workflow>(workflowId as ElementId);
      if (!workflow) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
      }

      let updatedWorkflow = workflow;

      if (status) {
        updatedWorkflow = updateWorkflowStatus(updatedWorkflow, {
          status: status as WorkflowStatus,
          failureReason,
          cancelReason,
        });
      }

      // Save the updated workflow
      const savedWorkflow = await api.update<Workflow>(workflowId as ElementId, updatedWorkflow);

      const response: WorkflowResponse = {
        workflow: formatWorkflowResponse(savedWorkflow),
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error updating workflow:', error);
      return c.json({ error: { code: 'UPDATE_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * POST /api/workflows/:id/start - Start a workflow (transition to running)
   */
  app.post('/api/workflows/:id/start', async (c) => {
    try {
      const workflowId = c.req.param('id') as WorkflowId;

      const workflow = await api.get<Workflow>(workflowId as ElementId);
      if (!workflow) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
      }

      if (workflow.status !== 'pending') {
        return c.json({
          error: { code: 'INVALID_STATUS', message: `Cannot start workflow in status '${workflow.status}'` }
        }, 400);
      }

      const updatedWorkflow = updateWorkflowStatus(workflow, { status: WorkflowStatus.RUNNING });
      const savedWorkflow = await api.update<Workflow>(workflowId as ElementId, updatedWorkflow);

      const response: WorkflowResponse = {
        workflow: formatWorkflowResponse(savedWorkflow),
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error starting workflow:', error);
      return c.json({ error: { code: 'START_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * POST /api/workflows/:id/cancel - Cancel a workflow
   */
  app.post('/api/workflows/:id/cancel', async (c) => {
    try {
      const workflowId = c.req.param('id') as WorkflowId;
      const body = await c.req.json().catch(() => ({}));
      const { reason } = body;

      const workflow = await api.get<Workflow>(workflowId as ElementId);
      if (!workflow) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
      }

      if (['completed', 'failed', 'cancelled'].includes(workflow.status)) {
        return c.json({
          error: { code: 'INVALID_STATUS', message: `Cannot cancel workflow in status '${workflow.status}'` }
        }, 400);
      }

      const updatedWorkflow = updateWorkflowStatus(workflow, {
        status: WorkflowStatus.CANCELLED,
        cancelReason: reason,
      });
      const savedWorkflow = await api.update<Workflow>(workflowId as ElementId, updatedWorkflow);

      const response: WorkflowResponse = {
        workflow: formatWorkflowResponse(savedWorkflow),
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error cancelling workflow:', error);
      return c.json({ error: { code: 'CANCEL_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * DELETE /api/workflows/:id - Delete a workflow
   */
  app.delete('/api/workflows/:id', async (c) => {
    try {
      const workflowId = c.req.param('id') as WorkflowId;

      const workflow = await api.get<Workflow>(workflowId as ElementId);
      if (!workflow) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
      }

      await api.delete(workflowId as ElementId);

      return c.json({ success: true });
    } catch (error) {
      logger.error('Error deleting workflow:', error);
      return c.json({ error: { code: 'DELETE_ERROR', message: String(error) } }, 500);
    }
  });

  // ==========================================================================
  // Playbook Routes
  // ==========================================================================

  /**
   * GET /api/playbooks - List all playbooks
   */
  app.get('/api/playbooks', async (c) => {
    try {
      const nameFilter = c.req.query('name');
      const limitParam = c.req.query('limit');

      // Get all playbooks using generic list
      let playbooks = await api.list<Playbook>({ type: 'playbook' });

      // Apply name filter (case-insensitive partial match)
      if (nameFilter) {
        const lowerFilter = nameFilter.toLowerCase();
        playbooks = playbooks.filter((p: Playbook) =>
          p.name.toLowerCase().includes(lowerFilter) ||
          p.title.toLowerCase().includes(lowerFilter)
        );
      }

      // Sort by name ascending
      playbooks = [...playbooks].sort((a, b) => a.name.localeCompare(b.name));

      // Apply limit
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      if (limit && limit > 0) {
        playbooks = playbooks.slice(0, limit);
      }

      const response: PlaybooksResponse = {
        playbooks: playbooks.map(formatPlaybookResponse),
        total: playbooks.length,
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error listing playbooks:', error);
      return c.json({ error: { code: 'LIST_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * GET /api/playbooks/:id - Get a single playbook
   */
  app.get('/api/playbooks/:id', async (c) => {
    try {
      const playbookId = c.req.param('id') as PlaybookId;
      const playbook = await api.get<Playbook>(playbookId as ElementId);

      if (!playbook) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404);
      }

      const response: PlaybookResponse = {
        playbook: formatPlaybookResponse(playbook),
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error getting playbook:', error);
      return c.json({ error: { code: 'GET_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * POST /api/playbooks - Create a new playbook
   */
  app.post('/api/playbooks', async (c) => {
    try {
      const body = await c.req.json();
      const { name, title, descriptionRef, steps, variables, extends: extendsArr, tags } = body;

      if (!name) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }, 400);
      }

      if (!title) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } }, 400);
      }

      // Get system entity for createdBy
      const systemEntity = await api.lookupEntityByName('system');
      const createdBy = (systemEntity?.id ?? 'system') as EntityId;

      const playbook = await createPlaybook({
        name,
        title,
        descriptionRef,
        steps: steps ?? [],
        variables: variables ?? [],
        extends: extendsArr,
        tags: tags ?? [],
        createdBy,
      });

      // Save the playbook using create
      const savedPlaybook = await api.create<Playbook>({
        ...playbook,
      });

      const response: PlaybookResponse = {
        playbook: formatPlaybookResponse(savedPlaybook),
      };

      return c.json(response, 201);
    } catch (error) {
      logger.error('Error creating playbook:', error);
      return c.json({ error: { code: 'CREATE_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * PATCH /api/playbooks/:id - Update a playbook
   */
  app.patch('/api/playbooks/:id', async (c) => {
    try {
      const playbookId = c.req.param('id') as PlaybookId;
      const body = await c.req.json();
      const { title, steps, variables, extends: extendsArr, descriptionRef, tags } = body;

      const playbook = await api.get<Playbook>(playbookId as ElementId);
      if (!playbook) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404);
      }

      const updatedPlaybook = updatePlaybook(playbook, {
        title,
        steps,
        variables,
        extends: extendsArr,
        descriptionRef,
        tags,
      });

      // Save the updated playbook
      const savedPlaybook = await api.update<Playbook>(playbookId as ElementId, updatedPlaybook);

      const response: PlaybookResponse = {
        playbook: formatPlaybookResponse(savedPlaybook),
      };

      return c.json(response);
    } catch (error) {
      logger.error('Error updating playbook:', error);
      return c.json({ error: { code: 'UPDATE_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * DELETE /api/playbooks/:id - Delete a playbook
   */
  app.delete('/api/playbooks/:id', async (c) => {
    try {
      const playbookId = c.req.param('id') as PlaybookId;

      const playbook = await api.get<Playbook>(playbookId as ElementId);
      if (!playbook) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404);
      }

      await api.delete(playbookId as ElementId);

      return c.json({ success: true });
    } catch (error) {
      logger.error('Error deleting playbook:', error);
      return c.json({ error: { code: 'DELETE_ERROR', message: String(error) } }, 500);
    }
  });

  /**
   * POST /api/playbooks/:id/instantiate - Instantiate a playbook as a workflow
   * Creates a new workflow and its associated tasks from the playbook template
   *
   * TB-O34: Instantiate Workflow from Playbook
   */
  app.post('/api/playbooks/:id/instantiate', async (c) => {
    try {
      const playbookId = c.req.param('id') as PlaybookId;
      const body = await c.req.json().catch(() => ({}));
      const { title: customTitle, variables: providedVariables, ephemeral } = body;

      const playbook = await api.get<Playbook>(playbookId as ElementId);
      if (!playbook) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404);
      }

      // Get system entity for createdBy
      const systemEntity = await api.lookupEntityByName('system');
      const createdBy = (systemEntity?.id ?? 'system') as EntityId;

      // Use createWorkflowFromPlaybook from @stoneforge/core to instantiate
      // workflow, tasks, and dependencies from playbook
      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: providedVariables ?? {},
        createdBy,
        title: customTitle,
        ephemeral: ephemeral ?? false,
        tags: [...playbook.tags, 'instantiated'],
      });

      // Save the workflow
      const savedWorkflow = await api.create<Workflow>({
        ...createResult.workflow,
      });

      // Save all tasks
      const savedTasks: Task[] = [];
      for (const createdTask of createResult.tasks) {
        const savedTask = await api.create<Task>({
          ...createdTask.task,
        });
        savedTasks.push(savedTask);
      }

      // Save all dependencies (both blocks and parent-child)
      const allDependencies = [
        ...createResult.blocksDependencies,
        ...createResult.parentChildDependencies,
      ];
      for (const dep of allDependencies) {
        await api.addDependency({
          blockedId: dep.blockedId,
          blockerId: dep.blockerId,
          type: dep.type,
          actor: createdBy,
        });
      }

      logger.info(
        `Instantiated playbook ${playbook.name}: workflow=${savedWorkflow.id}, tasks=${savedTasks.length}, dependencies=${allDependencies.length}, skipped=${createResult.skippedSteps.length}`
      );

      // Auto-link each created task to external provider if configured
      const autoLink = getValue('externalSync.autoLink') as boolean;
      const autoLinkProvider = getValue('externalSync.autoLinkProvider') as string | undefined;

      if (autoLink && autoLinkProvider && savedTasks.length > 0) {
        try {
          const provider = createAutoLinkProvider(autoLinkProvider, services);
          if (provider) {
            const providerConfig = services.settingsService.getProviderConfig(autoLinkProvider);
            const project = providerConfig?.defaultProject;
            const direction = (getValue('externalSync.defaultDirection') ?? 'bidirectional') as SyncDirection;

            if (project) {
              let linked = 0;
              for (const savedTask of savedTasks) {
                const linkResult = await autoLinkTask({
                  task: savedTask,
                  api,
                  provider,
                  project,
                  direction,
                });
                if (linkResult.success) {
                  linked++;
                } else {
                  logger.warn(
                    `Auto-link failed for workflow task ${savedTask.id}: ${linkResult.error}`
                  );
                }
              }
              if (linked > 0) {
                logger.info(
                  `Auto-linked ${linked}/${savedTasks.length} workflow tasks to ${autoLinkProvider}`
                );
              }
            } else {
              logger.warn(
                `Auto-link skipped: provider "${autoLinkProvider}" has no default project configured`
              );
            }
          }
        } catch (autoLinkErr) {
          // Auto-link failures must never break workflow instantiation
          logger.warn('Auto-link error during workflow instantiation:', autoLinkErr);
        }
      }

      const response: WorkflowResponse = {
        workflow: formatWorkflowResponse(savedWorkflow),
      };

      return c.json(response, 201);
    } catch (error) {
      logger.error('Error instantiating playbook:', error);
      return c.json({ error: { code: 'INSTANTIATE_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
