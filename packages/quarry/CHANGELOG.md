# @stoneforge/quarry

## 1.13.0

### Minor Changes

- a6979b2: Add autoLink and autoLinkProvider config fields to ExternalSyncConfig for automatic external issue creation on new tasks. Includes CLI commands `sf external-sync config set-auto-link <provider>` and `sf external-sync config disable-auto-link`.
- 6d8c238: Add autoLinkTask utility function for automatically creating external issues and linking them to tasks
- d7fde86: Wire auto-link into CLI `sf task create`: auto-links new tasks to external provider when configured. Add `--no-auto-link` flag to skip auto-linking.
- 2b9af01: Wire up CLI `sf external-sync pull` and `sf external-sync sync` commands to execute actual sync operations instead of displaying stub messages. Both commands now create a SyncEngine and call pull/sync directly, with support for --provider, --discover, and --dry-run flags.
- b55db0d: Add conflict detection and resolution module for external sync. Supports configurable strategies (last_write_wins, local_wins, remote_wins, manual) with field-level merge for non-overlapping changes. Includes manual conflict resolution via sync-conflict tag and metadata storage.
- ee163c2: Add `sf external-sync` CLI command with subcommands: config, config set-token, config set-project, link, unlink, push, pull, sync, status, and resolve. Supports --json, --quiet, and --verbose output modes.
- e9b59ad: Add ExternalSyncConfig to quarry configuration system with enabled, pollInterval, conflictStrategy, and defaultDirection fields. Includes defaults, validation, YAML config support, tracked config, and all merge/clone/diff utilities.
- 42e996d: Add `sf external-sync link-all` command for bulk-linking all unlinked tasks to external issues. Supports `--provider`, `--project`, `--status`, `--dry-run`, and `--batch-size` flags with graceful rate limit handling.
- 6a29d53: Fix pull path to use provider field map config instead of hardcoded binary status mapping

  - `externalItemToUpdates()` now delegates to `externalTaskToTaskUpdates()` using the provider's `TaskSyncFieldMapConfig`
  - `createTaskFromExternal()` also uses provider field map config for correct status, priority, taskType, and tag mapping
  - Linear adapter injects `sf:status:*` labels based on workflow state type (e.g., started → sf:status:in-progress)
  - Linear field map config now includes `statusLabels` and a label-aware `stateToStatus`
  - Pull now correctly maps: Linear "started" → in_progress, "triage" → backlog, GitHub sf:status:deferred → deferred

- 0db88ca: Add fetch-based GitHub REST API client for issue operations. Supports PAT authentication, rate limit handling with warnings, configurable base URL for GitHub Enterprise, and automatic pagination via Link headers.
- 0aa8ab9: Implement GitHub ExternalProvider and TaskSyncAdapter for external sync. Adds full GitHub provider with connection testing via GET /user, GitHubTaskAdapter wrapping the API client for issue CRUD, and GitHub-specific field mapping config for priority labels, task type labels, and status/state mapping.
- 75a0dd2: Add fetch-based Linear GraphQL API client and response types for issue operations. Supports API key authentication, rate limit handling with warnings, cursor pagination, partial GraphQL error handling, and typed error responses.
- 91a33de: Add Linear ExternalProvider, TaskSyncAdapter, and field mapping for bidirectional task sync. Includes workflow state caching, priority mapping (Linear 0-4 to Stoneforge 1-5), status mapping via workflow state types, and placeholder provider for default registry.
- 1902200: Add `--force` (`-f`) flag to `sf external-sync link-all` for re-linking tasks already linked to a different provider. Tasks linked to the same target provider are skipped. Works with `--dry-run` to preview re-link operations. Suggests `--force` when no unlinked tasks are found.
- e787cb8: Add native priority support to Linear provider: the Linear adapter now converts between Stoneforge priority (1-5) and Linear native priority (0-4) in create/update/pull operations. The sync engine and task-sync-adapter utilities pass through priority in both push and pull paths. GitHub provider is unaffected.
- e437527: Add provider registry for external sync providers. Includes ProviderRegistry class with register, get, list, and getAdaptersOfType operations. Ships with a placeholder GitHub provider registered by default.
- fb43e14: Add description/body sync on pull path. When pulling changes from external services (GitHub/Linear), the sync engine now syncs the issue body/description back to the Stoneforge task's description Document. Previously, body changes were detected in the hash but silently dropped. The pull path now creates or updates description Documents to match the external item's body, completing bidirectional description sync.
- f8c8a3f: Add `--force` (`-f`) flag to `sf external-sync push` command that skips content hash comparison and event query guards, forcing all linked tasks to be pushed regardless of whether their local content has changed.
- cb5e20d: Add status label mapping to GitHub field map. Exports GITHUB_STATUS_LABELS constant, adds optional statusLabels field to TaskSyncFieldMapConfig, and updates buildExternalLabels/parseExternalLabels to handle status labels. Updates gitHubStateToStatus() to use sf:status:\* labels for granular status inference from GitHub issues.
- d0775f3: Add sync engine for external service synchronization. Provides push(), pull(), and sync() operations to coordinate bidirectional sync between Stoneforge elements and external services (GitHub, Linear, etc.) with content hash change detection, configurable conflict resolution, and dry-run support.
- fd6f593: Sync labels (type, user tags) to Linear issues on create and update. Previously only the special "blocked" label was handled; sf:type:_ labels and user tags were silently dropped. Now all syncable labels are resolved to Linear label IDs and included in create/update mutations, with auto-creation for labels that don't exist in the workspace. Priority (sf:priority:_) and status (sf:status:\*) labels are filtered out since Linear handles those natively.
- 7c0a4ee: Sync sf:status and sf:priority labels to Linear for lossless round-tripping

  Linear issues now receive both native fields (priority, workflow state) and sf:\* labels
  (sf:priority:critical, sf:status:deferred, etc.) so the exact Stoneforge values survive
  round-tripping. Previously these labels were filtered out, causing lossy mapping where
  multiple Stoneforge statuses collapsed to the same Linear state.

- f525584: Add task sync adapter utilities for converting between Stoneforge tasks and external task representations. Includes taskToExternalTask, externalTaskToTaskUpdates, label building/parsing, description hydration, and diff detection.
- 0fad1bc: Wire up shouldAddBlockedLabel for Linear push path. Blocked tasks now map to the 'started' workflow state type and receive a native "blocked" label on the Linear issue. The label is automatically created if missing, added when a task becomes blocked, and removed when it transitions to another status. Adds getLabels() and createLabel() to LinearApiClient, and labelIds support to create/update issue inputs.

### Patch Changes

- b110e28: Fix autoLinkTask to use taskToExternalTask for full field mapping (priority, type, status labels, real description, native priority) instead of simplified inline input. Falls back to simplified input if mapping fails.
- b6dbaeb: Fix blocked label not being added to ExternalTaskInput.labels for Linear push path. The `shouldAddBlockedLabel()` function was imported but never called — the "blocked" label was only injected when the provider config had no `statusLabels`, but Linear's config includes `statusLabels` for pull-path label injection. Now the blocked label is always added for blocked tasks regardless of config.
- 1a52826: Fix content hash feedback loop in external sync push by excluding `metadata._externalSync` from content hash computation. Sync bookkeeping fields (lastPushedAt, lastPushedHash, etc.) no longer trigger unnecessary push cycles.
- 21f4b95: Fix InboxService schema CHECK constraint to include 'thread_reply' as a valid source_type, aligning the database schema with the core type system.
- aeec6bd: Fix Linear GraphQL DateTime type error by updating the listIssuesSince query variable type from DateTime to DateTimeOrDuration, matching Linear's updated schema.
- 15c7b60: Fix link-all command to include priority and taskType labels on external issues

  The `sf external-sync link-all` command now uses the full field mapping layer when creating external issues. Previously, only user tags were passed as labels; now issues correctly include `sf:priority:*` labels based on task priority, `sf:type:*` labels based on taskType, proper open/closed state based on task status, and hydrated description content.

- 8531ae4: Add createConfiguredProviderRegistry() utility that replaces placeholder providers with real configured providers when tokens are set. Fix CLI push handler to actually push via SyncEngine instead of just validating tasks.
- 8ad678f: Fix sync engine push path to use field mapping for labels. The push path now correctly generates sf:priority:_ and sf:type:_ labels via buildExternalLabels(), hydrates description content from descriptionRef, and resolves assignees — matching the behavior already used by the link-all command.
- 695b3b8: Fix tsconfig types array to use "bun" instead of "bun-types" for robust type resolution via @types/bun
- ea9c12c: Auto-create sf:\* labels on GitHub repos before assigning to issues, preventing 422 "Validation Failed" errors during link-all and push operations. Labels are cached per session for efficiency.
- 6c5a927: Remove assignee setting from external-sync push/link operations

  Stoneforge assignees are ephemeral agents (e.g., el-xxxx) that don't correspond to valid users on external platforms like GitHub. Setting assignees on external issues caused `sf external-sync link-all` to fail with validation errors. Assignees are no longer written to external systems during create or update operations. Reading assignees from external systems (pull) is preserved.

- 2826bb1: Skip closed/tombstone tasks in external sync push and pull. Push skips tasks with closed or tombstone status to avoid wasting API calls on finished work. Pull skips updates to closed/tombstone tasks unless the external item was reopened (state is open). Link metadata is preserved so reopened tasks resume syncing automatically.
- Updated dependencies [6d8c238]
- Updated dependencies [2c06cfa]
- Updated dependencies [e381bed]
- Updated dependencies [18314d8]
- Updated dependencies [e9b59ad]
- Updated dependencies [f056e73]
- Updated dependencies [21f4b95]
- Updated dependencies [8531ae4]
- Updated dependencies [e803c95]
- Updated dependencies [174765e]
- Updated dependencies [695b3b8]
- Updated dependencies [695b3b8]
- Updated dependencies [695b3b8]
- Updated dependencies [e787cb8]
- Updated dependencies [8b831fb]
- Updated dependencies [39299b8]
- Updated dependencies [0f840b9]
- Updated dependencies [456b9fd]
- Updated dependencies [0995fb6]
- Updated dependencies [d7fde86]
  - @stoneforge/smithy@1.13.0
  - @stoneforge/core@1.13.0
  - @stoneforge/storage@1.13.0
  - @stoneforge/shared-routes@1.13.0

## 1.12.0

### Minor Changes

- 0ebed52: Add --fix flag to sf doctor command for automated database repair. When used, it deletes orphaned rows violating foreign key constraints and rebuilds the blocked cache from the dependency graph.
- beab0ba: Add `sf metrics` CLI command for viewing provider usage statistics with filtering by time range, provider, and model.
- 3a034ee: Extend sf doctor to query smithy-server runtime diagnostics after existing DB health checks. Displays rate limits, stuck tasks, merge queue health, error rates, and agent pool utilization with pass/warn/fail status. Gracefully skips if smithy-server is unavailable.
- 1abb89d: Add sf log CLI command for querying operation log entries with level, category, since, task, agent, and limit filters

### Patch Changes

- Updated dependencies [0c48e64]
- Updated dependencies [beab0ba]
- Updated dependencies [1abb89d]
- Updated dependencies [3ebbf94]
- Updated dependencies [3a034ee]
- Updated dependencies [1301012]
- Updated dependencies [72977d9]
- Updated dependencies [133ef38]
  - @stoneforge/smithy@1.12.0
  - @stoneforge/core@1.12.0
  - @stoneforge/storage@1.12.0
  - @stoneforge/shared-routes@1.12.0

## 1.11.0

### Minor Changes

- c943c00: Add `sf docs dir` subcommand to quickly find the Documentation Directory document. Supports `--content` flag to include full markdown content, and standard `--json`/`--quiet` output modes.

### Patch Changes

- Updated dependencies [49631b0]
- Updated dependencies [b5bf6a3]
- Updated dependencies [09cec84]
- Updated dependencies [01631d3]
- Updated dependencies [bf942ee]
  - @stoneforge/storage@1.11.0
  - @stoneforge/smithy@1.11.0
  - @stoneforge/shared-routes@1.11.0
  - @stoneforge/core@1.11.0

## 1.10.2

### Patch Changes

- fd1ae79: Fix history command help text: correct short flag from `-n` to `-l` for `--limit` option
  - @stoneforge/smithy@1.10.2
  - @stoneforge/core@1.10.2
  - @stoneforge/storage@1.10.2
  - @stoneforge/shared-routes@1.10.2

## 1.10.1

### Patch Changes

- Updated dependencies [08ffa58]
  - @stoneforge/smithy@1.10.1
  - @stoneforge/core@1.10.1
  - @stoneforge/storage@1.10.1
  - @stoneforge/shared-routes@1.10.1

## 1.10.0

### Minor Changes

- c089311: Add optional `baseBranch` configuration field for explicitly setting the merge target branch. Supports config file (`base_branch`), environment variable (`STONEFORGE_BASE_BRANCH`), and CLI override. When unset, existing auto-detection behavior is preserved.

### Patch Changes

- 8a17c01: Fix CLI parser to accept kebab-case flags for camelCase options (e.g., --reply-to, --root-only, --doc-version). Both kebab-case and camelCase forms are now accepted, with kebab-case being the preferred convention.
- 490b026: Fix `sf install skills` failing to find skills in NPM installs by correcting package resolution from `@stoneforge/orchestrator-sdk` to `@stoneforge/smithy` in all four discovery paths.
- Updated dependencies [86032d2]
- Updated dependencies [f7df3bc]
- Updated dependencies [1828e64]
- Updated dependencies [69ab9e2]
- Updated dependencies [490b026]
- Updated dependencies [f4c7855]
  - @stoneforge/smithy@1.10.0
  - @stoneforge/core@1.10.0
  - @stoneforge/shared-routes@1.10.0
  - @stoneforge/storage@1.10.0

## 1.9.0

### Minor Changes

- c97555d: Add `sf docs` CLI command with `init` and `add` subcommands for streamlined documentation infrastructure management

### Patch Changes

- Updated dependencies [b4eca92]
- Updated dependencies [c93577b]
- Updated dependencies [db8ae6c]
  - @stoneforge/smithy@1.9.0
  - @stoneforge/core@1.9.0
  - @stoneforge/storage@1.9.0
  - @stoneforge/shared-routes@1.9.0

## 1.8.0

### Patch Changes

- 0b521cd: Replace inline bulk task update/delete routes with shared createTaskRoutes factory from @stoneforge/shared-routes.
- Updated dependencies [0b521cd]
- Updated dependencies [0b521cd]
  - @stoneforge/shared-routes@1.8.0
  - @stoneforge/smithy@1.8.0
  - @stoneforge/core@1.8.0
  - @stoneforge/storage@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies [ddab519]
- Updated dependencies [23c7deb]
- Updated dependencies [61a672d]
- Updated dependencies [9b29d2b]
- Updated dependencies [b884a2b]
- Updated dependencies [0de4580]
  - @stoneforge/smithy@1.7.0
  - @stoneforge/core@1.7.0
  - @stoneforge/storage@1.7.0
  - @stoneforge/shared-routes@1.7.0

## 1.6.0

### Patch Changes

- e1d7d77: Add getOrgChart() and sendDirectMessage() methods to the QuarryAPI interface
- Updated dependencies [8a9c57d]
- Updated dependencies [e4d7815]
  - @stoneforge/smithy@1.6.0
  - @stoneforge/core@1.6.0
  - @stoneforge/storage@1.6.0
  - @stoneforge/shared-routes@1.6.0

## 1.5.0

### Patch Changes

- Updated dependencies [ac2db90]
- Updated dependencies [dcd3a8c]
- Updated dependencies [a5a8ff0]
- Updated dependencies [a40b09e]
- Updated dependencies [1ac72cc]
- Updated dependencies [f5eb10f]
- Updated dependencies [87e2883]
- Updated dependencies [6c22879]
- Updated dependencies [9a147df]
- Updated dependencies [4cded6a]
- Updated dependencies [53c79f5]
- Updated dependencies [3a909a2]
  - @stoneforge/smithy@1.5.0
  - @stoneforge/core@1.5.0
  - @stoneforge/storage@1.5.0
  - @stoneforge/shared-routes@1.5.0

## 1.4.1

### Patch Changes

- Updated dependencies [b92e7d8]
  - @stoneforge/smithy@1.4.1
  - @stoneforge/core@1.4.1
  - @stoneforge/storage@1.4.1
  - @stoneforge/shared-routes@1.4.1

## 1.4.0

### Minor Changes

- af799d2: Add DEFAULT_AGENTS_MD template constant for use during `sf init` workspace initialization
- 1ec9f66: Wire AGENTS.md creation and skills installation into sf init command

### Patch Changes

- @stoneforge/smithy@1.4.0
- @stoneforge/core@1.4.0
- @stoneforge/storage@1.4.0
- @stoneforge/shared-routes@1.4.0

## 1.3.0

### Patch Changes

- 1949799: Register missing CLI aliases (add, new, ls, complete) and add undocumented aliases (dep, msg, doc) to help text
- cfb1ee2: Remove dead --no-open flag from serve command schema
- Updated dependencies [9bd5c22]
- Updated dependencies [8e6aa99]
- Updated dependencies [8e6aa99]
- Updated dependencies [0ab3792]
- Updated dependencies [cfb1ee2]
- Updated dependencies [7e0053c]
  - @stoneforge/smithy@1.3.0
  - @stoneforge/storage@1.3.0
  - @stoneforge/shared-routes@1.3.0
  - @stoneforge/core@1.3.0

## 1.2.0

### Minor Changes

- 4fc3f2a: Display computed 'blocked' status in CLI task list and show commands for tasks with unresolved dependencies

### Patch Changes

- bd78abd: Export identity API functions (resolveActor, validateSoftActor, createVerificationMiddleware) and ActorSource type from systems module
- dd47614: Rename 70 bun:test files to .bun.test.ts naming convention so vitest excludes them from collection. Add vitest.config.ts with exclude pattern.
- 2872120: Reduce auto-export polling frequency from 500ms to 5 minutes to decrease unnecessary I/O
- Updated dependencies [c7c3a2e]
- Updated dependencies [acf6ed0]
- Updated dependencies [a468899]
- Updated dependencies [4fc3f2a]
- Updated dependencies [dd47614]
- Updated dependencies [2cec11b]
- Updated dependencies [dd47614]
- Updated dependencies [9b92e7d]
- Updated dependencies [bbd2d1f]
- Updated dependencies [430695f]
- Updated dependencies [c3030f7]
- Updated dependencies [6ad6161]
- Updated dependencies [6a03ab1]
- Updated dependencies [6835442]
- Updated dependencies [ff790e4]
- Updated dependencies [70dd977]
- Updated dependencies [dfa164c]
- Updated dependencies [ab58a62]
- Updated dependencies [af0b8f3]
  - @stoneforge/smithy@1.2.0
  - @stoneforge/core@1.2.0
  - @stoneforge/storage@1.2.0
  - @stoneforge/shared-routes@1.2.0

## 1.1.0

### Minor Changes

- 24ca206: Add `sf plan auto-complete` CLI command that scans all active plans and transitions those with 100% task completion to completed status. Includes `--dry-run` mode and `sweep` alias.

### Patch Changes

- 2af42ec: - Fix `sf init` to import JSONL files from `.stoneforge/sync/` (where auto-export writes) instead of the stale root `.stoneforge/` directory.
  - @stoneforge/smithy@1.1.0
  - @stoneforge/core@1.1.0
  - @stoneforge/storage@1.1.0
  - @stoneforge/shared-routes@1.1.0

## 1.0.3

### Patch Changes

- d088df0: - Fix `sf -V` reporting hardcoded "v0.1.0" instead of actual installed version by reading version from package.json at runtime.
  - Fix `sf init` failing with "Referenced element does not exist" when cloning a repo with stale JSONL files. Dependencies referencing elements not in `elements.jsonl` are now skipped gracefully instead of triggering a fatal foreign key violation.
  - Wire up automatic JSONL export via new `AutoExportService`. When `sync.autoExport` is enabled (default), the server polls for dirty elements and incrementally exports to `.stoneforge/sync/` on each mutation.
- Updated dependencies [f4c196e]
  - @stoneforge/smithy@1.0.3
  - @stoneforge/core@1.0.3
  - @stoneforge/storage@1.0.3
  - @stoneforge/shared-routes@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [8d82c91]
  - @stoneforge/smithy@1.0.2
  - @stoneforge/core@1.0.2
  - @stoneforge/storage@1.0.2
  - @stoneforge/shared-routes@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [1a52cad]
  - @stoneforge/smithy@1.0.1
  - @stoneforge/core@1.0.1
  - @stoneforge/storage@1.0.1
  - @stoneforge/shared-routes@1.0.1

## 1.0.0

### Minor Changes

- 251485f: Add dispatch-ready task listing CLI command, fix blocked cache cascade for plan-level dependencies, add blocked-plan filter to ready(), update sf init gitignore template and handle cloned repos

### Patch Changes

- Updated dependencies [251485f]
  - @stoneforge/smithy@1.0.0
  - @stoneforge/core@1.0.0
  - @stoneforge/storage@1.0.0
  - @stoneforge/shared-routes@1.0.0
