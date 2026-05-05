import { describe, it, expect } from 'bun:test';
import { buildClaudeSpawnEnv } from './env.js';

describe('buildClaudeSpawnEnv', () => {
  it('strips CLAUDECODE from inherited env (parent is a Claude Code session)', () => {
    const env = buildClaudeSpawnEnv({ CLAUDECODE: '1', PATH: '/usr/bin' });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });

  it('strips CLAUDECODE from caller overrides too', () => {
    const env = buildClaudeSpawnEnv(
      { PATH: '/usr/bin' },
      { overrides: { CLAUDECODE: '1', CUSTOM: 'value' } }
    );
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CUSTOM).toBe('value');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('preserves all other env vars', () => {
    const env = buildClaudeSpawnEnv({
      HOME: '/home/test',
      PATH: '/usr/bin:/bin',
      ANTHROPIC_API_KEY: 'sk-redacted',
      USER: 'tester',
    });
    expect(env.HOME).toBe('/home/test');
    expect(env.PATH).toBe('/usr/bin:/bin');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-redacted');
    expect(env.USER).toBe('tester');
  });

  it('caller overrides take precedence over inherited env', () => {
    const env = buildClaudeSpawnEnv(
      { CUSTOM: 'inherited' },
      { overrides: { CUSTOM: 'override' } }
    );
    expect(env.CUSTOM).toBe('override');
  });

  it('sets STONEFORGE_ROOT when provided', () => {
    const env = buildClaudeSpawnEnv({}, { stoneforgeRoot: '/path/to/.stoneforge' });
    expect(env.STONEFORGE_ROOT).toBe('/path/to/.stoneforge');
  });

  it('does not set STONEFORGE_ROOT when omitted', () => {
    const env = buildClaudeSpawnEnv({});
    expect(env.STONEFORGE_ROOT).toBeUndefined();
  });

  it('returns a fresh object each call (no mutation of inputs)', () => {
    const base = { CLAUDECODE: '1', PATH: '/usr/bin' };
    buildClaudeSpawnEnv(base);
    expect(base.CLAUDECODE).toBe('1');
    expect(base.PATH).toBe('/usr/bin');
  });
});
