/**
 * Shared environment construction for Claude provider spawns.
 *
 * Both the headless (SDK) and interactive (PTY) providers construct the env
 * passed to the spawned claude subprocess. The shape is the same across both,
 * and one detail in particular is load-bearing: CLAUDECODE must be stripped.
 *
 * Why: modern versions of the claude binary read CLAUDECODE and refuse to
 * start when it is set, with the error "Claude Code cannot be launched
 * inside another Claude Code session." If stoneforge is invoked from inside
 * an existing Claude Code session (any user running `sf` from Claude Code's
 * bash tool, or a director orchestrating from within Claude Code), the
 * inherited CLAUDECODE=1 triggers this guard and the spawn dies before init.
 * The Anthropic SDK reports it as `Claude Code process exited with code 1`,
 * which the spawner surfaces as the cryptic `Session exited before init`.
 *
 * Stoneforge IS the parent process; the spawned claude is a fresh top-level
 * session, not nested. So CLAUDECODE has no business being set in the child.
 */

export interface ClaudeSpawnEnvOptions {
  /** Override environment variables (caller-supplied; merged after process.env). */
  readonly overrides?: Record<string, string>;
  /** Stoneforge project root, exposed to the child as STONEFORGE_ROOT. */
  readonly stoneforgeRoot?: string;
}

/**
 * Build the environment for a spawned claude subprocess.
 *
 * Order of precedence (later wins):
 * 1. process.env (inherited)
 * 2. caller's `overrides`
 *
 * Then CLAUDECODE is unconditionally stripped (regardless of source), and
 * STONEFORGE_ROOT is set if provided.
 */
export function buildClaudeSpawnEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: ClaudeSpawnEnvOptions = {}
): Record<string, string> {
  const env: Record<string, string> = {
    ...(baseEnv as Record<string, string>),
    ...options.overrides,
  };
  delete env.CLAUDECODE;
  if (options.stoneforgeRoot) {
    env.STONEFORGE_ROOT = options.stoneforgeRoot;
  }
  return env;
}
