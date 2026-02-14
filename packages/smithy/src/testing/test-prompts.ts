/**
 * Test Prompt Builders for Real-Mode Orchestration Tests
 *
 * Constrained prompts that produce verifiable outcomes quickly.
 * Used when running orchestration tests with `--mode real` to
 * guide actual Claude processes toward fast, deterministic behavior.
 *
 * @module
 */

// ============================================================================
// Worker Prompts
// ============================================================================

/**
 * Builds a constrained prompt for a test worker agent.
 *
 * Instructs the worker to complete a task with minimal exploration,
 * commit changes, push to the current branch, and close the task.
 */
export function buildTestWorkerPrompt(
  taskTitle: string,
  worktreePath: string
): string {
  return `You are a test worker agent. Complete the following task as quickly as possible.

TASK: ${taskTitle}

INSTRUCTIONS:
1. You are working in: ${worktreePath}
2. Make minimal, focused changes to complete the task.
3. Do NOT explore the codebase beyond what is needed.
4. Commit your changes with a descriptive message.
5. Push to the current branch.
6. Close the task: sf task close <task-id>

CONSTRAINTS:
- Do not refactor existing code.
- Do not add tests unless the task explicitly requires it.
- Do not create documentation.
- Complete as fast as possible.`;
}

/**
 * Builds a prompt override for the worker role.
 * Written to .stoneforge/prompts/worker.md for real-mode tests.
 */
export function buildTestWorkerOverride(): string {
  return `# Test Worker Override

You are running inside an orchestration test. Your goal is to complete tasks quickly and deterministically.

## Rules
- Make minimal changes to satisfy the task requirements.
- Skip exploration — go straight to implementation.
- Use the \`sf\` CLI for all stoneforge operations.
- Always commit and push your changes before closing a task.
- Do not ask clarifying questions — use your best judgment.
- Do not install dependencies or run builds unless required by the task.
- The \`sf\` command is on PATH and ready to use. Do not attempt to install or locate it.`;
}

// ============================================================================
// Director Prompts
// ============================================================================

/**
 * Builds a constrained prompt for a test director agent.
 *
 * Instructs the director to execute one specific action and stop.
 */
export function buildTestDirectorPrompt(instruction: string): string {
  return `You are a test director agent. Execute the following instruction and then stop.

INSTRUCTION: ${instruction}

CONSTRAINTS:
- Execute this one instruction only.
- Do not explore the codebase.
- Do not plan beyond what is asked.
- Complete as quickly as possible.
- Use the \`sf\` CLI for all stoneforge operations (e.g., \`sf task create\`).`;
}

/**
 * Builds a prompt override for the director role.
 * Written to .stoneforge/prompts/director.md for real-mode tests.
 */
export function buildTestDirectorOverride(): string {
  return `# Test Director Override

You are running inside an orchestration test. Your goal is to execute instructions quickly and deterministically.

## Rules
- Execute the given instruction and stop.
- Use the \`sf\` CLI for creating tasks and plans.
- Do not explore the codebase.
- Do not engage in extended planning — act immediately.
- Keep task titles concise and descriptive.
- The \`sf\` command is on PATH and ready to use. Do not attempt to install or locate it.`;
}

// ============================================================================
// Steward Prompts
// ============================================================================

/**
 * Builds a constrained prompt for a test steward agent.
 *
 * Instructs the steward to execute exactly one command and stop.
 */
export function buildTestStewardPrompt(
  action: 'merge' | 'reject' | 'handoff',
  taskId: string,
  options?: { dbPath?: string }
): string {
  const dbFlag = options?.dbPath ? ` --db "${options.dbPath}"` : '';
  let command: string;
  if (action === 'merge') {
    command = `sf task merge ${taskId}${dbFlag}`;
  } else {
    command = `sf task reject ${taskId} --reason "Tests failed" --message "Needs fixes"${dbFlag}`;
  }

  return `You are a test agent. Execute this one command immediately and stop.

COMMAND TO RUN:
\`\`\`
${command}
\`\`\`

RULES:
- Run ONLY the command above. Nothing else.
- The \`sf\` command is already on PATH. Do not install or locate it.
- Do not explore the codebase, read files, or run other commands first.
- Do not ask questions. Just run the command.
- After running the command, stop immediately.`;
}

/**
 * Builds a prompt override for the steward role.
 * Written to .stoneforge/prompts/steward.md for real-mode tests.
 */
export function buildTestStewardOverride(): string {
  return `# Test Steward Override

You are running inside an orchestration test.

## Rules
- Execute the command given in your prompt immediately.
- The \`sf\` command is on PATH and ready to use. Do not attempt to install or locate it.
- Available commands: \`sf task merge <id>\`, \`sf task reject <id> --reason "..." --message "..."\`
- Do not explore the codebase or run discovery commands.
- Complete as quickly as possible.`;
}
