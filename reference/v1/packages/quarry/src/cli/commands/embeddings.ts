/**
 * Embeddings Commands - Manage document embeddings for semantic search
 *
 * Provides CLI commands for embedding operations:
 * - embeddings install: Download the local embedding model
 * - embeddings status: Show embedding configuration and model availability
 * - embeddings reindex: Re-embed all documents
 * - embeddings search: Semantic search (for testing)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { DocumentStatus, type Document, type ElementId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { EmbeddingService } from '../../services/embeddings/service.js';
import { LocalEmbeddingProvider } from '../../services/embeddings/local-provider.js';
import { suggestCommands } from '../suggest.js';
import { createAPI, STONEFORGE_DIR } from '../db.js';

// ============================================================================
// Constants
// ============================================================================

const MODELS_DIR = 'models';
const DEFAULT_MODEL = 'bge-base-en-v1.5';

// ============================================================================
// Helpers
// ============================================================================

function createEmbeddingService(options: GlobalOptions): { service: EmbeddingService; error?: string } {
  const { backend, error } = createAPI(options);
  if (error) {
    return {
      service: null as unknown as EmbeddingService,
      error,
    };
  }

  try {
    const provider = new LocalEmbeddingProvider();
    return { service: new EmbeddingService(backend, { provider }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      service: null as unknown as EmbeddingService,
      error: `Failed to initialize embedding service: ${message}`,
    };
  }
}

// ============================================================================
// Embeddings Install Command
// ============================================================================

async function embeddingsInstallHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const modelDir = join(process.cwd(), STONEFORGE_DIR, MODELS_DIR, DEFAULT_MODEL);

  if (existsSync(modelDir)) {
    return success(null, `Model ${DEFAULT_MODEL} is already installed at ${modelDir}`);
  }

  try {
    // Create model directory (placeholder for actual model download)
    mkdirSync(modelDir, { recursive: true });

    // TODO: Download actual ONNX model files
    // For now, just create the directory to mark as "installed"

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ model: DEFAULT_MODEL, path: modelDir, status: 'installed' });
    }

    return success(
      null,
      `Installed embedding model ${DEFAULT_MODEL} at ${modelDir}\n` +
      `Note: Using placeholder implementation. ONNX model download will be added in a future release.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to install embedding model: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const embeddingsInstallCommand: Command = {
  name: 'install',
  description: 'Download the local embedding model',
  usage: 'sf embeddings install',
  help: `Download and install the local embedding model (bge-base-en-v1.5).

The model is stored in .stoneforge/models/ and used for semantic search.

Examples:
  sf embeddings install`,
  handler: embeddingsInstallHandler as Command['handler'],
};

// ============================================================================
// Embeddings Status Command
// ============================================================================

async function embeddingsStatusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const modelDir = join(process.cwd(), STONEFORGE_DIR, MODELS_DIR, DEFAULT_MODEL);
  const modelInstalled = existsSync(modelDir);

  const { service, error } = createEmbeddingService(options);

  const status = {
    model: DEFAULT_MODEL,
    modelInstalled,
    modelPath: modelDir,
    provider: service ? service.getProviderInfo() : null,
    available: service ? await service.isAvailable() : false,
    error: error ?? null,
  };

  const mode = getOutputMode(options);
  if (mode === 'json') {
    return success(status);
  }

  const lines = [
    `Model: ${status.model}`,
    `Installed: ${status.modelInstalled ? 'Yes' : 'No'}`,
    `Path: ${status.modelPath}`,
    `Available: ${status.available ? 'Yes' : 'No'}`,
  ];

  if (status.provider) {
    lines.push(`Provider: ${status.provider.name} (${status.provider.dimensions}d, ${status.provider.isLocal ? 'local' : 'remote'})`);
  }

  if (status.error) {
    lines.push(`Error: ${status.error}`);
  }

  if (!status.modelInstalled) {
    lines.push(`\nRun 'sf embeddings install' to download the model.`);
  }

  return success(status, lines.join('\n'));
}

const embeddingsStatusCommand: Command = {
  name: 'status',
  description: 'Show embedding configuration and model availability',
  usage: 'sf embeddings status',
  help: `Show the current embedding configuration and model status.

Examples:
  sf embeddings status`,
  handler: embeddingsStatusHandler as Command['handler'],
};

// ============================================================================
// Embeddings Reindex Command
// ============================================================================

async function embeddingsReindexHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { service, error: serviceError } = createEmbeddingService(options);
  if (serviceError) {
    return failure(serviceError, ExitCode.GENERAL_ERROR);
  }

  const available = await service.isAvailable();
  if (!available) {
    return failure(
      `Embedding model not installed. Run 'sf embeddings install' first.`,
      ExitCode.GENERAL_ERROR
    );
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get all documents (including archived)
    const result = await api.listPaginated<Document>({
      type: 'document',
      limit: 10000,
      status: [DocumentStatus.ACTIVE, DocumentStatus.ARCHIVED],
    } as Record<string, unknown>);

    const documents = result.items.map((doc) => ({
      id: doc.id,
      content: `${doc.title ?? ''} ${doc.content}`.trim(),
    }));

    const { indexed, errors } = await service.reindexAll(documents);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ indexed, errors, total: documents.length });
    }

    return success(
      null,
      `Re-embedded ${indexed} documents${errors > 0 ? ` (${errors} errors)` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to reindex embeddings: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const embeddingsReindexCommand: Command = {
  name: 'reindex',
  description: 'Re-embed all documents',
  usage: 'sf embeddings reindex',
  help: `Re-generate embeddings for all documents.

Requires the embedding model to be installed first.

Examples:
  sf embeddings reindex`,
  handler: embeddingsReindexHandler as Command['handler'],
};

// ============================================================================
// Embeddings Search Command
// ============================================================================

async function embeddingsSearchHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const query = args.join(' ');

  if (!query.trim()) {
    return failure('Usage: sf embeddings search <query>', ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error: serviceError } = createEmbeddingService(options);
  if (serviceError) {
    return failure(serviceError, ExitCode.GENERAL_ERROR);
  }

  const available = await service.isAvailable();
  if (!available) {
    return failure(
      `Embedding model not installed. Run 'sf embeddings install' first.`,
      ExitCode.GENERAL_ERROR
    );
  }

  try {
    const results = await service.searchSemantic(query.trim(), 10);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(results);
    }

    if (results.length === 0) {
      return success(null, 'No results found');
    }

    const lines = results.map((r, i) =>
      `${i + 1}. ${r.documentId} (similarity: ${r.similarity.toFixed(4)})`
    );

    return success(results, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to search embeddings: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const embeddingsSearchCommand: Command = {
  name: 'search',
  description: 'Semantic search (for testing)',
  usage: 'sf embeddings search <query>',
  help: `Perform a semantic search over document embeddings.

This command is primarily for testing. Use 'sf doc search' for production search.

Examples:
  sf embeddings search "authentication flow"
  sf embeddings search "database migration"`,
  handler: embeddingsSearchHandler as Command['handler'],
};

// ============================================================================
// Embeddings Root Command
// ============================================================================

export const embeddingsCommand: Command = {
  name: 'embeddings',
  description: 'Manage document embeddings for semantic search',
  usage: 'sf embeddings <subcommand>',
  help: `Manage document embeddings for semantic search.

Embeddings enable semantic (meaning-based) search in addition to keyword search.
A local embedding model generates vector representations of document content.

Subcommands:
  install   Download the local embedding model
  status    Show configuration and model availability
  reindex   Re-embed all documents
  search    Semantic search (for testing)

Examples:
  sf embeddings install
  sf embeddings status
  sf embeddings reindex
  sf embeddings search "how to deploy"`,
  subcommands: {
    install: embeddingsInstallCommand,
    status: embeddingsStatusCommand,
    reindex: embeddingsReindexCommand,
    search: embeddingsSearchCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    find: embeddingsSearchCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        `Usage: sf embeddings <subcommand>. Use 'sf embeddings --help' for available subcommands.`,
        ExitCode.INVALID_ARGUMENTS
      );
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(embeddingsCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf embeddings --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
