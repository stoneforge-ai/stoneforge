/**
 * Asset Routes Tests
 *
 * Tests for the asset upload and serving API endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setSystemTime } from 'bun:test';
import { createAssetRoutes } from './assets.js';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('deadbeef', 'hex')),
}));

vi.mock('../config.js', () => ({
  PROJECT_ROOT: '/workspace',
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { writeFile, readFile, mkdir, stat } from 'node:fs/promises';

const mockedWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;
const mockedReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
const mockedMkdir = mkdir as unknown as ReturnType<typeof vi.fn>;
const mockedStat = stat as unknown as ReturnType<typeof vi.fn>;

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a minimal base64-encoded 1x1 PNG image for testing.
 */
function createBase64Png(): string {
  // Minimal valid 1x1 PNG
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  return pngBuffer.toString('base64');
}

// ============================================================================
// Tests: POST /api/assets/upload
// ============================================================================

describe('POST /api/assets/upload', () => {
  let app: ReturnType<typeof createAssetRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    setSystemTime(new Date('2026-01-15T12:00:00Z'));
    app = createAssetRoutes();
  });

  afterEach(() => {
    setSystemTime();
  });

  it('uploads a valid PNG image', async () => {
    const base64Data = createBase64Png();

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test-image.png', data: base64Data }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.path).toMatch(/^\.stoneforge\/assets\/\d+-[a-f0-9]+-test-image\.png$/);
    expect(body.filename).toMatch(/^\d+-[a-f0-9]+-test-image\.png$/);
    expect(body.size).toBeGreaterThan(0);
    expect(body.url).toMatch(/^\/api\/assets\/\d+-[a-f0-9]+-test-image\.png$/);

    // Verify mkdir was called to ensure assets dir exists
    expect(mockedMkdir).toHaveBeenCalledWith('/workspace/.stoneforge/assets', { recursive: true });

    // Verify file was written
    expect(mockedWriteFile).toHaveBeenCalledOnce();
  });

  it('uploads a valid JPEG image', async () => {
    const base64Data = createBase64Png(); // Content doesn't matter for extension-based validation

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'photo.jpeg', data: base64Data }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toContain('photo');
    expect(body.filename).toMatch(/\.jpeg$/);
  });

  it('uploads a valid SVG image', async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const base64Data = Buffer.from(svgContent).toString('base64');

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'icon.svg', data: base64Data }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toMatch(/\.svg$/);
  });

  it('uploads a valid WebP image', async () => {
    const base64Data = createBase64Png();

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'photo.webp', data: base64Data }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toMatch(/\.webp$/);
  });

  it('rejects non-image file types', async () => {
    const base64Data = Buffer.from('console.log("hello")').toString('base64');

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'script.js', data: base64Data }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
    expect(body.error.message).toContain('.js');

    // Verify no file was written
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('rejects upload without data', async () => {
    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.png' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toContain('No file data');
  });

  it('rejects upload without filename', async () => {
    const base64Data = createBase64Png();

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toContain('No filename');
  });

  it('sanitizes special characters in filenames', async () => {
    const base64Data = createBase64Png();

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'my image (1) [test].png', data: base64Data }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Special characters should be replaced with underscores
    expect(body.filename).toMatch(/my_image__1___test_/);
    expect(body.filename).not.toContain(' ');
    expect(body.filename).not.toContain('(');
    expect(body.filename).not.toContain('[');
  });

  it('rejects .txt file extension', async () => {
    const base64Data = Buffer.from('hello').toString('base64');

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'readme.txt', data: base64Data }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects .html file extension', async () => {
    const base64Data = Buffer.from('<html></html>').toString('base64');

    const res = await app.request('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'page.html', data: base64Data }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
  });
});

// ============================================================================
// Tests: GET /api/assets/:filename
// ============================================================================

describe('GET /api/assets/:filename', () => {
  let app: ReturnType<typeof createAssetRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createAssetRoutes();
  });

  it('serves an existing PNG file with correct content-type', async () => {
    const fileContent = Buffer.from('fake-png-content');
    mockedStat.mockResolvedValue({ isFile: () => true } as any);
    mockedReadFile.mockResolvedValue(fileContent as any);

    const res = await app.request('/api/assets/1234-abcd-test.png');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    const body = await res.arrayBuffer();
    expect(Buffer.from(body)).toEqual(fileContent);
  });

  it('serves a JPEG file with correct content-type', async () => {
    const fileContent = Buffer.from('fake-jpeg-content');
    mockedStat.mockResolvedValue({ isFile: () => true } as any);
    mockedReadFile.mockResolvedValue(fileContent as any);

    const res = await app.request('/api/assets/1234-abcd-photo.jpg');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('serves an SVG file with correct content-type', async () => {
    const fileContent = Buffer.from('<svg></svg>');
    mockedStat.mockResolvedValue({ isFile: () => true } as any);
    mockedReadFile.mockResolvedValue(fileContent as any);

    const res = await app.request('/api/assets/1234-abcd-icon.svg');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('serves a WebP file with correct content-type', async () => {
    const fileContent = Buffer.from('fake-webp-content');
    mockedStat.mockResolvedValue({ isFile: () => true } as any);
    mockedReadFile.mockResolvedValue(fileContent as any);

    const res = await app.request('/api/assets/1234-abcd-photo.webp');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
  });

  it('returns 404 for nonexistent file', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/assets/nonexistent.png');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects directory traversal with ".." in filename', async () => {
    const res = await app.request('/api/assets/..%2F..%2Fetc%2Fpasswd');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_FILENAME');

    // Verify no file operations were attempted
    expect(mockedStat).not.toHaveBeenCalled();
    expect(mockedReadFile).not.toHaveBeenCalled();
  });

  it('rejects filename containing forward slash', async () => {
    // URL-encoded forward slash
    const res = await app.request('/api/assets/subdir%2Ffile.png');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_FILENAME');
  });

  it('sets immutable cache headers', async () => {
    const fileContent = Buffer.from('fake-content');
    mockedStat.mockResolvedValue({ isFile: () => true } as any);
    mockedReadFile.mockResolvedValue(fileContent as any);

    const res = await app.request('/api/assets/1234-abcd-test.png');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });
});
