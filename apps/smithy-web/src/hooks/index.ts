export { useDebounce } from './useDebounce';

// Keyboard shortcuts hooks
export {
  useGlobalKeyboardShortcuts,
  useKeyboardShortcut,
  useDisableKeyboardShortcuts,
  useShortcutVersion,
  getKeyboardManager,
  getCustomShortcuts,
  setCustomShortcuts,
  setCustomShortcut,
  removeCustomShortcut,
  resetAllShortcuts,
  checkShortcutConflict,
  getCurrentBinding,
  SHORTCUTS_CHANGED_EVENT,
} from './useKeyboardShortcuts';
export type { GlobalKeyboardShortcutsOptions } from './useKeyboardShortcuts';

// Responsive breakpoint hooks
export {
  useBreakpoint,
  useWindowSize,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useDeviceType,
  useMediaQuery,
  useBreakpointAtLeast,
  useBreakpointAtMost,
  useBreakpointBetween,
  useTouchDevice,
  usePrefersReducedMotion,
  useResponsive,
  BREAKPOINTS,
  BREAKPOINT_ORDER,
} from './useBreakpoint';

export type { Breakpoint, DeviceType } from './useBreakpoint';

// Deep-link navigation hook
export { useDeepLink } from './useDeepLink';
export type { UseDeepLinkOptions, UseDeepLinkResult } from './useDeepLink';

// Paginated data hook
export { usePaginatedData } from './usePaginatedData';

// Server Workspace hook (replaced FSAPI)
export { useServerWorkspace } from './useServerWorkspace';
export type {
  FileEntry,
  FileReadResult,
  FileWriteResult,
  UseServerWorkspaceReturn,
} from './useServerWorkspace';

// Column resize hook
export { useColumnResize } from './useColumnResize';

// File Content Search hook
export {
  useFileContentSearch,
  SEARCH_DEBOUNCE_DELAY as FILE_SEARCH_DEBOUNCE_DELAY,
  MAX_MATCHES_PER_FILE,
  MAX_TOTAL_MATCHES,
} from './useFileContentSearch';
export type {
  FileMatch,
  FileSearchResult,
  FileContentSearchState,
  FileContentSearchOptions,
  UseFileContentSearchReturn,
} from './useFileContentSearch';
