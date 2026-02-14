# Contributing to Stoneforge

Thanks for your interest in contributing to Stoneforge!

## Contributor License Agreement (CLA)

All contributors must sign a Contributor License Agreement before their first pull request can be merged. The CLA bot will automatically comment on your PR with instructions when you submit it.

**Why a CLA?** The CLA preserves the project's ability to offer commercial licensing and adapt licensing in the future. Your contributions remain attributed to you, and the project stays healthy for all users.

If you're contributing on behalf of an employer, ask us for the Corporate CLA so we can add your GitHub username(s) to the authorized list.

## Prerequisites

- **Node.js** 18+
- **pnpm** 8.15+
- **Bun** (for running tests)

## Development Setup

```bash
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge
pnpm install
npx turbo run typecheck
```

## Project Structure

| Package | Description |
|---------|-------------|
| `packages/core` | Core types, errors, ID generation |
| `packages/storage` | SQLite storage (Bun/Node/browser) |
| `packages/quarry` | SDK, API, services, sync, CLI |
| `packages/smithy` | Agent orchestration library |
| `packages/ui` | Shared React components |
| `packages/shared-routes` | Shared Hono route factories |
| `apps/*` | Server and web applications |

## Running Tests

```bash
cd packages/core && bun test src
cd packages/storage && bun test src
cd packages/quarry && bun test src
cd packages/smithy && bun test src
```

Typecheck all packages:

```bash
npx turbo run typecheck
```

## Making Changes

1. Create a feature branch from `master`
2. Make your changes
3. Add a changeset if your change affects published packages: `pnpm changeset`
4. Ensure typecheck and tests pass
5. Submit a pull request

## Coding Standards

- TypeScript strict mode throughout
- Use branded IDs from `@stoneforge/core` (never raw strings for IDs)
- Event-sourced data model: create events, not mutable state
- Keep dependencies minimal

## Licensing

Stoneforge is licensed under Apache 2.0 across all packages. Your contributions are licensed under the same terms. See the root [LICENSE](LICENSE) file for details.
