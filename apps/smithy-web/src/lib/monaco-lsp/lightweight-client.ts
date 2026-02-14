/**
 * Lightweight LSP Client
 *
 * Replaces MonacoLanguageClient with a direct JSON-RPC client that uses
 * vscode-ws-jsonrpc for WebSocket transport. Works with vanilla monaco-editor
 * without requiring @codingame/monaco-vscode-api service initialization.
 *
 * Uses string-based method names for JSON-RPC to avoid version mismatches
 * between vscode-jsonrpc and vscode-languageserver-protocol types.
 */

import {
  createMessageConnection,
  type MessageConnection,
} from 'vscode-jsonrpc';
import {
  WebSocketMessageReader,
  WebSocketMessageWriter,
  toSocket,
} from 'vscode-ws-jsonrpc';
import {
  DiagnosticSeverity,
  CompletionItemKind as LspCompletionItemKind,
  MarkupKind,
  type Diagnostic,
  type CompletionItem as LspCompletionItem,
  type CompletionList,
  type MarkupContent,
  type Hover,
  type Location,
  type LocationLink,
} from 'vscode-languageserver-protocol';
import type * as monaco from 'monaco-editor';

/**
 * Options for creating a lightweight LSP client
 */
export interface LightweightClientOptions {
  language: string;
  workspaceRoot?: string;
  documentUri?: string;
}

/**
 * Lightweight LSP client that bridges LSP protocol to Monaco editor providers
 */
export class LightweightLspClient {
  private connection: MessageConnection | null = null;
  private socket: WebSocket | null = null;
  private disposables: monaco.IDisposable[] = [];
  private documentVersion = 0;
  private language: string;
  private workspaceRoot: string;
  private monacoInstance: typeof monaco | null = null;
  private _isConnected = false;
  /** Maps LSP document URIs (absolute) to Monaco model URIs for diagnostic routing */
  private documentToModelUri = new Map<string, string>();

  constructor(options: LightweightClientOptions) {
    this.language = options.language;
    this.workspaceRoot = options.workspaceRoot || '/';
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to the language server via WebSocket and initialize the LSP session
   */
  async start(webSocket: WebSocket, monacoInstance: typeof monaco): Promise<void> {
    this.socket = webSocket;
    this.monacoInstance = monacoInstance;

    const socketWrapper = toSocket(webSocket);
    const reader = new WebSocketMessageReader(socketWrapper);
    const writer = new WebSocketMessageWriter(socketWrapper);
    this.connection = createMessageConnection(reader, writer);

    // Set up notification handlers before listening
    this.setupNotificationHandlers();

    this.connection.listen();

    // Send initialize request (using string method name for version compat)
    await this.connection.sendRequest('initialize', {
      processId: null,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: [MarkupKind.Markdown, MarkupKind.PlainText],
            },
          },
          hover: {
            contentFormat: [MarkupKind.Markdown, MarkupKind.PlainText],
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
          definition: {},
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      rootUri: `file://${this.workspaceRoot}`,
      workspaceFolders: [
        {
          uri: `file://${this.workspaceRoot}`,
          name: this.workspaceRoot.split('/').pop() || 'workspace',
        },
      ],
    });

    // Send initialized notification
    this.connection.sendNotification('initialized', {});

    // Register Monaco providers
    this.registerProviders();

    this._isConnected = true;
  }

  /**
   * Set up LSP notification handlers (diagnostics, etc.)
   */
  private setupNotificationHandlers(): void {
    if (!this.connection) return;

    this.connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: { uri: string; diagnostics: Diagnostic[] }) => {
        if (!this.monacoInstance) return;

        // Resolve the diagnostic URI to the Monaco model URI via our mapping
        const mappedModelUri = this.documentToModelUri.get(params.uri);

        const models = this.monacoInstance.editor.getModels();
        const model = models.find((m) => {
          const modelUri = m.uri.toString();
          // Check mapped URI first (handles absolute→relative mapping)
          if (mappedModelUri && modelUri === mappedModelUri) return true;
          return modelUri === params.uri ||
            `file://${modelUri}` === params.uri ||
            modelUri === params.uri.replace('file://', '');
        });

        if (model) {
          const markers = params.diagnostics.map((d) => toMonacoMarker(d));
          this.monacoInstance.editor.setModelMarkers(model, 'lsp', markers);
          console.log(`[lsp-client] Set ${markers.length} diagnostics for ${params.uri}`);
        } else if (params.diagnostics.length > 0) {
          console.warn(
            `[lsp-client] No model found for diagnostics URI: ${params.uri}`,
            `Mapped model URI: ${mappedModelUri || 'none'}`,
            `Available models: ${models.map((m) => m.uri.toString()).join(', ')}`
          );
        }
      }
    );
  }

  /**
   * Register Monaco language providers for completions, hover, definitions
   */
  private registerProviders(): void {
    if (!this.monacoInstance || !this.connection) return;

    const conn = this.connection;
    const lang = this.language;

    // Completion provider
    this.disposables.push(
      this.monacoInstance.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['.', '/', '"', "'", '`', '<', '@'],
        provideCompletionItems: async (model, position) => {
          try {
            const result = await conn.sendRequest('textDocument/completion', {
              textDocument: { uri: model.uri.toString() },
              position: {
                line: position.lineNumber - 1,
                character: position.column - 1,
              },
            });
            if (!result) return { suggestions: [] };

            const items: LspCompletionItem[] = Array.isArray(result)
              ? result
              : (result as CompletionList).items;

            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            };

            return {
              suggestions: items.map((item) =>
                toMonacoCompletionItem(item, range, this.monacoInstance!)
              ),
            };
          } catch {
            return { suggestions: [] };
          }
        },
      })
    );

    // Hover provider
    this.disposables.push(
      this.monacoInstance.languages.registerHoverProvider(lang, {
        provideHover: async (model, position) => {
          try {
            const result: Hover | null = await conn.sendRequest('textDocument/hover', {
              textDocument: { uri: model.uri.toString() },
              position: {
                line: position.lineNumber - 1,
                character: position.column - 1,
              },
            });
            if (!result) return null;

            const toMonacoHoverContent = (c: unknown): { value: string } => {
              if (typeof c === 'string') return { value: c };
              if (c && typeof c === 'object' && 'value' in c) return { value: String((c as { value: string }).value) };
              return { value: String(c) };
            };

            const contents = Array.isArray(result.contents)
              ? result.contents.map(toMonacoHoverContent)
              : [toMonacoHoverContent(result.contents)];

            return {
              contents,
              range: result.range
                ? {
                    startLineNumber: result.range.start.line + 1,
                    startColumn: result.range.start.character + 1,
                    endLineNumber: result.range.end.line + 1,
                    endColumn: result.range.end.character + 1,
                  }
                : undefined,
            };
          } catch {
            return null;
          }
        },
      })
    );

    // Definition provider
    this.disposables.push(
      this.monacoInstance.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          try {
            const result: Location | Location[] | LocationLink[] | null = await conn.sendRequest(
              'textDocument/definition',
              {
                textDocument: { uri: model.uri.toString() },
                position: {
                  line: position.lineNumber - 1,
                  character: position.column - 1,
                },
              }
            );
            if (!result) return null;

            const locations = Array.isArray(result) ? result : [result];
            return locations.map((loc) => ({
              uri: this.monacoInstance!.Uri.parse('uri' in loc ? loc.uri : ''),
              range: {
                startLineNumber: ('range' in loc ? loc.range.start.line : 0) + 1,
                startColumn: ('range' in loc ? loc.range.start.character : 0) + 1,
                endLineNumber: ('range' in loc ? loc.range.end.line : 0) + 1,
                endColumn: ('range' in loc ? loc.range.end.character : 0) + 1,
              },
            }));
          } catch {
            return null;
          }
        },
      })
    );
  }

  /**
   * Resolve a relative file path to an absolute file:// URI using the workspace root.
   * If already absolute, returns file://{path}. If relative, prepends the workspace root.
   */
  resolveDocumentUri(filePath: string): string {
    if (filePath.startsWith('/')) return `file://${filePath}`;
    return `file://${this.workspaceRoot}/${filePath}`;
  }

  /**
   * Notify the language server that a document was opened.
   * @param modelUri - The Monaco model URI (may differ from the document URI)
   *                   Used to route diagnostics back to the correct model.
   */
  sendDidOpen(uri: string, languageId: string, text: string, modelUri?: string): void {
    if (!this.connection) return;
    this.documentVersion = 1;
    if (modelUri && modelUri !== uri) {
      this.documentToModelUri.set(uri, modelUri);
    }
    this.connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: this.documentVersion,
        text,
      },
    });
  }

  /**
   * Notify the language server that a document changed
   */
  sendDidChange(uri: string, text: string): void {
    if (!this.connection) return;
    this.documentVersion++;
    this.connection.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version: this.documentVersion,
      },
      contentChanges: [{ text }],
    });
  }

  /**
   * Notify the language server that a document was closed
   */
  sendDidClose(uri: string): void {
    if (!this.connection) return;
    this.documentToModelUri.delete(uri);
    this.connection.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Stop the client and clean up resources
   */
  async stop(): Promise<void> {
    this._isConnected = false;

    // Dispose Monaco providers
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];

    // Close connection
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }

    // Close WebSocket
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// ---- Conversion utilities: LSP → Monaco ----

function toMonacoSeverity(severity: DiagnosticSeverity | undefined): monaco.MarkerSeverity {
  // Monaco MarkerSeverity values: Hint=1, Info=2, Warning=4, Error=8
  switch (severity) {
    case DiagnosticSeverity.Error: return 8;
    case DiagnosticSeverity.Warning: return 4;
    case DiagnosticSeverity.Information: return 2;
    case DiagnosticSeverity.Hint: return 1;
    default: return 2;
  }
}

function toMonacoMarker(diagnostic: Diagnostic): monaco.editor.IMarkerData {
  return {
    severity: toMonacoSeverity(diagnostic.severity),
    message: diagnostic.message,
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    source: diagnostic.source,
    code: typeof diagnostic.code === 'number' ? String(diagnostic.code) : diagnostic.code,
  };
}

function toMonacoCompletionItemKind(
  kind: LspCompletionItemKind | undefined,
  monacoInstance: typeof monaco
): monaco.languages.CompletionItemKind {
  const mk = monacoInstance.languages.CompletionItemKind;
  switch (kind) {
    case LspCompletionItemKind.Text: return mk.Text;
    case LspCompletionItemKind.Method: return mk.Method;
    case LspCompletionItemKind.Function: return mk.Function;
    case LspCompletionItemKind.Constructor: return mk.Constructor;
    case LspCompletionItemKind.Field: return mk.Field;
    case LspCompletionItemKind.Variable: return mk.Variable;
    case LspCompletionItemKind.Class: return mk.Class;
    case LspCompletionItemKind.Interface: return mk.Interface;
    case LspCompletionItemKind.Module: return mk.Module;
    case LspCompletionItemKind.Property: return mk.Property;
    case LspCompletionItemKind.Unit: return mk.Unit;
    case LspCompletionItemKind.Value: return mk.Value;
    case LspCompletionItemKind.Enum: return mk.Enum;
    case LspCompletionItemKind.Keyword: return mk.Keyword;
    case LspCompletionItemKind.Snippet: return mk.Snippet;
    case LspCompletionItemKind.Color: return mk.Color;
    case LspCompletionItemKind.File: return mk.File;
    case LspCompletionItemKind.Reference: return mk.Reference;
    case LspCompletionItemKind.Folder: return mk.Folder;
    case LspCompletionItemKind.EnumMember: return mk.EnumMember;
    case LspCompletionItemKind.Constant: return mk.Constant;
    case LspCompletionItemKind.Struct: return mk.Struct;
    case LspCompletionItemKind.Event: return mk.Event;
    case LspCompletionItemKind.Operator: return mk.Operator;
    case LspCompletionItemKind.TypeParameter: return mk.TypeParameter;
    default: return mk.Text;
  }
}

function toMonacoCompletionItem(
  item: LspCompletionItem,
  range: monaco.IRange,
  monacoInstance: typeof monaco
): monaco.languages.CompletionItem {
  const documentation = item.documentation
    ? typeof item.documentation === 'string'
      ? item.documentation
      : { value: (item.documentation as MarkupContent).value }
    : undefined;

  return {
    label: item.label,
    kind: toMonacoCompletionItemKind(item.kind, monacoInstance),
    detail: item.detail,
    documentation,
    insertText: item.insertText || item.label,
    range,
    sortText: item.sortText,
    filterText: item.filterText,
  };
}
