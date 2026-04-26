import {
  cloneAgent,
  cloneRoleDefinition,
  cloneRuntime,
} from "@stoneforge/core";
import type { Workspace } from "@stoneforge/workspace";

import {
  asDispatchIntentId,
  asTaskId,
} from "./ids.js";
import type { TaskId } from "./ids.js";
import {
  cloneDispatchIntent,
  cloneTask,
  cloneWorkspaceCapabilities,
} from "./cloning.js";
import type { ExecutionState } from "./execution-state.js";
import type {
  CreateMergeRequestDispatchIntentInput,
  CreateTaskInput,
  DispatchIntent,
  Task,
  UpdateTaskInput,
  WorkspaceExecutionCapabilities,
} from "./models.js";
import {
  applyTaskUpdate,
  createMergeRequestDispatchIntentRecord,
  createTaskDispatchIntentRecord,
  createTaskRecord,
} from "./task-records.js";
import { isTaskDispatchable } from "./task-readiness.js";

export class TaskLifecycle {
  constructor(private readonly state: ExecutionState) {}

  configureWorkspace(workspace: Workspace): WorkspaceExecutionCapabilities {
    if (workspace.state !== "ready") {
      throw new Error(
        `Workspace ${workspace.id} must be ready before task dispatch is configured.`,
      );
    }

    const capabilities: WorkspaceExecutionCapabilities = {
      workspaceId: workspace.id,
      runtimes: workspace.runtimes.map(cloneRuntime),
      agents: workspace.agents.map(cloneAgent),
      roleDefinitions: workspace.roleDefinitions.map(cloneRoleDefinition),
    };

    this.state.workspaces.set(workspace.id, capabilities);

    return cloneWorkspaceCapabilities(capabilities);
  }

  createTask(input: CreateTaskInput): Task {
    this.state.requireWorkspace(input.workspaceId);

    const now = this.state.now();
    const task = createTaskRecord(
      asTaskId(this.state.nextId("task")),
      input,
      now,
    );

    this.state.tasks.set(task.id, task);
    this.evaluateTaskReadiness(task);

    return cloneTask(task);
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput): Task {
    const task = this.state.requireTask(taskId);

    applyTaskUpdate(task, input);
    task.updatedAt = this.state.now();
    this.evaluateTaskReadiness(task);

    return cloneTask(task);
  }

  createMergeRequestDispatchIntent(
    input: CreateMergeRequestDispatchIntentInput,
  ): DispatchIntent {
    this.state.requireWorkspace(input.workspaceId);
    this.state.mergeRequestContexts.set(input.mergeRequest.id, {
      ...input.mergeRequest,
    });

    const existingIntent = this.findOpenMergeRequestIntent(input);

    if (existingIntent) {
      return cloneDispatchIntent(existingIntent);
    }

    const now = this.state.now();
    const intent = createMergeRequestDispatchIntentRecord(
      asDispatchIntentId(this.state.nextId("dispatchIntent")),
      input,
      now,
    );

    this.state.dispatchIntents.set(intent.id, intent);

    return cloneDispatchIntent(intent);
  }

  requireTaskRepair(taskId: TaskId, reason: string): Task {
    const task = this.state.requireTask(taskId);

    if (task.state === "completed" || task.state === "canceled") {
      throw new Error(`Task ${taskId} cannot require repair from state ${task.state}.`);
    }

    task.progressRecord.repairContext.push(reason);
    task.state = "repair_required";
    task.updatedAt = this.state.now();
    this.evaluateTaskReadiness(task);

    return cloneTask(task);
  }

  completeTaskAfterMerge(taskId: TaskId): Task {
    const task = this.state.requireTask(taskId);

    task.state = "completed";
    task.updatedAt = this.state.now();

    return cloneTask(task);
  }

  evaluateTaskReadiness(task: Task): void {
    if (isTerminalTaskState(task)) {
      return;
    }

    if (!this.canDispatchTask(task)) {
      if (task.state === "ready") {
        task.state = "planned";
      }

      return;
    }

    task.state = "ready";
    task.updatedAt = this.state.now();
    this.ensureDispatchIntentForTask(task);
  }

  hasActiveWork(taskId: TaskId): boolean {
    return Array.from(this.state.assignments.values()).some((assignment) => {
      return (
        assignment.owner.type === "task" &&
        assignment.owner.taskId === taskId &&
        (assignment.state === "created" ||
          assignment.state === "running" ||
          assignment.state === "resume_pending")
      );
    });
  }

  ensureDispatchIntentForTask(task: Task): DispatchIntent {
    const existingIntent = this.findOpenTaskIntent(task);

    if (existingIntent) {
      return existingIntent;
    }

    const now = this.state.now();
    const intent = createTaskDispatchIntentRecord(
      asDispatchIntentId(this.state.nextId("dispatchIntent")),
      task,
      now,
    );

    this.state.dispatchIntents.set(intent.id, intent);

    return intent;
  }

  private canDispatchTask(task: Task): boolean {
    return isTaskDispatchable(task, {
      getTask: (taskId) => this.state.tasks.get(taskId),
      getWorkspace: (workspaceId) => this.state.workspaces.get(workspaceId),
      hasActiveWork: (taskId) => this.hasActiveWork(taskId),
    });
  }

  private findOpenTaskIntent(task: Task): DispatchIntent | undefined {
    return Array.from(this.state.dispatchIntents.values()).find((intent) => {
      return (
        intent.taskId === task.id &&
        intent.action === "implement" &&
        isOpenIntent(intent)
      );
    });
  }

  private findOpenMergeRequestIntent(
    input: CreateMergeRequestDispatchIntentInput,
  ): DispatchIntent | undefined {
    return Array.from(this.state.dispatchIntents.values()).find((intent) => {
      return (
        intent.targetType === "merge_request" &&
        intent.mergeRequestId === input.mergeRequest.id &&
        intent.action === input.action &&
        isOpenIntent(intent)
      );
    });
  }
}

function isTerminalTaskState(task: Task): boolean {
  return ["draft", "completed", "canceled", "human_review_required"].includes(
    task.state,
  );
}

function isOpenIntent(intent: DispatchIntent): boolean {
  return !["completed", "escalated", "canceled"].includes(intent.state);
}
