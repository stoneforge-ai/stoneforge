/**
 * Identity Command Tests
 *
 * Tests for the identity CLI commands including whoami, identity mode management,
 * and cryptographic signature operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { identityCommand, whoamiCommand, keygenCommand, signCommand, verifyCommand, hashCommand } from './identity.js';
import { ExitCode, DEFAULT_GLOBAL_OPTIONS } from '../types.js';
import { clearConfigCache } from '../../config/index.js';

describe('identityCommand', () => {
  describe('command definition', () => {
    it('should have correct name', () => {
      expect(identityCommand.name).toBe('identity');
    });

    it('should have description', () => {
      expect(identityCommand.description).toBeTruthy();
    });

    it('should have usage', () => {
      expect(identityCommand.usage).toContain('identity');
    });

    it('should have help text', () => {
      expect(identityCommand.help).toBeTruthy();
    });

    it('should have subcommands', () => {
      expect(identityCommand.subcommands).toBeDefined();
      expect(identityCommand.subcommands?.whoami).toBeDefined();
      expect(identityCommand.subcommands?.mode).toBeDefined();
    });
  });

  describe('default handler', () => {
    let testDir: string;
    let originalCwd: string;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
      originalCwd = process.cwd();
      originalEnv = { ...process.env };
      process.chdir(testDir);
      // Clear any cached config
      clearConfigCache();
      // Remove any env variables that might affect the test
      delete process.env.STONEFORGE_ACTOR;
      delete process.env.STONEFORGE_CONFIG;
      delete process.env.STONEFORGE_ROOT;
    });

    afterEach(() => {
      process.chdir(originalCwd);
      process.env = originalEnv;
      clearConfigCache();
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should show no actor message when none configured', async () => {
      const result = await identityCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('No actor configured');
    });

    it('should show actor from CLI flag', async () => {
      const result = await identityCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'cli-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: cli-actor');
      expect(result.message).toContain('CLI');
    });
  });
});

describe('whoamiCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.STONEFORGE_ACTOR;
    delete process.env.STONEFORGE_CONFIG;
    delete process.env.STONEFORGE_ROOT;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(whoamiCommand.name).toBe('whoami');
    });

    it('should have description', () => {
      expect(whoamiCommand.description).toBeTruthy();
      expect(whoamiCommand.description).toContain('identity');
    });

    it('should have usage', () => {
      expect(whoamiCommand.usage).toContain('whoami');
    });

    it('should have help text', () => {
      expect(whoamiCommand.help).toBeTruthy();
      expect(whoamiCommand.help).toContain('actor');
    });
  });

  describe('no actor configured', () => {
    it('should indicate no actor in human mode', async () => {
      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('No actor configured');
      expect(result.message).toContain('--actor');
      expect(result.message).toContain('STONEFORGE_ACTOR');
    });

    it('should return null actor in JSON mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string | null };
      expect(data.actor).toBeNull();
    });

    it('should return error in quiet mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
      expect(result.error).toContain('No actor configured');
    });
  });

  describe('actor from CLI flag', () => {
    it('should show actor from --actor flag', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-agent',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: test-agent');
      expect(result.message).toContain('CLI');
    });

    it('should indicate source is CLI flag in JSON', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-agent',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string; source: string };
      expect(data.actor).toBe('test-agent');
      expect(data.source).toBe('cli_flag');
    });

    it('should return just actor name in quiet mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-agent',
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBe('test-agent');
    });
  });

  describe('actor from environment variable', () => {
    it('should show actor from STONEFORGE_ACTOR', async () => {
      process.env.STONEFORGE_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: env-actor');
      expect(result.message).toContain('environment');
    });

    it('should indicate environment source in JSON', async () => {
      process.env.STONEFORGE_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string; source: string };
      expect(data.actor).toBe('env-actor');
      expect(data.source).toBe('environment');
    });

    it('should prefer CLI flag over environment', async () => {
      process.env.STONEFORGE_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'cli-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: cli-actor');
      expect(result.message).toContain('CLI');
    });
  });

  describe('actor from config file', () => {
    it('should show actor from config file', async () => {
      // Create .stoneforge directory with config
      const stoneforgeDir = join(testDir, '.stoneforge');
      mkdirSync(stoneforgeDir, { recursive: true });
      writeFileSync(
        join(stoneforgeDir, 'config.yaml'),
        'actor: config-actor\ndatabase: stoneforge.db\n'
      );
      clearConfigCache();

      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: config-actor');
      expect(result.message).toContain('configuration file');
    });

    it('should indicate file source in JSON', async () => {
      const stoneforgeDir = join(testDir, '.stoneforge');
      mkdirSync(stoneforgeDir, { recursive: true });
      writeFileSync(
        join(stoneforgeDir, 'config.yaml'),
        'actor: config-actor\ndatabase: stoneforge.db\n'
      );
      clearConfigCache();

      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string; source: string };
      expect(data.actor).toBe('config-actor');
      expect(data.source).toBe('file');
    });

    it('should prefer environment over config file', async () => {
      const stoneforgeDir = join(testDir, '.stoneforge');
      mkdirSync(stoneforgeDir, { recursive: true });
      writeFileSync(
        join(stoneforgeDir, 'config.yaml'),
        'actor: config-actor\ndatabase: stoneforge.db\n'
      );
      process.env.STONEFORGE_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: env-actor');
    });
  });

  describe('identity mode', () => {
    it('should show identity mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Identity Mode: soft');
    });

    it('should include identity mode in JSON', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { identityMode: string };
      expect(data.identityMode).toBe('soft');
    });
  });

  describe('verification status', () => {
    it('should show verified: no in soft mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Verified: no');
    });

    it('should include verified: false in JSON', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { verified: boolean };
      expect(data.verified).toBe(false);
    });
  });
});

describe('identity mode subcommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.STONEFORGE_ACTOR;
    delete process.env.STONEFORGE_CONFIG;
    delete process.env.STONEFORGE_IDENTITY_MODE;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should have correct definition', () => {
    const modeCommand = identityCommand.subcommands?.mode;
    expect(modeCommand).toBeDefined();
    expect(modeCommand?.name).toBe('mode');
    expect(modeCommand?.description).toContain('identity mode');
  });

  it('should show current mode with no args', async () => {
    const modeCommand = identityCommand.subcommands!.mode;
    const result = await modeCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('soft');
  });

  it('should return mode in JSON format', async () => {
    const modeCommand = identityCommand.subcommands!.mode;
    const result = await modeCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { mode: string };
    expect(data.mode).toBe('soft');
  });

  it('should return just mode in quiet mode', async () => {
    const modeCommand = identityCommand.subcommands!.mode;
    const result = await modeCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      quiet: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe('soft');
  });

  describe('setting mode', () => {
    beforeEach(() => {
      // Create .stoneforge directory with config for setting
      const stoneforgeDir = join(testDir, '.stoneforge');
      mkdirSync(stoneforgeDir, { recursive: true });
      writeFileSync(
        join(stoneforgeDir, 'config.yaml'),
        'database: stoneforge.db\nidentity:\n  mode: soft\n'
      );
      clearConfigCache();
    });

    it('should reject invalid mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['invalid'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid identity mode');
      expect(result.error).toContain('soft');
      expect(result.error).toContain('cryptographic');
      expect(result.error).toContain('hybrid');
    });

    it('should accept soft mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['soft'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('soft');
    });

    it('should accept cryptographic mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['cryptographic'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('cryptographic');
    });

    it('should accept hybrid mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['hybrid'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('hybrid');
    });

    it('should be case insensitive', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['SOFT'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('soft');
    });
  });
});

describe('actor priority', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.STONEFORGE_ACTOR;
    delete process.env.STONEFORGE_CONFIG;
    delete process.env.STONEFORGE_ROOT;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should use CLI over environment over config', async () => {
    // Setup config file
    const stoneforgeDir = join(testDir, '.stoneforge');
    mkdirSync(stoneforgeDir, { recursive: true });
    writeFileSync(
      join(stoneforgeDir, 'config.yaml'),
      'actor: config-actor\ndatabase: stoneforge.db\n'
    );

    // Setup environment
    process.env.STONEFORGE_ACTOR = 'env-actor';
    clearConfigCache();

    // CLI should win
    const result = await whoamiCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'cli-actor',
      json: true,
    });
    const data = result.data as { actor: string; source: string };
    expect(data.actor).toBe('cli-actor');
    expect(data.source).toBe('cli_flag');
  });

  it('should use environment over config when no CLI', async () => {
    // Setup config file
    const stoneforgeDir = join(testDir, '.stoneforge');
    mkdirSync(stoneforgeDir, { recursive: true });
    writeFileSync(
      join(stoneforgeDir, 'config.yaml'),
      'actor: config-actor\ndatabase: stoneforge.db\n'
    );

    // Setup environment
    process.env.STONEFORGE_ACTOR = 'env-actor';
    clearConfigCache();

    const result = await whoamiCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    const data = result.data as { actor: string; source: string };
    expect(data.actor).toBe('env-actor');
    expect(data.source).toBe('environment');
  });

  it('should use config when no CLI or environment', async () => {
    // Setup config file
    const stoneforgeDir = join(testDir, '.stoneforge');
    mkdirSync(stoneforgeDir, { recursive: true });
    writeFileSync(
      join(stoneforgeDir, 'config.yaml'),
      'actor: config-actor\ndatabase: stoneforge.db\n'
    );
    clearConfigCache();

    const result = await whoamiCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    const data = result.data as { actor: string; source: string };
    expect(data.actor).toBe('config-actor');
    expect(data.source).toBe('file');
  });
});

// ============================================================================
// Keygen Command Tests
// ============================================================================

describe('keygenCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(keygenCommand.name).toBe('keygen');
    });

    it('should have description', () => {
      expect(keygenCommand.description).toBeTruthy();
      expect(keygenCommand.description).toContain('keypair');
    });

    it('should have usage', () => {
      expect(keygenCommand.usage).toContain('keygen');
    });

    it('should have help text', () => {
      expect(keygenCommand.help).toBeTruthy();
      expect(keygenCommand.help).toContain('Ed25519');
    });

    it('should be available as identity subcommand', () => {
      expect(identityCommand.subcommands?.keygen).toBeDefined();
    });
  });

  describe('keypair generation', () => {
    it('should generate a keypair', async () => {
      const result = await keygenCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Public Key');
      expect(result.message).toContain('Private Key');
    });

    it('should return keypair in JSON mode', async () => {
      const result = await keygenCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { publicKey: string; privateKey: string };
      expect(data.publicKey).toBeTruthy();
      expect(data.privateKey).toBeTruthy();
      // Public key should be 44 chars (32 bytes base64)
      expect(data.publicKey.length).toBe(44);
    });

    it('should return just public key in quiet mode', async () => {
      const result = await keygenCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(typeof result.data).toBe('string');
      // Should be just the public key (44 chars)
      expect((result.data as string).length).toBe(44);
    });

    it('should generate different keys each time', async () => {
      const result1 = await keygenCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      const result2 = await keygenCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      const data1 = result1.data as { publicKey: string };
      const data2 = result2.data as { publicKey: string };
      expect(data1.publicKey).not.toBe(data2.publicKey);
    });
  });
});

// ============================================================================
// Sign Command Tests
// ============================================================================

describe('signCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let testKeypair: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.STONEFORGE_SIGN_KEY;
    delete process.env.STONEFORGE_SIGN_KEY_FILE;
    delete process.env.STONEFORGE_ACTOR;
    delete process.env.STONEFORGE_ROOT;

    // Generate a test keypair
    const result = await keygenCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    testKeypair = result.data as { publicKey: string; privateKey: string };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(signCommand.name).toBe('sign');
    });

    it('should have description', () => {
      expect(signCommand.description).toBeTruthy();
    });

    it('should have usage', () => {
      expect(signCommand.usage).toContain('sign');
    });

    it('should be available as identity subcommand', () => {
      expect(identityCommand.subcommands?.sign).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should require actor', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        signKey: testKeypair.privateKey,
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Actor is required');
    });

    it('should require private key', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Private key is required');
    });

    it('should require data to sign', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('No data to sign');
    });
  });

  describe('signing data', () => {
    it('should sign data string', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Signature');
      expect(result.message).toContain('alice');
    });

    it('should return signature in JSON mode', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as {
        signature: string;
        signedAt: string;
        actor: string;
        requestHash: string;
      };
      expect(data.signature).toBeTruthy();
      expect(data.signature.length).toBe(88); // 64 bytes base64
      expect(data.signedAt).toBeTruthy();
      expect(data.actor).toBe('alice');
      expect(data.requestHash).toBeTruthy();
    });

    it('should return just signature in quiet mode', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(typeof result.data).toBe('string');
      expect((result.data as string).length).toBe(88);
    });
  });

  describe('signing file', () => {
    it('should sign file contents', async () => {
      const testFile = join(testDir, 'test.txt');
      writeFileSync(testFile, 'file contents');

      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        file: testFile,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { signature: string };
      expect(data.signature).toBeTruthy();
    });

    it('should fail for non-existent file', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        file: '/nonexistent/file.txt',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toContain('Failed to read file');
    });
  });

  describe('signing with hash', () => {
    it('should sign pre-computed hash', async () => {
      // Get hash first
      const hashResult = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        data: 'hello world',
        json: true,
      });
      const { hash } = hashResult.data as { hash: string };

      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        hash,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { signature: string; requestHash: string };
      expect(data.requestHash).toBe(hash);
    });

    it('should reject invalid hash format - too short', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        hash: 'abc123',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid hash format');
      expect(result.error).toContain('64-character hex-encoded SHA256');
    });

    it('should reject invalid hash format - non-hex characters', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        hash: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid hash format');
    });

    it('should reject invalid hash format - too long', async () => {
      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        hash: 'a'.repeat(128),
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid hash format');
    });
  });

  describe('key source', () => {
    it('should read key from file', async () => {
      const keyFile = join(testDir, 'private.key');
      writeFileSync(keyFile, testKeypair.privateKey);

      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKeyFile: keyFile,
        data: 'hello',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { keySource: string };
      expect(data.keySource).toBe('cli_file');
    });

    it('should read key from environment', async () => {
      process.env.STONEFORGE_SIGN_KEY = testKeypair.privateKey;

      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        data: 'hello',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { keySource: string };
      expect(data.keySource).toBe('environment');
    });

    it('should read key file from environment', async () => {
      const keyFile = join(testDir, 'private.key');
      writeFileSync(keyFile, testKeypair.privateKey);
      process.env.STONEFORGE_SIGN_KEY_FILE = keyFile;

      const result = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        data: 'hello',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { keySource: string };
      expect(data.keySource).toBe('environment_file');
    });
  });
});

// ============================================================================
// Verify Command Tests
// ============================================================================

describe('verifyCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let testKeypair: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.STONEFORGE_ACTOR;
    delete process.env.STONEFORGE_ROOT;

    // Generate a test keypair
    const result = await keygenCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    testKeypair = result.data as { publicKey: string; privateKey: string };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(verifyCommand.name).toBe('verify');
    });

    it('should have description', () => {
      expect(verifyCommand.description).toBeTruthy();
    });

    it('should be available as identity subcommand', () => {
      expect(identityCommand.subcommands?.verify).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should require signature', async () => {
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('--signature is required');
    });

    it('should require public key', async () => {
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: 'abc',
        'signed-at': new Date().toISOString(),
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('--public-key is required');
    });

    it('should require signed-at', async () => {
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: 'abc',
        'public-key': testKeypair.publicKey,
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('--signed-at is required');
    });

    it('should require actor', async () => {
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        signature: 'abc',
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Actor is required');
    });

    it('should validate signature format', async () => {
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: 'invalid',
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid signature format');
    });

    it('should validate public key format', async () => {
      // Generate a valid-looking but incorrect signature
      const validSig = 'A'.repeat(86) + '==';
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: validSig,
        'public-key': 'invalid',
        'signed-at': new Date().toISOString(),
        data: 'hello',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid public key format');
    });

    it('should require data, file, or hash', async () => {
      const validSig = 'A'.repeat(86) + '==';
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: validSig,
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Must provide --data, --file, or --hash');
    });

    it('should reject invalid hash format - too short', async () => {
      const validSig = 'A'.repeat(86) + '==';
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: validSig,
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
        hash: 'abc123',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid hash format');
      expect(result.error).toContain('64-character hex-encoded SHA256');
    });

    it('should reject invalid hash format - non-hex characters', async () => {
      const validSig = 'A'.repeat(86) + '==';
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: validSig,
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
        hash: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid hash format');
    });

    it('should reject invalid hash format - too long', async () => {
      const validSig = 'A'.repeat(86) + '==';
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: validSig,
        'public-key': testKeypair.publicKey,
        'signed-at': new Date().toISOString(),
        hash: 'a'.repeat(128),
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid hash format');
    });
  });

  describe('signature verification', () => {
    it('should verify valid signature', async () => {
      // First, sign something
      const signResult = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        json: true,
      });
      const signData = signResult.data as {
        signature: string;
        signedAt: string;
        requestHash: string;
      };

      // Now verify it
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: signData.signature,
        'public-key': testKeypair.publicKey,
        'signed-at': signData.signedAt,
        data: 'hello world',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('VALID');
    });

    it('should return valid:true in JSON mode', async () => {
      const signResult = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        json: true,
      });
      const signData = signResult.data as {
        signature: string;
        signedAt: string;
      };

      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: signData.signature,
        'public-key': testKeypair.publicKey,
        'signed-at': signData.signedAt,
        data: 'hello world',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { valid: boolean };
      expect(data.valid).toBe(true);
    });

    it('should detect invalid signature', async () => {
      // Sign something
      const signResult = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        json: true,
      });
      const signData = signResult.data as {
        signature: string;
        signedAt: string;
      };

      // Verify with different data
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: signData.signature,
        'public-key': testKeypair.publicKey,
        'signed-at': signData.signedAt,
        data: 'different data',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { valid: boolean };
      expect(data.valid).toBe(false);
    });

    it('should detect wrong actor', async () => {
      const signResult = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        json: true,
      });
      const signData = signResult.data as {
        signature: string;
        signedAt: string;
      };

      // Verify with wrong actor
      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'bob', // Wrong actor
        signature: signData.signature,
        'public-key': testKeypair.publicKey,
        'signed-at': signData.signedAt,
        data: 'hello world',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { valid: boolean };
      expect(data.valid).toBe(false);
    });

    it('should return "valid" in quiet mode for valid signature', async () => {
      const signResult = await signCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signKey: testKeypair.privateKey,
        data: 'hello world',
        json: true,
      });
      const signData = signResult.data as {
        signature: string;
        signedAt: string;
      };

      const result = await verifyCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'alice',
        signature: signData.signature,
        'public-key': testKeypair.publicKey,
        'signed-at': signData.signedAt,
        data: 'hello world',
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBe('valid');
    });
  });
});

// ============================================================================
// Hash Command Tests
// ============================================================================

describe('hashCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(hashCommand.name).toBe('hash');
    });

    it('should have description', () => {
      expect(hashCommand.description).toBeTruthy();
    });

    it('should be available as identity subcommand', () => {
      expect(identityCommand.subcommands?.hash).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should require data or file', async () => {
      const result = await hashCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Must provide --data or --file');
    });
  });

  describe('hashing data', () => {
    it('should hash data string', async () => {
      const result = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        data: 'hello world',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('SHA256');
    });

    it('should return hash in JSON mode', async () => {
      const result = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        data: 'hello world',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { hash: string; length: number };
      expect(data.hash).toBeTruthy();
      expect(data.hash.length).toBe(64); // SHA256 hex = 64 chars
      expect(data.length).toBe(11); // "hello world".length
    });

    it('should return just hash in quiet mode', async () => {
      const result = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        data: 'hello world',
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(typeof result.data).toBe('string');
      expect((result.data as string).length).toBe(64);
    });

    it('should produce consistent hashes', async () => {
      const result1 = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        data: 'hello world',
        json: true,
      });
      const result2 = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        data: 'hello world',
        json: true,
      });
      const data1 = result1.data as { hash: string };
      const data2 = result2.data as { hash: string };
      expect(data1.hash).toBe(data2.hash);
    });
  });

  describe('hashing file', () => {
    it('should hash file contents', async () => {
      const testFile = join(testDir, 'test.txt');
      writeFileSync(testFile, 'file contents');

      const result = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        file: testFile,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { hash: string };
      expect(data.hash).toBeTruthy();
    });

    it('should fail for non-existent file', async () => {
      const result = await hashCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        file: '/nonexistent/file.txt',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toContain('Failed to read file');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('sign and verify integration', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let testKeypair: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'stoneforge-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.STONEFORGE_SIGN_KEY;
    delete process.env.STONEFORGE_SIGN_KEY_FILE;
    delete process.env.STONEFORGE_ACTOR;
    delete process.env.STONEFORGE_ROOT;

    // Generate a test keypair
    const result = await keygenCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    testKeypair = result.data as { publicKey: string; privateKey: string };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should sign and verify a complete round trip', async () => {
    const testData = JSON.stringify({ action: 'create', type: 'task', title: 'Test' });

    // Hash the data
    const hashResult = await hashCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      data: testData,
      json: true,
    });
    const { hash } = hashResult.data as { hash: string };

    // Sign using the hash
    const signResult = await signCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'test-agent',
      signKey: testKeypair.privateKey,
      hash,
      json: true,
    });
    const signData = signResult.data as {
      signature: string;
      signedAt: string;
      requestHash: string;
    };

    expect(signData.requestHash).toBe(hash);

    // Verify the signature
    const verifyResult = await verifyCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'test-agent',
      signature: signData.signature,
      'public-key': testKeypair.publicKey,
      'signed-at': signData.signedAt,
      hash,
      json: true,
    });
    const verifyData = verifyResult.data as { valid: boolean };

    expect(verifyData.valid).toBe(true);
  });

  it('should detect tampering with request hash', async () => {
    const signResult = await signCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'test-agent',
      signKey: testKeypair.privateKey,
      data: 'original data',
      json: true,
    });
    const signData = signResult.data as {
      signature: string;
      signedAt: string;
    };

    // Verify with tampered data
    const verifyResult = await verifyCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'test-agent',
      signature: signData.signature,
      'public-key': testKeypair.publicKey,
      'signed-at': signData.signedAt,
      data: 'tampered data',
      json: true,
    });
    const verifyData = verifyResult.data as { valid: boolean };

    expect(verifyData.valid).toBe(false);
  });

  it('should detect wrong public key', async () => {
    // Generate another keypair
    const otherKeypairResult = await keygenCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    const otherKeypair = otherKeypairResult.data as { publicKey: string };

    const signResult = await signCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'test-agent',
      signKey: testKeypair.privateKey,
      data: 'hello',
      json: true,
    });
    const signData = signResult.data as {
      signature: string;
      signedAt: string;
    };

    // Verify with wrong public key
    const verifyResult = await verifyCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'test-agent',
      signature: signData.signature,
      'public-key': otherKeypair.publicKey,
      'signed-at': signData.signedAt,
      data: 'hello',
      json: true,
    });
    const verifyData = verifyResult.data as { valid: boolean };

    expect(verifyData.valid).toBe(false);
  });
});
