/**
 * Hook to delete a channel
 *
 * Shared hook used by ChannelMembersPanel for channel deletion.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useDeleteChannel() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { channelId: string; actor: string }>({
    mutationFn: async ({ channelId, actor }) => {
      const response = await fetch(
        `/api/channels/${channelId}?actor=${encodeURIComponent(actor)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete channel');
      }
      return response.json();
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channels', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'members'] });
    },
  });
}
