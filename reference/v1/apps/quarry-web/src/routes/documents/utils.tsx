/**
 * Utility functions for the Documents page
 */

import type { LibraryType, LibraryTreeNode, FlatLibraryItem } from './types';

/**
 * Build a tree structure from a flat list of libraries
 */
export function buildLibraryTree(libraries: LibraryType[]): LibraryTreeNode[] {
  const nodeMap = new Map<string, LibraryTreeNode>();
  const roots: LibraryTreeNode[] = [];

  // First pass: create nodes
  for (const library of libraries) {
    nodeMap.set(library.id, { ...library, children: [] });
  }

  // Second pass: build tree
  for (const library of libraries) {
    const node = nodeMap.get(library.id)!;
    if (library.parentId && nodeMap.has(library.parentId)) {
      // Add to parent's children
      nodeMap.get(library.parentId)!.children.push(node);
    } else {
      // Root level library
      roots.push(node);
    }
  }

  // Sort children alphabetically at each level
  const sortChildren = (nodes: LibraryTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

/**
 * Flatten a library tree for virtualization
 * Returns only the visible items based on which nodes are expanded.
 */
export function flattenLibraryTree(
  nodes: LibraryTreeNode[],
  expandedIds: Set<string>,
  level = 0
): FlatLibraryItem[] {
  const result: FlatLibraryItem[] = [];

  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    result.push({
      node,
      level,
      hasChildren,
      isExpanded,
    });

    // Only include children if this node is expanded
    if (hasChildren && isExpanded) {
      result.push(...flattenLibraryTree(node.children, expandedIds, level + 1));
    }
  }

  return result;
}

/**
 * Format a date string to a locale-specific format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date string to a relative time format
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

/**
 * Highlights search query matches in text
 */
export function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text;

  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
        {text.slice(matchIndex, matchIndex + query.length)}
      </mark>
      {text.slice(matchIndex + query.length)}
    </>
  );
}
