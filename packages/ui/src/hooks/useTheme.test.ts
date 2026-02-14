/**
 * @stoneforge/ui useTheme Hook Tests
 */

import { describe, it, expect } from 'bun:test';

describe('useTheme Hook', () => {
  it('exports useTheme hook', async () => {
    const mod = await import('./useTheme');
    expect(mod.useTheme).toBeDefined();
    expect(typeof mod.useTheme).toBe('function');
  });

  it('exports Theme type', async () => {
    // Just verify the module loads without error
    const mod = await import('./useTheme');
    expect(mod).toBeDefined();
  });

  it('exports applyTheme function', async () => {
    const mod = await import('./useTheme');
    expect(mod.applyTheme).toBeDefined();
    expect(typeof mod.applyTheme).toBe('function');
  });

  it('exports setHighContrastBase function', async () => {
    const mod = await import('./useTheme');
    expect(mod.setHighContrastBase).toBeDefined();
    expect(typeof mod.setHighContrastBase).toBe('function');
  });
});
