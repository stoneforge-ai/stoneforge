import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AppMode, SyncStatus, StoneforgeUser, StoneforgeOrg, PresenceEntry } from './mock-data'
import { currentUser as defaultUser, TEAM_MEMBERS, mockOrg, mockPresence } from './mock-data'

interface TeamContextValue {
  appMode: AppMode
  currentUser: StoneforgeUser
  org: StoneforgeOrg | null
  teamMembers: StoneforgeUser[]
  presence: PresenceEntry[]
  syncStatus: SyncStatus
  isTeamMode: boolean
  getUserById: (id: string) => StoneforgeUser | undefined
  getWorkspacePresence: (workspaceId: string) => StoneforgeUser[]
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function useTeamContext(): TeamContextValue {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeamContext must be used within TeamContextProvider')
  return ctx
}

interface TeamContextProviderProps {
  appMode: AppMode
  syncStatus: SyncStatus
  children: ReactNode
}

export function TeamContextProvider({ appMode, syncStatus, children }: TeamContextProviderProps) {
  const isTeamMode = appMode === 'team'

  const value = useMemo<TeamContextValue>(() => {
    const teamMembers = isTeamMode ? TEAM_MEMBERS : []
    const presence = isTeamMode ? mockPresence : []

    const getUserById = (id: string): StoneforgeUser | undefined => {
      if (id === defaultUser.id) return defaultUser
      return TEAM_MEMBERS.find(m => m.id === id)
    }

    const getWorkspacePresence = (workspaceId: string): StoneforgeUser[] => {
      if (!isTeamMode) return []
      return presence
        .filter(p => p.workspaceId === workspaceId && p.userId !== defaultUser.id)
        .map(p => getUserById(p.userId))
        .filter((u): u is StoneforgeUser => !!u)
    }

    return {
      appMode,
      currentUser: defaultUser,
      org: isTeamMode ? mockOrg : null,
      teamMembers,
      presence,
      syncStatus,
      isTeamMode,
      getUserById,
      getWorkspacePresence,
    }
  }, [appMode, syncStatus, isTeamMode])

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}
