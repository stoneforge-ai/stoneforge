# AGENTS.md

Context and instructions for AI coding agents working on the Stoneforge repository.

## Current Repo Mode

- Active Stoneforge V2 work lives at the repository root in `docs/v2/`, `apps/`, and `packages/`.
- `reference/v1/` is frozen and exists only for historical code and behavior reference.
- Unless the user explicitly asks for V1 or prototype work, do not edit `reference/`.
- If a task mentions old Smithy or Quarry paths, translate them to `reference/v1/...`.
- `reference/smithy-next/` is a UI/UX and workflow prototype only, designed as the ideal Stoneforge V2 interface. Use it for product and interaction reference, not as the active implementation target.

## Canonical V2 Docs

Read these first for V2 work:

- `docs/v2/README.md` — charter
- `docs/v2/system-model.md` — system model
- `docs/v2/state-machines.md` — lifecycle/state transitions
- `docs/v2/runtime-architecture.md` — runtime and dispatch
- `docs/v2/policy-auth-audit.md` — policy, auth, and audit
- `docs/v2/integrations-and-first-slice.md` — first build slice

For historical behavior, old UX patterns, or prior implementations, use `docs/v2/v1-reference.md`. Do not edit `reference/` unless the user explicitly asks for legacy or prototype work.

Use V2 docs as planning contracts: they should explain product intent, domain language, behavioral guarantees, and architectural constraints before code relies on them. Good doc updates are concise, durable, and decision-oriented; they name the behavior being promised, the boundary it affects, and any intentionally unresolved details. Update `docs/v2/` when implementation changes documented V2 behavior.

## Implementation Guidelines

### Type Safety

- Use branded types where the codebase expects them.
- Implement type guards instead of spreading unchecked casts.
- Use casts only at trust boundaries.
- NEVER use `any` or `unknown` except if approved by the user.

### V2 Design Discipline

- Follow the contracts in `docs/v2/`.
- Do not freeze schema, payload, or API details that the V2 docs intentionally leave open.
- Do not copy historical structures by inertia; preserve the V2 model unless the docs or user explicitly require otherwise.

### Testing

- Keep tests close to source and aligned with the package Interface that production callers use.
- Test coverage: use unit tests and property tests where useful to prove observable decisions, boundaries, invariants, and failure modes. Coverage must satisfy the thresholds in Engineering Standards.
- Mutation tests: critical policy, state-machine, parser, authorization, persistence, and dispatch logic must have tests strong enough to kill meaningful mutations, not just execute lines.
- E2E tests: use the `playwright-cli` skill for browser workflows, screenshots, and UI regressions when a change affects an interactive app or user-visible flow.

### Error Handling

- Keep error contracts aligned with the first-slice docs.
- Guard expected failure modes before they reach users; show human-readable errors instead of broken states, raw exceptions, or provider payloads.
- Error messages should identify what failed, preserve enough context for debugging, and recommend the next action for common recoverable problems.

### React rules

When writing or modifying React code, read `docs/engineering/react.md` before implementation. It explains when Effects are valid, how to avoid unnecessary Effects, and how to handle async server state.

Hard rules: every `useEffect` must synchronize with something external to React, fetches and mutations must use `@tanstack/react-query`, and query state must be rendered directly instead of mirrored into local component state.

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

### Architecture depth standards

Use the vocabulary and principles from `.agents/skills/improve-codebase-architecture/SKILL.md` when these standards are ambiguous.

1. **Modules must be deep, not merely small.**
   A Module is acceptable when its Interface gives callers meaningful Leverage and keeps Implementation knowledge local. A small shallow Module is worse than a larger cohesive deep Module.

2. **The Interface is the test surface.**
   Tests should usually cross the same Interface that production callers use. Testing internal helpers is acceptable only when that internal Seam materially improves Locality without leaking implementation details into callers.

3. **Use the deletion test before extracting.**
   Before adding a Module, imagine deleting it. If complexity disappears, the Module is likely pass-through structure. If complexity would reappear across multiple callers, the Module is earning its keep.

4. **Seams must represent real variation.**
   Add a Seam only when behavior must vary behind an Interface. One Adapter is a hypothetical Seam; two Adapters make the Seam real. A first-slice provider Seam may exist ahead of the second Adapter only when the V2 docs clearly reserve that variation.

5. **Prefer Locality over metric gaming.**
   Do not split cohesive policy, state transitions, validation, or orchestration just to satisfy line-count, complexity, or test-isolation metrics. Improve the Interface first; split only when doing so improves Leverage or Locality.

### Quality metrics

Metrics are quality gates, not substitutes for judgment. Passing numbers do not justify code that is harder to understand, change, or test.

1. **Coverage:** new or changed behavior needs meaningful tests for decisions, boundaries, and failure modes. Minimum package coverage is 90% statements/lines/functions and 85% branches; critical policy, state-machine, authorization, parser, and persistence logic should reach 95% branch coverage.

2. **Dependencies:** dependencies must point inward toward stable policy. Domain/policy modules must not depend on UI, transport, persistence, framework, or process details; circular dependencies and cross-layer imports are quality failures.

3. **Complexity:** new or changed functions should target cyclomatic complexity <= 5 and must not exceed 10. Split complex logic only when the result is easier to read and test.

4. **CRAP:** new or changed functions should stay below 5 and must not exceed 10. Fix high CRAP by reducing complexity, strengthening behavior tests, or both.

5. **Module size:** production modules should usually stay under 300 non-comment lines, but depth and cohesion matter more than small files. Split only when it improves Interface Leverage or Implementation Locality.

6. **Mutation:** critical logic should achieve at least 80% mutation score, with 90% expected for highest-risk modules. Kill surviving meaningful mutations with stronger tests or document them as equivalent.

### Quality automation

Run `pnpm quality` before handing off code. Pre-commit runs `quality`; pre-push and agent Stop hooks run `quality:ci`; Edit/Write hooks run `quality:fast`. Do not bypass these checks unless the user explicitly asks for a partial or investigative change.

Codex and Claude Stop hooks are session-gated: Edit/Write hooks create a marker under `.git/stoneforge-quality-hooks/sessions/`, and Stop hooks run only when that marker exists. Hook receipts are appended to `.git/stoneforge-quality-hooks/history.log`.

When committing, commit only files you changed after a meaningful unit of work and use conventional prefixes such as `feat:`, `fix:`, `docs:`, or `chore:`.

### Decision and tradeoff rule

When standards conflict, apply them in this order:

**simplicity > separation of concerns > encapsulation > cohesion/coupling > explicitness > DRY/SOLID heuristics**

Apply these standards with judgment. Do not use DRY, SOLID, metrics, or module splitting to add indirection, obscure behavior, or fracture cohesive code. Prefer clarity over cleverness, duplication over the wrong abstraction, and real use cases over speculative seams.

### Review test

A change is acceptable only if it makes the codebase, on balance:

- simpler
- easier to understand
- easier to change safely
- less coupled
- less repetitive in knowledge
- more predictable for future engineers
