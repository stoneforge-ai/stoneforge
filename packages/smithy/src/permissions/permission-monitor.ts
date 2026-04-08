/**
 * Permission Hook
 *
 * Creates a PreToolUse hook that enforces the restricted tool permission model.
 * When an agent attempts a restricted tool action, the hook blocks execution
 * until the request is approved or denied via the approval service.
 *
 * In unrestricted mode, no hook is created (returns undefined).
 *
 * @module
 */

import type { EntityId } from '@stoneforge/core';
import type { ApprovalService } from './approval-service.js';
import { checkToolPermission } from './tool-permissions.js';

/**
 * Configuration for the permission hook.
 */
export interface PermissionHookConfig {
  /** The permission model mode */
  readonly permissionModel: 'unrestricted' | 'restricted';
  /** Allowed bash commands (only used in restricted mode) */
  readonly allowedBashCommands: string[];
  /** The approval service for creating/tracking requests */
  readonly approvalService: ApprovalService;
}

/**
 * The hook callback type (matches SDK HookCallback signature).
 * Uses Record<string, unknown> for compatibility with the generic SDK hook type.
 * At runtime, the input will contain PreToolUse fields: session_id, tool_name, tool_input, tool_use_id.
 */
export type PermissionHookCallback = (
  input: Record<string, unknown>,
  toolUseId: string | undefined,
  options: { signal: AbortSignal }
) => Promise<Record<string, unknown>>;

/**
 * Creates a PreToolUse hook callback that enforces the restricted permission model.
 *
 * For auto-allowed tools, the hook immediately returns 'allow'.
 * For restricted tools, the hook:
 * 1. Creates an approval request in the database
 * 2. Blocks until the request is approved or denied
 * 3. Returns the appropriate permission decision
 *
 * @param agentId - The agent that owns the session
 * @param config - Permission hook configuration
 * @returns A PreToolUse hook callback, or undefined if unrestricted mode
 */
export function createPermissionHook(
  agentId: EntityId,
  config: PermissionHookConfig
): PermissionHookCallback | undefined {
  // No hook needed in unrestricted mode
  if (config.permissionModel === 'unrestricted') {
    return undefined;
  }

  const hook: PermissionHookCallback = async (input, _toolUseId, options) => {
    // Extract PreToolUse fields from the generic input
    const toolName = input.tool_name as string;
    const toolInput = input.tool_input;
    const sessionId = input.session_id as string;

    const permCheck = checkToolPermission(
      toolName,
      toolInput,
      config.allowedBashCommands
    );

    if (permCheck.allowed) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: permCheck.reason,
        },
      };
    }

    // Create approval request and wait for resolution
    try {
      const request = await config.approvalService.createRequest({
        agentId,
        sessionId,
        toolName,
        toolArgs: toolInput,
      });

      // Wait for resolution, respecting the abort signal
      const resolved = await Promise.race([
        config.approvalService.waitForResolution(request.id),
        // If the session is aborted, deny the request
        new Promise<never>((_resolve, reject) => {
          if (options.signal.aborted) {
            reject(new Error('Session aborted'));
            return;
          }
          options.signal.addEventListener('abort', () => {
            reject(new Error('Session aborted'));
          }, { once: true });
        }),
      ]);

      if (resolved.status === 'approved') {
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `Approved by ${resolved.resolvedBy ?? 'system'}`,
          },
        };
      } else {
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Denied by ${resolved.resolvedBy ?? 'system'}`,
          },
        };
      }
    } catch (error) {
      // Timeout, abort, or error - deny by default
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Permission request failed: ${reason}`,
        },
      };
    }
  };

  return hook;
}
