# V1 Reference Navigation

Use this document only when you need historical V1 behavior, old UX patterns, or prior implementation details while building active Stoneforge V2 work. The V1 workspace is frozen reference material; do not edit `reference/v1/`, V1 workspace docs, or the legacy documentation directory unless the user explicitly asks for legacy maintenance.

## Legacy Workspace Docs

Historical V1 documentation can be inspected with:

```bash
sf show el-30yb
sf show el-og6v
sf document search "your topic"
```

- Documentation directory: `sf show el-30yb`
- Category index: `sf show el-og6v`
- Full-text search: `sf document search "your topic"`

Use these commands only for historical context. They are not part of the active V2 documentation flow.

## Reference Workspace

Use `reference/v1/` only to find prior implementations, historical behavior, or old UX patterns.

| I need to find...                              | Key Reference Locations                                                                                                          | Legacy Doc                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Old API server entrypoints and route structure | `reference/v1/apps/quarry-server/src/index.ts`, `reference/v1/apps/smithy-server/src/routes/`                                    | `sf show el-5z1q`                    |
| Old core types and event model                 | `reference/v1/packages/core/src/types/`                                                                                          | `sf show el-6c3s`, `sf show el-58k3` |
| Old dependency and task-readiness logic        | `reference/v1/packages/quarry/src/services/dependency.ts`                                                                        | `sf show el-200z`                    |
| Old Quarry API and CLI behavior                | `reference/v1/packages/quarry/src/api/quarry-api.ts`, `reference/v1/packages/quarry/src/cli/commands/`                           | `sf show el-kflh`, `sf show el-59tr` |
| Old orchestration API and services             | `reference/v1/packages/smithy/src/api/orchestrator-api.ts`, `reference/v1/packages/smithy/src/services/`                         | `sf show el-3qg2`, `sf show el-50ia` |
| Old runtime, spawning, and session lifecycle   | `reference/v1/packages/smithy/src/runtime/spawner.ts`, `reference/v1/packages/smithy/src/runtime/session-manager.ts`             | -                                    |
| Old role and prompt definitions                | `reference/v1/packages/smithy/src/types/role-definition.ts`, `reference/v1/packages/smithy/src/prompts/`, `.stoneforge/prompts/` | `sf show el-32rb`                    |
| Old identity and system config                 | `reference/v1/packages/quarry/src/systems/identity.ts`, `reference/v1/packages/quarry/src/config/`                               | `sf show el-2jw5`, `sf show el-z1sj` |
| Old smithy-web routes and hooks                | `reference/v1/apps/smithy-web/src/routes/`, `reference/v1/apps/smithy-web/src/api/hooks/`                                        | `sf show el-4b3q`                    |
| Old quarry-web routes and hooks                | `reference/v1/apps/quarry-web/src/routes/`, `reference/v1/apps/quarry-web/src/api/hooks/`                                        | `sf show el-4iiz`                    |
| Old shared UI components                       | `reference/v1/packages/ui/src/`                                                                                                  | `sf show el-2hk5`                    |
| Old frontend architecture patterns             | `reference/v1/apps/smithy-web/src/`, `reference/v1/apps/quarry-web/src/`                                                         | `sf show el-935d`                    |
| Old docs site content                          | `reference/v1/apps/docs/src/content/docs/`                                                                                       | -                                    |

## Local Inspection

If you need to run the historical workspace locally:

```bash
pnpm --dir reference/v1 install
pnpm --dir reference/v1 dev:smithy
pnpm --dir reference/v1 dev:platform
```

If you need to inspect the UI/UX prototype:

```bash
npm --prefix reference/smithy-next install
npm --prefix reference/smithy-next run dev
```
