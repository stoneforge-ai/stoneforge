/**
 * Folder Provider — exports for the folder external sync provider
 *
 * Exports the folder provider factory, document adapter, and
 * filesystem utilities.
 */

// Provider factory
export { createFolderProvider } from './folder-provider.js';

// Document adapter
export {
  FolderDocumentAdapter,
  createFolderDocumentAdapter,
  slugify,
} from './folder-document-adapter.js';

// Filesystem client (re-export for convenience)
export {
  readFile,
  writeFile,
  listFiles,
  parseFrontmatter,
  serializeFrontmatter,
  FolderFsError,
  isFolderFsError,
} from './folder-fs.js';
export type {
  FolderFrontmatter,
  FolderFileReadResult,
  FolderFileEntry,
  ListFilesOptions,
} from './folder-fs.js';
