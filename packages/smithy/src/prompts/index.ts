/**
 * Built-in Role Definition Prompts
 *
 * This module provides utilities for loading agent role definition prompts
 * from the packaged markdown files or project-level overrides.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRole, StewardFocus, WorkerMode } from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Directory containing built-in prompt files
 */
const PROMPTS_DIR = __dirname;

/**
 * Project-level prompts directory name
 */
const PROJECT_PROMPTS_DIR = '.stoneforge/prompts';

// ============================================================================
// Prompt File Names
// ============================================================================

const PROMPT_FILES = {
  director: 'director.md',
  worker: 'worker.md',
  'persistent-worker': 'persistent-worker.md',
  'steward-base': 'steward-base.md',
  'steward-merge': 'steward-merge.md',
  'steward-docs': 'steward-docs.md',
  'steward-recovery': 'steward-recovery.md',
  'message-triage': 'message-triage.md',
} as const;

// ============================================================================
// Types
// ============================================================================

export interface LoadPromptOptions {
  /**
   * Project root directory to check for overrides.
   * If provided, will look for overrides in `{projectRoot}/.stoneforge/prompts/`
   */
  projectRoot?: string;

  /**
   * If true, skip project overrides and only use built-in prompts
   */
  builtInOnly?: boolean;

  /**
   * For workers, specifies whether to load the ephemeral or persistent worker prompt.
   * When 'persistent', loads persistent-worker.md instead of worker.md.
   * Defaults to ephemeral behavior (worker.md) for backward compatibility.
   */
  workerMode?: WorkerMode;
}

export interface RolePromptResult {
  /** The combined prompt content */
  prompt: string;

  /** Source of the prompt (built-in or project path) */
  source: 'built-in' | string;

  /** For stewards, whether the base was overridden */
  baseSource?: 'built-in' | string;

  /** For stewards, whether the focus was overridden */
  focusSource?: 'built-in' | string;
}

// ============================================================================
// Prompt Loading Functions
// ============================================================================

/**
 * Loads a prompt file from the given path, or returns undefined if not found.
 */
function loadPromptFile(path: string): string | undefined {
  try {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}

/**
 * Gets the path to a built-in prompt file.
 */
function getBuiltInPromptPath(filename: string): string {
  return join(PROMPTS_DIR, filename);
}

/**
 * Gets the path to a project-level prompt file override.
 */
function getProjectPromptPath(projectRoot: string, filename: string): string {
  return join(projectRoot, PROJECT_PROMPTS_DIR, filename);
}

/**
 * Loads the built-in prompt for a role.
 *
 * @param role - The agent role
 * @param stewardFocus - For stewards, the focus area
 * @param workerMode - For workers, whether to load persistent or ephemeral prompt
 * @returns The prompt content, or undefined if not found
 */
export function loadBuiltInPrompt(
  role: AgentRole,
  stewardFocus?: StewardFocus,
  workerMode?: WorkerMode
): string | undefined {
  if (role === 'steward') {
    // Stewards combine base + focus
    const basePath = getBuiltInPromptPath(PROMPT_FILES['steward-base']);
    const baseContent = loadPromptFile(basePath);

    if (!baseContent) {
      return undefined;
    }

    if (!stewardFocus) {
      return baseContent;
    }

    const focusKey = `steward-${stewardFocus}` as keyof typeof PROMPT_FILES;
    const focusPath = getBuiltInPromptPath(PROMPT_FILES[focusKey]);
    const focusContent = loadPromptFile(focusPath);

    if (!focusContent) {
      return baseContent;
    }

    return `${baseContent}\n\n${focusContent}`;
  }

  // Workers: use persistent prompt when workerMode is 'persistent'
  const filename = role === 'worker' && workerMode === 'persistent'
    ? PROMPT_FILES['persistent-worker']
    : PROMPT_FILES[role];
  const path = getBuiltInPromptPath(filename);
  return loadPromptFile(path);
}

/**
 * Loads the prompt for a role, checking for project-level overrides first.
 *
 * For stewards, this loads base + focus prompts and allows independent overrides.
 *
 * @param role - The agent role
 * @param stewardFocus - For stewards, the focus area
 * @param options - Loading options
 * @returns The prompt result with content and source information
 */
export function loadRolePrompt(
  role: AgentRole,
  stewardFocus?: StewardFocus,
  options: LoadPromptOptions = {}
): RolePromptResult | undefined {
  const { projectRoot, builtInOnly, workerMode } = options;

  if (role === 'steward') {
    return loadStewardPrompt(stewardFocus, options);
  }

  // Workers: use persistent prompt when workerMode is 'persistent'
  const filename = role === 'worker' && workerMode === 'persistent'
    ? PROMPT_FILES['persistent-worker']
    : PROMPT_FILES[role];

  // Try project override first
  if (projectRoot && !builtInOnly) {
    const projectPath = getProjectPromptPath(projectRoot, filename);
    const projectContent = loadPromptFile(projectPath);
    if (projectContent) {
      return {
        prompt: projectContent,
        source: projectPath,
      };
    }
  }

  // Fall back to built-in
  const builtInPath = getBuiltInPromptPath(filename);
  const builtInContent = loadPromptFile(builtInPath);
  if (builtInContent) {
    return {
      prompt: builtInContent,
      source: 'built-in',
    };
  }

  return undefined;
}

/**
 * Loads the message triage prompt, checking for project-level overrides first.
 *
 * @param options - Loading options
 * @returns The prompt result with content and source information
 */
export function loadTriagePrompt(
  options: LoadPromptOptions = {}
): RolePromptResult | undefined {
  const { projectRoot, builtInOnly } = options;
  const filename = PROMPT_FILES['message-triage'];

  // Try project override first
  if (projectRoot && !builtInOnly) {
    const projectPath = getProjectPromptPath(projectRoot, filename);
    const projectContent = loadPromptFile(projectPath);
    if (projectContent) {
      return {
        prompt: projectContent,
        source: projectPath,
      };
    }
  }

  // Fall back to built-in
  const builtInPath = getBuiltInPromptPath(filename);
  const builtInContent = loadPromptFile(builtInPath);
  if (builtInContent) {
    return {
      prompt: builtInContent,
      source: 'built-in',
    };
  }

  return undefined;
}

/**
 * Loads the steward prompt, combining base and focus with override support.
 */
function loadStewardPrompt(
  stewardFocus?: StewardFocus,
  options: LoadPromptOptions = {}
): RolePromptResult | undefined {
  const { projectRoot, builtInOnly } = options;

  // Load base prompt
  let baseContent: string | undefined;
  let baseSource: 'built-in' | string = 'built-in';

  if (projectRoot && !builtInOnly) {
    const projectBasePath = getProjectPromptPath(projectRoot, PROMPT_FILES['steward-base']);
    const projectBase = loadPromptFile(projectBasePath);
    if (projectBase) {
      baseContent = projectBase;
      baseSource = projectBasePath;
    }
  }

  if (!baseContent) {
    const builtInBasePath = getBuiltInPromptPath(PROMPT_FILES['steward-base']);
    baseContent = loadPromptFile(builtInBasePath);
  }

  if (!baseContent) {
    return undefined;
  }

  // If no focus specified, return just base
  if (!stewardFocus) {
    return {
      prompt: baseContent,
      source: baseSource,
      baseSource,
    };
  }

  // Load focus prompt
  const focusKey = `steward-${stewardFocus}` as keyof typeof PROMPT_FILES;
  const focusFilename = PROMPT_FILES[focusKey];

  let focusContent: string | undefined;
  let focusSource: 'built-in' | string = 'built-in';

  if (projectRoot && !builtInOnly) {
    const projectFocusPath = getProjectPromptPath(projectRoot, focusFilename);
    const projectFocus = loadPromptFile(projectFocusPath);
    if (projectFocus) {
      focusContent = projectFocus;
      focusSource = projectFocusPath;
    }
  }

  if (!focusContent) {
    const builtInFocusPath = getBuiltInPromptPath(focusFilename);
    focusContent = loadPromptFile(builtInFocusPath);
  }

  // Combine base + focus
  const prompt = focusContent ? `${baseContent}\n\n${focusContent}` : baseContent;

  // Determine overall source
  const overallSource =
    baseSource !== 'built-in' || focusSource !== 'built-in'
      ? 'project-override'
      : 'built-in';

  return {
    prompt,
    source: overallSource,
    baseSource,
    focusSource,
  };
}

/**
 * Gets the list of available built-in prompt files.
 */
export function listBuiltInPrompts(): string[] {
  return Object.values(PROMPT_FILES);
}

/**
 * Checks if a built-in prompt exists for a role.
 */
export function hasBuiltInPrompt(
  role: AgentRole,
  stewardFocus?: StewardFocus,
  workerMode?: WorkerMode
): boolean {
  if (role === 'steward') {
    const basePath = getBuiltInPromptPath(PROMPT_FILES['steward-base']);
    if (!existsSync(basePath)) {
      return false;
    }
    if (stewardFocus) {
      // Custom stewards use the base prompt + user-provided playbook,
      // so they have a built-in prompt as long as the base exists.
      if (stewardFocus === 'custom') {
        return true;
      }
      const focusKey = `steward-${stewardFocus}` as keyof typeof PROMPT_FILES;
      const focusPath = getBuiltInPromptPath(PROMPT_FILES[focusKey]);
      return existsSync(focusPath);
    }
    return true;
  }

  // Workers: check persistent prompt when workerMode is 'persistent'
  const filename = role === 'worker' && workerMode === 'persistent'
    ? PROMPT_FILES['persistent-worker']
    : PROMPT_FILES[role];
  const path = getBuiltInPromptPath(filename);
  return existsSync(path);
}

// ============================================================================
// Prompt Composition
// ============================================================================

export interface BuildAgentPromptOptions {
  /** The agent role */
  role: AgentRole;

  /** For stewards, the focus area */
  stewardFocus?: StewardFocus;

  /** For workers, whether to load the persistent or ephemeral prompt */
  workerMode?: WorkerMode;

  /** Task context to include (task description, acceptance criteria, etc.) */
  taskContext?: string;

  /** Additional instructions to append */
  additionalInstructions?: string;

  /** Project root for checking overrides */
  projectRoot?: string;

  /** Skip project overrides */
  builtInOnly?: boolean;
}

/**
 * Builds the complete startup prompt for an agent.
 *
 * Combines:
 * 1. Role definition prompt (built-in or project override)
 * 2. Task context (if provided)
 * 3. Additional instructions (if provided)
 *
 * @param options - Prompt building options
 * @returns The complete prompt string, or undefined if role prompt not found
 */
export function buildAgentPrompt(options: BuildAgentPromptOptions): string | undefined {
  const { role, stewardFocus, workerMode, taskContext, additionalInstructions, projectRoot, builtInOnly } =
    options;

  // Load the role prompt
  const roleResult = loadRolePrompt(role, stewardFocus, { projectRoot, builtInOnly, workerMode });
  if (!roleResult) {
    return undefined;
  }

  const parts: string[] = [roleResult.prompt];

  // Add task context if provided
  if (taskContext) {
    parts.push('---\n\n# Current Task\n\n' + taskContext);
  }

  // Add additional instructions if provided
  if (additionalInstructions) {
    parts.push('---\n\n' + additionalInstructions);
  }

  return parts.join('\n\n');
}

// ============================================================================
// Prompt Template Rendering
// ============================================================================

/**
 * Variables available for prompt template rendering.
 *
 * Prompt files can use `{{variableName}}` placeholders which are replaced
 * with actual values at load time.
 */
export interface PromptTemplateVars {
  /**
   * The base/target branch name (e.g. 'main', 'master', 'develop').
   * Replaces `{{baseBranch}}` in prompt templates.
   */
  baseBranch?: string;
}

/**
 * Renders a prompt template by replacing `{{variableName}}` placeholders
 * with values from the provided variables.
 *
 * Currently supported variables:
 * - `{{baseBranch}}` — the repository's base/target branch name
 *
 * Unknown template variables are left as-is (not replaced).
 *
 * @param content - The raw prompt content with template placeholders
 * @param vars - The template variable values to substitute
 * @returns The rendered prompt with placeholders replaced
 */
export function renderPromptTemplate(
  content: string,
  vars: PromptTemplateVars
): string {
  let result = content;

  if (vars.baseBranch !== undefined) {
    result = result.replace(/\{\{baseBranch\}\}/g, vars.baseBranch);
  }

  return result;
}
