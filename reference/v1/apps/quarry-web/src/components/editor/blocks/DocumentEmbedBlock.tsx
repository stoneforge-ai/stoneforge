/**
 * DocumentEmbedBlock - Custom Tiptap node for embedding documents in documents
 *
 * Renders as an inline reference to a document with type badge
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileCode, Hash, AlertCircle, Loader2 } from 'lucide-react';

// Document type for the embedded view
interface EmbeddedDocument {
  id: string;
  title?: string;
  contentType: string;
}

// Content type icon mapping
const contentTypeIcons: Record<string, React.ReactNode> = {
  text: <FileText className="w-4 h-4" />,
  markdown: <Hash className="w-4 h-4" />,
  json: <FileCode className="w-4 h-4" />,
};

// Content type colors
const contentTypeColors: Record<string, string> = {
  text: 'bg-gray-100 text-gray-700',
  markdown: 'bg-purple-100 text-purple-700',
  json: 'bg-blue-100 text-blue-700',
};

function DocumentEmbedComponent({ node }: NodeViewProps) {
  const documentId = node.attrs.documentId as string;

  const { data: doc, isLoading, isError } = useQuery<EmbeddedDocument>({
    queryKey: ['documents', documentId],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) throw new Error('Document not found');
      return response.json();
    },
    enabled: !!documentId,
  });

  if (isLoading) {
    return (
      <NodeViewWrapper className="inline-flex">
        <span
          data-testid={`doc-embed-loading-${documentId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-sm"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading document...
        </span>
      </NodeViewWrapper>
    );
  }

  if (isError || !doc) {
    return (
      <NodeViewWrapper className="inline-flex">
        <span
          data-testid={`doc-embed-error-${documentId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded text-sm"
        >
          <AlertCircle className="w-3 h-3" />
          Document not found
        </span>
      </NodeViewWrapper>
    );
  }

  const icon = contentTypeIcons[doc.contentType] || contentTypeIcons.text;
  const color = contentTypeColors[doc.contentType] || contentTypeColors.text;
  const title = doc.title || `Document ${doc.id}`;

  return (
    <NodeViewWrapper className="inline-flex">
      <a
        href={`/documents/${doc.id}`}
        data-testid={`doc-embed-${documentId}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-medium hover:opacity-80 transition-opacity ${color}`}
      >
        {icon}
        <span className="truncate max-w-[200px]">{title}</span>
      </a>
    </NodeViewWrapper>
  );
}

// Create the Tiptap extension
export const DocumentEmbedBlock = Node.create({
  name: 'documentEmbed',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      documentId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        // Parse the custom tag format
        tag: 'document-embed',
      },
      {
        // Parse the div format from Markdown conversion
        tag: 'div[data-type="documentEmbed"]',
        getAttrs: (node: HTMLElement) => ({
          documentId: node.getAttribute('data-document-id'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Render as div with data attributes for Markdown conversion compatibility
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'documentEmbed',
        'data-document-id': HTMLAttributes.documentId,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentEmbedComponent);
  },
});

export default DocumentEmbedBlock;
