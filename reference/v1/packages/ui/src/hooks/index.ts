// Theme
export { useTheme, applyTheme, setHighContrastBase } from './useTheme';
export type { Theme } from './useTheme';

// Responsive breakpoints
export {
  useBreakpoint,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useCurrentBreakpoint,
  useMediaQuery,
  useResponsiveValue,
  useWindowSize,
  BREAKPOINTS,
} from './useBreakpoint';
export type { Breakpoint } from './useBreakpoint';

// WebSocket
export { useWebSocket, useWebSocketState } from './useWebSocket';
export type { UseWebSocketOptions, UseWebSocketResult } from './useWebSocket';

// SSE Stream
export { useSSEStream, useSSEState } from './useSSEStream';
export type { UseSSEStreamOptions, UseSSEStreamResult, SSEHistoryEvent } from './useSSEStream';

// Real-time Events (React Query integration)
export {
  useRealtimeEvents,
  createRealtimeEventsHook,
  defaultQueryKeyMapper,
} from './useRealtimeEvents';
export type {
  UseRealtimeEventsOptions,
  UseRealtimeEventsResult,
  QueryKeyMapper,
  QueryClient,
} from './useRealtimeEvents';

// Keyboard Shortcuts
export {
  useKeyboardShortcut,
  useDisableKeyboardShortcuts,
  useGlobalKeyboardShortcuts,
  useShortcutVersion,
  KeyboardShortcutManager,
  getKeyboardManager,
  createKeyboardManager,
  getCustomShortcuts,
  setCustomShortcuts,
  getCurrentBinding,
  checkShortcutConflict,
  setCustomShortcut,
  removeCustomShortcut,
  resetAllShortcuts,
  SHORTCUTS_CHANGED_EVENT,
} from './useKeyboardShortcuts';
export type {
  ShortcutHandler,
  ShortcutCategory,
  Shortcut,
  ShortcutDefinition,
  NavigateFunction,
  GlobalKeyboardShortcutsOptions,
} from './useKeyboardShortcuts';
