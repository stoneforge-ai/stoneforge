---
"@stoneforge/quarry": patch
---

fix(quarry): external-sync now propagates closed task state to remote

`pushSingleElement` in the external-sync engine was unconditionally
skipping every element whose status was `closed`, with a comment claiming
"they're done and shouldn't sync". That was wrong — the *close transition
itself* is what needs to be pushed. As a result, GitHub issues linked via
auto-link stayed OPEN forever after the linked Stoneforge task was closed,
and their `sf:status:open` label was never updated to `sf:status:closed`.

The fix removes `closed` from the early-skip guard in
`pushSingleElement`. The downstream hash and event checks in
`pushElement`/`pushDocument` already dedupe pushes (`lastPushedHash` and
the `updated/closed/reopened` events query), so the change is safe and
self-throttling — a closed task is pushed exactly once per close
transition, not on every subsequent sync.

Tombstones (deleted tasks) and archived documents remain in the early-
skip guard: those are terminal states that shouldn't generate any further
sync traffic.
