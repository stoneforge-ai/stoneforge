export { keyboardManager, type Shortcut, type ShortcutHandler } from './keyboard';
export {
  findElementPosition,
  calculateScrollOffset,
  applyHighlight,
  highlightByTestId,
  HIGHLIGHT_DURATION,
  HIGHLIGHT_CLASS,
  type DeepLinkConfig,
  type DeepLinkResult,
} from './deep-link';
export {
  type TimePeriod,
  TIME_PERIOD_LABELS,
  getTimePeriod,
  groupByTimePeriod,
  formatRelativeTime,
  formatCompactTime,
  getUpdateInterval,
  getSmartUpdateInterval,
  type GroupedItem,
  // TB99: Message Day Separation
  getDateKey,
  formatDateSeparator,
  groupMessagesByDay,
  type MessageWithDayGroup,
} from './time';

// Message content rendering utilities
export {
  MENTION_REGEX,
  IMAGE_REGEX,
  EMBED_REGEX,
  LINK_REGEX,
  extractMentionName,
  unescapeMarkdown,
  convertInlineMarkdown,
  renderMessageContent,
  highlightSearchMatch,
} from './message-content';
