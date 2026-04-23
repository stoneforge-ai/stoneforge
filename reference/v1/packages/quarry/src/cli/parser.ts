/**
 * CLI Argument Parser
 *
 * Parses command-line arguments into structured command and options.
 */

import type { GlobalOptions, ParsedCommandLine, CommandOption } from './types.js';
import { DEFAULT_GLOBAL_OPTIONS } from './types.js';

// ============================================================================
// Case Conversion Utilities
// ============================================================================

/**
 * Converts a camelCase string to kebab-case.
 *
 * CLI conventions use kebab-case for long options (e.g., --reply-to),
 * but option definitions use camelCase for JavaScript property names (e.g., replyTo).
 * This function bridges the two.
 *
 * @param str - camelCase string
 * @returns kebab-case string
 */
export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

// ============================================================================
// Shell Escape Handling
// ============================================================================

/**
 * Unescapes common shell escape sequences that shells may add.
 *
 * Shells like bash and zsh often escape exclamation marks (!) with backslashes
 * to disable history expansion. When running commands through nested shells or
 * through tools like Claude Code, multiple layers of escaping can occur,
 * resulting in sequences like \\! or even \\\\!
 *
 * This function removes those unnecessary escapes to provide the expected user input.
 *
 * @param value - The string value to unescape
 * @returns The unescaped string
 */
export function unescapeShellArtifacts(value: string): string {
  // Unescape any sequence of one or more backslashes followed by exclamation mark
  // to just the exclamation mark. This handles:
  // - \! -> !  (single escape from shell history expansion)
  // - \\! -> ! (double escape from nested shells)
  // - \\\\! -> ! (quadruple escape from multiple layers)
  return value.replace(/\\+!/g, '!');
}

// ============================================================================
// Global Option Definitions
// ============================================================================

const GLOBAL_OPTIONS: Record<string, { short?: string; hasValue?: boolean; key: keyof GlobalOptions }> = {
  '--db': { hasValue: true, key: 'db' },
  '--actor': { hasValue: true, key: 'actor' },
  '--from': { hasValue: true, key: 'actor' }, // Alias for --actor
  '--sign-key': { hasValue: true, key: 'signKey' },
  '--sign-key-file': { hasValue: true, key: 'signKeyFile' },
  '--json': { key: 'json' },
  '--quiet': { short: '-q', key: 'quiet' },
  '--verbose': { short: '-v', key: 'verbose' },
  '--help': { short: '-h', key: 'help' },
  '--version': { short: '-V', key: 'version' },
};

// Build reverse lookup for short options
const SHORT_TO_LONG: Record<string, string> = {};
for (const [long, def] of Object.entries(GLOBAL_OPTIONS)) {
  if (def.short) {
    SHORT_TO_LONG[def.short] = long;
  }
}

// ============================================================================
// Parse Function
// ============================================================================

/**
 * Parses command-line arguments
 *
 * @param argv - Raw arguments (typically process.argv.slice(2))
 * @param commandOptions - Optional command-specific option definitions
 * @param parserOptions - Parser options
 * @param parserOptions.strict - If false, unknown options are skipped instead of throwing (default: true)
 * @returns Parsed command line structure
 */
export function parseArgs(
  argv: string[],
  commandOptions: CommandOption[] = [],
  parserOptions: { strict?: boolean } = {}
): ParsedCommandLine {
  const { strict = true } = parserOptions;
  const command: string[] = [];
  const args: string[] = [];
  const options: GlobalOptions = { ...DEFAULT_GLOBAL_OPTIONS };
  const cmdOptions: Record<string, unknown> = {};

  // Build command option lookup
  const cmdOptDefs: Record<string, { hasValue?: boolean; key: string; array?: boolean }> = {};
  for (const opt of commandOptions) {
    const def = { hasValue: opt.hasValue, key: opt.name, array: opt.array };
    cmdOptDefs[`--${opt.name}`] = def;
    // Also register kebab-case alias for camelCase option names (e.g., replyTo -> reply-to)
    // This follows CLI conventions where long options use kebab-case (--reply-to)
    const kebabName = camelToKebab(opt.name);
    if (kebabName !== opt.name) {
      cmdOptDefs[`--${kebabName}`] = def;
    }
    if (opt.short) {
      cmdOptDefs[`-${opt.short}`] = def;
    }
    // Set defaults
    if (opt.defaultValue !== undefined) {
      cmdOptions[opt.name] = opt.defaultValue;
    }
  }

  let i = 0;
  let parsingOptions = true;

  while (i < argv.length) {
    const arg = argv[i];

    // -- stops option parsing, remaining args are positional
    if (arg === '--') {
      i++;
      // Add all remaining arguments as positional args
      while (i < argv.length) {
        args.push(unescapeShellArtifacts(argv[i]));
        i++;
      }
      break;
    }

    // Options
    if (parsingOptions && arg.startsWith('-')) {
      // Handle combined short options (e.g., -qv)
      if (arg.length > 2 && arg[1] !== '-' && !arg.includes('=')) {
        // Expand combined short options
        const shorts = arg.slice(1).split('');
        for (const s of shorts) {
          const shortOpt = `-${s}`;
          const longOpt = SHORT_TO_LONG[shortOpt];
          if (longOpt) {
            const def = GLOBAL_OPTIONS[longOpt];
            if (!def.hasValue) {
              (options[def.key] as boolean) = true;
            }
          }
        }
        i++;
        continue;
      }

      // Handle --option=value syntax
      let optName = arg;
      let optValue: string | undefined;
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        optName = arg.slice(0, eqIndex);
        optValue = arg.slice(eqIndex + 1);
      }

      // Normalize short to long
      const normalizedOpt = SHORT_TO_LONG[optName] || optName;

      // Check global options
      const globalDef = GLOBAL_OPTIONS[normalizedOpt];
      if (globalDef) {
        if (globalDef.hasValue) {
          const value = optValue ?? argv[++i];
          if (value === undefined || value.startsWith('-')) {
            throw new Error(`Option ${optName} requires a value`);
          }
          (options[globalDef.key] as string) = unescapeShellArtifacts(value);
        } else {
          (options[globalDef.key] as boolean) = true;
        }
        i++;
        continue;
      }

      // Check command-specific options
      const cmdDef = cmdOptDefs[optName];
      if (cmdDef) {
        if (cmdDef.hasValue) {
          const value = optValue ?? argv[++i];
          if (value === undefined || (value.startsWith('-') && value !== '-')) {
            throw new Error(`Option ${optName} requires a value`);
          }
          const unescapedValue = unescapeShellArtifacts(value);
          if (cmdDef.array) {
            // Accumulate values into an array for array options
            const existing = cmdOptions[cmdDef.key];
            if (Array.isArray(existing)) {
              existing.push(unescapedValue);
            } else {
              cmdOptions[cmdDef.key] = [unescapedValue];
            }
          } else {
            cmdOptions[cmdDef.key] = unescapedValue;
          }
        } else {
          cmdOptions[cmdDef.key] = true;
        }
        i++;
        continue;
      }

      // Unknown option
      if (strict) {
        throw new Error(`Unknown option: ${optName}`);
      }
      // In non-strict mode, skip unknown options (and their values if using = syntax)
      i++;
      continue;
    }

    // Commands and positional arguments
    // First non-option args are commands/subcommands, subsequent are positional args
    // Once we've started collecting positional args, don't add more to command path
    if ((command.length === 0 || isSubcommand(arg)) && args.length === 0) {
      command.push(arg);
    } else {
      args.push(unescapeShellArtifacts(arg));
    }
    i++;
  }

  return { command, args, options, commandOptions: cmdOptions };
}

/**
 * Checks if an argument looks like a subcommand (not an ID or path)
 */
function isSubcommand(arg: string): boolean {
  // Element IDs start with 'el-'
  if (arg.startsWith('el-')) return false;
  // Paths contain slashes
  if (arg.includes('/')) return false;
  // Numbers are not subcommands
  if (/^\d+$/.test(arg)) return false;
  // Otherwise likely a subcommand
  return true;
}

// ============================================================================
// Option Validation
// ============================================================================

/**
 * Validates that required options are present
 */
export function validateRequiredOptions(
  commandOptions: Record<string, unknown>,
  definitions: CommandOption[]
): void {
  for (const opt of definitions) {
    if (opt.required && commandOptions[opt.name] === undefined) {
      throw new Error(`Required option --${camelToKebab(opt.name)} is missing`);
    }
  }
}

// ============================================================================
// Help Text Generation
// ============================================================================

/**
 * Generates help text for global options
 */
export function getGlobalOptionsHelp(): string {
  return `Global Options:
  --db <path>            Database file path
  --actor <name>         Actor name for operations
  --from <name>          Alias for --actor
  --sign-key <key>       Private key for signing (base64 PKCS8)
  --sign-key-file <path> Path to file containing private key
  --json                 Output in JSON format
  -q, --quiet            Minimal output (IDs only)
  -v, --verbose          Enable debug output
  -h, --help             Show help
  -V, --version          Show version`;
}

/**
 * Generates help text for command-specific options
 */
export function getCommandOptionsHelp(options: CommandOption[]): string {
  if (options.length === 0) return '';

  const lines = ['Command Options:'];
  for (const opt of options) {
    const shortPart = opt.short ? `-${opt.short}, ` : '    ';
    const displayName = camelToKebab(opt.name);
    const valuePart = opt.hasValue ? ` <${displayName}>` : '';
    const requiredPart = opt.required ? ' (required)' : '';
    lines.push(`  ${shortPart}--${displayName}${valuePart}${requiredPart}`);
    lines.push(`        ${opt.description}`);
  }
  return lines.join('\n');
}
