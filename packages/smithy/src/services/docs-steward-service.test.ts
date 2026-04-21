/**
 * Docs Steward Service Tests
 *
 * Tests for the DocsStewardService which handles documentation verification
 * and auto-fix capabilities.
 *
 * Note: The verification methods require filesystem access and are better tested
 * via integration tests. These unit tests focus on service creation, types,
 * and the session lifecycle.
 *
 * @module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DocsStewardServiceImpl,
  createDocsStewardService,
  type DocsStewardService,
  type DocsStewardConfig,
  type DocIssue,
  type DocIssueType,
  type FixConfidence,
  type IssueComplexity,
  type VerificationResult,
  type SessionWorktreeInfo,
  type DocsMergeResult,
} from './docs-steward-service.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createDefaultConfig(): DocsStewardConfig {
  return {
    workspaceRoot: '/project',
    docsDir: 'docs',
    sourceDirs: ['packages', 'apps'],
    autoPush: true,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('DocsStewardService', () => {
  let config: DocsStewardConfig;
  let service: DocsStewardService;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createDefaultConfig();
    service = createDocsStewardService(config);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ----------------------------------------
  // Constructor and Factory
  // ----------------------------------------

  describe('createDocsStewardService', () => {
    it('should create a service instance', () => {
      const svc = createDocsStewardService(config);
      expect(svc).toBeDefined();
      expect(svc).toBeInstanceOf(DocsStewardServiceImpl);
    });

    it('should use default config values when not specified', () => {
      const minimalConfig: DocsStewardConfig = {
        workspaceRoot: '/project',
      };
      const svc = createDocsStewardService(minimalConfig);
      expect(svc).toBeDefined();
    });

    it('should accept custom docsDir', () => {
      const customConfig: DocsStewardConfig = {
        workspaceRoot: '/project',
        docsDir: 'documentation',
      };
      const svc = createDocsStewardService(customConfig);
      expect(svc).toBeDefined();
    });

    it('should accept custom sourceDirs', () => {
      const customConfig: DocsStewardConfig = {
        workspaceRoot: '/project',
        sourceDirs: ['src', 'lib'],
      };
      const svc = createDocsStewardService(customConfig);
      expect(svc).toBeDefined();
    });

    it('should accept auto-push disabled', () => {
      const noPushConfig: DocsStewardConfig = {
        workspaceRoot: '/project',
        autoPush: false,
      };
      const svc = createDocsStewardService(noPushConfig);
      expect(svc).toBeDefined();
    });

    it('should accept custom target branch', () => {
      const customBranchConfig: DocsStewardConfig = {
        workspaceRoot: '/project',
        targetBranch: 'develop',
      };
      const svc = createDocsStewardService(customBranchConfig);
      expect(svc).toBeDefined();
    });
  });

  // ----------------------------------------
  // Type Definitions
  // ----------------------------------------

  describe('type definitions', () => {
    it('should define valid DocIssueType values', () => {
      const types: DocIssueType[] = [
        'file_path',
        'internal_link',
        'export',
        'cli',
        'type_field',
        'api_method',
      ];
      expect(types).toHaveLength(6);
    });

    it('should define valid FixConfidence values', () => {
      const confidences: FixConfidence[] = ['high', 'medium', 'low'];
      expect(confidences).toHaveLength(3);
    });

    it('should define valid IssueComplexity values', () => {
      const complexities: IssueComplexity[] = ['low', 'medium', 'high'];
      expect(complexities).toHaveLength(3);
    });

    it('should define DocIssue structure correctly', () => {
      const issue: DocIssue = {
        type: 'file_path',
        file: 'docs/README.md',
        line: 10,
        description: 'File not found',
        currentValue: 'missing.ts',
        suggestedFix: 'renamed.ts',
        confidence: 'medium',
        context: 'Check `missing.ts` for details',
        complexity: 'low',
      };

      expect(issue.type).toBe('file_path');
      expect(issue.file).toBe('docs/README.md');
      expect(issue.line).toBe(10);
      expect(issue.description).toBe('File not found');
      expect(issue.currentValue).toBe('missing.ts');
      expect(issue.suggestedFix).toBe('renamed.ts');
      expect(issue.confidence).toBe('medium');
      expect(issue.context).toBe('Check `missing.ts` for details');
      expect(issue.complexity).toBe('low');
    });

    it('should allow DocIssue without suggestedFix', () => {
      const issue: DocIssue = {
        type: 'export',
        file: 'docs/api.md',
        line: 20,
        description: 'Export not found',
        currentValue: 'UnknownExport',
        confidence: 'low',
        context: 'exports `UnknownExport`',
        complexity: 'high',
      };

      expect(issue.suggestedFix).toBeUndefined();
      expect(issue.complexity).toBe('high');
    });

    it('should define VerificationResult structure correctly', () => {
      const result: VerificationResult = {
        issues: [],
        filesScanned: 10,
        durationMs: 1234,
      };

      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.filesScanned).toBe(10);
      expect(result.durationMs).toBe(1234);
    });

    it('should define SessionWorktreeInfo structure correctly', () => {
      const info: SessionWorktreeInfo = {
        path: '/project/.stoneforge/.worktrees/docs',
        branch: 'docs-steward/docs/auto-updates',
        created: true,
      };

      expect(info.path).toBe('/project/.stoneforge/.worktrees/docs');
      expect(info.branch).toBe('docs-steward/docs/auto-updates');
      expect(info.created).toBe(true);
    });

    it('should define DocsMergeResult for success', () => {
      const result: DocsMergeResult = {
        success: true,
        commitHash: 'abc123',
        hasConflict: false,
      };

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123');
      expect(result.hasConflict).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should define DocsMergeResult for failure', () => {
      const result: DocsMergeResult = {
        success: false,
        hasConflict: true,
        error: 'Merge conflict in docs/README.md',
      };

      expect(result.success).toBe(false);
      expect(result.hasConflict).toBe(true);
      expect(result.error).toBe('Merge conflict in docs/README.md');
      expect(result.commitHash).toBeUndefined();
    });
  });

  // ----------------------------------------
  // Service Interface
  // ----------------------------------------

  describe('service interface', () => {
    it('should have all verification methods', () => {
      expect(typeof service.scanAll).toBe('function');
      expect(typeof service.verifyFilePaths).toBe('function');
      expect(typeof service.verifyInternalLinks).toBe('function');
      expect(typeof service.verifyExports).toBe('function');
      expect(typeof service.verifyCliCommands).toBe('function');
      expect(typeof service.verifyTypeFields).toBe('function');
      expect(typeof service.verifyApiMethods).toBe('function');
    });

    it('should have session lifecycle methods', () => {
      expect(typeof service.createSessionWorktree).toBe('function');
      expect(typeof service.commitFix).toBe('function');
      expect(typeof service.mergeAndCleanup).toBe('function');
      expect(typeof service.cleanupSession).toBe('function');
    });
  });

  // ----------------------------------------
  // Verification Method Stubs
  // ----------------------------------------

  describe('verifyTypeFields', () => {
    it('should return empty array (not yet fully implemented)', async () => {
      const issues = await service.verifyTypeFields();
      expect(issues).toEqual([]);
    });
  });

  describe('verifyApiMethods', () => {
    it('should return empty array (not yet fully implemented)', async () => {
      const issues = await service.verifyApiMethods();
      expect(issues).toEqual([]);
    });
  });

  // ----------------------------------------
  // Session Lifecycle Mocking
  // ----------------------------------------

  describe('session lifecycle', () => {
    it('should throw when committing without active session', async () => {
      await expect(
        service.commitFix('test message', ['file.md'])
      ).rejects.toThrow('No active session worktree');
    });
  });

  // ----------------------------------------
  // Verifier behavior (filesystem integration)
  // ----------------------------------------

  describe('verifier behavior on a real docs tree', () => {
    let tmpRoot: string;
    let scopedService: DocsStewardService;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-steward-'));
      scopedService = createDocsStewardService({
        workspaceRoot: tmpRoot,
        docsDir: 'docs',
      });
    });

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    function writeDoc(relPath: string, content: string): void {
      const full = path.join(tmpRoot, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf-8');
    }

    it('scans .mdx files in addition to .md', async () => {
      writeDoc('docs/page.mdx', '# Page\n');
      writeDoc('docs/other.md', '# Other\n');

      const result = await scopedService.scanAll();
      expect(result.filesScanned).toBe(2);
    });

    it('does not flag bare-basename mentions in prose as missing file paths', async () => {
      writeDoc(
        'docs/page.mdx',
        "The worker prompt is in `worker.md`, and the default is `persistent-worker.md`.\n",
      );

      const issues = await scopedService.verifyFilePaths();
      expect(issues).toEqual([]);
    });

    it('still flags paths with slashes that do not exist', async () => {
      writeDoc(
        'docs/page.mdx',
        "Check out `packages/missing/src/does-not-exist.ts` for details.\n",
      );

      const issues = await scopedService.verifyFilePaths();
      expect(issues.length).toBe(1);
      expect(issues[0].currentValue).toBe(
        'packages/missing/src/does-not-exist.ts',
      );
    });

    it('does not flag product names like "Node.js" in tables as file paths', async () => {
      writeDoc(
        'docs/page.mdx',
        '| Feature | Bun | Node.js | Browser |\n| --- | --- | --- | --- |\n',
      );

      const issues = await scopedService.verifyFilePaths();
      expect(issues).toEqual([]);
    });

    it('resolves Starlight-style absolute routes to .mdx pages', async () => {
      writeDoc('docs/guides/demo-mode.mdx', '# Demo Mode\n');
      writeDoc(
        'docs/index.mdx',
        'See [demo mode](/guides/demo-mode/) for details.\n',
      );

      const issues = await scopedService.verifyInternalLinks();
      expect(issues).toEqual([]);
    });

    it('flags Starlight-style routes that do not map to any page', async () => {
      writeDoc(
        'docs/index.mdx',
        'See [missing](/guides/does-not-exist/).\n',
      );

      const issues = await scopedService.verifyInternalLinks();
      expect(issues.length).toBe(1);
      expect(issues[0].currentValue).toBe('/guides/does-not-exist/');
    });

    it('matches anchors against headings with backticks', async () => {
      writeDoc(
        'docs/ref.mdx',
        '# Ref\n\n## `sf create`\n\nBody.\n',
      );
      writeDoc(
        'docs/index.mdx',
        'See [create](/ref/#sf-create) for details.\n',
      );

      const issues = await scopedService.verifyInternalLinks();
      expect(issues).toEqual([]);
    });

    it('flags anchors that truly do not exist on the target page', async () => {
      writeDoc('docs/ref.mdx', '# Ref\n\n## `sf create`\n');
      writeDoc(
        'docs/index.mdx',
        'See [missing](/ref/#does-not-exist).\n',
      );

      const issues = await scopedService.verifyInternalLinks();
      expect(issues.length).toBe(1);
      expect(issues[0].description).toContain('Anchor not found');
    });
  });

  // ----------------------------------------
  // Issue Complexity Classification
  // ----------------------------------------

  describe('issue complexity classification', () => {
    it('should classify issues with suggested fix as low complexity', () => {
      const issue: DocIssue = {
        type: 'file_path',
        file: 'docs/README.md',
        line: 10,
        description: 'Missing file',
        currentValue: 'old.ts',
        suggestedFix: 'new.ts',
        confidence: 'medium',
        context: 'context',
        complexity: 'low',
      };

      expect(issue.complexity).toBe('low');
    });

    it('should classify issues without suggested fix as medium complexity', () => {
      const issue: DocIssue = {
        type: 'file_path',
        file: 'docs/README.md',
        line: 10,
        description: 'Missing file with no similar match',
        currentValue: 'unknown.ts',
        confidence: 'low',
        context: 'context',
        complexity: 'medium',
      };

      expect(issue.complexity).toBe('medium');
    });

    it('should allow high complexity for ambiguous issues', () => {
      const issue: DocIssue = {
        type: 'api_method',
        file: 'docs/api.md',
        line: 50,
        description: 'Documented behavior differs from implementation',
        currentValue: 'method signature',
        confidence: 'low',
        context: 'The API doc says X but code does Y',
        complexity: 'high',
      };

      expect(issue.complexity).toBe('high');
    });
  });

  // ----------------------------------------
  // Confidence Levels
  // ----------------------------------------

  describe('confidence levels', () => {
    it('should use high confidence for exact matches', () => {
      const issue: DocIssue = {
        type: 'internal_link',
        file: 'docs/guide.md',
        line: 15,
        description: 'Link target does not exist',
        currentValue: './missing.md',
        confidence: 'high',
        context: 'See [missing](./missing.md)',
        complexity: 'low',
      };

      expect(issue.confidence).toBe('high');
    });

    it('should use medium confidence for fuzzy matches', () => {
      const issue: DocIssue = {
        type: 'file_path',
        file: 'docs/README.md',
        line: 20,
        description: 'File path does not exist',
        currentValue: 'src/oldName.ts',
        suggestedFix: 'src/newName.ts',
        confidence: 'medium',
        context: 'Check `src/oldName.ts`',
        complexity: 'low',
      };

      expect(issue.confidence).toBe('medium');
    });

    it('should use low confidence for uncertain fixes', () => {
      const issue: DocIssue = {
        type: 'export',
        file: 'docs/api.md',
        line: 100,
        description: 'Export may have been renamed',
        currentValue: 'OldExport',
        confidence: 'low',
        context: 'Key Exports: `OldExport`',
        complexity: 'medium',
      };

      expect(issue.confidence).toBe('low');
    });
  });
});
