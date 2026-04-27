import { brand, type Brand } from "./brand.js"

export type OrgId = Brand<string, "OrgId">
export type WorkspaceId = Brand<string, "WorkspaceId">
export type RuntimeId = Brand<string, "RuntimeId">
export type AgentId = Brand<string, "AgentId">
export type RoleDefinitionId = Brand<string, "RoleDefinitionId">
export type AuditEventId = Brand<string, "AuditEventId">
export type MergeRequestId = Brand<string, "MergeRequestId">
export type VerificationRunId = Brand<string, "VerificationRunId">

export function asOrgId(value: string): OrgId {
  return brand<"OrgId">(value)
}

export function asWorkspaceId(value: string): WorkspaceId {
  return brand<"WorkspaceId">(value)
}

export function asRuntimeId(value: string): RuntimeId {
  return brand<"RuntimeId">(value)
}

export function asAgentId(value: string): AgentId {
  return brand<"AgentId">(value)
}

export function asRoleDefinitionId(value: string): RoleDefinitionId {
  return brand<"RoleDefinitionId">(value)
}

export function asAuditEventId(value: string): AuditEventId {
  return brand<"AuditEventId">(value)
}

export function asMergeRequestId(value: string): MergeRequestId {
  return brand<"MergeRequestId">(value)
}

export function asVerificationRunId(value: string): VerificationRunId {
  return brand<"VerificationRunId">(value)
}

export function parseOrgId(value: string): OrgId {
  return asOrgId(validIdValue(value, "OrgId"))
}

export function parseWorkspaceId(value: string): WorkspaceId {
  return asWorkspaceId(validIdValue(value, "WorkspaceId"))
}

export function parseRuntimeId(value: string): RuntimeId {
  return asRuntimeId(validIdValue(value, "RuntimeId"))
}

export function parseAgentId(value: string): AgentId {
  return asAgentId(validIdValue(value, "AgentId"))
}

export function parseRoleDefinitionId(value: string): RoleDefinitionId {
  return asRoleDefinitionId(validIdValue(value, "RoleDefinitionId"))
}

export function parseAuditEventId(value: string): AuditEventId {
  return asAuditEventId(validIdValue(value, "AuditEventId"))
}

export function parseMergeRequestId(value: string): MergeRequestId {
  return asMergeRequestId(validIdValue(value, "MergeRequestId"))
}

export function parseVerificationRunId(value: string): VerificationRunId {
  return asVerificationRunId(validIdValue(value, "VerificationRunId"))
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

function validIdValue(value: string, label: string): string {
  if (idPattern.test(value)) {
    return value
  }

  throw new Error(
    `${label} must be a non-empty identifier containing only letters, numbers, ".", "_", "-", or ":".`
  )
}
