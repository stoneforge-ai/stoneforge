/**
 * @stoneforge/ui Plans Constants
 *
 * Status configurations, colors, and storage keys for plan components.
 */

import React from 'react';
import {
  FileEdit,
  CircleDot,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ============================================================================
// Status Configuration
// ============================================================================

export interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: {
    label: 'Draft',
    icon: React.createElement(FileEdit, { className: 'w-4 h-4' }),
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  active: {
    label: 'Active',
    icon: React.createElement(CircleDot, { className: 'w-4 h-4' }),
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: React.createElement(CheckCircle2, { className: 'w-4 h-4' }),
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: React.createElement(XCircle, { className: 'w-4 h-4' }),
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
};

// Status colors for roadmap bars
export const STATUS_BAR_COLORS: Record<string, string> = {
  draft: '#9ca3af',     // gray-400
  active: '#3b82f6',    // blue-500
  completed: '#22c55e', // green-500
  cancelled: '#ef4444', // red-500
};

// ============================================================================
// Priority Colors
// ============================================================================

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-200',
  2: 'bg-blue-200',
  3: 'bg-yellow-200',
  4: 'bg-orange-200',
  5: 'bg-red-200',
};

// ============================================================================
// Search Configuration
// ============================================================================

export const SEARCH_STORAGE_KEY = 'plans.search';
export const VIEW_MODE_STORAGE_KEY = 'plans.viewMode';
export const SEARCH_DEBOUNCE_DELAY = 300;
