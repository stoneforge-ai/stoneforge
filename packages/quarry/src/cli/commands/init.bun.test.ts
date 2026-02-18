/**
 * init Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand, DEFAULT_AGENTS_MD } from './init.js';
import { ExitCode, DEFAULT_GLOBAL_OPTIONS } from '../types.js';

describe('initCommand', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original directory and clean up
    process.chdir(originalCwd);
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(initCommand.name).toBe('init');
    });

    it('should have description', () => {
      expect(initCommand.description).toBeTruthy();
    });

    it('should have usage', () => {
      expect(initCommand.usage).toContain('init');
    });

    it('should have help text', () => {
      expect(initCommand.help).toBeTruthy();
    });

    it('should have name and actor options', () => {
      expect(initCommand.options).toBeDefined();
      expect(initCommand.options?.some(o => o.name === 'name')).toBe(true);
      expect(initCommand.options?.some(o => o.name === 'actor')).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should create .stoneforge directory', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(existsSync(join(testDir, '.stoneforge'))).toBe(true);
    });

    it('should create config.yaml', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('Stoneforge Configuration');
      expect(content).toContain('database: stoneforge.db');
      expect(content).toContain('sync:');
    });

    it('should create .gitignore', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      const gitignorePath = join(testDir, '.stoneforge', '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('*.db');
      expect(content).toContain('*.db-journal');
    });

    it('should create playbooks directory', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(existsSync(join(testDir, '.stoneforge', 'playbooks'))).toBe(true);
    });

    it('should return success message', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.message).toContain('Initialized');
      expect(result.message).toContain('.stoneforge');
    });

    it('should return path in data', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      const data = result.data as { path: string };
      // Check that it ends with .stoneforge (handles symlink paths like /var vs /private/var)
      expect(data.path).toMatch(/\.stoneforge$/);
    });
  });

  describe('actor option', () => {
    it('should include actor in config when provided', async () => {
      await initCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'myagent',
      });

      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('actor: myagent');
    });

    it('should leave actor commented when not provided', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('# actor: my-agent');
    });
  });

  describe('error handling', () => {
    it('should fail if already initialized', async () => {
      // First init should succeed
      const first = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(first.exitCode).toBe(ExitCode.SUCCESS);

      // Second init should fail
      const second = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(second.exitCode).toBe(ExitCode.VALIDATION);
      expect(second.error).toContain('already initialized');
    });
  });

  describe('config file content', () => {
    it('should have correct database setting', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('database: stoneforge.db');
    });

    it('should have sync settings', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('sync:');
      expect(content).toContain('auto_export: false');
      expect(content).toContain('elements_file: elements.jsonl');
      expect(content).toContain('dependencies_file: dependencies.jsonl');
    });

    it('should have playbook settings', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('playbooks:');
      expect(content).toContain('paths:');
      expect(content).toContain('- playbooks');
    });

    it('should have identity settings', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.stoneforge', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('identity:');
      expect(content).toContain('mode: soft');
    });
  });

  describe('partial init (directory exists, no database)', () => {
    it('should succeed when .stoneforge/ exists but has no database', async () => {
      // Simulate a cloned repo with .stoneforge/ but no database
      const sfDir = join(testDir, '.stoneforge');
      mkdirSync(sfDir, { recursive: true });
      writeFileSync(join(sfDir, 'config.yaml'), '# existing config\n');
      writeFileSync(join(sfDir, '.gitignore'), '*.db\n');

      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('existing files');
    });

    it('should not overwrite existing config.yaml', async () => {
      const sfDir = join(testDir, '.stoneforge');
      mkdirSync(sfDir, { recursive: true });
      const customConfig = '# my custom config\ndatabase: stoneforge.db\n';
      writeFileSync(join(sfDir, 'config.yaml'), customConfig);

      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const content = readFileSync(join(sfDir, 'config.yaml'), 'utf-8');
      expect(content).toBe(customConfig);
    });

    it('should not overwrite existing .gitignore', async () => {
      const sfDir = join(testDir, '.stoneforge');
      mkdirSync(sfDir, { recursive: true });
      const customGitignore = '*.db\n*.custom\n';
      writeFileSync(join(sfDir, '.gitignore'), customGitignore);

      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const content = readFileSync(join(sfDir, '.gitignore'), 'utf-8');
      expect(content).toBe(customGitignore);
    });

    it('should create database even when directory already exists', async () => {
      const sfDir = join(testDir, '.stoneforge');
      mkdirSync(sfDir, { recursive: true });

      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      expect(existsSync(join(sfDir, 'stoneforge.db'))).toBe(true);
    });

    it('should import from JSONL files when they exist', async () => {
      const sfDir = join(testDir, '.stoneforge');
      const syncDir = join(sfDir, 'sync');
      mkdirSync(syncDir, { recursive: true });

      // Write a valid entity JSONL line (operator entity will already exist from init,
      // so use a different entity id)
      const entity = {
        id: 'el-ent1',
        type: 'entity',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: 'el-0000',
        tags: [],
        metadata: {},
        name: 'test-agent',
        entityType: 'agent',
      };
      const task = {
        id: 'el-task1',
        type: 'task',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: 'el-0000',
        tags: ['test'],
        metadata: {},
        title: 'Test Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };
      writeFileSync(
        join(syncDir, 'elements.jsonl'),
        JSON.stringify(entity) + '\n' + JSON.stringify(task) + '\n'
      );

      const dep = {
        blockedId: 'el-task1',
        blockerId: 'el-ent1',
        type: 'parent-child',
        createdAt: '2025-01-01T00:00:00.000Z',
        createdBy: 'el-0000',
        metadata: {},
      };
      writeFileSync(join(syncDir, 'dependencies.jsonl'), JSON.stringify(dep) + '\n');

      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Imported');
      expect(result.message).toContain('element(s)');
      expect(result.message).toContain('dependency(ies)');
    });

    it('should succeed with directory but no JSONL files', async () => {
      const sfDir = join(testDir, '.stoneforge');
      mkdirSync(sfDir, { recursive: true });

      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('existing files');
      expect(result.message).not.toContain('Imported');
    });
  });

  describe('AGENTS.md creation', () => {
    it('should create AGENTS.md when neither AGENTS.md nor CLAUDE.md exists', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const agentsMdPath = join(testDir, 'AGENTS.md');
      expect(existsSync(agentsMdPath)).toBe(true);

      const content = readFileSync(agentsMdPath, 'utf-8');
      expect(content).toBe(DEFAULT_AGENTS_MD);
    });

    it('should skip AGENTS.md when AGENTS.md already exists', async () => {
      const customContent = '# My Custom AGENTS.md\nDo not overwrite me.\n';
      writeFileSync(join(testDir, 'AGENTS.md'), customContent);

      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
      expect(content).toBe(customContent);
    });

    it('should skip AGENTS.md when CLAUDE.md exists', async () => {
      writeFileSync(join(testDir, 'CLAUDE.md'), '# Claude instructions\n');

      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(false);
    });

    it('should write AGENTS.md to workspace root, not .stoneforge/', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // AGENTS.md should be at workspace root
      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      // AGENTS.md should NOT be inside .stoneforge/
      expect(existsSync(join(testDir, '.stoneforge', 'AGENTS.md'))).toBe(false);
    });

    it('should report AGENTS.md creation in result message', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('AGENTS.md');

      const data = result.data as { agentsMdCreated: boolean };
      expect(data.agentsMdCreated).toBe(true);
    });

    it('should report agentsMdCreated as false when skipped', async () => {
      writeFileSync(join(testDir, 'AGENTS.md'), '# existing\n');

      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const data = result.data as { agentsMdCreated: boolean };
      expect(data.agentsMdCreated).toBe(false);
    });
  });

  describe('skills installation during init', () => {
    it('should attempt skills installation during init and succeed', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // The message should mention skills in some form (installed or skipped or warning)
      expect(result.message).toMatch(/[Ss]kill/);
    });

    it('should not fail init when skills source is not found', async () => {
      // In a temp directory with no node_modules or monorepo context for skills,
      // the skills source may not be found — but init should still succeed
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // Init succeeded even if skills installation was skipped
      expect(existsSync(join(testDir, '.stoneforge'))).toBe(true);
      expect(existsSync(join(testDir, '.stoneforge', 'stoneforge.db'))).toBe(true);
    });

    it('should include skillsInstalled count in result data', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const data = result.data as { skillsInstalled: number };
      expect(typeof data.skillsInstalled).toBe('number');
    });
  });
});
