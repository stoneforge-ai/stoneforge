import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WebSocketClient, createWebSocketClient, type ConnectionState, type WebSocketEvent } from './websocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  private sentMessages: string[] = [];

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code || 1000, reason: reason || '' });
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  // Helper to simulate receiving a message
  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }

  // Helper to simulate error
  simulateError(): void {
    this.onerror?.(new Error('Connection error'));
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1006, reason: 'Connection error' });
  }
}

// Store original WebSocket
const originalWebSocket = (globalThis as unknown as { WebSocket: unknown }).WebSocket;

describe('WebSocketClient', () => {
  let mockWsInstance: MockWebSocket | null = null;

  beforeEach(() => {
    // Mock global WebSocket
    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWsInstance = this;
      }
    };
  });

  afterEach(() => {
    // Restore original WebSocket
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
    mockWsInstance = null;
  });

  test('creates client with options', () => {
    const client = new WebSocketClient({
      url: 'ws://localhost:3456/ws',
      channels: ['tasks', 'messages'],
      reconnectDelay: 2000,
      maxReconnectDelay: 60000,
      pingInterval: 15000,
    });

    expect(client.connectionState).toBe('disconnected');
    expect(client.isConnected).toBe(false);
    expect(client.subscribedChannels).toEqual(['tasks', 'messages']);
  });

  test('createWebSocketClient factory function works', () => {
    const client = createWebSocketClient({
      url: 'ws://localhost:3456/ws',
    });

    expect(client).toBeInstanceOf(WebSocketClient);
    expect(client.connectionState).toBe('disconnected');
  });

  test('connect() transitions to connecting state', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const states: ConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    expect(states).toContain('connecting');
  });

  test('connect() transitions to connected on open', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const states: ConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    // Wait for async connection
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(states).toContain('connected');
    expect(client.isConnected).toBe(true);
  });

  test('disconnect() closes connection and sets state', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.isConnected).toBe(true);

    client.disconnect();
    expect(client.connectionState).toBe('disconnected');
    expect(client.isConnected).toBe(false);
  });

  test('subscribe() adds channels', () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });

    client.subscribe('tasks');
    expect(client.subscribedChannels).toContain('tasks');

    client.subscribe(['plans', 'workflows']);
    expect(client.subscribedChannels).toContain('plans');
    expect(client.subscribedChannels).toContain('workflows');
  });

  test('unsubscribe() removes channels', () => {
    const client = new WebSocketClient({
      url: 'ws://localhost:3456/ws',
      channels: ['tasks', 'plans', 'workflows'],
    });

    client.unsubscribe('tasks');
    expect(client.subscribedChannels).not.toContain('tasks');

    client.unsubscribe(['plans', 'workflows']);
    expect(client.subscribedChannels).toEqual([]);
  });

  test('addEventListener receives events', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const events: WebSocketEvent[] = [];

    client.addEventListener((event) => events.push(event));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate receiving an event
    const testEvent: WebSocketEvent = {
      id: 1,
      elementId: 'task-123',
      elementType: 'task',
      eventType: 'created',
      actor: 'user-1',
      oldValue: null,
      newValue: { title: 'New Task' },
      createdAt: new Date().toISOString(),
    };

    mockWsInstance?.simulateMessage(JSON.stringify({
      type: 'event',
      event: testEvent,
    }));

    expect(events).toHaveLength(1);
    expect(events[0].elementId).toBe('task-123');
  });

  test('removeEventListener stops notifications', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const events: WebSocketEvent[] = [];

    const remove = client.addEventListener((event) => events.push(event));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Remove listener before sending event
    remove();

    mockWsInstance?.simulateMessage(JSON.stringify({
      type: 'event',
      event: {
        id: 1,
        elementId: 'task-123',
        elementType: 'task',
        eventType: 'created',
        actor: 'user-1',
        oldValue: null,
        newValue: {},
        createdAt: new Date().toISOString(),
      },
    }));

    expect(events).toHaveLength(0);
  });

  test('addStateListener receives state changes', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const states: ConnectionState[] = [];

    client.addStateListener((state) => states.push(state));
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should include initial state notification + connecting + connected
    expect(states).toContain('disconnected'); // Initial
    expect(states).toContain('connecting');
    expect(states).toContain('connected');
  });

  test('removeStateListener stops notifications', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const states: ConnectionState[] = [];

    const remove = client.addStateListener((state) => states.push(state));

    // Remove before connecting
    remove();

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should only have initial notification before removal
    expect(states).toEqual(['disconnected']);
  });

  test('sendMessage sends to server', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = client.sendMessage({ type: 'custom', data: 'test' });
    expect(result).toBe(true);

    const messages = mockWsInstance?.getSentMessages();
    expect(messages).toContainEqual(JSON.stringify({ type: 'custom', data: 'test' }));
  });

  test('sendMessage returns false when not connected', () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    const result = client.sendMessage({ type: 'test' });
    expect(result).toBe(false);
  });

  test('handles subscribed message', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not throw
    mockWsInstance?.simulateMessage(JSON.stringify({
      type: 'subscribed',
      channels: ['tasks', 'messages'],
    }));
  });

  test('handles pong message', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not throw
    mockWsInstance?.simulateMessage(JSON.stringify({ type: 'pong' }));
  });

  test('handles error message', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not throw
    mockWsInstance?.simulateMessage(JSON.stringify({
      type: 'error',
      code: 'TEST_ERROR',
      message: 'Test error message',
    }));
  });

  test('handles malformed messages gracefully', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not throw
    mockWsInstance?.simulateMessage('not valid json');
    mockWsInstance?.simulateMessage('{}');
  });
});
