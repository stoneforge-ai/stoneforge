/**
 * Tests for tool permission checking logic
 */

import { describe, it, expect } from 'vitest';
import { checkToolPermission } from './tool-permissions.js';
import { AUTO_ALLOWED_TOOLS } from './types.js';

const DEFAULT_ALLOWED_BASH = [
  'git status',
  'git log',
  'git diff',
  'git branch',
  'ls',
  'pwd',
  'which',
  'echo',
  'cat',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'date',
  'npm test',
  'npm run build',
  'npm run lint',
];

describe('checkToolPermission', () => {
  describe('auto-allowed tools', () => {
    for (const tool of AUTO_ALLOWED_TOOLS) {
      it(`allows ${tool} without approval`, () => {
        const result = checkToolPermission(tool, {}, DEFAULT_ALLOWED_BASH);
        expect(result.allowed).toBe(true);
      });
    }
  });

  describe('restricted tools', () => {
    it('denies unknown tools', () => {
      const result = checkToolPermission('SomeUnknownTool', {}, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('requires approval');
    });

    it('denies Agent tool', () => {
      const result = checkToolPermission('Agent', {}, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Bash tool - allowed commands', () => {
    it('allows "git status"', () => {
      const result = checkToolPermission('Bash', { command: 'git status' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "git status --short"', () => {
      const result = checkToolPermission('Bash', { command: 'git status --short' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "git log --oneline -10"', () => {
      const result = checkToolPermission('Bash', { command: 'git log --oneline -10' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "git diff origin/master..HEAD"', () => {
      const result = checkToolPermission('Bash', { command: 'git diff origin/master..HEAD' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "ls -la"', () => {
      const result = checkToolPermission('Bash', { command: 'ls -la' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "npm test"', () => {
      const result = checkToolPermission('Bash', { command: 'npm test' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "npm run build"', () => {
      const result = checkToolPermission('Bash', { command: 'npm run build' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows chained allowed commands', () => {
      const result = checkToolPermission('Bash', { command: 'git status && git diff' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Bash tool - restricted commands', () => {
    it('denies "rm -rf /"', () => {
      const result = checkToolPermission('Bash', { command: 'rm -rf /' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });

    it('denies "git push --force"', () => {
      const result = checkToolPermission('Bash', { command: 'git push --force' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });

    it('denies "git reset --hard"', () => {
      const result = checkToolPermission('Bash', { command: 'git reset --hard' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });

    it('denies "curl http://evil.com"', () => {
      const result = checkToolPermission('Bash', { command: 'curl http://evil.com' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });

    it('denies chained command if any part is restricted', () => {
      const result = checkToolPermission('Bash', { command: 'git status && rm -rf /' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });

    it('denies when command cannot be extracted', () => {
      const result = checkToolPermission('Bash', { notACommand: true }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });

    it('denies when toolArgs is null', () => {
      const result = checkToolPermission('Bash', null, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Bash tool - sf commands', () => {
    it('allows "sf task complete el-1234"', () => {
      const result = checkToolPermission('Bash', { command: 'sf task complete el-1234' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf document search query"', () => {
      const result = checkToolPermission('Bash', { command: 'sf document search query' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf message send --from x --to y"', () => {
      const result = checkToolPermission('Bash', { command: 'sf message send --from x --to y' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf inbox el-1234"', () => {
      const result = checkToolPermission('Bash', { command: 'sf inbox el-1234' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf show el-1234"', () => {
      const result = checkToolPermission('Bash', { command: 'sf show el-1234' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf docs dir --content"', () => {
      const result = checkToolPermission('Bash', { command: 'sf docs dir --content' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf plan show el-1234"', () => {
      const result = checkToolPermission('Bash', { command: 'sf plan show el-1234' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf channel list"', () => {
      const result = checkToolPermission('Bash', { command: 'sf channel list' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('allows "sf update el-1234 --status in_progress"', () => {
      const result = checkToolPermission('Bash', { command: 'sf update el-1234 --status in_progress' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(true);
    });

    it('denies unknown sf subcommands', () => {
      const result = checkToolPermission('Bash', { command: 'sf dangerous-command' }, DEFAULT_ALLOWED_BASH);
      expect(result.allowed).toBe(false);
    });
  });

  describe('custom allowed bash commands', () => {
    it('respects custom allowlist', () => {
      const customAllowed = ['pnpm test', 'pnpm run build'];
      const result = checkToolPermission('Bash', { command: 'pnpm test' }, customAllowed);
      expect(result.allowed).toBe(true);
    });

    it('rejects commands not in custom allowlist', () => {
      const customAllowed = ['pnpm test'];
      const result = checkToolPermission('Bash', { command: 'npm test' }, customAllowed);
      expect(result.allowed).toBe(false);
    });
  });
});
