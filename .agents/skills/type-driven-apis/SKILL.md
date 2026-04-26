---
name: type-driven-apis
description: Design, implement, or review TypeScript type-driven APIs that infer precise types from user-provided runtime definitions. Use when working on exported TypeScript interfaces, builders, registries, routers, clients, config surfaces, schemas, workflow definitions, SDKs, or library-style APIs where runtime structure should drive static types, autocomplete, invalid-state prevention, or developer experience.
---

# Type-Driven APIs

## Workflow

Use the runtime API and the type API as one design problem. Aim for callers to write concrete runtime structure once, then have TypeScript remember that intent and reflect it back at later callsites.

1. Inspect existing callsites and package boundaries before changing types.
2. Identify the user-provided source of truth: function, schema, literal, object tree, config, route, registry, or workflow definition.
3. Preserve literal information at the capture boundary with `const` generics, `as const`, or `satisfies` when appropriate.
4. Prefer inference from provided values over required explicit generics on the common path.
5. Use generics as type memory: capture exact user intent once, then derive inputs, outputs, params, keys, client shape, and result types from it.
6. Shape runtime APIs to improve inference. Prefer structured object definitions over stringly registrations when structure improves autocomplete or derived types.
7. Make invalid combinations unrepresentable with discriminated unions, constrained options, `never` fields, and mode-specific types.
8. Keep the callsite experience central: autocomplete should reveal valid namespaces, operations, inputs, and return values.
9. Hide complex conditional, mapped, and template-literal machinery behind named public helper types.
10. Validate with type-level tests or compile-time examples when the project has an established pattern for them.

## Design Rules

- Avoid duplicating types that can be inferred from concrete user code.
- Avoid widening to `string`, `number`, broad arrays, or `Record<string, ...>` before the API has captured useful keys and literals.
- Prefer small definition helpers such as `defineConfig`, `defineRouter`, `defineRegistry`, or `defineWorkflow` when they capture exact structure and improve downstream types.
- Export readable helpers such as `RouterInput<T>`, `RouterOutput<T>`, `RegistryClient<T>`, or `WorkflowResult<T>` instead of asking users to reach into internal type machinery.
- Keep explicit generics available only as escape hatches when inference cannot express a legitimate advanced case.
- Keep `any` out of public APIs. Use `unknown` only when the project permits it at trust boundaries, then narrow immediately with schemas, parsers, guards, or constructors.
- Simplify type errors with named aliases and display helpers such as `Prettify<T>` when advanced types would otherwise leak confusing intersections.

## Resources

Read `references/patterns.md` when implementing type-level machinery, choosing between API shapes, adding type tests, or reviewing an interface for type-driven DX.
