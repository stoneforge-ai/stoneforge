import { brand, type Brand } from "./brand.js";

export type OrgId = Brand<string, "OrgId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type RuntimeId = Brand<string, "RuntimeId">;
export type AgentId = Brand<string, "AgentId">;
export type RoleDefinitionId = Brand<string, "RoleDefinitionId">;
export type AuditEventId = Brand<string, "AuditEventId">;

export function asOrgId(value: string): OrgId {
  return brand<"OrgId">(value);
}

export function asWorkspaceId(value: string): WorkspaceId {
  return brand<"WorkspaceId">(value);
}

export function asRuntimeId(value: string): RuntimeId {
  return brand<"RuntimeId">(value);
}

export function asAgentId(value: string): AgentId {
  return brand<"AgentId">(value);
}

export function asRoleDefinitionId(value: string): RoleDefinitionId {
  return brand<"RoleDefinitionId">(value);
}

export function asAuditEventId(value: string): AuditEventId {
  return brand<"AuditEventId">(value);
}
