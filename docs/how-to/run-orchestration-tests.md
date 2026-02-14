# How to Run Orchestration Tests

Guide for running the orchestration E2E test suite, which validates the full orchestration lifecycle: task creation, daemon dispatch, worker execution, and steward review.

## Overview

The test suite has two modes:
- **Mock mode** (default): Uses a mock session manager. Fast, no external dependencies.
- **Real mode**: Spawns actual `claude` processes via `SpawnerService`. Requires `claude` in PATH.

All 12 tests support both modes. Mock mode simulates agent behavior; real mode lets Claude actually execute tasks.

## Quick Start

### Run all tests (mock mode)

```bash
bun run test:orchestration
```

### Run all tests (real mode)

```bash
bun run test:orchestration --mode real --verbose
```

## CLI Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--mode <mock\|real>` | `-m` | Test mode (default: `mock`) |
| `--test <id>` | `-t` | Run specific test by ID (substring match) |
| `--tag <tag>` | | Filter tests by tag (`director`, `worker`, `steward`, `daemon`) |
| `--bail` | | Stop on first failure |
| `--verbose` | `-v` | Enable verbose logging |
| `--timeout <ms>` | | Override timeout for each test |
| `--skip-cleanup` | | Preserve temp workspace after run (for debugging) |
| `--help` | `-h` | Show help |

## Examples

### Run a single test

```bash
bun run test:orchestration --test "worker-marks-task-complete"
```

### Run tests by category

```bash
bun run test:orchestration --tag worker
bun run test:orchestration --tag director
bun run test:orchestration --tag steward
bun run test:orchestration --tag daemon
```

### Run real mode with bail and debugging

```bash
bun run test:orchestration --mode real --tag worker --bail --verbose --skip-cleanup
```

When `--skip-cleanup` is used, the temp workspace path is printed so you can inspect the git repo, worktrees, and database.

## Test List

| # | ID | Tags | What it validates |
|---|-----|------|-------------------|
| 1 | `director-creates-tasks` | director, task | Director creates a task from a prompt |
| 2 | `director-creates-plans` | director, plan | Director creates a multi-task plan |
| 3 | `daemon-dispatches-worker` | daemon, dispatch, worker | Daemon assigns unassigned task to available worker |
| 4 | `daemon-respects-dependencies` | daemon, dependencies | Blocked task waits until dependency resolves |
| 5 | `worker-uses-worktree` | worker, worktree, git | Worker operates in an isolated git worktree |
| 6 | `worker-commits-work` | worker, git, commit | Worker commits changes to its worktree branch |
| 7 | `worker-creates-merge-request` | worker, merge-request, git | Worker sets branch/MR metadata on task completion |
| 8 | `worker-marks-task-complete` | worker, task, completion | Task status transitions to closed |
| 9 | `worker-handoff-context` | worker, handoff, context | Worker creates handoff before context exhaustion |
| 10 | `daemon-spawns-steward-mr` | daemon, steward, merge-request | Merge request event triggers steward spawn |
| 11 | `steward-merges-passing` | steward, merge, tests | Steward merges PR when tests pass |
| 12 | `steward-handoff-failing` | steward, handoff, tests | Steward hands off to worker when tests fail |

## Timeouts

Mock mode uses per-test timeouts (30s-120s). Real mode applies longer category-based defaults:

| Category | Real mode timeout |
|----------|------------------|
| Director tests (1-2) | 240s |
| Daemon tests (3-4) | 180s |
| Worker tests (5-9) | 300s |
| Steward tests (10-12) | 300s |

Use `--timeout <ms>` to override.

## Test Environment

Each test run creates an isolated temporary workspace with:
- Fresh git repository with initial commit
- Local bare remote (`.test-remote.git`) for push operations
- Minimal project structure (`package.json`, `src/index.ts`, `README.md`)
- SQLite database in `.stoneforge/stoneforge.db`
- All orchestration services (daemon, agent registry, worktree manager, etc.)

In real mode, constrained prompt overrides are written to `.stoneforge/prompts/` to guide agents toward fast, deterministic behavior.

## Key Files

| File | Purpose |
|------|---------|
| `packages/smithy/src/testing/test-context.ts` | Test workspace setup, mode toggle, cleanup |
| `packages/smithy/src/testing/orchestration-tests.ts` | All 12 test definitions (mock + real paths) |
| `packages/smithy/src/testing/test-utils.ts` | Polling helpers and assertions |
| `packages/smithy/src/testing/test-prompts.ts` | Constrained prompts for real-mode agents |
| `packages/smithy/src/cli/commands/test-orchestration.ts` | CLI runner and flag parsing |
| `packages/smithy/src/testing/index.ts` | Public exports |

## Troubleshooting

**Tests pass in mock but fail in real mode**: Real mode depends on `claude` being installed and accessible. Verify with `which claude`.

**Orphan processes after interrupted run**: The cleanup handler registers SIGINT/SIGTERM handlers, but if the process is killed with SIGKILL, orphan `claude` processes may remain. Check with `ps aux | grep claude` and kill manually.

**Debugging a failing test**: Use `--skip-cleanup` to preserve the workspace, then inspect the git log, worktrees, and database in the temp directory.
