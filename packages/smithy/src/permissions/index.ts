/**
 * Agent Permission Model
 *
 * Defines and enforces a restricted tool permission model for agents
 * when `agents.permissionModel` is set to `"restricted"` (Approve preset).
 *
 * @module
 */

// Types
export type {
  ApprovalRequest,
  ApprovalRequestStatus,
  CreateApprovalRequestInput,
  ResolveApprovalRequestInput,
  ApprovalRequestFilter,
  ToolPermissionCheck,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
} from './types.js';

export {
  AUTO_ALLOWED_TOOLS,
  AUTO_ALLOWED_SF_COMMANDS,
} from './types.js';

// Tool permission checking
export { checkToolPermission } from './tool-permissions.js';

// Approval service
export type { ApprovalService } from './approval-service.js';
export { ApprovalServiceImpl, createApprovalService } from './approval-service.js';

// Permission hook
export type { PermissionHookConfig, PermissionHookCallback } from './permission-monitor.js';
export { createPermissionHook } from './permission-monitor.js';
