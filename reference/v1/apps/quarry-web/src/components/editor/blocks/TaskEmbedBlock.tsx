/**
 * TaskEmbedBlock - Custom Tiptap node for embedding tasks in documents
 *
 * Renders as an inline reference to a task with status badge
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Circle, Clock, AlertCircle, Loader2 } from 'lucide-react';

// Task type for the embedded view
interface EmbeddedTask {
  id: string;
  title: string;
  status: string;
  priority?: number;
}

// Status icon mapping
const statusIcons: Record<string, React.ReactNode> = {
  open: <Circle className="w-4 h-4 text-gray-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  blocked: <AlertCircle className="w-4 h-4 text-red-500" />,
  completed: <CheckCircle className="w-4 h-4 text-green-500" />,
  cancelled: <CheckCircle className="w-4 h-4 text-gray-400" />,
};

// Status colors for badges
const statusColors: Record<string, string> = {
  open: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function TaskEmbedComponent({ node }: NodeViewProps) {
  const taskId = node.attrs.taskId as string;

  const { data: task, isLoading, isError } = useQuery<EmbeddedTask>({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) throw new Error('Task not found');
      return response.json();
    },
    enabled: !!taskId,
  });

  if (isLoading) {
    return (
      <NodeViewWrapper className="inline-flex">
        <span
          data-testid={`task-embed-loading-${taskId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-sm"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading task...
        </span>
      </NodeViewWrapper>
    );
  }

  if (isError || !task) {
    return (
      <NodeViewWrapper className="inline-flex">
        <span
          data-testid={`task-embed-error-${taskId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded text-sm"
        >
          <AlertCircle className="w-3 h-3" />
          Task not found
        </span>
      </NodeViewWrapper>
    );
  }

  const statusIcon = statusIcons[task.status] || statusIcons.open;
  const statusColor = statusColors[task.status] || statusColors.open;

  return (
    <NodeViewWrapper className="inline-flex">
      <a
        href={`/tasks/${task.id}`}
        data-testid={`task-embed-${taskId}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-medium hover:opacity-80 transition-opacity ${statusColor}`}
      >
        {statusIcon}
        <span className="truncate max-w-[200px]">{task.title}</span>
      </a>
    </NodeViewWrapper>
  );
}

// Create the Tiptap extension
export const TaskEmbedBlock = Node.create({
  name: 'taskEmbed',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      taskId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        // Parse the custom tag format
        tag: 'task-embed',
      },
      {
        // Parse the div format from Markdown conversion
        tag: 'div[data-type="taskEmbed"]',
        getAttrs: (node: HTMLElement) => ({
          taskId: node.getAttribute('data-task-id'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Render as div with data attributes for Markdown conversion compatibility
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'taskEmbed',
        'data-task-id': HTMLAttributes.taskId,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskEmbedComponent);
  },
});

export default TaskEmbedBlock;
