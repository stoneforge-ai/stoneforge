/**
 * Dependency Commands - Dependency management CLI operations
 *
 * Provides CLI commands for dependency management:
 * - dep add: Add a dependency between elements
 * - dep remove: Remove a dependency
 * - dep list: List dependencies of an element
 * - dep tree: Show dependency tree for an element
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, type TreeNode } from '../formatter.js';
import type { QuarryAPI, DependencyTreeNode } from '../../api/types.js';
import type { ElementId } from '@stoneforge/core';
import {
  DependencyType,
  VALID_DEPENDENCY_TYPES,
  isValidDependencyType,
  type Dependency,
  getDependencyTypeDisplayName,
} from '@stoneforge/core';
import { createAPI } from '../db.js';

// ============================================================================
// dep add Command
// ============================================================================

interface DepAddOptions {
  type?: string;
  metadata?: string;
}

const depAddOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: `Dependency type (${VALID_DEPENDENCY_TYPES.join(', ')})`,
    hasValue: true,
    required: true,
  },
  {
    name: 'metadata',
    short: 'm',
    description: 'JSON metadata for the dependency',
    hasValue: true,
  },
];

async function depAddHandler(
  args: string[],
  options: GlobalOptions & DepAddOptions
): Promise<CommandResult> {
  const [blockedId, blockerId] = args;

  if (!blockedId || !blockerId) {
    return failure(
      'Usage: sf dependency add <blocked> <blocker> --type <type>\n\nExample: sf dependency add el-task1 el-task2 --type blocks',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (!options.type) {
    return failure(
      `Dependency type is required. Use --type <type>\nValid types: ${VALID_DEPENDENCY_TYPES.join(', ')}`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (!isValidDependencyType(options.type)) {
    return failure(
      `Invalid dependency type: ${options.type}\nValid types: ${VALID_DEPENDENCY_TYPES.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify blocked element exists
    const blocked = await api.get(blockedId as ElementId);
    if (!blocked) {
      return failure(`Blocked element not found: ${blockedId}`, ExitCode.NOT_FOUND);
    }

    // Verify blocker element exists
    const blocker = await api.get(blockerId as ElementId);
    if (!blocker) {
      return failure(`Blocker element not found: ${blockerId}`, ExitCode.NOT_FOUND);
    }

    // Parse metadata if provided
    let metadata: Record<string, unknown> | undefined;
    if (options.metadata) {
      try {
        metadata = JSON.parse(options.metadata);
      } catch {
        return failure(
          `Invalid JSON metadata: ${options.metadata}`,
          ExitCode.VALIDATION
        );
      }
    }

    // Add the dependency
    const dep = await api.addDependency({
      blockedId: blockedId as ElementId,
      blockerId: blockerId as ElementId,
      type: options.type as DependencyType,
      metadata,
    });

    // Format output
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(dep);
    }

    if (mode === 'quiet') {
      return success(`${dep.blockedId} -> ${dep.blockerId}`);
    }

    const typeName = getDependencyTypeDisplayName(dep.type);
    return success(
      dep,
      `Added dependency: ${dep.blockedId} --[${typeName}]--> ${dep.blockerId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Handle specific error cases
    if (message.includes('cycle') || message.includes('Cycle')) {
      return failure(
        `Cannot add dependency: would create a cycle\n${message}`,
        ExitCode.VALIDATION
      );
    }
    if (message.includes('already exists') || message.includes('duplicate')) {
      return failure(
        `Dependency already exists: ${blockedId} --[${options.type}]--> ${blockerId}`,
        ExitCode.VALIDATION
      );
    }

    return failure(`Failed to add dependency: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const depAddCommand: Command = {
  name: 'add',
  description: 'Add a dependency between elements',
  usage: 'sf dependency add <blocked> <blocker> --type <type> [options]',
  help: `Add a dependency between two elements.

Arguments:
  blocked   Blocked element ID (the element that is waiting)
  blocker   Blocker element ID (the element doing the blocking)

Options:
  -t, --type <type>        Dependency type (required)
  -m, --metadata <json>    JSON metadata for the dependency

Dependency Types:
  Blocking (affect task readiness):
    blocks       Blocked element waits for blocker to close
    parent-child Hierarchical containment
    awaits       External gate dependency

  Associative (non-blocking):
    relates-to   Bidirectional semantic link
    references   Citation (unidirectional)
    supersedes   Version chain
    duplicates   Deduplication marker
    caused-by    Audit trail causation
    validates    Test verification link

  Attribution:
    authored-by  Creator attribution
    assigned-to  Responsibility assignment
    approved-by  Sign-off approval

  Threading:
    replies-to   Thread parent reference

Examples:
  sf dependency add el-task1 el-task2 --type blocks
  sf dependency add el-doc1 el-doc2 --type references
  sf dependency add el-task el-entity --type assigned-to`,
  options: depAddOptions,
  handler: depAddHandler as Command['handler'],
};

// ============================================================================
// dep remove Command
// ============================================================================

interface DepRemoveOptions {
  type?: string;
}

const depRemoveOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: `Dependency type (${VALID_DEPENDENCY_TYPES.join(', ')})`,
    hasValue: true,
    required: true,
  },
];

async function depRemoveHandler(
  args: string[],
  options: GlobalOptions & DepRemoveOptions
): Promise<CommandResult> {
  const [blockedId, blockerId] = args;

  if (!blockedId || !blockerId) {
    return failure(
      'Usage: sf dependency remove <blocked> <blocker> --type <type>\nExample: sf dependency remove el-task1 el-task2 --type blocks',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (!options.type) {
    return failure(
      `Dependency type is required. Use --type <type>\nValid types: ${VALID_DEPENDENCY_TYPES.join(', ')}`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (!isValidDependencyType(options.type)) {
    return failure(
      `Invalid dependency type: ${options.type}\nValid types: ${VALID_DEPENDENCY_TYPES.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    await api.removeDependency(
      blockedId as ElementId,
      blockerId as ElementId,
      options.type as DependencyType
    );

    // Format output
    const mode = getOutputMode(options);
    const typeName = getDependencyTypeDisplayName(options.type as DependencyType);

    if (mode === 'json') {
      return success({ blockedId, blockerId, type: options.type, removed: true });
    }

    if (mode === 'quiet') {
      return success('');
    }

    return success(null, `Removed dependency: ${blockedId} --[${typeName}]--> ${blockerId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('not found') || message.includes('Not found')) {
      return failure(
        `Dependency not found: ${blockedId} --[${options.type}]--> ${blockerId}`,
        ExitCode.NOT_FOUND
      );
    }

    return failure(`Failed to remove dependency: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const depRemoveCommand: Command = {
  name: 'remove',
  description: 'Remove a dependency between elements',
  usage: 'sf dependency remove <blocked> <blocker> --type <type>',
  help: `Remove a dependency between two elements.

Arguments:
  blocked   Blocked element ID
  blocker   Blocker element ID

Options:
  -t, --type <type>    Dependency type (required)

Examples:
  sf dependency remove el-task1 el-task2 --type blocks`,
  options: depRemoveOptions,
  handler: depRemoveHandler as Command['handler'],
};

// ============================================================================
// dep list Command
// ============================================================================

interface DepListOptions {
  type?: string;
  direction?: string;
}

const depListOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Filter by dependency type',
    hasValue: true,
  },
  {
    name: 'direction',
    short: 'd',
    description: 'Direction: "out" (dependencies), "in" (dependents), or "both" (default)',
    hasValue: true,
    defaultValue: 'both',
  },
];

async function depListHandler(
  args: string[],
  options: GlobalOptions & DepListOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(
      'Usage: sf dependency list <id> [options]\nExample: sf dependency list el-task1',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  if (options.type && !isValidDependencyType(options.type)) {
    return failure(
      `Invalid dependency type: ${options.type}\nValid types: ${VALID_DEPENDENCY_TYPES.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  const direction = options.direction || 'both';
  if (!['out', 'in', 'both'].includes(direction)) {
    return failure(
      'Invalid direction. Use "out" (dependencies), "in" (dependents), or "both"',
      ExitCode.VALIDATION
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify element exists
    const element = await api.get(id as ElementId);
    if (!element) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    const types = options.type ? [options.type as DependencyType] : undefined;

    let dependencies: Dependency[] = [];
    let dependents: Dependency[] = [];

    if (direction === 'out' || direction === 'both') {
      dependencies = await api.getDependencies(id as ElementId, types);
    }

    if (direction === 'in' || direction === 'both') {
      dependents = await api.getDependents(id as ElementId, types);
    }

    // Format output
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ dependencies, dependents });
    }

    if (mode === 'quiet') {
      const outIds = dependencies.map(d => d.blockerId);
      const inIds = dependents.map(d => d.blockedId);
      const allIds = [...new Set([...outIds, ...inIds])];
      return success(allIds.join('\n'));
    }

    // Human-readable output
    const lines: string[] = [];

    if (direction === 'out' || direction === 'both') {
      if (dependencies.length === 0) {
        lines.push('No outgoing dependencies');
      } else {
        lines.push(`Outgoing dependencies (${dependencies.length}):`);
        const headers = ['BLOCKER', 'TYPE', 'CREATED'];
        const rows = dependencies.map(d => [
          d.blockerId,
          getDependencyTypeDisplayName(d.type),
          new Date(d.createdAt).toLocaleDateString(),
        ]);
        lines.push(formatter.table(headers, rows));
      }
    }

    if (direction === 'both' && (dependencies.length > 0 || dependents.length > 0)) {
      lines.push('');
    }

    if (direction === 'in' || direction === 'both') {
      if (dependents.length === 0) {
        lines.push('No incoming dependencies');
      } else {
        lines.push(`Incoming dependencies (${dependents.length}):`);
        const headers = ['BLOCKED', 'TYPE', 'CREATED'];
        const rows = dependents.map(d => [
          d.blockedId,
          getDependencyTypeDisplayName(d.type),
          new Date(d.createdAt).toLocaleDateString(),
        ]);
        lines.push(formatter.table(headers, rows));
      }
    }

    return success({ dependencies, dependents }, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list dependencies: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const depListCommand: Command = {
  name: 'list',
  description: 'List dependencies of an element',
  usage: 'sf dependency list <id> [options]',
  help: `List dependencies of an element.

Arguments:
  id    Element identifier

Options:
  -t, --type <type>         Filter by dependency type
  -d, --direction <dir>     Direction: "out", "in", or "both" (default)

Directions:
  out    Show what this element depends on (outgoing edges)
  in     Show what depends on this element (incoming edges)
  both   Show both directions (default)

Examples:
  sf dependency list el-task1
  sf dependency list el-task1 --type blocks
  sf dependency list el-task1 --direction out
  sf dependency list el-task1 -d in -t parent-child`,
  options: depListOptions,
  handler: depListHandler as Command['handler'],
};

// ============================================================================
// dep tree Command
// ============================================================================

interface DepTreeOptions {
  depth?: string;
}

const depTreeOptions: CommandOption[] = [
  {
    name: 'depth',
    short: 'd',
    description: 'Maximum depth to traverse (default: 5)',
    hasValue: true,
    defaultValue: '5',
  },
];

/**
 * Converts a DependencyTreeNode to a TreeNode for rendering
 */
function toTreeNode(
  node: DependencyTreeNode,
  direction: 'deps' | 'dependents',
  visited: Set<string> = new Set()
): TreeNode {
  const element = node.element;
  const id = element.id;

  // Prevent infinite loops
  if (visited.has(id)) {
    return {
      label: `${id} (circular reference)`,
      children: [],
    };
  }
  visited.add(id);

  // Get title if available
  const title = (element as { title?: string }).title;
  const label = title ? `${id} - ${title}` : id;

  const children =
    direction === 'deps'
      ? node.dependencies.map(child => toTreeNode(child, direction, new Set(visited)))
      : node.dependents.map(child => toTreeNode(child, direction, new Set(visited)));

  return {
    label,
    children,
  };
}

async function depTreeHandler(
  args: string[],
  options: GlobalOptions & DepTreeOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure(
      'Usage: sf dependency tree <id> [options]\nExample: sf dependency tree el-task1',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const depth = options.depth ? parseInt(options.depth, 10) : 5;
  if (isNaN(depth) || depth < 1) {
    return failure('Depth must be a positive number', ExitCode.VALIDATION);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify element exists
    const element = await api.get(id as ElementId);
    if (!element) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Get the dependency tree
    const tree = await api.getDependencyTree(id as ElementId);

    // Format output
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tree);
    }

    if (mode === 'quiet') {
      // Collect all unique IDs
      const ids = new Set<string>();
      const collectIds = (node: DependencyTreeNode) => {
        ids.add(node.element.id);
        node.dependencies.forEach(collectIds);
        node.dependents.forEach(collectIds);
      };
      collectIds(tree.root);
      return success(Array.from(ids).join('\n'));
    }

    // Human-readable output
    const lines: string[] = [];

    // Get title if available
    const title = (tree.root.element as { title?: string }).title;
    const rootLabel = title ? `${id} - ${title}` : id;

    lines.push(`Dependency tree for: ${rootLabel}`);
    lines.push(`  Total nodes: ${tree.nodeCount}`);
    lines.push(`  Dependency depth: ${tree.dependencyDepth}`);
    lines.push(`  Dependent depth: ${tree.dependentDepth}`);
    lines.push('');

    // Show dependencies (what this element depends on)
    if (tree.root.dependencies.length > 0) {
      lines.push('Dependencies (what this depends on):');
      const depsTree = toTreeNode(
        { ...tree.root, dependents: [] },
        'deps'
      );
      // Remove the root from the tree, just show children
      const depsChildren = depsTree.children || [];
      depsChildren.forEach(child => {
        lines.push(formatter.tree(child));
      });
    } else {
      lines.push('Dependencies: (none)');
    }

    lines.push('');

    // Show dependents (what depends on this element)
    if (tree.root.dependents.length > 0) {
      lines.push('Dependents (what depends on this):');
      const dependentsTree = toTreeNode(
        { ...tree.root, dependencies: [] },
        'dependents'
      );
      // Remove the root from the tree, just show children
      const dependentsChildren = dependentsTree.children || [];
      dependentsChildren.forEach(child => {
        lines.push(formatter.tree(child));
      });
    } else {
      lines.push('Dependents: (none)');
    }

    return success(tree, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get dependency tree: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const depTreeCommand: Command = {
  name: 'tree',
  description: 'Show dependency tree for an element',
  usage: 'sf dependency tree <id> [options]',
  help: `Show the dependency tree for an element.

Arguments:
  id    Element identifier

Options:
  -d, --depth <n>    Maximum depth to traverse (default: 5)

The tree shows both:
  - Dependencies: Elements this element depends on (downstream)
  - Dependents: Elements that depend on this element (upstream)

Examples:
  sf dependency tree el-task1
  sf dependency tree el-task1 --depth 3
  sf dependency tree el-task1 --json`,
  options: depTreeOptions,
  handler: depTreeHandler as Command['handler'],
};

// ============================================================================
// Main dep Command (with subcommands)
// ============================================================================

export const depCommand: Command = {
  name: 'dependency',
  description: 'Manage dependencies between elements',
  usage: 'sf dependency <subcommand> [options]',
  help: `Manage dependencies between elements.

Subcommands:
  add      Add a dependency between elements
  remove   Remove a dependency
  list     List dependencies of an element
  tree     Show dependency tree for an element

Examples:
  sf dependency add el-task1 el-task2 --type blocks
  sf dependency remove el-task1 el-task2 --type blocks
  sf dependency list el-task1
  sf dependency tree el-task1

Use "sf dependency <subcommand> --help" for more information.`,
  options: [],
  handler: depListHandler as Command['handler'], // Default to list when just "sf dep <id>" is used
  subcommands: {
    add: depAddCommand,
    remove: depRemoveCommand,
    list: depListCommand,
    tree: depTreeCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    ls: depListCommand,
  },
};
