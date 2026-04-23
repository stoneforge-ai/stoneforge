/**
 * EditorExtensionsPanel - Extensions browser and manager panel
 *
 * A sidebar panel for browsing, searching, installing, and managing
 * OpenVSX extensions. Supports filtering by category and shows
 * installed extensions prominently.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Loader2,
  X,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { VirtualizedList } from '../shared/VirtualizedList';
import { useExtensionManager, type InstalledExtension } from '../../lib/extensions';
import {
  searchExtensions,
  getExtensionMetadata,
  type OpenVSXExtensionSummary,
  type OpenVSXExtension,
} from '../../lib/openvsx/client';
import { ExtensionCard } from './ExtensionCard';

// ============================================================================
// Types
// ============================================================================

export interface EditorExtensionsPanelProps {
  /** Optional class name */
  className?: string;
  /** Handler called when an extension card is clicked (to open detail page) */
  onExtensionClick?: (extension: OpenVSXExtensionSummary) => void;
}

/** Category filter options */
type CategoryFilter = 'All' | 'Themes' | 'Languages' | 'Snippets';

/** Search state */
interface SearchState {
  query: string;
  results: OpenVSXExtensionSummary[];
  isSearching: boolean;
  error: string | null;
  totalSize: number;
}

/** Compatibility cache for extensions */
interface CompatibilityInfo {
  isCompatible: boolean;
  reasons: string[];
  checkedAt: number;
}

/** Item types for the virtualized list */
type ListItem =
  | { type: 'installed-header' }
  | { type: 'installed-card'; ext: InstalledExtension }
  | { type: 'search-card'; ext: OpenVSXExtensionSummary; extId: string; compatibility: CompatibilityInfo | undefined }
  | { type: 'empty-state'; variant: 'no-results' | 'browse' | 'find-more' }
  | { type: 'error'; message: string };

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_MS = 300;
const CATEGORY_MAP: Record<CategoryFilter, string | undefined> = {
  All: undefined,
  Themes: 'Themes',
  Languages: 'Programming Languages',
  Snippets: 'Snippets',
};

// ============================================================================
// EditorExtensionsPanel Component
// ============================================================================

export function EditorExtensionsPanel({ className = '', onExtensionClick }: EditorExtensionsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Extension manager hook
  const { installed, installing, install, uninstall } = useExtensionManager();

  // Local state
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [installedExpanded, setInstalledExpanded] = useState(true);
  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    results: [],
    isSearching: false,
    error: null,
    totalSize: 0,
  });
  const [uninstallingIds, setUninstallingIds] = useState<Set<string>>(new Set());
  const [compatibilityCache, setCompatibilityCache] = useState<Map<string, CompatibilityInfo>>(
    new Map()
  );

  // Search for extensions with debouncing
  const performSearch = useCallback(async (query: string, category: CategoryFilter) => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    // If query is empty, clear results
    if (!query.trim()) {
      setSearchState((prev) => ({
        ...prev,
        query: '',
        results: [],
        isSearching: false,
        error: null,
        totalSize: 0,
      }));
      return;
    }

    // Set searching state immediately
    setSearchState((prev) => ({
      ...prev,
      query,
      isSearching: true,
      error: null,
    }));

    // Debounce the actual search
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const categoryParam = CATEGORY_MAP[category];
        const result = await searchExtensions(query, {
          category: categoryParam,
          size: 50,
          sortBy: 'downloadCount',
          sortOrder: 'desc',
        });

        setSearchState((prev) => ({
          ...prev,
          results: result.extensions,
          isSearching: false,
          totalSize: result.totalSize,
        }));

        // Check compatibility for results
        checkCompatibilityForExtensions(result.extensions);
      } catch (error) {
        setSearchState((prev) => ({
          ...prev,
          results: [],
          isSearching: false,
          error: error instanceof Error ? error.message : 'Search failed',
        }));
      }
    }, DEBOUNCE_MS);
  }, []);

  // Check compatibility for a list of extensions
  const checkCompatibilityForExtensions = useCallback(
    async (extensions: OpenVSXExtensionSummary[]) => {
      // Only check extensions not already in cache (or with stale cache)
      const now = Date.now();
      const toCheck = extensions.filter((ext) => {
        const extId = `${ext.namespace}.${ext.name}`;
        const cached = compatibilityCache.get(extId);
        // Re-check if cache is older than 5 minutes
        return !cached || now - cached.checkedAt > 5 * 60 * 1000;
      });

      if (toCheck.length === 0) return;

      // Fetch full metadata for compatibility checking
      // Do this in batches to avoid too many concurrent requests
      const batchSize = 5;
      for (let i = 0; i < toCheck.length; i += batchSize) {
        const batch = toCheck.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (ext) => {
            const metadata = await getExtensionMetadata(ext.namespace, ext.name);
            return { ext, metadata };
          })
        );

        const newCache = new Map(compatibilityCache);
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { ext, metadata } = result.value;
            const extId = `${ext.namespace}.${ext.name}`;
            const compatibility = checkExtensionCompatibility(metadata);
            newCache.set(extId, {
              isCompatible: compatibility.isCompatible,
              reasons: compatibility.reasons,
              checkedAt: now,
            });
          }
        }
        setCompatibilityCache(newCache);
      }
    },
    [compatibilityCache]
  );

  // Check if an extension is compatible (declarative only)
  const checkExtensionCompatibility = useCallback(
    (metadata: OpenVSXExtension): { isCompatible: boolean; reasons: string[] } => {
      const reasons: string[] = [];

      // We can't fully determine compatibility from OpenVSX metadata alone
      // The full check happens when we parse the VSIX
      // Here we do a quick heuristic check based on categories

      // Check categories for hints
      const categories = metadata.categories || [];
      const lowerCategories = categories.map((c) => c.toLowerCase());

      // Extensions in these categories are likely declarative
      const declarativeCategories = ['themes', 'programming languages', 'snippets', 'language packs'];
      const hasDeclarativeCategory = lowerCategories.some((c) =>
        declarativeCategories.some((dc) => c.includes(dc))
      );

      // Extensions in these categories likely require code execution
      const codeCategories = [
        'debuggers',
        'formatters',
        'linters',
        'testing',
        'notebooks',
        'data science',
        'machine learning',
        'extension packs',
      ];
      const hasCodeCategory = lowerCategories.some((c) =>
        codeCategories.some((cc) => c.includes(cc))
      );

      if (hasCodeCategory && !hasDeclarativeCategory) {
        reasons.push('This extension likely requires code execution');
        return { isCompatible: false, reasons };
      }

      // We'll let the install process do the full compatibility check
      return { isCompatible: true, reasons: [] };
    },
    []
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      performSearch(query, categoryFilter);
    },
    [categoryFilter, performSearch]
  );

  // Handle category filter change
  const handleCategoryChange = useCallback(
    (category: CategoryFilter) => {
      setCategoryFilter(category);
      if (searchState.query) {
        performSearch(searchState.query, category);
      }
    },
    [searchState.query, performSearch]
  );

  // Clear search
  const handleClear = useCallback(() => {
    setSearchState({
      query: '',
      results: [],
      isSearching: false,
      error: null,
      totalSize: 0,
    });
    inputRef.current?.focus();
  }, []);

  // Handle install
  const handleInstall = useCallback(
    async (namespace: string, name: string) => {
      try {
        await install(namespace, name, 'latest');
      } catch (error) {
        console.error('[EditorExtensionsPanel] Install failed:', error);
        // Error is handled by the card, but we could add a toast here
      }
    },
    [install]
  );

  // Handle uninstall
  const handleUninstall = useCallback(
    async (extensionId: string) => {
      setUninstallingIds((prev) => new Set(prev).add(extensionId));
      try {
        await uninstall(extensionId);
      } catch (error) {
        console.error('[EditorExtensionsPanel] Uninstall failed:', error);
      } finally {
        setUninstallingIds((prev) => {
          const next = new Set(prev);
          next.delete(extensionId);
          return next;
        });
      }
    },
    [uninstall]
  );

  // Check if an extension is installed
  const isExtensionInstalled = useCallback(
    (namespace: string, name: string) => {
      const extId = `${namespace}.${name}`;
      // Also check with publisher.name format (extensions use this format)
      return installed.some((ext) => ext.id === extId || ext.id === `${namespace}.${name}`);
    },
    [installed]
  );

  // Get compatibility info for an extension
  const getCompatibilityInfo = useCallback(
    (namespace: string, name: string) => {
      const extId = `${namespace}.${name}`;
      return compatibilityCache.get(extId);
    },
    [compatibilityCache]
  );

  // Derived state
  const hasQuery = searchState.query.trim().length > 0;
  const showResults = hasQuery && searchState.results.length > 0;
  const showNoResults =
    hasQuery && !searchState.isSearching && searchState.results.length === 0 && !searchState.error;
  const showInstalled = installed.length > 0;

  // Filter search results to exclude already installed
  const filteredResults = useMemo(() => {
    return searchState.results.filter(
      (ext) => !isExtensionInstalled(ext.namespace, ext.name)
    );
  }, [searchState.results, isExtensionInstalled]);

  // Build flat list of items for virtualization
  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];

    // Error state
    if (searchState.error) {
      items.push({ type: 'error', message: searchState.error });
    }

    // Installed section header (if there are installed extensions)
    if (showInstalled) {
      items.push({ type: 'installed-header' });

      // Installed extension cards (if expanded)
      if (installedExpanded) {
        for (const ext of installed) {
          items.push({ type: 'installed-card', ext });
        }
      }
    }

    // Search results
    if (showResults) {
      for (const ext of filteredResults) {
        const extId = `${ext.namespace}.${ext.name}`;
        const compatibility = getCompatibilityInfo(ext.namespace, ext.name);
        items.push({ type: 'search-card', ext, extId, compatibility });
      }
    }

    // No results
    if (showNoResults) {
      items.push({ type: 'empty-state', variant: 'no-results' });
    }

    // Empty state - no search and no installed
    if (!hasQuery && !showInstalled && !searchState.isSearching) {
      items.push({ type: 'empty-state', variant: 'browse' });
    }

    // Empty state - no search but has installed (and collapsed)
    if (!hasQuery && showInstalled && !installedExpanded && !searchState.isSearching) {
      items.push({ type: 'empty-state', variant: 'find-more' });
    }

    return items;
  }, [
    searchState.error,
    showInstalled,
    installedExpanded,
    installed,
    showResults,
    filteredResults,
    getCompatibilityInfo,
    showNoResults,
    hasQuery,
    searchState.isSearching,
  ]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${className}`}
      data-testid="editor-extensions-panel"
    >
      {/* Search input area */}
      <div className="flex-shrink-0 p-2 border-b border-[var(--color-border)] space-y-2">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={searchState.query}
            onChange={handleSearchChange}
            placeholder="Search extensions..."
            className="w-full h-7 pl-7 pr-7 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
            data-testid="extensions-search-input"
          />
          {hasQuery && !searchState.isSearching && (
            <button
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              title="Clear search"
              data-testid="extensions-search-clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {searchState.isSearching && (
            <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
          )}
        </div>

        {/* Category filter */}
        <div className="flex gap-1">
          {(['All', 'Themes', 'Languages', 'Snippets'] as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`
                px-2 py-1 text-xs rounded transition-colors
                ${
                  categoryFilter === cat
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }
              `}
              data-testid={`extensions-category-${cat.toLowerCase()}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        {hasQuery && !searchState.isSearching && (
          <div className="text-xs text-[var(--color-text-muted)]">
            {searchState.results.length} of {searchState.totalSize} results
          </div>
        )}
      </div>

      {/* Virtualized content area */}
      <div className="flex-1 overflow-hidden" data-testid="extensions-content">
        <VirtualizedList<ListItem>
          items={listItems}
          getItemKey={(item, index) => {
            switch (item.type) {
              case 'installed-header':
                return 'installed-header';
              case 'installed-card':
                return `installed-${item.ext.id}`;
              case 'search-card':
                return `search-${item.extId}`;
              case 'empty-state':
                return `empty-${item.variant}`;
              case 'error':
                return 'error';
              default:
                return index;
            }
          }}
          estimateSize={80}
          overscan={5}
          height="100%"
          renderItem={(item) => {
            switch (item.type) {
              case 'installed-header':
                return (
                  <div className="border-b border-[var(--color-border)]">
                    <button
                      onClick={() => setInstalledExpanded(!installedExpanded)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors"
                      data-testid="extensions-installed-header"
                    >
                      {installedExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      )}
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                        Installed
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        {installed.length}
                      </span>
                    </button>
                  </div>
                );

              case 'installed-card':
                return (
                  <div data-testid="extensions-installed-list">
                    <ExtensionCard
                      extension={{
                        url: '',
                        name: item.ext.manifest.name,
                        namespace: item.ext.manifest.publisher,
                        version: item.ext.version,
                        displayName: item.ext.manifest.displayName,
                        description: item.ext.manifest.description,
                        files: {},
                      }}
                      isInstalled={true}
                      installedInfo={item.ext}
                      isInstalling={false}
                      isUninstalling={uninstallingIds.has(item.ext.id)}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      onClick={onExtensionClick}
                    />
                  </div>
                );

              case 'search-card':
                return (
                  <div data-testid="extensions-search-results">
                    <ExtensionCard
                      extension={item.ext}
                      isInstalled={false}
                      isInstalling={installing.has(item.extId)}
                      isUninstalling={false}
                      isIncompatible={item.compatibility?.isCompatible === false}
                      incompatibilityReasons={item.compatibility?.reasons}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      onClick={onExtensionClick}
                    />
                  </div>
                );

              case 'empty-state':
                if (item.variant === 'no-results') {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                      <X className="w-8 h-8 text-[var(--color-text-muted)] mb-3" />
                      <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">No Results</h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        No extensions found for "{searchState.query}"
                      </p>
                    </div>
                  );
                }
                if (item.variant === 'browse') {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                      <Package className="w-8 h-8 text-[var(--color-text-muted)] mb-3" />
                      <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">
                        Browse Extensions
                      </h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Search for themes, languages, and snippets
                      </p>
                    </div>
                  );
                }
                if (item.variant === 'find-more') {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                      <Search className="w-8 h-8 text-[var(--color-text-muted)] mb-3" />
                      <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">Find More</h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Search for more extensions above
                      </p>
                    </div>
                  );
                }
                return null;

              case 'error':
                return (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{item.message}</span>
                  </div>
                );

              default:
                return null;
            }
          }}
          renderEmpty={() => (
            <div className="flex flex-col items-center justify-center py-8 text-center px-3">
              <Package className="w-8 h-8 text-[var(--color-text-muted)] mb-3" />
              <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">
                Browse Extensions
              </h4>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Search for themes, languages, and snippets
              </p>
            </div>
          )}
        />
      </div>
    </div>
  );
}

export default EditorExtensionsPanel;
