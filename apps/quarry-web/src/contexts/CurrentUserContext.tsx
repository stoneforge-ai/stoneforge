/**
 * CurrentUserContext - Global context for the currently selected human entity
 *
 * This is a thin wrapper around the shared @stoneforge/ui context that provides
 * the data fetching hook specific to this app.
 */

import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CurrentUserProvider as SharedCurrentUserProvider,
  useCurrentUser,
  type UserEntity,
  type CurrentUserContextValue,
} from '@stoneforge/ui';

// Re-export the hook and types
export { useCurrentUser };
export type { UserEntity, CurrentUserContextValue };

// Hook to fetch all human entities - specific to this app's API
function useHumanEntities() {
  const query = useQuery<UserEntity[]>({
    queryKey: ['entities', 'humans'],
    queryFn: async () => {
      const response = await fetch('/api/entities?entityType=human&limit=10000');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      return data.items || [];
    },
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
  };
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  return (
    <SharedCurrentUserProvider useHumanEntities={useHumanEntities}>
      {children}
    </SharedCurrentUserProvider>
  );
}
