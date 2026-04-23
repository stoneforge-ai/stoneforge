/**
 * Language Detection Utilities for Monaco Editor
 *
 * Provides comprehensive file type detection and Monaco language mapping
 * for syntax and semantic highlighting in the file editor.
 *
 * Monaco language identifiers: https://github.com/microsoft/monaco-editor/tree/main/src/basic-languages
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Monaco editor language identifier
 * Uses Monaco's built-in language IDs
 */
export type MonacoLanguage = string;

/**
 * File type category for icon differentiation
 */
export type FileCategory =
  | 'code'
  | 'config'
  | 'data'
  | 'document'
  | 'style'
  | 'script'
  | 'image'
  | 'other';

/**
 * Language detection result with additional metadata
 */
export interface LanguageInfo {
  /** Monaco language identifier */
  language: MonacoLanguage;
  /** File category for UI/icon purposes */
  category: FileCategory;
  /** Human-readable language name */
  displayName: string;
}

// ============================================================================
// Extension to Language Mapping
// ============================================================================

/**
 * Comprehensive mapping of file extensions to Monaco language identifiers
 * Sorted by language family for maintainability
 */
const EXTENSION_MAP: Record<string, LanguageInfo> = {
  // JavaScript/TypeScript family
  js: { language: 'javascript', category: 'code', displayName: 'JavaScript' },
  jsx: { language: 'javascript', category: 'code', displayName: 'JavaScript JSX' },
  mjs: { language: 'javascript', category: 'code', displayName: 'JavaScript Module' },
  cjs: { language: 'javascript', category: 'code', displayName: 'CommonJS' },
  ts: { language: 'typescript', category: 'code', displayName: 'TypeScript' },
  tsx: { language: 'typescript', category: 'code', displayName: 'TypeScript JSX' },
  mts: { language: 'typescript', category: 'code', displayName: 'TypeScript Module' },
  cts: { language: 'typescript', category: 'code', displayName: 'CommonJS TypeScript' },

  // Web languages
  html: { language: 'html', category: 'code', displayName: 'HTML' },
  htm: { language: 'html', category: 'code', displayName: 'HTML' },
  xhtml: { language: 'html', category: 'code', displayName: 'XHTML' },
  css: { language: 'css', category: 'style', displayName: 'CSS' },
  scss: { language: 'scss', category: 'style', displayName: 'SCSS' },
  sass: { language: 'scss', category: 'style', displayName: 'Sass' },
  less: { language: 'less', category: 'style', displayName: 'Less' },
  stylus: { language: 'stylus', category: 'style', displayName: 'Stylus' },

  // Data formats
  json: { language: 'json', category: 'data', displayName: 'JSON' },
  jsonc: { language: 'json', category: 'data', displayName: 'JSON with Comments' },
  json5: { language: 'json', category: 'data', displayName: 'JSON5' },
  yaml: { language: 'yaml', category: 'data', displayName: 'YAML' },
  yml: { language: 'yaml', category: 'data', displayName: 'YAML' },
  xml: { language: 'xml', category: 'data', displayName: 'XML' },
  svg: { language: 'xml', category: 'data', displayName: 'SVG' },
  toml: { language: 'ini', category: 'config', displayName: 'TOML' },
  ini: { language: 'ini', category: 'config', displayName: 'INI' },
  conf: { language: 'ini', category: 'config', displayName: 'Config' },
  cfg: { language: 'ini', category: 'config', displayName: 'Config' },
  properties: { language: 'ini', category: 'config', displayName: 'Properties' },
  env: { language: 'shell', category: 'config', displayName: 'Environment' },

  // Documentation
  md: { language: 'markdown', category: 'document', displayName: 'Markdown' },
  mdx: { language: 'markdown', category: 'document', displayName: 'MDX' },
  markdown: { language: 'markdown', category: 'document', displayName: 'Markdown' },
  rst: { language: 'restructuredtext', category: 'document', displayName: 'reStructuredText' },
  txt: { language: 'plaintext', category: 'document', displayName: 'Plain Text' },
  text: { language: 'plaintext', category: 'document', displayName: 'Plain Text' },

  // Python
  py: { language: 'python', category: 'code', displayName: 'Python' },
  pyw: { language: 'python', category: 'code', displayName: 'Python' },
  pyx: { language: 'python', category: 'code', displayName: 'Cython' },
  pyi: { language: 'python', category: 'code', displayName: 'Python Stub' },
  ipynb: { language: 'json', category: 'code', displayName: 'Jupyter Notebook' },

  // Ruby
  rb: { language: 'ruby', category: 'code', displayName: 'Ruby' },
  rake: { language: 'ruby', category: 'code', displayName: 'Rake' },
  gemspec: { language: 'ruby', category: 'code', displayName: 'Gemspec' },
  erb: { language: 'html', category: 'code', displayName: 'ERB' },

  // Shell/Scripts
  sh: { language: 'shell', category: 'script', displayName: 'Shell' },
  bash: { language: 'shell', category: 'script', displayName: 'Bash' },
  zsh: { language: 'shell', category: 'script', displayName: 'Zsh' },
  fish: { language: 'shell', category: 'script', displayName: 'Fish' },
  ksh: { language: 'shell', category: 'script', displayName: 'Ksh' },
  ps1: { language: 'powershell', category: 'script', displayName: 'PowerShell' },
  psm1: { language: 'powershell', category: 'script', displayName: 'PowerShell Module' },
  bat: { language: 'bat', category: 'script', displayName: 'Batch' },
  cmd: { language: 'bat', category: 'script', displayName: 'Command' },

  // Systems languages
  go: { language: 'go', category: 'code', displayName: 'Go' },
  mod: { language: 'go', category: 'config', displayName: 'Go Module' },
  rs: { language: 'rust', category: 'code', displayName: 'Rust' },
  c: { language: 'c', category: 'code', displayName: 'C' },
  h: { language: 'c', category: 'code', displayName: 'C Header' },
  cpp: { language: 'cpp', category: 'code', displayName: 'C++' },
  cc: { language: 'cpp', category: 'code', displayName: 'C++' },
  cxx: { language: 'cpp', category: 'code', displayName: 'C++' },
  hpp: { language: 'cpp', category: 'code', displayName: 'C++ Header' },
  hxx: { language: 'cpp', category: 'code', displayName: 'C++ Header' },
  hh: { language: 'cpp', category: 'code', displayName: 'C++ Header' },

  // JVM languages
  java: { language: 'java', category: 'code', displayName: 'Java' },
  kt: { language: 'kotlin', category: 'code', displayName: 'Kotlin' },
  kts: { language: 'kotlin', category: 'code', displayName: 'Kotlin Script' },
  scala: { language: 'scala', category: 'code', displayName: 'Scala' },
  sc: { language: 'scala', category: 'code', displayName: 'Scala' },
  groovy: { language: 'groovy', category: 'code', displayName: 'Groovy' },
  gradle: { language: 'groovy', category: 'config', displayName: 'Gradle' },

  // .NET languages
  cs: { language: 'csharp', category: 'code', displayName: 'C#' },
  csx: { language: 'csharp', category: 'code', displayName: 'C# Script' },
  fs: { language: 'fsharp', category: 'code', displayName: 'F#' },
  fsx: { language: 'fsharp', category: 'code', displayName: 'F# Script' },
  vb: { language: 'vb', category: 'code', displayName: 'Visual Basic' },

  // PHP
  php: { language: 'php', category: 'code', displayName: 'PHP' },
  phtml: { language: 'php', category: 'code', displayName: 'PHP Template' },

  // Swift/Objective-C
  swift: { language: 'swift', category: 'code', displayName: 'Swift' },
  m: { language: 'objective-c', category: 'code', displayName: 'Objective-C' },
  mm: { language: 'objective-c', category: 'code', displayName: 'Objective-C++' },

  // Functional languages
  r: { language: 'r', category: 'code', displayName: 'R' },
  lua: { language: 'lua', category: 'code', displayName: 'Lua' },
  pl: { language: 'perl', category: 'code', displayName: 'Perl' },
  pm: { language: 'perl', category: 'code', displayName: 'Perl Module' },
  ex: { language: 'elixir', category: 'code', displayName: 'Elixir' },
  exs: { language: 'elixir', category: 'code', displayName: 'Elixir Script' },
  erl: { language: 'erlang', category: 'code', displayName: 'Erlang' },
  hrl: { language: 'erlang', category: 'code', displayName: 'Erlang Header' },
  clj: { language: 'clojure', category: 'code', displayName: 'Clojure' },
  cljs: { language: 'clojure', category: 'code', displayName: 'ClojureScript' },
  cljc: { language: 'clojure', category: 'code', displayName: 'Clojure Common' },
  edn: { language: 'clojure', category: 'data', displayName: 'EDN' },
  hs: { language: 'haskell', category: 'code', displayName: 'Haskell' },
  lhs: { language: 'haskell', category: 'code', displayName: 'Literate Haskell' },
  ml: { language: 'fsharp', category: 'code', displayName: 'OCaml' },
  mli: { language: 'fsharp', category: 'code', displayName: 'OCaml Interface' },

  // Framework-specific
  vue: { language: 'vue', category: 'code', displayName: 'Vue' },
  svelte: { language: 'svelte', category: 'code', displayName: 'Svelte' },
  astro: { language: 'astro', category: 'code', displayName: 'Astro' },

  // Query languages
  sql: { language: 'sql', category: 'data', displayName: 'SQL' },
  mysql: { language: 'mysql', category: 'data', displayName: 'MySQL' },
  pgsql: { language: 'pgsql', category: 'data', displayName: 'PostgreSQL' },
  graphql: { language: 'graphql', category: 'data', displayName: 'GraphQL' },
  gql: { language: 'graphql', category: 'data', displayName: 'GraphQL' },

  // Build/Config files
  dockerfile: { language: 'dockerfile', category: 'config', displayName: 'Dockerfile' },
  makefile: { language: 'makefile', category: 'config', displayName: 'Makefile' },
  cmake: { language: 'cmake', category: 'config', displayName: 'CMake' },
  ninja: { language: 'plaintext', category: 'config', displayName: 'Ninja' },

  // Infrastructure
  tf: { language: 'hcl', category: 'config', displayName: 'Terraform' },
  tfvars: { language: 'hcl', category: 'config', displayName: 'Terraform Variables' },
  hcl: { language: 'hcl', category: 'config', displayName: 'HCL' },

  // Database schemas
  prisma: { language: 'graphql', category: 'config', displayName: 'Prisma' },

  // Other
  diff: { language: 'diff', category: 'other', displayName: 'Diff' },
  patch: { language: 'diff', category: 'other', displayName: 'Patch' },
  log: { language: 'log', category: 'other', displayName: 'Log' },
  csv: { language: 'plaintext', category: 'data', displayName: 'CSV' },
  tsv: { language: 'plaintext', category: 'data', displayName: 'TSV' },
};

/**
 * Special filename mappings (case-insensitive)
 */
const SPECIAL_FILENAMES: Record<string, LanguageInfo> = {
  dockerfile: { language: 'dockerfile', category: 'config', displayName: 'Dockerfile' },
  'dockerfile.dev': { language: 'dockerfile', category: 'config', displayName: 'Dockerfile' },
  'dockerfile.prod': { language: 'dockerfile', category: 'config', displayName: 'Dockerfile' },
  'dockerfile.test': { language: 'dockerfile', category: 'config', displayName: 'Dockerfile' },
  makefile: { language: 'makefile', category: 'config', displayName: 'Makefile' },
  gnumakefile: { language: 'makefile', category: 'config', displayName: 'Makefile' },
  cmakelists: { language: 'cmake', category: 'config', displayName: 'CMake' },
  gemfile: { language: 'ruby', category: 'config', displayName: 'Gemfile' },
  rakefile: { language: 'ruby', category: 'config', displayName: 'Rakefile' },
  vagrantfile: { language: 'ruby', category: 'config', displayName: 'Vagrantfile' },
  guardfile: { language: 'ruby', category: 'config', displayName: 'Guardfile' },
  podfile: { language: 'ruby', category: 'config', displayName: 'Podfile' },
  fastfile: { language: 'ruby', category: 'config', displayName: 'Fastfile' },
  appfile: { language: 'ruby', category: 'config', displayName: 'Appfile' },
  berksfile: { language: 'ruby', category: 'config', displayName: 'Berksfile' },
  brewfile: { language: 'ruby', category: 'config', displayName: 'Brewfile' },
  procfile: { language: 'yaml', category: 'config', displayName: 'Procfile' },
  justfile: { language: 'makefile', category: 'config', displayName: 'Justfile' },
  jenkinsfile: { language: 'groovy', category: 'config', displayName: 'Jenkinsfile' },
  'package.json': { language: 'json', category: 'config', displayName: 'package.json' },
  'tsconfig.json': { language: 'json', category: 'config', displayName: 'tsconfig.json' },
  'jsconfig.json': { language: 'json', category: 'config', displayName: 'jsconfig.json' },
  '.babelrc': { language: 'json', category: 'config', displayName: 'Babel Config' },
  '.eslintrc': { language: 'json', category: 'config', displayName: 'ESLint Config' },
  '.prettierrc': { language: 'json', category: 'config', displayName: 'Prettier Config' },
  '.editorconfig': { language: 'ini', category: 'config', displayName: 'EditorConfig' },
  '.gitignore': { language: 'ignore', category: 'config', displayName: 'Git Ignore' },
  '.dockerignore': { language: 'ignore', category: 'config', displayName: 'Docker Ignore' },
  '.npmignore': { language: 'ignore', category: 'config', displayName: 'NPM Ignore' },
  '.gitattributes': { language: 'properties', category: 'config', displayName: 'Git Attributes' },
  '.gitmodules': { language: 'ini', category: 'config', displayName: 'Git Modules' },
  'license': { language: 'plaintext', category: 'document', displayName: 'License' },
  'readme': { language: 'markdown', category: 'document', displayName: 'README' },
  'changelog': { language: 'markdown', category: 'document', displayName: 'Changelog' },
  'authors': { language: 'plaintext', category: 'document', displayName: 'Authors' },
  'contributors': { language: 'plaintext', category: 'document', displayName: 'Contributors' },
  'copying': { language: 'plaintext', category: 'document', displayName: 'Copying' },
};

/**
 * Default language info for unknown file types
 */
const DEFAULT_LANGUAGE_INFO: LanguageInfo = {
  language: 'plaintext',
  category: 'other',
  displayName: 'Plain Text',
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Extract file extension from filename
 */
function getExtension(filename: string): string {
  // Handle .d.ts and similar compound extensions
  if (filename.endsWith('.d.ts') || filename.endsWith('.d.mts') || filename.endsWith('.d.cts')) {
    return 'ts';
  }
  if (filename.endsWith('.test.ts') || filename.endsWith('.spec.ts')) {
    return 'ts';
  }
  if (filename.endsWith('.test.tsx') || filename.endsWith('.spec.tsx')) {
    return 'tsx';
  }
  if (filename.endsWith('.test.js') || filename.endsWith('.spec.js')) {
    return 'js';
  }
  if (filename.endsWith('.test.jsx') || filename.endsWith('.spec.jsx')) {
    return 'jsx';
  }
  if (filename.endsWith('.config.js') || filename.endsWith('.config.ts')) {
    // For vite.config.ts, etc., return 'ts' or 'js'
    return filename.endsWith('.ts') ? 'ts' : 'js';
  }

  const parts = filename.split('.');
  if (parts.length < 2) {
    return '';
  }
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Detect language from filename
 *
 * @param filename - The filename (with or without path)
 * @returns LanguageInfo object with language, category, and displayName
 */
export function detectLanguageFromFilename(filename: string): LanguageInfo {
  // Extract just the filename if a path is provided
  const basename = filename.split('/').pop() || filename;
  const lowerBasename = basename.toLowerCase();

  // Check special filenames first (exact match)
  if (SPECIAL_FILENAMES[lowerBasename]) {
    return SPECIAL_FILENAMES[lowerBasename];
  }

  // Check for Dockerfile variants
  if (lowerBasename.startsWith('dockerfile')) {
    return EXTENSION_MAP['dockerfile'];
  }

  // Check for .d.ts files
  if (lowerBasename.endsWith('.d.ts')) {
    return { language: 'typescript', category: 'code', displayName: 'TypeScript Declaration' };
  }

  // Get extension and look up
  const ext = getExtension(basename);
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext];
  }

  // Check without leading dot for dotfiles
  if (lowerBasename.startsWith('.') && EXTENSION_MAP[lowerBasename.slice(1)]) {
    return EXTENSION_MAP[lowerBasename.slice(1)];
  }

  return DEFAULT_LANGUAGE_INFO;
}

/**
 * Detect language from content type (MIME type)
 *
 * @param contentType - The content/MIME type
 * @returns LanguageInfo object
 */
export function detectLanguageFromContentType(contentType: string): LanguageInfo {
  const lower = contentType.toLowerCase();

  // Handle common MIME types
  if (lower.includes('javascript') || lower === 'js') {
    return EXTENSION_MAP['js'];
  }
  if (lower.includes('typescript') || lower === 'ts') {
    return EXTENSION_MAP['ts'];
  }
  if (lower.includes('json')) {
    return EXTENSION_MAP['json'];
  }
  if (lower.includes('markdown') || lower === 'md') {
    return EXTENSION_MAP['md'];
  }
  if (lower.includes('html')) {
    return EXTENSION_MAP['html'];
  }
  if (lower.includes('css')) {
    return EXTENSION_MAP['css'];
  }
  if (lower.includes('python') || lower === 'py') {
    return EXTENSION_MAP['py'];
  }
  if (lower.includes('yaml') || lower.includes('yml')) {
    return EXTENSION_MAP['yaml'];
  }
  if (lower.includes('xml')) {
    return EXTENSION_MAP['xml'];
  }
  if (lower.includes('sql')) {
    return EXTENSION_MAP['sql'];
  }
  if (lower.includes('shell') || lower.includes('bash') || lower === 'sh') {
    return EXTENSION_MAP['sh'];
  }
  if (lower.includes('ruby') || lower === 'rb') {
    return EXTENSION_MAP['rb'];
  }
  if (lower.includes('go')) {
    return EXTENSION_MAP['go'];
  }
  if (lower.includes('rust') || lower === 'rs') {
    return EXTENSION_MAP['rs'];
  }
  if (lower.includes('java') && !lower.includes('javascript')) {
    return EXTENSION_MAP['java'];
  }

  return DEFAULT_LANGUAGE_INFO;
}

/**
 * Get Monaco language identifier from filename
 * Convenience function that returns just the language string
 *
 * @param filename - The filename
 * @returns Monaco language identifier
 */
export function getMonacoLanguage(filename: string): string {
  return detectLanguageFromFilename(filename).language;
}

/**
 * Get Monaco language identifier from content type
 *
 * @param contentType - The content/MIME type
 * @param filename - Optional filename for fallback
 * @returns Monaco language identifier
 */
export function getMonacoLanguageFromContentType(
  contentType: string | undefined | null,
  filename?: string
): string {
  if (contentType) {
    const info = detectLanguageFromContentType(contentType);
    if (info.language !== 'plaintext') {
      return info.language;
    }
  }

  // Fallback to filename detection
  if (filename) {
    return getMonacoLanguage(filename);
  }

  return 'plaintext';
}

/**
 * Get file category for icon selection
 *
 * @param filename - The filename
 * @returns FileCategory
 */
export function getFileCategory(filename: string): FileCategory {
  return detectLanguageFromFilename(filename).category;
}

/**
 * Check if a file is a code file (for icon differentiation)
 *
 * @param filename - The filename
 * @returns boolean indicating if it's a code file
 */
export function isCodeFile(filename: string): boolean {
  const info = detectLanguageFromFilename(filename);
  return info.category === 'code' || info.category === 'script';
}

/**
 * Check if a file is a config file
 *
 * @param filename - The filename
 * @returns boolean indicating if it's a config file
 */
export function isConfigFile(filename: string): boolean {
  return detectLanguageFromFilename(filename).category === 'config';
}

/**
 * Check if a file is a data/markup file
 *
 * @param filename - The filename
 * @returns boolean indicating if it's a data file
 */
export function isDataFile(filename: string): boolean {
  const cat = detectLanguageFromFilename(filename).category;
  return cat === 'data' || cat === 'document';
}
