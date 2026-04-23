/**
 * Async Queue
 *
 * Push-to-pull bridge that adapts push-based SSE events into a
 * pull-based async iterable for the HeadlessSession interface.
 *
 * @module
 */

/**
 * A simple async iterable queue that bridges push-based producers
 * (SSE event processor) to pull-based consumers (async iteration).
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waitingResolve: ((result: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;

    if (this.waitingResolve) {
      this.waitingResolve({ value: item, done: false });
      this.waitingResolve = null;
    } else {
      this.queue.push(item);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waitingResolve) {
      this.waitingResolve({ value: undefined as unknown as T, done: true });
      this.waitingResolve = null;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise((resolve) => {
          this.waitingResolve = resolve;
        });
      },
    };
  }
}
