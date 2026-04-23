/**
 * Docs Commands - Documentation infrastructure bootstrapping and shortcuts
 *
 * Provides CLI commands for documentation workflow:
 * - docs init: Bootstrap Documentation library and Documentation Directory
 * - docs add: Add document(s) to the Documentation library
 * - docs dir: Show the Documentation Directory document
 */

import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import {
  createLibrary,
  createDocument,
  ContentType,
  DocumentCategory,
  type Library,
  type Document,
  type CreateLibraryInput,
  type CreateDocumentInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Constants
// ============================================================================

const DOCUMENTATION_LIBRARY_NAME = 'Documentation';
const DOCUMENTATION_DIRECTORY_TITLE = 'Documentation Directory';
const DOCUMENTATION_DIRECTORY_PURPOSE = 'document-directory';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find an existing library by name.
 */
async function findLibraryByName(
  api: QuarryAPI,
  name: string
): Promise<Library | null> {
  const result = await api.listPaginated<Library>({ type: 'library' });
  return result.items.find((lib) => lib.name === name) ?? null;
}

/**
 * Find a document with specific metadata purpose.
 */
async function findDocumentByMetadataPurpose(
  api: QuarryAPI,
  purpose: string
): Promise<Document | null> {
  const result = await api.listPaginated<Document>({ type: 'document' });
  return (
    result.items.find(
      (doc) =>
        doc.metadata &&
        (doc.metadata as Record<string, unknown>).purpose === purpose
    ) ?? null
  );
}

/**
 * Check if a document belongs to a library (has parent-child dependency).
 */
async function isDocumentInLibrary(
  api: QuarryAPI,
  docId: ElementId,
  libraryId: ElementId
): Promise<boolean> {
  const deps = await api.getDependencies(docId, ['parent-child']);
  return deps.some((d) => d.blockerId === libraryId);
}

/**
 * Generate the starter template for the Documentation Directory.
 */
function generateDirectoryTemplate(directoryDocId: string): string {
  return `# Documentation Directory

Index of all workspace documents. Start with this document to navigate workspace knowledge.

## Specs

(none yet)

## References

| ID | Title |
|----|-------|
| ${directoryDocId} | Documentation Directory (this document) |

## How-To Guides

(none yet)

## Explanations

(none yet)

## Decision Logs

(none yet)`;
}

// ============================================================================
// Docs Init Command
// ============================================================================

async function docsInitHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const mode = getOutputMode(options);

    // Step 1: Find or create Documentation library
    let library = await findLibraryByName(api, DOCUMENTATION_LIBRARY_NAME);
    let libraryCreated = false;

    if (!library) {
      const input: CreateLibraryInput = {
        name: DOCUMENTATION_LIBRARY_NAME,
        createdBy: actor,
      };
      const libElement = await createLibrary(input, api.getIdGeneratorConfig());
      library = (await api.create(
        libElement as unknown as Element & Record<string, unknown>
      )) as unknown as Library;
      libraryCreated = true;
    }

    // Step 2: Find or create Documentation Directory document
    let directoryDoc = await findDocumentByMetadataPurpose(
      api,
      DOCUMENTATION_DIRECTORY_PURPOSE
    );
    let directoryCreated = false;

    if (!directoryDoc) {
      // We need to create the document first with a placeholder, then update with actual ID
      const docInput: CreateDocumentInput = {
        title: DOCUMENTATION_DIRECTORY_TITLE,
        content: '', // placeholder - will be updated
        contentType: ContentType.MARKDOWN,
        category: DocumentCategory.REFERENCE,
        createdBy: actor,
        metadata: { purpose: DOCUMENTATION_DIRECTORY_PURPOSE },
      };
      const docElement = await createDocument(docInput, api.getIdGeneratorConfig());
      directoryDoc = (await api.create(
        docElement as unknown as Element & Record<string, unknown>
      )) as unknown as Document;

      // Now update with actual ID in the template
      const template = generateDirectoryTemplate(directoryDoc.id);
      directoryDoc = await api.update<Document>(
        directoryDoc.id as ElementId,
        { content: template },
        { actor }
      );
      directoryCreated = true;
    }

    // Step 3: Ensure the directory doc belongs to the library
    const inLibrary = await isDocumentInLibrary(
      api,
      directoryDoc.id as ElementId,
      library.id as ElementId
    );

    if (!inLibrary) {
      await api.addDependency({
        blockedId: directoryDoc.id as ElementId,
        blockerId: library.id as ElementId,
        type: 'parent-child',
        actor,
      });
    }

    // Step 4: Output results
    const resultData = {
      libraryId: library.id,
      directoryDocId: directoryDoc.id,
      libraryCreated,
      directoryCreated,
    };

    if (mode === 'quiet') {
      return success(`${library.id}\n${directoryDoc.id}`);
    }

    if (mode === 'json') {
      return success(resultData);
    }

    const statusLib = libraryCreated ? 'created' : 'found';
    const statusDir = directoryCreated ? 'created' : 'found';

    const output = `Documentation library ${statusLib}: ${library.id}
Documentation Directory ${statusDir}: ${directoryDoc.id}`;

    return success(resultData, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(
      `Failed to initialize documentation: ${message}`,
      ExitCode.GENERAL_ERROR
    );
  }
}

const docsInitCommand: Command = {
  name: 'init',
  description: 'Bootstrap Documentation library and directory',
  usage: 'sf docs init',
  help: `Bootstrap documentation infrastructure for the workspace.

Idempotently finds or creates:
1. A "Documentation" library
2. A "Documentation Directory" document (reference category)
3. Ensures the directory document belongs to the library

Running multiple times produces the same result without duplicates.

Examples:
  sf docs init
  sf docs init --json
  sf docs init --quiet`,
  handler: docsInitHandler as Command['handler'],
};

// ============================================================================
// Docs Add Command
// ============================================================================

async function docsAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  if (args.length === 0) {
    return failure(
      'Usage: sf docs add <doc-id> [doc-id2 ...]',
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const mode = getOutputMode(options);

    // Find Documentation library by name
    const library = await findLibraryByName(api, DOCUMENTATION_LIBRARY_NAME);
    if (!library) {
      return failure(
        'Documentation library not found. Run "sf docs init" first.',
        ExitCode.NOT_FOUND
      );
    }

    const results: Array<{ docId: string; added: boolean; error?: string }> = [];

    for (const docId of args) {
      try {
        // Verify document exists
        const doc = await api.get<Element>(docId as ElementId);
        if (!doc) {
          results.push({ docId, added: false, error: `Document not found: ${docId}` });
          continue;
        }
        if (doc.type !== 'document') {
          results.push({
            docId,
            added: false,
            error: `Element ${docId} is not a document (type: ${doc.type})`,
          });
          continue;
        }

        // Check if already in library
        const alreadyIn = await isDocumentInLibrary(
          api,
          docId as ElementId,
          library.id as ElementId
        );
        if (alreadyIn) {
          results.push({ docId, added: false, error: 'Already in library' });
          continue;
        }

        // Add parent-child dependency
        await api.addDependency({
          blockedId: docId as ElementId,
          blockerId: library.id as ElementId,
          type: 'parent-child',
          actor,
        });

        results.push({ docId, added: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ docId, added: false, error: message });
      }
    }

    const added = results.filter((r) => r.added);
    const failed = results.filter((r) => !r.added);

    if (mode === 'quiet') {
      return success(added.map((r) => r.docId).join('\n'));
    }

    if (mode === 'json') {
      return success({ libraryId: library.id, results });
    }

    // Human-readable output
    const lines: string[] = [];
    for (const r of results) {
      if (r.added) {
        lines.push(`Added ${r.docId} to Documentation library`);
      } else {
        lines.push(`Skipped ${r.docId}: ${r.error}`);
      }
    }

    const summary =
      added.length > 0
        ? `${added.length} document(s) added to Documentation library (${library.id})`
        : 'No documents added';

    if (failed.length > 0 && added.length === 0) {
      return success({ libraryId: library.id, results }, lines.join('\n'));
    }

    return success(
      { libraryId: library.id, results },
      lines.join('\n') + '\n' + summary
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(
      `Failed to add document(s): ${message}`,
      ExitCode.GENERAL_ERROR
    );
  }
}

const docsAddCommand: Command = {
  name: 'add',
  description: 'Add document(s) to the Documentation library',
  usage: 'sf docs add <doc-id> [doc-id2 ...]',
  help: `Add one or more documents to the Documentation library.

The Documentation library must exist (run "sf docs init" first).

Arguments:
  doc-id    Document identifier(s) to add

Examples:
  sf docs add el-doc123
  sf docs add el-doc123 el-doc456 el-doc789
  sf docs add el-doc123 --json`,
  handler: docsAddHandler as Command['handler'],
};

// ============================================================================
// Docs Dir Command
// ============================================================================

async function docsDirectoryHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const mode = getOutputMode(options);

    const directoryDoc = await findDocumentByMetadataPurpose(
      api,
      DOCUMENTATION_DIRECTORY_PURPOSE
    );

    if (!directoryDoc) {
      return failure(
        'Documentation Directory not found. Run "sf docs init" first.',
        ExitCode.NOT_FOUND
      );
    }

    const includeContent = Boolean(options.content);

    if (mode === 'quiet') {
      return success(directoryDoc.id);
    }

    if (mode === 'json') {
      const data: Record<string, unknown> = {
        id: directoryDoc.id,
        title: directoryDoc.title,
      };
      if (includeContent) {
        data.content = directoryDoc.content;
      }
      return success(data);
    }

    // Human-readable output
    let output = `${directoryDoc.id}  ${directoryDoc.title}`;
    if (includeContent) {
      output += `\n\n${directoryDoc.content}`;
    }

    const data: Record<string, unknown> = {
      id: directoryDoc.id,
      title: directoryDoc.title,
    };
    if (includeContent) {
      data.content = directoryDoc.content;
    }

    return success(data, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(
      `Failed to find Documentation Directory: ${message}`,
      ExitCode.GENERAL_ERROR
    );
  }
}

const docsDirectoryCommand: Command = {
  name: 'dir',
  description: 'Show the Documentation Directory document',
  usage: 'sf docs dir [--content]',
  options: [
    {
      name: 'content',
      description: 'Include the full document content in output',
    },
  ],
  help: `Find and display the Documentation Directory document.

Shows the ID and title of the Documentation Directory. Use --content
to also display the full markdown content.

The Documentation Directory must exist (run "sf docs init" first).

Options:
  --content   Include the full document content in output

Examples:
  sf docs dir
  sf docs dir --content
  sf docs dir --json
  sf docs dir --quiet`,
  handler: docsDirectoryHandler as Command['handler'],
};

// ============================================================================
// Docs Root Command
// ============================================================================

export const docsCommand: Command = {
  name: 'docs',
  description: 'Documentation infrastructure commands',
  usage: 'sf docs <subcommand> [options]',
  help: `Manage documentation infrastructure.

Provides shortcuts for bootstrapping and managing the Documentation
library and Documentation Directory.

Subcommands:
  init    Bootstrap Documentation library and directory
  add     Add document(s) to the Documentation library
  dir     Show the Documentation Directory document

Examples:
  sf docs init
  sf docs init --json
  sf docs add el-doc123
  sf docs add el-doc123 el-doc456
  sf docs dir
  sf docs dir --content`,
  subcommands: {
    init: docsInitCommand,
    add: docsAddCommand,
    dir: docsDirectoryCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default handler: show help
    if (args.length === 0) {
      const helpText = `Documentation infrastructure commands.

Usage: sf docs <subcommand> [options]

Subcommands:
  init    Bootstrap Documentation library and directory
  add     Add document(s) to the Documentation library
  dir     Show the Documentation Directory document

Run "sf docs --help" for more details.`;
      return success(null, helpText);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(docsCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map((s) => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf docs --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
