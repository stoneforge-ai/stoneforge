/**
 * Approval Requests API Hooks
 *
 * React hooks for fetching and resolving approval requests from agents
 * running in restricted (Approve) permission mode.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type {
  ApprovalRequest,
  ApprovalRequestsResponse,
  ApprovalRequestResponse,
} from '../types.js';

const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.error?.message || error.message || 'Request failed');
  }
  return response.json();
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch approval requests with adaptive polling.
 * Polls every 5s when sidebar is open, every 30s when closed.
 */
export function useApprovalRequests(options?: {
  status?: 'pending' | 'approved' | 'denied';
  sidebarOpen?: boolean;
}) {
  const { status, sidebarOpen = false } = options ?? {};

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', '50');

  const queryString = params.toString();
  const path = `/approval-requests${queryString ? `?${queryString}` : ''}`;

  return useQuery<ApprovalRequestsResponse>({
    queryKey: ['approval-requests', status],
    queryFn: () => fetchApi<ApprovalRequestsResponse>(path),
    refetchInterval: sidebarOpen ? 5000 : 30000,
  });
}

/**
 * Get pending approval requests count for the badge
 */
export function usePendingApprovalCount(sidebarOpen: boolean) {
  const { data } = useApprovalRequests({ status: 'pending', sidebarOpen });
  return data?.requests?.length ?? 0;
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Resolve (approve/deny) an approval request
 */
export function useResolveApprovalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      status,
    }: {
      requestId: string;
      status: 'approved' | 'denied';
    }) => {
      return fetchApi<ApprovalRequestResponse>(
        `/approval-requests/${requestId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ status }),
        }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      const label = variables.status === 'approved' ? 'Approved' : 'Denied';
      toast.success(`Request ${label.toLowerCase()}`, {
        description: `The approval request has been ${label.toLowerCase()}.`,
      });
    },
    onError: (error) => {
      toast.error('Failed to resolve request', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Approval Request Notification Watcher
// ============================================================================

/**
 * Hook that watches for new pending approval requests and triggers
 * toast notifications when new ones arrive.
 *
 * Returns the set of known request IDs so we can detect new ones.
 */
export function useApprovalRequestWatcher(options: {
  sidebarOpen: boolean;
  onNewRequest?: (request: ApprovalRequest) => void;
}) {
  const { sidebarOpen, onNewRequest } = options;
  const { data } = useApprovalRequests({ status: 'pending', sidebarOpen });
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!data?.requests) return;

    const currentIds = new Set(data.requests.map((r) => r.id));

    // Skip toast on initial load, just populate known IDs
    if (initialLoadRef.current) {
      knownIdsRef.current = currentIds;
      initialLoadRef.current = false;
      return;
    }

    // Find new requests
    for (const request of data.requests) {
      if (!knownIdsRef.current.has(request.id)) {
        // New request detected — fire callback
        onNewRequest?.(request);
      }
    }

    knownIdsRef.current = currentIds;
  }, [data?.requests, onNewRequest]);

  return data?.requests ?? [];
}
