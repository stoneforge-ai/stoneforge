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

## React rules

Whenever you write or modify React code, first read https://react.dev/learn/you-might-not-need-an-effect and apply it. Every `useEffect` you add or keep must justify itself against that guide. Default to **no** effect and look for one of these alternatives first:

- Deriving state from props during render (not in an effect).
- Computing the next value in an event handler instead of after state changes.
- `useMemo` / `useSyncExternalStore` for derived or external values.
- Event handlers for user-triggered side effects (fetches, mutations, navigation).

Acceptable reasons for `useEffect`: synchronising with something truly external to React (WebSocket lifecycle [likely should also use `useEffectEvent`], `window` event listeners, third-party DOM libraries like Konva's imperative APIs, timers). If the effect reads from or writes to React state only, it is almost certainly wrong — refactor.

When you do write an effect, it must have: an exhaustive dependency array, a cleanup function where one is needed, and no cascading state updates that would re-run the effect. Consider using `useEffectEvent` where applicable (a common use case for `useEffectEvent` is when you want to do something in response to an Effect, but that “something” depends on a value you don’t want to react to. Reference https://react.dev/reference/react/useEffectEvent only if necessary.)

**Async server state → TanStack Query.** Never put a fetch/mutation inside a `useEffect`. All async server state must go through `@tanstack/react-query`:

- Read: `useQuery({ queryKey, queryFn })`. Use the returned `data`, `isLoading`, `error` directly in render. Do not mirror them into local state.
- Write: `useMutation({ mutationFn, onSuccess })`. Call it from an event handler. Invalidate related queries via `queryClient.invalidateQueries({ queryKey })` on success.
- The `QueryClient` should be mounted once at the app root; don't create one per component.
- Derive UI state from query state during render; do not copy it with `useState` + `useEffect`.


## Commit Guidelines

- Create commits after meaningful units of work.
- Only commit the files you changed.
- Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, or `chore:`.

## Engineering Standards

**Software must be simple, well-separated, encapsulated, cohesive, loosely coupled, and explicit. DRY and SOLID are tools to support those goals, not goals by themselves. When principles conflict, prefer clarity, simplicity, and ease of change over abstraction purity.**

### Core standards

These take priority over the rest.

1. **Code must be simple.**
   Choose the simplest design that correctly solves the real problem.

2. **Code must have clear separation of concerns.**
   Distinct responsibilities must be kept in distinct modules, layers, or services.

3. **Modules must encapsulate their implementation details.**
   Internals must be hidden behind small, stable, well-defined interfaces.

### Structural standards

These support the core standards.

4. **Modules must be highly cohesive.**
   Each module should contain closely related behavior and one clear purpose.

5. **Modules must be loosely coupled.**
   A change in one module should require minimal change elsewhere.

6. **Code must be explicit and predictable.**
   Avoid hidden behavior, unnecessary magic, surprising side effects, and unclear control flow.

### Tactical standards

Use these as implementation heuristics, not absolute goals.

7. **Code must not duplicate knowledge or business rules.**
   Maintain a single source of truth for logic, policy, and domain meaning.

8. **Code must not introduce speculative abstraction.**
   Do not generalize for hypothetical future requirements.

9. **Composition should be preferred over inheritance.**
   Build behavior from small, composable parts unless inheritance is clearly simpler and safer.

10. **Software must follow SOLID where it improves maintainability.**
    In particular:

- modules should have one reason to change
- interfaces should be small and purpose-specific
- extensions should not require destabilizing existing code
- substitutes must honor their contracts
- high-level policy should depend on abstractions, not details

### Quality metrics

These metrics are acceptance gates for code quality. They do not replace judgment: a change that satisfies the numbers while making the system harder to understand, change, or test is still not acceptable. When tooling for a metric does not exist yet, write code and tests as if the metric were already enforced.

1. **Test coverage must prove behavior.**
   New or changed production behavior is expected to have 100% meaningful test coverage for its observable decisions, boundaries, and failure modes. Package-level coverage should not fall below 90% statements, 90% lines, 90% functions, and 85% branches. Critical policy, state-machine, authorization, parser, and persistence logic should meet at least 95% branch coverage. Do not use broad snapshot tests or incidental render coverage as a substitute for assertions about behavior.

2. **Dependency structure must point inward.**
   Dependencies must flow from volatile details toward stable policy. Domain and policy modules must not depend on UI, transport, persistence, framework, or process-level details. Cross-layer imports, circular dependencies, and broad shared modules are quality failures; fix the boundary instead of hiding the problem behind pass-through wrappers.

3. **Cyclomatic complexity must stay low.**
   New or changed functions should target cyclomatic complexity of 5 or less and must not exceed 10. If logic wants to exceed that limit, split it into named predicates, cohesive helper functions, explicit state machines, or strategy objects. Do not use extraction to hide tangled control flow; the result must be easier to read and test.

4. **CRAP scores must stay very low.**
   CRAP score should be below 5 for new or changed functions and must not exceed 10. Treat any function above the target as a design or test-strength smell: either reduce cyclomatic complexity, add behavior-proving tests, or both. Do not accept poorly tested complexity just because package-level coverage remains high.

5. **Module sizes must stay focused.**
   Production source modules should stay under 300 non-comment lines, and most should be smaller than 200. Test modules should stay under 500 non-comment lines unless they are mostly data tables or fixtures. A large module is acceptable only when it remains highly cohesive and is easier to understand together than apart. Do not add new responsibilities to an already-large module; split policy, adapters, validation, rendering, orchestration, and helpers into clear boundaries.

6. **Mutation testing should validate critical logic.**
   Critical business rules, state transitions, policy checks, parsers, and persistence decisions should achieve at least an 80% mutation score, with 90% expected for the highest-risk modules. Surviving mutations in changed critical code must either be killed with stronger tests or documented as equivalent mutations. When mutation tooling is not available, write tests that explicitly catch likely mutations such as inverted predicates, skipped guards, changed boundaries, removed error paths, and incorrect default cases.

### Quality automation

Run `pnpm quality` before handing off code. The Husky pre-commit hook runs this hygiene gate so commits stay easy to make while still meeting lint, coverage, dependency, CRAP, and structure standards. The Husky pre-push hook runs `pnpm quality:ci`, including mutation testing, so code cannot be pushed until the full quality gate passes. Repo-local Codex and Claude hooks run `pnpm quality:fast` after Edit/Write tool use and `pnpm quality:ci` at Stop through `pnpm quality:turn`, so agent turns should end only after the full toolchain passes. Do not bypass these checks unless the user explicitly asks for a partial or investigative change.

Codex and Claude Stop hooks are session-gated. Edit/Write hooks create a marker under `.git/stoneforge-quality-hooks/sessions/`, and Stop hooks run the full gate only when that marker exists for the current session. Hook receipts are appended to `.git/stoneforge-quality-hooks/history.log`, which provides local evidence of marked, skipped, passed, and failed hook runs without dirtying the worktree.

### Decision rule

When standards conflict, apply them in this order:

**simplicity > separation of concerns > encapsulation > cohesion/coupling > explicitness > DRY/SOLID heuristics**

Quality metrics validate these standards. They are never a reason to add indirection, obscure behavior, or split cohesive code mechanically.

### Required tradeoff rule

These standards must be applied with judgment, not mechanically.

- Do not apply **DRY** when doing so makes code harder to understand, test, or change.
- Do not apply **SOLID** in ways that introduce needless indirection or abstraction.
- Do not add abstractions until there is a real use case.
- Prefer duplication over the wrong abstraction.
- Prefer clarity over cleverness.

### Review test

A change is acceptable only if it makes the codebase, on balance:

- simpler
- easier to understand
- easier to change safely
- less coupled
- less repetitive in knowledge
- more predictable for future engineers
