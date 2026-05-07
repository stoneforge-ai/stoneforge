---
"@stoneforge/smithy": patch
---

fix(smithy): `sf task merge` honors workspace `merge.targetBranch` config (#63)

`sf task merge`, `sf task complete`, `sf task sync`, and `sf task update --status merged` previously resolved the merge target as `task.targetBranch → git origin/HEAD → main`, ignoring the workspace-level `merge.targetBranch` value in `.stoneforge/config.yaml`. The config value was only consumed by prompt-builders (sessions, steward scheduler, dispatch daemon) for system-prompt context, so setting `merge.target_branch: dev` told agents the right thing in their prompts but did nothing to the actual git tooling.

Resolution is now `task.targetBranch → workspace config (`merge.targetBranch`) → git origin/HEAD → main` across all merge-related CLI paths and the MR-creation path in `task-assignment-service.ts`. Stewards (which cannot own a `targetBranch` field directly) finally have a config-only path to set a project-wide target.
