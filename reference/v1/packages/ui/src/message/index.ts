/**
 * Message Components Module
 *
 * Shared message UI components for Stoneforge platform.
 *
 * Usage:
 * - Import components: import { MessageRichComposer, CreateChannelModal } from '@stoneforge/ui/message'
 * - Also available via main entry: import { MessageRichComposer } from '@stoneforge/ui'
 */

// Core message components
export { MessageRichComposer } from './MessageRichComposer';
export type { MessageRichComposerRef } from './MessageRichComposer';
export { MessageImageAttachment } from './MessageImageAttachment';
export { MessageEmbedCard, TaskEmbedCard, DocumentEmbedCard } from './MessageEmbedCard';
export { ChannelMembersPanel } from './ChannelMembersPanel';
export { CreateChannelModal } from './CreateChannelModal';

// Editor extensions
export { HashAutocomplete, createElementFetcher, HashAutocompleteMenu } from './HashAutocomplete';
export type {
  HashAutocompleteItem,
  HashAutocompleteFetchCallbacks,
  HashAutocompleteMenuRef,
  HashAutocompleteOptions,
} from './HashAutocomplete';

export { MessageSlashCommands, MessageSlashCommandMenu } from './MessageSlashCommands';
export type {
  MessageEmbedCallbacks,
  MessageSlashCommandItem,
  MessageSlashCommandMenuRef,
  MessageSlashCommandsOptions,
} from './MessageSlashCommands';

// Mention autocomplete (used by MessageRichComposer)
export { MentionAutocomplete, MentionNode } from './MentionAutocomplete';
export type { MentionEntity } from './MentionAutocomplete';

// Utilities
export { prepareContentForEditor, prepareContentForStorage } from './markdown';

// Supporting components (EntityLink not re-exported to avoid collision with domain/EntityLink)
export { useDeleteChannel } from './useDeleteChannel';
