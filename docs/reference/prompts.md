# Prompts System Reference

**Directory:** `packages/smithy/src/prompts/`

Built-in role definition prompts and customization system.

## Overview

The prompts system provides:
- Built-in role prompts for director, worker, and steward agents
- Project-level override support
- Prompt composition with task context
- Steward focus-specific addenda

## Prompt Files

```
packages/smithy/src/prompts/
├── index.ts              # Loading and composition API
├── director.md           # Director role prompt
├── worker.md             # Ephemeral worker role prompt
├── persistent-worker.md  # Persistent worker role prompt
├── message-triage.md     # Message triage prompt (used by triage sessions)
├── steward-base.md       # Base steward prompt
├── steward-merge.md      # Merge focus addendum
├── steward-docs.md       # Docs focus addendum
└── steward-recovery.md   # Recovery focus addendum
```

## Loading Prompts

### Basic Loading

```typescript
import {
  loadRolePrompt,
  loadBuiltInPrompt,
  hasBuiltInPrompt,
  listBuiltInPrompts,
} from '@stoneforge/smithy';

// Load prompt (checks project overrides first)
const result = loadRolePrompt('worker', undefined, {
  projectRoot: '/my/project',
});
console.log(result?.prompt);   // The prompt content
console.log(result?.source);   // 'built-in' or path to override

// Load persistent worker prompt
const persistent = loadRolePrompt('worker', undefined, {
  projectRoot: '/my/project',
  workerMode: 'persistent',
});
// Returns: persistent-worker.md instead of worker.md

// Load built-in only (skip overrides)
const builtIn = loadBuiltInPrompt('director');

// For stewards, specify focus
const mergePrompt = loadRolePrompt('steward', 'merge');
// Returns: steward-base.md + steward-merge.md combined

// Check existence
hasBuiltInPrompt('worker');                      // true
hasBuiltInPrompt('worker', undefined, 'persistent'); // true
hasBuiltInPrompt('steward', 'merge');            // true

// List all prompts
const files = listBuiltInPrompts();
// ['director.md', 'worker.md', 'steward-base.md', ...]
```

### RolePromptResult

```typescript
interface RolePromptResult {
  prompt: string;                    // Combined prompt content
  source: 'built-in' | string;       // Source path or 'built-in'
  baseSource?: 'built-in' | string;  // For stewards: base source
  focusSource?: 'built-in' | string; // For stewards: focus source
}
```

## Building Agent Prompts

Compose complete startup prompts with task context:

```typescript
import { buildAgentPrompt } from '@stoneforge/smithy';

// Basic prompt
const prompt = buildAgentPrompt({
  role: 'worker',
  projectRoot: '/my/project',
});

// With task context
const prompt = buildAgentPrompt({
  role: 'worker',
  taskContext: 'Implement user login with OAuth.',
  projectRoot: '/my/project',
});

// With additional instructions
const prompt = buildAgentPrompt({
  role: 'worker',
  taskContext: 'Implement feature X',
  additionalInstructions: 'Focus on test coverage.',
  projectRoot: '/my/project',
});

// Steward with focus
const prompt = buildAgentPrompt({
  role: 'steward',
  stewardFocus: 'merge',
  projectRoot: '/my/project',
});

// Skip project overrides
const prompt = buildAgentPrompt({
  role: 'worker',
  builtInOnly: true,
});
```

### BuildAgentPromptOptions

```typescript
interface BuildAgentPromptOptions {
  role: AgentRole;
  stewardFocus?: StewardFocus;
  workerMode?: WorkerMode;       // 'ephemeral' | 'persistent'
  taskContext?: string;
  additionalInstructions?: string;
  projectRoot?: string;
  builtInOnly?: boolean;
}
```

## Project-Level Overrides

Override built-in prompts by placing files in `.stoneforge/prompts/`:

```
my-project/
├── .stoneforge/
│   └── prompts/
│       ├── worker.md           # Custom worker prompt
│       └── steward-merge.md    # Custom merge steward addendum
└── src/
```

The loader checks for project overrides first, then falls back to built-in.

**Steward overrides are independent:** You can override just the base, just the focus, or both.

## Prompt Structure

Built-in prompts follow a consistent structure:

### 1. Identity Section
```markdown
# Your Role: {Role}

You are a {role} agent in the Stoneforge system.
- You own: {responsibilities}
- You report to: {supervisor}
```

### 2. System Overview
```markdown
## System Overview

| Role | Owns | Reports To |
|------|------|------------|
| Director | Plans, priorities | Human |
| Worker | Task execution | Director |
| Steward | Maintenance | Director |
```

### 3. Core Workflows
```markdown
## Core Workflows

### Starting a Task
1. Check inbox for assigned tasks
2. Read task description and requirements
3. Create implementation plan
...
```

### 4. Judgment Scenarios
```markdown
## Decision Making

### When stuck on a task
- Break down into smaller subtasks
- Check for related completed tasks
- Request help from director if blocked > 30 min
```

### 5. CLI Quick Reference
```markdown
## CLI Commands

| Command | Purpose |
|---------|---------|
| `sf task ready` | List ready tasks |
| `sf task close <id>` | Close task |
```

## Notable Prompt Sections

### message-triage.md

Used by triage sessions spawned by the dispatch daemon. Provides instructions for evaluating incoming messages, categorizing them by urgency and type, and producing structured triage results. Triage sessions run in read-only worktrees and do not perform any task execution.

### Persistent Worker Prompt

The persistent worker prompt (`persistent-worker.md`) is loaded when `workerMode` is `'persistent'`. It differs from the ephemeral worker prompt in several ways:

- Workers receive direct instructions from the human operator (not daemon-dispatched tasks)
- Work is merged via `sf merge` (squash merge into master), not `sf task complete`
- Discovered issues are reported to the Director via messages, not created as tasks
- No auto-shutdown, handoff, or nudge response sections
- Workers operate in a dedicated worktree on a `session/{name}-{timestamp}` branch

### Worker Prompt: Proactive Communication

The worker prompt (`worker.md`) includes a **Proactive Communication** section that instructs workers on when and how to proactively send status updates to the director. This covers situations such as reporting progress on long-running tasks, flagging potential blockers early, and communicating completion status.

### Worker Prompt: Channel Discipline

The worker prompt (`worker.md`) includes a **Channel Discipline** section that defines rules for which communication channels workers should use. Workers are instructed to keep task-related communication in the appropriate channels and avoid cross-posting or using incorrect channels for status updates, help requests, or task completion notifications.

### Director Prompt: Channel Management

The director prompt (`director.md`) includes a **Channel Management** section that provides the director with guidelines for managing communication channels across the team. This covers creating and organizing channels, routing messages to the correct recipients, and ensuring workers and stewards use appropriate channels for their communications.

## Integration with Spawner

Use `buildAgentPrompt` when spawning agents:

```typescript
import { buildAgentPrompt } from '@stoneforge/smithy';

const prompt = buildAgentPrompt({
  role: 'worker',
  taskContext: taskDescription,
  projectRoot: workspace,
});

const result = await spawner.spawn(agentId, 'worker', {
  initialPrompt: prompt,
  workingDirectory: worktreePath,
});
```

## Steward Focus Types

| Focus | File | Purpose |
|-------|------|---------|
| `merge` | `steward-merge.md` | Merge completed branches |
| `docs` | `steward-docs.md` | Scan and fix documentation issues |
| `recovery` | `steward-recovery.md` | Diagnose and recover tasks in broken state |
| `custom` | _(user-provided playbook)_ | User-defined steward behavior |

Steward prompts are combined: `steward-base.md` + `steward-{focus}.md`. Custom stewards use the base prompt plus a user-provided playbook stored in their metadata.

## Agent Identity in Prompts

When agents are spawned, their entity ID and the director's ID are automatically included in the prompt for traceability:

| Role | Fields | Location |
|------|--------|----------|
| Director | `**Director ID:** {agentId}` | After role prompt |
| Worker | `**Worker ID:** {agentId}`, `**Director ID:** {directorId}` | In task assignment section |
| Steward | `**Worker ID:** {agentId}`, `**Director ID:** {directorId}` | In task/merge assignment section |
| Triage | `**Worker ID:** {agentId}`, `**Director ID:** {directorId}` | In session context section |

This allows agents to identify themselves and know their director for escalation and communication.

## Best Practices

1. **Keep prompts concise:** Built-in prompts are additive to Claude Code's system prompt. Focus on role-specific guidance.

2. **Use behaviors for context:** Use `AgentBehaviors` in role definitions for event-specific instructions rather than bloating the main prompt.

3. **Override sparingly:** Only override built-in prompts when you need different behavior. Partial overrides (just focus, not base) work well.

4. **Include CLI commands:** Prompts should remind agents of key CLI commands they'll use.

5. **Test with real agents:** Verify prompt effectiveness by running agents and observing behavior.

## Loading Options

```typescript
interface LoadPromptOptions {
  projectRoot?: string;      // Project root for override lookup
  builtInOnly?: boolean;     // Skip project overrides
  workerMode?: WorkerMode;   // 'ephemeral' | 'persistent' (for worker role)
}
```

## API Reference

```typescript
// Load prompt with override support
loadRolePrompt(
  role: AgentRole,
  stewardFocus?: StewardFocus,
  options?: LoadPromptOptions
): RolePromptResult | undefined

// Load built-in only
loadBuiltInPrompt(
  role: AgentRole,
  stewardFocus?: StewardFocus,
  workerMode?: WorkerMode
): string | undefined

// Check existence
hasBuiltInPrompt(
  role: AgentRole,
  stewardFocus?: StewardFocus,
  workerMode?: WorkerMode
): boolean

// List all prompt files
listBuiltInPrompts(): string[]

// Build complete prompt
buildAgentPrompt(
  options: BuildAgentPromptOptions
): string | undefined

// Load triage prompt (used by dispatch daemon for triage sessions)
loadTriagePrompt(
  options?: LoadPromptOptions
): RolePromptResult | undefined
```
