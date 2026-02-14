import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  KeyboardShortcutManager,
  createKeyboardManager,
  type ShortcutDefinition,
} from './useKeyboardShortcuts';

// Mock KeyboardEvent
class MockKeyboardEvent {
  type: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: { tagName: string; isContentEditable: boolean };
  defaultPrevented = false;

  constructor(type: string, init?: KeyboardEventInit) {
    this.type = type;
    this.key = init?.key || '';
    this.metaKey = init?.metaKey || false;
    this.ctrlKey = init?.ctrlKey || false;
    this.altKey = init?.altKey || false;
    this.shiftKey = init?.shiftKey || false;
    this.target = { tagName: 'DIV', isContentEditable: false };
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

// Set up global
(globalThis as unknown as { KeyboardEvent: typeof MockKeyboardEvent }).KeyboardEvent = MockKeyboardEvent;

// Mock DOM
const mockDocument = {
  listeners: new Map<string, Set<EventListener>>(),
  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  },
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  },
  dispatchEvent(event: Event) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        (listener as (e: Event) => void)(event);
      }
    }
    return true;
  },
  clear() {
    this.listeners.clear();
  },
};

// Mock window
const mockWindow = {
  listeners: new Map<string, Set<EventListener>>(),
  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  },
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  },
  dispatchEvent(event: Event) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        (listener as (e: Event) => void)(event);
      }
    }
    return true;
  },
  clear() {
    this.listeners.clear();
  },
};

// Mock localStorage
const localStorageData: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => localStorageData[key] || null,
  setItem: (key: string, value: string) => {
    localStorageData[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageData[key];
  },
  clear: () => {
    Object.keys(localStorageData).forEach((key) => delete localStorageData[key]);
  },
};

// Setup mocks
beforeEach(() => {
  (globalThis as unknown as { document: typeof mockDocument }).document = mockDocument;
  (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;
  (globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;
  mockDocument.clear();
  mockWindow.clear();
  mockLocalStorage.clear();
});

afterEach(() => {
  mockDocument.clear();
  mockWindow.clear();
  mockLocalStorage.clear();
});

describe('KeyboardShortcutManager', () => {
  let manager: KeyboardShortcutManager;

  beforeEach(() => {
    manager = createKeyboardManager();
  });

  afterEach(() => {
    manager.stop();
    manager.clear();
  });

  test('creates manager instance', () => {
    expect(manager).toBeInstanceOf(KeyboardShortcutManager);
    expect(manager.isEnabled()).toBe(true);
    expect(manager.isStarted()).toBe(false);
  });

  test('register() adds shortcut', () => {
    let called = false;
    manager.register('Cmd+K', () => {
      called = true;
    });

    const shortcuts = manager.getShortcuts();
    expect(shortcuts).toHaveLength(1);
    expect(shortcuts[0].keys).toBe('Cmd+K');

    // Call handler
    shortcuts[0].handler();
    expect(called).toBe(true);
  });

  test('register() with description', () => {
    manager.register('G T', () => {}, 'Go to Tasks');

    const shortcuts = manager.getShortcuts();
    expect(shortcuts[0].description).toBe('Go to Tasks');
  });

  test('unregister() removes shortcut', () => {
    manager.register('Cmd+K', () => {});
    expect(manager.getShortcuts()).toHaveLength(1);

    manager.unregister('Cmd+K');
    expect(manager.getShortcuts()).toHaveLength(0);
  });

  test('setEnabled() toggles shortcuts', () => {
    expect(manager.isEnabled()).toBe(true);

    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);

    manager.setEnabled(true);
    expect(manager.isEnabled()).toBe(true);
  });

  test('start() begins listening', () => {
    expect(manager.isStarted()).toBe(false);

    manager.start();
    expect(manager.isStarted()).toBe(true);
  });

  test('stop() stops listening', () => {
    manager.start();
    expect(manager.isStarted()).toBe(true);

    manager.stop();
    expect(manager.isStarted()).toBe(false);
  });

  test('clear() removes all shortcuts', () => {
    manager.register('Cmd+K', () => {});
    manager.register('G T', () => {});
    expect(manager.getShortcuts()).toHaveLength(2);

    manager.clear();
    expect(manager.getShortcuts()).toHaveLength(0);
  });

  test('handleKeyDown() triggers modifier shortcut', () => {
    let called = false;
    manager.register('Cmd+K', () => {
      called = true;
    });
    manager.start();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    });
    manager.handleKeyDown(event);

    expect(called).toBe(true);
  });

  test('handleKeyDown() triggers Ctrl shortcut', () => {
    let called = false;
    manager.register('Ctrl+K', () => {
      called = true;
    });
    manager.start();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
    });
    manager.handleKeyDown(event);

    expect(called).toBe(true);
  });

  test('handleKeyDown() triggers sequential shortcut', () => {
    let called = false;
    manager.register('G T', () => {
      called = true;
    });
    manager.start();

    // First key
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    expect(called).toBe(false);

    // Second key
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 't' }));
    expect(called).toBe(true);
  });

  test('handleKeyDown() ignores when disabled', () => {
    let called = false;
    manager.register('Cmd+K', () => {
      called = true;
    });
    manager.setEnabled(false);
    manager.start();

    manager.handleKeyDown(new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    }));

    expect(called).toBe(false);
  });

  test('handleKeyDown() ignores modifier keys alone', () => {
    let called = false;
    manager.register('Meta', () => {
      called = true;
    });
    manager.start();

    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'Meta' }));

    expect(called).toBe(false);
  });

  test('multiple sequential shortcuts with same prefix', () => {
    let tasksCalled = false;
    let plansCalled = false;

    manager.register('G T', () => {
      tasksCalled = true;
    });
    manager.register('G P', () => {
      plansCalled = true;
    });
    manager.start();

    // G T
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 't' }));
    expect(tasksCalled).toBe(true);
    expect(plansCalled).toBe(false);

    // Reset
    tasksCalled = false;

    // G P
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'p' }));
    expect(plansCalled).toBe(true);
  });
});

describe('Shortcut Parsing', () => {
  let manager: KeyboardShortcutManager;

  beforeEach(() => {
    manager = createKeyboardManager();
  });

  afterEach(() => {
    manager.stop();
    manager.clear();
  });

  test('parses modifier + key shortcuts', () => {
    let called = false;
    manager.register('Cmd+Shift+K', () => {
      called = true;
    });
    manager.start();

    manager.handleKeyDown(new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      shiftKey: true,
    }));

    expect(called).toBe(true);
  });

  test('parses Ctrl+Alt+key shortcuts', () => {
    let called = false;
    manager.register('Ctrl+Alt+K', () => {
      called = true;
    });
    manager.start();

    manager.handleKeyDown(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      altKey: true,
    }));

    expect(called).toBe(true);
  });

  test('parses three-key sequential shortcut', () => {
    let called = false;
    manager.register('G H T', () => {
      called = true;
    });
    manager.start();

    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'g' }));
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'h' }));
    manager.handleKeyDown(new KeyboardEvent('keydown', { key: 't' }));

    expect(called).toBe(true);
  });
});

describe('Shortcut Definition Types', () => {
  test('ShortcutDefinition with path', () => {
    const def: ShortcutDefinition = {
      keys: 'G T',
      path: '/tasks',
      description: 'Go to Tasks',
      category: 'navigation',
    };

    expect(def.keys).toBe('G T');
    expect(def.path).toBe('/tasks');
    expect(def.description).toBe('Go to Tasks');
    expect(def.category).toBe('navigation');
  });

  test('ShortcutDefinition without path', () => {
    const def: ShortcutDefinition = {
      keys: 'Cmd+K',
      description: 'Open Command Palette',
      category: 'actions',
    };

    expect(def.keys).toBe('Cmd+K');
    expect(def.path).toBeUndefined();
    expect(def.description).toBe('Open Command Palette');
    expect(def.category).toBe('actions');
  });
});
