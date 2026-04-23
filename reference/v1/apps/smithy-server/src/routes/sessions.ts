/**
 * Session Routes
 *
 * Agent session management (start, stop, resume, stream).
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { EntityId, ElementId, Task } from '@stoneforge/core';
import { createTimestamp, ElementType } from '@stoneforge/core';
import type { SessionFilter, SpawnedSessionEvent, AgentRole, WorkerMetadata, StewardMetadata } from '@stoneforge/smithy';
import { createLogger, loadRolePrompt, getAgentMetadata, generateSessionBranchName, generateSessionWorktreePath, trackListeners } from '@stoneforge/smithy';
import type { Services } from '../services.js';
import { formatSessionRecord } from '../formatters.js';
import { notifySSEClientsOfNewSession } from './events.js';

const logger = createLogger('sessions');

type NotifyClientsCallback = (
  agentId: EntityId,
  session: { id: string; mode: 'headless' | 'interactive' },
  events: import('events').EventEmitter
) => void;

/**
 * Extract and save a session event to the database.
 * This is called immediately when events are emitted to ensure all messages
 * are persisted, even before any SSE client connects.
 */
function saveSessionEvent(
  event: SpawnedSessionEvent,
  sessionId: string,
  agentId: EntityId,
  sessionMessageService: Services['sessionMessageService']
): string {
  const msgId = `${event.type}-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Skip saving system and result events (not displayed in UI)
  if (event.type === 'system' || event.type === 'result') {
    return msgId;
  }

  // Extract content from event (match client-side logic)
  // Content can be in: event.message, event.raw?.message, event.raw?.content (if string)
  // IMPORTANT: content MUST be a string or undefined, never an object (SQLite can't bind objects)
  let content: string | undefined = typeof event.message === 'string' ? event.message : undefined;
  if (!content && event.raw) {
    const raw = event.raw as Record<string, unknown>;
    // Only use raw.message if it's actually a string
    if (typeof raw.message === 'string') {
      content = raw.message;
    } else if (typeof raw.content === 'string') {
      content = raw.content;
    }
    // If raw.content is an array (Claude API format), extract text from text blocks
    if (!content && Array.isArray(raw.content)) {
      const textParts: string[] = [];
      for (const block of raw.content) {
        if (typeof block === 'object' && block !== null && 'type' in block) {
          const b = block as { type: string; text?: string };
          if (b.type === 'text' && typeof b.text === 'string') {
            textParts.push(b.text);
          }
        }
      }
      if (textParts.length > 0) {
        content = textParts.join('');
      }
    }
  }

  // Extract tool info from event
  // Check multiple locations to match client-side extraction in StreamViewer.tsx
  const eventAny = event as unknown as Record<string, unknown>;
  const eventData = eventAny.data as Record<string, unknown> | undefined;
  const rawTool = (event.raw as Record<string, unknown>)?.tool as string | undefined;
  const rawToolInput = (event.raw as Record<string, unknown>)?.tool_input as unknown;
  let toolName = event.tool?.name || eventData?.name as string | undefined || eventAny.toolName as string | undefined || rawTool;
  let toolInput = event.tool?.input || eventData?.input || eventAny.toolInput || rawToolInput;
  let toolOutput: string | undefined;
  let actualType = event.type;

  // Check for tool_use/tool_result blocks in content arrays (Claude API format)
  // Content array can be in multiple locations depending on event source
  // Must match the same locations the client checks in StreamViewer.tsx
  const raw = event.raw as Record<string, unknown>;
  const rawMessage = raw?.message as Record<string, unknown> | undefined;
  const eventMessage = (event as unknown as Record<string, unknown>).message;
  const eventContent = (event as unknown as Record<string, unknown>).content;
  const rawContentArray =
    rawMessage?.content ||    // raw.message.content
    raw?.content ||           // raw.content
    (typeof eventMessage === 'object' && eventMessage !== null
      ? (eventMessage as Record<string, unknown>).content
      : undefined) ||         // event.message.content
    eventContent;             // event.content
  if (Array.isArray(rawContentArray)) {
    for (const block of rawContentArray) {
      if (typeof block === 'object' && block !== null && 'type' in block) {
        const b = block as { type: string; name?: string; input?: unknown; content?: string };
        if (b.type === 'tool_use' && b.name) {
          toolName = toolName || b.name;
          toolInput = toolInput || b.input;
          // Override type if we found tool info but type was 'assistant'
          if (actualType === 'assistant') {
            actualType = 'tool_use';
          }
        } else if (b.type === 'tool_result') {
          toolOutput = typeof b.content === 'string' ? b.content : undefined;
          if (actualType === 'user') {
            actualType = 'tool_result';
          }
        }
      }
    }
  }

  // For tool_result, check additional fallback locations (match client-side logic)
  if (!toolOutput) {
    toolOutput =
      eventAny.output as string | undefined ||
      eventData?.output as string | undefined ||
      (actualType === 'tool_result' && typeof raw?.content === 'string' ? raw.content as string : undefined);
  }

  // For tool_result events, content should be empty (output is in toolOutput)
  const finalContent = (actualType === 'tool_result' && toolOutput) ? undefined : content;

  // Safely stringify tool input (JSON.stringify can return undefined for functions)
  let toolInputStr: string | undefined;
  if (toolInput !== undefined && toolInput !== null) {
    try {
      const str = JSON.stringify(toolInput);
      toolInputStr = typeof str === 'string' ? str : undefined;
    } catch {
      toolInputStr = String(toolInput);
    }
  }

  sessionMessageService.saveMessage({
    id: msgId,
    sessionId: sessionId,
    agentId,
    type: actualType as 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error',
    content: finalContent,
    toolName: toolName,
    toolInput: toolInputStr,
    toolOutput: toolOutput,
    isError: actualType === 'error',
  });

  return msgId;
}

// Track sessions that already have the event saver attached to avoid duplicate listeners
const sessionsWithEventSaver = new Set<string>();

/**
 * Clean up the session event saver tracking for a session.
 * Call this when a session ends to allow re-attachment if the session restarts.
 */
export function cleanupSessionEventSaver(sessionId: string): void {
  sessionsWithEventSaver.delete(sessionId);
}

/**
 * Attach an event listener to save session events immediately.
 * This ensures all events are persisted even before any SSE client connects.
 * Uses a Set to track attached sessions and avoid duplicate listeners.
 * Exported for use by the dispatch daemon callback.
 */
export function attachSessionEventSaver(
  events: import('events').EventEmitter,
  sessionId: string,
  agentId: EntityId,
  sessionMessageService: Services['sessionMessageService']
): void {
  // Skip if already attached for this session
  if (sessionsWithEventSaver.has(sessionId)) {
    return;
  }
  sessionsWithEventSaver.add(sessionId);

  const onEvent = (event: SpawnedSessionEvent) => {
    const msgId = saveSessionEvent(event, sessionId, agentId, sessionMessageService);
    // Attach the msgId to the event so SSE handlers can use the same ID for deduplication
    (event as SpawnedSessionEvent & { msgId?: string }).msgId = msgId;
  };

  const onError = (error: Error & { msgId?: string }) => {
    const msgId = `error-${sessionId}-${Date.now()}`;
    sessionMessageService.saveMessage({
      id: msgId,
      sessionId: sessionId,
      agentId,
      type: 'error',
      content: error.message,
      isError: true,
    });
    // Attach msgId for SSE deduplication
    error.msgId = msgId;
  };

  trackListeners(events, { 'event': onEvent, 'error': onError });
}

export function createSessionRoutes(
  services: Services,
  notifyClientsOfNewSession: NotifyClientsCallback
) {
  const { api, orchestratorApi, agentRegistry, sessionManager, spawnerService, sessionInitialPrompts, sessionMessageService, dispatchDaemon } = services;
  const app = new Hono();

  // POST /api/agents/:id/start
  app.post('/api/agents/:id/start', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as {
        taskId?: string;
        initialMessage?: string;
        workingDirectory?: string;
        worktree?: string;
        initialPrompt?: string;
        interactive?: boolean;
        cols?: number;
        rows?: number;
      };

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const existingSession = sessionManager.getActiveSession(agentId);
      if (existingSession) {
        return c.json(
          {
            error: { code: 'SESSION_EXISTS', message: 'Agent already has an active session' },
            existingSession: formatSessionRecord(existingSession),
          },
          409
        );
      }

      // Rate limit guard: reject when all executables are rate-limited.
      // Returns 429 with Retry-After header set to the soonest reset time.
      if (dispatchDaemon) {
        const rateLimitStatus = dispatchDaemon.getRateLimitStatus();
        if (rateLimitStatus.isPaused) {
          const retryAfterSeconds = rateLimitStatus.soonestReset
            ? Math.max(1, Math.ceil((new Date(rateLimitStatus.soonestReset).getTime() - Date.now()) / 1000))
            : 60; // Default to 60 seconds if no reset time available
          return c.json(
            {
              error: {
                code: 'RATE_LIMITED',
                message: 'All executables are currently rate-limited',
                retryAfter: retryAfterSeconds,
                soonestReset: rateLimitStatus.soonestReset,
              },
            },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
          );
        }
      }

      // Get agent metadata to determine role
      const agentMeta = getAgentMetadata(agent);
      const agentRole = agentMeta?.agentRole as AgentRole | undefined;
      const workerMode = agentRole === 'worker'
        ? (agentMeta as WorkerMetadata)?.workerMode
        : undefined;
      const stewardFocus = agentRole === 'steward'
        ? (agentMeta as StewardMetadata)?.stewardFocus
        : undefined;

      logger.debug('Agent metadata:', agentMeta ? `role=${agentMeta.agentRole}${workerMode ? ` mode=${workerMode}` : ''}` : 'undefined');

      // Create worktree for persistent workers
      let worktreePath: string | undefined;
      if (workerMode === 'persistent' && services.worktreeManager) {
        try {
          const now = new Date();
          const timestamp = now.getFullYear().toString()
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0');
          const agentName = agent.name ?? agentId;
          const sessionBranch = generateSessionBranchName(agentName, timestamp);
          const sessionPath = generateSessionWorktreePath(agentName, timestamp);

          const worktreeResult = await services.worktreeManager.createWorktree({
            agentName,
            taskId: `session-${timestamp}` as ElementId,
            customBranch: sessionBranch,
            customPath: sessionPath,
          });

          worktreePath = worktreeResult.worktree.path;
          logger.info(`Created persistent worker worktree: ${worktreePath} on branch ${sessionBranch}`);
        } catch (err) {
          logger.warn('Failed to create worktree for persistent worker:', err);
          // Continue without worktree — don't block session start
        }
      }

      // Load role-specific prompt for interactive agents (Director, persistent workers)
      // This is prepended to any other prompt content
      let rolePrompt: string | undefined;
      if (agentRole) {
        const roleResult = loadRolePrompt(agentRole, stewardFocus, { projectRoot: process.cwd(), workerMode });
        logger.debug('Role prompt result:', roleResult ? `${roleResult.prompt.length} chars from ${roleResult.source}` : 'undefined');
        if (roleResult) {
          rolePrompt = roleResult.prompt;
        }
      }

      let effectivePrompt = body.initialPrompt;
      let assignedTask: { id: string; title: string } | undefined;

      // Get director ID for worker prompts
      let directorId: string | undefined;
      if (agentRole === 'worker') {
        const director = await agentRegistry.getDirector();
        directorId = director?.id ?? 'unknown';
      }

      if (body.taskId) {
        const taskResult = await api.get<Task>(body.taskId as ElementId);
        if (!taskResult || taskResult.type !== ElementType.TASK) {
          return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
        }

        await orchestratorApi.assignTaskToAgent(body.taskId as ElementId, agentId);

        const taskPrompt = `You have been assigned the following task:

**Worker ID:** ${agentId}
**Director ID:** ${directorId ?? 'unknown'}
**Task ID**: ${taskResult.id}
**Title**: ${taskResult.title}
**Priority**: ${taskResult.priority ?? 'Not set'}
${taskResult.acceptanceCriteria ? `**Acceptance Criteria**: ${taskResult.acceptanceCriteria}` : ''}

Please begin working on this task. Use \`sf task get ${taskResult.id}\` to see full details if needed.`;

        effectivePrompt = body.initialMessage
          ? `${taskPrompt}\n\n**Additional Instructions**:\n${body.initialMessage}${body.initialPrompt ? `\n\n${body.initialPrompt}` : ''}`
          : body.initialPrompt
            ? `${taskPrompt}\n\n${body.initialPrompt}`
            : taskPrompt;

        assignedTask = { id: taskResult.id, title: taskResult.title };
      } else if (body.initialMessage) {
        effectivePrompt = body.initialPrompt
          ? `${body.initialMessage}\n\n${body.initialPrompt}`
          : body.initialMessage;
      }

      // Prepend role prompt if available, wrapped with clear instructions
      // so Claude understands this is its operating instructions, not a file being opened
      if (rolePrompt) {
        const framedRolePrompt = `Please read and internalize the following operating instructions. These define your role and how you should behave in this session:\n\n${rolePrompt}`;
        // Add identity section after the role prompt for directors and workers (when not already in task prompt)
        let idSection = '';
        if (agentRole === 'director') {
          idSection = `\n\n**Director ID:** ${agentId}`;
        } else if (agentRole === 'worker' && !body.taskId) {
          // Only add here if no taskId (task prompt already includes IDs)
          idSection = `\n\n**Worker ID:** ${agentId}\n**Director ID:** ${directorId ?? 'unknown'}`;
        }
        effectivePrompt = effectivePrompt
          ? `${framedRolePrompt}${idSection}\n\n---\n\n${effectivePrompt}`
          : `${framedRolePrompt}${idSection}`;
      }

      const { session, events } = await sessionManager.startSession(agentId, {
        workingDirectory: worktreePath ?? body.workingDirectory,
        worktree: body.worktree ?? worktreePath,
        initialPrompt: effectivePrompt,
        interactive: body.interactive,
        cols: body.cols,
        rows: body.rows,
      });

      // Attach event saver immediately to capture all events, including the first assistant response
      // This must happen before any events are emitted to avoid missing early messages
      attachSessionEventSaver(events, session.id, agentId, sessionMessageService);

      if (effectivePrompt) {
        sessionInitialPrompts.set(session.id, effectivePrompt);
        // Save initial prompt to database immediately (don't wait for SSE connection)
        const initialMsgId = `user-${session.id}-initial`;
        sessionMessageService.saveMessage({
          id: initialMsgId,
          sessionId: session.id,
          agentId,
          type: 'user',
          content: effectivePrompt,
          isError: false,
        });
      }

      notifyClientsOfNewSession(agentId, session, events);

      // Notify SSE stream clients so they dynamically subscribe to this session's events
      notifySSEClientsOfNewSession({
        sessionId: session.id,
        agentId,
        agentRole: agentRole || 'worker',
        events,
      });

      return c.json(
        {
          success: true,
          session: formatSessionRecord(session),
          ...(assignedTask && { assignedTask }),
        },
        201
      );
    } catch (error) {
      logger.error('Failed to start session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents/:id/stop
  app.post('/api/agents/:id/stop', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as {
        graceful?: boolean;
        reason?: string;
      };

      const activeSession = sessionManager.getActiveSession(agentId);
      if (!activeSession) {
        try {
          await agentRegistry.updateAgentSession(agentId, undefined, 'idle');
        } catch {
          // Agent may not exist
        }
        return c.json({ success: true, message: 'No active session to stop' });
      }

      await sessionManager.stopSession(activeSession.id, {
        graceful: body.graceful,
        reason: body.reason,
      });

      // Clean up initial prompt and event saver tracking for this session
      sessionInitialPrompts.delete(activeSession.id);
      sessionsWithEventSaver.delete(activeSession.id);

      return c.json({ success: true, sessionId: activeSession.id });
    } catch (error) {
      logger.error('Failed to stop session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/sessions/stop-all
  app.post('/api/sessions/stop-all', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        graceful?: boolean;
        reason?: string;
      };

      // Get all running sessions
      const runningSessions = sessionManager.listSessions({
        status: ['starting', 'running']
      });

      if (runningSessions.length === 0) {
        return c.json({ success: true, stoppedCount: 0, message: 'No running sessions' });
      }

      // Stop each session
      const results: { sessionId: string; agentId: string; success: boolean; error?: string }[] = [];

      for (const session of runningSessions) {
        try {
          await sessionManager.stopSession(session.id, {
            graceful: body.graceful,
            reason: body.reason || 'Stopped by user via Stop All',
          });
          sessionInitialPrompts.delete(session.id);
          sessionsWithEventSaver.delete(session.id);
          results.push({ sessionId: session.id, agentId: session.agentId, success: true });
        } catch (error) {
          results.push({
            sessionId: session.id,
            agentId: session.agentId,
            success: false,
            error: String(error)
          });
        }
      }

      const stoppedCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      return c.json({
        success: failedCount === 0,
        stoppedCount,
        failedCount,
        results
      });
    } catch (error) {
      logger.error('Failed to stop all sessions:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents/:id/interrupt
  app.post('/api/agents/:id/interrupt', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;

      const activeSession = sessionManager.getActiveSession(agentId);
      if (!activeSession) {
        return c.json({ error: { code: 'NO_SESSION', message: 'No active session to interrupt' } }, 404);
      }

      await sessionManager.interruptSession(activeSession.id);
      return c.json({ success: true, sessionId: activeSession.id });
    } catch (error) {
      logger.error('Failed to interrupt session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents/:id/resume
  app.post('/api/agents/:id/resume', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as {
        providerSessionId?: string;
        workingDirectory?: string;
        worktree?: string;
        resumePrompt?: string;
        checkReadyQueue?: boolean;
      };

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const existingSession = sessionManager.getActiveSession(agentId);
      if (existingSession) {
        return c.json(
          {
            error: { code: 'SESSION_EXISTS', message: 'Agent already has an active session' },
            existingSession: formatSessionRecord(existingSession),
          },
          409
        );
      }

      // Rate limit guard: reject when all executables are rate-limited.
      // Returns 429 with Retry-After header set to the soonest reset time.
      if (dispatchDaemon) {
        const rateLimitStatus = dispatchDaemon.getRateLimitStatus();
        if (rateLimitStatus.isPaused) {
          const retryAfterSeconds = rateLimitStatus.soonestReset
            ? Math.max(1, Math.ceil((new Date(rateLimitStatus.soonestReset).getTime() - Date.now()) / 1000))
            : 60; // Default to 60 seconds if no reset time available
          return c.json(
            {
              error: {
                code: 'RATE_LIMITED',
                message: 'All executables are currently rate-limited',
                retryAfter: retryAfterSeconds,
                soonestReset: rateLimitStatus.soonestReset,
              },
            },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
          );
        }
      }

      let providerSessionId = body.providerSessionId;
      if (!providerSessionId) {
        const resumable = sessionManager.getMostRecentResumableSession(agentId);
        if (!resumable?.providerSessionId) {
          return c.json({ error: { code: 'NO_RESUMABLE_SESSION', message: 'No resumable session found' } }, 404);
        }
        providerSessionId = resumable.providerSessionId;
      }

      const { session, events, uwpCheck } = await sessionManager.resumeSession(agentId, {
        providerSessionId,
        workingDirectory: body.workingDirectory,
        worktree: body.worktree,
        resumePrompt: body.resumePrompt,
        checkReadyQueue: body.checkReadyQueue,
      });

      // Attach event saver immediately to capture all events, including the first assistant response
      attachSessionEventSaver(events, session.id, agentId, sessionMessageService);

      // Save resume prompt to database if provided
      // Use same ID pattern as start session so SSE deduplication works
      if (body.resumePrompt) {
        sessionInitialPrompts.set(session.id, body.resumePrompt);
        const initialMsgId = `user-${session.id}-initial`;
        sessionMessageService.saveMessage({
          id: initialMsgId,
          sessionId: session.id,
          agentId,
          type: 'user',
          content: body.resumePrompt,
          isError: false,
        });
      }

      notifyClientsOfNewSession(agentId, session, events);

      // Notify SSE stream clients so they dynamically subscribe to this session's events
      notifySSEClientsOfNewSession({
        sessionId: session.id,
        agentId,
        agentRole: session.agentRole || 'worker',
        events,
      });

      return c.json({ success: true, session: formatSessionRecord(session), uwpCheck }, 201);
    } catch (error) {
      logger.error('Failed to resume session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/agents/:id/stream
  app.get('/api/agents/:id/stream', async (c) => {
    const agentId = c.req.param('id') as EntityId;

    const activeSession = sessionManager.getActiveSession(agentId);
    if (!activeSession) {
      return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
    }

    const events = sessionManager.getEventEmitter(activeSession.id);
    if (!events) {
      return c.json({ error: { code: 'NO_EVENTS', message: 'Session event emitter not available' } }, 404);
    }

    // Ensure event saver is attached for this session (handles existing sessions
    // that were started before this code change, or if the saver wasn't attached)
    attachSessionEventSaver(events, activeSession.id, agentId, sessionMessageService);

    return streamSSE(c, async (stream) => {
      let eventId = 0;

      try {
        await stream.writeSSE({
          id: String(++eventId),
          event: 'connected',
          data: JSON.stringify({
            sessionId: activeSession.id,
            agentId,
            timestamp: createTimestamp(),
          }),
        });

        // Send initial prompt to every connecting client (for real-time display)
        // Note: The initial prompt is already saved to database when session starts
        // We keep the prompt in the map for the session duration so reconnecting clients also get it via SSE
        const initialPrompt = sessionInitialPrompts.get(activeSession.id);
        if (initialPrompt) {
          const initialMsgId = `user-${activeSession.id}-initial`;
          await stream.writeSSE({
            id: initialMsgId,
            event: 'agent_user',
            data: JSON.stringify({
              type: 'user',
              message: initialPrompt,
              msgId: initialMsgId, // Include ID in data for deduplication
              raw: { type: 'user', content: initialPrompt },
            }),
          });
        }

        // Note: Events are already being saved to the database by the attachSessionEventSaver
        // listener that was attached when the session started. The SSE handler only needs to
        // stream events to connected clients for real-time display.
        const onEvent = async (event: SpawnedSessionEvent) => {
          // Use the msgId attached by saveSessionEvent if available, otherwise generate one
          const eventWithMsgId = event as SpawnedSessionEvent & { msgId?: string };
          const msgId = eventWithMsgId.msgId || `${event.type}-${activeSession.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await stream.writeSSE({
            id: msgId,
            event: `agent_${event.type}`,
            data: JSON.stringify({ ...event, msgId }), // Include ID in data for deduplication
          });
        };

        const onError = async (error: Error) => {
          // Use msgId from error if attached by saveSessionEvent, otherwise generate one
          const errorWithMsgId = error as Error & { msgId?: string };
          const msgId = errorWithMsgId.msgId || `error-${activeSession.id}-${Date.now()}`;
          await stream.writeSSE({
            id: msgId,
            event: 'agent_error',
            data: JSON.stringify({ error: error.message, msgId }),
          });
        };

        const onExit = async (code: number | null, signal: string | null) => {
          await stream.writeSSE({
            id: String(++eventId),
            event: 'agent_exit',
            data: JSON.stringify({ code, signal }),
          });
        };

        const cleanupListeners = trackListeners(events, {
          'event': onEvent,
          'error': onError,
          'exit': onExit,
        });

        const heartbeatInterval = setInterval(async () => {
          try {
            await stream.writeSSE({
              id: String(++eventId),
              event: 'heartbeat',
              data: JSON.stringify({ timestamp: createTimestamp() }),
            });
          } catch {
            clearInterval(heartbeatInterval);
          }
        }, 30000);

        stream.onAbort(() => {
          clearInterval(heartbeatInterval);
          cleanupListeners();
        });

        await new Promise(() => {});
      } catch (error) {
        logger.error('SSE: Error in stream:', error);
      }
    });
  });

  // POST /api/agents/:id/input
  app.post('/api/agents/:id/input', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json()) as {
        input: string;
        isUserMessage?: boolean;
      };

      if (!body.input) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'Input is required' } }, 400);
      }

      const activeSession = sessionManager.getActiveSession(agentId);
      if (!activeSession) {
        return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
      }

      await spawnerService.sendInput(activeSession.id, body.input, {
        isUserMessage: body.isUserMessage,
      });

      // Save user input to database if it's a user message
      if (body.isUserMessage) {
        const inputMsgId = `user-${activeSession.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sessionMessageService.saveMessage({
          id: inputMsgId,
          sessionId: activeSession.id,
          agentId,
          type: 'user',
          content: body.input,
          isError: false,
        });
      }

      return c.json({ success: true, sessionId: activeSession.id }, 202);
    } catch (error) {
      logger.error('Failed to send input:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions
  app.get('/api/sessions', async (c) => {
    try {
      const url = new URL(c.req.url);
      const agentIdParam = url.searchParams.get('agentId');
      const roleParam = url.searchParams.get('role');
      const statusParam = url.searchParams.get('status');
      const resumableParam = url.searchParams.get('resumable');

      const filter: SessionFilter = {
        ...(agentIdParam && { agentId: agentIdParam as EntityId }),
        ...(roleParam && { role: roleParam as 'director' | 'worker' | 'steward' }),
        ...(statusParam && {
          status: statusParam.includes(',')
            ? (statusParam.split(',') as ('starting' | 'running' | 'suspended' | 'terminating' | 'terminated')[])
            : (statusParam as 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated'),
        }),
        ...(resumableParam === 'true' && { resumable: true }),
      };

      const sessions = sessionManager.listSessions(filter);
      return c.json({ sessions: sessions.map(formatSessionRecord) });
    } catch (error) {
      logger.error('Failed to list sessions:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions/latest-messages?sessionIds=id1,id2,...
  // Returns the latest displayable message per session for status display on agent cards
  app.get('/api/sessions/latest-messages', async (c) => {
    try {
      const url = new URL(c.req.url);
      const sessionIdsParam = url.searchParams.get('sessionIds');

      if (!sessionIdsParam) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'sessionIds parameter is required' } }, 400);
      }

      const sessionIds = sessionIdsParam.split(',').filter(Boolean);
      if (sessionIds.length === 0) {
        return c.json({ messages: {} });
      }

      // Cap at 50 sessions to prevent abuse
      const cappedIds = sessionIds.slice(0, 50);
      const latestMessages = sessionMessageService.getLatestDisplayableMessages(cappedIds);

      // Convert map to plain object for JSON serialization
      const messagesObj: Record<string, {
        content?: string;
        type: string;
        toolName?: string;
        timestamp: string;
        agentId: string;
      }> = {};

      for (const [sid, msg] of latestMessages) {
        // Generate display content: use content if available, otherwise generate from tool info
        let displayContent = msg.content;
        if (!displayContent && msg.type === 'tool_use' && msg.toolName) {
          const displayName = msg.toolName.charAt(0).toUpperCase() + msg.toolName.slice(1);
          displayContent = `Using ${displayName}...`;
        } else if (!displayContent && msg.type === 'tool_result') {
          displayContent = 'Tool completed';
        }

        messagesObj[sid] = {
          content: displayContent,
          type: msg.type,
          toolName: msg.toolName,
          timestamp: msg.createdAt,
          agentId: msg.agentId,
        };
      }

      return c.json({ messages: messagesObj });
    } catch (error) {
      logger.error('Failed to get latest messages:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions/:id
  app.get('/api/sessions/:id', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
      }
      return c.json({ session: formatSessionRecord(session) });
    } catch (error) {
      logger.error('Failed to get session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions/:id/messages
  // Retrieve all messages for a session (for transcript restoration)
  // Also loads messages from related sessions (those with the same providerSessionId)
  // to support viewing full history of resumed sessions
  app.get('/api/sessions/:id/messages', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const url = new URL(c.req.url);
      const afterId = url.searchParams.get('after');

      // Get the session to check for providerSessionId
      // First check in-memory sessions, then check persisted session history
      let providerSessionId: string | undefined;

      const inMemorySession = sessionManager.getSession(sessionId);
      if (inMemorySession?.providerSessionId) {
        providerSessionId = inMemorySession.providerSessionId;
      } else {
        // Session not in memory - check persisted session history for all agents
        // This is needed when viewing historical sessions after server restart
        const agents = await agentRegistry.listAgents();
        for (const agent of agents) {
          const history = await sessionManager.getSessionHistory(agent.id as unknown as EntityId, 50);
          const historyEntry = history.find(h => h.id === sessionId);
          if (historyEntry?.providerSessionId) {
            providerSessionId = historyEntry.providerSessionId;
            break;
          }
        }
      }

      // If we found a providerSessionId, find all related sessions and load their messages
      if (providerSessionId) {
        // Collect all session IDs with the same providerSessionId
        const relatedSessionIds = new Set<string>();
        relatedSessionIds.add(sessionId); // Always include the requested session

        // Check in-memory sessions
        const allSessions = sessionManager.listSessions({});
        for (const s of allSessions) {
          if (s.providerSessionId === providerSessionId) {
            relatedSessionIds.add(s.id);
          }
        }

        // Also check persisted session history
        const agents = await agentRegistry.listAgents();
        for (const agent of agents) {
          const history = await sessionManager.getSessionHistory(agent.id as unknown as EntityId, 50);
          for (const entry of history) {
            if (entry.providerSessionId === providerSessionId) {
              relatedSessionIds.add(entry.id);
            }
          }
        }

        // Load messages from all related sessions
        const messages = sessionMessageService.getMessagesForSessions(Array.from(relatedSessionIds));
        return c.json({ messages });
      }

      // Fallback to just loading messages for this session
      const messages = afterId
        ? sessionMessageService.getSessionMessagesAfter(sessionId, afterId)
        : sessionMessageService.getSessionMessages(sessionId);

      return c.json({ messages });
    } catch (error) {
      logger.error('Failed to get session messages:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
