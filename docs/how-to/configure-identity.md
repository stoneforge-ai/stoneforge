# How to Configure Identity

Guide for setting up identity verification in multi-agent systems.

## Identity Modes

| Mode | Verification | Use Case |
|------|--------------|----------|
| `soft` | None (default) | Development, single-agent |
| `cryptographic` | Ed25519 signatures | Production, multi-agent |
| `hybrid` | Optional signatures | Migration, mixed environments |

## Using Soft Mode (Default)

Soft mode requires no setup. Actors are identified by name only.

```typescript
import { createQuarryAPI, createStorage } from '@stoneforge/quarry';

const backend = createStorage({ path: '.stoneforge/stoneforge.db' });
const api = createQuarryAPI(backend);

// Create with actor name (no verification)
await api.create({
  type: 'task',
  title: 'My Task',
  createdBy: 'my-agent',  // Just a name
});
```

```bash
# CLI uses --actor flag
sf task create --title "My Task" --actor my-agent
```

## Setting Up Cryptographic Mode

### Step 1: Generate Keypairs

For each agent that needs to sign requests:

```typescript
import { generateEd25519Keypair } from '@stoneforge/quarry';

const { publicKey, privateKey } = await generateEd25519Keypair();

console.log('Public key:', publicKey);   // 44-char base64
console.log('Private key:', privateKey); // Store securely!
```

Or use the CLI:

```bash
sf identity keygen
# Output:
# Public key: ABC123...= (44 chars)
# Private key: XYZ789...= (store securely!)
```

### Step 2: Register Entity with Public Key

```typescript
const agent = await api.create({
  type: 'entity',
  name: 'secure-agent',
  entityType: 'agent',
  publicKey: publicKey,  // Register the public key
  createdBy: adminEntityId,
});
```

### Step 3: Configure Cryptographic Mode

**Option A: Config File**

Create or edit `.stoneforge/config.yaml`:

```yaml
identity:
  mode: cryptographic
  timeTolerance: 300000  # 5 minutes in ms
```

**Option B: Environment Variable**

```bash
export STONEFORGE_IDENTITY_MODE=cryptographic
export STONEFORGE_IDENTITY_TIME_TOLERANCE=300000
```

**Option C: In Code**

```typescript
import { loadConfig, IdentityMode } from '@stoneforge/quarry';

const config = loadConfig({
  cliOverrides: {
    identity: {
      mode: IdentityMode.CRYPTOGRAPHIC,
      timeTolerance: 60000,  // 1 minute
    },
  },
});
```

### Step 4: Sign Requests

```typescript
import {
  createSignedRequest,
  hashRequestBody,
} from '@stoneforge/quarry';

// 1. Prepare the request body
const requestBody = {
  type: 'task',
  title: 'Secure Task',
  createdBy: 'secure-agent',
};

// 2. Hash the body
const requestHash = await hashRequestBody(requestBody);

// 3. Create signed request
const signedRequest = await createSignedRequest(
  { actor: 'secure-agent', requestHash },
  privateKey,
);

// 4. Include in API call
// The signedRequest fields (signature, signedAt, actor)
// would be included in request headers or body
```

## Verifying Requests

### Using Middleware

```typescript
import { IdentityMode } from '@stoneforge/quarry';
import { createVerificationMiddleware } from '@stoneforge/quarry/systems/identity';

const middleware = createVerificationMiddleware({
  lookupEntity: async (actor) => {
    const entity = await api.lookupEntityByName(actor);
    return entity ? { publicKey: entity.publicKey } : null;
  },
  config: {
    mode: IdentityMode.CRYPTOGRAPHIC,
    timeTolerance: 300000,
  },
});

// In request handler
async function handleRequest(req: Request) {
  const result = await middleware({
    signedRequest: req.signedRequest,
    body: req.body,
  });

  if (!result.allowed) {
    throw new Error(`Verification failed: ${result.error}`);
  }

  console.log(`Verified actor: ${result.context.actor}`);
  // Proceed with request...
}
```

### Manual Verification

```typescript
import { verifySignature, VerificationStatus } from '@stoneforge/quarry';

const result = await verifySignature({
  signedRequest: {
    signature: req.signature,
    signedAt: req.signedAt,
    actor: req.actor,
  },
  requestHash: await hashRequestBody(req.body),
  lookupEntity: (actor) => api.lookupEntityByName(actor),
  config: { mode: IdentityMode.CRYPTOGRAPHIC },
});

if (result.status === VerificationStatus.VALID) {
  console.log('Verified!', result.actor);
} else {
  console.error('Failed:', result.error);
}
```

## Using Hybrid Mode

Hybrid mode accepts both signed and unsigned requests:

```yaml
# .stoneforge/config.yaml
identity:
  mode: hybrid
```

```typescript
// Unsigned requests are allowed
const unsignedResult = await middleware({
  body: requestBody,
  // No signedRequest
});
// unsignedResult.allowed === true
// unsignedResult.context.verified === false

// Signed requests are verified
const signedResult = await middleware({
  signedRequest,
  body: requestBody,
});
// signedResult.allowed === true (if valid)
// signedResult.context.verified === true
```

## CLI Identity Commands

```bash
# Show current identity
sf whoami
sf identity whoami

# Generate new keypair
sf identity keygen

# Sign data
sf identity sign --data "data to sign" --sign-key <key>

# Verify signature
sf identity verify --signature <signature> --public-key <key> --signed-at <time> --data "data"

# Compute hash
sf identity hash --data "data"

# Show/set mode
sf identity mode
sf identity mode cryptographic
```

## Time Tolerance

Signatures include a timestamp to prevent replay attacks. The `timeTolerance` setting controls how old a signature can be:

```typescript
// Default: 5 minutes
const DEFAULT_TIME_TOLERANCE = 5 * 60 * 1000;

// For high-security: 1 minute
identity: {
  mode: 'cryptographic',
  timeTolerance: 60000,
}

// For network latency: 10 minutes
identity: {
  mode: 'cryptographic',
  timeTolerance: 600000,
}
```

## Signature Format

The signed data format is: `actor|signedAt|requestHash`

```typescript
import { constructSignedData, parseSignedData } from '@stoneforge/quarry';

// Build
const signedData = constructSignedData({
  actor: 'my-agent',
  signedAt: '2024-01-15T10:30:00.000Z',
  requestHash: 'a1b2c3d4...',  // SHA256 hex
});
// Result: 'my-agent|2024-01-15T10:30:00.000Z|a1b2c3d4...'

// Parse
const parsed = parseSignedData(signedData);
// { actor, signedAt, requestHash }
```

## Key Storage Best Practices

### Private Keys

**Never store private keys in:**
- Source code
- Config files
- Environment variables in logs
- Shared locations

**Good practices:**
- Use secrets management (Vault, AWS Secrets Manager)
- Store encrypted with passphrase
- Rotate keys periodically
- Use separate keys per environment

### Public Keys

Public keys can be stored in:
- Entity records in database
- Config files (for initial setup)
- Key servers (for distribution)

## Migration from Soft to Cryptographic

### Step 1: Enable Hybrid Mode First

```yaml
identity:
  mode: hybrid
```

### Step 2: Generate and Register Keys

For each agent:
1. Generate keypair
2. Register public key with entity
3. Store private key securely
4. Update agent to sign requests

### Step 3: Verify All Agents Signing

Monitor for unsigned requests. When all agents are signing:

### Step 4: Switch to Cryptographic Mode

```yaml
identity:
  mode: cryptographic
```

## Troubleshooting

### "Signature expired"

- Check system clocks are synchronized
- Increase `timeTolerance` if network latency is high
- Verify `signedAt` timestamp format (ISO 8601)

### "Actor not found"

- Entity must exist before signing
- Check entity name matches exactly (case-sensitive)
- Verify entity lookup function works

### "No public key"

- Entity exists but has no `publicKey` field
- Update entity to add public key:
  ```typescript
  await api.update(entityId, { publicKey });
  ```

### "Invalid signature"

- Private key doesn't match registered public key
- Request body was modified after signing
- Request hash computed incorrectly

### Verification Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| `valid` | Signature verified | Proceed |
| `invalid` | Signature doesn't match | Reject |
| `expired` | Too old | Reject, client retry |
| `actor_not_found` | Entity doesn't exist | Reject |
| `no_public_key` | Entity has no key | Reject or setup key |
| `not_signed` | No signature provided | Depends on mode |
