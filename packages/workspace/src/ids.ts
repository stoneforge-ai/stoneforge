type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type OrgId = Brand<string, "OrgId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type RuntimeId = Brand<string, "RuntimeId">;
export type AgentId = Brand<string, "AgentId">;
export type RoleDefinitionId = Brand<string, "RoleDefinitionId">;
export type AuditEventId = Brand<string, "AuditEventId">;

export function asOrgId(value: string): OrgId {
  return value as OrgId;
}

export function asWorkspaceId(value: string): WorkspaceId {
  return value as WorkspaceId;
}

export function asRuntimeId(value: string): RuntimeId {
  return value as RuntimeId;
}

export function asAgentId(value: string): AgentId {
  return value as AgentId;
}

export function asRoleDefinitionId(value: string): RoleDefinitionId {
  return value as RoleDefinitionId;
}

export function asAuditEventId(value: string): AuditEventId {
  return value as AuditEventId;
}
