import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectEditedPaths,
  filesForEslint,
  nonMarkdownFiles,
} from "./quality-hook-paths.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookStateRoot = resolve(repoRoot, ".git", "stoneforge-quality-hooks");
const markerRoot = resolve(hookStateRoot, "sessions");
const historyPath = resolve(hookStateRoot, "history.log");

const hookTargets = {
  fast: {
    script: "quality:fast",
    interrupted: "Fast quality checks were interrupted",
    failed:
      "Fast quality checks failed after a file edit. Fix the issue before continuing.",
    startup: "Unable to start fast quality checks",
  },
  turn: {
    script: "quality:turn",
    interrupted: "Full quality gate was interrupted",
    failed:
      "Full quality gate failed at end of turn. Inspect the output, fix the failures, and run the gate again.",
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

function runCommand(label, command, args) {
  if (args.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
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
      rejectRun(new Error(`${label} failed to start: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      const reason = signal
        ? `${label} was interrupted by ${signal}`
        : `${label} exited with ${code}`;
      rejectRun(new Error(reason));
    });
  });
}

async function autofixEditedFiles(agentName, sessionKey, editedPaths) {
  if (editedPaths.length === 0) {
    writeReceipt(
      agentName,
      sessionKey,
      "autofix",
      "skipped",
      "no-edited-file-paths",
    );
    return;
  }

  const eslintFiles = filesForEslint(editedPaths);

  if (eslintFiles.length > 0) {
    await runCommand("ESLint auto-fix", "pnpm", [
      "exec",
      "eslint",
      "--fix",
      "--no-error-on-unmatched-pattern",
      ...eslintFiles,
    ]);
  }

  await runCommand("Prettier auto-format", "pnpm", [
    "exec",
    "prettier",
    "--write",
    "--ignore-unknown",
    ...editedPaths,
  ]);

  writeReceipt(
    agentName,
    sessionKey,
    "autofix",
    "passed",
    `${editedPaths.length}-file(s)`,
  );
}

async function prepareFastHook(agentName, sessionKey, hookInput) {
  const editedPaths = [...collectEditedPaths(repoRoot, hookInput)];
  const changedCodePaths = nonMarkdownFiles(editedPaths);

  if (changedCodePaths.length === 0) {
    const detail =
      editedPaths.length === 0 ? "no-edited-file-paths" : "markdown-only";
    writeReceipt(agentName, sessionKey, "fast", "skipped", detail);
    return false;
  }

  markSessionChanged(agentName, sessionKey, "fast");

  try {
    await autofixEditedFiles(agentName, sessionKey, editedPaths);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    writeReceipt(agentName, sessionKey, "autofix", "failed");
    process.exit(2);
  }

  return true;
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

export async function runQualityHook(targetName, options = {}) {
  const target = hookTargets[targetName];
  const agentName = options.agentName ?? "unknown-agent";
  const hookInput = readHookInput();
  const sessionKey = sessionKeyFor(agentName, hookInput);

  if (!target) {
    console.error(`Unknown quality hook target: ${targetName}`);
    process.exit(2);
  }

  if (targetName === "fast") {
    const shouldRun = await prepareFastHook(agentName, sessionKey, hookInput);

    if (!shouldRun) {
      process.exit(0);
    }
  }

  const claimedMarkerPath =
    targetName === "turn" ? claimSessionMarker(sessionKey) : null;

  if (targetName === "turn" && !claimedMarkerPath) {
    writeReceipt(
      agentName,
      sessionKey,
      targetName,
      "skipped",
      "no-session-file-edits",
    );
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

    const reason = signal
      ? `${target.interrupted} by ${signal}.`
      : target.failed;

    console.error(reason);
    restoreSessionMarker(claimedMarkerPath);
    writeReceipt(
      agentName,
      sessionKey,
      targetName,
      "failed",
      signal ?? `exit-${code}`,
    );
    process.exit(2);
  });
}
