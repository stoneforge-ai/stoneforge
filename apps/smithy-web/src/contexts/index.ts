export { CurrentUserProvider, useCurrentUser } from './CurrentUserContext';
export {
  WorkspaceProvider,
  useWorkspace,
  type FileEntry,
  type FileSystemEntry, // Deprecated alias for FileEntry
  type FileReadResult,
  type FileWriteResult,
  type UseServerWorkspaceReturn,
} from './WorkspaceContext';
