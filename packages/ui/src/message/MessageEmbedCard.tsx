/**
 * MessageEmbedCard - Renders inline embed cards for tasks and documents in messages
 *
 * Used to display rich previews when tasks or documents are referenced
 * using the ![[task:id]] or ![[doc:id]] syntax.
 *
 * TB128 Implementation
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CheckSquare,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  CircleDashed,
  Ban,
  CircleX,
} from 'lucide-react';

// Task status icons and colors
const STATUS_CONFIG: Record<string, { icon: React.ReactNode; className: string }> = {
  open: {
    icon: <CircleDashed className="w-3 h-3" />,
    className: 'text-gray-500 bg-gray-100',
  },
  in_progress: {
    icon: <Clock className="w-3 h-3" />,
    className: 'text-blue-600 bg-blue-100',
  },
  blocked: {
    icon: <Ban className="w-3 h-3" />,
    className: 'text-red-600 bg-red-100',
  },
  closed: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: 'text-green-600 bg-green-100',
  },
  cancelled: {
    icon: <CircleX className="w-3 h-3" />,
    className: 'text-gray-400 bg-gray-100',
  },
};

// Priority colors
const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-200 text-gray-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-orange-100 text-orange-700',
  5: 'bg-red-100 text-red-700',
};

interface TaskEmbedCardProps {
  taskId: string;
}

export function TaskEmbedCard({ taskId }: TaskEmbedCardProps) {
  const { data: task, isLoading, isError } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) throw new Error('Task not found');
      return response.json();
    },
    staleTime: 30000, // Cache for 30 seconds
    retry: false,
  });

  if (isLoading) {
    return (
      <div
        data-testid={`task-embed-${taskId}`}
        className="inline-flex items-center gap-2 px-2 py-1 bg-gray-100 rounded border border-gray-200 text-sm"
      >
        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
        <span className="text-gray-500">Loading task...</span>
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div
        data-testid={`task-embed-${taskId}`}
        className="inline-flex items-center gap-2 px-2 py-1 bg-red-50 rounded border border-red-200 text-sm"
      >
        <AlertCircle className="w-3 h-3 text-red-500" />
        <span className="text-red-600">Task not found: {taskId}</span>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.open;
  const priorityClass = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  return (
    <Link
      to="/tasks"
      search={{ selected: taskId, page: 1, limit: 25 } as any}
      data-testid={`task-embed-${taskId}`}
      className="inline-flex items-center gap-2 px-2 py-1 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-colors text-sm group max-w-[400px]"
    >
      <CheckSquare className="w-4 h-4 text-gray-500 flex-shrink-0" />

      {/* Status badge */}
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${statusConfig.className}`}
      >
        {statusConfig.icon}
        <span className="capitalize">{task.status.replace('_', ' ')}</span>
      </span>

      {/* Task title */}
      <span className="truncate text-gray-900 group-hover:text-blue-600 transition-colors">
        {task.title}
      </span>

      {/* Priority badge */}
      {task.priority && (
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityClass} flex-shrink-0`}>
          P{task.priority}
        </span>
      )}

      {/* Assignee (if any) */}
      {task.assignee && (
        <span className="text-xs text-gray-500 truncate max-w-[80px]" title={task.assignee}>
          @{task.assignee.split('-')[0]}
        </span>
      )}
    </Link>
  );
}

interface DocumentEmbedCardProps {
  documentId: string;
}

export function DocumentEmbedCard({ documentId }: DocumentEmbedCardProps) {
  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) throw new Error('Document not found');
      return response.json();
    },
    staleTime: 30000, // Cache for 30 seconds
    retry: false,
  });

  if (isLoading) {
    return (
      <div
        data-testid={`doc-embed-${documentId}`}
        className="inline-flex items-center gap-2 px-2 py-1 bg-gray-100 rounded border border-gray-200 text-sm"
      >
        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
        <span className="text-gray-500">Loading document...</span>
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div
        data-testid={`doc-embed-${documentId}`}
        className="inline-flex items-center gap-2 px-2 py-1 bg-red-50 rounded border border-red-200 text-sm"
      >
        <AlertCircle className="w-3 h-3 text-red-500" />
        <span className="text-red-600">Document not found: {documentId}</span>
      </div>
    );
  }

  // Get first line preview
  const contentPreview = doc._content
    ? doc._content.split('\n')[0].slice(0, 100)
    : null;

  return (
    <Link
      to="/documents"
      search={{ selected: documentId, library: undefined } as any}
      data-testid={`doc-embed-${documentId}`}
      className="inline-flex items-center gap-2 px-2 py-1 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-colors text-sm group max-w-[400px]"
    >
      <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />

      {/* Content type badge */}
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
        {doc.contentType || 'text'}
      </span>

      {/* Document title */}
      <span className="truncate text-gray-900 group-hover:text-blue-600 transition-colors">
        {doc.title}
      </span>

      {/* Content preview */}
      {contentPreview && (
        <span className="text-xs text-gray-400 truncate max-w-[150px]" title={contentPreview}>
          {contentPreview}
        </span>
      )}
    </Link>
  );
}

// Export a combined component that can render either type
interface MessageEmbedCardProps {
  type: 'task' | 'doc';
  id: string;
}

export function MessageEmbedCard({ type, id }: MessageEmbedCardProps) {
  if (type === 'task') {
    return <TaskEmbedCard taskId={id} />;
  }
  return <DocumentEmbedCard documentId={id} />;
}

export default MessageEmbedCard;
