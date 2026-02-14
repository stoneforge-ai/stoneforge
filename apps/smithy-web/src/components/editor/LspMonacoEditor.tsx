/**
 * LspMonacoEditor - Monaco Editor Component with LSP Support
 *
 * A React component that wraps Monaco editor using the direct Monaco API.
 * Provides:
 * - Syntax highlighting via Monaco's built-in language support
 * - LSP features via WebSocket connection to server-side language servers
 * - Custom stoneforge-dark theme (from monaco-init.ts)
 * - Read-only mode support
 * - Responsive input handling
 * - URI-based models for tab switching (preserves undo history)
 */

import { useState, memo, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { getKeyboardManager } from '@stoneforge/ui';
import { useLsp, isPotentialLspLanguage, getActiveClient, type LspState } from '../../lib/monaco-lsp';
import { isMonacoInitialized } from '../../lib/monaco-init';

/**
 * TypeScript/JavaScript language IDs that use Monaco's built-in TS worker
 */
const TS_JS_LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

/**
 * Default mode configuration for Monaco's built-in TS/JS features
 */
const DEFAULT_TS_MODE_CONFIG = {
  completionItems: true,
  hovers: true,
  diagnostics: true,
  definitions: true,
  references: true,
  documentHighlights: true,
  rename: true,
  codeActions: true,
  signatureHelp: true,
  selectionRanges: true,
  foldingRanges: true,
};

/**
 * Disabled mode configuration when LSP is connected
 * Keeps editor UX features (folding, selection ranges) but disables intellisense features
 */
const DISABLED_TS_MODE_CONFIG = {
  completionItems: false,
  hovers: false,
  diagnostics: false,
  definitions: false,
  references: false,
  documentHighlights: false,
  rename: false,
  codeActions: false,
  signatureHelp: false,
  selectionRanges: true,
  foldingRanges: true,
};

interface LspMonacoEditorProps {
  /** Editor content */
  value: string;
  /** Language ID (e.g., 'typescript', 'javascript') */
  language: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Callback when content changes. Passes the current model's alternative version ID for tracking unsaved changes. */
  onChange?: (versionId?: number) => void;
  /** Callback when editor mounts. Passes the initial version ID for savedVersionId tracking. */
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void;
  /** Callback when the editor model is ready. Passes the initial version ID for savedVersionId tracking. */
  onReady?: (versionId: number) => void;
  /** Custom theme name */
  theme?: string;
  /** Additional CSS class for container */
  className?: string;
  /** File path or URI for LSP workspace resolution */
  filePath?: string;
  /** Callback when LSP state changes */
  onLspStateChange?: (state: LspState) => void;
}

/**
 * Editor options that are shared across all editor instances
 */
const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: {
    enabled: true,
    scale: 1,
    showSlider: 'mouseover',
    renderCharacters: false,
  },
  fontSize: 14,
  fontFamily: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
  fontLigatures: true,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  padding: { top: 16, bottom: 16 },
  // Enhanced syntax highlighting
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
    highlightActiveIndentation: true,
  },
  // Smooth scrolling and cursor
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  // Code folding
  folding: true,
  foldingStrategy: 'indentation',
  showFoldingControls: 'mouseover',
  // Hover and suggestions (enabled for all editable files)
  hover: { enabled: true, delay: 300 },
  // Selection highlighting
  occurrencesHighlight: 'singleFile',
  selectionHighlight: true,
  // IntelliSense
  suggest: {
    showMethods: true,
    showFunctions: true,
    showConstructors: true,
    showFields: true,
    showVariables: true,
    showClasses: true,
    showStructs: true,
    showInterfaces: true,
    showModules: true,
    showProperties: true,
    showEvents: true,
    showOperators: true,
    showUnits: true,
    showValues: true,
    showConstants: true,
    showEnums: true,
    showEnumMembers: true,
    showKeywords: true,
    showWords: true,
    showColors: true,
    showFiles: true,
    showReferences: true,
    showFolders: true,
    showTypeParameters: true,
    showSnippets: true,
  },
};

/**
 * Get or create a Monaco model for a file path
 */
function getOrCreateModel(
  filePath: string | undefined,
  content: string,
  language: string
): monaco.editor.ITextModel {
  // Create a file:// URI for the model
  const uriString = filePath ? `file:///${filePath.replace(/^\//, '')}` : `inmemory://model/${Date.now()}`;
  const uri = monaco.Uri.parse(uriString);

  // Check if model already exists
  let model = monaco.editor.getModel(uri);
  if (!model) {
    model = monaco.editor.createModel(content, language, uri);
  }

  return model;
}

/**
 * Monaco editor component with LSP support
 */
function LspMonacoEditorComponent({
  value,
  language,
  readOnly = false,
  onChange,
  onMount,
  onReady,
  theme = 'stoneforge-dark',
  className = '',
  filePath,
  onLspStateChange,
}: LspMonacoEditorProps) {
  // Monaco should already be initialized by FileEditorPage before this component mounts.
  // Verify initialization state for defensive coding.
  const [error] = useState<string | null>(() => {
    if (!isMonacoInitialized()) {
      console.error('[LspMonacoEditor] Monaco not initialized! FileEditorPage should call initializeMonaco() first.');
      return 'Editor not initialized. Please refresh the page.';
    }
    return null;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const didOpenSentRef = useRef(false);

  // Track the previous value prop to detect external changes (tab switches, file reloads)
  // without interfering with the user's typing
  const prevValuePropRef = useRef(value);
  // Track previous filePath for didClose/didOpen lifecycle on tab switches
  const prevFilePathRef = useRef<string | undefined>(filePath);
  // Current filePath ref for use in closures that outlive prop changes
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  // Track previous language for model updates
  const prevLanguageRef = useRef(language);
  // Debounce timer for LSP didChange notifications
  const lspChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Disposables for editor subscriptions (content change, focus/blur)
  const editorDisposablesRef = useRef<monaco.IDisposable[]>([]);
  // Suppress onChange calls during model switching to prevent false hasUnsavedChanges
  // Only suppresses the onChange callback to parent — LSP notifications are still sent
  const suppressChangeRef = useRef(false);

  // Use LSP hook for language server connection
  // Monaco is guaranteed to be initialized by the parent (FileEditorPage)
  const { state: lspState } = useLsp({
    monaco: error ? undefined : monaco,
    language,
    documentUri: filePath ? `file://${filePath}` : undefined,
    autoConnect: isPotentialLspLanguage(language) && !readOnly,
  });

  // Create editor once container is available (Monaco is already initialized by parent)
  useEffect(() => {
    if (error || !containerRef.current || editorRef.current) {
      return;
    }

    // Get or create model for this file
    const model = getOrCreateModel(filePath, value, language);

    // Create editor with options
    const editor = monaco.editor.create(containerRef.current, {
      ...EDITOR_OPTIONS,
      model,
      theme,
      readOnly,
      quickSuggestions: !readOnly,
      suggestOnTriggerCharacters: !readOnly,
      parameterHints: { enabled: !readOnly },
    });

    editorRef.current = editor;
    didOpenSentRef.current = false;
    prevValuePropRef.current = value;

    // Set up content change listener
    const contentDisposable = editor.onDidChangeModelContent(() => {
      // Skip onChange to parent during model switching to prevent false hasUnsavedChanges.
      // LSP notifications below are NOT suppressed — only the parent onChange callback.
      if (!suppressChangeRef.current) {
        // Pass the current version ID for hasUnsavedChanges tracking
        const versionId = editor.getModel()?.getAlternativeVersionId();
        onChange?.(versionId);
      }

      // Debounce LSP didChange — only read model value when the timer fires
      if (didOpenSentRef.current) {
        if (lspChangeTimerRef.current) {
          clearTimeout(lspChangeTimerRef.current);
        }
        lspChangeTimerRef.current = setTimeout(() => {
          const client = getActiveClient(language);
          if (client) {
            const m = editor.getModel();
            if (m) {
              const currentPath = filePathRef.current;
              const uri = currentPath ? client.resolveDocumentUri(currentPath) : m.uri.toString();
              client.sendDidChange(uri, m.getValue());
            }
          }
        }, 200);
      }
    });

    // Disable global keyboard shortcuts when editor is focused
    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      getKeyboardManager().setEnabled(false);
    });
    const blurDisposable = editor.onDidBlurEditorWidget(() => {
      getKeyboardManager().setEnabled(true);
    });

    editorDisposablesRef.current = [contentDisposable, focusDisposable, blurDisposable];

    // Call onMount callback
    if (onMount) {
      onMount(editor, monaco);
    }

    // Call onReady with initial version ID for savedVersionId tracking
    const initialVersionId = model.getAlternativeVersionId();
    if (onReady) {
      onReady(initialVersionId);
    }

    // Cleanup on unmount
    return () => {
      if (lspChangeTimerRef.current) {
        clearTimeout(lspChangeTimerRef.current);
      }
      for (const d of editorDisposablesRef.current) {
        d.dispose();
      }
      editorDisposablesRef.current = [];
      // Re-enable global shortcuts when editor unmounts
      getKeyboardManager().setEnabled(true);

      // Dispose editor
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
    // Only run on mount/unmount - dependencies handled in separate effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Handle filePath changes (tab switching) by switching models
  useEffect(() => {
    if (error || !editorRef.current) return;
    if (filePath === prevFilePathRef.current && language === prevLanguageRef.current) return;

    const editor = editorRef.current;
    const client = getActiveClient(language);

    // Send didClose for old file
    if (prevFilePathRef.current && didOpenSentRef.current && client) {
      client.sendDidClose(client.resolveDocumentUri(prevFilePathRef.current));
    }
    didOpenSentRef.current = false;

    // Get or create new model
    const newModel = getOrCreateModel(filePath, value, language);

    // Suppress onChange during model switch to prevent false hasUnsavedChanges.
    // setModel and setValue fire onDidChangeModelContent synchronously, but at this point
    // savedVersionId hasn't been updated yet, causing a race condition.
    suppressChangeRef.current = true;

    // Switch to new model (preserves undo history per-model)
    editor.setModel(newModel);

    // Update model content if it differs from value
    if (newModel.getValue() !== value) {
      newModel.setValue(value);
    }

    suppressChangeRef.current = false;

    prevFilePathRef.current = filePath;
    prevLanguageRef.current = language;
    prevValuePropRef.current = value;

    // Call onReady with the new model's version ID for savedVersionId tracking on tab switch.
    // This is called AFTER setModel/setValue so the version ID reflects the final state.
    if (onReady) {
      onReady(newModel.getAlternativeVersionId());
    }
  }, [filePath, language, value, error, onReady]);

  // NOTE: Semantic validation is disabled globally in monaco-init.ts.
  // This ensures the settings are in place BEFORE any editor models are created,
  // preventing false diagnostics from appearing during initial load.

  // Disable built-in TS intellisense features when LSP is connected to avoid duplicates
  useEffect(() => {
    if (error) return;
    if (!TS_JS_LANGUAGES.includes(language)) return;

    const isLspConnected = lspState === 'connected';
    const modeConfig = isLspConnected ? DISABLED_TS_MODE_CONFIG : DEFAULT_TS_MODE_CONFIG;

    try {
      if (language === 'typescript' || language === 'typescriptreact') {
        monaco.languages.typescript.typescriptDefaults.setModeConfiguration(modeConfig);
      } else if (language === 'javascript' || language === 'javascriptreact') {
        monaco.languages.typescript.javascriptDefaults.setModeConfiguration(modeConfig);
      }
      console.log(
        `[LspMonacoEditor] ${isLspConnected ? 'Disabled' : 'Enabled'} built-in TS intellisense for ${language}`
      );
    } catch (err) {
      console.warn('[LspMonacoEditor] Failed to set mode configuration:', err);
    }
  }, [error, language, lspState]);

  // Send didOpen to LSP when connected and document is ready.
  // Handles file switches by sending didClose for the old file first.
  // Uses resolveDocumentUri to convert relative paths to absolute file:// URIs.
  useEffect(() => {
    if (lspState !== 'connected' || !editorRef.current) return;

    const client = getActiveClient(language);
    if (!client) return;

    // If file path changed, close the old document and reset
    if (prevFilePathRef.current !== filePath) {
      if (prevFilePathRef.current && didOpenSentRef.current) {
        client.sendDidClose(client.resolveDocumentUri(prevFilePathRef.current));
      }
      didOpenSentRef.current = false;
      prevFilePathRef.current = filePath;
    }

    if (didOpenSentRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    // Resolve filePath to absolute file:// URI for the language server.
    // The model URI (e.g., inmemory://model/1) may differ, so pass it for diagnostic routing.
    const documentUri = filePath ? client.resolveDocumentUri(filePath) : model.uri.toString();
    const modelUri = model.uri.toString();
    client.sendDidOpen(documentUri, language, model.getValue(), modelUri);
    didOpenSentRef.current = true;
    console.log(`[LspMonacoEditor] Sent didOpen for ${documentUri} (model: ${modelUri})`);
  }, [lspState, language, filePath]);

  // Notify parent of LSP state changes
  useEffect(() => {
    if (onLspStateChange) {
      onLspStateChange(lspState);
    }
  }, [lspState, onLspStateChange]);

  // Apply external value changes (tab switch, file reload) without interfering with typing.
  // Only triggers model.setValue when the value prop itself changed (not from our own onChange).
  useEffect(() => {
    if (value === prevValuePropRef.current) return;
    prevValuePropRef.current = value;

    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (model && model.getValue() !== value) {
      // Suppress onChange during programmatic value update to prevent false hasUnsavedChanges
      suppressChangeRef.current = true;
      model.setValue(value);
      suppressChangeRef.current = false;
    }
  }, [value]);

  // Update readOnly option when it changes
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.updateOptions({
      readOnly,
      quickSuggestions: !readOnly,
      suggestOnTriggerCharacters: !readOnly,
      parameterHints: { enabled: !readOnly },
    });
  }, [readOnly]);

  // Update theme when it changes
  useEffect(() => {
    if (error) return;
    monaco.editor.setTheme(theme);
  }, [theme, error]);

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full bg-[var(--color-surface)] ${className}`}>
        <div className="text-center p-4">
          <p className="text-[var(--color-danger)] mb-2">Failed to load editor</p>
          <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full ${className}`} data-testid="lsp-monaco-editor">
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const LspMonacoEditor = memo(LspMonacoEditorComponent);
