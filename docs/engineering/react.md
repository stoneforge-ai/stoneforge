# React Engineering Rules

Use this document whenever you write or modify React code. It explains how to avoid unnecessary Effects, how to handle server state, and what must be true when an Effect is genuinely needed.

## Effects

Before adding or keeping `useEffect`, read https://react.dev/learn/you-might-not-need-an-effect and apply it. Every `useEffect` must justify itself against that guide.

Default to no Effect. Look for one of these alternatives first:

- Derive state from props during render, not in an Effect.
- Compute the next value in an event handler instead of after state changes.
- Use `useMemo` or `useSyncExternalStore` for derived or external values.
- Use event handlers for user-triggered side effects such as mutations, navigation, or commands.

Acceptable reasons for `useEffect` are synchronization with something truly external to React, such as:

- WebSocket lifecycle
- `window` event listeners
- timers
- imperative third-party DOM libraries such as Konva

If an Effect reads from or writes to React state only, it is almost certainly wrong. Refactor.

When an Effect is necessary, it must have:

- an exhaustive dependency array
- a cleanup function where one is needed
- no cascading state updates that re-run the Effect unnecessarily

Consider `useEffectEvent` when you need to do something in response to an Effect, but that work depends on a value you do not want to react to. Reference https://react.dev/reference/react/useEffectEvent only when needed.

## Server State

Never put a fetch or mutation inside `useEffect`. All async server state must go through `@tanstack/react-query`.

Use `useQuery({ queryKey, queryFn })` for reads. Render directly from `data`, `isLoading`, and `error`; do not mirror query state into local component state.

Use `useMutation({ mutationFn, onSuccess })` for writes. Call mutations from event handlers, and invalidate related queries with `queryClient.invalidateQueries({ queryKey })` on success.

Mount the `QueryClient` once at the app root. Do not create a client per component.

Derive UI state from query state during render. Do not copy it with `useState` plus `useEffect`.
