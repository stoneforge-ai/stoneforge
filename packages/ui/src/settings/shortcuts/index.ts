/**
 * Keyboard Shortcuts Settings Module
 *
 * Provides shared components and utilities for keyboard shortcut
 * customization in settings pages.
 */

export { ShortcutsSection } from './ShortcutsSection';
export type { ShortcutsSectionProps } from './ShortcutsSection';

export {
  formatShortcutDisplay,
  isMac,
  CATEGORY_LABELS,
  groupShortcutsByCategory,
} from './utils';
export type { ShortcutItem } from './utils';
