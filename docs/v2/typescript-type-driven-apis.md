# TypeScript Type-Driven API Principles

Status: V2 engineering guidance

Stoneforge TypeScript APIs should make user intent visible to the type system without asking callers to duplicate that intent in separate annotations. A good interface lets the user write concrete runtime definitions, captures their exact shape, derives useful types from that shape, and reflects those types back through autocomplete, validation, and return values.

This applies most strongly to exported APIs, builders, registries, typed clients, config definitions, schemas, routing surfaces, workflow definitions, dispatch interfaces, and package boundaries.

## Core Principle

Great TypeScript APIs use one source of truth:

```text
User writes concrete runtime structure
Library captures its exact type
Library derives useful types from it
Callsites get precise guidance and validation
```

Avoid APIs that make callers manually restate what the implementation already knows:

```ts
const result = await client.get<User>("/users/123");
```

Prefer APIs that infer from concrete structure the caller already provided:

```ts
const user = defineResource({
  path: "/users/:id",
  parse: parseUser,
});

const result = await client.get(user, { id: "123" });
```

Here the path, parser output, and required params should be inferred from the resource definition.

## Design Rules

### Prefer Inference Over Explicit Generics

Common callsites should rarely need manual generics. Infer data from functions, schemas, literals, and config objects:

```ts
const query = createQuery({
  key: ["users"],
  run: fetchUsers,
});
```

Generics may exist as escape hatches, but they should not be required for the normal path.

### Preserve Literal Intent

Do not widen useful facts too early:

```ts
const routes: Record<string, string> = {
  user: "/users/:id",
};
```

That erases the specific key and path. Prefer:

```ts
const routes = {
  user: "/users/:id",
} satisfies Record<string, string>;
```

Use `const` generics, `as const`, and `satisfies` to preserve literal information while still validating shape.

### Capture Intent At Boundaries

Definition helpers such as `defineConfig`, `defineRouter`, `defineWorkflow`, and `defineRegistry` are useful when they capture the exact type of user-provided structure:

```ts
function defineRoute<const TPath extends string>(path: TPath) {
  return {
    path,
    build: (params: ParamsForPath<TPath>) => params,
  };
}
```

The generic remembers `TPath` so later calls can require the correct params.

### Shape Runtime APIs For Type Inference

Runtime API shape affects type quality. Stringly APIs often hide structure:

```ts
register("task.review", handler);
```

Structured APIs give TypeScript more to preserve and transform:

```ts
register({
  task: {
    review: handler,
  },
});
```

Prefer structure when it improves autocomplete, validation, and derived client types.

### Make Illegal States Unrepresentable

Use discriminated unions and constrained option types to prevent invalid combinations:

```ts
type RequestOptions =
  | { method: "GET"; body?: never }
  | { method: "POST" | "PUT" | "PATCH"; body: JsonBody };
```

The type system should reject states the runtime cannot honor.

### Design For Callsite Experience

Types should guide the next valid action:

```ts
client.tasks.review.start({
  taskId,
});
```

At each step, autocomplete should expose the valid namespace, operation, input shape, and result type. Correctness is not enough if the editor experience is opaque.

### Keep Error Types Readable

Advanced conditional and mapped types can produce unreadable errors. Use named helper types and display helpers to keep inferred types understandable:

```ts
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
```

Public type aliases should have domain names such as `WorkflowInput<T>`, `WorkflowOutput<T>`, `RouterClient<T>`, or `DispatchResult<T>` instead of exposing internal machinery.

### Separate Public Helpers From Internal Machinery

Internal types may be complex. Public exports should be small, named, and purposeful:

```ts
type RouterInput<TRouter> = ...
type RouterOutput<TRouter> = ...
type RegistryClient<TRegistry> = ...
```

Users should not have to reverse-engineer private conditional types to get useful inferred types.

### Respect Stoneforge Type Safety Rules

`any` and `unknown` must not leak into public APIs. Stoneforge's default rule is stricter than general TypeScript advice: do not use either unless the user approves it. If an approved trust boundary requires `unknown`, narrow it immediately with a parser, schema, type guard, or branded constructor.

## Useful Type Tools

Use these when they improve the interface without making callsites harder to read:

- `const` generics to preserve literals passed into helpers.
- `satisfies` to validate shape without losing specific keys and values.
- Conditional types and `infer` to derive input, output, and result types.
- Mapped types to project server or registry definitions into clients.
- Template literal types to derive params or names from string literals.
- Discriminated unions to encode mode-specific requirements.
- Named helper aliases to make editor output readable.

## Review Checklist

Before accepting a TypeScript interface, ask:

1. Can the type be inferred from user code instead of manually provided?
2. Does the API preserve literal keys, strings, tuple positions, and discriminants?
3. Does one runtime definition drive both behavior and static types?
4. Are invalid combinations impossible to express?
5. Does autocomplete reveal the next valid operation and input shape?
6. Are explicit generics optional on the common path?
7. Are public helper types named and understandable?
8. Are advanced generics hidden from normal callsites?
9. Do error messages point at user code rather than internal machinery?
10. Does the type system remember what the user already told us?
