/**
 * CLI Types - Type definitions for command-line interface
 */

// ============================================================================
// Output Modes
// ============================================================================

/**
 * Output format modes supported by the CLI
 */
export const OutputMode = {
  /** Human-readable formatted output */
  HUMAN: 'human',
  /** Verbose output with extra details and stack traces for errors */
  VERBOSE: 'verbose',
  /** Machine-parseable JSON output */
  JSON: 'json',
  /** Minimal output, IDs only */
  QUIET: 'quiet',
} as const;

export type OutputMode = (typeof OutputMode)[keyof typeof OutputMode];

// ============================================================================
// Global Options
// ============================================================================

/**
 * Global CLI options available to all commands
 */
export interface GlobalOptions {
  /** Database file path */
  db?: string;
  /** Actor name for operations */
  actor?: string;
  /** Private key for signing requests (base64-encoded PKCS8 format) */
  signKey?: string;
  /** Path to file containing private key for signing requests */
  signKeyFile?: string;
  /** Enable JSON output mode */
  json: boolean;
  /** Enable quiet mode (minimal output) */
  quiet: boolean;
  /** Enable verbose/debug output */
  verbose: boolean;
  /** Show help */
  help: boolean;
  /** Show version */
  version: boolean;
  /** Allow additional command-specific options */
  [key: string]: unknown;
}

/**
 * Default values for global options
 */
export const DEFAULT_GLOBAL_OPTIONS: GlobalOptions = {
  db: undefined,
  actor: undefined,
  signKey: undefined,
  signKeyFile: undefined,
  json: false,
  quiet: false,
  verbose: false,
  help: false,
  version: false,
};

// ============================================================================
// Command Definition
// ============================================================================

/**
 * Command handler function signature
 */
export type CommandHandler = (
  args: string[],
  options: GlobalOptions & Record<string, unknown>
) => Promise<CommandResult> | CommandResult;

/**
 * Command definition
 */
export interface Command {
  /** Command name */
  name: string;
  /** Short description for help */
  description: string;
  /** Usage pattern */
  usage: string;
  /** Detailed help text */
  help?: string;
  /** Command handler */
  handler: CommandHandler;
  /** Subcommands */
  subcommands?: Record<string, Command>;
  /** Command-specific options */
  options?: CommandOption[];
}

/**
 * Command-specific option definition
 */
export interface CommandOption {
  /** Option name (long form) */
  name: string;
  /** Short form (single character) */
  short?: string;
  /** Description */
  description: string;
  /** Whether option requires a value */
  hasValue?: boolean;
  /** Whether option is required */
  required?: boolean;
  /** Default value */
  defaultValue?: unknown;
  /** Whether option can be repeated to accumulate multiple values into an array */
  array?: boolean;
}

// ============================================================================
// Command Result
// ============================================================================

/**
 * Result of command execution
 */
export interface CommandResult {
  /** Exit code */
  exitCode: number;
  /** Output data (for JSON mode) */
  data?: unknown;
  /** Human-readable output */
  message?: string;
  /** Error message */
  error?: string;
}

/**
 * Factory for successful command results
 */
export function success(data?: unknown, message?: string): CommandResult {
  return { exitCode: 0, data, message };
}

/**
 * Factory for error command results
 */
export function failure(error: string, exitCode: number = 1): CommandResult {
  return { exitCode, error };
}

// ============================================================================
// Exit Codes (from spec)
// ============================================================================

export const ExitCode = {
  /** Success */
  SUCCESS: 0,
  /** General error */
  GENERAL_ERROR: 1,
  /** Invalid arguments */
  INVALID_ARGUMENTS: 2,
  /** Not found */
  NOT_FOUND: 3,
  /** Validation error */
  VALIDATION: 4,
  /** Permission error */
  PERMISSION: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

// ============================================================================
// Parsed Command Line
// ============================================================================

/**
 * Result of parsing command line arguments
 */
export interface ParsedCommandLine {
  /** Command path (e.g., ['dep', 'add']) */
  command: string[];
  /** Positional arguments after command */
  args: string[];
  /** Global options */
  options: GlobalOptions;
  /** Command-specific options */
  commandOptions: Record<string, unknown>;
}
