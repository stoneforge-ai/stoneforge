/**
 * Hook to track dashboard section visits and persist to localStorage.
 *
 * Usage: Call this hook in each dashboard section page component.
 */

import { useEffect } from 'react';
import { setLastVisitedDashboardSection } from '../routes/settings';

type DashboardSection = 'overview' | 'task-flow' | 'dependencies' | 'timeline';

/**
 * Tracks when a dashboard section is visited and persists it to localStorage.
 * This enables the "last visited section" feature where users are redirected
 * to their most recently viewed dashboard section.
 *
 * @param section - The dashboard section being visited
 */
export function useTrackDashboardSection(section: DashboardSection): void {
  useEffect(() => {
    setLastVisitedDashboardSection(section);
  }, [section]);
}
