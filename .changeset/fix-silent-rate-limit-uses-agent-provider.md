---
"@stoneforge/smithy": patch
---

fix(smithy): silent rate-limit detection attributes the limit to the worker's actual provider, not hardcoded `'claude'`

When the dispatch daemon detects a rate limit from a session that exited
without producing any output (the "silent rate limit" / rapid-exit
branch), or from the orphan-recovery loop noticing a rate-limit pattern
in a worker's session history, and **no `fallbackChain` is configured**,
it previously called `handleRateLimitDetected('claude', resetTime)` —
attributing the limit to `'claude'` regardless of the worker's actual
provider.

For codex (or any non-claude) workers, this surfaced in the dashboard
banner as `Dispatch paused — claude hit its rate limit.` and caused
`getRateLimitStatus()` to report `'claude'` as the limited executable
even when no claude session had ever run. Dispatch was correctly paused
(any tracked limit pauses dispatch in no-fallback-chain mode), but the
attribution was wrong, masking the real issue from operators.

The fix introduces a private `resolveDefaultExecutableForAgent(agent)`
helper that mirrors `resolveExecutableWithFallback`'s resolution
priority — agent's `executablePath` override → workspace
`defaultExecutablePaths[provider]` → bare provider name — without doing
any rate-limit lookups. Both rapid-exit sites now attribute the rate
limit to the failing worker's executable. `'claude-code'` (the canonical
provider name) maps to `'claude'` (the binary name) so existing tracker
entries and banner display for default Claude workers are unchanged.
