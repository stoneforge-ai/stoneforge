/**
 * Stoneforge Type Definitions
 */

export * from './element.js';
export * from './entity.js';
export * from './document.js';
export * from './task.js';
export * from './event.js';
export * from './dependency.js';
// Plan exports - sortByCreationDate aliased to avoid conflict with entity.js
export {
  PlanStatus,
  PLAN_STATUS_TRANSITIONS,
  MIN_PLAN_TITLE_LENGTH,
  MAX_PLAN_TITLE_LENGTH,
  MAX_CANCEL_REASON_LENGTH,
  type Plan,
  type PlanProgress,
  type HydratedPlan,
  isValidPlanStatus,
  validatePlanStatus,
  isValidPlanTitle,
  validatePlanTitle,
  validatePlanOptionalText,
  isValidPlanStatusTransition,
  validatePlanStatusTransition,
  isPlan,
  validatePlan,
  type CreatePlanInput,
  createPlan,
  type UpdatePlanStatusInput,
  updatePlanStatus,
  isDraft,
  isActive,
  isCompleted,
  isCancelled,
  getPlanStatusDisplayName,
  calculatePlanProgress,
  canAutoComplete,
  filterByPlanStatus,
  filterActivePlans,
  filterDraftPlans,
  sortByCreationDate as sortPlansByCreationDate,
} from './plan.js';
export * from './message.js';
export * from './workflow.js';

// Playbook exports - aliased to avoid naming conflicts with other modules
export {
  // Types and interfaces
  type PlaybookId,
  type PlaybookVariable,
  type PlaybookStepBase,
  type PlaybookTaskStep,
  type PlaybookFunctionStep,
  type PlaybookStep,
  type Playbook,
  type HydratedPlaybook,
  type CreatePlaybookInput,
  type UpdatePlaybookInput,
  type ResolvedVariables,
  type ConditionOperator,
  type ParsedCondition,
  type PlaybookLoader,
  type ResolvedInheritanceChain,
  type ResolvedPlaybook,
  // Enums
  VariableType,
  StepType,
  FunctionRuntime,
  // Constants
  MIN_PLAYBOOK_NAME_LENGTH,
  MAX_PLAYBOOK_NAME_LENGTH,
  MIN_PLAYBOOK_TITLE_LENGTH,
  MAX_PLAYBOOK_TITLE_LENGTH,
  MAX_VARIABLE_NAME_LENGTH,
  MAX_STEP_ID_LENGTH,
  MAX_STEP_TITLE_LENGTH,
  MAX_STEP_DESCRIPTION_LENGTH,
  MAX_ASSIGNEE_LENGTH,
  MAX_CONDITION_LENGTH,
  MAX_FUNCTION_CODE_LENGTH,
  MAX_FUNCTION_COMMAND_LENGTH,
  DEFAULT_FUNCTION_TIMEOUT,
  MAX_FUNCTION_TIMEOUT,
  MAX_STEPS,
  MAX_VARIABLES,
  MAX_EXTENDS,
  VARIABLE_NAME_PATTERN,
  STEP_ID_PATTERN,
  PLAYBOOK_NAME_PATTERN,
  VARIABLE_SUBSTITUTION_PATTERN,
  // Variable type validation
  isValidVariableType,
  validateVariableType,
  isValidVariableName,
  validateVariableName,
  isValidDefaultForType,
  isValidEnumForType,
  isValidPlaybookVariable,
  validatePlaybookVariable,
  // Step type validation
  isValidStepType,
  isValidFunctionRuntime,
  isTaskStep,
  isFunctionStep,
  // Step validation
  isValidStepId,
  validateStepId,
  isValidStepTitle,
  validateStepTitle,
  validateStepDescription,
  isValidPlaybookStep,
  validatePlaybookStep,
  // Playbook name/title/version validation
  isValidPlaybookName,
  validatePlaybookName,
  isValidPlaybookTitle,
  validatePlaybookTitle,
  isValidPlaybookVersion,
  validatePlaybookVersion,
  isValidPlaybookId,
  validatePlaybookId,
  // Array validators
  validateSteps,
  validateVariables,
  validateExtends,
  // Type guards
  isPlaybook,
  validatePlaybook,
  // Factory functions
  createPlaybook,
  updatePlaybook,
  // Variable system
  resolveVariables,
  getVariableNames,
  getRequiredVariableNames,
  getOptionalVariableNames,
  // Condition system
  isTruthy,
  parseCondition,
  evaluateCondition,
  // Substitution system
  extractVariableNames,
  substituteVariables,
  hasVariables,
  filterStepsByConditions,
  // Utility functions - aliased to avoid conflicts
  getStepById,
  getVariableByName,
  hasPlaybookVariables,
  hasSteps,
  hasParents,
  hasDescription as playbookHasDescription,
  getStepCount,
  getVariableCount,
  filterByNamePattern as filterPlaybooksByNamePattern,
  filterByVariable as filterPlaybooksByVariable,
  sortByName as sortPlaybooksByName,
  sortByVersion as sortPlaybooksByVersion,
  sortPlaybooksByCreatedAtDesc,
  sortPlaybooksByCreatedAtAsc,
  sortByStepCount as sortPlaybooksByStepCount,
  groupByHasParents,
  getAllParentNames,
  findChildPlaybooks,
  findByName as findPlaybookByName,
  // Inheritance system
  resolveInheritanceChain,
  mergeVariables,
  mergeSteps,
  validateMergedSteps,
  resolvePlaybookInheritance,
  createPlaybookLoader,
  // Cycle detection
  validateNoCircularInheritance,
} from './playbook.js';

// Playbook YAML exports
export {
  // Constants
  PLAYBOOK_FILE_EXTENSION,
  PLAYBOOK_FILE_EXTENSION_ALT,
  DEFAULT_PLAYBOOK_DIRS,
  // YAML Schema Types
  type YamlPlaybookVariable,
  type YamlPlaybookStep,
  type YamlPlaybookFile,
  // Discovery Types
  type DiscoveredPlaybook,
  type PlaybookDiscoveryOptions,
  // Path Utilities
  expandPath as expandPlaybookPath,
  extractPlaybookName,
  isPlaybookFile,
  // YAML Parsing
  parseYamlPlaybook,
  convertYamlToPlaybookInput,
  validateYamlPlaybook,
  // File Discovery
  discoverPlaybookFiles,
  findPlaybookFile,
  // File Loading
  readPlaybookFile,
  loadPlaybookFromFile,
  // YAML Conversion
  convertPlaybookToYaml,
  serializePlaybookToYaml,
  writePlaybookFile,
} from './playbook-yaml.js';

// Library exports - exclude duplicates
// Note: hasDescription is also in channel.js but with a different implementation for channels
export {
  // Library type and interfaces
  type Library,
  type HydratedLibrary,
  type LibraryId,
  // Constants
  MIN_LIBRARY_NAME_LENGTH,
  MAX_LIBRARY_NAME_LENGTH,
  // Validation
  isValidLibraryName,
  validateLibraryName,
  isValidLibraryId,
  validateLibraryId,
  // Type guards
  isLibrary,
  validateLibrary,
  // Factory functions
  createLibrary,
  type CreateLibraryInput,
  updateLibrary,
  type UpdateLibraryInput,
  // Utility functions (note: some may conflict with channel.js)
  hasDescription as libraryHasDescription,
  getLibraryDisplayName,
  filterByCreator as filterLibrariesByCreator,
  filterWithDescription as filterLibrariesWithDescription,
  filterWithoutDescription as filterLibrariesWithoutDescription,
  sortByName as sortLibrariesByName,
  sortByCreationDate as sortLibrariesByCreationDate,
  sortByUpdateDate as sortLibrariesByUpdateDate,
  groupByCreator as groupLibrariesByCreator,
  searchByName as searchLibrariesByName,
  findByName as findLibraryByName,
  findById as findLibraryById,
  isNameUnique as isLibraryNameUnique,
} from './library.js';

// Team exports - exclude duplicates
export {
  // Team type and interfaces
  type Team,
  type HydratedTeam,
  type TeamId,
  type TeamStatus,
  TeamStatus as TeamStatusEnum,
  // Constants
  MIN_TEAM_NAME_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAM_MEMBERS,
  // Validation
  isValidTeamName,
  validateTeamName,
  isValidTeamId,
  validateTeamId,
  isValidMembers as isValidTeamMembers,
  validateMembers as validateTeamMembers,
  // Type guards
  isTeam,
  validateTeam,
  // Factory functions
  createTeam,
  type CreateTeamInput,
  updateTeam,
  type UpdateTeamInput,
  // Membership operations
  MembershipError,
  addMember as addTeamMember,
  removeMember as removeTeamMember,
  isMember as isTeamMember,
  getMemberCount as getTeamMemberCount,
  // Utility functions (note: some may conflict with other modules)
  hasDescription as teamHasDescription,
  getTeamDisplayName,
  filterByCreator as filterTeamsByCreator,
  filterWithDescription as filterTeamsWithDescription,
  filterWithoutDescription as filterTeamsWithoutDescription,
  filterByMember as filterTeamsByMember,
  filterWithMembers as filterTeamsWithMembers,
  filterEmpty as filterEmptyTeams,
  sortByName as sortTeamsByName,
  sortByMemberCount as sortTeamsByMemberCount,
  sortByCreationDate as sortTeamsByCreationDate,
  sortByUpdateDate as sortTeamsByUpdateDate,
  groupByCreator as groupTeamsByCreator,
  searchByName as searchTeamsByName,
  findByName as findTeamByName,
  findById as findTeamById,
  isNameUnique as isTeamNameUnique,
  getTeamsForEntity,
  getAllMembers as getAllTeamMembers,
  haveCommonMembers as teamsHaveCommonMembers,
  getCommonMembers as getTeamsCommonMembers,
  isDeleted as isTeamDeleted,
} from './team.js';

// Channel exports - exclude duplicates that are already exported from message.js
// ChannelId, isValidChannelId, validateChannelId are in both message.js and channel.js
// sortByCreatedAtDesc is in both message.js and channel.js (different implementations)
export {
  // Channel type and enums
  type Channel,
  type HydratedChannel,
  type ChannelType,
  ChannelTypeValue,
  type Visibility,
  VisibilityValue,
  type JoinPolicy,
  JoinPolicyValue,
  type ChannelPermissions,
  // Constants
  MAX_CHANNEL_NAME_LENGTH,
  MIN_CHANNEL_NAME_LENGTH,
  MAX_CHANNEL_MEMBERS,
  MIN_GROUP_MEMBERS,
  DIRECT_CHANNEL_MEMBERS,
  // Validation - excluding duplicates with message.js
  isValidChannelType,
  validateChannelType,
  isValidVisibility,
  validateVisibility,
  isValidJoinPolicy,
  validateJoinPolicy,
  isValidChannelName,
  validateChannelName,
  isValidMemberId,
  validateMemberId,
  isValidDescription,
  validateDescription,
  isValidMembers,
  validateMembers,
  isValidModifyMembers,
  validateModifyMembers,
  isValidChannelPermissions,
  validateChannelPermissions,
  // Type guards
  isChannel,
  isDirectChannel,
  isGroupChannel,
  validateChannel,
  // Direct channel naming
  generateDirectChannelName,
  parseDirectChannelName,
  // Factory functions
  createGroupChannel,
  type CreateGroupChannelInput,
  createDirectChannel,
  type CreateDirectChannelInput,
  // Error classes
  DirectChannelMembershipError,
  NotAMemberError,
  CannotModifyMembersError,
  // Utility functions
  isMember,
  canModifyMembers,
  canJoin,
  isPublicChannel,
  isPrivateChannel,
  getMemberCount,
  hasDescription,
  filterByChannelType,
  filterDirectChannels,
  filterGroupChannels,
  filterByMember,
  filterByVisibility,
  filterPublicChannels,
  filterPrivateChannels,
  sortByName,
  sortByMemberCount,
  // Note: sortByCreatedAtDesc is intentionally not exported from channel.js
  // because message.js already exports it. Use message's sortByCreatedAtDesc for channels too.
  groupByVisibility,
  groupByChannelType,
  findDirectChannel,
  getDirectChannelsForEntity,
  validateDirectChannelConstraints,
  // Channel's ChannelId and validation functions (aliased to avoid conflict)
  type ChannelId as ChannelChannelId,
  isValidChannelId as isValidChannelChannelId,
  validateChannelId as validateChannelChannelId,
} from './channel.js';

// Workflow creation exports
export {
  // Types
  type CreateWorkflowFromPlaybookInput,
  type CreatedTask,
  type CreatedFunctionStep,
  type CreatedStep,
  type CreateWorkflowFromPlaybookResult,
  type TaskCreator,
  type CreateWorkflowOptions,
  // Auto-status detection
  shouldAutoComplete,
  shouldAutoFail,
  shouldAutoStart,
  computeWorkflowStatus,
  // Creation functions
  createWorkflowFromPlaybook,
  validateCreateWorkflow,
} from './workflow-create.js';

// Workflow operations exports
export {
  // Types
  type DeleteWorkflowResult as WorkflowDeleteResult,
  type GarbageCollectionResult as WorkflowGCResult,
  type GarbageCollectionOptions as WorkflowGCOptions,
  type EphemeralFilterResult,
  // Ephemeral filtering
  getEphemeralElementIds,
  filterOutEphemeral,
  isEphemeralElement,
  // Workflow-task relationships
  getTaskIdsInWorkflow,
  getDependenciesInWorkflow,
  // GC helpers
  getGarbageCollectionCandidates,
  prepareGarbageCollection,
  // Delete helpers
  canDeleteWorkflow,
  prepareDeleteWorkflow,
} from './workflow-ops.js';

// External Sync exports
export * from './external-sync.js';

// Inbox exports
export {
  // Types and interfaces
  type InboxItem,
  type HydratedInboxItem,
  type InboxFilter,
  type CreateInboxItemInput,
  // Enums
  InboxSourceType,
  InboxStatus,
  // Validation
  isValidInboxSourceType,
  validateInboxSourceType,
  isValidInboxStatus,
  validateInboxStatus,
  isValidInboxItemId,
  validateInboxItemId,
  // Type guards
  isInboxItem,
  validateInboxItem,
  // Utility functions
  filterByStatus as filterInboxByStatus,
  filterBySourceType as filterInboxBySourceType,
  sortByCreatedAt as sortInboxByCreatedAt,
  sortByCreatedAtAsc as sortInboxByCreatedAtAsc,
  getUnread as getUnreadInboxItems,
  getRead as getReadInboxItems,
  getArchived as getArchivedInboxItems,
  isUnread as isInboxItemUnread,
  isRead as isInboxItemRead,
  isArchived as isInboxItemArchived,
  isFromDirectMessage,
  isFromMention,
  groupByChannel as groupInboxByChannel,
  groupByStatus as groupInboxByStatus,
  groupBySourceType as groupInboxBySourceType,
  countUnread as countUnreadInboxItems,
} from './inbox.js';
