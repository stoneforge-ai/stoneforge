export {
  useKeyboardShortcut,
  useDisableKeyboardShortcuts,
  useGlobalKeyboardShortcuts,
  getKeyboardManager,
} from './useKeyboardShortcuts';

// Re-export useShortcutVersion from keyboard lib for components that display shortcut hints
export { useShortcutVersion } from '../lib/keyboard';

export {
  GlobalQuickActionsProvider,
  useGlobalQuickActions,
} from './useGlobalQuickActions';

// Re-export useTheme from @stoneforge/ui
export { useTheme } from '@stoneforge/ui';
export type { Theme } from '@stoneforge/ui';

export { useDebounce } from './useDebounce';

export {
  useRelativeTime,
  useRelativeTimeUpdater,
  useRelativeTimeFormatter,
} from './useRelativeTime';

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

// Deep link navigation
export { useDeepLink } from './useDeepLink';

// Entity navigation for EntityLink
export { useEntityNavigation } from './useEntityNavigation';
