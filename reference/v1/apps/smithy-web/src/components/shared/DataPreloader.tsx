/**
 * DataPreloader Component (TB67)
 *
 * Shows a loading spinner while all elements are being loaded on app mount.
 * Once loaded, renders children and enables in-place cache updates.
 */

import { ReactNode } from 'react';
import { useAllElements, useInPlaceCacheUpdates } from '../../api/hooks/useAllElements';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import type { WebSocketEvent } from '@stoneforge/ui';

interface DataPreloaderProps {
  children: ReactNode;
  /** Show detailed loading progress (default: true) */
  showProgress?: boolean;
  /** Fallback component for error state */
  errorFallback?: ReactNode;
}

/**
 * Loading indicator with progress
 */
function LoadingIndicator({ totalElements, showProgress }: { totalElements: number; showProgress: boolean }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-gray-50"
      data-testid="data-preloader-loading"
    >
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-gray-200 rounded-full" />
          <div
            className="absolute inset-0 border-4 border-blue-500 rounded-full animate-spin"
            style={{ borderTopColor: 'transparent', borderRightColor: 'transparent' }}
          />
        </div>

        {/* Loading text */}
        <h2 className="text-lg font-medium text-gray-900 mb-2">Loading Stoneforge</h2>

        {showProgress && (
          <p className="text-sm text-gray-500">
            {totalElements > 0
              ? `Loaded ${totalElements.toLocaleString()} elements`
              : 'Fetching data...'}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Error indicator
 */
function ErrorIndicator({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-gray-50"
      data-testid="data-preloader-error"
    >
      <div className="text-center max-w-md p-6">
        {/* Error icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h2 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Data</h2>
        <p className="text-sm text-gray-500 mb-4">
          {error?.message || 'An error occurred while loading the application data.'}
        </p>

        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/**
 * Inner component that handles WebSocket events with in-place updates
 */
function DataPreloaderInner({ children }: { children: ReactNode }) {
  const handleInPlaceUpdate = useInPlaceCacheUpdates();

  // Subscribe to WebSocket events and handle them in-place
  useRealtimeEvents({
    channels: ['*'],
    onEvent: (event: WebSocketEvent) => {
      // Try to handle in-place first
      handleInPlaceUpdate(event);
    },
    autoInvalidate: true, // Keep auto-invalidate as fallback for unhandled events
  });

  return <>{children}</>;
}

/**
 * DataPreloader wraps the app and ensures all data is loaded before rendering.
 *
 * Usage in main.tsx:
 * ```tsx
 * <QueryClientProvider client={queryClient}>
 *   <DataPreloader>
 *     <RouterProvider router={router} />
 *   </DataPreloader>
 * </QueryClientProvider>
 * ```
 */
export function DataPreloader({
  children,
  showProgress = true,
  errorFallback,
}: DataPreloaderProps) {
  const { isLoading, isError, error, totalElements, refetch } = useAllElements();

  // Show loading state
  if (isLoading) {
    return <LoadingIndicator totalElements={totalElements} showProgress={showProgress} />;
  }

  // Show error state
  if (isError) {
    if (errorFallback) {
      return <>{errorFallback}</>;
    }
    return <ErrorIndicator error={error} onRetry={() => refetch()} />;
  }

  // Data loaded - render app with in-place update handling
  return <DataPreloaderInner>{children}</DataPreloaderInner>;
}
