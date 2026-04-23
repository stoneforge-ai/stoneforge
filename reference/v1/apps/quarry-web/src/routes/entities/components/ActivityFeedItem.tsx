/**
 * ActivityFeedItem - Enhanced activity feed item for entity activity overview
 * Shows recent events with icons, descriptions, and timestamps
 */

import {
  CheckCircle,
  Plus,
  X,
  ListTodo,
  MessageSquare,
  FileText,
  User,
  Users,
  Activity,
} from 'lucide-react';
import type { StoneforgeEvent } from '../types';

interface ActivityFeedItemProps {
  event: StoneforgeEvent;
}

export function ActivityFeedItem({ event }: ActivityFeedItemProps) {
  // Get appropriate icon based on event type and element type
  const getEventIcon = () => {
    const elementType = event.elementType || '';

    // Event-specific icons take precedence for certain actions
    switch (event.eventType) {
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'created':
        return <Plus className="w-4 h-4 text-green-500" />;
      case 'deleted':
        return <X className="w-4 h-4 text-red-500" />;
      case 'updated':
        break;
      default:
        break;
    }

    // Element type specific icons
    switch (elementType) {
      case 'task':
        return <ListTodo className="w-4 h-4 text-blue-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'document':
        return <FileText className="w-4 h-4 text-yellow-600" />;
      case 'entity':
        return <User className="w-4 h-4 text-gray-500" />;
      case 'team':
        return <Users className="w-4 h-4 text-indigo-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  // Get icon background color
  const getIconBg = () => {
    switch (event.eventType) {
      case 'closed':
        return 'bg-green-100';
      case 'created':
        return 'bg-green-100';
      case 'deleted':
        return 'bg-red-100';
      default:
        break;
    }

    const elementType = event.elementType || '';
    switch (elementType) {
      case 'task':
        return 'bg-blue-100';
      case 'message':
        return 'bg-purple-100';
      case 'document':
        return 'bg-yellow-100';
      case 'entity':
        return 'bg-gray-100';
      case 'team':
        return 'bg-indigo-100';
      default:
        return 'bg-gray-100';
    }
  };

  // Generate human-readable description
  const getDescription = () => {
    const elementType = event.elementType || 'item';
    const eventType = event.eventType;

    // Special case handling for common patterns
    if (eventType === 'closed' && elementType === 'task') {
      return 'Completed task';
    }
    if (eventType === 'created' && elementType === 'message') {
      return 'Sent message';
    }
    if (eventType === 'updated' && elementType === 'document') {
      return 'Edited document';
    }
    if (eventType === 'created' && elementType === 'task') {
      return 'Created task';
    }
    if (eventType === 'created' && elementType === 'document') {
      return 'Created document';
    }

    // Default pattern: "Event type + element type"
    const action = eventType.replace(/_/g, ' ');
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${elementType}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex items-start gap-3 py-2.5" data-testid={`activity-item-${event.id}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getIconBg()}`}>
        {getEventIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          {getDescription()}
        </p>
        <p className="text-xs text-gray-500 font-mono truncate">{event.elementId}</p>
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">{formatTime(event.createdAt)}</span>
    </div>
  );
}
