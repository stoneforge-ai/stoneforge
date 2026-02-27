/**
 * Message Commands - Message sending and threading CLI interface
 *
 * Provides CLI commands for message operations:
 * - msg send: Send a message to a channel
 * - msg thread: View thread replies
 * - msg list: List messages in a channel
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import {
  createMessage,
  type Message,
  type HydratedMessage,
  type ChannelId,
  type MessageId,
  filterByChannel,
  getThreadMessages,
  sortByCreatedAt,
  isRootMessage,
} from '@stoneforge/core';
import {
  createDocument,
  ContentType,
  DocumentCategory,
  type DocumentId,
} from '@stoneforge/core';
import type { Channel } from '@stoneforge/core';
import {
  isMember,
  isDirectChannel,
  findDirectChannel,
  createDirectChannel,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Message Send Command
// ============================================================================

interface MsgSendOptions {
  channel?: string;
  to?: string;
  replyTo?: string;
  content?: string;
  file?: string;
  thread?: string;
  attachment?: string | string[];
  tag?: string[];
}

const msgSendOptions: CommandOption[] = [
  {
    name: 'channel',
    short: 'c',
    description: 'Channel ID to send to (required unless --to or --reply-to is used)',
    hasValue: true,
  },
  {
    name: 'to',
    short: 'T',
    description: 'Entity ID to send DM to (finds or creates DM channel)',
    hasValue: true,
  },
  {
    name: 'replyTo',
    short: 'r',
    description: 'Message ID to reply to (auto-sets channel, thread, and swaps sender/recipient in DM)',
    hasValue: true,
  },
  {
    name: 'content',
    short: 'm',
    description: 'Message content (text)',
    hasValue: true,
  },
  {
    name: 'file',
    description: 'Read content from file',
    hasValue: true,
  },
  {
    name: 'thread',
    short: 't',
    description: 'Reply to message (thread ID)',
    hasValue: true,
  },
  {
    name: 'attachment',
    short: 'a',
    description: 'Attach document ID (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function msgSendHandler(
  _args: string[],
  options: GlobalOptions & MsgSendOptions
): Promise<CommandResult> {
  // Must specify either --content or --file
  if (!options.content && !options.file) {
    return failure('Either --content or --file is required', ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure('Cannot specify both --content and --file', ExitCode.INVALID_ARGUMENTS);
  }

  // Must have one of: --channel, --to, or --reply-to
  if (!options.channel && !options.to && !options.replyTo) {
    return failure('One of --channel, --to, or --reply-to is required', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    let actor = resolveActor(options);
    let channelId: ChannelId | undefined = options.channel as ChannelId | undefined;
    let threadId: MessageId | null = options.thread ? (options.thread as MessageId) : null;

    // Handle --reply-to: auto-set channel, thread, and swap sender/recipient in DM
    if (options.replyTo) {
      const replyToMessage = await api.get<Message>(options.replyTo as ElementId);
      if (!replyToMessage) {
        return failure(`Reply-to message not found: ${options.replyTo}`, ExitCode.NOT_FOUND);
      }
      if (replyToMessage.type !== 'message') {
        return failure(`Element ${options.replyTo} is not a message (type: ${replyToMessage.type})`, ExitCode.VALIDATION);
      }

      // Set channel from replied-to message
      channelId = replyToMessage.channelId;

      // Set thread: use replied-to message's thread, or if not in a thread, use the message itself
      threadId = replyToMessage.threadId ?? (replyToMessage.id as MessageId);

      // If in a DM channel and --from/--actor not explicitly set, swap sender/recipient
      if (!options.actor) {
        const replyChannel = await api.get<Channel>(channelId as unknown as ElementId);
        if (replyChannel && isDirectChannel(replyChannel)) {
          // Get the other party in the DM channel
          const otherParty = replyChannel.members.find((m) => m !== replyToMessage.sender);
          if (otherParty) {
            actor = otherParty;
          }
        }
      }
    }

    // Handle --to: find or create DM channel between actor and target
    if (options.to) {
      const toEntity = options.to as EntityId;

      // Validate target entity exists
      const targetEntity = await api.get(toEntity as unknown as ElementId);
      if (!targetEntity) {
        return failure(`Target entity not found: ${toEntity}`, ExitCode.NOT_FOUND);
      }
      if (targetEntity.type !== 'entity') {
        return failure(`Element ${toEntity} is not an entity (type: ${targetEntity.type})`, ExitCode.VALIDATION);
      }

      // Find existing DM channel
      const allChannels = await api.list<Channel>({ type: 'channel' });
      let dmChannel = findDirectChannel(allChannels, actor, toEntity);

      // Create DM channel if not found
      if (!dmChannel) {
        // Look up entity names for channel naming
        const actorEntity = await api.get(actor as unknown as ElementId);
        const actorName = (actorEntity as { name?: string } | null)?.name;
        const targetName = (targetEntity as { name?: string }).name;

        const newDmChannel = await createDirectChannel({
          entityA: actor,
          entityB: toEntity,
          createdBy: actor,
          ...(actorName && { entityAName: actorName }),
          ...(targetName && { entityBName: targetName }),
        });
        dmChannel = await api.create<Channel>(newDmChannel as unknown as Channel & Record<string, unknown>);
      }

      channelId = dmChannel.id as unknown as ChannelId;
    }

    if (!channelId) {
      return failure('Could not determine channel', ExitCode.GENERAL_ERROR);
    }

    // Validate channel exists and sender is a member
    const channel = await api.get<Channel>(channelId as unknown as ElementId);
    if (!channel) {
      return failure(`Channel not found: ${channelId}`, ExitCode.NOT_FOUND);
    }
    if (channel.type !== 'channel') {
      return failure(`Element ${channelId} is not a channel (type: ${channel.type})`, ExitCode.VALIDATION);
    }
    if (!isMember(channel, actor)) {
      return failure(`You are not a member of channel ${channelId}`, ExitCode.PERMISSION);
    }

    // Get content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!existsSync(filePath)) {
        return failure(`File not found: ${filePath}`, ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Create content document (immutable, categorized as message content)
    const contentDoc = await createDocument({
      content,
      contentType: ContentType.TEXT,
      createdBy: actor,
      category: DocumentCategory.MESSAGE_CONTENT,
      immutable: true,
    }, api.getIdGeneratorConfig());
    const createdContentDoc = await api.create(contentDoc as unknown as Element & Record<string, unknown>);

    // Validate thread parent if specified (and not already set by --reply-to)
    if (options.thread && !options.replyTo) {
      const threadParent = await api.get<Message>(options.thread as unknown as ElementId);
      if (!threadParent) {
        return failure(`Thread parent message not found: ${options.thread}`, ExitCode.NOT_FOUND);
      }
      if (threadParent.type !== 'message') {
        return failure(`Element ${options.thread} is not a message (type: ${threadParent.type})`, ExitCode.VALIDATION);
      }
      if (threadParent.channelId !== channelId) {
        return failure(`Thread parent message is in a different channel`, ExitCode.VALIDATION);
      }
      threadId = options.thread as MessageId;
    }

    // Handle attachments
    let attachments: DocumentId[] | undefined;
    if (options.attachment) {
      const attachmentIds = Array.isArray(options.attachment)
        ? options.attachment
        : [options.attachment];
      attachments = [];
      for (const attachmentId of attachmentIds) {
        const attachmentDoc = await api.get(attachmentId as ElementId);
        if (!attachmentDoc) {
          return failure(`Attachment document not found: ${attachmentId}`, ExitCode.NOT_FOUND);
        }
        if (attachmentDoc.type !== 'document') {
          return failure(`Attachment ${attachmentId} is not a document (type: ${attachmentDoc.type})`, ExitCode.VALIDATION);
        }
        attachments.push(attachmentId as DocumentId);
      }
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Create the message
    const message = await createMessage({
      channelId,
      sender: actor,
      contentRef: createdContentDoc.id as unknown as DocumentId,
      attachments,
      threadId,
      tags,
    }, api.getIdGeneratorConfig());

    const createdMessage = await api.create<Message>(
      message as unknown as Message & Record<string, unknown>
    );

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(createdMessage.id);
    }

    const replyInfo = threadId ? ` (reply to ${threadId})` : '';
    return success(createdMessage, `Sent message ${createdMessage.id} to ${channelId}${replyInfo}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to send message: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const msgSendCommand: Command = {
  name: 'send',
  description: 'Send a message to a channel or entity',
  usage: 'sf message send (--channel <id> | --to <entity> | --reply-to <msg>) --content <text> | --file <path> [options]',
  help: `Send a message to a channel, entity (DM), or as a reply.

Options:
  -c, --channel <id>      Channel to send to
  -T, --to <entity>       Entity to send DM to (finds or creates DM channel)
  -r, --reply-to <msg>    Message ID to reply to (auto-sets channel, thread, swaps sender/recipient in DM)
  -m, --content <text>    Message content
      --file <path>       Read content from file
  -t, --thread <id>       Reply to message (creates thread)
  -a, --attachment <id>   Attach document (can be repeated)
      --tag <tag>         Add tag (can be repeated)

When using --to, a DM channel is found or created between you and the target entity.
When using --reply-to in a DM channel, sender/recipient are automatically swapped.

Examples:
  sf message send --channel el-abc123 --content "Hello!"
  sf message send --to el-user456 -m "Direct message"
  sf message send --reply-to el-msg789 -m "Reply to your message"
  sf --from agent-1 msg send --to agent-2 -m "Message from agent-1"
  sf message send -c el-abc123 --file message.txt
  sf message send -c el-abc123 -m "Reply" --thread el-msg456`,
  options: msgSendOptions,
  handler: msgSendHandler as Command['handler'],
};

// ============================================================================
// Message Thread Command
// ============================================================================

interface MsgThreadOptions {
  limit?: string;
}

const msgThreadOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of messages to show',
    hasValue: true,
  },
];

async function msgThreadHandler(
  args: string[],
  options: GlobalOptions & MsgThreadOptions
): Promise<CommandResult> {
  const [messageId] = args;

  if (!messageId) {
    return failure('Usage: sf message thread <message-id>\nExample: sf message thread el-msg123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the root message
    const rootMessage = await api.get<Message>(messageId as ElementId, { hydrate: { content: true } });
    if (!rootMessage) {
      return failure(`Message not found: ${messageId}`, ExitCode.NOT_FOUND);
    }
    if (rootMessage.type !== 'message') {
      return failure(`Element ${messageId} is not a message (type: ${rootMessage.type})`, ExitCode.VALIDATION);
    }

    // Get all messages in the channel
    const allMessages = await api.list<Message>({ type: 'message' });
    const channelMessages = filterByChannel(allMessages, rootMessage.channelId);

    // Get thread messages (root + replies)
    const threadMessages = getThreadMessages(channelMessages, messageId as MessageId);

    // Apply limit
    let messages = threadMessages;
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      messages = threadMessages.slice(0, limit);
    }

    // Hydrate content for display
    const hydratedMessages: HydratedMessage[] = [];
    for (const msg of messages) {
      const hydrated = await api.get<HydratedMessage>(msg.id, { hydrate: { content: true } });
      if (hydrated) {
        hydratedMessages.push(hydrated);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(hydratedMessages);
    }

    if (mode === 'quiet') {
      return success(hydratedMessages.map((m) => m.id).join('\n'));
    }

    if (hydratedMessages.length === 0) {
      return success(null, 'No messages in thread');
    }

    // Build table
    const headers = ['ID', 'SENDER', 'CONTENT', 'CREATED'];
    const rows = hydratedMessages.map((m) => {
      const contentPreview = (m.content ?? '').substring(0, 40);
      const truncated = contentPreview.length < (m.content?.length ?? 0) ? '...' : '';
      return [
        m.id,
        m.sender,
        contentPreview + truncated,
        m.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const threadInfo = isRootMessage(rootMessage)
      ? 'Root message with'
      : 'Reply to ' + rootMessage.threadId + ' with';
    const summary = `\n${threadInfo} ${hydratedMessages.length - 1} replies`;

    return success(hydratedMessages, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get thread: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const msgThreadCommand: Command = {
  name: 'thread',
  description: 'View thread messages',
  usage: 'sf message thread <message-id> [options]',
  help: `View a message thread (root message and all replies).

Arguments:
  message-id   Message identifier (root or any reply)

Options:
  -l, --limit <n>   Maximum messages to show

Examples:
  sf message thread el-msg123
  sf message thread el-msg123 --limit 10`,
  options: msgThreadOptions,
  handler: msgThreadHandler as Command['handler'],
};

// ============================================================================
// Message List Command
// ============================================================================

interface MsgListOptions {
  channel: string;
  sender?: string;
  limit?: string;
  rootOnly?: boolean;
}

const msgListOptions: CommandOption[] = [
  {
    name: 'channel',
    short: 'c',
    description: 'Channel ID to list messages from (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'sender',
    short: 's',
    description: 'Filter by sender entity ID',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of messages',
    hasValue: true,
  },
  {
    name: 'rootOnly',
    short: 'r',
    description: 'Show only root messages (no replies)',
    hasValue: false,
  },
];

async function msgListHandler(
  _args: string[],
  options: GlobalOptions & MsgListOptions
): Promise<CommandResult> {
  if (!options.channel) {
    return failure('--channel is required', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const channelId = options.channel as ChannelId;

    // Validate channel exists
    const channel = await api.get<Channel>(channelId as unknown as ElementId);
    if (!channel) {
      return failure(`Channel not found: ${channelId}`, ExitCode.NOT_FOUND);
    }
    if (channel.type !== 'channel') {
      return failure(`Element ${channelId} is not a channel (type: ${channel.type})`, ExitCode.VALIDATION);
    }

    // Get all messages
    const allMessages = await api.list<Message>({ type: 'message' });

    // Filter by channel
    let messages = filterByChannel(allMessages, channelId);

    // Filter by sender if specified
    if (options.sender) {
      messages = messages.filter((m) => m.sender === options.sender);
    }

    // Filter root-only if specified
    if (options.rootOnly) {
      messages = messages.filter(isRootMessage);
    }

    // Sort by creation time
    messages = sortByCreatedAt(messages);

    // Apply limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      messages = messages.slice(0, limit);
    }

    // Hydrate content for display
    const hydratedMessages: HydratedMessage[] = [];
    for (const msg of messages) {
      const hydrated = await api.get<HydratedMessage>(msg.id, { hydrate: { content: true } });
      if (hydrated) {
        hydratedMessages.push(hydrated);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(hydratedMessages);
    }

    if (mode === 'quiet') {
      return success(hydratedMessages.map((m) => m.id).join('\n'));
    }

    if (hydratedMessages.length === 0) {
      return success(null, 'No messages found');
    }

    // Build table
    const headers = ['ID', 'SENDER', 'THREAD', 'CONTENT', 'CREATED'];
    const rows = hydratedMessages.map((m) => {
      const contentPreview = (m.content ?? '').substring(0, 35);
      const truncated = contentPreview.length < (m.content?.length ?? 0) ? '...' : '';
      return [
        m.id,
        m.sender,
        m.threadId ? `→${m.threadId.substring(0, 8)}` : '-',
        contentPreview + truncated,
        m.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${hydratedMessages.length} message(s) in channel ${channelId}`;

    return success(hydratedMessages, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list messages: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const msgListCommand: Command = {
  name: 'list',
  description: 'List messages in a channel',
  usage: 'sf message list --channel <id> [options]',
  help: `List messages in a channel.

Options:
  -c, --channel <id>   Channel to list messages from (required)
  -s, --sender <id>    Filter by sender entity
  -l, --limit <n>      Maximum messages to show
  -r, --root-only      Show only root messages (no replies)

Examples:
  sf message list --channel el-abc123
  sf message list -c el-abc123 --sender el-user456
  sf message list -c el-abc123 --root-only --limit 20`,
  options: msgListOptions,
  handler: msgListHandler as Command['handler'],
};

// ============================================================================
// Message Reply Command
// ============================================================================

interface MsgReplyOptions {
  content?: string;
  file?: string;
  attachment?: string | string[];
  tag?: string[];
}

const msgReplyOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'm',
    description: 'Message content (text)',
    hasValue: true,
  },
  {
    name: 'file',
    description: 'Read content from file',
    hasValue: true,
  },
  {
    name: 'attachment',
    short: 'a',
    description: 'Attach document ID (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function msgReplyHandler(
  args: string[],
  options: GlobalOptions & MsgReplyOptions
): Promise<CommandResult> {
  const [messageId] = args;

  if (!messageId) {
    return failure('Usage: sf message reply <message-id> --content <text> | --file <path>\nExample: sf message reply el-msg123 --content "Thanks!"', ExitCode.INVALID_ARGUMENTS);
  }

  // Delegate to send handler with --reply-to set
  return msgSendHandler([], {
    ...options,
    replyTo: messageId,
  } as GlobalOptions & MsgSendOptions);
}

const msgReplyCommand: Command = {
  name: 'reply',
  description: 'Reply to a message (shorthand for send --reply-to)',
  usage: 'sf message reply <message-id> --content <text> | --file <path> [options]',
  help: `Reply to a message.

This is a shorthand for "sf message send --reply-to <message-id>".
It automatically sets the channel and thread from the replied-to message.
In DM channels, sender/recipient are automatically swapped unless --from is specified.

Arguments:
  message-id   Message to reply to

Options:
  -m, --content <text>    Message content
      --file <path>       Read content from file
  -a, --attachment <id>   Attach document (can be repeated)
      --tag <tag>         Add tag (can be repeated)

Use --from (or --actor) to override the sender:
  sf --from agent-1 msg reply el-msg123 -m "Reply as agent-1"

Examples:
  sf message reply el-msg123 --content "Thanks for the update!"
  sf message reply el-msg123 --file response.txt
  sf --from bot msg reply el-msg123 -m "Automated response"`,
  options: msgReplyOptions,
  handler: msgReplyHandler as Command['handler'],
};

// ============================================================================
// Message Root Command
// ============================================================================

export const messageCommand: Command = {
  name: 'message',
  description: 'Send and manage messages',
  usage: 'sf message <subcommand> [options]',
  help: `Send and manage messages in channels.

Messages are immutable - once sent, they cannot be edited or deleted.
This ensures a reliable audit trail of all communication.

Subcommands:
  send     Send a message to a channel, entity, or as a reply
  reply    Reply to a message (shorthand for send --reply-to)
  list     List messages in a channel
  thread   View a message thread

Examples:
  sf message send --channel el-abc123 --content "Hello!"
  sf message send --to el-user456 -m "Direct message"
  sf message reply el-msg789 -m "Reply to your message"
  sf message list --channel el-abc123
  sf message thread el-msg456`,
  subcommands: {
    send: msgSendCommand,
    reply: msgReplyCommand,
    list: msgListCommand,
    thread: msgThreadCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    ls: msgListCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        `Usage: sf message <subcommand>. Use 'sf message --help' for available subcommands.`,
        ExitCode.INVALID_ARGUMENTS
      );
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(messageCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf message --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
