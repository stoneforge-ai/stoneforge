/**
 * TeamDetailPanel - Detailed view of a team
 *
 * Shows team information, statistics, workload distribution, and member list.
 * Supports editing team name and managing members.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Users, X, Pencil, Save, Trash2, Loader2, Search, Plus, UserMinus } from 'lucide-react';
import { ListTodo, CheckCircle, Clock, PlusCircle } from 'lucide-react';
import { EntityLink } from '@stoneforge/ui/domain';
import { useEntityNavigation } from '../../../hooks/useEntityNavigation';
import { useTeam, useTeamMembers, useTeamStats, useUpdateTeam, useDeleteTeam, useAllEntities } from '../hooks';
import { ENTITY_TYPE_STYLES } from '../constants';
import { StatCard } from './StatCard';
import { WorkloadBar } from './WorkloadBar';
import { DeleteTeamConfirmModal } from './DeleteTeamConfirmModal';

interface TeamDetailPanelProps {
  teamId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function TeamDetailPanel({ teamId, onClose, onDeleted }: TeamDetailPanelProps) {
  const { data: team, isLoading: teamLoading } = useTeam(teamId);
  const { data: members, isLoading: membersLoading } = useTeamMembers(teamId);
  const { data: stats, isLoading: statsLoading } = useTeamStats(teamId);
  const entities = useAllEntities();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const { onNavigate, renderProfileLink } = useEntityNavigation();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Available entities to add (not already members)
  const availableEntities = useMemo(() => {
    const teamMemberIds = team?.members || [];
    const allEntities = entities.data || [];
    if (!memberSearch.trim()) {
      return allEntities.filter((e) => !teamMemberIds.includes(e.id));
    }
    const query = memberSearch.toLowerCase();
    return allEntities.filter(
      (e) =>
        !teamMemberIds.includes(e.id) &&
        (e.name.toLowerCase().includes(query) || e.id.toLowerCase().includes(query))
    );
  }, [entities.data, team?.members, memberSearch]);

  if (teamLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="team-detail-loading">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="team-detail-error">
        <span className="text-red-600">Team not found</span>
      </div>
    );
  }

  const isActive = team.status !== 'tombstone';
  const memberCount = team.members?.length || 0;

  // Create a map of member IDs to names for the workload chart
  const memberNameMap: Record<string, string> = {};
  if (members) {
    for (const member of members) {
      memberNameMap[member.id] = member.name;
    }
  }

  // Find max tasks for scaling the workload bars
  const maxTasks = stats?.workloadDistribution?.reduce((max, item) =>
    Math.max(max, item.taskCount), 0
  ) || 0;

  const handleStartEditName = () => {
    setEditName(team.name);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === team.name) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateTeam.mutateAsync({ id: teamId, input: { name: editName.trim() } });
      setIsEditingName(false);
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditName('');
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEditName();
    }
  };

  const handleAddMember = async (entityId: string) => {
    try {
      await updateTeam.mutateAsync({ id: teamId, input: { addMembers: [entityId] } });
      setMemberSearch('');
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleRemoveMember = async (entityId: string) => {
    try {
      await updateTeam.mutateAsync({ id: teamId, input: { removeMembers: [entityId] } });
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTeam.mutateAsync(teamId);
      setShowDeleteConfirm(false);
      onDeleted?.();
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  return (
    <div className="h-full flex flex-col" data-testid="team-detail-panel">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    className="px-2 py-1 text-lg font-medium text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="team-name-input"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={updateTeam.isPending}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                    data-testid="team-name-save"
                  >
                    {updateTeam.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                    data-testid="team-name-cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-medium text-gray-900">{team.name}</h2>
                  {isActive && (
                    <button
                      onClick={handleStartEditName}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      data-testid="team-name-edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {!isActive && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                      Deleted
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="text-sm text-gray-500 font-mono">{team.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              data-testid="team-delete-button"
              title="Delete team"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            data-testid="team-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteTeamConfirmModal
          teamName={team.name}
          isDeleting={deleteTeam.isPending}
          error={deleteTeam.error}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Update Error */}
        {updateTeam.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600" data-testid="team-update-error">
            {updateTeam.error.message}
          </div>
        )}

        {/* Team Info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 text-sm font-medium bg-indigo-100 text-indigo-800 rounded">
              {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
            </span>
            {team.status && (
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                team.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {team.status}
              </span>
            )}
          </div>

          {/* Tags */}
          {team.tags && team.tags.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid="team-tags">
              {team.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Statistics */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Statistics</h3>
          {statsLoading ? (
            <div className="text-sm text-gray-500">Loading stats...</div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3" data-testid="team-stats">
              <StatCard icon={ListTodo} label="Total Tasks" value={stats.totalTasksAssigned} />
              <StatCard icon={Clock} label="Active Tasks" value={stats.activeTasksAssigned} color="text-yellow-600" />
              <StatCard icon={CheckCircle} label="Completed" value={stats.completedTasksAssigned} color="text-green-600" />
              <StatCard icon={PlusCircle} label="Created by Team" value={stats.createdByTeamMembers} color="text-blue-600" />
            </div>
          ) : null}
        </div>

        {/* Workload Distribution */}
        {stats && stats.workloadDistribution && stats.workloadDistribution.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Workload Distribution</h3>
            <div className="space-y-2" data-testid="team-workload">
              {stats.workloadDistribution.map((item) => (
                <WorkloadBar
                  key={item.memberId}
                  memberId={item.memberId}
                  memberName={memberNameMap[item.memberId] || item.memberId}
                  taskCount={item.taskCount}
                  percentage={item.percentage}
                  maxTasks={maxTasks}
                />
              ))}
            </div>
          </div>
        )}

        {/* Members List */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Team Members ({memberCount})
          </h3>

          {/* Add Member Search (only for active teams) */}
          {isActive && (
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Add member..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  data-testid="add-member-search"
                />
              </div>
              {memberSearch.trim() && (
                <div className="mt-1 max-h-32 overflow-auto border border-gray-200 rounded-md bg-white shadow-lg" data-testid="add-member-results">
                  {entities.isLoading ? (
                    <div className="p-2 text-sm text-gray-500 text-center">Loading...</div>
                  ) : availableEntities.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500 text-center">No matching entities</div>
                  ) : (
                    availableEntities.slice(0, 5).map((entity) => {
                      const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
                      const Icon = styles.icon;
                      return (
                        <button
                          key={entity.id}
                          type="button"
                          onClick={() => handleAddMember(entity.id)}
                          disabled={updateTeam.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left disabled:opacity-50"
                          data-testid={`add-member-option-${entity.id}`}
                        >
                          <Plus className="w-3 h-3 text-green-500" />
                          <Icon className={`w-4 h-4 ${styles.text}`} />
                          <span className="text-sm text-gray-900">{entity.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* TB123: Show warning when only one member remains */}
          {members && members.length === 1 && isActive && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700" data-testid="last-member-warning">
              This is the last member. Teams must have at least one member.
            </div>
          )}

          {membersLoading ? (
            <div className="text-sm text-gray-500">Loading members...</div>
          ) : members && members.length > 0 ? (
            <div className="space-y-1" data-testid="team-members-list">
              {members.map((member) => {
                const styles = ENTITY_TYPE_STYLES[member.entityType] || ENTITY_TYPE_STYLES.system;
                const Icon = styles.icon;
                // TB123: Check if this is the last member
                const isLastMember = members.length === 1;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-gray-50 group"
                    data-testid={`member-item-${member.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${styles.text}`} />
                      <EntityLink
                        entityRef={member.id}
                        className="text-sm"
                        showHoverCard
                        navigable
                        onNavigate={onNavigate}
                        renderProfileLink={renderProfileLink}
                        data-testid={`member-link-${member.id}`}
                      >
                        {member.name}
                      </EntityLink>
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
                        {member.entityType}
                      </span>
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={updateTeam.isPending || isLastMember}
                        className={`p-1 rounded transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${
                          isLastMember
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                        }`}
                        title={isLastMember ? 'Cannot remove the last member from a team' : 'Remove from team'}
                        data-testid={`remove-member-${member.id}`}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : memberCount > 0 ? (
            <div className="text-sm text-gray-500">
              {memberCount} members (details not available)
            </div>
          ) : (
            <div className="text-sm text-gray-500">No members</div>
          )}
        </div>

        {/* Timestamps */}
        <div className="text-xs text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-100">
          <div>Created: {new Date(team.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(team.updatedAt).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
