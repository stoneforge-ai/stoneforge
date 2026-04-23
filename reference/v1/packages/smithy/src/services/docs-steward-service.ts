/**
 * Docs Steward Service
 *
 * This service provides documentation verification and auto-fix capabilities
 * for the orchestration system. The Docs Steward scans documentation for issues
 * like broken file paths, stale links, and outdated references, then fixes
 * low/medium complexity issues automatically.
 *
 * Key features:
 * - Scan docs for file path references that don't exist
 * - Verify internal markdown links resolve
 * - Check documented exports match actual package exports
 * - Verify CLI command documentation matches implementation
 * - Check type field documentation matches TypeScript definitions
 * - Verify API method documentation matches class definitions
 * - Session lifecycle: worktree creation, commits, self-merge, cleanup
 *
 * @module
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectTargetBranch } from '../git/merge.js';

const execAsync = promisify(exec);
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);

// ============================================================================
// Types
// ============================================================================

/**
 * Type of documentation issue detected
 */
export type DocIssueType =
  | 'file_path'
  | 'internal_link'
  | 'export'
  | 'cli'
  | 'type_field'
  | 'api_method';

/**
 * Confidence level in the suggested fix
 */
export type FixConfidence = 'high' | 'medium' | 'low';

/**
 * Complexity level for triage
 */
export type IssueComplexity = 'low' | 'medium' | 'high';

/**
 * A documentation issue detected by the steward
 */
export interface DocIssue {
  /** Type of issue */
  readonly type: DocIssueType;
  /** Documentation file containing the issue */
  readonly file: string;
  /** Line number where the issue was found */
  readonly line: number;
  /** Description of what's wrong */
  readonly description: string;
  /** The current value in the documentation */
  readonly currentValue: string;
  /** Suggested fix (if determinable) */
  readonly suggestedFix?: string;
  /** Confidence in the suggested fix */
  readonly confidence: FixConfidence;
  /** Surrounding text for context */
  readonly context: string;
  /** Complexity classification */
  readonly complexity: IssueComplexity;
}

/**
 * Result of a verification scan
 */
export interface VerificationResult {
  /** Issues found during verification */
  readonly issues: DocIssue[];
  /** Number of files scanned */
  readonly filesScanned: number;
  /** Duration of scan in ms */
  readonly durationMs: number;
}

/**
 * Information about the session worktree
 */
export interface SessionWorktreeInfo {
  /** Path to the worktree */
  readonly path: string;
  /** Branch name */
  readonly branch: string;
  /** Whether the worktree was newly created */
  readonly created: boolean;
}

/**
 * Result of a merge attempt
 */
export interface DocsMergeResult {
  /** Whether merge succeeded */
  readonly success: boolean;
  /** Merge commit hash if successful */
  readonly commitHash?: string;
  /** Error message if failed */
  readonly error?: string;
  /** Whether there was a conflict */
  readonly hasConflict: boolean;
}

/**
 * Configuration for the Docs Steward service
 */
export interface DocsStewardConfig {
  /** Workspace root directory */
  readonly workspaceRoot: string;
  /** Docs directory relative to workspace root (default: 'docs') */
  readonly docsDir?: string;
  /** Source directories to verify against (default: ['packages', 'apps']) */
  readonly sourceDirs?: string[];
  /** Whether to auto-push after merge (default: true) */
  readonly autoPush?: boolean;
  /** Target branch to merge into (default: auto-detect) */
  readonly targetBranch?: string;
}

// ============================================================================
// Docs Steward Service Interface
// ============================================================================

/**
 * Docs Steward Service interface for documentation verification and auto-fix.
 */
export interface DocsStewardService {
  // ----------------------------------------
  // Verification Methods
  // ----------------------------------------

  /**
   * Runs all verification checks and returns combined issues.
   */
  scanAll(): Promise<VerificationResult>;

  /**
   * Verifies file paths referenced in documentation exist.
   */
  verifyFilePaths(): Promise<DocIssue[]>;

  /**
   * Verifies internal markdown links resolve.
   */
  verifyInternalLinks(): Promise<DocIssue[]>;

  /**
   * Verifies documented exports exist in package index files.
   */
  verifyExports(): Promise<DocIssue[]>;

  /**
   * Verifies CLI command documentation matches implementation.
   */
  verifyCliCommands(): Promise<DocIssue[]>;

  /**
   * Verifies type field documentation matches TypeScript definitions.
   */
  verifyTypeFields(): Promise<DocIssue[]>;

  /**
   * Verifies API method documentation matches class definitions.
   */
  verifyApiMethods(): Promise<DocIssue[]>;

  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  /**
   * Creates a session worktree and branch for documentation updates.
   *
   * @param stewardName - Name of the steward agent
   * @returns Worktree information
   */
  createSessionWorktree(stewardName: string): Promise<SessionWorktreeInfo>;

  /**
   * Commits a fix to the session worktree.
   *
   * @param message - Commit message
   * @param files - Files to stage and commit
   */
  commitFix(message: string, files: string[]): Promise<void>;

  /**
   * Merges the session branch to the target branch and cleans up.
   *
   * @param branchName - The branch to merge
   * @param commitMessage - Squash commit message
   * @returns Merge result
   */
  mergeAndCleanup(branchName: string, commitMessage: string): Promise<DocsMergeResult>;

  /**
   * Cleans up the session worktree without merging.
   *
   * @param worktreePath - Path to the worktree to remove
   * @param branchName - Branch to delete
   */
  cleanupSession(worktreePath: string, branchName: string): Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

const DEFAULT_DOCS_DIR = 'docs';
const DEFAULT_SOURCE_DIRS = ['packages', 'apps'];
const DEFAULT_AUTO_PUSH = true;

/**
 * Implementation of the Docs Steward Service
 */
export class DocsStewardServiceImpl implements DocsStewardService {
  private readonly config: Required<Omit<DocsStewardConfig, 'targetBranch'>> &
    Pick<DocsStewardConfig, 'targetBranch'>;
  private targetBranch: string | undefined;
  private sessionWorktreePath: string | undefined;

  constructor(config: DocsStewardConfig) {
    this.config = {
      workspaceRoot: config.workspaceRoot,
      docsDir: config.docsDir ?? DEFAULT_DOCS_DIR,
      sourceDirs: config.sourceDirs ?? [...DEFAULT_SOURCE_DIRS],
      autoPush: config.autoPush ?? DEFAULT_AUTO_PUSH,
      targetBranch: config.targetBranch,
    };
  }

  // ----------------------------------------
  // Verification Methods
  // ----------------------------------------

  async scanAll(): Promise<VerificationResult> {
    const startTime = Date.now();
    const allIssues: DocIssue[] = [];

    // Run all verification checks in parallel
    const [filePaths, internalLinks, exports, cli, types, api] = await Promise.all([
      this.verifyFilePaths(),
      this.verifyInternalLinks(),
      this.verifyExports(),
      this.verifyCliCommands(),
      this.verifyTypeFields(),
      this.verifyApiMethods(),
    ]);

    allIssues.push(...filePaths, ...internalLinks, ...exports, ...cli, ...types, ...api);

    // Count files scanned
    const docsPath = path.join(this.config.workspaceRoot, this.config.docsDir);
    const filesScanned = await this.countMarkdownFiles(docsPath);

    return {
      issues: allIssues,
      filesScanned,
      durationMs: Date.now() - startTime,
    };
  }

  async verifyFilePaths(): Promise<DocIssue[]> {
    const issues: DocIssue[] = [];
    const docsPath = path.join(this.config.workspaceRoot, this.config.docsDir);
    const markdownFiles = await this.findMarkdownFiles(docsPath);

    for (const file of markdownFiles) {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Match inline code containing file paths
        const codeMatches = line.matchAll(/`([^`]+\.(ts|js|tsx|jsx|json|md))`/g);
        for (const match of codeMatches) {
          const filePath = match[1];
          // Skip if it looks like a pattern (contains *)
          if (filePath.includes('*')) continue;
          // Skip if it's a relative doc link
          if (filePath.startsWith('#') || filePath.startsWith('./') && filePath.endsWith('.md')) continue;

          const fullPath = path.join(this.config.workspaceRoot, filePath);
          if (!fs.existsSync(fullPath)) {
            const suggestedFix = await this.findSimilarFile(filePath);
            issues.push({
              type: 'file_path',
              file: path.relative(this.config.workspaceRoot, file),
              line: lineNum,
              description: `File path does not exist: ${filePath}`,
              currentValue: filePath,
              suggestedFix,
              confidence: suggestedFix ? 'medium' : 'low',
              context: this.getContext(lines, i),
              complexity: suggestedFix ? 'low' : 'medium',
            });
          }
        }

        // Match file map table entries (| `path` | or | path |)
        const tableMatch = line.match(/\|\s*`?([^|`]+\.(ts|js))`?\s*\|/);
        if (tableMatch) {
          const filePath = tableMatch[1].trim();
          if (!filePath.includes('*')) {
            const fullPath = path.join(this.config.workspaceRoot, filePath);
            if (!fs.existsSync(fullPath)) {
              const suggestedFix = await this.findSimilarFile(filePath);
              issues.push({
                type: 'file_path',
                file: path.relative(this.config.workspaceRoot, file),
                line: lineNum,
                description: `File path in table does not exist: ${filePath}`,
                currentValue: filePath,
                suggestedFix,
                confidence: suggestedFix ? 'medium' : 'low',
                context: this.getContext(lines, i),
                complexity: suggestedFix ? 'low' : 'medium',
              });
            }
          }
        }
      }
    }

    return issues;
  }

  async verifyInternalLinks(): Promise<DocIssue[]> {
    const issues: DocIssue[] = [];
    const docsPath = path.join(this.config.workspaceRoot, this.config.docsDir);
    const markdownFiles = await this.findMarkdownFiles(docsPath);

    for (const file of markdownFiles) {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');
      const fileDir = path.dirname(file);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Match markdown links: [text](path) or [text](path#anchor)
        const linkMatches = line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
        for (const match of linkMatches) {
          const linkTarget = match[1];

          // Skip external links
          if (linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) continue;
          // Skip pure anchors
          if (linkTarget.startsWith('#')) {
            // Verify anchor exists in current file
            const anchor = linkTarget.slice(1);
            if (!this.anchorExistsInContent(content, anchor)) {
              issues.push({
                type: 'internal_link',
                file: path.relative(this.config.workspaceRoot, file),
                line: lineNum,
                description: `Anchor not found in current file: ${linkTarget}`,
                currentValue: linkTarget,
                confidence: 'high',
                context: this.getContext(lines, i),
                complexity: 'low',
              });
            }
            continue;
          }

          // Parse path and optional anchor
          const [targetPath, anchor] = linkTarget.split('#');
          const resolvedPath = path.resolve(fileDir, targetPath);

          // Check if target file exists
          if (!fs.existsSync(resolvedPath)) {
            issues.push({
              type: 'internal_link',
              file: path.relative(this.config.workspaceRoot, file),
              line: lineNum,
              description: `Link target does not exist: ${targetPath}`,
              currentValue: linkTarget,
              confidence: 'high',
              context: this.getContext(lines, i),
              complexity: 'low',
            });
          } else if (anchor) {
            // Verify anchor exists in target file
            try {
              const targetContent = await readFile(resolvedPath, 'utf-8');
              if (!this.anchorExistsInContent(targetContent, anchor)) {
                issues.push({
                  type: 'internal_link',
                  file: path.relative(this.config.workspaceRoot, file),
                  line: lineNum,
                  description: `Anchor not found in target file: #${anchor}`,
                  currentValue: linkTarget,
                  confidence: 'high',
                  context: this.getContext(lines, i),
                  complexity: 'low',
                });
              }
            } catch {
              // Skip if can't read target file
            }
          }
        }
      }
    }

    return issues;
  }

  async verifyExports(): Promise<DocIssue[]> {
    const issues: DocIssue[] = [];
    const docsPath = path.join(this.config.workspaceRoot, this.config.docsDir);
    const markdownFiles = await this.findMarkdownFiles(docsPath);

    // Find index files for each package
    const indexFiles = await this.findIndexFiles();

    for (const file of markdownFiles) {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      // Look for "Key Exports" or similar sections
      let inExportsSection = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Detect exports section headers
        if (/^#+\s*(Key\s+)?Exports?/i.test(line)) {
          inExportsSection = true;
          continue;
        }
        // End section on next header
        if (inExportsSection && /^#+\s/.test(line) && !/exports?/i.test(line)) {
          inExportsSection = false;
          continue;
        }

        if (!inExportsSection) continue;

        // Match documented exports in backticks
        const exportMatches = line.matchAll(/`([A-Z][a-zA-Z0-9]*)`/g);
        for (const match of exportMatches) {
          const exportName = match[1];

          // Check if this export exists in any index file
          let found = false;
          for (const indexFile of indexFiles) {
            try {
              const indexContent = await readFile(indexFile, 'utf-8');
              if (indexContent.includes(exportName)) {
                found = true;
                break;
              }
            } catch {
              // Skip unreadable files
            }
          }

          if (!found) {
            issues.push({
              type: 'export',
              file: path.relative(this.config.workspaceRoot, file),
              line: lineNum,
              description: `Documented export not found: ${exportName}`,
              currentValue: exportName,
              confidence: 'medium',
              context: this.getContext(lines, i),
              complexity: 'medium',
            });
          }
        }
      }
    }

    return issues;
  }

  async verifyCliCommands(): Promise<DocIssue[]> {
    const issues: DocIssue[] = [];
    const docsPath = path.join(this.config.workspaceRoot, this.config.docsDir);

    // Find CLI reference docs
    const cliDocsPath = path.join(docsPath, 'reference', 'cli.md');
    if (!fs.existsSync(cliDocsPath)) {
      return issues; // No CLI docs to verify
    }

    // Find CLI command definitions
    const cliCommandsDir = path.join(
      this.config.workspaceRoot,
      'packages/quarry/src/cli/commands'
    );
    if (!fs.existsSync(cliCommandsDir)) {
      return issues; // No CLI implementation to verify against
    }

    const content = await readFile(cliDocsPath, 'utf-8');
    const lines = content.split('\n');

    // Get available commands from implementation
    const availableCommands = await this.getCliCommands(cliCommandsDir);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Match CLI command invocations like `sf task list` or `sf gc workflows`
      const cmdMatch = line.match(/`sf\s+([a-z-]+(?:\s+[a-z-]+)?)`/);
      if (cmdMatch) {
        const command = cmdMatch[1];
        const mainCommand = command.split(/\s+/)[0];

        if (!availableCommands.has(mainCommand)) {
          issues.push({
            type: 'cli',
            file: path.relative(this.config.workspaceRoot, cliDocsPath),
            line: lineNum,
            description: `CLI command not found: sf ${mainCommand}`,
            currentValue: `sf ${command}`,
            confidence: 'high',
            context: this.getContext(lines, i),
            complexity: 'medium',
          });
        }
      }

      // Note: CLI flag verification (--verbose, --status, etc.) would require
      // more sophisticated parsing to verify flags belong to specific commands.
      // This can be enhanced in the future.
    }

    return issues;
  }

  async verifyTypeFields(): Promise<DocIssue[]> {
    const issues: DocIssue[] = [];
    // Type field verification requires parsing TypeScript AST
    // For now, return empty - can be enhanced with typescript compiler API
    return issues;
  }

  async verifyApiMethods(): Promise<DocIssue[]> {
    const issues: DocIssue[] = [];
    // API method verification requires parsing TypeScript classes
    // For now, return empty - can be enhanced with typescript compiler API
    return issues;
  }

  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  async createSessionWorktree(stewardName: string): Promise<SessionWorktreeInfo> {
    const branchName = `${stewardName}/docs/auto-updates`;
    const worktreePath = path.join(
      this.config.workspaceRoot,
      '.stoneforge/.worktrees',
      `docs-steward-${Date.now()}`
    );

    // Get target branch
    const targetBranch = await this.getTargetBranch();

    // Check if worktree already exists and clean up if so
    if (fs.existsSync(worktreePath)) {
      await execAsync(`git worktree remove --force "${worktreePath}"`, {
        cwd: this.config.workspaceRoot,
      });
    }

    // Check if branch exists
    let branchExists = false;
    try {
      await execAsync(`git rev-parse --verify ${branchName}`, {
        cwd: this.config.workspaceRoot,
      });
      branchExists = true;
    } catch {
      branchExists = false;
    }

    // Create worktree with new or existing branch
    if (branchExists) {
      await execAsync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: this.config.workspaceRoot,
      });
    } else {
      await execAsync(
        `git worktree add -b ${branchName} "${worktreePath}" ${targetBranch}`,
        { cwd: this.config.workspaceRoot }
      );
    }

    this.sessionWorktreePath = worktreePath;

    return {
      path: worktreePath,
      branch: branchName,
      created: !branchExists,
    };
  }

  async commitFix(message: string, files: string[]): Promise<void> {
    if (!this.sessionWorktreePath) {
      throw new Error('No active session worktree');
    }

    // Stage specified files
    for (const file of files) {
      await execAsync(`git add "${file}"`, {
        cwd: this.sessionWorktreePath,
      });
    }

    // Commit
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: this.sessionWorktreePath,
    });
  }

  async mergeAndCleanup(
    branchName: string,
    commitMessage: string
  ): Promise<DocsMergeResult> {
    const worktreePath = this.sessionWorktreePath;

    if (!worktreePath) {
      return {
        success: false,
        error: 'No active session worktree',
        hasConflict: false,
      };
    }

    const { mergeBranch } = await import('../git/merge.js');

    const result = await mergeBranch({
      workspaceRoot: this.config.workspaceRoot,
      sourceBranch: branchName,
      targetBranch: await this.getTargetBranch(),
      mergeStrategy: 'squash',
      autoPush: this.config.autoPush,
      commitMessage,
      preflight: false,
      syncLocal: false,
    });

    if (result.success) {
      await this.cleanupSession(worktreePath, branchName);
    }

    return result;
  }

  async cleanupSession(worktreePath: string, branchName: string): Promise<void> {
    // Remove worktree
    try {
      await execAsync(`git worktree remove --force "${worktreePath}"`, {
        cwd: this.config.workspaceRoot,
      });
    } catch {
      // Ignore errors
    }

    // Delete local branch
    try {
      await execAsync(`git branch -D ${branchName}`, {
        cwd: this.config.workspaceRoot,
      });
    } catch {
      // Ignore errors
    }

    this.sessionWorktreePath = undefined;
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          const subFiles = await this.findMarkdownFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }

    return files;
  }

  private async countMarkdownFiles(dir: string): Promise<number> {
    const files = await this.findMarkdownFiles(dir);
    return files.length;
  }

  private async findSimilarFile(filePath: string): Promise<string | undefined> {
    const fileName = path.basename(filePath);
    const fileDir = path.dirname(filePath);

    // Try to find a file with similar name in the same directory
    const fullDir = path.join(this.config.workspaceRoot, fileDir);

    try {
      if (fs.existsSync(fullDir)) {
        const entries = await readdir(fullDir);

        // Look for exact match with different extension
        const baseName = fileName.replace(/\.(ts|js|tsx|jsx)$/, '');
        for (const entry of entries) {
          const entryBase = entry.replace(/\.(ts|js|tsx|jsx)$/, '');
          if (entryBase === baseName && entry !== fileName) {
            return path.join(fileDir, entry);
          }
        }

        // Look for similar names (edit distance would be better, but keep it simple)
        for (const entry of entries) {
          if (entry.toLowerCase().includes(baseName.toLowerCase())) {
            return path.join(fileDir, entry);
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return undefined;
  }

  private async findIndexFiles(): Promise<string[]> {
    const indexFiles: string[] = [];

    for (const sourceDir of this.config.sourceDirs) {
      const fullDir = path.join(this.config.workspaceRoot, sourceDir);

      try {
        const packages = await readdir(fullDir, { withFileTypes: true });

        for (const pkg of packages) {
          if (!pkg.isDirectory()) continue;

          // Check for src/index.ts
          const indexPath = path.join(fullDir, pkg.name, 'src/index.ts');
          if (fs.existsSync(indexPath)) {
            indexFiles.push(indexPath);
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return indexFiles;
  }

  private async getCliCommands(commandsDir: string): Promise<Set<string>> {
    const commands = new Set<string>();

    try {
      const entries = await readdir(commandsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.ts')) {
          // Command name is the file name without extension
          const commandName = entry.name.replace(/\.ts$/, '');
          if (commandName !== 'index') {
            commands.add(commandName);
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return commands;
  }

  private anchorExistsInContent(content: string, anchor: string): boolean {
    // Convert anchor to expected heading format
    // Anchors are typically lowercase with hyphens: #my-heading
    const headingPattern = new RegExp(
      `^#+\\s+${anchor.replace(/-/g, '[- ]').replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`,
      'im'
    );

    return headingPattern.test(content);
  }

  private getContext(lines: string[], lineIndex: number, range = 2): string {
    const start = Math.max(0, lineIndex - range);
    const end = Math.min(lines.length, lineIndex + range + 1);
    return lines.slice(start, end).join('\n');
  }

  private async getTargetBranch(): Promise<string> {
    if (this.targetBranch) {
      return this.targetBranch;
    }

    // Delegate to the canonical detectTargetBranch(), passing config value
    this.targetBranch = await detectTargetBranch(
      this.config.workspaceRoot,
      this.config.targetBranch
    );
    return this.targetBranch;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a DocsStewardService instance
 */
export function createDocsStewardService(
  config: DocsStewardConfig
): DocsStewardService {
  return new DocsStewardServiceImpl(config);
}
