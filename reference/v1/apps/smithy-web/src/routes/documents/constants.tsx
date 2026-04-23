/**
 * Constants for the Documents page
 */

import { FileType, Hash, Code } from 'lucide-react';

export const SEARCH_DEBOUNCE_DELAY = 300;
export const DEFAULT_PAGE_SIZE = 25;
export const DOCUMENT_ITEM_HEIGHT = 64;
export const LIBRARY_ITEM_HEIGHT = 36;

export const CONTENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  text: { label: 'Plain Text', icon: <FileType className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
  markdown: { label: 'Markdown', icon: <Hash className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
  json: { label: 'JSON', icon: <Code className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
};
