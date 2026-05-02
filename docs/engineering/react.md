# React Engineering Rules

Use this document whenever you write or modify React code. It explains how to avoid unnecessary Effects, how to compose components without mode explosions, how to handle server state, and how to keep React and Next.js work performant.

## Default Shape

Default to render-time derivation, event handlers, composition, and framework data boundaries before reaching for Effects, mirrored state, broad client components, or configuration-heavy component APIs.

Prefer explicit component trees over hidden branching. If a component needs many behavior switches, split the variant at the callsite and compose the shared parts instead of adding more props.

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

## Composition

Avoid boolean prop proliferation for behavior or layout modes. Booleans such as `isEditing`, `isThread`, `showAdvanced`, and `hasFooterActions` multiply possible states and usually push unrelated UI decisions into one shallow component.

Preferred patterns:

- Create explicit variant components for meaningful modes.
- Use `children` composition for slots and nested structure before adding `renderX` props.
- Use compound components when a reusable UI has several cooperating parts.
- Lift shared state into provider components when siblings need the same state or actions.
- Keep state management behind provider boundaries. Leaf UI should depend on a small context interface, not on whether state comes from local React state, React Query, URL state, or another store.

Incorrect:

```tsx
function Composer({
  isEditing,
  isThread,
  channelId,
}: {
  isEditing: boolean
  isThread: boolean
  channelId: string
}) {
  return (
    <ComposerFrame>
      {!isEditing && <ComposerHeader />}
      <ComposerInput />
      {isThread && <AlsoSendToChannel channelId={channelId} />}
      <ComposerFooter>
        {isEditing ? <SaveEditButton /> : <SendButton />}
      </ComposerFooter>
    </ComposerFrame>
  )
}
```

Correct:

```tsx
function ThreadComposer({ channelId }: { channelId: string }) {
  return (
    <ComposerFrame>
      <ComposerHeader />
      <ComposerInput />
      <AlsoSendToChannel channelId={channelId} />
      <ComposerFooter>
        <SendButton />
      </ComposerFooter>
    </ComposerFrame>
  )
}

function EditComposer() {
  return (
    <ComposerFrame>
      <ComposerInput />
      <ComposerFooter>
        <SaveEditButton />
      </ComposerFooter>
    </ComposerFrame>
  )
}
```

For compound components, expose a narrow context shaped around `state`, `actions`, and `meta` when that model fits. The provider owns state wiring; subcomponents consume the context and render one cohesive part of the interface.

Do not introduce a provider only to pass through props once. Use compound components when they remove real prop drilling, make variants explicit, or let callers compose a complex component without knowing its internals.

For React-version-specific APIs, follow the app's React major version. In React 19 code, prefer `ref` as a normal prop over new `forwardRef` usage, and use React 19 context APIs consistently with the surrounding code. In React 18 code, keep `forwardRef` and `useContext` where required.

## Server State

Never put a fetch or mutation inside `useEffect`. All async server state must go through `@tanstack/react-query`.

Use `useQuery({ queryKey, queryFn })` for reads. Render directly from `data`, `isLoading`, and `error`; do not mirror query state into local component state.

Use `useMutation({ mutationFn, onSuccess })` for writes. Call mutations from event handlers, and invalidate related queries with `queryClient.invalidateQueries({ queryKey })` on success.

Mount the `QueryClient` once at the app root. Do not create a client per component.

Derive UI state from query state during render. Do not copy it with `useState` plus `useEffect`.

Keep browser storage small, explicit, and versioned. Do not treat `localStorage` or `sessionStorage` as an untyped data store; validate and migrate persisted client data at the boundary.

## Async and Server Rendering

Avoid async waterfalls. Start independent work early, await it late, and use `Promise.all()` when operations have no dependency on each other. Check cheap synchronous conditions before expensive async work, and move awaits into the branch that actually needs the result.

Use Suspense boundaries to stream UI when only part of a page depends on async data. Do not block the whole layout on data needed by one section unless that data is required for the layout itself, above-the-fold SEO, or avoiding unacceptable layout shift.

For Next.js server work:

- Authenticate and authorize Server Actions like public API routes.
- Do not store request-specific mutable state in module scope.
- Minimize data passed from server components to client components.
- Use per-request deduplication such as `React.cache()` where repeated server reads are expected.
- Hoist static I/O to module scope only when it is truly request-independent.

## Bundle Boundaries

Keep imports and file paths statically analyzable. Avoid dynamic import paths or filesystem paths that make the bundler include broad sets of possible modules.

Prefer package import patterns that the app's bundler can optimize. In Next.js, use configured package import optimization when available; in other environments, import directly from typed subpaths when the package supports them.

Lazy-load heavy or non-critical client modules with dynamic imports. Editors, charts, canvas tools, analytics, logging, and optional feature panels should not enter the initial client bundle unless they are needed for the first interaction.

Preload heavy modules on clear user intent, such as hover, focus, or enabling a feature, when doing so improves perceived latency without bloating the initial route.

## Render Performance

Derive values during render unless the computation is expensive enough to justify memoization. Do not wrap simple primitive expressions in `useMemo`.

Use `memo`, `useMemo`, and `useCallback` to protect expensive subtrees or stable public props, not as default ceremony. Hoist non-primitive default props and static JSX outside components when they would otherwise create new identities every render.

Do not define components inside components. Nested component definitions remount on every parent render and lose state.

Use functional `setState` when the next value depends on the previous value. Use lazy `useState` initialization for expensive initial values. Use refs for transient values that change often but should not trigger rendering.

Keep hook dependencies narrow and primitive where practical. Split independent hook computations instead of combining unrelated dependencies into one memo or Effect.

Use `startTransition` for non-urgent updates and `useDeferredValue` when expensive derived renders should not block responsive input.

Render conditionals explicitly with ternaries when the left side may be `0`, an empty string, or another renderable value. Use `content-visibility` or virtualization for long offscreen lists when the UI cost is measurable.

Global event listeners must be deduplicated and cleaned up. Use passive listeners for scroll and touch events unless the handler must call `preventDefault()`.
