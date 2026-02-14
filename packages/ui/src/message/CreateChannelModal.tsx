import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Hash, Users } from 'lucide-react';
import { TagInput } from '../components/TagInput';
import { ResponsiveModal } from '../layout/ResponsiveModal';
import { useCurrentUser } from '../contexts';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface CreateGroupChannelInput {
  channelType: 'group';
  name: string;
  createdBy: string;
  members?: string[];
  visibility?: 'public' | 'private';
  joinPolicy?: 'open' | 'invite-only' | 'request';
  tags?: string[];
}

interface CreateDirectChannelInput {
  channelType: 'direct';
  createdBy: string;
  entityA: string;
  entityB: string;
  tags?: string[];
}

type CreateChannelInput = CreateGroupChannelInput | CreateDirectChannelInput;

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (channel: { id: string }) => void;
}

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateChannelInput) => {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create channel');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function CreateChannelModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateChannelModalProps) {
  const [channelType, setChannelType] = useState<'group' | 'direct'>('group');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'invite-only' | 'request'>('invite-only');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [entityA, setEntityA] = useState('');
  const [entityB, setEntityB] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createChannel = useCreateChannel();
  const { data: entities } = useEntities();
  const { currentUser } = useCurrentUser();

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setChannelType('group');
      setName('');
      setVisibility('private');
      setJoinPolicy('invite-only');
      setSelectedMembers([]);
      setEntityA('');
      setEntityB('');
      setTags([]);
      createChannel.reset();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) return;

    let input: CreateChannelInput;

    if (channelType === 'group') {
      if (!name.trim()) return;

      input = {
        channelType: 'group',
        name: name.trim().replace(/\s+/g, '-').toLowerCase(),
        createdBy: currentUser.id,
        visibility,
        joinPolicy,
        ...(selectedMembers.length > 0 && { members: selectedMembers }),
        ...(tags.length > 0 && { tags }),
      };
    } else {
      if (!entityA || !entityB) return;
      if (entityA === entityB) return;

      input = {
        channelType: 'direct',
        createdBy: currentUser.id,
        entityA,
        entityB,
        ...(tags.length > 0 && { tags }),
      };
    }

    try {
      const result = await createChannel.mutateAsync(input);
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

  const handleMemberToggle = (entityId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(entityId)
        ? prev.filter((id) => id !== entityId)
        : [...prev, entityId]
    );
  };

  const isGroupFormValid = name.trim() && currentUser;
  const isDirectFormValid = entityA && entityB && entityA !== entityB && currentUser;
  const isFormValid = channelType === 'group' ? isGroupFormValid : isDirectFormValid;

  const formActions = (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors touch-target"
        data-testid="create-channel-cancel-button"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit as unknown as () => void}
        disabled={createChannel.isPending || !isFormValid}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
        data-testid="create-channel-submit-button"
      >
        {createChannel.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Create
          </>
        )}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      open={isOpen}
      onClose={onClose}
      title="Create Channel"
      icon={<Hash className="w-5 h-5 text-blue-500" />}
      size="md"
      data-testid="create-channel-modal"
      footer={formActions}
    >
      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4" onKeyDown={handleKeyDown}>
        {/* Channel Type Toggle */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Channel Type
          </label>
          <div className="flex gap-2" data-testid="create-channel-type-toggle">
            <button
              type="button"
              onClick={() => setChannelType('group')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors touch-target ${
                channelType === 'group'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              data-testid="create-channel-type-group"
            >
              <Hash className="w-4 h-4" />
              Group
            </button>
            <button
              type="button"
              onClick={() => setChannelType('direct')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors touch-target ${
                channelType === 'direct'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              data-testid="create-channel-type-direct"
            >
              <Users className="w-4 h-4" />
              Direct
            </button>
          </div>
        </div>

        {/* Group Channel Fields */}
        {channelType === 'group' && (
          <>
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="channel-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="channel-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter channel name..."
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                data-testid="create-channel-name-input"
                required
                maxLength={100}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alphanumeric, hyphens, underscores only</p>
            </div>

            {/* Visibility */}
            <div className="mb-4">
              <label htmlFor="channel-visibility" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Visibility
              </label>
              <select
                id="channel-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                data-testid="create-channel-visibility-select"
              >
                <option value="private">Private - Only members can see</option>
                <option value="public">Public - Anyone can see</option>
              </select>
            </div>

            {/* Join Policy */}
            <div className="mb-4">
              <label htmlFor="channel-join-policy" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Join Policy
              </label>
              <select
                id="channel-join-policy"
                value={joinPolicy}
                onChange={(e) => setJoinPolicy(e.target.value as 'open' | 'invite-only' | 'request')}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                data-testid="create-channel-join-policy-select"
              >
                <option value="invite-only">Invite Only</option>
                <option value="open">Open - Anyone can join</option>
                <option value="request">Request - Approval required</option>
              </select>
            </div>

            {/* Members */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Members <span className="text-gray-400 dark:text-gray-500 text-xs font-normal">(optional)</span>
              </label>
              <div
                className="border border-gray-300 dark:border-gray-600 rounded-lg max-h-32 overflow-y-auto bg-white dark:bg-gray-800"
                data-testid="create-channel-members-list"
              >
                {entities?.filter((e) => e.id !== currentUser?.id).map((entity) => (
                  <label
                    key={entity.id}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer touch-target"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(entity.id)}
                      onChange={() => handleMemberToggle(entity.id)}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-5 h-5"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {entity.name} ({entity.entityType})
                    </span>
                  </label>
                ))}
                {(!entities || entities.length <= 1) && (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    No other entities available
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Creator is automatically added</p>
            </div>
          </>
        )}

        {/* Direct Channel Fields */}
        {channelType === 'direct' && (
          <>
            {/* Entity A */}
            <div className="mb-4">
              <label htmlFor="channel-entity-a" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Entity <span className="text-red-500">*</span>
              </label>
              <select
                id="channel-entity-a"
                value={entityA}
                onChange={(e) => setEntityA(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                data-testid="create-channel-entity-a-select"
                required
              >
                <option value="">Select entity...</option>
                {entities?.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.entityType})
                  </option>
                ))}
              </select>
            </div>

            {/* Entity B */}
            <div className="mb-4">
              <label htmlFor="channel-entity-b" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Second Entity <span className="text-red-500">*</span>
              </label>
              <select
                id="channel-entity-b"
                value={entityB}
                onChange={(e) => setEntityB(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                data-testid="create-channel-entity-b-select"
                required
              >
                <option value="">Select entity...</option>
                {entities?.filter((e) => e.id !== entityA).map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.entityType})
                  </option>
                ))}
              </select>
              {entityA && entityB && entityA === entityB && (
                <p className="mt-1 text-xs text-red-500">Entities must be different</p>
              )}
            </div>
          </>
        )}

        {/* Tags */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tags <span className="text-gray-400 dark:text-gray-500 text-xs font-normal">(optional)</span>
          </label>
          <TagInput
            tags={tags}
            onChange={setTags}
            placeholder="Type and press comma to add tags"
            data-testid="create-channel-tags-input"
          />
        </div>

        {/* Error display */}
        {createChannel.isError && (
          <div
            className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400"
            data-testid="create-channel-error"
          >
            {(createChannel.error as Error)?.message || 'Failed to create channel'}
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}
