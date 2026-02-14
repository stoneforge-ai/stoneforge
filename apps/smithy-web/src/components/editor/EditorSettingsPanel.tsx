/**
 * EditorSettingsPanel - Settings panel for the file editor
 *
 * A sidebar panel that allows users to configure editor settings.
 * Currently supports:
 * - Theme selection (Monaco editor themes)
 * - Installed theme extensions from OpenVSX
 *
 * Designed to accommodate more settings in the future.
 */

import { useState, useEffect, useCallback } from 'react';
import { Palette } from 'lucide-react';
import { getRegisteredExtensions } from '../../lib/extensions/registry';

// ============================================================================
// Types
// ============================================================================

export interface EditorSettingsPanelProps {
  /** Current editor theme */
  theme: string;
  /** Callback when theme changes */
  onThemeChange: (theme: string) => void;
}

// ============================================================================
// Available themes
// ============================================================================

/** Built-in themes that are always available */
const BUILTIN_THEMES = [
  { id: 'stoneforge-dark', name: 'Stoneforge Dark' },
  { id: 'vs-dark', name: 'Dark (VS Code)' },
  { id: 'vs', name: 'Light (VS Code)' },
  { id: 'hc-black', name: 'High Contrast Dark' },
  { id: 'hc-light', name: 'High Contrast Light' },
] as const;

/** Default fallback theme when a selected theme is no longer available */
const DEFAULT_THEME = 'stoneforge-dark';

/** Theme from an installed extension */
interface InstalledTheme {
  /** Theme ID used by Monaco (extension-contributed theme ID) */
  id: string;
  /** Display name from the theme contribution */
  name: string;
  /** Extension publisher (for disambiguation) */
  publisher: string;
  /** Extension name */
  extensionName: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract theme contributions from registered extensions.
 * Returns an array of themes that can be selected in the UI.
 */
function getInstalledThemes(): InstalledTheme[] {
  const extensions = getRegisteredExtensions();
  const themes: InstalledTheme[] = [];

  for (const ext of extensions) {
    const contributes = ext.manifest.contributes;
    if (!contributes?.themes) continue;

    for (const themeContrib of contributes.themes) {
      // Theme IDs in Monaco are typically the label or a generated ID
      // For extension-contributed themes, Monaco uses the extension ID + theme label
      themes.push({
        id: themeContrib.label,
        name: themeContrib.label,
        publisher: ext.manifest.publisher,
        extensionName: ext.manifest.displayName || ext.manifest.name,
      });
    }
  }

  return themes;
}

/**
 * Check if a theme ID is available (either built-in or installed).
 */
function isThemeAvailable(themeId: string, installedThemes: InstalledTheme[]): boolean {
  const isBuiltin = BUILTIN_THEMES.some((t) => t.id === themeId);
  if (isBuiltin) return true;
  return installedThemes.some((t) => t.id === themeId);
}

// ============================================================================
// Main Component
// ============================================================================

export function EditorSettingsPanel({ theme, onThemeChange }: EditorSettingsPanelProps) {
  // State for installed themes from extensions
  const [installedThemes, setInstalledThemes] = useState<InstalledTheme[]>([]);

  // Load installed themes from the extension registry
  const refreshInstalledThemes = useCallback(() => {
    const themes = getInstalledThemes();
    setInstalledThemes(themes);
    return themes;
  }, []);

  // Load themes on mount and periodically check for changes
  useEffect(() => {
    const themes = refreshInstalledThemes();

    // Check if current theme is still available; fall back if not
    if (!isThemeAvailable(theme, themes)) {
      console.log(
        `[EditorSettingsPanel] Theme "${theme}" is no longer available, falling back to ${DEFAULT_THEME}`
      );
      onThemeChange(DEFAULT_THEME);
    }

    // Poll for extension changes (extensions can be installed/uninstalled at runtime)
    const intervalId = setInterval(() => {
      const updatedThemes = refreshInstalledThemes();
      // Check if current theme was uninstalled
      if (!isThemeAvailable(theme, updatedThemes)) {
        console.log(
          `[EditorSettingsPanel] Theme "${theme}" was uninstalled, falling back to ${DEFAULT_THEME}`
        );
        onThemeChange(DEFAULT_THEME);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [theme, onThemeChange, refreshInstalledThemes]);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      data-testid="editor-settings-panel"
    >
      {/* Appearance Section */}
      <div className="p-3 space-y-3">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--color-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Appearance
          </h3>
        </div>

        {/* Theme selector */}
        <div className="space-y-1.5">
          <label
            htmlFor="editor-theme"
            className="text-sm font-medium text-[var(--color-text)]"
          >
            Theme
          </label>
          <select
            id="editor-theme"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            className="
              w-full px-3 py-2
              text-sm
              bg-[var(--color-surface)]
              border border-[var(--color-border)]
              rounded-lg
              text-[var(--color-text)]
              focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
            "
            data-testid="editor-theme-select"
          >
            {/* Built-in themes */}
            <optgroup label="Built-in">
              {BUILTIN_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>

            {/* Installed themes from extensions */}
            {installedThemes.length > 0 && (
              <optgroup label="Installed">
                {installedThemes.map((t) => (
                  <option key={`${t.publisher}.${t.id}`} value={t.id}>
                    {t.name} ({t.extensionName})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Choose the color theme for the editor.
          </p>
        </div>
      </div>
    </div>
  );
}

export default EditorSettingsPanel;
