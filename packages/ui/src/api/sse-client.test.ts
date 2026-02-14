import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SSEClient, createSSEClient, type SSEConnectionState } from './sse-client';

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      this.onopen?.();
    }, 0);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  // Helper to simulate receiving an event
  simulateEvent(type: string, data: string): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = { data } as MessageEvent;
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  // Helper to simulate error
  simulateError(): void {
    this.onerror?.();
  }
}

// Store original EventSource
const originalEventSource = (globalThis as unknown as { EventSource: unknown }).EventSource;

describe('SSEClient', () => {
  let mockEsInstance: MockEventSource | null = null;

  beforeEach(() => {
    // Mock global EventSource
    (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url);
        mockEsInstance = this;
      }
    };
  });

  afterEach(() => {
    // Restore original EventSource
    (globalThis as unknown as { EventSource: unknown }).EventSource = originalEventSource;
    mockEsInstance = null;
  });

  test('creates client with options', () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      reconnectDelay: 10000,
      maxReconnectDelay: 60000,
      params: { category: 'all' },
      eventTypes: ['session_event', 'notification'],
    });

    expect(client.connectionState).toBe('disconnected');
    expect(client.isConnected).toBe(false);
  });

  test('createSSEClient factory function works', () => {
    const client = createSSEClient({
      url: 'http://localhost:3457/api/events/stream',
    });

    expect(client).toBeInstanceOf(SSEClient);
    expect(client.connectionState).toBe('disconnected');
  });

  test('connect() transitions to connecting state', () => {
    const client = new SSEClient({ url: 'http://localhost:3457/api/events/stream' });
    const states: SSEConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    expect(states).toContain('connecting');
  });

  test('connect() transitions to connected on open', async () => {
    const client = new SSEClient({ url: 'http://localhost:3457/api/events/stream' });
    const states: SSEConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    // Wait for async connection
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(states).toContain('connected');
    expect(client.isConnected).toBe(true);
  });

  test('disconnect() closes connection and sets state', async () => {
    const client = new SSEClient({ url: 'http://localhost:3457/api/events/stream' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.isConnected).toBe(true);

    client.disconnect();
    expect(client.connectionState).toBe('disconnected');
    expect(client.isConnected).toBe(false);
  });

  test('builds URL with params', () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      params: { category: 'tasks', limit: '10' },
    });

    client.connect();
    expect(mockEsInstance?.url).toBe('http://localhost:3457/api/events/stream?category=tasks&limit=10');
  });

  test('addEventListener receives typed events', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['session_event'],
    });
    const events: unknown[] = [];

    client.addEventListener('session_event', (data) => events.push(data));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    mockEsInstance?.simulateEvent('session_event', JSON.stringify({
      type: 'output',
      sessionId: 'session-123',
      content: 'Hello',
    }));

    expect(events).toHaveLength(1);
    expect((events[0] as { sessionId: string }).sessionId).toBe('session-123');
  });

  test('removeEventListener stops notifications', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['session_event'],
    });
    const events: unknown[] = [];

    const remove = client.addEventListener('session_event', (data) => events.push(data));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Remove listener before sending event
    remove();

    mockEsInstance?.simulateEvent('session_event', JSON.stringify({ test: true }));

    expect(events).toHaveLength(0);
  });

  test('addMessageHandler receives all events', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['session_event', 'notification'],
    });
    const received: Array<{ type: string; data: unknown }> = [];

    client.addMessageHandler((type, data) => received.push({ type, data }));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    mockEsInstance?.simulateEvent('session_event', JSON.stringify({ id: 1 }));
    mockEsInstance?.simulateEvent('notification', JSON.stringify({ id: 2 }));

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('session_event');
    expect(received[1].type).toBe('notification');
  });

  test('addStateListener receives state changes', async () => {
    const client = new SSEClient({ url: 'http://localhost:3457/api/events/stream' });
    const states: SSEConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(states).toContain('disconnected');
    expect(states).toContain('connecting');
    expect(states).toContain('connected');
  });

  test('setParams updates and reconnects', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      params: { category: 'all' },
    });

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));

    client.setParams({ category: 'tasks' });

    expect(mockEsInstance?.url).toBe('http://localhost:3457/api/events/stream?category=tasks');
  });

  test('handles connected event', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['connected'],
    });
    const states: SSEConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate server sending connected event
    mockEsInstance?.simulateEvent('connected', '{}');

    expect(states.filter((s) => s === 'connected').length).toBeGreaterThanOrEqual(1);
  });

  test('handles heartbeat event', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['heartbeat'],
    });

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not throw
    mockEsInstance?.simulateEvent('heartbeat', '{}');
  });

  test('handles non-JSON data', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['custom'],
    });
    const events: unknown[] = [];

    client.addEventListener('custom', (data) => events.push(data));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Send non-JSON data
    mockEsInstance?.simulateEvent('custom', 'plain text');

    expect(events).toHaveLength(1);
    expect((events[0] as { raw: string }).raw).toBe('plain text');
  });

  test('dynamically registered event types work', async () => {
    const client = new SSEClient({
      url: 'http://localhost:3457/api/events/stream',
      eventTypes: ['connected'],
    });
    const events: unknown[] = [];

    // Register listener for a type not in initial eventTypes
    client.addEventListener('custom_type', (data) => events.push(data));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    mockEsInstance?.simulateEvent('custom_type', JSON.stringify({ id: 1 }));

    expect(events).toHaveLength(1);
  });
});
