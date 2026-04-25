import type { Assignment, Task, TaskId } from "@stoneforge/execution";
import { type TaskDispatchService } from "@stoneforge/execution";

import type {
  GitHubMergeRequestAdapter,
  OpenTaskMergeRequestInput,
} from "./models.js";

export type SucceededTaskAssignment = Assignment & {
  owner: {
    type: "task";
    taskId: TaskId;
  };
  state: "succeeded";
};

type TaskPullRequestInput = Parameters<
  GitHubMergeRequestAdapter["createOrUpdateTaskPullRequest"]
>[0];

export function requireSucceededTaskAssignment(
  execution: TaskDispatchService,
  input: OpenTaskMergeRequestInput,
): SucceededTaskAssignment {
  const assignment = execution.getAssignment(input.taskAssignmentId);

  if (assignment.owner.type !== "task") {
    throw new Error(
      `Assignment ${assignment.id} is not a Task-owned implementation Assignment.`,
    );
  }

  if (assignment.state !== "succeeded") {
    throw new Error(
      `Assignment ${assignment.id} must succeed before opening a task MergeRequest.`,
    );
  }

  return assignment as SucceededTaskAssignment;
}

export function requireTaskAwaitingMergeRequest(
  execution: TaskDispatchService,
  assignment: SucceededTaskAssignment,
): Task {
  const task = execution.getTask(assignment.owner.taskId);

  if (!task.requiresMergeRequest || task.state !== "awaiting_review") {
    throw new Error(
      `Task ${task.id} is not waiting for a task MergeRequest.`,
    );
  }

  return task;
}

export function createTaskPullRequestInput(
  task: Task,
  targetBranch: string,
): TaskPullRequestInput {
  return {
    workspaceId: task.workspaceId,
    taskId: task.id,
    title: task.title,
    body: task.intent,
    sourceBranch: `stoneforge/task/${task.id}`,
    targetBranch,
  };
}
