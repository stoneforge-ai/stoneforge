/**
 * Library Commands - Collection command interface for libraries
 *
 * Provides CLI commands for library operations:
 * - library create: Create a new library
 * - library list: List libraries
 * - library add: Add document to library
 * - library remove: Remove document from library
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createLibrary,
  type Library,
  type CreateLibraryInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Library Create Command
// ============================================================================

interface LibraryCreateOptions {
  name?: string;
  tag?: string[];
}

const libraryCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: 'Library name (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function libraryCreateHandler(
  _args: string[],
  options: GlobalOptions & LibraryCreateOptions
): Promise<CommandResult> {
  if (!options.name) {
    return failure('--name is required for creating a library', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreateLibraryInput = {
      name: options.name,
      createdBy: actor,
      ...(tags && { tags }),
    };

    const library = await createLibrary(input);
    const created = await api.create(library as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created library ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create library: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryCreateCommand: Command = {
  name: 'create',
  description: 'Create a new library',
  usage: 'sf library create --name <name> [options]',
  help: `Create a new document library.

Options:
  -n, --name <name>  Library name (required)
      --tag <tag>    Add tag (can be repeated)

Examples:
  sf library create --name "API Documentation"
  sf library create -n "Design Docs" --tag design --tag frontend`,
  options: libraryCreateOptions,
  handler: libraryCreateHandler as Command['handler'],
};

// ============================================================================
// Library List Command
// ============================================================================

interface LibraryListOptions {
  limit?: string;
}

const libraryListOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function libraryListHandler(
  _args: string[],
  options: GlobalOptions & LibraryListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'library',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Library>(filter);
    const items = result.items;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((l) => l.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No libraries found');
    }

    // Build table
    const headers = ['ID', 'NAME', 'TAGS', 'CREATED'];
    const rows = items.map((l) => [
      l.id,
      l.name.length > 40 ? l.name.substring(0, 37) + '...' : l.name,
      l.tags.slice(0, 3).join(', ') + (l.tags.length > 3 ? '...' : ''),
      l.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} libraries`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list libraries: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryListCommand: Command = {
  name: 'list',
  description: 'List libraries',
  usage: 'sf library list [options]',
  help: `List document libraries.

Options:
  -l, --limit <n>  Maximum results

Examples:
  sf library list
  sf library list --limit 10`,
  options: libraryListOptions,
  handler: libraryListHandler as Command['handler'],
};

// ============================================================================
// Library Add Command
// ============================================================================

async function libraryAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [libraryId, docId] = args;

  if (!libraryId || !docId) {
    return failure('Usage: sf library add <library-id> <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Verify library exists
    const library = await api.get<Library>(libraryId as ElementId);
    if (!library) {
      return failure(`Library not found: ${libraryId}`, ExitCode.NOT_FOUND);
    }
    if (library.type !== 'library') {
      return failure(`Element ${libraryId} is not a library (type: ${library.type})`, ExitCode.VALIDATION);
    }

    // Verify document exists
    const doc = await api.get<Element>(docId as ElementId);
    if (!doc) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (doc.type !== 'document') {
      return failure(`Element ${docId} is not a document (type: ${doc.type})`, ExitCode.VALIDATION);
    }

    // Add parent-child dependency (document is blocked/child, library is blocker/parent)
    await api.addDependency({
      blockedId: docId as ElementId,
      blockerId: libraryId as ElementId,
      type: 'parent-child',
      actor,
    });

    return success(
      { libraryId, docId },
      `Added document ${docId} to library ${libraryId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to add document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryAddCommand: Command = {
  name: 'add',
  description: 'Add document to library',
  usage: 'sf library add <library-id> <document-id>',
  help: `Add a document to a library.

Arguments:
  library-id    Library identifier
  document-id   Document identifier to add

Examples:
  sf library add el-lib123 el-doc456`,
  handler: libraryAddHandler as Command['handler'],
};

// ============================================================================
// Library Remove Command
// ============================================================================

async function libraryRemoveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [libraryId, docId] = args;

  if (!libraryId || !docId) {
    return failure('Usage: sf library remove <library-id> <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Remove parent-child dependency (document is blocked/child, library is blocker/parent)
    await api.removeDependency(
      docId as ElementId,
      libraryId as ElementId,
      'parent-child'
    );

    return success(
      { libraryId, docId },
      `Removed document ${docId} from library ${libraryId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to remove document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryRemoveCommand: Command = {
  name: 'remove',
  description: 'Remove document from library',
  usage: 'sf library remove <library-id> <document-id>',
  help: `Remove a document from a library.

Arguments:
  library-id    Library identifier
  document-id   Document identifier to remove

Examples:
  sf library remove el-lib123 el-doc456`,
  handler: libraryRemoveHandler as Command['handler'],
};

// ============================================================================
// Library Docs Command (list documents in library)
// ============================================================================

async function libraryDocsHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [libraryId] = args;

  if (!libraryId) {
    return failure('Usage: sf library docs <library-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify library exists
    const library = await api.get<Library>(libraryId as ElementId);
    if (!library) {
      return failure(`Library not found: ${libraryId}`, ExitCode.NOT_FOUND);
    }
    if (library.type !== 'library') {
      return failure(`Element ${libraryId} is not a library (type: ${library.type})`, ExitCode.VALIDATION);
    }

    // Get documents that have parent-child dependency to this library
    // (document is blocked, library is blocker)
    const deps = await api.getDependents(libraryId as ElementId, ['parent-child']);
    const docIds = deps.map((d) => d.blockedId);

    if (docIds.length === 0) {
      return success([], `No documents in library ${libraryId}`);
    }

    // Fetch documents
    const docs: Element[] = [];
    for (const docId of docIds) {
      const doc = await api.get<Element>(docId);
      if (doc && doc.type === 'document') {
        docs.push(doc);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(docs);
    }

    if (mode === 'quiet') {
      return success(docs.map((d) => d.id).join('\n'));
    }

    // Build table
    const headers = ['ID', 'TITLE', 'CREATED'];
    const rows = docs.map((d) => {
      const title = (d as unknown as Record<string, unknown>).title as string || 'Untitled';
      return [
        d.id,
        title.length > 50 ? title.substring(0, 47) + '...' : title,
        d.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${docs.length} document(s) in library`;

    return success(docs, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list documents: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryDocsCommand: Command = {
  name: 'docs',
  description: 'List documents in a library',
  usage: 'sf library docs <library-id>',
  help: `List all documents in a library.

Arguments:
  library-id    Library identifier

Examples:
  sf library docs el-lib123`,
  handler: libraryDocsHandler as Command['handler'],
};

// ============================================================================
// Library Nest Command (nest library under another)
// ============================================================================

async function libraryNestHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [childLibraryId, parentLibraryId] = args;

  if (!childLibraryId || !parentLibraryId) {
    return failure('Usage: sf library nest <child-library-id> <parent-library-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Verify child library exists
    const childLib = await api.get<Library>(childLibraryId as ElementId);
    if (!childLib) {
      return failure(`Library not found: ${childLibraryId}`, ExitCode.NOT_FOUND);
    }
    if (childLib.type !== 'library') {
      return failure(`Element ${childLibraryId} is not a library (type: ${childLib.type})`, ExitCode.VALIDATION);
    }

    // Verify parent library exists
    const parentLib = await api.get<Library>(parentLibraryId as ElementId);
    if (!parentLib) {
      return failure(`Library not found: ${parentLibraryId}`, ExitCode.NOT_FOUND);
    }
    if (parentLib.type !== 'library') {
      return failure(`Element ${parentLibraryId} is not a library (type: ${parentLib.type})`, ExitCode.VALIDATION);
    }

    // Prevent self-nesting
    if (childLibraryId === parentLibraryId) {
      return failure('Library cannot be nested under itself', ExitCode.VALIDATION);
    }

    // Check if child already has a parent (libraries can only have one parent)
    const existingParent = await api.getDependencies(childLibraryId as ElementId, ['parent-child']);
    // Check if any parent-child dependency points to a library
    for (const dep of existingParent) {
      const target = await api.get<Element>(dep.blockerId);
      if (target?.type === 'library') {
        return failure(`Library ${childLibraryId} already has a parent library`, ExitCode.VALIDATION);
      }
    }

    // Add parent-child dependency (child library is blocked, parent library is blocker)
    // Cycle detection is handled by the dependency service
    await api.addDependency({
      blockedId: childLibraryId as ElementId,
      blockerId: parentLibraryId as ElementId,
      type: 'parent-child',
      actor,
    });

    return success(
      { childLibraryId, parentLibraryId },
      `Nested library ${childLibraryId} under ${parentLibraryId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('cycle')) {
      return failure(`Cannot nest: would create a cycle`, ExitCode.VALIDATION);
    }
    return failure(`Failed to nest library: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryNestCommand: Command = {
  name: 'nest',
  description: 'Nest a library under another (create hierarchy)',
  usage: 'sf library nest <child-library-id> <parent-library-id>',
  help: `Nest a library under another library to create a hierarchy.

A library can only have one parent library.
Cycle detection prevents circular nesting.

Arguments:
  child-library-id   Library to nest (becomes a sub-library)
  parent-library-id  Library to nest under (becomes parent)

Examples:
  sf library nest el-sub123 el-parent456`,
  handler: libraryNestHandler as Command['handler'],
};

// ============================================================================
// Library Stats Command
// ============================================================================

async function libraryStatsHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [libraryId] = args;

  if (!libraryId) {
    return failure('Usage: sf library stats <library-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify library exists
    const library = await api.get<Library>(libraryId as ElementId);
    if (!library) {
      return failure(`Library not found: ${libraryId}`, ExitCode.NOT_FOUND);
    }
    if (library.type !== 'library') {
      return failure(`Element ${libraryId} is not a library (type: ${library.type})`, ExitCode.VALIDATION);
    }

    // Get direct children (documents and sub-libraries that have this library as parent)
    const deps = await api.getDependents(libraryId as ElementId, ['parent-child']);

    let documentCount = 0;
    let subLibraryCount = 0;

    for (const dep of deps) {
      const child = await api.get<Element>(dep.blockedId);
      if (child) {
        if (child.type === 'document') {
          documentCount++;
        } else if (child.type === 'library') {
          subLibraryCount++;
        }
      }
    }

    const stats = {
      libraryId,
      name: library.name,
      documentCount,
      subLibraryCount,
    };

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(stats);
    }

    if (mode === 'quiet') {
      return success(`${documentCount} docs, ${subLibraryCount} sub-libraries`);
    }

    const output = `Library: ${library.name} (${libraryId})
Documents: ${documentCount}
Sub-libraries: ${subLibraryCount}`;

    return success(stats, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get stats: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryStatsCommand: Command = {
  name: 'stats',
  description: 'Show library statistics',
  usage: 'sf library stats <library-id>',
  help: `Show statistics for a library.

Arguments:
  library-id    Library identifier

Examples:
  sf library stats el-lib123`,
  handler: libraryStatsHandler as Command['handler'],
};

// ============================================================================
// Library Roots Command (list root libraries)
// ============================================================================

async function libraryRootsHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get all libraries
    const result = await api.listPaginated<Library>({ type: 'library' });
    const libraries = result.items;

    if (libraries.length === 0) {
      return success([], 'No libraries found');
    }

    // Get all parent-child dependencies where target is a library
    const libraryIds = new Set(libraries.map((l) => l.id as string));

    // A library is a root if it doesn't have a parent-child dependency
    // pointing to another library
    const rootLibraries: Library[] = [];

    for (const lib of libraries) {
      const deps = await api.getDependencies(lib.id, ['parent-child']);
      const hasLibraryParent = deps.some((d) => libraryIds.has(d.blockerId as string));
      if (!hasLibraryParent) {
        rootLibraries.push(lib);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(rootLibraries);
    }

    if (mode === 'quiet') {
      return success(rootLibraries.map((l) => l.id).join('\n'));
    }

    if (rootLibraries.length === 0) {
      return success([], 'No root libraries found');
    }

    // Build table
    const headers = ['ID', 'NAME', 'CREATED'];
    const rows = rootLibraries.map((l) => [
      l.id,
      l.name.length > 40 ? l.name.substring(0, 37) + '...' : l.name,
      l.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${rootLibraries.length} root library(ies)`;

    return success(rootLibraries, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list root libraries: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryRootsCommand: Command = {
  name: 'roots',
  description: 'List root libraries (not nested under other libraries)',
  usage: 'sf library roots',
  help: `List all root libraries (libraries not nested under other libraries).

Examples:
  sf library roots`,
  handler: libraryRootsHandler as Command['handler'],
};

// ============================================================================
// Library Delete Command
// ============================================================================

interface LibraryDeleteOptions {
  force?: boolean;
}

const libraryDeleteOptions: CommandOption[] = [
  {
    name: 'force',
    short: 'f',
    description: 'Force deletion even if library has contents',
    hasValue: false,
  },
];

async function libraryDeleteHandler(
  args: string[],
  options: GlobalOptions & LibraryDeleteOptions
): Promise<CommandResult> {
  const [libraryId] = args;

  if (!libraryId) {
    return failure('Usage: sf library delete <library-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify library exists
    const library = await api.get<Library>(libraryId as ElementId);
    if (!library) {
      return failure(`Library not found: ${libraryId}`, ExitCode.NOT_FOUND);
    }
    if (library.type !== 'library') {
      return failure(`Element ${libraryId} is not a library (type: ${library.type})`, ExitCode.VALIDATION);
    }

    // Check if library has contents
    const deps = await api.getDependents(libraryId as ElementId, ['parent-child']);

    if (deps.length > 0 && !options.force) {
      return failure(
        `Library has ${deps.length} child element(s). Use --force to delete anyway (contents will be orphaned).`,
        ExitCode.VALIDATION
      );
    }

    // Orphan strategy: remove all parent-child dependencies pointing to this library
    for (const dep of deps) {
      await api.removeDependency(dep.blockedId, libraryId as ElementId, 'parent-child');
    }

    // Delete the library
    await api.delete(libraryId as ElementId);

    return success(
      { libraryId, orphanedCount: deps.length },
      `Deleted library ${libraryId}` + (deps.length > 0 ? ` (orphaned ${deps.length} element(s))` : '')
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to delete library: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryDeleteCommand: Command = {
  name: 'delete',
  description: 'Delete a library',
  usage: 'sf library delete <library-id> [--force]',
  help: `Delete a library.

By default, deletion is prevented if the library has contents.
Use --force to delete anyway (documents and sub-libraries will be orphaned).

Options:
  -f, --force  Force deletion even with contents

Arguments:
  library-id    Library identifier

Examples:
  sf library delete el-lib123
  sf library delete el-lib123 --force`,
  options: libraryDeleteOptions,
  handler: libraryDeleteHandler as Command['handler'],
};

// ============================================================================
// Library Root Command
// ============================================================================

export const libraryCommand: Command = {
  name: 'library',
  description: 'Manage libraries (document collections)',
  usage: 'sf library <subcommand> [options]',
  help: `Manage libraries - collections of related documents.

Libraries organize documents for knowledge bases, documentation, and
content management. Documents can belong to multiple libraries.
Libraries can also be nested hierarchically.

Subcommands:
  create   Create a new library
  list     List all libraries
  roots    List root libraries (not nested)
  docs     List documents in a library
  stats    Show library statistics
  add      Add document to library
  remove   Remove document from library
  nest     Nest library under another
  delete   Delete a library

Examples:
  sf library create --name "API Documentation"
  sf library list
  sf library roots
  sf library docs el-lib123
  sf library stats el-lib123
  sf library add el-lib123 el-doc456
  sf library remove el-lib123 el-doc456
  sf library nest el-sub123 el-parent456
  sf library delete el-lib123

Note: Use 'sf show <id>', 'sf update <id>', 'sf delete <id>' for any element.`,
  subcommands: {
    create: libraryCreateCommand,
    list: libraryListCommand,
    roots: libraryRootsCommand,
    docs: libraryDocsCommand,
    stats: libraryStatsCommand,
    add: libraryAddCommand,
    remove: libraryRemoveCommand,
    nest: libraryNestCommand,
    delete: libraryDeleteCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: libraryCreateCommand,
    ls: libraryListCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return libraryListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(libraryCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf library --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
