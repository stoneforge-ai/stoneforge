/**
 * Testing Module for Orchestration E2E Tests
 *
 * Provides utilities and test definitions for running
 * orchestration behavior verification tests.
 *
 * @module
 */

// Test utilities
export {
  waitFor,
  waitForChange,
  waitForAll,
  sleep,
  measure,
  timeout,
  withTimeout,
  assertDefined,
  assertEqual,
  assertContains,
  assertMatches,
  assertLength,
  assertNotEmpty,
  assertTrue,
  pass,
  fail,
  randomString,
  uniqueId,
  retry,
  waitForTaskStatus,
  waitForTaskAssignment,
  waitForSessionStart,
  waitForSessionEnd,
  waitForTaskMeta,
  waitForGitCommit,
  type WaitForOptions,
  type AssertionResult,
  type TestResult,
  type RetryOptions,
  type DomainWaitOptions,
} from './test-utils.js';

// Test context
export {
  setupTestContext,
  createTestWorker,
  createTestDirector,
  createTestSteward,
  createTestTask,
  type TestContext,
  type TestContextOptions,
} from './test-context.js';

// Test prompts
export {
  buildTestWorkerPrompt,
  buildTestWorkerOverride,
  buildTestDirectorPrompt,
  buildTestDirectorOverride,
  buildTestStewardPrompt,
  buildTestStewardOverride,
} from './test-prompts.js';

// Orchestration tests
export {
  allTests,
  getTestsByTag,
  getTestById,
  filterTests,
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
  type OrchestrationTest,
} from './orchestration-tests.js';
