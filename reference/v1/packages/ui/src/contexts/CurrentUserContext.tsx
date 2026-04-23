/**
 * CurrentUserContext - Global context for the currently selected human entity
 *
 * Stores which human entity is currently "using" the platform.
 * This affects what inbox is shown and who messages are sent from.
 *
 * Usage:
 * - Wrap your app with CurrentUserProvider
 * - Use useCurrentUser() hook to access the current user and switch users
 * - The current user ID is persisted in localStorage
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Types
export interface UserEntity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUserContextValue {
  /** The currently selected human entity */
  currentUser: UserEntity | null;
  /** Set the current user by entity ID */
  setCurrentUserId: (id: string | null) => void;
  /** All available human entities */
  humanEntities: UserEntity[];
  /** Loading state */
  isLoading: boolean;
}

const LOCAL_STORAGE_KEY = 'stoneforge-current-user-id';

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);

export interface CurrentUserProviderProps {
  children: ReactNode;
  /**
   * Hook that fetches human entities.
   * This allows the consuming app to provide its own data fetching logic
   * (e.g., using react-query with a specific API endpoint).
   */
  useHumanEntities: () => {
    data: UserEntity[] | undefined;
    isLoading: boolean;
  };
}

export function CurrentUserProvider({ children, useHumanEntities }: CurrentUserProviderProps) {
  const { data: humanEntities = [], isLoading } = useHumanEntities();
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(() => {
    // Try to restore from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LOCAL_STORAGE_KEY);
    }
    return null;
  });

  // Persist to localStorage
  const setCurrentUserId = (id: string | null) => {
    setCurrentUserIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem(LOCAL_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  };

  // Auto-select first human entity if none selected and entities are loaded
  useEffect(() => {
    if (!isLoading && humanEntities.length > 0 && !currentUserId) {
      setCurrentUserId(humanEntities[0].id);
    }
    // If the stored user ID is not in the list of human entities, clear it
    if (!isLoading && humanEntities.length > 0 && currentUserId) {
      const exists = humanEntities.some(e => e.id === currentUserId);
      if (!exists) {
        setCurrentUserId(humanEntities[0].id);
      }
    }
  }, [humanEntities, isLoading, currentUserId]);

  const currentUser = humanEntities.find(e => e.id === currentUserId) ?? null;

  return (
    <CurrentUserContext.Provider
      value={{
        currentUser,
        setCurrentUserId,
        humanEntities,
        isLoading,
      }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (context === undefined) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
}
