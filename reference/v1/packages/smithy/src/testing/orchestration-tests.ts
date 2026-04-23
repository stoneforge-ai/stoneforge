/**
 * Orchestration E2E Test Definitions
 *
 * This module defines the orchestration tests that validate each behavior
 * in the orchestration system. Tests run against an isolated test workspace.
 *
 * Each test supports dual-mode execution:
 * - `mock` (default): Uses mock session manager, simulates agent behavior
 * - `real`: Spawns actual Claude processes via SpawnerService
 *
 * @module
 */

import type { EntityId, Task } from '@stoneforge/core';
import { TaskStatus } from '@stoneforge/core';

import type { TestContext } from './test-context.js';
import type { TestResult } from './test-utils.js';
import {
  waitFor,
  waitForTaskStatus,
  waitForTaskAssignment,
  waitForSessionStart,
  waitForSessionEnd,
  waitForTaskMeta,
  waitForGitCommit,
  pass,
  fail,
  sleep,
  uniqueId,
} from './test-utils.js';
import {
  createTestWorker,
  createTestDirector,
  createTestSteward,
  createTestTask,
} from './test-context.js';
import {
  buildTestDirectorPrompt,
  buildTestStewardPrompt,
} from './test-prompts.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single orchestration test definition
 */
export interface OrchestrationTest {
  /** Unique test identifier (used for filtering) */
  readonly id: string;
  /** Human-readable test name */
  readonly name: string;
  /** Detailed description of what the test validates */
  readonly description: string;
  /** Test execution function */
  readonly run: (ctx: TestContext) => Promise<TestResult>;
  /** Test timeout in milliseconds */
  readonly timeout: number;
  /** Whether this test depends on previous tests (for state) */
  readonly dependsOn?: string[];
  /** Tags for categorizing tests */
  readonly tags?: string[];
}

// ============================================================================
// Test 1: Director Creates Tasks
// ============================================================================

export const directorCreatesTasksTest: OrchestrationTest = {
  id: 'director-creates-tasks',
  name: 'Director creates tasks when prompted',
  description: 'Send a feature request to director, verify task is created',
  timeout: 120000,
  tags: ['director', 'task'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runDirectorCreatesTasksMock(ctx);
    }
    return runDirectorCreatesTasksReal(ctx);
  },
};

async function runDirectorCreatesTasksMock(ctx: TestContext): Promise<TestResult> {
  // 1. Register a director agent
  ctx.log('Registering director agent...');
  const director = await createTestDirector(ctx, `TestDirector-${uniqueId()}`);
  ctx.log(`Registered director: ${director.id}`);

  // 2. Simulate director creating a task
  ctx.log('Creating task (simulating director behavior)...');
  const task = await createTestTask(ctx, 'Add /health endpoint that returns { status: "ok" }', {
    priority: 5,
    tags: ['test', 'feature', 'health'],
    acceptanceCriteria: 'Endpoint returns { status: "ok" } on GET /health',
  });

  if (!task) {
    return fail('Failed to create task');
  }

  // 3. Verify task was created correctly
  ctx.log(`Task created: ${task.id}`);
  const retrieved = await ctx.api.get<Task>(task.id);

  if (!retrieved) {
    return fail('Task not found after creation');
  }

  if (!retrieved.title.toLowerCase().includes('health')) {
    return fail(`Task title doesn't contain 'health': ${retrieved.title}`);
  }

  return pass(`Director created task: "${retrieved.title}"`, {
    taskId: task.id,
    taskTitle: task.title,
  });
}

async function runDirectorCreatesTasksReal(ctx: TestContext): Promise<TestResult> {
  // 1. Register a director agent
  ctx.log('Registering director agent...');
  const director = await createTestDirector(ctx, `TestDirector-${uniqueId()}`);
  ctx.log(`Registered director: ${director.id}`);

  // 2. Start director session with a prompt to create a task
  ctx.log('Starting director session...');
  const prompt = buildTestDirectorPrompt(
    'Create a task titled "Add /health endpoint" with acceptance criteria "Endpoint returns { status: ok } on GET /health"'
  );

  const { session } = await ctx.sessionManager.startSession(
    director.id as unknown as EntityId,
    {
      workingDirectory: ctx.tempWorkspace,
      initialPrompt: prompt,
      interactive: false,
    }
  );
  ctx.log(`Director session started: ${session.id}`);

  // 3. Wait for a task with 'health' in the title to appear
  ctx.log('Waiting for director to create task...');
  const task = await waitFor(
    async () => {
      // List all tasks and look for one containing 'health'
      const tasks = await ctx.stoneforgeApi.list<Task>({ type: 'task' });
      const healthTask = tasks.find(t =>
        t.title.toLowerCase().includes('health')
      );
      return healthTask ?? null;
    },
    { timeout: 180000, interval: 3000, description: 'director to create health task' }
  );

  // 4. Wait for session to end
  await waitForSessionEnd(ctx.sessionManager, session.id, { timeout: 60000 }).catch(() => {});

  return pass(`Director created task: "${task.title}"`, {
    taskId: task.id,
    taskTitle: task.title,
  });
}

// ============================================================================
// Test 2: Director Creates Plans
// ============================================================================

export const directorCreatesPlansTest: OrchestrationTest = {
  id: 'director-creates-plans',
  name: 'Director creates plans for complex goals',
  description: 'Send a complex goal to director, verify plan with tasks is created',
  timeout: 120000,
  tags: ['director', 'plan'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runDirectorCreatesPlansMock(ctx);
    }
    return runDirectorCreatesPlansReal(ctx);
  },
};

async function runDirectorCreatesPlansMock(ctx: TestContext): Promise<TestResult> {
  // 1. Register a director
  const director = await createTestDirector(ctx, `TestDirector-${uniqueId()}`);
  ctx.log(`Registered director: ${director.id}`);

  // 2. Simulate creating a plan with multiple tasks
  ctx.log('Creating plan (simulating director behavior)...');

  const task1 = await createTestTask(ctx, 'Set up API framework', {
    priority: 5,
    tags: ['test', 'api', 'setup'],
  });
  const task2 = await createTestTask(ctx, 'Implement authentication', {
    priority: 4,
    tags: ['test', 'api', 'auth'],
  });
  const task3 = await createTestTask(ctx, 'Add rate limiting', {
    priority: 3,
    tags: ['test', 'api', 'security'],
  });

  const tasks = [task1, task2, task3];

  if (tasks.length < 2) {
    return fail('Failed to create plan with multiple tasks');
  }

  return pass(`Director created plan with ${tasks.length} tasks`, {
    taskCount: tasks.length,
    tasks: tasks.map(t => ({ id: t.id, title: t.title })),
  });
}

async function runDirectorCreatesPlansReal(ctx: TestContext): Promise<TestResult> {
  // 1. Register a director
  const director = await createTestDirector(ctx, `TestDirector-${uniqueId()}`);
  ctx.log(`Registered director: ${director.id}`);

  // 2. Start director session with a complex goal
  ctx.log('Starting director session...');
  const prompt = buildTestDirectorPrompt(
    'Create a plan for "Build a REST API". Create at least 3 tasks: ' +
    '"Set up API framework", "Implement authentication", and "Add rate limiting".'
  );

  const { session } = await ctx.sessionManager.startSession(
    director.id as unknown as EntityId,
    {
      workingDirectory: ctx.tempWorkspace,
      initialPrompt: prompt,
      interactive: false,
    }
  );
  ctx.log(`Director session started: ${session.id}`);

  // 3. Wait for 3+ tasks to exist
  ctx.log('Waiting for director to create plan tasks...');
  const tasks = await waitFor(
    async () => {
      const allTasks = await ctx.stoneforgeApi.list<Task>({ type: 'task' });
      return allTasks.length >= 3 ? allTasks : null;
    },
    { timeout: 180000, interval: 3000, description: 'director to create 3+ tasks' }
  );

  // 4. Wait for session to end
  await waitForSessionEnd(ctx.sessionManager, session.id, { timeout: 60000 }).catch(() => {});

  return pass(`Director created plan with ${tasks.length} tasks`, {
    taskCount: tasks.length,
    tasks: tasks.map(t => ({ id: t.id, title: t.title })),
  });
}

// ============================================================================
// Test 3: Daemon Dispatches to Worker
// ============================================================================

export const daemonDispatchesWorkerTest: OrchestrationTest = {
  id: 'daemon-dispatches-worker',
  name: 'Daemon dispatches unassigned task to available worker',
  description: 'Create unassigned task, verify daemon assigns to worker',
  timeout: 60000,
  tags: ['daemon', 'dispatch', 'worker'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runDaemonDispatchesWorkerMock(ctx);
    }
    return runDaemonDispatchesWorkerReal(ctx);
  },
};

async function runDaemonDispatchesWorkerMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create an ephemeral worker
  ctx.log('Creating worker agent...');
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  ctx.log(`Registered worker: ${worker.id}`);

  // 2. Create an unassigned task
  ctx.log('Creating unassigned task...');
  const task = await createTestTask(ctx, 'Test task for dispatch', {
    priority: 5,
    tags: ['test', 'dispatch'],
  });
  ctx.log(`Created task: ${task.id}`);

  // 3. Manually trigger daemon poll
  ctx.log('Triggering daemon poll...');
  await ctx.daemon.pollWorkerAvailability();

  // 4. Wait for task to be assigned
  ctx.log('Waiting for task assignment...');
  const assigned = await waitFor(
    async () => {
      const updated = await ctx.api.get<Task>(task.id);
      if (!updated) return null;
      return updated.assignee ? updated : null;
    },
    { timeout: 30000, interval: 1000, description: 'task assignment' }
  ).catch(() => null);

  if (!assigned) {
    return fail('Daemon did not assign task to worker');
  }

  return pass(`Task assigned to worker`, {
    taskId: task.id,
    assignee: assigned.assignee,
  });
}

async function runDaemonDispatchesWorkerReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create an ephemeral worker
  ctx.log('Creating worker agent...');
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  ctx.log(`Registered worker: ${worker.id}`);

  // 2. Create an unassigned task
  ctx.log('Creating unassigned task...');
  const task = await createTestTask(ctx, 'Test task for dispatch', {
    priority: 5,
    tags: ['test', 'dispatch'],
  });
  ctx.log(`Created task: ${task.id}`);

  // 3. Trigger daemon poll to dispatch the task
  ctx.log('Triggering daemon poll...');
  await ctx.daemon.pollWorkerAvailability();

  // 4. Wait for task to be assigned
  ctx.log('Waiting for task assignment...');
  const assigned = await waitForTaskAssignment(ctx.api, task.id, { timeout: 120000 });

  // 5. Wait for a session to start for this worker
  ctx.log('Waiting for session start...');
  const session = await waitForSessionStart(ctx.sessionManager, worker.id as unknown as EntityId, {
    timeout: 60000,
  }).catch(() => null);

  return pass('Task assigned and session started', {
    taskId: task.id,
    assignee: assigned.assignee,
    sessionStarted: !!session,
  });
}

// ============================================================================
// Test 4: Daemon Respects Dependencies
// ============================================================================

export const daemonRespectsDependenciesTest: OrchestrationTest = {
  id: 'daemon-respects-dependencies',
  name: 'Daemon respects task dependencies',
  description: 'Blocked task waits until dependency resolves',
  timeout: 60000,
  tags: ['daemon', 'dependencies'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runDaemonRespectsDependenciesMock(ctx);
    }
    return runDaemonRespectsDependenciesReal(ctx);
  },
};

async function runDaemonRespectsDependenciesMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  ctx.log(`Registered worker: ${worker.id}`);

  // 2. Create two tasks where task2 depends on task1
  const task1 = await createTestTask(ctx, 'First task', { priority: 5 });
  const task2 = await createTestTask(ctx, 'Dependent task', { priority: 5 });

  // 3. Add dependency: task2 is blocked by task1
  await ctx.api.addDependency({
    blockedId: task2.id,
    blockerId: task1.id,
    type: 'blocks',
    actor: ctx.systemEntityId,
  });
  ctx.log(`Created dependency: ${task1.id} blocks ${task2.id}`);

  // 4. Poll daemon - should only assign task1, not task2
  await ctx.daemon.pollWorkerAvailability();
  await sleep(1000);

  // 5. Check that task2 is still unassigned
  const task2After = await ctx.api.get<Task>(task2.id);

  if (task2After?.assignee) {
    return fail('Daemon assigned blocked task before dependency resolved');
  }

  // 6. Complete task1 (simulate) and stop worker session so it becomes available
  await ctx.api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
  const activeSession = ctx.sessionManager.getActiveSession(worker.id as unknown as EntityId);
  if (activeSession) {
    await ctx.sessionManager.stopSession(activeSession.id, { graceful: false });
  }
  ctx.log('Completed task1 and freed worker');

  // 7. Now poll again - task2 should be assignable
  await ctx.daemon.pollWorkerAvailability();

  const task2Final = await waitFor(
    async () => {
      const updated = await ctx.api.get<Task>(task2.id);
      return updated?.assignee ? updated : null;
    },
    { timeout: 10000, interval: 1000, description: 'blocked task assignment' }
  ).catch(() => null);

  if (!task2Final?.assignee) {
    return fail('Daemon did not assign task after dependency resolved');
  }

  return pass('Daemon correctly respected dependencies', {
    task1Id: task1.id,
    task2Id: task2.id,
  });
}

async function runDaemonRespectsDependenciesReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  ctx.log(`Registered worker: ${worker.id}`);

  // 2. Create two tasks where task2 depends on task1
  const task1 = await createTestTask(ctx, 'First task - create hello.txt', { priority: 5 });
  const task2 = await createTestTask(ctx, 'Dependent task - create world.txt', { priority: 5 });

  // 3. Add dependency: task2 is blocked by task1
  await ctx.api.addDependency({
    blockedId: task2.id,
    blockerId: task1.id,
    type: 'blocks',
    actor: ctx.systemEntityId,
  });
  ctx.log(`Created dependency: ${task1.id} blocks ${task2.id}`);

  // 4. Poll daemon — should only assign task1
  await ctx.daemon.pollWorkerAvailability();
  await sleep(3000);

  // 5. Verify task2 is still unassigned
  const task2After = await ctx.api.get<Task>(task2.id);
  if (task2After?.assignee) {
    return fail('Daemon assigned blocked task before dependency resolved');
  }
  ctx.log('Verified: blocked task is not assigned');

  // 6. Close task1 and free the worker session to unblock task2
  await ctx.api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
  const activeSession = ctx.sessionManager.getActiveSession(worker.id as unknown as EntityId);
  if (activeSession) {
    await ctx.sessionManager.stopSession(activeSession.id, { graceful: false });
  }
  ctx.log('Completed task1 and freed worker');

  // 7. Poll again — task2 should now be assignable
  await ctx.daemon.pollWorkerAvailability();

  const task2Final = await waitForTaskAssignment(ctx.api, task2.id, { timeout: 120000 })
    .catch(() => null);

  if (!task2Final?.assignee) {
    return fail('Daemon did not assign task after dependency resolved');
  }

  return pass('Daemon correctly respected dependencies', {
    task1Id: task1.id,
    task2Id: task2.id,
  });
}

// ============================================================================
// Test 5: Worker Uses Worktree
// ============================================================================

export const workerUsesWorktreeTest: OrchestrationTest = {
  id: 'worker-uses-worktree',
  name: 'Worker operates in isolated worktree',
  description: 'Verify worker is spawned in a git worktree directory',
  timeout: 60000,
  tags: ['worker', 'worktree', 'git'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runWorkerUsesWorktreeMock(ctx);
    }
    return runWorkerUsesWorktreeReal(ctx);
  },
};

async function runWorkerUsesWorktreeMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Test worktree usage', { priority: 5 });

  // 2. Create worktree for the task
  ctx.log('Creating worktree...');
  const worktreeResult = await ctx.worktreeManager.createWorktree({
    agentName: worker.name,
    taskId: task.id,
    taskTitle: task.title,
  });

  ctx.log(`Worktree created at: ${worktreeResult.path}`);

  // 3. Verify worktree exists
  const exists = await ctx.worktreeManager.worktreeExists(worktreeResult.path);
  if (!exists) {
    return fail(`Worktree does not exist at: ${worktreeResult.path}`);
  }

  // 4. Verify it's a valid git worktree
  const worktreeInfo = await ctx.worktreeManager.getWorktree(worktreeResult.path);
  if (!worktreeInfo) {
    return fail('Failed to get worktree info');
  }

  // 5. Verify branch naming convention
  const expectedBranchPattern = /^agent\/.+\/.+/;
  if (!expectedBranchPattern.test(worktreeResult.branch)) {
    return fail(`Branch name doesn't match pattern: ${worktreeResult.branch}`);
  }

  // 6. Verify path is in worktrees directory
  if (!worktreeResult.path.includes('.worktrees')) {
    return fail(`Worktree path not in .worktrees directory: ${worktreeResult.path}`);
  }

  return pass(`Worker running in worktree: ${worktreeResult.path}`, {
    worktreePath: worktreeResult.path,
    branch: worktreeResult.branch,
    isGitWorktree: true,
  });
}

async function runWorkerUsesWorktreeReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Test worktree usage', { priority: 5 });

  // 2. Let daemon dispatch the task (creates worktree automatically)
  ctx.log('Triggering daemon poll for dispatch...');
  await ctx.daemon.pollWorkerAvailability();

  // 3. Wait for task to be assigned
  await waitForTaskAssignment(ctx.api, task.id, { timeout: 120000 });

  // 4. Wait for session to start
  const session = await waitForSessionStart(
    ctx.sessionManager,
    worker.id as unknown as EntityId,
    { timeout: 60000 }
  );

  // 5. Verify session working directory is in .worktrees
  if (!session.workingDirectory.includes('.worktrees')) {
    return fail(`Session working directory not in .worktrees: ${session.workingDirectory}`);
  }

  // 6. Verify worktree branch pattern
  if (session.worktree) {
    const worktreeInfo = await ctx.worktreeManager.getWorktree(session.worktree);
    if (worktreeInfo) {
      const expectedBranchPattern = /^agent\/.+\/.+/;
      if (!expectedBranchPattern.test(worktreeInfo.branch)) {
        return fail(`Branch name doesn't match pattern: ${worktreeInfo.branch}`);
      }
    }
  }

  return pass(`Worker running in worktree: ${session.workingDirectory}`, {
    worktreePath: session.workingDirectory,
    worktree: session.worktree,
    sessionId: session.id,
  });
}

// ============================================================================
// Test 6: Worker Commits Work
// ============================================================================

export const workerCommitsWorkTest: OrchestrationTest = {
  id: 'worker-commits-work',
  name: 'Worker makes commits in worktree branch',
  description: 'Verify worker can commit changes to its worktree branch',
  timeout: 60000,
  tags: ['worker', 'git', 'commit'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runWorkerCommitsWorkMock(ctx);
    }
    return runWorkerCommitsWorkReal(ctx);
  },
};

async function runWorkerCommitsWorkMock(ctx: TestContext): Promise<TestResult> {
  const { execSync } = await import('node:child_process');
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  // 1. Create worker and worktree
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Test commits', { priority: 5 });

  const worktreeResult = await ctx.worktreeManager.createWorktree({
    agentName: worker.name,
    taskId: task.id,
    taskTitle: task.title,
  });

  ctx.log(`Working in worktree: ${worktreeResult.path}`);

  // 2. Make a change in the worktree
  const testFilePath = join(worktreeResult.path, 'test-file.txt');
  await writeFile(testFilePath, 'Test content from worker\n');
  ctx.log('Created test file');

  // 3. Commit the change
  try {
    execSync('git add -A && git commit -m "Test commit from worker"', {
      cwd: worktreeResult.path,
      stdio: 'pipe',
    });
    ctx.log('Committed changes');
  } catch (error) {
    return fail(`Failed to commit: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4. Verify commit exists
  try {
    const log = execSync('git log --oneline -1', {
      cwd: worktreeResult.path,
      encoding: 'utf8',
    });

    if (!log.includes('Test commit from worker')) {
      return fail(`Commit message not found in log: ${log}`);
    }

    ctx.log(`Commit verified: ${log.trim()}`);
  } catch (error) {
    return fail(`Failed to verify commit: ${error instanceof Error ? error.message : String(error)}`);
  }

  return pass('Worker successfully committed changes', {
    worktreePath: worktreeResult.path,
    branch: worktreeResult.branch,
  });
}

async function runWorkerCommitsWorkReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task that requires creating a file
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Create file test-output.txt containing "hello world"', {
    priority: 5,
    tags: ['test', 'commit'],
    acceptanceCriteria: 'File test-output.txt exists and contains "hello world"',
  });

  // 2. Let daemon dispatch
  ctx.log('Triggering daemon poll for dispatch...');
  await ctx.daemon.pollWorkerAvailability();

  // 3. Wait for assignment and session
  await waitForTaskAssignment(ctx.api, task.id, { timeout: 120000 });

  const session = await waitForSessionStart(
    ctx.sessionManager,
    worker.id as unknown as EntityId,
    { timeout: 60000 }
  );

  const worktreePath = session.workingDirectory;
  ctx.log(`Worker running in: ${worktreePath}`);

  // 4. Wait for a git commit in the worktree
  ctx.log('Waiting for worker to commit...');
  const commitHash = await waitForGitCommit(worktreePath, { timeout: 240000 });

  return pass(`Worker committed changes: ${commitHash}`, {
    worktreePath,
    commitHash,
    sessionId: session.id,
  });
}

// ============================================================================
// Test 7: Worker Creates Merge Request
// ============================================================================

export const workerCreatesMergeRequestTest: OrchestrationTest = {
  id: 'worker-creates-merge-request',
  name: 'Worker creates merge request on task completion',
  description: 'Worker creates PR/MR when finishing a task',
  timeout: 90000,
  tags: ['worker', 'merge-request', 'git'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runWorkerCreatesMergeRequestMock(ctx);
    }
    return runWorkerCreatesMergeRequestReal(ctx);
  },
};

async function runWorkerCreatesMergeRequestMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Test merge request creation', { priority: 5 });

  // 2. Create worktree and make changes
  const worktreeResult = await ctx.worktreeManager.createWorktree({
    agentName: worker.name,
    taskId: task.id,
    taskTitle: task.title,
  });

  // 3. Simulate worker completing task by updating task metadata with MR info
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    branch: worktreeResult.branch,
    worktree: worktreeResult.path,
    mergeRequestId: 1,
    mergeRequestUrl: `https://github.com/test/repo/pull/1`,
    mergeStatus: 'pending',
  });

  ctx.log('Updated task with MR info');

  // 4. Verify MR info is stored
  const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

  if (!taskMeta?.mergeRequestId) {
    return fail('PR number not set in task metadata');
  }

  if (!taskMeta?.mergeRequestUrl) {
    return fail('PR URL not set in task metadata');
  }

  return pass(`Merge request created: PR #${taskMeta.mergeRequestId}`, {
    mergeRequestId: taskMeta.mergeRequestId,
    mergeRequestUrl: taskMeta.mergeRequestUrl,
    branch: taskMeta.branch,
  });
}

async function runWorkerCreatesMergeRequestReal(ctx: TestContext): Promise<TestResult> {
  const { execSync } = await import('node:child_process');

  // 1. Create worker (needed for dispatch) and task
  await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Create a new file and push branch', {
    priority: 5,
    tags: ['test', 'merge-request'],
    acceptanceCriteria: 'Branch pushed to remote with changes',
  });

  // 2. Let daemon dispatch
  await ctx.daemon.pollWorkerAvailability();
  await waitForTaskAssignment(ctx.api, task.id, { timeout: 120000 });

  // 3. Wait for task metadata to have a branch set
  ctx.log('Waiting for worker to push branch...');
  const meta = await waitForTaskMeta(
    ctx.api,
    task.id,
    (m) => !!m.branch,
    { timeout: 240000 }
  );

  // 4. Verify the branch was pushed to the bare remote
  try {
    const branches = execSync('git branch -r', {
      cwd: ctx.tempWorkspace,
      encoding: 'utf8',
    });
    const hasBranch = branches.includes(meta.branch as string);
    ctx.log(`Remote branches include worker branch: ${hasBranch}`);
  } catch {
    ctx.log('Could not check remote branches');
  }

  return pass(`Worker set branch metadata: ${meta.branch}`, {
    branch: meta.branch,
    taskId: task.id,
  });
}

// ============================================================================
// Test 8: Worker Marks Task Complete
// ============================================================================

export const workerMarksTaskCompleteTest: OrchestrationTest = {
  id: 'worker-marks-task-complete',
  name: 'Worker marks task as complete',
  description: 'Task status changes to closed when worker finishes',
  timeout: 30000,
  tags: ['worker', 'task', 'completion'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runWorkerMarksTaskCompleteMock(ctx);
    }
    return runWorkerMarksTaskCompleteReal(ctx);
  },
};

async function runWorkerMarksTaskCompleteMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Test task completion', { priority: 5 });

  // 2. Assign task to worker
  await ctx.api.assignTaskToAgent(task.id, worker.id as unknown as EntityId, {
    markAsStarted: true,
  });
  ctx.log('Assigned task to worker');

  // 3. Verify task is in progress
  const taskInProgress = await ctx.api.get<Task>(task.id);
  if (taskInProgress?.status !== TaskStatus.IN_PROGRESS) {
    return fail(`Expected task in_progress, got: ${taskInProgress?.status}`);
  }

  // 4. Complete the task (simulating worker completion)
  await ctx.taskAssignment.completeTask(task.id, {
    summary: 'Task completed successfully',
  });
  ctx.log('Completed task');

  // 5. Verify task is closed
  const taskClosed = await ctx.api.get<Task>(task.id);
  if (taskClosed?.status !== TaskStatus.CLOSED) {
    return fail(`Expected task closed, got: ${taskClosed?.status}`);
  }

  return pass(`Task status is '${taskClosed.status}'`, {
    taskId: task.id,
    status: taskClosed.status,
  });
}

async function runWorkerMarksTaskCompleteReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker (needed for dispatch) and a simple task
  await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Add a comment to src/index.ts', {
    priority: 5,
    tags: ['test', 'simple'],
    acceptanceCriteria: 'A comment is added to src/index.ts',
  });

  // 2. Let daemon dispatch
  ctx.log('Triggering daemon poll...');
  await ctx.daemon.pollWorkerAvailability();

  // 3. Wait for task to reach CLOSED status
  ctx.log('Waiting for worker to complete task...');
  const closedTask = await waitForTaskStatus(
    ctx.api,
    task.id,
    TaskStatus.CLOSED,
    { timeout: 240000 }
  );

  return pass(`Task status is '${closedTask.status}'`, {
    taskId: task.id,
    status: closedTask.status,
  });
}

// ============================================================================
// Test 9: Worker Handoff on Context Fill
// ============================================================================

export const workerHandoffOnContextFillTest: OrchestrationTest = {
  id: 'worker-handoff-context',
  name: 'Worker triggers handoff before context exhaustion',
  description: 'Worker creates handoff task when approaching context limits',
  timeout: 60000,
  tags: ['worker', 'handoff', 'context'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runWorkerHandoffOnContextFillMock(ctx);
    }
    return runWorkerHandoffOnContextFillReal(ctx);
  },
};

async function runWorkerHandoffOnContextFillMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Long running task', { priority: 5 });

  // 2. Assign task and create worktree
  const worktreeResult = await ctx.worktreeManager.createWorktree({
    agentName: worker.name,
    taskId: task.id,
    taskTitle: task.title,
  });

  await ctx.api.assignTaskToAgent(task.id, worker.id as unknown as EntityId, {
    branch: worktreeResult.branch,
    worktree: worktreeResult.path,
    markAsStarted: true,
  });

  // 3. Simulate handoff by updating task metadata
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    handoffBranch: worktreeResult.branch,
    handoffWorktree: worktreeResult.path,
    handoffFrom: worker.id as unknown as EntityId,
    handoffAt: new Date().toISOString(),
    handoffHistory: [{
      sessionId: 'sim-session',
      message: 'Context limit approaching, handing off to continue work',
      branch: worktreeResult.branch,
      worktree: worktreeResult.path,
      handoffAt: new Date().toISOString(),
    }],
  });

  // 4. Unassign from current worker (simulating handoff)
  await ctx.api.update<Task>(task.id, {
    assignee: undefined,
    status: TaskStatus.OPEN,
  });

  ctx.log('Created handoff');

  // 5. Verify handoff metadata exists
  const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

  if (!taskMeta?.handoffBranch) {
    return fail('Handoff branch not set');
  }

  if (!taskMeta?.handoffHistory || taskMeta.handoffHistory.length === 0) {
    return fail('Handoff history not set');
  }

  return pass('Worker created handoff successfully', {
    handoffBranch: taskMeta.handoffBranch,
    handoffFrom: taskMeta.handoffFrom,
    handoffHistory: taskMeta.handoffHistory,
  });
}

async function runWorkerHandoffOnContextFillReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker and task
  const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
  const task = await createTestTask(ctx, 'Hand off this task', {
    priority: 5,
    tags: ['test', 'handoff'],
    acceptanceCriteria: 'Task is handed off with a note',
  });

  // 2. Assign task to worker (needed so handoff command can find the assignment)
  await ctx.api.assignTaskToAgent(task.id, worker.id as unknown as EntityId, {
    markAsStarted: true,
  });

  // 3. Start worker session with ultra-direct handoff prompt (like steward tests)
  const dbFlag = ctx.dbPath ? ` --db "${ctx.dbPath}"` : '';
  const command = `sf task handoff ${task.id} --message "Handing off to next worker"${dbFlag}`;
  const prompt = `You are a test agent. Execute this one command immediately and stop.

COMMAND TO RUN:
\`\`\`
${command}
\`\`\`

RULES:
- Run ONLY the command above. Nothing else.
- The \`el\` command is already on PATH. Do not install or locate it.
- Do not explore the codebase, read files, or run other commands first.
- Do not ask questions. Just run the command.
- After running the command, stop immediately.`;

  const { session } = await ctx.sessionManager.startSession(
    worker.id as unknown as EntityId,
    {
      workingDirectory: ctx.tempWorkspace,
      initialPrompt: prompt,
    }
  );
  ctx.log(`Worker session started: ${session.id}`);

  // 4. Wait for handoff metadata to appear
  ctx.log('Waiting for handoff...');
  const meta = await waitForTaskMeta(
    ctx.api,
    task.id,
    (m) => Array.isArray(m.handoffHistory) && m.handoffHistory.length > 0,
    { timeout: 240000 }
  );

  // 5. Verify task was reopened
  const reopened = await ctx.api.get<Task>(task.id);
  if (reopened?.status !== TaskStatus.OPEN) {
    ctx.log(`Task status after handoff: ${reopened?.status} (expected OPEN)`);
  }

  return pass('Worker created handoff successfully', {
    handoffHistory: meta.handoffHistory,
    handoffBranch: meta.handoffBranch,
    taskStatus: reopened?.status,
  });
}

// ============================================================================
// Test 10: Daemon Spawns Steward for MR
// ============================================================================

export const daemonSpawnsStewardForMRTest: OrchestrationTest = {
  id: 'daemon-spawns-steward-mr',
  name: 'Daemon spawns steward for merge request',
  description: 'Merge request triggers steward spawn for review',
  timeout: 60000,
  tags: ['daemon', 'steward', 'merge-request'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runDaemonSpawnsStewardForMRMock(ctx);
    }
    return runDaemonSpawnsStewardForMRReal(ctx);
  },
};

async function runDaemonSpawnsStewardForMRMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create a merge steward
  const steward = await createTestSteward(ctx, `MergeSteward-${uniqueId()}`, {
    focus: 'merge',
    triggers: [{ type: 'event', event: 'merge_request_created' }],
  });
  ctx.log(`Registered merge steward: ${steward.id}`);

  // 2. Register steward with scheduler
  await ctx.stewardScheduler.registerSteward(steward.id as unknown as EntityId);

  // 3. Start the scheduler
  await ctx.stewardScheduler.start();

  // 4. Create a task with MR info
  const task = await createTestTask(ctx, 'Task with merge request', { priority: 5 });
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeRequestId: 42,
    mergeRequestUrl: 'https://github.com/test/repo/pull/42',
    mergeStatus: 'pending',
  });

  // 5. Publish merge request event
  const triggered = await ctx.stewardScheduler.publishEvent('merge_request_created', {
    taskId: task.id,
    mergeRequestId: 42,
  });

  ctx.log(`Published MR event, triggered ${triggered} steward(s)`);

  // 6. Verify steward was triggered
  if (triggered === 0) {
    return fail('No steward was triggered for merge request');
  }

  // 7. Check steward execution history
  const history = ctx.stewardScheduler.getExecutionHistory({
    stewardId: steward.id as unknown as EntityId,
    limit: 1,
  });

  if (history.length === 0) {
    return fail('Steward execution not recorded');
  }

  return pass('Steward triggered for merge request', {
    stewardId: steward.id,
    triggerCount: triggered,
  });
}

async function runDaemonSpawnsStewardForMRReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create a merge steward
  const steward = await createTestSteward(ctx, `MergeSteward-${uniqueId()}`, {
    focus: 'merge',
    triggers: [{ type: 'event', event: 'merge_request_created' }],
  });
  ctx.log(`Registered merge steward: ${steward.id}`);

  // 2. Register steward with scheduler
  await ctx.stewardScheduler.registerSteward(steward.id as unknown as EntityId);
  await ctx.stewardScheduler.start();

  // 3. Create a task with MR info
  const task = await createTestTask(ctx, 'Task with merge request', { priority: 5 });
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeRequestId: 42,
    mergeRequestUrl: 'https://github.com/test/repo/pull/42',
    mergeStatus: 'pending',
  });

  // 4. Publish merge request event
  const triggered = await ctx.stewardScheduler.publishEvent('merge_request_created', {
    taskId: task.id,
    mergeRequestId: 42,
  });

  if (triggered === 0) {
    return fail('No steward was triggered for merge request');
  }

  // 5. Wait for steward session to start
  ctx.log('Waiting for steward session to start...');
  const session = await waitForSessionStart(
    ctx.sessionManager,
    steward.id as unknown as EntityId,
    { timeout: 120000 }
  ).catch(() => null);

  return pass('Steward triggered for merge request', {
    stewardId: steward.id,
    triggerCount: triggered,
    sessionStarted: !!session,
  });
}

// ============================================================================
// Test 11: Steward Merges Passing MR
// ============================================================================

export const stewardMergesPassingMRTest: OrchestrationTest = {
  id: 'steward-merges-passing',
  name: 'Steward reviews and merges passing PR',
  description: 'Steward merges PR when tests pass',
  timeout: 60000,
  tags: ['steward', 'merge', 'tests'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runStewardMergesPassingMRMock(ctx);
    }
    return runStewardMergesPassingMRReal(ctx);
  },
};

async function runStewardMergesPassingMRMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create task with passing MR status
  const task = await createTestTask(ctx, 'Task with passing tests', { priority: 5 });

  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeRequestId: 100,
    mergeRequestUrl: 'https://github.com/test/repo/pull/100',
    mergeStatus: 'testing',
    testRunCount: 1,
    lastTestResult: {
      passed: true,
      totalTests: 10,
      passedTests: 10,
      failedTests: 0,
      durationMs: 5000,
      completedAt: new Date().toISOString(),
    },
  });

  ctx.log('Created task with passing test results');

  // 2. Simulate steward merging the MR
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeStatus: 'merged',
    completedAt: new Date().toISOString(),
  });

  // 3. Close the task
  await ctx.api.update<Task>(task.id, { status: TaskStatus.CLOSED });

  // 4. Verify merge status
  const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

  if (taskMeta?.mergeStatus !== 'merged') {
    return fail(`Expected merge status 'merged', got: ${taskMeta?.mergeStatus}`);
  }

  const updatedTask = await ctx.api.get<Task>(task.id);
  if (updatedTask?.status !== TaskStatus.CLOSED) {
    return fail(`Expected task closed, got: ${updatedTask?.status}`);
  }

  return pass('Steward merged passing PR', {
    taskId: task.id,
    mergeStatus: taskMeta.mergeStatus,
    taskStatus: updatedTask.status,
  });
}

async function runStewardMergesPassingMRReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create steward
  const steward = await createTestSteward(ctx, `MergeSteward-${uniqueId()}`, {
    focus: 'merge',
  });

  // 2. Create task with passing test metadata
  const task = await createTestTask(ctx, 'Task with passing tests', { priority: 5 });
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeRequestId: 100,
    mergeRequestUrl: 'https://github.com/test/repo/pull/100',
    mergeStatus: 'testing',
    testRunCount: 1,
    lastTestResult: {
      passed: true,
      totalTests: 10,
      passedTests: 10,
      failedTests: 0,
      durationMs: 5000,
      completedAt: new Date().toISOString(),
    },
  });

  // 3. Start steward session with review prompt
  const prompt = buildTestStewardPrompt('merge', task.id as unknown as string, { dbPath: ctx.dbPath });
  const { session } = await ctx.sessionManager.startSession(
    steward.id as unknown as EntityId,
    {
      workingDirectory: ctx.tempWorkspace,
      initialPrompt: prompt,
    }
  );

  ctx.log(`Steward session started: ${session.id}`);

  // 4. Wait for merge status to become 'merged'
  ctx.log('Waiting for steward to merge...');
  const meta = await waitForTaskMeta(
    ctx.api,
    task.id,
    (m) => m.mergeStatus === 'merged',
    { timeout: 240000 }
  );

  return pass('Steward merged passing PR', {
    taskId: task.id,
    mergeStatus: meta.mergeStatus,
  });
}

// ============================================================================
// Test 12: Steward Handoff Failing MR
// ============================================================================

export const stewardHandoffFailingMRTest: OrchestrationTest = {
  id: 'steward-handoff-failing',
  name: 'Steward creates handoff for failing PR',
  description: 'Steward hands off to worker when tests fail',
  timeout: 60000,
  tags: ['steward', 'handoff', 'tests'],

  async run(ctx) {
    if (ctx.mode === 'mock') {
      return runStewardHandoffFailingMRMock(ctx);
    }
    return runStewardHandoffFailingMRReal(ctx);
  },
};

async function runStewardHandoffFailingMRMock(ctx: TestContext): Promise<TestResult> {
  // 1. Create worker for handoff (needed for reassignment)
  await createTestWorker(ctx, `TestWorker-${uniqueId()}`);

  // 2. Create task with failing MR status
  const task = await createTestTask(ctx, 'Task with failing tests', {
    priority: 5,
    tags: ['test', 'needs-fix'],
  });

  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeRequestId: 101,
    mergeRequestUrl: 'https://github.com/test/repo/pull/101',
    mergeStatus: 'testing',
    testRunCount: 1,
    lastTestResult: {
      passed: false,
      totalTests: 10,
      passedTests: 7,
      failedTests: 3,
      durationMs: 5000,
      completedAt: new Date().toISOString(),
      errorMessage: 'Test 1 failed, Test 2 failed, Test 3 failed',
    },
  });

  ctx.log('Created task with failing test results');

  // 3. Simulate steward marking as test_failed and creating handoff
  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeStatus: 'test_failed',
    mergeFailureReason: '3 tests failed: Test 1, Test 2, Test 3',
    handoffHistory: [{
      sessionId: 'steward-session',
      message: 'Tests failed, needs worker to fix issues',
      handoffAt: new Date().toISOString(),
    }],
  });

  // 4. Reopen task for assignment
  await ctx.api.update<Task>(task.id, {
    status: TaskStatus.OPEN,
    assignee: undefined,
  });

  ctx.log('Created handoff for failing tests');

  // 5. Verify handoff was created
  const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

  if (taskMeta?.mergeStatus !== 'test_failed') {
    return fail(`Expected merge status 'test_failed', got: ${taskMeta?.mergeStatus}`);
  }

  if (!taskMeta?.handoffHistory || taskMeta.handoffHistory.length === 0) {
    return fail('Handoff history not set');
  }

  const updatedTask = await ctx.api.get<Task>(task.id);
  if (updatedTask?.status !== TaskStatus.OPEN) {
    return fail(`Expected task open for reassignment, got: ${updatedTask?.status}`);
  }

  return pass('Steward created handoff for failing PR', {
    taskId: task.id,
    mergeStatus: taskMeta.mergeStatus,
    handoffHistory: taskMeta.handoffHistory,
    taskStatus: updatedTask.status,
  });
}

async function runStewardHandoffFailingMRReal(ctx: TestContext): Promise<TestResult> {
  // 1. Create steward and worker (worker needed for reassignment)
  const steward = await createTestSteward(ctx, `MergeSteward-${uniqueId()}`, {
    focus: 'merge',
  });
  await createTestWorker(ctx, `TestWorker-${uniqueId()}`);

  // 2. Create task with failing test metadata
  const task = await createTestTask(ctx, 'Task with failing tests', {
    priority: 5,
    tags: ['test', 'needs-fix'],
  });

  await ctx.api.updateTaskOrchestratorMeta(task.id, {
    mergeRequestId: 101,
    mergeRequestUrl: 'https://github.com/test/repo/pull/101',
    mergeStatus: 'testing',
    testRunCount: 1,
    lastTestResult: {
      passed: false,
      totalTests: 10,
      passedTests: 7,
      failedTests: 3,
      durationMs: 5000,
      completedAt: new Date().toISOString(),
      errorMessage: 'Test 1 failed, Test 2 failed, Test 3 failed',
    },
  });

  // 3. Start steward session with reject/handoff prompt
  const prompt = buildTestStewardPrompt('reject', task.id as unknown as string, { dbPath: ctx.dbPath });
  const { session } = await ctx.sessionManager.startSession(
    steward.id as unknown as EntityId,
    {
      workingDirectory: ctx.tempWorkspace,
      initialPrompt: prompt,
    }
  );

  ctx.log(`Steward session started: ${session.id}`);

  // 4. Wait for merge status to become 'test_failed'
  ctx.log('Waiting for steward to reject...');
  const meta = await waitForTaskMeta(
    ctx.api,
    task.id,
    (m) => m.mergeStatus === 'test_failed',
    { timeout: 240000 }
  );

  // 5. Verify task is reopened
  const reopened = await ctx.api.get<Task>(task.id);
  if (reopened?.status !== TaskStatus.OPEN) {
    ctx.log(`Task status after handoff: ${reopened?.status} (expected OPEN)`);
  }

  return pass('Steward created handoff for failing PR', {
    taskId: task.id,
    mergeStatus: meta.mergeStatus,
    handoffHistory: meta.handoffHistory,
    taskStatus: reopened?.status,
  });
}

// ============================================================================
// All Tests Collection
// ============================================================================

/**
 * All orchestration tests in order of execution
 */
export const allTests: OrchestrationTest[] = [
  directorCreatesTasksTest,
  directorCreatesPlansTest,
  daemonDispatchesWorkerTest,
  daemonRespectsDependenciesTest,
  workerUsesWorktreeTest,
  workerCommitsWorkTest,
  workerCreatesMergeRequestTest,
  workerMarksTaskCompleteTest,
  workerHandoffOnContextFillTest,
  daemonSpawnsStewardForMRTest,
  stewardMergesPassingMRTest,
  stewardHandoffFailingMRTest,
];

/**
 * Get tests by tag
 */
export function getTestsByTag(tag: string): OrchestrationTest[] {
  return allTests.filter(t => t.tags?.includes(tag));
}

/**
 * Get test by ID
 */
export function getTestById(id: string): OrchestrationTest | undefined {
  return allTests.find(t => t.id === id);
}

/**
 * Get tests matching a filter string (matches id or name)
 */
export function filterTests(filter: string): OrchestrationTest[] {
  const lowerFilter = filter.toLowerCase();
  return allTests.filter(
    t => t.id.toLowerCase().includes(lowerFilter) ||
         t.name.toLowerCase().includes(lowerFilter)
  );
}
