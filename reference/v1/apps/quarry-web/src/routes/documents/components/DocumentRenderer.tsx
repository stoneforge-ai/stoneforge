/**
 * DocumentRenderer - Renders document content based on contentType
 */

import { markdownToHtml, isHtmlContent } from '../../../lib/markdown';

interface DocumentRendererProps {
  content: string;
  contentType: string;
}

export function DocumentRenderer({ content, contentType }: DocumentRendererProps) {
  if (!content) {
    return (
      <div data-testid="document-content-empty" className="text-gray-400 italic">
        No content
      </div>
    );
  }

  switch (contentType) {
    case 'json':
      // Pretty-print JSON with syntax highlighting colors
      try {
        const formatted = JSON.stringify(JSON.parse(content), null, 2);
        return (
          <pre
            data-testid="document-content-json"
            className="whitespace-pre-wrap font-mono text-sm bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto"
          >
            <code>{formatted}</code>
          </pre>
        );
      } catch {
        return (
          <pre
            data-testid="document-content-json"
            className="whitespace-pre-wrap font-mono text-sm bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto"
          >
            <code>{content}</code>
          </pre>
        );
      }

    case 'markdown':
    case 'text':
    default: {
      // Check if content is already HTML (legacy content from old BlockEditor)
      if (isHtmlContent(content)) {
        return (
          <div
            data-testid="document-content-html"
            className="prose prose-sm max-w-none text-gray-700
                       prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
                       prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                       prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                       prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic
                       prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
                       prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                       [&_mark]:bg-yellow-200 [&_mark]:px-0.5"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        );
      }

      // Content is Markdown - convert to HTML for rendering
      const html = markdownToHtml(content);
      return (
        <div
          data-testid="document-content-markdown"
          className="prose prose-sm max-w-none text-gray-700
                     prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
                     prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                     prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                     prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic
                     prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
                     prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                     [&_mark]:bg-yellow-200 [&_mark]:px-0.5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
  }
}
