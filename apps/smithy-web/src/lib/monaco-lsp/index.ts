/**
 * Monaco Language Support
 *
 * Provides language detection utilities and LSP client management for Monaco editor.
 * LSP support is provided via WebSocket connections to language servers running
 * on the orchestrator-server.
 */

// Language detection utilities
export {
  SUPPORTED_LSP_LANGUAGES,
  POTENTIAL_LSP_LANGUAGES,
  ALWAYS_AVAILABLE_LANGUAGES,
  isLspSupportedLanguage,
  isPotentialLspLanguage,
  getLanguageIdForExtension,
  getExtensionFromFilename,
  type SupportedLspLanguage,
  type PotentialLspLanguage,
} from './languages';

// LSP client management
export {
  fetchLspStatus,
  isLspAvailableForLanguage,
  connectLsp,
  disconnectLsp,
  disconnectAllLsp,
  getLspConnectionState,
  getConnectedLanguages,
  getActiveClient,
  clearLspStatusCache,
  subscribeToConnectionState,
  type LspServerStatus,
  type LspStatusResponse,
  type ConnectionStateChangeCallback,
} from './lsp-client';

// Lightweight LSP client (for direct usage)
export { LightweightLspClient, type LightweightClientOptions } from './lightweight-client';

// React hook for LSP management
export { useLsp, type LspState } from './use-lsp';
