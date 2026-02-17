# How to Customize Agent Prompts

Guide for customizing the built-in agent role prompts.

## Overview

The prompts system supports:

- Built-in prompts for each role (director, worker, steward)
- Project-level overrides in `.stoneforge/prompts/`
- Task context composition
- Steward focus-specific addenda

## Built-in Prompt Locations

```
packages/smithy/src/prompts/
├── director.md           # Director role
├── worker.md             # Ephemeral worker role
├── persistent-worker.md  # Persistent worker role
├── steward-base.md       # Base steward (all focuses)
├── steward-merge.md      # Merge focus addendum
└── steward-docs.md       # Docs focus addendum
```

**Note:** The worker prompt is selected automatically based on `workerMode`. Ephemeral workers get `worker.md`, persistent workers get `persistent-worker.md`. You can override either by placing the corresponding file in `.stoneforge/prompts/`.

## Creating Project Overrides

### 1. Create the Prompts Directory

```bash
mkdir -p .stoneforge/prompts
```

### 2. Copy and Modify a Prompt

```bash
# Copy built-in worker prompt
cp packages/smithy/src/prompts/worker.md .stoneforge/prompts/worker.md

# Edit to customize
vim .stoneforge/prompts/worker.md
```

### 3. Override Structure

```
my-project/
├── .stoneforge/
│   └── prompts/
│       ├── worker.md           # Overrides built-in worker
│       ├── director.md         # Overrides built-in director
│       └── steward-merge.md    # Overrides just merge focus
└── src/
```

**Note:** You can override just the base, just a focus, or both independently.

## Prompt Structure

Built-in prompts follow this structure:

### 1. Identity Section

```markdown
# Your Role: Worker

You are a worker agent in the Stoneforge orchestration system.

## Your Responsibilities

- Execute assigned tasks
- Report progress and blockers
- Request help when stuck

## Who You Report To

- Director agent
```

### 2. System Overview

```markdown
## System Overview

| Role     | Owns                            | Reports To |
| -------- | ------------------------------- | ---------- |
| Director | Plans, priorities, coordination | Human      |
| Worker   | Task execution                  | Director   |
| Steward  | Maintenance, cleanup            | Director   |
```

### 3. Core Workflows

```markdown
## Core Workflows

### Starting Your Day

1. Check inbox for new assignments: `sf inbox <agent-id>`
2. Review assigned tasks: `sf task ready`
3. Pick highest priority task
4. Mark as in-progress and begin work

### Completing a Task

1. Verify requirements met
2. Run tests
3. Update task: `sf task close <id> --reason "Completed"`
4. Notify director if needed
```

### 4. Decision Guidelines

```markdown
## Decision Making

### When to ask for help

- Blocked for more than 30 minutes
- Requirements unclear
- Need access or permissions
- Unexpected technical challenges

### When to proceed independently

- Clear requirements
- Within your skill set
- Standard patterns apply
```

### 5. CLI Quick Reference

```markdown
## CLI Commands

| Command               | Purpose            |
| --------------------- | ------------------ |
| `sf task ready`            | List ready tasks   |
| `sf task blocked`          | List blocked tasks |
| `sf task close <id>`       | Close task         |
| `sf inbox <agent-id>` | Check messages     |
```

## Loading Custom Prompts

### In Code

```typescript
import { loadRolePrompt, buildAgentPrompt } from "@stoneforge/smithy";

// Load prompt (checks project overrides first)
const result = loadRolePrompt("worker", undefined, {
  projectRoot: process.cwd(),
});

console.log(result?.source); // Path to override or 'built-in'
console.log(result?.prompt); // The prompt content

// Build complete prompt with task context
const prompt = buildAgentPrompt({
  role: "worker",
  taskContext: "Implement OAuth login for the user authentication system.",
  additionalInstructions: "Focus on security best practices.",
  projectRoot: process.cwd(),
});
```

### For Stewards

```typescript
// Stewards combine base + focus
const mergePrompt = loadRolePrompt("steward", "merge", {
  projectRoot: process.cwd(),
});

// Can override just base, just focus, or both
// Result shows which parts came from where:
console.log(mergePrompt?.baseSource); // 'built-in' or override path
console.log(mergePrompt?.focusSource); // 'built-in' or override path
```

## Best Practices

### Keep Prompts Concise

Built-in prompts are additive to Claude Code's system prompt. Focus on:

- Role-specific responsibilities
- Decision-making guidelines
- Key CLI commands
- Communication protocols

Avoid repeating general instructions Claude already has.

### Use Behaviors for Context

Instead of bloating the main prompt, use `AgentBehaviors` in role definitions:

```typescript
const roleDef = await roleDefService.createRoleDefinition({
  role: "worker",
  name: "Frontend Worker",
  systemPrompt: "Base prompt here...",
  behaviors: {
    onStartup: "Check git status and pull latest changes.",
    onTaskAssigned: "Read the full task description before starting.",
    onStuck: "Try breaking into smaller steps. Ask for help after 30 min.",
    onError: "Capture full error, check logs, then report to director.",
  },
});
```

### Test with Real Agents

After customizing prompts:

1. Spawn an agent with the custom prompt
2. Observe behavior on real tasks
3. Iterate based on actual performance
4. Check for unintended behaviors

### Version Control Prompts

Store prompt overrides in git:

```bash
git add .stoneforge/prompts/
git commit -m "Customize worker prompt for project conventions"
```

## Examples

### Adding Project-Specific Context

```markdown
# Your Role: Worker

You are a worker agent in the Stoneforge orchestration system.

## Project Context

This project uses:

- TypeScript with strict mode
- React 18 with hooks
- TanStack Query for data fetching
- Tailwind CSS for styling

Follow these conventions:

- Use functional components only
- Prefer named exports
- Write tests for all new code

## Your Responsibilities

...
```

### Customizing for Security-Focused Project

```markdown
## Security Guidelines

Before any code change:

1. Check for credential exposure
2. Validate all user inputs
3. Use parameterized queries
4. Review OWASP top 10

Flag any security concerns to director immediately.
```

### Adding Team Communication

```markdown
## Communication

### Slack Channels

- #dev-general - General updates
- #blockers - Report blockers
- #standup - Daily async standup

### When to Escalate

- Security issues → Director + #security
- Production issues → Director + on-call
- Unclear requirements → Product owner
```

## Checking Prompt Sources

```typescript
import {
  loadRolePrompt,
  listBuiltInPrompts,
  hasBuiltInPrompt,
} from "@stoneforge/smithy";

// List all built-in prompts
const files = listBuiltInPrompts();
// ['director.md', 'worker.md', 'steward-base.md', ...]

// Check if built-in exists
hasBuiltInPrompt("worker"); // true
hasBuiltInPrompt("steward", "merge"); // true

// Load and check source
const result = loadRolePrompt("worker", undefined, {
  projectRoot: process.cwd(),
});

if (result?.source === "built-in") {
  console.log("Using built-in prompt");
} else {
  console.log(`Using override from: ${result?.source}`);
}
```

## Troubleshooting

### Override Not Loading

1. Check file path: `.stoneforge/prompts/{role}.md`
2. Check file name matches exactly (case-sensitive)
3. Verify `projectRoot` is set correctly
4. Check file permissions

### Steward Focus Not Combining

```typescript
// For stewards, both base and focus are loaded:
const result = loadRolePrompt("steward", "merge", { projectRoot });

// Check what loaded:
console.log("Base:", result?.baseSource);
console.log("Focus:", result?.focusSource);

// If base is overridden but focus isn't, you get:
// baseSource: '/project/.stoneforge/prompts/steward-base.md'
// focusSource: 'built-in'
```

### Prompt Too Long

If the combined prompt is too long:

1. Move details to task context instead
2. Use behaviors for event-specific instructions
3. Link to external documentation
4. Focus on principles, not procedures
