# Type-Driven API Patterns

## Core Shape

Good type-driven APIs follow this flow:

```text
User writes concrete runtime definition
Library captures its exact type
Library derives useful types from it
Callsites get autocomplete, validation, and precise results
```

Prefer:

```ts
const resource = defineResource({
  path: "/users/:id",
  parse: parseUser,
});

client.get(resource, { id: "123" });
```

over:

```ts
client.get<User>("/users/123");
```

The first API can infer path params and output from runtime values; the second asks the caller to make an unchecked promise.

## Capture Exact Intent

Use definition helpers to capture exact shape:

```ts
function defineConfig<const TConfig extends ConfigShape>(config: TConfig): TConfig {
  return config;
}
```

Prefer `satisfies` when validating shape without erasing specifics:

```ts
const routes = {
  user: "/users/:id",
} satisfies Record<string, string>;
```

Avoid early annotations like `Record<string, string>` when specific keys and literals matter later.

## Remember Values With Generics

Use captured generics to derive later types:

```ts
type Params<TPath extends string> =
  TPath extends `${string}:${infer Param}/${infer Rest}`
    ? Param | Params<Rest>
    : TPath extends `${string}:${infer Param}`
      ? Param
      : never;

type ParamsObject<TPath extends string> = {
  [K in Params<TPath>]: string;
};

function defineRoute<const TPath extends string>(path: TPath) {
  return {
    path,
    build: (params: ParamsObject<TPath>) => params,
  };
}
```

The exact path becomes type memory for `build`.

## Project Runtime Trees Into Clients

Structured definitions can become typed clients:

```ts
type Client<TRouter> = {
  [K in keyof TRouter]: ProcedureClient<TRouter[K]>;
};
```

Prefer object trees when they improve editor exploration:

```ts
client.task.review.start(input);
```

At each dot, autocomplete should show only valid next operations.

## Encode Mode-Specific Rules

Use discriminated unions to reject invalid combinations:

```ts
type RequestOptions =
  | { method: "GET"; body?: never }
  | { method: "POST" | "PUT" | "PATCH"; body: JsonBody };
```

Use this for execution modes, provider modes, sync vs async behavior, read vs write operations, and lifecycle-specific inputs.

## Public Type Hygiene

Expose named helpers for advanced users:

```ts
type RouterInput<TRouter> = ...
type RouterOutput<TRouter> = ...
type InferProcedureResult<TProcedure> = ...
```

Use display helpers when editor output gets noisy:

```ts
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
```

Do not leak private conditional-type pipelines through public API names.

## Review Checklist

Ask these before accepting a TypeScript interface:

1. Can common-path types be inferred from user code?
2. Does the API preserve literal keys, tuple positions, paths, tags, and discriminants?
3. Does one runtime definition drive both behavior and static types?
4. Are invalid option combinations impossible to express?
5. Does autocomplete guide the next valid call?
6. Are explicit generics optional?
7. Are public helper types named and understandable?
8. Are advanced generics hidden from normal callsites?
9. Do errors point at user code instead of internal machinery?
10. Does the type system remember what the user already told it?
