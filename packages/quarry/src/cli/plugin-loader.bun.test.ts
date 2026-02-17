/**
 * CLI Plugin Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getKnownPluginPackages,
  discoverPlugins,
  logPluginWarnings,
} from './plugin-loader.js';

// Track console output for tests
let consoleErrors: string[] = [];
const originalError = console.error;

beforeEach(() => {
  consoleErrors = [];
  console.error = (...args: unknown[]) => consoleErrors.push(args.map(String).join(' '));
});

afterEach(() => {
  console.error = originalError;
});

describe('getKnownPluginPackages', () => {
  it('should return known plugin packages', () => {
    const packages = getKnownPluginPackages();
    expect(Array.isArray(packages)).toBe(true);
    expect(packages).toContain('@stoneforge/smithy');
  });
});

describe('discoverPlugins', () => {
  it('should return discovery result structure', async () => {
    const result = await discoverPlugins();
    expect(result).toHaveProperty('plugins');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('notFoundPackages');
    expect(result).toHaveProperty('failedPackages');
    expect(Array.isArray(result.plugins)).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(Array.isArray(result.notFoundPackages)).toBe(true);
    expect(Array.isArray(result.failedPackages)).toBe(true);
  });

  it('should attempt to load known packages', async () => {
    const result = await discoverPlugins();
    // Should have attempted to load at least the known packages
    expect(result.results.length).toBeGreaterThanOrEqual(getKnownPluginPackages().length);
  });

  it('should include config packages in discovery', async () => {
    const config = {
      packages: ['nonexistent-test-package-12345'],
    };
    const result = await discoverPlugins(config);

    // Should have attempted the config package
    const packageNames = result.results.map(r => r.packageName);
    expect(packageNames).toContain('nonexistent-test-package-12345');

    // It should be marked as not found or failed since it doesn't exist
    const packageResult = result.results.find(r => r.packageName === 'nonexistent-test-package-12345');
    expect(packageResult).toBeDefined();
    expect(packageResult!.success).toBe(false);
  });

  it('should deduplicate known and config packages', async () => {
    const config = {
      packages: ['@stoneforge/smithy'], // This is already in known packages
    };
    const result = await discoverPlugins(config);

    // Should only appear once in results
    const orchestratorResults = result.results.filter(
      r => r.packageName === '@stoneforge/smithy'
    );
    expect(orchestratorResults.length).toBe(1);
  });

  it('should handle verbose logging option', async () => {
    await discoverPlugins(undefined, { verbose: true });
    // Verbose mode should produce some output
    // We can't guarantee what output since it depends on installed packages
  });
});

describe('logPluginWarnings', () => {
  it('should log nothing for successful discovery with no warnings', () => {
    const result = {
      plugins: [],
      results: [
        { packageName: 'test-pkg', success: true, plugin: undefined },
      ],
      notFoundPackages: [],
      failedPackages: [],
    };
    logPluginWarnings(result);
    // Should not log for "not found" packages or successful loads
    expect(consoleErrors.filter(e => e.includes('Warning'))).toHaveLength(0);
  });

  it('should log warnings for failed packages', () => {
    const result = {
      plugins: [],
      results: [
        {
          packageName: 'failed-pkg',
          success: false,
          notFound: false,
          error: 'Test error',
        },
      ],
      notFoundPackages: [],
      failedPackages: ['failed-pkg'],
    };
    logPluginWarnings(result);
    expect(consoleErrors.some(e => e.includes('failed-pkg'))).toBe(true);
    expect(consoleErrors.some(e => e.includes('Test error'))).toBe(true);
  });

  it('should not log for not-found packages', () => {
    const result = {
      plugins: [],
      results: [
        {
          packageName: 'not-found-pkg',
          success: false,
          notFound: true,
        },
      ],
      notFoundPackages: ['not-found-pkg'],
      failedPackages: [],
    };
    logPluginWarnings(result);
    // Should not warn for not-found packages (silent skip)
    expect(consoleErrors.some(e => e.includes('not-found-pkg'))).toBe(false);
  });

  it('should log plugin summary in verbose mode', () => {
    const result = {
      plugins: [
        {
          name: 'test-plugin',
          version: '1.0.0',
          commands: [],
        },
      ],
      results: [],
      notFoundPackages: [],
      failedPackages: [],
    };
    logPluginWarnings(result, { verbose: true });
    expect(consoleErrors.some(e => e.includes('Loaded plugins'))).toBe(true);
    expect(consoleErrors.some(e => e.includes('test-plugin@1.0.0'))).toBe(true);
  });
});
