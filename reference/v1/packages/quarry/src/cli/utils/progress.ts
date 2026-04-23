/**
 * Simple TTY progress bar that writes to stderr.
 *
 * Design decisions:
 * - Writes to **stderr** so stdout remains clean for `--json` and piped output
 * - Only renders when stderr is a TTY (non-interactive/CI gets no progress bar)
 * - Uses `\r` carriage return for in-place updates
 * - Clears the line on `finish()` so final output is clean
 * - No external dependencies
 */

export interface ProgressBar {
  /** Update the progress bar with the current count of completed items. */
  update(current: number): void;
  /** Clear the progress bar line and stop rendering. */
  finish(): void;
}

const BAR_WIDTH = 40;

/**
 * Create a progress bar that renders to stderr.
 *
 * @param total - Total number of items to process
 * @param label - Label shown before the progress bar (e.g., "Linking", "Pushing")
 * @returns A ProgressBar instance with `update()` and `finish()` methods
 */
export function createProgressBar(total: number, label: string): ProgressBar {
  const isTTY = process.stderr.isTTY;

  return {
    update(current: number) {
      if (!isTTY) return; // Skip in non-interactive mode
      const clamped = Math.min(current, total);
      const pct = total > 0 ? Math.round((clamped / total) * 100) : 0;
      const filled = Math.round((pct / 100) * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      process.stderr.write(`\r${label}: ${bar} ${pct}% (${clamped}/${total})`);
    },
    finish() {
      if (!isTTY) return;
      process.stderr.write('\r' + ' '.repeat(80) + '\r'); // Clear the line
    },
  };
}

/**
 * A no-op progress bar that does nothing.
 * Used when output mode is json, quiet, or when progress display is not desired.
 */
export const nullProgressBar: ProgressBar = {
  update() {},
  finish() {},
};
