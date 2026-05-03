# T3 Code Reference Copy

This directory is a partial reference copy of the `t3code` repository added to
Stoneforge for provider and agent-runtime study.

Included:

- `apps/server` for provider instances, provider adapters, orchestration,
  persistence, auth, terminal, checkpointing, and server-side tests.
- `packages/contracts` for the schemas and runtime/provider event contracts used
  by the server.
- `packages/effect-acp` for Agent Client Protocol client/agent helpers.
- `packages/effect-codex-app-server` for Codex app-server protocol helpers.
- `packages/shared` for model, git, schema, CLI, worker, and utility helpers
  referenced by the server.
- `packages/client-runtime` because it shares runtime/environment contracts used
  by the copied packages.
- Provider docs and root build metadata needed to understand or inspect the
  reference code.

Excluded:

- Web, desktop, marketing, release, asset, and repository metadata that are not
  needed for the Stoneforge provider-abstraction assessment.

Do not treat this directory as active Stoneforge implementation code. Use it as
reference material when designing or porting provider-driver, provider-adapter,
ACP, Codex app-server, and runtime-event handling ideas into the V2 architecture.
