/**
 * Constants for the Dashboard page
 * Icon mappings and static configuration values
 */

import {
  Plus,
  Activity,
  AlertCircle,
  ListTodo,
  Users,
  FileText,
  MessageSquare,
} from 'lucide-react';

/**
 * Icon mappings for event types in the activity feed
 */
export const EVENT_TYPE_ICONS: Record<string, typeof Activity> = {
  created: Plus,
  updated: Activity,
  deleted: AlertCircle,
};

/**
 * Icon mappings for element types
 */
export const ELEMENT_TYPE_ICONS: Record<string, typeof Activity> = {
  task: ListTodo,
  entity: Users,
  document: FileText,
  message: MessageSquare,
};
