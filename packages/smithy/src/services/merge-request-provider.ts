/**
 * Merge Request Provider
 *
 * Abstracts merge request creation so the orchestrator can work with different
 * hosting backends (GitHub, GitLab, local-only, etc.) or no remote at all.
 *
 * @module
 */

import type { Task } from '@stoneforge/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Result returned after creating a merge request
 */
export interface MergeRequestResult {
  readonly url?: string;
  readonly id?: number;
  readonly provider: string;
}

/**
 * Options for creating a merge request
 */
export interface CreateMergeRequestOptions {
  readonly title: string;
  readonly body: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

/**
 * Interface that all merge-request backends must implement
 */
export interface MergeRequestProvider {
  readonly name: string;
  createMergeRequest(task: Task, options: CreateMergeRequestOptions): Promise<MergeRequestResult>;
}

// ============================================================================
// LocalMergeProvider — no-op provider for offline / local-only workflows
// ============================================================================

/**
 * A no-op provider that skips remote merge request creation.
 * Useful when running without a remote (e.g. local dev, CI dry-runs).
 */
export class LocalMergeProvider implements MergeRequestProvider {
  readonly name = 'local';

  async createMergeRequest(_task: Task, _options: CreateMergeRequestOptions): Promise<MergeRequestResult> {
    return { provider: this.name };
  }
}

// ============================================================================
// GitHubMergeProvider — creates pull requests via the `gh` CLI
// ============================================================================

/**
 * Creates GitHub pull requests using the `gh` CLI tool.
 * Extracted from the former `TaskAssignmentServiceImpl.createPullRequest()`.
 */
export class GitHubMergeProvider implements MergeRequestProvider {
  readonly name = 'github';

  async createMergeRequest(task: Task, options: CreateMergeRequestOptions): Promise<MergeRequestResult> {
    const { spawn } = await import('node:child_process');

    const title = options.title || task.title;
    const body = options.body || this.buildDefaultBody(task);

    return new Promise((resolve, reject) => {
      const args = [
        'pr', 'create',
        '--title', title,
        '--body', body,
        '--head', options.sourceBranch,
        '--base', options.targetBranch,
      ];

      const proc = spawn('gh', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          const trimmedOutput = stdout.trim();
          const match = trimmedOutput.match(/\/pull\/(\d+)$/);
          const prNumber = match ? parseInt(match[1], 10) : 0;
          resolve({ url: trimmedOutput, id: prNumber, provider: this.name });
        } else {
          reject(new Error(`gh pr create failed (code ${code}): ${stderr}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(new Error(`Failed to spawn gh: ${err.message}`));
      });
    });
  }

  private buildDefaultBody(task: Task): string {
    return `## Task\n\n**ID:** ${task.id}\n**Title:** ${task.title}\n\n---\n_Created by Stoneforge Smithy_`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a LocalMergeProvider (the default, no-remote provider)
 */
export function createLocalMergeProvider(): MergeRequestProvider {
  return new LocalMergeProvider();
}

/**
 * Creates a GitHubMergeProvider that uses the `gh` CLI
 */
export function createGitHubMergeProvider(): MergeRequestProvider {
  return new GitHubMergeProvider();
}
