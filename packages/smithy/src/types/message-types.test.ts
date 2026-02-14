/**
 * Message Types Unit Tests (TB-O14a)
 *
 * Tests for the orchestrator message type schemas and validation functions.
 */

import { describe, test, expect } from 'bun:test';
import type { EntityId, ElementId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import {
  // Constants
  MessageTypeValue,
  AllMessageTypes,
  StatusUpdateSeverity,
  HelpRequestUrgency,
  HealthCheckStatus,
  // Type guards
  isTaskAssignmentMessage,
  isStatusUpdateMessage,
  isHelpRequestMessage,
  isHandoffMessage,
  isHealthCheckMessage,
  isGenericMessage,
  isOrchestratorMessage,
  isMessageType,
  // Factory functions
  createTaskAssignmentMessage,
  createStatusUpdateMessage,
  createHelpRequestMessage,
  createHandoffMessage,
  createHealthCheckRequest,
  createHealthCheckResponse,
  createGenericMessage,
  // Utilities
  parseMessageMetadata,
  getMessageType,
  // Types
  type TaskAssignmentMessage,
  type StatusUpdateMessage,
  type HelpRequestMessage,
  type HandoffMessage,
  type HealthCheckMessage,
  type GenericMessage,
  type OrchestratorMessage,
} from './message-types.js';

// ============================================================================
// Test Constants
// ============================================================================

const testAgentId = 'el-agent001' as EntityId;
const testAgentId2 = 'el-agent002' as EntityId;
const testTaskId = 'el-task001' as ElementId;
const testTimestamp = createTimestamp();

// ============================================================================
// MessageTypeValue Tests
// ============================================================================

describe('MessageTypeValue', () => {
  test('defines all expected message types', () => {
    expect(MessageTypeValue.TASK_ASSIGNMENT).toBe('task-assignment');
    expect(MessageTypeValue.STATUS_UPDATE).toBe('status-update');
    expect(MessageTypeValue.HELP_REQUEST).toBe('help-request');
    expect(MessageTypeValue.HANDOFF).toBe('handoff');
    expect(MessageTypeValue.HEALTH_CHECK).toBe('health-check');
    expect(MessageTypeValue.GENERIC).toBe('generic');
  });

  test('AllMessageTypes contains all types', () => {
    expect(AllMessageTypes).toContain('task-assignment');
    expect(AllMessageTypes).toContain('status-update');
    expect(AllMessageTypes).toContain('help-request');
    expect(AllMessageTypes).toContain('handoff');
    expect(AllMessageTypes).toContain('health-check');
    expect(AllMessageTypes).toContain('generic');
    expect(AllMessageTypes).toHaveLength(6);
  });

  test('isMessageType validates correctly', () => {
    expect(isMessageType('task-assignment')).toBe(true);
    expect(isMessageType('status-update')).toBe(true);
    expect(isMessageType('help-request')).toBe(true);
    expect(isMessageType('handoff')).toBe(true);
    expect(isMessageType('health-check')).toBe(true);
    expect(isMessageType('generic')).toBe(true);
    expect(isMessageType('invalid')).toBe(false);
    expect(isMessageType('')).toBe(false);
    expect(isMessageType(null)).toBe(false);
    expect(isMessageType(undefined)).toBe(false);
    expect(isMessageType(123)).toBe(false);
  });
});

// ============================================================================
// TaskAssignmentMessage Tests
// ============================================================================

describe('TaskAssignmentMessage', () => {
  const validMessage: TaskAssignmentMessage = {
    type: 'task-assignment',
    timestamp: testTimestamp,
    taskId: testTaskId,
    taskTitle: 'Implement feature X',
    priority: 1,
    assignedBy: testAgentId,
  };

  test('isTaskAssignmentMessage validates correct message', () => {
    expect(isTaskAssignmentMessage(validMessage)).toBe(true);
  });

  test('isTaskAssignmentMessage rejects missing required fields', () => {
    expect(isTaskAssignmentMessage({ type: 'task-assignment' })).toBe(false);
    expect(isTaskAssignmentMessage({ ...validMessage, taskId: undefined })).toBe(false);
    expect(isTaskAssignmentMessage({ ...validMessage, taskTitle: undefined })).toBe(false);
    expect(isTaskAssignmentMessage({ ...validMessage, timestamp: undefined })).toBe(false);
  });

  test('isTaskAssignmentMessage rejects wrong type', () => {
    expect(isTaskAssignmentMessage({ ...validMessage, type: 'status-update' })).toBe(false);
  });

  test('isTaskAssignmentMessage rejects non-objects', () => {
    expect(isTaskAssignmentMessage(null)).toBe(false);
    expect(isTaskAssignmentMessage(undefined)).toBe(false);
    expect(isTaskAssignmentMessage('string')).toBe(false);
    expect(isTaskAssignmentMessage(123)).toBe(false);
    expect(isTaskAssignmentMessage([validMessage])).toBe(false);
  });

  test('createTaskAssignmentMessage creates valid message', () => {
    const message = createTaskAssignmentMessage({
      taskId: testTaskId,
      taskTitle: 'Test task',
    });

    expect(message.type).toBe('task-assignment');
    expect(message.taskId).toBe(testTaskId);
    expect(message.taskTitle).toBe('Test task');
    expect(message.timestamp).toBeDefined();
    expect(isTaskAssignmentMessage(message)).toBe(true);
  });

  test('createTaskAssignmentMessage includes optional fields', () => {
    const message = createTaskAssignmentMessage({
      taskId: testTaskId,
      taskTitle: 'Test task',
      priority: 2,
      assignedBy: testAgentId,
      branch: 'feature/test',
      worktree: '.stoneforge/.worktrees/test',
      isReassignment: true,
      previousAssignee: testAgentId2,
      correlationId: 'corr-123',
    });

    expect(message.priority).toBe(2);
    expect(message.assignedBy).toBe(testAgentId);
    expect(message.branch).toBe('feature/test');
    expect(message.worktree).toBe('.stoneforge/.worktrees/test');
    expect(message.isReassignment).toBe(true);
    expect(message.previousAssignee).toBe(testAgentId2);
    expect(message.correlationId).toBe('corr-123');
  });
});

// ============================================================================
// StatusUpdateMessage Tests
// ============================================================================

describe('StatusUpdateMessage', () => {
  const validMessage: StatusUpdateMessage = {
    type: 'status-update',
    timestamp: testTimestamp,
    agentId: testAgentId,
    message: 'Working on task',
  };

  test('isStatusUpdateMessage validates correct message', () => {
    expect(isStatusUpdateMessage(validMessage)).toBe(true);
  });

  test('isStatusUpdateMessage rejects missing required fields', () => {
    expect(isStatusUpdateMessage({ type: 'status-update' })).toBe(false);
    expect(isStatusUpdateMessage({ ...validMessage, agentId: undefined })).toBe(false);
    expect(isStatusUpdateMessage({ ...validMessage, message: undefined })).toBe(false);
  });

  test('createStatusUpdateMessage creates valid message', () => {
    const message = createStatusUpdateMessage({
      agentId: testAgentId,
      message: 'Progress update',
      severity: StatusUpdateSeverity.INFO,
      taskId: testTaskId,
      progress: 50,
      phase: 'implementation',
    });

    expect(message.type).toBe('status-update');
    expect(message.agentId).toBe(testAgentId);
    expect(message.message).toBe('Progress update');
    expect(message.severity).toBe('info');
    expect(message.taskId).toBe(testTaskId);
    expect(message.progress).toBe(50);
    expect(message.phase).toBe('implementation');
    expect(isStatusUpdateMessage(message)).toBe(true);
  });

  test('StatusUpdateSeverity has expected values', () => {
    expect(StatusUpdateSeverity.INFO).toBe('info');
    expect(StatusUpdateSeverity.WARNING).toBe('warning');
    expect(StatusUpdateSeverity.ERROR).toBe('error');
  });
});

// ============================================================================
// HelpRequestMessage Tests
// ============================================================================

describe('HelpRequestMessage', () => {
  const validMessage: HelpRequestMessage = {
    type: 'help-request',
    timestamp: testTimestamp,
    agentId: testAgentId,
    problem: 'Cannot resolve merge conflict',
  };

  test('isHelpRequestMessage validates correct message', () => {
    expect(isHelpRequestMessage(validMessage)).toBe(true);
  });

  test('isHelpRequestMessage rejects missing required fields', () => {
    expect(isHelpRequestMessage({ type: 'help-request' })).toBe(false);
    expect(isHelpRequestMessage({ ...validMessage, agentId: undefined })).toBe(false);
    expect(isHelpRequestMessage({ ...validMessage, problem: undefined })).toBe(false);
  });

  test('createHelpRequestMessage creates valid message', () => {
    const message = createHelpRequestMessage({
      agentId: testAgentId,
      problem: 'Tests failing',
      attemptedSolutions: ['Tried fix A', 'Tried fix B'],
      taskId: testTaskId,
      urgency: HelpRequestUrgency.HIGH,
      errorMessage: 'Error: assertion failed',
      suggestedActions: ['Review logs', 'Check dependencies'],
    });

    expect(message.type).toBe('help-request');
    expect(message.problem).toBe('Tests failing');
    expect(message.attemptedSolutions).toEqual(['Tried fix A', 'Tried fix B']);
    expect(message.urgency).toBe('high');
    expect(message.errorMessage).toBe('Error: assertion failed');
    expect(isHelpRequestMessage(message)).toBe(true);
  });

  test('HelpRequestUrgency has expected values', () => {
    expect(HelpRequestUrgency.LOW).toBe('low');
    expect(HelpRequestUrgency.NORMAL).toBe('normal');
    expect(HelpRequestUrgency.HIGH).toBe('high');
    expect(HelpRequestUrgency.CRITICAL).toBe('critical');
  });
});

// ============================================================================
// HandoffMessage Tests
// ============================================================================

describe('HandoffMessage', () => {
  const validMessage: HandoffMessage = {
    type: 'handoff',
    timestamp: testTimestamp,
    fromAgent: testAgentId,
    toAgent: testAgentId2,
    taskIds: [testTaskId],
    contextSummary: 'Completed steps 1-3',
    isSelfHandoff: false,
  };

  test('isHandoffMessage validates correct message', () => {
    expect(isHandoffMessage(validMessage)).toBe(true);
  });

  test('isHandoffMessage validates self-handoff', () => {
    const selfHandoff: HandoffMessage = {
      ...validMessage,
      toAgent: undefined,
      isSelfHandoff: true,
    };
    expect(isHandoffMessage(selfHandoff)).toBe(true);
  });

  test('isHandoffMessage rejects missing required fields', () => {
    expect(isHandoffMessage({ type: 'handoff' })).toBe(false);
    expect(isHandoffMessage({ ...validMessage, fromAgent: undefined })).toBe(false);
    expect(isHandoffMessage({ ...validMessage, taskIds: undefined })).toBe(false);
    expect(isHandoffMessage({ ...validMessage, contextSummary: undefined })).toBe(false);
    expect(isHandoffMessage({ ...validMessage, isSelfHandoff: undefined })).toBe(false);
  });

  test('isHandoffMessage rejects non-array taskIds', () => {
    expect(isHandoffMessage({ ...validMessage, taskIds: 'not-an-array' })).toBe(false);
  });

  test('createHandoffMessage creates valid message', () => {
    const message = createHandoffMessage({
      fromAgent: testAgentId,
      toAgent: testAgentId2,
      taskIds: [testTaskId],
      contextSummary: 'Context info',
      nextSteps: 'Continue implementation',
      reason: 'Need specialist',
      providerSessionId: 'session-123',
      handoffDocumentId: 'doc-123',
    });

    expect(message.type).toBe('handoff');
    expect(message.fromAgent).toBe(testAgentId);
    expect(message.toAgent).toBe(testAgentId2);
    expect(message.isSelfHandoff).toBe(false);
    expect(isHandoffMessage(message)).toBe(true);
  });

  test('createHandoffMessage infers self-handoff', () => {
    const message = createHandoffMessage({
      fromAgent: testAgentId,
      taskIds: [],
      contextSummary: 'Self handoff context',
    });

    expect(message.isSelfHandoff).toBe(true);
    expect(message.toAgent).toBeUndefined();
  });
});

// ============================================================================
// HealthCheckMessage Tests
// ============================================================================

describe('HealthCheckMessage', () => {
  const validRequest: HealthCheckMessage = {
    type: 'health-check',
    timestamp: testTimestamp,
    targetAgentId: testAgentId,
    sourceAgentId: testAgentId2,
    isResponse: false,
  };

  const validResponse: HealthCheckMessage = {
    type: 'health-check',
    timestamp: testTimestamp,
    targetAgentId: testAgentId,
    sourceAgentId: testAgentId2,
    isResponse: true,
    status: HealthCheckStatus.HEALTHY,
    lastActivityAt: testTimestamp,
  };

  test('isHealthCheckMessage validates correct request', () => {
    expect(isHealthCheckMessage(validRequest)).toBe(true);
  });

  test('isHealthCheckMessage validates correct response', () => {
    expect(isHealthCheckMessage(validResponse)).toBe(true);
  });

  test('isHealthCheckMessage rejects missing required fields', () => {
    expect(isHealthCheckMessage({ type: 'health-check' })).toBe(false);
    expect(isHealthCheckMessage({ ...validRequest, targetAgentId: undefined })).toBe(false);
    expect(isHealthCheckMessage({ ...validRequest, sourceAgentId: undefined })).toBe(false);
    expect(isHealthCheckMessage({ ...validRequest, isResponse: undefined })).toBe(false);
  });

  test('createHealthCheckRequest creates valid request', () => {
    const request = createHealthCheckRequest({
      targetAgentId: testAgentId,
      sourceAgentId: testAgentId2,
    });

    expect(request.type).toBe('health-check');
    expect(request.isResponse).toBe(false);
    expect(request.correlationId).toBeDefined();
    expect(isHealthCheckMessage(request)).toBe(true);
  });

  test('createHealthCheckResponse creates valid response', () => {
    const response = createHealthCheckResponse({
      targetAgentId: testAgentId,
      sourceAgentId: testAgentId2,
      status: HealthCheckStatus.HEALTHY,
      lastActivityAt: testTimestamp,
      currentTaskId: testTaskId,
      metrics: {
        memoryUsage: 50,
        cpuUsage: 25,
        timeSinceLastOutput: 1000,
        errorCount: 0,
      },
      correlationId: 'corr-123',
    });

    expect(response.type).toBe('health-check');
    expect(response.isResponse).toBe(true);
    expect(response.status).toBe('healthy');
    expect(response.metrics?.memoryUsage).toBe(50);
    expect(isHealthCheckMessage(response)).toBe(true);
  });

  test('HealthCheckStatus has expected values', () => {
    expect(HealthCheckStatus.HEALTHY).toBe('healthy');
    expect(HealthCheckStatus.DEGRADED).toBe('degraded');
    expect(HealthCheckStatus.UNHEALTHY).toBe('unhealthy');
    expect(HealthCheckStatus.UNKNOWN).toBe('unknown');
  });
});

// ============================================================================
// GenericMessage Tests
// ============================================================================

describe('GenericMessage', () => {
  const validMessage: GenericMessage = {
    type: 'generic',
    timestamp: testTimestamp,
    content: 'Hello',
  };

  test('isGenericMessage validates correct message', () => {
    expect(isGenericMessage(validMessage)).toBe(true);
  });

  test('isGenericMessage validates minimal message', () => {
    const minimal = { type: 'generic', timestamp: testTimestamp };
    expect(isGenericMessage(minimal)).toBe(true);
  });

  test('createGenericMessage creates valid message', () => {
    const message = createGenericMessage({
      content: 'Test content',
      data: { key: 'value' },
    });

    expect(message.type).toBe('generic');
    expect(message.content).toBe('Test content');
    expect(message.data).toEqual({ key: 'value' });
    expect(isGenericMessage(message)).toBe(true);
  });
});

// ============================================================================
// Union Validation Tests
// ============================================================================

describe('isOrchestratorMessage', () => {
  test('validates all message types', () => {
    expect(isOrchestratorMessage(createTaskAssignmentMessage({ taskId: testTaskId, taskTitle: 'Test' }))).toBe(true);
    expect(isOrchestratorMessage(createStatusUpdateMessage({ agentId: testAgentId, message: 'Test' }))).toBe(true);
    expect(isOrchestratorMessage(createHelpRequestMessage({ agentId: testAgentId, problem: 'Test' }))).toBe(true);
    expect(isOrchestratorMessage(createHandoffMessage({ fromAgent: testAgentId, taskIds: [], contextSummary: 'Test' }))).toBe(true);
    expect(isOrchestratorMessage(createHealthCheckRequest({ targetAgentId: testAgentId, sourceAgentId: testAgentId2 }))).toBe(true);
    expect(isOrchestratorMessage(createGenericMessage({ content: 'Test' }))).toBe(true);
  });

  test('rejects invalid messages', () => {
    expect(isOrchestratorMessage(null)).toBe(false);
    expect(isOrchestratorMessage(undefined)).toBe(false);
    expect(isOrchestratorMessage({})).toBe(false);
    expect(isOrchestratorMessage({ type: 'unknown' })).toBe(false);
    expect(isOrchestratorMessage({ type: 'task-assignment' })).toBe(false); // missing fields
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('parseMessageMetadata', () => {
  test('parses valid messages', () => {
    const message = createTaskAssignmentMessage({ taskId: testTaskId, taskTitle: 'Test' });
    const parsed = parseMessageMetadata(message);
    expect(parsed).toBeDefined();
    expect(parsed?.type).toBe('task-assignment');
  });

  test('returns null for invalid messages', () => {
    expect(parseMessageMetadata(null)).toBeNull();
    expect(parseMessageMetadata(undefined)).toBeNull();
    expect(parseMessageMetadata({})).toBeNull();
    expect(parseMessageMetadata({ type: 'invalid' })).toBeNull();
  });
});

describe('getMessageType', () => {
  test('extracts type from valid messages', () => {
    expect(getMessageType({ type: 'task-assignment' })).toBe('task-assignment');
    expect(getMessageType({ type: 'status-update' })).toBe('status-update');
    expect(getMessageType({ type: 'help-request' })).toBe('help-request');
    expect(getMessageType({ type: 'handoff' })).toBe('handoff');
    expect(getMessageType({ type: 'health-check' })).toBe('health-check');
    expect(getMessageType({ type: 'generic' })).toBe('generic');
  });

  test('returns null for invalid types', () => {
    expect(getMessageType(null)).toBeNull();
    expect(getMessageType(undefined)).toBeNull();
    expect(getMessageType({})).toBeNull();
    expect(getMessageType({ type: 'invalid' })).toBeNull();
    expect(getMessageType({ type: 123 })).toBeNull();
  });
});

// ============================================================================
// Timestamp Validation Tests
// ============================================================================

describe('timestamp validation', () => {
  test('accepts numeric timestamps', () => {
    const message = {
      type: 'generic',
      timestamp: Date.now(),
    };
    expect(isGenericMessage(message)).toBe(true);
  });

  test('accepts ISO string timestamps', () => {
    const message = {
      type: 'generic',
      timestamp: new Date().toISOString(),
    };
    expect(isGenericMessage(message)).toBe(true);
  });

  test('rejects invalid timestamps', () => {
    expect(isGenericMessage({ type: 'generic', timestamp: 'not-a-date' })).toBe(false);
    expect(isGenericMessage({ type: 'generic', timestamp: null })).toBe(false);
    expect(isGenericMessage({ type: 'generic', timestamp: {} })).toBe(false);
    expect(isGenericMessage({ type: 'generic', timestamp: -1 })).toBe(false);
  });
});
