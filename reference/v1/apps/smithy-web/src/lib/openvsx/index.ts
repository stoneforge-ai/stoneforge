/**
 * OpenVSX Extension Support
 *
 * This module provides utilities for working with VS Code extensions from OpenVSX:
 * - API client for searching and downloading extensions
 * - VSIX file parsing (extracting manifest and contributed files)
 * - Compatibility filtering (ensuring extensions are declarative-only)
 * - Extension storage for IndexedDB persistence
 */

// API Client
export {
  // Functions
  searchExtensions,
  getExtensionMetadata,
  downloadVsix,
  // Error class
  OpenVSXError,
  // Types
  type OpenVSXSearchResult,
  type OpenVSXExtension,
  type OpenVSXExtensionSummary,
  type OpenVSXPublisher,
  type OpenVSXFiles,
  type OpenVSXApiError,
  type SearchExtensionsOptions,
} from './client';

// VSIX Parser
export {
  // Types
  type ExtensionManifest,
  type ExtensionContributes,
  type ThemeContribution,
  type GrammarContribution,
  type LanguageContribution,
  type SnippetContribution,
  type IconThemeContribution,
  type ProductIconThemeContribution,
  type ParsedExtension,
  type CompatibilityResult,
  type SupportedContributeKey,
  // Constants
  SUPPORTED_CONTRIBUTES_KEYS,
  UNSUPPORTED_CONTRIBUTES_KEYS,
  // Functions
  parseVsix,
  isDeclarativeExtension,
  getExtensionId,
  getExtensionDisplayName,
} from './vsix-parser';
