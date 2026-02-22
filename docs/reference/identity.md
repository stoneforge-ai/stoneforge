# Identity System Reference

**File:** `packages/quarry/src/systems/identity.ts`

Authentication and signature verification for multi-agent systems.

## Overview

The identity system supports three modes:
- **Soft:** Name-based identity without verification (default)
- **Cryptographic:** Ed25519 signature verification
- **Hybrid:** Mixed mode accepting both

## Identity Modes

```typescript
import { IdentityMode } from '@stoneforge/quarry';

IdentityMode.SOFT           // 'soft' - default
IdentityMode.CRYPTOGRAPHIC  // 'cryptographic'
IdentityMode.HYBRID         // 'hybrid'
```

| Mode | Verification | Use Case |
|------|--------------|----------|
| `soft` | None | Development, single-agent |
| `cryptographic` | Ed25519 | Production, multi-agent |
| `hybrid` | Optional | Migration, mixed environments |

## Configuration

```typescript
import {
  IdentityConfig,
  DEFAULT_IDENTITY_SYSTEM_CONFIG,
  createIdentityConfig,
} from '@stoneforge/quarry';

// Default configuration
const config = DEFAULT_IDENTITY_SYSTEM_CONFIG;
// {
//   mode: 'soft',
//   timeTolerance: 300000,  // 5 minutes
//   allowUnregisteredActors: true,
// }

// Custom configuration
const config = createIdentityConfig({
  mode: IdentityMode.CRYPTOGRAPHIC,
  timeTolerance: 60000,  // 1 minute
  allowUnregisteredActors: false,
});
```

## Ed25519 Keys and Signatures

### Key Format

- **Public key:** 44-character base64 string (32 bytes)
- **Private key:** PKCS8 format, base64 encoded
- **Signature:** 88-character base64 string (64 bytes)

### Generate Keypair

```typescript
import { generateEd25519Keypair } from '@stoneforge/quarry';

const { publicKey, privateKey } = await generateEd25519Keypair();
// publicKey: 44-char base64
// privateKey: PKCS8 base64 (for signing)
```

### Sign Data

```typescript
import { signEd25519 } from '@stoneforge/quarry';

const signature = await signEd25519(privateKey, 'data to sign');
```

### Verify Signature

```typescript
import { verifyEd25519Signature } from '@stoneforge/quarry';

const isValid = await verifyEd25519Signature(publicKey, signature, 'data');
```

## Signed Requests

### Signature Format

Signed data format: `actor|signedAt|requestHash`

```typescript
import { constructSignedData, parseSignedData } from '@stoneforge/quarry';

const signedData = constructSignedData({
  actor: 'agent-name',
  signedAt: '2024-01-15T10:30:00.000Z',
  requestHash: 'a1b2c3...',  // SHA256 hex (64 chars)
});
// 'agent-name|2024-01-15T10:30:00.000Z|a1b2c3...'

const parsed = parseSignedData(signedData);
```

### Create Signed Request

```typescript
import { createSignedRequest, hashRequestBody } from '@stoneforge/quarry';

// Hash the request body
const requestHash = await hashRequestBody({ action: 'create', data: {...} });

// Create signed request fields
const signedRequest = await createSignedRequest(
  { actor: 'agent-name', requestHash },
  privateKey,
  signedAt  // Optional, defaults to now
);

// Result:
// {
//   signature: '...',
//   signedAt: '2024-01-15T10:30:00.000Z',
//   actor: 'agent-name',
// }
```

## Verification

### Full Verification Pipeline

```typescript
import { verifySignature, type EntityLookup } from '@stoneforge/quarry';

const lookupEntity: EntityLookup = async (actor) => {
  const entity = await api.lookupEntityByName(actor);
  return entity ? { publicKey: entity.publicKey } : null;
};

const result = await verifySignature({
  signedRequest: { signature, signedAt, actor },
  requestHash,
  lookupEntity,
  config: { mode: IdentityMode.CRYPTOGRAPHIC },
});

if (result.allowed) {
  console.log(`Verified actor: ${result.actor}`);
} else {
  console.error(`Verification failed: ${result.error}`);
}
```

### Verification Result

```typescript
interface VerificationResult {
  status: VerificationStatus;
  allowed: boolean;
  actor?: string;
  error?: string;
  details?: {
    signatureAgeMs?: number;
    entityFound?: boolean;
    hasPublicKey?: boolean;
  };
}
```

### Verification Status

| Status | Description |
|--------|-------------|
| `valid` | Signature is valid |
| `invalid` | Signature doesn't match |
| `expired` | Outside time tolerance |
| `actor_not_found` | Entity not found |
| `no_public_key` | Entity has no public key |
| `not_signed` | No signature provided |

### Time Tolerance

```typescript
import { checkTimeTolerance, DEFAULT_TIME_TOLERANCE } from '@stoneforge/quarry';

// Default: 5 minutes (300000ms)
const result = checkTimeTolerance(signedAt, DEFAULT_TIME_TOLERANCE);
// { valid: boolean, ageMs: number, expiredBy?: number }

// Custom tolerance
const result = checkTimeTolerance(signedAt, 60000);  // 1 minute
```

## Actor Context

### Resolving Actor

```typescript
// Note: resolveActor and ActorSource are internal to quarry and not
// re-exported from the public package index. They are used internally
// by the CLI and API for actor resolution.
import { resolveActor, type ActorSource } from '@stoneforge/quarry/src/systems/identity';

const context = resolveActor({
  explicitActor: 'agent-1',     // Highest priority
  cliActor: 'cli-agent',        // From --actor flag
  configActor: 'default-agent', // From config
  elementCreatedBy: 'original', // Fallback
});

// context.actor: 'agent-1'
// context.source: 'explicit'
// context.verified: false
```

### Actor Sources

| Source | Priority | Description |
|--------|----------|-------------|
| `explicit` | 1 (highest) | Provided in operation |
| `cli_flag` | 2 | From `--actor` flag |
| `config` | 3 | From configuration |
| `element` | 4 | From element's `createdBy` |
| `system` | - | System-generated |

### Validate Actor

```typescript
// Note: Internal function, not in public API index
import { validateSoftActor } from '@stoneforge/quarry/src/systems/identity';

const result = await validateSoftActor(actor, {
  lookupEntity,
  config: { allowUnregisteredActors: false },
});

if (result.valid) {
  console.log(`Actor context: ${result.context}`);
}
```

## Verification Middleware

```typescript
// Note: Internal function, not in public API index
import { createVerificationMiddleware } from '@stoneforge/quarry/src/systems/identity';

const middleware = createVerificationMiddleware({
  lookupEntity: (actor) => api.lookupEntityByName(actor),
  config: { mode: IdentityMode.CRYPTOGRAPHIC },
});

// Use in request handling
const result = await middleware({
  signedRequest: req.signedRequest,
  body: req.body,
});

if (!result.allowed) {
  throw new Error(result.error);
}

console.log(`Verified: ${result.context.actor}`);
```

### Middleware Context

```typescript
interface MiddlewareContext {
  actor?: string;
  verified: boolean;
  verificationResult?: VerificationResult;
  mode: IdentityMode;
}
```

## Validation Functions

```typescript
import {
  isValidIdentityMode,
  isValidPublicKey,
  isValidSignature,
  isValidRequestHash,
  isValidTimeTolerance,
  validateIdentityMode,
  validatePublicKey,
  validateSignature,
  validateRequestHash,
  validateTimeTolerance,
} from '@stoneforge/quarry';

// Type guards (return boolean)
isValidPublicKey(value);    // 44-char base64
isValidSignature(value);    // 88-char base64
isValidRequestHash(value);  // 64-char hex

// Validators (throw on invalid)
validatePublicKey(value);
validateSignature(value);
validateRequestHash(value);
```

## CLI Commands

```bash
# Show current identity
sf identity whoami

# Generate keypair
sf identity keygen

# Sign data
sf identity sign --data "data to sign" --sign-key <key> --actor alice

# Verify signature
sf identity verify --signature <sig> --public-key <key> --signed-at <time> --data "data" --actor alice

# Compute hash
sf identity hash --data "data"

# Show/set mode
sf identity mode
sf identity mode cryptographic
```

## Integration Example

### Setting Up Cryptographic Identity

```typescript
import {
  generateEd25519Keypair,
  createIdentityConfig,
  IdentityMode,
} from '@stoneforge/quarry';

// 1. Generate keypair for agent
const { publicKey, privateKey } = await generateEd25519Keypair();

// 2. Register agent with public key
const agent = await api.create({
  type: 'entity',
  createdBy: adminId,
  name: 'secure-agent',
  entityType: 'agent',
  publicKey: publicKey,
});

// 3. Configure cryptographic mode
const config = createIdentityConfig({
  mode: IdentityMode.CRYPTOGRAPHIC,
  timeTolerance: 60000,  // 1 minute
  allowUnregisteredActors: false,
});

// 4. Sign requests
import { createSignedRequest, hashRequestBody } from '@stoneforge/quarry';

const requestHash = await hashRequestBody(requestBody);
const signedRequest = await createSignedRequest(
  { actor: 'secure-agent', requestHash },
  privateKey
);

// 5. Include in API calls
// signedRequest is included in request for verification
```
