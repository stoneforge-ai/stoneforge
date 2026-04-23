/**
 * Install Commands - Install stoneforge extensions to the workspace
 *
 * Provides CLI commands for installing skills and other extensions:
 * - install skills: Copy bundled skills to .claude/skills/
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { suggestCommands } from '../suggest.js';

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_DIR = '.claude';
const SKILLS_DIR = 'skills';
const SKILL_FILE = 'SKILL.md';

// ============================================================================
// Skill Discovery
// ============================================================================

/**
 * Attempts to find the skills directory from the @stoneforge/smithy package
 */
function findSkillsSourceDir(): string | null {
  // Try multiple locations to find the skills

  // 1. Check if @stoneforge/smithy is in node_modules (dist/skills for published package)
  const nodeModulesPath = join(process.cwd(), 'node_modules', '@stoneforge', 'smithy');
  const nodeModulesSkillsPath = join(nodeModulesPath, 'dist', 'skills');
  if (existsSync(nodeModulesSkillsPath)) {
    return nodeModulesSkillsPath;
  }

  // 2. Check src/skills in node_modules (in case dist doesn't have skills)
  const nodeModulesSrcSkillsPath = join(nodeModulesPath, 'src', 'skills');
  if (existsSync(nodeModulesSrcSkillsPath)) {
    return nodeModulesSrcSkillsPath;
  }

  // 3. Try module resolution — works for all package managers (npm, pnpm, yarn, bun)
  // both local and global installs
  try {
    const require = createRequire(import.meta.url);
    const smithyPkgPath = require.resolve('@stoneforge/smithy/package.json');
    const smithyRoot = dirname(smithyPkgPath);
    // Check dist/skills first (published package), then src/skills (development)
    const distSkills = join(smithyRoot, 'dist', 'skills');
    if (existsSync(distSkills)) {
      return distSkills;
    }
    const srcSkills = join(smithyRoot, 'src', 'skills');
    if (existsSync(srcSkills)) {
      return srcSkills;
    }
  } catch {
    // Module not resolvable from this location, continue to other methods
  }

  // 4. Try to find it relative to this package (for monorepo development)
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const quarryRoot = dirname(dirname(dirname(dirname(thisFile)))); // Go up from commands -> cli -> src -> quarry
    const smithySkillsPath = join(dirname(quarryRoot), 'smithy', 'src', 'skills');
    if (existsSync(smithySkillsPath)) {
      return smithySkillsPath;
    }
  } catch {
    // Ignore errors when trying to resolve paths
  }

  return null;
}

/**
 * Gets list of skill directories (each containing a SKILL.md file)
 */
function getSkillDirs(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir)
    .filter(name => {
      const skillPath = join(skillsDir, name);
      const skillFile = join(skillPath, SKILL_FILE);
      return statSync(skillPath).isDirectory() && existsSync(skillFile);
    });
}

/**
 * Recursively copies a directory
 */
function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content);
    }
  }
}

// ============================================================================
// Install Skills Core Logic
// ============================================================================

/**
 * Result from installing skills to a workspace
 */
export interface InstallSkillsResult {
  installed: string[];
  skipped: string[];
  errors: string[];
  targetDir: string;
}

/**
 * Install skills to a workspace directory.
 * This is the core logic used by both `sf install skills` and `sf init`.
 *
 * @param workDir - The workspace root directory (defaults to process.cwd())
 * @param force - Whether to overwrite existing skills (defaults to false)
 * @returns The installation result, or null if no skills source was found
 */
export function installSkillsToWorkspace(
  workDir: string = process.cwd(),
  force: boolean = false
): InstallSkillsResult | null {
  // Find skills source directory
  const skillsSourceDir = findSkillsSourceDir();
  if (!skillsSourceDir) {
    return null;
  }

  // Get skill directories
  const skillDirs = getSkillDirs(skillsSourceDir);
  if (skillDirs.length === 0) {
    return null;
  }

  // Create target directory
  const targetDir = join(workDir, CLAUDE_DIR, SKILLS_DIR);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Copy skills
  const installed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const skillName of skillDirs) {
    const srcPath = join(skillsSourceDir, skillName);
    const destPath = join(targetDir, skillName);

    // Check if already exists
    if (existsSync(destPath) && !force) {
      skipped.push(skillName);
      continue;
    }

    try {
      copyDir(srcPath, destPath);
      installed.push(skillName);
    } catch (err) {
      errors.push(`${skillName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { installed, skipped, errors, targetDir };
}

// ============================================================================
// Install Skills Handler
// ============================================================================

interface InstallSkillsOptions extends GlobalOptions {
  force?: boolean;
}

async function installSkillsHandler(
  _args: string[],
  options: InstallSkillsOptions
): Promise<CommandResult> {
  const result = installSkillsToWorkspace(process.cwd(), options.force ?? false);

  if (!result) {
    return failure(
      'Could not find skills to install. Make sure @stoneforge/smithy is installed.',
      ExitCode.GENERAL_ERROR
    );
  }

  const { installed, skipped, errors, targetDir } = result;

  // Build output message
  const lines: string[] = [];

  if (installed.length > 0) {
    lines.push(`Installed ${installed.length} skill(s):`);
    for (const skill of installed) {
      lines.push(`  - ${skill}/`);
    }
  }

  if (skipped.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`Skipped ${skipped.length} existing skill(s) (use --force to overwrite):`);
    for (const skill of skipped) {
      lines.push(`  - ${skill}/`);
    }
  }

  if (errors.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`Failed to install ${errors.length} skill(s):`);
    for (const error of errors) {
      lines.push(`  - ${error}`);
    }
  }

  if (installed.length === 0 && skipped.length === 0 && errors.length === 0) {
    return failure('No skills were installed', ExitCode.GENERAL_ERROR);
  }

  lines.push('');
  lines.push(`Skills directory: ${targetDir}`);

  return success(
    { installed, skipped, errors, targetDir },
    lines.join('\n')
  );
}

const skillsCommand: Command = {
  name: 'skills',
  description: 'Install Claude skills to .claude/skills/',
  usage: 'sf install skills [--force]',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Overwrite existing skill files',
    },
  ],
  handler: installSkillsHandler,
};

// ============================================================================
// Install Command
// ============================================================================

export const installCommand: Command = {
  name: 'install',
  description: 'Install stoneforge extensions',
  usage: 'sf install <subcommand> [options]',
  help: `Install stoneforge extensions to the workspace.

Subcommands:
  skills    Install Claude skills to .claude/skills/

Examples:
  sf install skills          Install Claude skills to workspace
  sf install skills --force  Overwrite existing skills`,
  subcommands: {
    skills: skillsCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        `Missing subcommand. Use 'sf install skills'. Run 'sf install --help' for more information.`,
        ExitCode.INVALID_ARGUMENTS
      );
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(installCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf install --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
