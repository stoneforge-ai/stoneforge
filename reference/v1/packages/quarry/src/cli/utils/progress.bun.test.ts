import { describe, expect, test } from 'bun:test';
import { createProgressBar, nullProgressBar } from './progress.js';

describe('progress bar', () => {
  test('createProgressBar returns object with update and finish methods', () => {
    const bar = createProgressBar(10, 'Test');
    expect(typeof bar.update).toBe('function');
    expect(typeof bar.finish).toBe('function');
  });

  test('nullProgressBar has update and finish methods', () => {
    expect(typeof nullProgressBar.update).toBe('function');
    expect(typeof nullProgressBar.finish).toBe('function');
  });

  test('nullProgressBar.update and finish are no-ops', () => {
    // Should not throw
    nullProgressBar.update(5);
    nullProgressBar.finish();
  });

  test('createProgressBar.update does not throw', () => {
    const bar = createProgressBar(10, 'Test');
    // In non-TTY test environments, update is a no-op but should not throw
    bar.update(0);
    bar.update(5);
    bar.update(10);
  });

  test('createProgressBar.finish does not throw', () => {
    const bar = createProgressBar(10, 'Test');
    bar.finish();
  });

  test('createProgressBar handles zero total', () => {
    const bar = createProgressBar(0, 'Empty');
    bar.update(0);
    bar.finish();
  });

  test('createProgressBar clamps current to total', () => {
    const bar = createProgressBar(5, 'Clamp');
    // Should not throw even when current > total
    bar.update(10);
    bar.finish();
  });
});
