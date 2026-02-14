/**
 * Identity Commands - Identity management and whoami
 *
 * Provides CLI commands for identity operations:
 * - whoami: Show current actor context
 * - identity: Parent command for identity operations
 * - sign: Sign data using a private key
 * - verify: Verify a signature against data
 * - keygen: Generate a new Ed25519 keypair
 */

import { readFileSync } from 'node:fs';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { getValue, getValueSource, loadConfig } from '../../config/index.js';
import {
  IdentityMode,
  ActorSource,
  signEd25519,
  verifyEd25519Signature,
  generateEd25519Keypair,
  constructSignedData,
  hashRequestBody,
  isValidPublicKey,
  isValidSignature,
  isValidRequestHash,
  type PublicKey,
  type Signature,
} from '../../systems/identity.js';
import type { Timestamp } from '@stoneforge/core';
import type { ConfigSource } from '../../config/types.js';

// ============================================================================
// Actor Resolution Helper
// ============================================================================

/**
 * Result of resolving the current actor
 */
interface ActorResolution {
  /** The resolved actor name */
  actor: string;
  /** Where the actor came from */
  source: ActorSource | ConfigSource;
  /** Whether the actor is verified (always false in soft mode) */
  verified: boolean;
  /** The identity mode */
  mode: IdentityMode;
  /** Additional details */
  details?: {
    /** Config file path if actor from config */
    configPath?: string;
    /** Environment variable name if from env */
    envVar?: string;
  };
}

/**
 * Resolves the current actor from various sources
 *
 * Priority order (highest to lowest):
 * 1. CLI --actor flag
 * 2. STONEFORGE_ACTOR environment variable
 * 3. Config file actor setting
 * 4. Default fallback
 */
function resolveCurrentActor(options: GlobalOptions): ActorResolution {
  // Load config with CLI overrides
  const cliOverrides = options.actor ? { actor: options.actor } : undefined;
  loadConfig({ cliOverrides });

  // Get identity mode
  const mode = getValue('identity.mode');

  // Check CLI flag first
  if (options.actor) {
    return {
      actor: options.actor,
      source: ActorSource.CLI_FLAG,
      verified: false,
      mode,
    };
  }

  // Check configured actor
  const configuredActor = getValue('actor');
  if (configuredActor) {
    const source = getValueSource('actor');
    return {
      actor: configuredActor,
      source,
      verified: false,
      mode,
      details: source === 'environment' ? { envVar: 'STONEFORGE_ACTOR' } : undefined,
    };
  }

  // No actor configured - return indication
  return {
    actor: '',
    source: ActorSource.SYSTEM,
    verified: false,
    mode,
  };
}

// ============================================================================
// Whoami Command
// ============================================================================

async function whoamiHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const resolution = resolveCurrentActor(options);
  const mode = getOutputMode(options);

  // Build data object for JSON output
  const data = {
    actor: resolution.actor || null,
    source: resolution.source,
    verified: resolution.verified,
    identityMode: resolution.mode,
    ...(resolution.details && { details: resolution.details }),
  };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    if (!resolution.actor) {
      return failure('No actor configured', ExitCode.NOT_FOUND);
    }
    return success(resolution.actor);
  }

  // Human-readable output
  if (!resolution.actor) {
    const lines = [
      'No actor configured.',
      '',
      'Set an actor using one of:',
      '  --actor <name>            CLI flag (highest priority)',
      '  STONEFORGE_ACTOR=<name>    Environment variable',
      '  sf config set actor <name>  Configuration file',
    ];
    return success(data, lines.join('\n'));
  }

  // Build formatted output
  const lines: string[] = [];
  lines.push(`Actor: ${resolution.actor}`);
  lines.push(`Source: ${formatSource(resolution.source)}`);
  lines.push(`Identity Mode: ${resolution.mode}`);
  lines.push(`Verified: ${resolution.verified ? 'yes' : 'no'}`);

  if (resolution.details?.envVar) {
    lines.push(`Environment Variable: ${resolution.details.envVar}`);
  }

  return success(data, lines.join('\n'));
}

/**
 * Formats a source value for human display
 */
function formatSource(source: ActorSource | ConfigSource): string {
  switch (source) {
    case ActorSource.CLI_FLAG:
    case 'cli':
      return 'CLI --actor flag';
    case ActorSource.CONFIG:
    case 'file':
      return 'configuration file';
    case 'environment':
      return 'environment variable';
    case ActorSource.EXPLICIT:
      return 'explicit';
    case ActorSource.ELEMENT:
      return 'element';
    case ActorSource.SYSTEM:
      return 'system';
    case 'default':
      return 'default';
    default:
      return String(source);
  }
}

export const whoamiCommand: Command = {
  name: 'whoami',
  description: 'Show current actor identity',
  usage: 'sf whoami',
  help: `Display the current actor identity and how it was determined.

The actor is resolved from multiple sources in priority order:
  1. CLI --actor flag (highest priority)
  2. STONEFORGE_ACTOR environment variable
  3. Configuration file (actor setting)
  4. No actor (operations will require explicit actor)

Output includes:
  - Actor name
  - Source of the actor identity
  - Identity mode (soft, cryptographic, hybrid)
  - Verification status

Examples:
  sf whoami
  sf whoami --json
  sf --actor myagent whoami`,
  options: [],
  handler: whoamiHandler as Command['handler'],
};

// ============================================================================
// Identity Parent Command
// ============================================================================

async function identityHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  // If no subcommand, show current identity (same as whoami)
  return whoamiHandler(args, options);
}

// ============================================================================
// Private Key Resolution Helper
// ============================================================================

/**
 * Resolves the private key from CLI options or environment
 *
 * Priority order:
 * 1. --sign-key flag (direct key)
 * 2. --sign-key-file flag (path to key file)
 * 3. STONEFORGE_SIGN_KEY environment variable
 * 4. STONEFORGE_SIGN_KEY_FILE environment variable
 */
function resolvePrivateKey(options: GlobalOptions): { key: string | null; source: string } {
  // Check direct key from CLI
  if (options.signKey) {
    return { key: options.signKey, source: 'cli_flag' };
  }

  // Check key file from CLI
  if (options.signKeyFile) {
    try {
      const key = readFileSync(options.signKeyFile, 'utf8').trim();
      return { key, source: 'cli_file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read key file: ${message}`);
    }
  }

  // Check environment variable for direct key
  const envKey = process.env.STONEFORGE_SIGN_KEY;
  if (envKey) {
    return { key: envKey, source: 'environment' };
  }

  // Check environment variable for key file
  const envKeyFile = process.env.STONEFORGE_SIGN_KEY_FILE;
  if (envKeyFile) {
    try {
      const key = readFileSync(envKeyFile, 'utf8').trim();
      return { key, source: 'environment_file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read key file from STONEFORGE_SIGN_KEY_FILE: ${message}`);
    }
  }

  return { key: null, source: 'none' };
}

// ============================================================================
// Sign Command
// ============================================================================

interface SignOptions extends GlobalOptions {
  data?: string;
  file?: string;
  hash?: string;
}

const signOptions: CommandOption[] = [
  {
    name: 'data',
    short: 'd',
    description: 'Data to sign (string)',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Path to file containing data to sign',
    hasValue: true,
  },
  {
    name: 'hash',
    description: 'Pre-computed hash to sign (for request signing)',
    hasValue: true,
  },
];

async function signHandler(
  _args: string[],
  options: SignOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  // Resolve actor
  const resolution = resolveCurrentActor(options);
  if (!resolution.actor) {
    return failure(
      'Actor is required for signing. Use --actor <name>',
      ExitCode.VALIDATION
    );
  }

  // Resolve private key
  let keyInfo: { key: string | null; source: string };
  try {
    keyInfo = resolvePrivateKey(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(message, ExitCode.GENERAL_ERROR);
  }

  if (!keyInfo.key) {
    return failure(
      'Private key is required for signing. Use --sign-key <key>, --sign-key-file <path>, or set STONEFORGE_SIGN_KEY',
      ExitCode.VALIDATION
    );
  }

  // Get data to sign
  let dataToSign: string;
  let requestHash: string;

  if (options.hash) {
    // Validate pre-computed hash format
    if (!isValidRequestHash(options.hash)) {
      return failure(
        'Invalid hash format. Expected 64-character hex-encoded SHA256 hash',
        ExitCode.VALIDATION
      );
    }
    requestHash = options.hash;
  } else if (options.data) {
    // Hash the provided data
    requestHash = await hashRequestBody(options.data);
  } else if (options.file) {
    // Read and hash file contents
    try {
      const fileData = readFileSync(options.file, 'utf8');
      requestHash = await hashRequestBody(fileData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(`Failed to read file: ${message}`, ExitCode.GENERAL_ERROR);
    }
  } else {
    return failure(
      'No data to sign. Use --data <string>, --file <path>, or --hash <hash>',
      ExitCode.VALIDATION
    );
  }

  // Create signed data string
  const signedAt = new Date().toISOString() as Timestamp;
  dataToSign = constructSignedData({
    actor: resolution.actor,
    signedAt,
    requestHash,
  });

  // Sign the data
  try {
    const signature = await signEd25519(keyInfo.key, dataToSign);

    const data = {
      signature,
      signedAt,
      actor: resolution.actor,
      requestHash,
      keySource: keyInfo.source,
    };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      return success(signature);
    }

    const lines: string[] = [];
    lines.push(`Signature: ${signature}`);
    lines.push(`Signed At: ${signedAt}`);
    lines.push(`Actor: ${resolution.actor}`);
    lines.push(`Request Hash: ${requestHash}`);
    lines.push(`Key Source: ${keyInfo.source}`);

    return success(data, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to sign data: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const signCommand: Command = {
  name: 'sign',
  description: 'Sign data using a private key',
  usage: 'sf identity sign [options]',
  help: `Sign data using an Ed25519 private key.

The signature is computed over: actor|signedAt|requestHash

Options:
  -d, --data <string>       Data to sign (will be hashed)
  -f, --file <path>         File containing data to sign
      --hash <hash>         Pre-computed SHA256 hash (hex)
      --sign-key <key>      Private key (base64 PKCS8)
      --sign-key-file <path> Path to private key file

The private key can also be set via environment variables:
  STONEFORGE_SIGN_KEY        Direct base64-encoded private key
  STONEFORGE_SIGN_KEY_FILE   Path to file containing private key

Examples:
  sf identity sign --data "hello world" --sign-key <key> --actor alice
  sf identity sign --file request.json --sign-key-file ~/.stoneforge/private.key
  sf identity sign --hash abc123... --actor alice`,
  options: signOptions,
  handler: signHandler as Command['handler'],
};

// ============================================================================
// Verify Command
// ============================================================================

interface VerifyOptions extends GlobalOptions {
  signature?: string;
  data?: string;
  file?: string;
  hash?: string;
  'public-key'?: string;
  'signed-at'?: string;
}

const verifyOptions: CommandOption[] = [
  {
    name: 'signature',
    short: 's',
    description: 'Signature to verify (base64)',
    hasValue: true,
    required: true,
  },
  {
    name: 'data',
    short: 'd',
    description: 'Original data that was signed',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Path to file containing original data',
    hasValue: true,
  },
  {
    name: 'hash',
    description: 'Request hash that was signed',
    hasValue: true,
  },
  {
    name: 'public-key',
    short: 'k',
    description: 'Public key to verify against (base64)',
    hasValue: true,
    required: true,
  },
  {
    name: 'signed-at',
    description: 'Timestamp when signature was created (ISO 8601)',
    hasValue: true,
    required: true,
  },
];

async function verifyHandler(
  _args: string[],
  options: VerifyOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  // Validate required options
  if (!options.signature) {
    return failure('--signature is required', ExitCode.VALIDATION);
  }

  if (!options['public-key']) {
    return failure('--public-key is required', ExitCode.VALIDATION);
  }

  if (!options['signed-at']) {
    return failure('--signed-at is required', ExitCode.VALIDATION);
  }

  // Resolve actor
  const resolution = resolveCurrentActor(options);
  if (!resolution.actor) {
    return failure(
      'Actor is required for verification. Use --actor <name>',
      ExitCode.VALIDATION
    );
  }

  // Validate signature format
  if (!isValidSignature(options.signature)) {
    return failure(
      'Invalid signature format. Expected 88-character base64 string',
      ExitCode.VALIDATION
    );
  }

  // Validate public key format
  if (!isValidPublicKey(options['public-key'])) {
    return failure(
      'Invalid public key format. Expected 44-character base64 string',
      ExitCode.VALIDATION
    );
  }

  // Get request hash
  let requestHash: string;

  if (options.hash) {
    // Validate pre-computed hash format
    if (!isValidRequestHash(options.hash)) {
      return failure(
        'Invalid hash format. Expected 64-character hex-encoded SHA256 hash',
        ExitCode.VALIDATION
      );
    }
    requestHash = options.hash;
  } else if (options.data) {
    requestHash = await hashRequestBody(options.data);
  } else if (options.file) {
    try {
      const fileData = readFileSync(options.file, 'utf8');
      requestHash = await hashRequestBody(fileData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(`Failed to read file: ${message}`, ExitCode.GENERAL_ERROR);
    }
  } else {
    return failure(
      'Must provide --data, --file, or --hash',
      ExitCode.VALIDATION
    );
  }

  // Construct signed data
  const signedData = constructSignedData({
    actor: resolution.actor,
    signedAt: options['signed-at'] as Timestamp,
    requestHash,
  });

  // Verify the signature
  try {
    const valid = await verifyEd25519Signature(
      options['public-key'] as PublicKey,
      options.signature as Signature,
      signedData
    );

    const data = {
      valid,
      actor: resolution.actor,
      signedAt: options['signed-at'],
      requestHash,
    };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      return success(valid ? 'valid' : 'invalid');
    }

    if (valid) {
      return success(data, 'Signature is VALID');
    } else {
      return success(data, 'Signature is INVALID');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to verify signature: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const verifyCommand: Command = {
  name: 'verify',
  description: 'Verify a signature against data',
  usage: 'sf identity verify [options]',
  help: `Verify an Ed25519 signature against data.

The signature must have been computed over: actor|signedAt|requestHash

Required options:
  -s, --signature <sig>      Signature to verify (base64)
  -k, --public-key <key>     Public key (base64)
      --signed-at <time>     Timestamp when signed (ISO 8601)

Data options (one required):
  -d, --data <string>        Original data that was signed
  -f, --file <path>          File containing original data
      --hash <hash>          Request hash that was signed

Examples:
  sf identity verify --signature <sig> --public-key <key> --signed-at 2024-01-01T00:00:00Z --data "hello" --actor alice
  sf identity verify -s <sig> -k <key> --signed-at <time> --hash abc123... --actor alice`,
  options: verifyOptions,
  handler: verifyHandler as Command['handler'],
};

// ============================================================================
// Keygen Command
// ============================================================================

async function keygenHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  try {
    const keypair = await generateEd25519Keypair();

    const data = {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
    };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      // In quiet mode, return just the public key (safest for scripts)
      return success(keypair.publicKey);
    }

    const lines: string[] = [];
    lines.push('Generated Ed25519 keypair:');
    lines.push('');
    lines.push(`Public Key:  ${keypair.publicKey}`);
    lines.push(`Private Key: ${keypair.privateKey}`);
    lines.push('');
    lines.push('IMPORTANT: Store the private key securely. It cannot be recovered.');
    lines.push('');
    lines.push('Register this entity with:');
    lines.push(`  sf entity register <name> --public-key ${keypair.publicKey}`);
    lines.push('');
    lines.push('Sign requests with:');
    lines.push('  sf --sign-key <private-key> --actor <name> <command>');

    return success(data, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to generate keypair: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const keygenCommand: Command = {
  name: 'keygen',
  description: 'Generate a new Ed25519 keypair',
  usage: 'sf identity keygen',
  help: `Generate a new Ed25519 keypair for cryptographic identity.

The keypair can be used for:
  - Registering an entity with a public key
  - Signing requests in cryptographic mode

Output:
  - Public Key: Register with 'sf entity register --public-key <key>'
  - Private Key: Use with --sign-key to sign requests

SECURITY: The private key should be stored securely and never shared.

Examples:
  sf identity keygen
  sf identity keygen --json
  sf identity keygen --quiet  # Returns just the public key`,
  options: [],
  handler: keygenHandler as Command['handler'],
};

// ============================================================================
// Hash Command
// ============================================================================

interface HashOptions extends GlobalOptions {
  data?: string;
  file?: string;
}

const hashOptions: CommandOption[] = [
  {
    name: 'data',
    short: 'd',
    description: 'Data to hash',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Path to file to hash',
    hasValue: true,
  },
];

async function hashHandler(
  _args: string[],
  options: HashOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  let dataToHash: string;

  if (options.data) {
    dataToHash = options.data;
  } else if (options.file) {
    try {
      dataToHash = readFileSync(options.file, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(`Failed to read file: ${message}`, ExitCode.GENERAL_ERROR);
    }
  } else {
    return failure('Must provide --data or --file', ExitCode.VALIDATION);
  }

  try {
    const hash = await hashRequestBody(dataToHash);

    const data = { hash, length: dataToHash.length };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      return success(hash);
    }

    return success(data, `SHA256: ${hash}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to hash data: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const hashCommand: Command = {
  name: 'hash',
  description: 'Compute SHA256 hash of data',
  usage: 'sf identity hash [options]',
  help: `Compute the SHA256 hash of data for use in signing.

Options:
  -d, --data <string>    Data to hash
  -f, --file <path>      File to hash

Examples:
  sf identity hash --data "hello world"
  sf identity hash --file request.json`,
  options: hashOptions,
  handler: hashHandler as Command['handler'],
};

export const identityCommand: Command = {
  name: 'identity',
  description: 'Manage identity settings',
  usage: 'sf identity [subcommand]',
  help: `Manage identity settings and view current actor.

Without a subcommand, shows the current actor identity (same as 'sf whoami').

Subcommands:
  whoami    Show current actor identity
  mode      Show or set identity mode
  sign      Sign data using a private key
  verify    Verify a signature against data
  keygen    Generate a new Ed25519 keypair
  hash      Compute SHA256 hash of data

Examples:
  sf identity              Show current identity
  sf identity whoami       Same as above
  sf identity mode         Show current identity mode
  sf identity mode soft    Set identity mode to soft
  sf identity keygen       Generate a new keypair
  sf identity sign --data "hello" --sign-key <key>
  sf identity verify --signature <sig> --public-key <key> --data "hello"`,
  handler: identityHandler as Command['handler'],
  subcommands: {
    whoami: whoamiCommand,
    sign: signCommand,
    verify: verifyCommand,
    keygen: keygenCommand,
    hash: hashCommand,
    mode: {
      name: 'mode',
      description: 'Show or set identity mode',
      usage: 'sf identity mode [mode]',
      help: `Show or set the identity verification mode.

Available modes:
  soft          Name-based identity without verification (default)
  cryptographic Key-based identity with signature verification
  hybrid        Accepts both verified and unverified actors

Examples:
  sf identity mode              Show current mode
  sf identity mode soft         Set to soft mode
  sf identity mode cryptographic  Set to cryptographic mode`,
      options: [],
      handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
        const mode = getOutputMode(options);

        if (args.length === 0) {
          // Show current mode
          loadConfig();
          const currentMode = getValue('identity.mode');
          const source = getValueSource('identity.mode');

          const data = { mode: currentMode, source };

          if (mode === 'json') {
            return success(data);
          }

          if (mode === 'quiet') {
            return success(currentMode);
          }

          return success(data, `Identity mode: ${currentMode} (from ${source})`);
        }

        // Set mode
        const newMode = args[0].toLowerCase();
        const validModes = Object.values(IdentityMode);

        if (!validModes.includes(newMode as IdentityMode)) {
          return failure(
            `Invalid identity mode: ${newMode}. Must be one of: ${validModes.join(', ')}`,
            ExitCode.VALIDATION
          );
        }

        try {
          const { setValue } = await import('../../config/index.js');
          setValue('identity.mode', newMode as IdentityMode);

          const data = { mode: newMode, previous: getValue('identity.mode') };

          if (mode === 'json') {
            return success(data);
          }

          if (mode === 'quiet') {
            return success(newMode);
          }

          return success(data, `Identity mode set to: ${newMode}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return failure(`Failed to set identity mode: ${message}`, ExitCode.GENERAL_ERROR);
        }
      },
    },
  },
};
