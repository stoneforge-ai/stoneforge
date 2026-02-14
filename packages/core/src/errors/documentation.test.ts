import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  ValidationErrorCode,
  NotFoundErrorCode,
  ConflictErrorCode,
  ConstraintErrorCode,
  StorageErrorCode,
  IdentityErrorCode,
} from './codes.js';

/**
 * Tests to ensure error documentation is complete and accurate.
 * These tests validate that the specs/api/errors.md file documents all error codes.
 *
 * NOTE: The specs directory was removed in favor of docs/. These tests are skipped
 * until error documentation is added to the new docs structure.
 */

// Walk up from packages/core/src/errors to find root specs directory
const rootDir = path.resolve(import.meta.dir, '..', '..', '..', '..');
const specsPath = path.join(rootDir, 'specs', 'api', 'errors.md');
const specFileExists = fs.existsSync(specsPath);

// Skip all tests if the spec file doesn't exist
describe.skipIf(!specFileExists)('Error Documentation', () => {
  const specContent = specFileExists ? fs.readFileSync(specsPath, 'utf-8') : '';

  describe('All error codes are documented in the spec', () => {
    it('should document all validation error codes', () => {
      const validationCodes = Object.values(ValidationErrorCode);
      for (const code of validationCodes) {
        expect(specContent).toContain(code);
      }
    });

    it('should document all not found error codes', () => {
      const notFoundCodes = Object.values(NotFoundErrorCode);
      for (const code of notFoundCodes) {
        expect(specContent).toContain(code);
      }
    });

    it('should document all conflict error codes', () => {
      const conflictCodes = Object.values(ConflictErrorCode);
      for (const code of conflictCodes) {
        expect(specContent).toContain(code);
      }
    });

    it('should document all constraint error codes', () => {
      const constraintCodes = Object.values(ConstraintErrorCode);
      for (const code of constraintCodes) {
        expect(specContent).toContain(code);
      }
    });

    it('should document all storage error codes', () => {
      const storageCodes = Object.values(StorageErrorCode);
      for (const code of storageCodes) {
        expect(specContent).toContain(code);
      }
    });

    it('should document all identity error codes', () => {
      const identityCodes = Object.values(IdentityErrorCode);
      for (const code of identityCodes) {
        expect(specContent).toContain(code);
      }
    });
  });

  describe('Error Reference Guide completeness', () => {
    it('should have Error Reference Guide section', () => {
      expect(specContent).toContain('## Error Reference Guide');
    });

    it('should have documentation sections for each error category', () => {
      expect(specContent).toContain('### Validation Errors Reference');
      expect(specContent).toContain('### Not Found Errors Reference');
      expect(specContent).toContain('### Conflict Errors Reference');
      expect(specContent).toContain('### Constraint Errors Reference');
      expect(specContent).toContain('### Storage Errors Reference');
      expect(specContent).toContain('### Identity Errors Reference');
    });

    it('should document common causes for each validation error code', () => {
      const codes = Object.values(ValidationErrorCode);
      for (const code of codes) {
        // Check that each code has a documentation section with common causes
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Common Causes\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document resolutions for each validation error code', () => {
      const codes = Object.values(ValidationErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Resolution\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document examples for each validation error code', () => {
      const codes = Object.values(ValidationErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Example\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document common causes for each not found error code', () => {
      const codes = Object.values(NotFoundErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Common Causes\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document resolutions for each not found error code', () => {
      const codes = Object.values(NotFoundErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Resolution\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document common causes for each conflict error code', () => {
      const codes = Object.values(ConflictErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Common Causes\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document resolutions for each conflict error code', () => {
      const codes = Object.values(ConflictErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Resolution\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document common causes for each constraint error code', () => {
      const codes = Object.values(ConstraintErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Common Causes\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document resolutions for each constraint error code', () => {
      const codes = Object.values(ConstraintErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Resolution\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document common causes for each storage error code', () => {
      const codes = Object.values(StorageErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Common Causes\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document resolutions for each storage error code', () => {
      const codes = Object.values(StorageErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Resolution\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document common causes for each identity error code', () => {
      const codes = Object.values(IdentityErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Common Causes\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });

    it('should document resolutions for each identity error code', () => {
      const codes = Object.values(IdentityErrorCode);
      for (const code of codes) {
        const codeSection = new RegExp(`#### ${code}[\\s\\S]*?\\*\\*Resolution\\*\\*`);
        expect(specContent).toMatch(codeSection);
      }
    });
  });

  describe('Documentation structure', () => {
    it('should have implementation checklist with Phase 6 completed', () => {
      expect(specContent).toContain('### Phase 6: Documentation ✅');
      expect(specContent).toContain('[x] Document common causes');
      expect(specContent).toContain('[x] Document resolutions');
      expect(specContent).toContain('[x] Add examples');
    });
  });
});
