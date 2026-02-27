/**
 * Linear Task Sync Adapter
 *
 * Implements the TaskSyncAdapter interface for Linear issue operations.
 * Maps between Stoneforge ExternalTask/ExternalTaskInput and Linear's
 * GraphQL API using the LinearApiClient.
 *
 * Key design points:
 * - Caches workflow states per team (fetched on first use)
 * - Builds bidirectional lookup maps: stateTypeToStateId and stateIdToType
 * - Refreshes state cache when a stateId lookup fails
 * - Uses native Linear priority (0-4) instead of label-based priority
 * - Maps status via workflow state TYPE, not state name
 */

import type { Timestamp, Priority } from '@stoneforge/core';
import type {
  TaskSyncAdapter,
  ExternalTask,
  ExternalTaskInput,
  TaskFieldMapConfig,
} from '@stoneforge/core';

import type { LinearApiClient } from './linear-api.js';
import type { LinearIssue, LinearWorkflowState, LinearTeam } from './linear-types.js';
import type { LinearStateType } from './linear-field-map.js';
import {
  createLinearFieldMapConfig,
  linearPriorityToStoneforge,
  stoneforgePriorityToLinear,
  linearStateTypeToStatus,
  linearStateTypeToStatusLabel,
  statusToLinearStateType,
} from './linear-field-map.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * The label name used to indicate a blocked task on Linear.
 * Linear has no native blocked state — this label is added/removed
 * by the adapter to signal blocked status.
 *
 * Added to ExternalTaskInput.labels by buildExternalLabels() when a task
 * has status=blocked and the provider has no statusLabels config.
 */
const BLOCKED_LABEL = 'blocked';

// ============================================================================
// Types
// ============================================================================

/**
 * Cached workflow state mappings for a Linear team.
 */
interface WorkflowStateCache {
  /** Team ID this cache belongs to */
  readonly teamId: string;
  /** Map from workflow state type to the first matching state ID */
  readonly stateTypeToStateId: Map<LinearStateType, string>;
  /** Map from state ID to workflow state type */
  readonly stateIdToType: Map<string, LinearStateType>;
  /** All workflow states for reference */
  readonly states: readonly LinearWorkflowState[];
}

// ============================================================================
// LinearTaskAdapter
// ============================================================================

/**
 * TaskSyncAdapter implementation for Linear.
 *
 * Provides bidirectional sync between Stoneforge tasks and Linear issues.
 * Uses workflow state caching for efficient status mapping and handles
 * Linear's native priority field directly (no label convention needed).
 *
 * @example
 * ```typescript
 * const client = new LinearApiClient({ apiKey: 'lin_api_...' });
 * const adapter = new LinearTaskAdapter(client);
 *
 * // Fetch a single issue
 * const issue = await adapter.getIssue('ENG', 'uuid-here');
 *
 * // List recent changes
 * const issues = await adapter.listIssuesSince('ENG', '2024-01-01T00:00:00Z');
 * ```
 */
export class LinearTaskAdapter implements TaskSyncAdapter {
  private readonly api: LinearApiClient;

  /** Cached workflow states keyed by team ID */
  private stateCacheByTeam = new Map<string, WorkflowStateCache>();

  /** Cached team lookups keyed by team key (e.g., "ENG") */
  private teamByKey = new Map<string, LinearTeam>();

  /** Cached label name→ID lookup (workspace-level) */
  private labelsByName = new Map<string, string>();

  /** Whether labels have been fetched from the API */
  private labelsCached = false;

  constructor(api: LinearApiClient) {
    this.api = api;
  }

  // --------------------------------------------------------------------------
  // TaskSyncAdapter Implementation
  // --------------------------------------------------------------------------

  /**
   * Fetch a single Linear issue by external ID (UUID) and convert to ExternalTask.
   *
   * @param project - Team key (e.g., "ENG")
   * @param externalId - Linear issue UUID
   * @returns ExternalTask or null if not found
   */
  async getIssue(project: string, externalId: string): Promise<ExternalTask | null> {
    const issue = await this.api.getIssue(externalId);
    if (!issue) {
      return null;
    }

    return this.linearIssueToExternalTask(issue, project);
  }

  /**
   * List Linear issues updated since a given timestamp.
   *
   * @param project - Team key (e.g., "ENG")
   * @param since - ISO 8601 timestamp
   * @returns Array of ExternalTask
   */
  async listIssuesSince(project: string, since: Timestamp): Promise<ExternalTask[]> {
    const issues = await this.api.listIssuesSince(project, since);
    return issues.map((issue) => this.linearIssueToExternalTask(issue, project));
  }

  /**
   * Create a new issue in Linear.
   *
   * Resolves the team key to a team ID, maps ExternalTaskInput fields to
   * Linear mutation input (title, description, priority, stateId), and
   * calls the API to create the issue.
   *
   * @param project - Team key (e.g., "ENG")
   * @param issue - ExternalTaskInput with the fields to set
   * @returns The created ExternalTask
   */
  async createIssue(project: string, issue: ExternalTaskInput): Promise<ExternalTask> {
    // Resolve team key to team ID
    const team = await this.resolveTeam(project);

    // Build create input (handles state type mapping including blocked→started)
    const input = await this.buildCreateInput(team, issue);

    // Handle "blocked" label: if present in input labels, resolve to a Linear
    // label ID and include in the create mutation
    const isBlocked = issue.labels?.includes(BLOCKED_LABEL) ?? false;
    if (isBlocked) {
      const blockedLabelId = await this.resolveBlockedLabelId(team.id);
      if (blockedLabelId) {
        input.labelIds = [blockedLabelId];
      }
    }

    // Create issue via API
    const created = await this.api.createIssue(input);
    return this.linearIssueToExternalTask(created, project);
  }

  /**
   * Update an existing issue in Linear.
   *
   * Maps partial ExternalTaskInput to Linear mutation input and calls
   * the API to update the issue.
   *
   * @param project - Team key (e.g., "ENG")
   * @param externalId - Linear issue UUID
   * @param updates - Partial ExternalTaskInput with fields to update
   * @returns The updated ExternalTask
   */
  async updateIssue(
    project: string,
    externalId: string,
    updates: Partial<ExternalTaskInput>
  ): Promise<ExternalTask> {
    // Resolve team for state mapping
    const team = await this.resolveTeam(project);

    // Build update input (handles state type mapping including blocked→started)
    const input = await this.buildUpdateInput(team, updates);

    // Handle "blocked" label: add or remove based on whether the task is blocked.
    // Fetch current issue labels to compute the correct labelIds (preserving
    // existing labels while adding/removing only the "blocked" label).
    const shouldBeBlocked = updates.labels?.includes(BLOCKED_LABEL) ?? false;
    const labelIds = await this.computeBlockedLabelIds(
      team.id,
      externalId,
      shouldBeBlocked
    );
    if (labelIds !== undefined) {
      input.labelIds = labelIds;
    }

    // Update issue via API
    const updated = await this.api.updateIssue(externalId, input);
    return this.linearIssueToExternalTask(updated, project);
  }

  /**
   * Returns the Linear-specific TaskFieldMapConfig.
   */
  getFieldMapConfig(): TaskFieldMapConfig {
    return createLinearFieldMapConfig();
  }

  // --------------------------------------------------------------------------
  // Conversion: Linear Issue → ExternalTask
  // --------------------------------------------------------------------------

  /**
   * Converts a Linear issue API response to the normalized ExternalTask format.
   *
   * Injects a synthetic sf:status:* label based on the workflow state type.
   * This allows the generic field mapping system (stateToStatus) to extract
   * granular statuses without the sync engine needing Linear-specific logic.
   */
  private linearIssueToExternalTask(issue: LinearIssue, project: string): ExternalTask {
    // Map state type to open/closed for ExternalTask's binary state
    const stateType = issue.state.type;
    const isCompleted = stateType === 'completed' || stateType === 'canceled';

    // Collect labels as string names
    const labels = issue.labels.nodes.map((label) => label.name);

    // Inject a sf:status:* label based on workflow state type.
    // This communicates the granular Linear state through the generic label-based
    // field mapping system, keeping the sync engine provider-agnostic.
    const statusLabel = linearStateTypeToStatusLabel(stateType);
    labels.push(statusLabel);

    // Build assignees list (Linear supports single assignee)
    const assignees: string[] = [];
    if (issue.assignee) {
      assignees.push(issue.assignee.name);
    }

    // Store Linear-specific data in raw for lossless round-tripping
    const raw: Record<string, unknown> = {
      linearPriority: issue.priority,
      linearStateType: stateType,
      linearStateId: issue.state.id,
      linearStateName: issue.state.name,
      linearIdentifier: issue.identifier,
      linearTeamKey: issue.team.key,
      linearTeamId: issue.team.id,
    };

    // Include archived info if present
    if (issue.archivedAt) {
      raw.linearArchivedAt = issue.archivedAt;
    }

    return {
      externalId: issue.id,
      url: issue.url,
      provider: 'linear',
      project,
      title: issue.title,
      body: issue.description ?? undefined,
      state: isCompleted ? 'closed' : 'open',
      labels,
      assignees,
      // Convert Linear native priority (0-4) to Stoneforge priority (1-5)
      priority: linearPriorityToStoneforge(issue.priority),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: isCompleted ? issue.updatedAt : undefined,
      raw,
    };
  }

  // --------------------------------------------------------------------------
  // Input Building: ExternalTaskInput → Linear API Input
  // --------------------------------------------------------------------------

  /**
   * Builds a CreateIssueInput from an ExternalTaskInput.
   */
  private async buildCreateInput(
    team: LinearTeam,
    issue: ExternalTaskInput
  ): Promise<{
    teamId: string;
    title: string;
    description?: string;
    priority?: number;
    stateId?: string;
    labelIds?: readonly string[];
  }> {
    const input: {
      teamId: string;
      title: string;
      description?: string;
      priority?: number;
      stateId?: string;
      labelIds?: readonly string[];
    } = {
      teamId: team.id,
      title: issue.title,
    };

    // Map description
    if (issue.body) {
      input.description = issue.body;
    }

    // Map state to workflow state ID.
    // Use a richer mapping that accounts for blocked tasks: the "blocked"
    // label in the input signals that the task is blocked and should map
    // to the 'started' state type (not 'unstarted'), since a blocked task
    // was actively worked on and got stuck.
    if (issue.state) {
      const isBlocked = issue.labels?.includes(BLOCKED_LABEL) ?? false;
      let targetStateType: LinearStateType;
      if (issue.state === 'closed') {
        targetStateType = 'completed';
      } else if (isBlocked) {
        targetStateType = 'started';
      } else {
        targetStateType = 'unstarted';
      }
      const stateId = await this.resolveStateId(team.id, targetStateType);
      if (stateId) {
        input.stateId = stateId;
      }
    }

    // Map priority: convert Stoneforge priority (1-5) to Linear native priority (0-4).
    // If no priority is provided, default to Linear 0 (No priority).
    if (issue.priority !== undefined) {
      input.priority = stoneforgePriorityToLinear(issue.priority as Priority);
    } else {
      input.priority = 0; // Linear "No priority"
    }

    return input;
  }

  /**
   * Builds an UpdateIssueInput from a partial ExternalTaskInput.
   */
  private async buildUpdateInput(
    team: LinearTeam,
    updates: Partial<ExternalTaskInput>
  ): Promise<{
    title?: string;
    description?: string;
    priority?: number;
    stateId?: string;
    labelIds?: readonly string[];
  }> {
    const input: {
      title?: string;
      description?: string;
      priority?: number;
      stateId?: string;
      labelIds?: readonly string[];
    } = {};

    if (updates.title !== undefined) {
      input.title = updates.title;
    }

    if (updates.body !== undefined) {
      input.description = updates.body;
    }

    // Map state to workflow state ID.
    // Use a richer mapping that accounts for blocked tasks: if the "blocked"
    // label is in the update's labels, the task should map to 'started' state
    // type (not 'unstarted'), since blocked tasks were in-progress and got stuck.
    if (updates.state !== undefined) {
      const isBlocked = updates.labels?.includes(BLOCKED_LABEL) ?? false;
      let targetStateType: LinearStateType;
      if (updates.state === 'closed') {
        targetStateType = 'completed';
      } else if (isBlocked) {
        targetStateType = 'started';
      } else {
        targetStateType = 'unstarted';
      }
      const stateId = await this.resolveStateId(team.id, targetStateType);
      if (stateId) {
        input.stateId = stateId;
      }
    }

    // Map priority: convert Stoneforge priority (1-5) to Linear native priority (0-4)
    if (updates.priority !== undefined) {
      input.priority = stoneforgePriorityToLinear(updates.priority as Priority);
    }

    return input;
  }

  // --------------------------------------------------------------------------
  // Workflow State Caching
  // --------------------------------------------------------------------------

  /**
   * Resolves a team key (e.g., "ENG") to a LinearTeam object.
   * Caches the team lookup.
   */
  private async resolveTeam(teamKey: string): Promise<LinearTeam> {
    // Check cache first
    const cached = this.teamByKey.get(teamKey);
    if (cached) {
      return cached;
    }

    // Fetch all teams and find the matching one
    const teams = await this.api.getTeams();
    for (const team of teams) {
      this.teamByKey.set(team.key, team);
    }

    const team = this.teamByKey.get(teamKey);
    if (!team) {
      throw new Error(
        `Linear team with key "${teamKey}" not found. Available teams: ${teams.map((t) => t.key).join(', ')}`
      );
    }

    return team;
  }

  /**
   * Gets or creates the workflow state cache for a team.
   * Fetches workflow states from the API on first use.
   */
  private async getStateCache(teamId: string): Promise<WorkflowStateCache> {
    const cached = this.stateCacheByTeam.get(teamId);
    if (cached) {
      return cached;
    }

    return this.refreshStateCache(teamId);
  }

  /**
   * Fetches workflow states from the API and rebuilds the cache.
   */
  private async refreshStateCache(teamId: string): Promise<WorkflowStateCache> {
    const states = await this.api.getTeamWorkflowStates(teamId);

    const stateTypeToStateId = new Map<LinearStateType, string>();
    const stateIdToType = new Map<string, LinearStateType>();

    for (const state of states) {
      // For stateTypeToStateId, use the first state matching each type
      if (!stateTypeToStateId.has(state.type)) {
        stateTypeToStateId.set(state.type, state.id);
      }

      // For stateIdToType, map every state ID
      stateIdToType.set(state.id, state.type);
    }

    const cache: WorkflowStateCache = {
      teamId,
      stateTypeToStateId,
      stateIdToType,
      states,
    };

    this.stateCacheByTeam.set(teamId, cache);
    return cache;
  }

  /**
   * Resolves a Linear workflow state type to a state ID.
   * Uses the cached states, refreshing if the type is not found.
   */
  private async resolveStateId(
    teamId: string,
    stateType: LinearStateType
  ): Promise<string | undefined> {
    // Try cached lookup
    let cache = await this.getStateCache(teamId);
    let stateId = cache.stateTypeToStateId.get(stateType);

    if (stateId) {
      return stateId;
    }

    // Cache miss — workflow states may have been modified. Refresh.
    cache = await this.refreshStateCache(teamId);
    stateId = cache.stateTypeToStateId.get(stateType);

    return stateId;
  }

  /**
   * Resolves a Linear state ID to a workflow state type.
   * Uses the cached states, refreshing if the ID is not found.
   */
  async resolveStateType(
    teamId: string,
    stateId: string
  ): Promise<LinearStateType | undefined> {
    // Try cached lookup
    let cache = await this.getStateCache(teamId);
    let stateType = cache.stateIdToType.get(stateId);

    if (stateType) {
      return stateType;
    }

    // Cache miss — workflow states may have been modified. Refresh.
    cache = await this.refreshStateCache(teamId);
    stateType = cache.stateIdToType.get(stateId);

    return stateType;
  }

  // --------------------------------------------------------------------------
  // Blocked Label Management
  // --------------------------------------------------------------------------

  /**
   * Resolves the "blocked" label to a Linear label ID.
   * Fetches workspace labels on first call and caches the result.
   * Creates the "blocked" label if it doesn't exist.
   *
   * @param teamId - Team ID to associate with a newly created label
   * @returns The label ID, or undefined if resolution fails
   */
  private async resolveBlockedLabelId(teamId: string): Promise<string | undefined> {
    // Check cache first
    const cached = this.labelsByName.get(BLOCKED_LABEL);
    if (cached) {
      return cached;
    }

    // Fetch workspace labels if not already cached
    if (!this.labelsCached) {
      await this.refreshLabelCache();
    }

    // Check again after refresh
    const labelId = this.labelsByName.get(BLOCKED_LABEL);
    if (labelId) {
      return labelId;
    }

    // Label doesn't exist — create it
    try {
      const created = await this.api.createLabel(BLOCKED_LABEL, teamId);
      this.labelsByName.set(created.name, created.id);
      return created.id;
    } catch {
      // If label creation fails (e.g., permission issue), log but don't block
      console.warn(
        `[LinearTaskAdapter] Failed to create "${BLOCKED_LABEL}" label in Linear. ` +
          'Blocked state will be indicated via workflow state only.'
      );
      return undefined;
    }
  }

  /**
   * Computes the new labelIds for an issue update, adding or removing the
   * "blocked" label while preserving all other existing labels.
   *
   * Fetches the current issue to get its existing labels, then:
   * - If shouldBeBlocked is true: ensures "blocked" label is present
   * - If shouldBeBlocked is false: ensures "blocked" label is removed
   *
   * Returns undefined if no label change is needed (avoids unnecessary writes).
   *
   * @param teamId - Team ID (for label creation if needed)
   * @param externalId - Issue UUID to fetch current labels from
   * @param shouldBeBlocked - Whether the issue should have the "blocked" label
   * @returns New labelIds array, or undefined if no change needed
   */
  private async computeBlockedLabelIds(
    teamId: string,
    externalId: string,
    shouldBeBlocked: boolean
  ): Promise<readonly string[] | undefined> {
    // Resolve the blocked label ID (creates if needed)
    const blockedLabelId = await this.resolveBlockedLabelId(teamId);
    if (!blockedLabelId) {
      // Can't resolve blocked label — skip label management
      return undefined;
    }

    // Fetch current issue to get existing label IDs
    const currentIssue = await this.api.getIssue(externalId);
    if (!currentIssue) {
      return shouldBeBlocked ? [blockedLabelId] : undefined;
    }

    const currentLabelIds = currentIssue.labels.nodes.map((l) => l.id);
    const hasBlockedLabel = currentLabelIds.includes(blockedLabelId);

    if (shouldBeBlocked && !hasBlockedLabel) {
      // Add "blocked" label
      return [...currentLabelIds, blockedLabelId];
    } else if (!shouldBeBlocked && hasBlockedLabel) {
      // Remove "blocked" label
      return currentLabelIds.filter((id) => id !== blockedLabelId);
    }

    // No change needed
    return undefined;
  }

  /**
   * Fetches all workspace labels and populates the label cache.
   */
  private async refreshLabelCache(): Promise<void> {
    const labels = await this.api.getLabels();
    this.labelsByName.clear();
    for (const label of labels) {
      this.labelsByName.set(label.name, label.id);
    }
    this.labelsCached = true;
  }
}
