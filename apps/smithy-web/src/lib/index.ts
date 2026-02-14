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
  LINK_REGEX,
  extractMentionName,
  unescapeMarkdown,
  convertInlineMarkdown,
  renderMessageContent,
  highlightSearchMatch,
} from './message-content';

// Keyboard shortcuts
export {
  DEFAULT_SHORTCUTS,
  getShortcutsByCategory,
  formatKeyBinding,
  getAllShortcuts,
} from './keyboard';

// Language detection for Monaco editor
export {
  type MonacoLanguage,
  type FileCategory,
  type LanguageInfo,
  detectLanguageFromFilename,
  detectLanguageFromContentType,
  getMonacoLanguage,
  getMonacoLanguageFromContentType,
  getFileCategory,
  isCodeFile,
  isConfigFile,
  isDataFile,
} from './language-detection';
