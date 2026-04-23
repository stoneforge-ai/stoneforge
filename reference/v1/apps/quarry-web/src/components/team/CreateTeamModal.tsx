/**
 * Create Team Modal
 *
 * Modal dialog for creating new teams with member selection.
 * Supports both desktop (centered dialog) and mobile (full-screen) layouts.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Plus, Search, Bot, User, Server } from 'lucide-react';
import { useIsMobile } from '../../hooks';

interface Team {
  id: string;
  type: 'team';
  name: string;
  members: string[];
  status?: 'active' | 'tombstone';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface CreateTeamInput {
  name: string;
  members?: string[];
  createdBy?: string;
  tags?: string[];
}

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (team: Team) => void;
}

const ENTITY_TYPE_STYLES: Record<string, { bg: string; text: string; icon: typeof Bot }> = {
  agent: { bg: 'bg-purple-100', text: 'text-purple-800', icon: Bot },
  human: { bg: 'bg-blue-100', text: 'text-blue-800', icon: User },
  system: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Server },
};

function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTeamInput) => {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create team');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

function useAllEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities', 'all'],
    queryFn: async () => {
      // Fetch all entities with a high limit for the member picker
      const response = await fetch('/api/entities?limit=1000');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

export function CreateTeamModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [tags, setTags] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createTeam = useCreateTeam();
  const entities = useAllEntities();

  // Filter entities based on search
  const availableEntities = useMemo(() => {
    const allEntities = entities.data || [];
    if (!memberSearch.trim()) {
      return allEntities.filter((e) => !selectedMembers.includes(e.id));
    }
    const query = memberSearch.toLowerCase();
    return allEntities.filter(
      (e) =>
        !selectedMembers.includes(e.id) &&
        (e.name.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query))
    );
  }, [entities.data, memberSearch, selectedMembers]);

  // Get selected entity details
  const selectedEntities = useMemo(() => {
    return (entities.data || []).filter((e) => selectedMembers.includes(e.id));
  }, [entities.data, selectedMembers]);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setSelectedMembers([]);
      setTags('');
      setMemberSearch('');
      createTeam.reset();
    }
  }, [isOpen]);

  const handleAddMember = (entityId: string) => {
    setSelectedMembers((prev) => [...prev, entityId]);
    setMemberSearch('');
  };

  const handleRemoveMember = (entityId: string) => {
    setSelectedMembers((prev) => prev.filter((id) => id !== entityId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    // TB123: Teams must have at least one member
    if (selectedMembers.length === 0) return;

    const input: CreateTeamInput = {
      name: name.trim(),
      members: selectedMembers,
    };

    if (tags.trim()) {
      input.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    try {
      const result = await createTeam.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const isMobileModal = useIsMobile();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="create-team-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-team-modal-backdrop"
      />

      {/* Dialog - full screen on mobile */}
      <div className={`
        ${isMobileModal
          ? 'absolute inset-0'
          : 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh]'
        } flex flex-col
      `}>
        <div className={`
          bg-[var(--color-bg)] dark:bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)]
          overflow-hidden flex flex-col h-full
          ${isMobileModal ? '' : 'rounded-xl max-h-full'}
        `}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Create Team</h2>
            <button
              onClick={onClose}
              className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded touch-target"
              aria-label="Close"
              data-testid="create-team-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 overflow-auto flex-1">
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="team-name" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Team Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="team-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter team name..."
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-team-name-input"
                required
              />
            </div>

            {/* Members - TB123: Required */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Members <span className="text-red-500">*</span>
              </label>
              {selectedMembers.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  Teams must have at least one member. Search and select an entity below.
                </p>
              )}

              {/* Selected Members */}
              {selectedEntities.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2" data-testid="selected-members">
                  {selectedEntities.map((entity) => {
                    const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
                    const Icon = styles.icon;
                    return (
                      <div
                        key={entity.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--color-surface-hover)] rounded-full text-sm"
                        data-testid={`selected-member-${entity.id}`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${styles.text}`} />
                        <span className="text-[var(--color-text)]">{entity.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(entity.id)}
                          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-full hover:bg-[var(--color-surface)]"
                          data-testid={`remove-member-${entity.id}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Member Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search entities to add..."
                  className="w-full pl-8 pr-3 py-2.5 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  data-testid="member-search-input"
                />
              </div>

              {/* Available Entities */}
              {memberSearch.trim() && (
                <div className="mt-2 max-h-40 overflow-auto border border-[var(--color-border)] rounded-md" data-testid="entity-search-results">
                  {entities.isLoading ? (
                    <div className="p-3 text-sm text-[var(--color-text-muted)] text-center">Loading entities...</div>
                  ) : availableEntities.length === 0 ? (
                    <div className="p-3 text-sm text-[var(--color-text-muted)] text-center">No matching entities</div>
                  ) : (
                    availableEntities.slice(0, 10).map((entity) => {
                      const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
                      const Icon = styles.icon;
                      return (
                        <button
                          key={entity.id}
                          type="button"
                          onClick={() => handleAddMember(entity.id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--color-surface-hover)] text-left touch-target"
                          data-testid={`add-member-${entity.id}`}
                        >
                          <Icon className={`w-4 h-4 ${styles.text}`} />
                          <span className="text-sm text-[var(--color-text)]">{entity.name}</span>
                          <span className={`ml-auto px-1.5 py-0.5 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
                            {entity.entityType}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Tags (optional) */}
            <div className="mb-4">
              <label htmlFor="team-tags" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Tags <span className="text-[var(--color-text-muted)]">(optional)</span>
              </label>
              <input
                id="team-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Enter tags separated by commas..."
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-team-tags-input"
              />
            </div>

            {/* Error */}
            {createTeam.isError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-600 dark:text-red-400" data-testid="create-team-error">
                {createTeam.error.message}
              </div>
            )}

            {/* Actions - stack on mobile */}
            <div className={`flex gap-3 pt-2 ${isMobileModal ? 'flex-col-reverse' : 'justify-end'}`}>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors ${isMobileModal ? 'w-full' : ''}`}
                data-testid="create-team-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || selectedMembers.length === 0 || createTeam.isPending}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isMobileModal ? 'w-full' : ''}`}
                data-testid="create-team-submit"
                title={selectedMembers.length === 0 ? 'Select at least one member to create a team' : undefined}
              >
                {createTeam.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Team
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
