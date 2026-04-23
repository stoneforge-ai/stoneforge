/**
 * SystemStatus - Displays server health and status information
 * Shows database path, last update time, and WebSocket status
 */

import type { HealthResponse } from '../types';

interface SystemStatusProps {
  health: HealthResponse;
}

export function SystemStatus({ health }: SystemStatusProps) {
  return (
    <div className="mt-6 sm:mt-8">
      <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">System Status</h3>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="min-w-0">
            <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Database</dt>
            <dd className="font-mono text-xs sm:text-sm text-gray-700 dark:text-gray-300 truncate">{health.database}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Last Updated</dt>
            <dd className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{new Date(health.timestamp).toLocaleTimeString()}</dd>
          </div>
          {health.websocket && (
            <>
              <div className="min-w-0">
                <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">WebSocket Clients</dt>
                <dd className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{health.websocket.clients}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Broadcasting</dt>
                <dd className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{health.websocket.broadcasting ? 'Active' : 'Inactive'}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
