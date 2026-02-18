# @stoneforge/smithy

## 1.4.0

### Patch Changes

- Updated dependencies [af799d2]
- Updated dependencies [1ec9f66]
  - @stoneforge/quarry@1.4.0
  - @stoneforge/core@1.4.0
  - @stoneforge/storage@1.4.0
  - @stoneforge/shared-routes@1.4.0

## 1.3.0

### Minor Changes

- 9bd5c22: Add optional executablePath field to agent metadata and registration inputs, allowing each agent to store a custom executable path for its provider CLI
- 8e6aa99: Add server-side settings API with SettingsService and GET/PUT /api/settings/agent-defaults routes for workspace-wide executable path configuration
- 7e0053c: Wire executable paths into provider resolution during spawn: resolve from agent metadata, workspace defaults, or provider built-in default. Pass pathToClaudeCodeExecutable to Claude SDK for headless sessions.

### Patch Changes

- 0ab3792: Add ID collision detection to agent registry to prevent intermittent SQLITE_CONSTRAINT_PRIMARYKEY errors during rapid agent registration
- cfb1ee2: Remove dead --no-open flag from serve command schema
- Updated dependencies [8e6aa99]
- Updated dependencies [1949799]
- Updated dependencies [cfb1ee2]
  - @stoneforge/storage@1.3.0
  - @stoneforge/quarry@1.3.0
  - @stoneforge/shared-routes@1.3.0
  - @stoneforge/core@1.3.0

## 1.2.0

### Minor Changes

- acf6ed0: Extend PATCH /api/agents/:id endpoint to support updating steward triggers with validation and scheduler re-registration
- a468899: Add Custom Steward support: extend StewardFocus type with 'custom' option, add playbook field to StewardMetadata, integrate playbook-based workflow creation in steward-scheduler, and validate playbook on agent registration routes.
- 4fc3f2a: Compute and return effective 'blocked' status in task API responses for tasks with unresolved dependencies
- bbd2d1f: Fix docs/custom steward sessions not terminating after agent completes

  - Detect agent completion signal in spawner: close headless session when a
    non-error `result` message is received, breaking the for-await loop that
    previously kept sessions running indefinitely
  - Add idle timeout monitoring for spawned steward sessions (configurable,
    default 2 minutes) with max duration safety net (default 30 minutes)
  - Add steward-specific session reaping in dispatch daemon with configurable
    `maxStewardSessionDurationMs` (default 30 minutes)

- 430695f: Add structured logging framework with log-level filtering. New `createLogger` factory and `getLogLevel` utility support DEBUG, INFO, WARNING, and ERROR levels configurable via `LOG_LEVEL` environment variable. All server service console calls migrated to use leveled logger.
- c3030f7: Add plan auto-completion polling to dispatch daemon. Plans where all non-tombstone tasks are closed are now automatically marked as completed during the daemon's polling cycle.
- 6ad6161: Add `playbookId` field to StewardMetadata and RegisterStewardInput for referencing Workflow Templates by ID. The steward scheduler resolves playbookId at execution time, falling back to inline playbook content for backward compatibility. API routes accept either `playbook` or `playbookId` for custom steward creation.
- 6a03ab1: Add optional provider and model fields to PoolAgentTypeConfig, allowing each agent type within a pool to specify which AI provider and model to use when spawning agents. Extends CLI --agentType format, API validation, and pool show display.
- 6835442: Add improper session exit detection and recovery steward spawning to dispatch daemon. When a worker is resumed 3+ times without a status change, the daemon stops resuming and spawns a recovery steward instead.
- ff790e4: Register recovery steward prompt in the prompt system: add 'recovery' to StewardFocus type, register steward-recovery.md in PROMPT_FILES, and update all validation, CLI, server routes, and test helpers to accept the new focus area.
- 70dd977: Remove legacy steward types (health, ops, reminder) from type definitions, UI components, CLI help text, prompt files, and documentation. StewardFocus now only supports 'merge' and 'docs'.
- dfa164c: Steward scheduler improvements: spawn agent sessions for docs/health/reminder/ops stewards instead of calling dedicated services directly, auto-register stewards with the scheduler on agent creation/update, register all stewards when the dispatch daemon starts the scheduler, add structured logging throughout the scheduler lifecycle, and fix duplicate timer bug in `scheduleNextRun` where the `finally` block created orphaned timers on overlapping cron ticks.

### Patch Changes

- c7c3a2e: Add 'custom' to steward focus CLI help text, option descriptions, and code comments so users can discover the custom focus option.
- 2cec11b: Rename 31 bun-specific test files to use .bun.test.ts naming convention and add vitest.config.ts to exclude them from vitest collection. This prevents vitest from reporting false failures when trying to run bun:test imports.
- 9b92e7d: Fix agent pool creation by using createEntity() factory to generate element IDs, resolving NOT NULL constraint violation on tags.element_id
- ab58a62: Update @anthropic-ai/claude-agent-sdk from ^0.2.41 to ^0.2.45 and @opencode-ai/sdk from ^1.1.64 to ^1.2.6
- af0b8f3: Add critical session exit rules to worker prompt and create recovery steward prompt
- Updated dependencies [4fc3f2a]
- Updated dependencies [bd78abd]
- Updated dependencies [dd47614]
- Updated dependencies [dd47614]
- Updated dependencies [dd47614]
- Updated dependencies [2872120]
  - @stoneforge/quarry@1.2.0
  - @stoneforge/core@1.2.0
  - @stoneforge/storage@1.2.0
  - @stoneforge/shared-routes@1.2.0

## 1.1.0

### Patch Changes

- Updated dependencies [24ca206]
- Updated dependencies [2af42ec]
  - @stoneforge/quarry@1.1.0
  - @stoneforge/core@1.1.0
  - @stoneforge/storage@1.1.0
  - @stoneforge/shared-routes@1.1.0

## 1.0.3

### Patch Changes

- f4c196e: - Wire up `AutoExportService` in the orchestrator server so JSONL files at `.stoneforge/sync/` stay in sync with the database automatically.
- Updated dependencies [d088df0]
  - @stoneforge/quarry@1.0.3
  - @stoneforge/core@1.0.3
  - @stoneforge/storage@1.0.3
  - @stoneforge/shared-routes@1.0.3

## 1.0.2

### Patch Changes

- 8d82c91: Fix `posix_spawnp failed` for bun users by ensuring node-pty spawn-helper permissions at runtime before pty.spawn(), since bun skips postinstall scripts by default.
  - @stoneforge/quarry@1.0.2
  - @stoneforge/core@1.0.2
  - @stoneforge/storage@1.0.2
  - @stoneforge/shared-routes@1.0.2

## 1.0.1

### Patch Changes

- 1a52cad: Fix `posix_spawnp failed` error when node-pty spawn-helper lacks execute permissions after NPM install. The fix script now ships with the published package and uses `require.resolve` to locate node-pty regardless of package manager.
  - @stoneforge/quarry@1.0.1
  - @stoneforge/core@1.0.1
  - @stoneforge/storage@1.0.1
  - @stoneforge/shared-routes@1.0.1

## 1.0.0

### Minor Changes

- 251485f: Fix plugin executor timeout by using process group kill to ensure child processes are terminated on CI

### Patch Changes

- Updated dependencies [251485f]
  - @stoneforge/quarry@1.0.0
  - @stoneforge/core@1.0.0
  - @stoneforge/storage@1.0.0
  - @stoneforge/shared-routes@1.0.0
