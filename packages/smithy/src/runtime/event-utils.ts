import type { EventEmitter } from 'events';

/**
 * Add event listeners to an emitter and dynamically raise its maxListeners
 * limit to prevent false MaxListenersExceededWarning. Returns a cleanup
 * function that removes the listeners and lowers the limit back down.
 */
export function trackListeners(
  emitter: EventEmitter,
  listeners: Record<string, (...args: any[]) => void>
): () => void {
  const count = Object.keys(listeners).length;
  emitter.setMaxListeners(emitter.getMaxListeners() + count);
  for (const [event, handler] of Object.entries(listeners)) {
    emitter.on(event, handler);
  }
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    for (const [event, handler] of Object.entries(listeners)) {
      emitter.off(event, handler);
    }
    emitter.setMaxListeners(Math.max(0, emitter.getMaxListeners() - count));
  };
}
