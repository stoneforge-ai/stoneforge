/**
 * Provider display label utilities
 *
 * Shared mapping from internal provider names to user-facing display labels.
 * Used across pool modals, agent creation dialogs, and settings page.
 */

/** Maps internal provider name → display label for UI rendering */
export const PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
};

/**
 * Get the display label for a provider name.
 * Falls back to the raw name if no label is defined.
 */
export function getProviderLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? name;
}
