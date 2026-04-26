import type { CreateTaskInput } from "@stoneforge/execution";
import type {
  ConnectGitHubRepositoryInput,
  PolicyPreset,
  WorkspaceSetupService,
} from "@stoneforge/workspace";

type RegisterRuntimeInput = Parameters<
  WorkspaceSetupService["registerRuntime"]
>[1];
type RegisterAgentInput = Parameters<WorkspaceSetupService["registerAgent"]>[1];
type RegisterRoleDefinitionInput = Parameters<
  WorkspaceSetupService["registerRoleDefinition"]
>[1];

export interface ControlPlaneOperationInputs {
  workspace: {
    orgName: string;
    workspaceName: string;
    targetBranch: string;
  };
  repository: ConnectGitHubRepositoryInput;
  runtime: RegisterRuntimeInput;
  agent: Omit<RegisterAgentInput, "runtimeId">;
  roleDefinition: RegisterRoleDefinitionInput;
  policyPreset: PolicyPreset;
  task: {
    title: string;
    intent: string;
    acceptanceCriteria: string[];
    priority: NonNullable<CreateTaskInput["priority"]>;
    requiresMergeRequest: boolean;
    requiredAgentTags: string[];
    requiredRuntimeTags: string[];
  };
  localVerificationCheck: {
    providerCheckId: string;
    name: string;
  };
  review: {
    agentApprovalReason: string;
    humanReviewerId: string;
    humanApprovalReason: string;
  };
}
