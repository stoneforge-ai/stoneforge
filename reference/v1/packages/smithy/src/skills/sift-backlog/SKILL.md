---
name: sift-backlog
description: Triage and organize backlog tasks into actionable plans. Use when asked to review the backlog, prioritize tasks, create plans from backlog items, or move tasks from backlog to open status. Handles the full workflow of listing backlog tasks, grouping related tasks into plans, setting priorities and dependencies, activating plans, and changing task status from backlog to open.
---

# Sift Backlog

Triage backlog tasks: prioritize, group into plans, set dependencies, and activate.

## Overview

1. List backlog tasks (`sf task backlog`)
2. Clarify and enrich each task (titles, descriptions)
3. Identify groupings and create draft plans
4. Add tasks to plans and set dependencies
5. Activate plans
6. Set task status to open

## Workflow

### Step 1: List Backlog Tasks

```bash
sf task backlog
```

### Step 2: Clarify and Enrich Tasks

Backlog tasks often have only a brief title with no description. Before organizing, ensure each task is well-defined.

**For each task, evaluate:**

- Is the title clear and actionable?
- Is there a description? Check with `sf task describe <task-id> --show`
- Is the scope unambiguous?

**If the title is unclear**, update it:

```bash
sf update <task-id> --title "Clear, actionable title"
```

**Add a description** with context, scope, and acceptance criteria:

```bash
sf task describe <task-id> --content "Description with:
- What needs to be done
- Why it matters
- Acceptance criteria
- Any relevant context"
```

**Use your best judgment** to interpret tasks and make reasonable decisions about scope, grouping, and priority. You have context about the codebase, project patterns, and typical development practices—leverage this knowledge rather than deferring to the user for routine decisions.

**Only ask the user for clarity when absolutely necessary:**

- The task is fundamentally ambiguous (multiple mutually exclusive interpretations)
- Critical business logic or user-facing behavior that could go wrong in meaningful ways
- External dependencies or integrations you cannot verify

**Do NOT ask about:**

- Implementation details you can reasonably infer
- Priority or grouping decisions—use your judgment
- Standard development practices (testing, code style, etc.)
- Tasks where a reasonable interpretation exists

### Step 3: Create Draft Plans

Group related tasks into plans using your best judgment. Plans start as drafts (tasks won't be dispatched until activated).

**Grouping guidance:**

- Group tasks that share a common theme, feature area, or goal
- Consider technical dependencies when grouping (tasks that touch the same files/modules)
- Separate unrelated work into distinct plans for parallel execution
- Don't over-group—if tasks are truly independent, separate plans enable better parallelism
- Don't under-group—related tasks benefit from shared context and coordinated execution

```bash
sf plan create --title "Plan Name"
```

**Example:**

```bash
sf plan create --title "Authentication Improvements"
# Output: Created plan el-abc123
```

### Step 4: Add Tasks to Plans

```bash
sf plan add-task <plan-id> <task-id>
```

**Example:**

```bash
sf plan add-task el-abc123 el-task1
sf plan add-task el-abc123 el-task2
```

### Step 5: Set Dependencies Between Tasks

Use `blocks` dependency when one task must complete before another can start.

```bash
sf dependency add <blocked-id> <blocker-id> --type blocks
```

**Semantics:** The first ID is blocked BY the second ID. The blocker must complete first.

**Example:** Task 2 can't start until Task 1 completes:

```bash
sf dependency add el-task2 el-task1 --type blocks
```

### Step 6: Update Priorities

Set priorities based on your assessment of impact, urgency, and dependencies. Use your judgment—you don't need user confirmation for routine prioritization.

**Priority guidance:**

- **Critical (1):** Blocking issues, security vulnerabilities, production bugs
- **High (2):** Important features with deadlines, significant user impact
- **Medium (3):** Standard feature work, most tasks default here
- **Low (4):** Nice-to-haves, minor improvements, tech debt
- **Minimal (5):** Backlog cleanup, documentation, exploratory work

```bash
sf update <task-id> --priority <1-5>
```

| Value | Level    |
| ----- | -------- |
| 1     | Critical |
| 2     | High     |
| 3     | Medium   |
| 4     | Low      |
| 5     | Minimal  |

### Step 7: Activate Plans

Once tasks are organized with dependencies set, activate plans to enable dispatch.

```bash
sf plan activate <plan-id>
```

### Step 8: Set Task Status to Open

Move tasks from backlog to open so they become ready for work.

```bash
sf update <id> --status open
```

## Other Actions

**Close obsolete tasks:**

```bash
sf task close <id> --reason "Won't do: <reason>"
```

**Defer tasks:**

```bash
sf task defer <id> --until <date>
```

**View existing plans:**

```bash
sf plan list
```

**View tasks in a plan:**

```bash
sf plan tasks <plan-id>
```

## Tips

- **Use your best judgment** for grouping, prioritization, and task interpretation—don't defer routine decisions to the user
- **Only escalate to the user** when ambiguity is fundamental and could lead to wasted work (mutually exclusive interpretations, critical business decisions)
- Make reasonable inferences about implementation details, scope, and priority based on codebase context
- Create plans before setting dependencies to avoid dispatch race conditions
- Always activate plans after dependencies are set
- Focus on oldest backlog items first (sorted by creation date)
- Every task should have a clear title and description before activation
- When uncertain about a minor detail, make a reasonable choice and document it in the task description—workers can ask if needed
