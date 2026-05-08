---
"@stoneforge/smithy": minor
"@stoneforge/smithy-web": minor
---

fix(smithy): spawn-time model resolution honors workspace `defaultModels` setting

The session manager's `resolveExecutablePath` had a 3-tier priority chain (agent metadata → workspace defaults → provider built-in default) but model resolution skipped the middle tier — it only read `agent.metadata.model`, never the workspace-level `defaultModels[providerName]` setting. Operators who set "Default model = Opus" in the smithy-web settings UI would see that reflected in the UI but the daemon would still spawn Claude with the SDK's built-in default (sonnet), forcing them to `/model opus` manually after every restart.

Two pieces:

1. **Server-backed `defaultModels` and `defaultProvider`.** `ServerAgentDefaults` (and the `/api/settings/agent-defaults` route) now persist these alongside the existing `defaultExecutablePaths`. `useAgentDefaultsSettings` in smithy-web is migrated from localStorage-only to server-backed, mirroring the existing `useExecutablePathSettings` pattern.

2. **`resolveModel` helper in session-manager.** New private method analogous to `resolveExecutablePath`: agent metadata wins, falls back to `defaults.defaultModels[providerName]`, finally to `undefined` (provider/SDK default). Used in both `startSession` and `resumeSession` so fresh starts and reconnects honor the same precedence.

Tests cover all four resolution tiers (agent override, workspace default, no override → undefined, options.model wins), per-provider keying, and the no-settingsService fallback.
