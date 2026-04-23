# Contributing to Stoneforge

Stoneforge is currently organized around active V2 work at the repository root.

## Before You Change Anything

- Treat `docs/v2/README.md` as the canonical V2 charter.
- Use `apps/` and `packages/` for active V2 implementation only.
- Treat `reference/` as read-only reference material unless the task explicitly says to work on V1 or the `smithy-next` prototype.

## CLA

All contributors must sign a Contributor License Agreement before their first pull request can be merged. The CLA bot will comment on your PR with instructions.

If you're contributing on behalf of an employer, ask for the Corporate CLA so the authorized GitHub usernames can be added.

## Prerequisites

- Node.js 18+
- pnpm 8.15+
- Bun

## V2 Setup

```bash
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge
pnpm install
pnpm typecheck
pnpm build
```

Until V2 packages exist at the root, these commands act as workspace checks and no-op gracefully.

## Reference Workspaces

Use these only when a task explicitly calls for them:

- `reference/v1/` is the archived V1 monorepo. Run it with `cd reference/v1 && pnpm install`.
- `reference/smithy-next/` is the UI/UX prototype. Run it with `npm --prefix reference/smithy-next install`.

## Making Changes

1. Create a feature branch from `main` or `master`.
2. Keep V2 changes at the repository root unless the task explicitly targets a reference directory.
3. Update `docs/v2/` when behavior, contracts, or first-slice scope changes.
4. Ensure the relevant checks pass.
5. Submit a pull request.

## Licensing

Stoneforge is licensed under Apache 2.0. See [LICENSE](LICENSE) for details.
