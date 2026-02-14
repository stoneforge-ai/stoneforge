/**
 * Systems module for Stoneforge
 *
 * Contains core system implementations for identity, authentication,
 * and other cross-cutting concerns.
 */

// Identity system
export {
  // Types
  IdentityMode,
  type Signature,
  type PublicKey,
  type SignedRequestFields,
  type SigningInput,
  type SignedData,
  VerificationStatus,
  type VerificationResult,
  type IdentityConfig,
  type EntityLookup,
  type VerifySignatureOptions,
  // Constants
  DEFAULT_TIME_TOLERANCE,
  DEFAULT_IDENTITY_CONFIG,
  // Validation
  isValidIdentityMode,
  validateIdentityMode,
  isValidPublicKey,
  validatePublicKey,
  isValidSignature,
  validateSignature,
  isValidRequestHash,
  validateRequestHash,
  isValidTimeTolerance,
  validateTimeTolerance,
  // Type guards
  isSignedRequestFields,
  validateSignedRequestFields,
  isVerificationResult,
  isIdentityConfig,
  validateIdentityConfig,
  // Signed data
  constructSignedData,
  parseSignedData,
  // Time tolerance
  checkTimeTolerance,
  validateTimeTolerance2,
  // Verification factories
  verificationSuccess,
  verificationFailure,
  verificationNotSigned,
  // Ed25519 operations
  verifyEd25519Signature,
  signEd25519,
  generateEd25519Keypair,
  // Verification pipeline
  verifySignature,
  shouldAllowRequest,
  // Utilities
  hashRequestBody,
  createSignedRequest,
  createIdentityConfig,
} from './identity.js';
