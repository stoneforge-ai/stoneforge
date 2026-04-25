import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookStateRoot = resolve(repoRoot, ".git", "stoneforge-quality-hooks");
const markerRoot = resolve(hookStateRoot, "sessions");
const historyPath = resolve(hookStateRoot, "history.log");

const hookTargets = {
  fast: {
    script: "quality:fast",
    interrupted: "Fast quality checks were interrupted",
    failed: "Fast quality checks failed after a file edit. Fix the issue before continuing.",
    startup: "Unable to start fast quality checks",
  },
  turn: {
    script: "quality:turn",
    interrupted: "Full quality gate was interrupted",
    failed: "Full quality gate failed at end of turn. Inspect the output, fix the failures, and run the gate again.",
    startup: "Unable to start full quality gate",
  },
};

function readHookInput() {
  try {
    const input = readFileSync(0, "utf8").trim();
    return input ? JSON.parse(input) : {};
  } catch {
    return {};
  }
}

function writeReceipt(agentName, sessionKey, targetName, status, detail) {
  mkdirSync(hookStateRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  const suffix = detail ? ` ${detail}` : "";
  writeFileSync(
    historyPath,
    `${timestamp} ${agentName} ${sessionKey} ${targetName} ${status}${suffix}\n`,
    { flag: "a" },
  );
}

function sanitizeKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function sessionKeyFor(agentName, hookInput) {
  const sessionId =
    hookInput.session_id ??
    hookInput.sessionId ??
    hookInput.conversation_id ??
    hookInput.conversationId ??
    process.env.CODEX_SESSION_ID ??
    process.env.CLAUDE_SESSION_ID ??
    "no-session";

  return `${sanitizeKey(agentName)}-${sanitizeKey(sessionId)}`;
}

function markerPathFor(sessionKey) {
  return resolve(markerRoot, `${sessionKey}.changed`);
}

function markSessionChanged(agentName, sessionKey, targetName) {
  mkdirSync(markerRoot, { recursive: true });
  writeFileSync(markerPathFor(sessionKey), new Date().toISOString());
  writeReceipt(agentName, sessionKey, targetName, "marked");
}

function claimSessionMarker(sessionKey) {
  const markerPath = markerPathFor(sessionKey);
  const runningPath = `${markerPath}.running`;

  if (!existsSync(markerPath)) {
    return existsSync(runningPath) ? runningPath : null;
  }

  if (existsSync(runningPath)) {
    rmSync(runningPath);
  }

  renameSync(markerPath, runningPath);
  return runningPath;
}

function restoreSessionMarker(markerPath) {
  if (!markerPath || !existsSync(markerPath)) {
    return;
  }

  const originalPath = markerPath.replace(/\.running$/, "");
  renameSync(markerPath, originalPath);
}

function clearClaimedMarker(markerPath) {
  if (markerPath && existsSync(markerPath)) {
    rmSync(markerPath);
  }
}

export function runQualityHook(targetName, options = {}) {
  const target = hookTargets[targetName];
  const agentName = options.agentName ?? "unknown-agent";
  const hookInput = readHookInput();
  const sessionKey = sessionKeyFor(agentName, hookInput);

  if (!target) {
    console.error(`Unknown quality hook target: ${targetName}`);
    process.exit(2);
  }

  if (targetName === "fast") {
    markSessionChanged(agentName, sessionKey, targetName);
  }

  const claimedMarkerPath = targetName === "turn" ? claimSessionMarker(sessionKey) : null;

  if (targetName === "turn" && !claimedMarkerPath) {
    writeReceipt(agentName, sessionKey, targetName, "skipped", "no-session-file-edits");
    process.exit(0);
  }

  const child = spawn("pnpm", [target.script], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  child.stdout.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    console.error(`${target.startup}: ${error.message}`);
    restoreSessionMarker(claimedMarkerPath);
    writeReceipt(agentName, sessionKey, targetName, "failed", error.message);
    process.exit(2);
  });

  child.on("exit", (code, signal) => {
    if (code === 0) {
      clearClaimedMarker(claimedMarkerPath);
      writeReceipt(agentName, sessionKey, targetName, "passed");
      process.exit(0);
    }

    const reason = signal ? `${target.interrupted} by ${signal}.` : target.failed;

    console.error(reason);
    restoreSessionMarker(claimedMarkerPath);
    writeReceipt(agentName, sessionKey, targetName, "failed", signal ?? `exit-${code}`);
    process.exit(2);
  });
}
