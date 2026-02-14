import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ApiClient, ApiError, createApiClient } from './api-client';

// Mock fetch
const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof createMockFetch>;

function createMockFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let nextResponse: { status: number; data: unknown; headers?: Record<string, string> } = {
    status: 200,
    data: {},
  };

  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });

    return {
      ok: nextResponse.status >= 200 && nextResponse.status < 300,
      status: nextResponse.status,
      statusText: nextResponse.status === 200 ? 'OK' : 'Error',
      headers: {
        get: (name: string) => nextResponse.headers?.[name.toLowerCase()] ?? null,
      },
      json: async () => nextResponse.data,
      text: async () => String(nextResponse.data),
    } as Response;
  };

  return {
    fn,
    calls,
    setNextResponse(status: number, data: unknown, headers?: Record<string, string>) {
      nextResponse = { status, data, headers };
    },
    reset() {
      calls.length = 0;
      nextResponse = { status: 200, data: {} };
    },
  };
}

describe('ApiClient', () => {
  beforeEach(() => {
    mockFetch = createMockFetch();
    globalThis.fetch = mockFetch.fn as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('creates client with options', () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3456',
      defaultHeaders: { 'X-Custom': 'value' },
      defaultTimeout: 5000,
    });

    expect(client).toBeInstanceOf(ApiClient);
  });

  test('createApiClient factory function works', () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:3456',
    });

    expect(client).toBeInstanceOf(ApiClient);
  });

  test('get() makes GET request', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(200, { id: 1, name: 'Test' }, { 'content-type': 'application/json' });

    const result = await client.get<{ id: number; name: string }>('/api/items/1');

    expect(result).toEqual({ id: 1, name: 'Test' });
    expect(mockFetch.calls[0].url).toBe('http://localhost:3456/api/items/1');
    expect(mockFetch.calls[0].init.method).toBe('GET');
  });

  test('get() with query params', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(200, [], { 'content-type': 'application/json' });

    await client.get('/api/items', { status: 'active', limit: 10 });

    expect(mockFetch.calls[0].url).toBe('http://localhost:3456/api/items?status=active&limit=10');
  });

  test('get() omits undefined params', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(200, [], { 'content-type': 'application/json' });

    await client.get('/api/items', { status: 'active', limit: undefined });

    expect(mockFetch.calls[0].url).toBe('http://localhost:3456/api/items?status=active');
  });

  test('post() makes POST request with body', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(201, { id: 1 }, { 'content-type': 'application/json' });

    const result = await client.post<{ id: number }>('/api/items', { name: 'New Item' });

    expect(result).toEqual({ id: 1 });
    expect(mockFetch.calls[0].init.method).toBe('POST');
    expect(mockFetch.calls[0].init.body).toBe(JSON.stringify({ name: 'New Item' }));
  });

  test('put() makes PUT request', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(200, { id: 1, name: 'Updated' }, { 'content-type': 'application/json' });

    await client.put('/api/items/1', { name: 'Updated' });

    expect(mockFetch.calls[0].init.method).toBe('PUT');
  });

  test('patch() makes PATCH request', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(200, { id: 1, name: 'Patched' }, { 'content-type': 'application/json' });

    await client.patch('/api/items/1', { name: 'Patched' });

    expect(mockFetch.calls[0].init.method).toBe('PATCH');
  });

  test('delete() makes DELETE request', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(204, undefined, {});

    await client.delete('/api/items/1');

    expect(mockFetch.calls[0].init.method).toBe('DELETE');
  });

  test('handles 204 No Content', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(204, undefined, {});

    const result = await client.delete('/api/items/1');

    expect(result).toBeUndefined();
  });

  test('includes default headers', async () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3456',
      defaultHeaders: { 'X-API-Key': 'secret' },
    });
    mockFetch.setNextResponse(200, {}, { 'content-type': 'application/json' });

    await client.get('/api/items');

    expect(mockFetch.calls[0].init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-Key': 'secret',
    });
  });

  test('request headers override defaults', async () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3456',
      defaultHeaders: { 'X-Custom': 'default' },
    });
    mockFetch.setNextResponse(200, {}, { 'content-type': 'application/json' });

    await client.get('/api/items', undefined, { headers: { 'X-Custom': 'override' } });

    expect((mockFetch.calls[0].init.headers as Record<string, string>)['X-Custom']).toBe('override');
  });

  test('throws ApiError on non-OK response', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(404, { message: 'Not found' }, { 'content-type': 'application/json' });

    let caught: unknown;
    try {
      await client.get('/api/items/999');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).message).toBe('Not found');
  });

  test('ApiError includes data', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    const errorData = { code: 'NOT_FOUND', message: 'Item not found', details: { id: 999 } };
    mockFetch.setNextResponse(404, errorData, { 'content-type': 'application/json' });

    let caught: unknown;
    try {
      await client.get('/api/items/999');
    } catch (error) {
      caught = error;
    }
    expect((caught as ApiError).data).toEqual(errorData);
  });

  test('handles non-JSON error response', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(500, 'Internal Server Error', {});

    // Mock json() to throw
    const origFn = mockFetch.fn;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const resp = await origFn(url, init);
      return {
        ...resp,
        json: async () => {
          throw new Error('Not JSON');
        },
      } as Response;
    }) as typeof fetch;

    let caught: unknown;
    try {
      await client.get('/api/items');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });

  test('handles text response', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456' });
    mockFetch.setNextResponse(200, 'Plain text response', { 'content-type': 'text/plain' });

    const result = await client.get<string>('/api/text');

    expect(result).toBe('Plain text response');
  });

  test('removes trailing slash from baseUrl', async () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3456/' });
    mockFetch.setNextResponse(200, {}, { 'content-type': 'application/json' });

    await client.get('/api/items');

    expect(mockFetch.calls[0].url).toBe('http://localhost:3456/api/items');
  });

  test('onRequest interceptor modifies request', async () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3456',
      onRequest: async (_url, init) => ({
        ...init,
        headers: {
          ...init.headers as Record<string, string>,
          'X-Intercepted': 'true',
        },
      }),
    });
    mockFetch.setNextResponse(200, {}, { 'content-type': 'application/json' });

    await client.get('/api/items');

    expect((mockFetch.calls[0].init.headers as Record<string, string>)['X-Intercepted']).toBe('true');
  });

  test('onError interceptor can modify error', async () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3456',
      onError: async (error) => new ApiError(error.status, 'Modified', error.data),
    });
    mockFetch.setNextResponse(404, { message: 'Not found' }, { 'content-type': 'application/json' });

    let caught: unknown;
    try {
      await client.get('/api/items/999');
    } catch (error) {
      caught = error;
    }
    expect((caught as ApiError).statusText).toBe('Modified');
  });
});
