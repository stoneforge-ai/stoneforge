import { brand, type Brand } from "@stoneforge/core";

export type TaskId = Brand<string, "TaskId">;
export type DispatchIntentId = Brand<string, "DispatchIntentId">;
export type AssignmentId = Brand<string, "AssignmentId">;
export type SessionId = Brand<string, "SessionId">;
export type LeaseId = Brand<string, "LeaseId">;

export function asTaskId(value: string): TaskId {
  return brand<"TaskId">(value);
}

export function asDispatchIntentId(value: string): DispatchIntentId {
  return brand<"DispatchIntentId">(value);
}

export function asAssignmentId(value: string): AssignmentId {
  return brand<"AssignmentId">(value);
}

export function asSessionId(value: string): SessionId {
  return brand<"SessionId">(value);
}

export function asLeaseId(value: string): LeaseId {
  return brand<"LeaseId">(value);
}
