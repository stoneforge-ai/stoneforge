# AGENTS.md

Context and instructions for AI coding agents working on the Stoneforge repository.

## Current Repo Mode

- Active Stoneforge V2 work lives at the repository root in `docs/v2/`, `apps/`, and `packages/`.
- `reference/v1/` is frozen and exists only for historical code and behavior reference.
- `reference/smithy-next/` is a UI/UX prototype reference.
- Unless the user explicitly asks for V1 or prototype work, do not edit `reference/`.
- If a task mentions old Smithy or Quarry paths, translate them to `reference/v1/...`.

## Canonical V2 Docs

Read these first for V2 work:

- `docs/v2/README.md` — canonical charter
- `docs/v2/system-model.md`
- `docs/v2/state-machines.md`
- `docs/v2/runtime-architecture.md`
- `docs/v2/policy-auth-audit.md`
- `docs/v2/integrations-and-first-slice.md`

## Legacy V1 Workspace Docs

These are reference-only tools for looking up historical V1 context inside the old Stoneforge workspace data:

- Documentation directory: `sf show el-30yb`
- Category index: `sf show el-og6v`
- Full-text search: `sf document search "your topic"`

Use them only when you need V1 reference material. They are not part of the active V2 documentation flow, and they should not be updated unless the user explicitly asks for legacy-doc maintenance.

## Quick Start

### Active V2 Starting Points

| I need... | Key Files |
|-----------|-----------|
| Read the V2 charter | `docs/v2/README.md` |
| Understand the V2 system model | `docs/v2/system-model.md` |
| Understand V2 lifecycle/state transitions | `docs/v2/state-machines.md` |
| Understand runtime and dispatch | `docs/v2/runtime-architecture.md` |
| Understand policy, auth, and audit | `docs/v2/policy-auth-audit.md` |
| Understand the first build slice | `docs/v2/integrations-and-first-slice.md` |

### V1 Reference Navigation Quick Reference

Use these only to find prior implementations, historical behavior, or old UX patterns.

| I need to find... | Key Reference Locations | Legacy Doc |
|-------------------|-------------------------|------------|
| Old API server entrypoints and route structure | `reference/v1/apps/quarry-server/src/index.ts`, `reference/v1/apps/smithy-server/src/routes/` | `sf show el-5z1q` |
| Old core types and event model | `reference/v1/packages/core/src/types/` | `sf show el-6c3s`, `sf show el-58k3` |
| Old dependency and task-readiness logic | `reference/v1/packages/quarry/src/services/dependency.ts` | `sf show el-200z` |
| Old Quarry API and CLI behavior | `reference/v1/packages/quarry/src/api/quarry-api.ts`, `reference/v1/packages/quarry/src/cli/commands/` | `sf show el-kflh`, `sf show el-59tr` |
| Old orchestration API and services | `reference/v1/packages/smithy/src/api/orchestrator-api.ts`, `reference/v1/packages/smithy/src/services/` | `sf show el-3qg2`, `sf show el-50ia` |
| Old runtime, spawning, and session lifecycle | `reference/v1/packages/smithy/src/runtime/spawner.ts`, `reference/v1/packages/smithy/src/runtime/session-manager.ts` | — |
| Old role and prompt definitions | `reference/v1/packages/smithy/src/types/role-definition.ts`, `reference/v1/packages/smithy/src/prompts/`, `.stoneforge/prompts/` | `sf show el-32rb` |
| Old identity and system config | `reference/v1/packages/quarry/src/systems/identity.ts`, `reference/v1/packages/quarry/src/config/` | `sf show el-2jw5`, `sf show el-z1sj` |
| Old smithy-web routes and hooks | `reference/v1/apps/smithy-web/src/routes/`, `reference/v1/apps/smithy-web/src/api/hooks/` | `sf show el-4b3q` |
| Old quarry-web routes and hooks | `reference/v1/apps/quarry-web/src/routes/`, `reference/v1/apps/quarry-web/src/api/hooks/` | `sf show el-4iiz` |
| Old shared UI components | `reference/v1/packages/ui/src/` | `sf show el-2hk5` |
| Old frontend architecture patterns | `reference/v1/apps/smithy-web/src/`, `reference/v1/apps/quarry-web/src/` | `sf show el-935d` |
| Old docs site content | `reference/v1/apps/docs/src/content/docs/` | — |

### Prototype Reference

- `reference/smithy-next/` is a UI and workflow prototype only.
- Use it for product and interaction reference, not as the active implementation target.

## Repository Structure

```text
docs/v2/                 # Canonical V2 charter and build-shaping docs
apps/                    # Active V2 apps only
packages/                # Active V2 packages only
reference/
├── v1/                  # Frozen V1 workspace for reference
│   ├── apps/
│   ├── packages/
│   ├── .changeset/
│   └── scripts/
└── smithy-next/         # UI/UX prototype reference

.stoneforge/             # Local project data
```

## Development Workflow

### Active V2 Workspace

```bash
pnpm install
pnpm typecheck
pnpm build
```

These commands only target the active V2 workspace at the root. Until V2 packages are added under `apps/` or `packages/`, they intentionally no-op.

### Reference Inspection

If you need to inspect legacy behavior locally:

```bash
pnpm --dir reference/v1 install
pnpm --dir reference/v1 dev:smithy
pnpm --dir reference/v1 dev:platform

npm --prefix reference/smithy-next install
npm --prefix reference/smithy-next run dev
```

## V1 Behavioral Notes

These are reading notes for historical V1 code, not implementation rules for V2.

- `blocked` status was computed from dependencies rather than set directly.
- `sf dependency add --type=blocks A B` meant A was blocked by B.
- SQLite was a cache; JSONL was the source of truth.
- `relates-to` was effectively bidirectional in query behavior.
- Closed and tombstone states won during merge conflict resolution.

## Implementation Guidelines

### Type Safety

- Use branded types where the codebase expects them.
- Implement type guards instead of spreading unchecked casts.
- Use casts only at trust boundaries.

### V2 Design Discipline

- Follow the contracts in `docs/v2/`.
- Do not freeze schema, payload, or API details that the V2 docs intentionally leave open.
- Do not reintroduce V1 structures by inertia just because a historical implementation exists.

### Testing

- For active V2 work, keep tests close to source and aligned with the first-slice contracts.
- Treat V1 tests as historical examples only.

### Error Handling

- Keep V2 error contracts aligned with the first-slice docs instead of reusing V1 shapes by default.

## Keeping Docs Updated

When your changes affect documented V2 behavior:

1. Update `docs/v2/`.
2. Use the legacy `sf` docs/search commands only when you need historical V1 context.
3. Do not update V1 workspace docs or the V1 documentation directory unless the user explicitly asks for legacy-doc maintenance.

## Commit Guidelines

- Create commits after meaningful units of work.
- Only commit the files you changed.
- Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, or `chore:`.
