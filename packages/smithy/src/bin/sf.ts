#!/usr/bin/env node
/**
 * Stoneforge CLI Entry Point (re-exported from @stoneforge/quarry)
 *
 * This allows `bun install -g @stoneforge/smithy` to register the `sf` command
 * system-wide, since npm/bun only links binaries from directly installed packages.
 */
import { main } from '@stoneforge/quarry/cli';

main();
