import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { DirectTaskRunSummary } from "./direct-task-summary.js";
import {
  runControlPlaneOperation,
  type ControlPlaneOperationName,
} from "./control-plane-operations.js";
import { runControlPlaneCommand } from "./persistent-cli.js";
import { PersistentControlPlane } from "./persistent-control-plane.js";
import { SQLiteControlPlaneStore } from "./sqlite-control-plane-store.js";

describe("persistent control-plane CLI", () => {
  const durableWorkflowOperations = [
    "reset",
    "initialize-workspace",
    "configure-repository",
    "configure-runtime",
    "configure-agent",
    "configure-role-definition",
    "configure-policy",
    "evaluate-readiness",
    "create-direct-task",
    "execute-next-dispatch",
    "open-merge-request",
    "observe-provider-state",
    "record-local-verification-passed",
    "publish-policy-status",
    "request-review",
    "execute-next-dispatch",
    "complete-agent-review",
    "publish-policy-status",
    "record-human-approval",
    "publish-policy-status",
    "merge-when-ready",
  ] satisfies readonly ControlPlaneOperationName[];

  const workflowCommands = [
    "reset",
    "initialize-workspace",
    "configure-repo",
    "configure-runtime",
    "configure-agent",
    "configure-role",
    "configure-policy",
    "validate-workspace",
    "create-direct-task",
    "run-worker",
    "open-merge-request",
    "record-verification-passed",
    "request-review",
    "run-worker",
    "complete-review",
    "approve",
    "merge",
  ];

  it("drives the smoke flow through durable control-plane operations", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const sqlitePath = join(tempDir, "control-plane.sqlite");
    const controlPlane = new PersistentControlPlane(
      new SQLiteControlPlaneStore(sqlitePath),
    );

    try {
      for (const operation of durableWorkflowOperations) {
        const status = await runControlPlaneOperation(controlPlane, operation);

        expect(status.command).toBe(operation);
      }

      const summary = await controlPlane.readSummary();

      expect(summary.workspaceState).toBe("ready");
      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
      expect(summary.policyCheckState).toBe("passed");
      expect(summary.providerSessionIds).toEqual([
        "local-task-start-1",
        "local-merge_request-start-1",
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("exposes durable command names through the CLI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const sqlitePath = join(tempDir, "control-plane.sqlite");

    try {
      for (const operation of durableWorkflowOperations) {
        await expectCommandArgsToPass(operation, sqliteArgs(sqlitePath));
      }

      const summary = await runSummaryCommandWithArgs(sqliteArgs(sqlitePath));

      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
      expect(summary.policyCheckState).toBe("passed");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("drives the local tracer bullet through the command boundary after restart", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const storePath = join(tempDir, "control-plane.json");

    try {
      for (const command of workflowCommands) {
        await expectCommandToPass(command, storePath);
      }

      const summary = await runSummaryCommand(storePath);

      expect(summary.workspaceState).toBe("ready");
      expect(summary.policyPreset).toBe("supervised");
      expect(summary.taskState).toBe("completed");
      expect(summary.implementationAssignmentState).toBe("succeeded");
      expect(summary.implementationSessionState).toBe("ended");
      expect(summary.reviewAssignmentState).toBe("succeeded");
      expect(summary.reviewSessionState).toBe("ended");
      expect(summary.mergeRequestState).toBe("merged");
      expect(summary.verificationState).toBe("passed");
      expect(summary.policyCheckState).toBe("passed");
      expect(summary.approvalGateSatisfied).toBe(true);
      expect(summary.pullRequestMerged).toBe(true);
      expect(summary.providerSessionIds).toEqual([
        "local-task-start-1",
        "local-merge_request-start-1",
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("drives the local tracer bullet through the SQLite command boundary after restart", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const sqlitePath = join(tempDir, "control-plane.sqlite");

    try {
      for (const command of workflowCommands) {
        await expectCommandArgsToPass(command, sqliteArgs(sqlitePath));
      }

      const summary = await runSummaryCommandWithArgs(sqliteArgs(sqlitePath));

      expect(summary.workspaceState).toBe("ready");
      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
      expect(summary.providerSessionIds).toEqual([
        "local-task-start-1",
        "local-merge_request-start-1",
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("resumes a partially completed flow after recreating the SQLite service", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const sqlitePath = join(tempDir, "control-plane.sqlite");

    try {
      const firstProcess = new PersistentControlPlane(
        new SQLiteControlPlaneStore(sqlitePath),
      );

      await firstProcess.reset();
      await firstProcess.initializeWorkspace();
      await firstProcess.configureRepository();
      await firstProcess.configureRuntime();
      await firstProcess.configureAgent();
      await firstProcess.configureRole();
      await firstProcess.configurePolicy();
      await firstProcess.validateWorkspace();
      await firstProcess.createDirectTask();
      await firstProcess.runWorker();

      const resumedProcess = new PersistentControlPlane(
        new SQLiteControlPlaneStore(sqlitePath),
      );

      await resumedProcess.openMergeRequest();
      await resumedProcess.recordVerificationPassed();
      await resumedProcess.requestReview();
      await resumedProcess.runWorker();
      await resumedProcess.completeReview();
      await resumedProcess.approve();
      await resumedProcess.merge();

      const summary = await resumedProcess.readSummary();

      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
      expect(summary.pullRequestMerged).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("runs the one-shot persistent tracer bullet with the default SQLite store", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));

    try {
      const result = await runCommand(["tracer-bullet", "--json"], tempDir);
      const summary = JSON.parse(result.stdout) as DirectTaskRunSummary;

      expect(result.code).toBe(0);
      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("runs the one-shot persistent tracer bullet command", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const storePath = join(tempDir, "control-plane.json");

    try {
      const result = await runCommand([
        "tracer-bullet",
        "--store",
        storePath,
        "--json",
      ]);
      const summary = JSON.parse(result.stdout) as DirectTaskRunSummary;

      expect(result.code).toBe(0);
      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("runs the one-shot control-plane smoke flow command", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const storePath = join(tempDir, "control-plane.json");

    try {
      const result = await runCommand([
        "smoke-flow",
        "--store",
        storePath,
        "--json",
      ]);
      const summary = JSON.parse(result.stdout) as DirectTaskRunSummary;

      expect(result.code).toBe(0);
      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skipIf(isCoverageRun())(
    "runs the full packaged CLI tracer bullet",
    async () => {
      const tempDir = await mkdtemp(
        join(tmpdir(), "stoneforge-control-plane-"),
      );
      const storePath = join(tempDir, "control-plane.json");

      try {
        const result = await runPackagedCli([
          "tracer-bullet",
          "--store",
          storePath,
          "--json",
        ]);
        const summary = parseCliSummary(result.stdout);

        expect(summary.workspaceState).toBe("ready");
        expect(summary.taskState).toBe("completed");
        expect(summary.mergeRequestState).toBe("merged");
        expect(summary.providerSessionIds).toEqual([
          "local-task-start-1",
          "local-merge_request-start-1",
        ]);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.skipIf(isCoverageRun())(
    "runs the packaged CLI workflow one command at a time",
    async () => {
      const tempDir = await mkdtemp(
        join(tmpdir(), "stoneforge-control-plane-"),
      );
      const storePath = join(tempDir, "control-plane.json");

      try {
        for (const command of workflowCommands) {
          await expectPackagedCommandToPass(command, storePath);
        }

        const summary = await runPackagedSummaryCommand(storePath);

        expect(summary.workspaceState).toBe("ready");
        expect(summary.policyPreset).toBe("supervised");
        expect(summary.taskState).toBe("completed");
        expect(summary.implementationAssignmentState).toBe("succeeded");
        expect(summary.reviewAssignmentState).toBe("succeeded");
        expect(summary.mergeRequestState).toBe("merged");
        expect(summary.verificationState).toBe("passed");
        expect(summary.policyCheckState).toBe("passed");
        expect(summary.approvalGateSatisfied).toBe(true);
        expect(summary.providerSessionIds).toEqual([
          "local-task-start-1",
          "local-merge_request-start-1",
        ]);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it("prints human-readable status and command errors", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const storePath = join(tempDir, "control-plane.json");

    try {
      const status = await runCommand([
        "initialize-workspace",
        "--store",
        storePath,
      ]);
      const failedSummary = await runCommand(["summary", "--store", storePath]);
      const unknown = await runCommand([
        "unknown-command",
        "--store",
        storePath,
      ]);

      expect(status.code).toBe(0);
      expect(status.stdout).toContain("initialize-workspace: workspace_1");
      expect(failedSummary.code).toBe(1);
      expect(failedSummary.stderr).toContain(
        "No implementation Assignment exists",
      );
      expect(unknown.code).toBe(1);
      expect(unknown.stderr).toContain("Unknown command unknown-command");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports invalid stores and incomplete workflow actions", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const storePath = join(tempDir, "control-plane.json");

    try {
      const reset = await runCommand(["reset", "--store", storePath]);
      const missingIntent = await runCommand([
        "run-worker",
        "--store",
        storePath,
      ]);

      await expectCommandToPass("initialize-workspace", storePath);

      const notReady = await runCommand([
        "validate-workspace",
        "--store",
        storePath,
      ]);

      await writeFile(storePath, "{not json");

      const invalidStore = await runCommand(["summary", "--store", storePath]);

      expect(reset.stdout).toBe("reset: control-plane-store");
      expect(missingIntent.stderr).toContain(
        "No queued dispatch intent exists",
      );
      expect(notReady.stderr).toContain("Workspace is not ready");
      expect(invalidStore.stderr).toContain(
        "Could not read persisted control-plane snapshot",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports SQL store configuration errors through the CLI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const blockedParent = join(tempDir, "blocked");

    try {
      await writeFile(blockedParent, "not a directory");

      const sqliteFailure = await runCommand([
        "summary",
        ...sqliteArgs(join(blockedParent, "control-plane.sqlite")),
      ]);
      const postgresFailure = await runCommand([
        "summary",
        "--store-backend",
        "postgres",
      ]);

      expect(sqliteFailure.code).toBe(1);
      expect(sqliteFailure.stderr).toContain("Could not open SQLite");
      expect(postgresFailure.code).toBe(1);
      expect(postgresFailure.stderr).toContain("requires a connection string");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skipIf(postgresTestUrl() === undefined)(
    "runs the command-boundary tracer bullet against PostgreSQL",
    async () => {
      const postgresUrl = postgresTestUrl();

      if (postgresUrl === undefined) {
        throw new Error("PostgreSQL test URL is required.");
      }

      const storeArgs = [
        "--store-backend",
        "postgres",
        "--postgres-url",
        postgresUrl,
      ];

      for (const command of workflowCommands) {
        await expectCommandArgsToPass(command, storeArgs);
      }

      const summary = await runSummaryCommandWithArgs(storeArgs);

      expect(summary.workspaceState).toBe("ready");
      expect(summary.taskState).toBe("completed");
      expect(summary.mergeRequestState).toBe("merged");
    },
    30_000,
  );

  it("prints the one-shot tracer bullet summary for humans", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "stoneforge-control-plane-"));
    const storePath = join(tempDir, "control-plane.json");

    try {
      const result = await runCommand(["tracer-bullet", "--store", storePath]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Stoneforge V2 direct-task scenario complete",
      );
      expect(result.stdout).toContain("Policy preset: supervised");
      expect(result.stdout).toContain("Provider Sessions:");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function expectCommandToPass(
  command: string,
  storePath: string,
): Promise<void> {
  const result = await runCommand([command, "--store", storePath, "--json"]);

  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
}

async function expectCommandArgsToPass(
  command: string,
  storeArgs: readonly string[],
): Promise<void> {
  const result = await runCommand([command, ...storeArgs, "--json"]);

  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
}

async function runSummaryCommand(
  storePath: string,
): Promise<DirectTaskRunSummary> {
  const result = await runCommand(["summary", "--store", storePath, "--json"]);

  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");

  return JSON.parse(result.stdout) as DirectTaskRunSummary;
}

async function runSummaryCommandWithArgs(
  storeArgs: readonly string[],
): Promise<DirectTaskRunSummary> {
  const result = await runCommand(["summary", ...storeArgs, "--json"]);

  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");

  return JSON.parse(result.stdout) as DirectTaskRunSummary;
}

async function expectPackagedCommandToPass(
  command: string,
  storePath: string,
): Promise<void> {
  const result = await runPackagedCli([
    command,
    "--store",
    storePath,
    "--json",
  ]);

  expect(lastJsonLine(result.stdout)).toContain(`"command":"${command}"`);
}

async function runPackagedSummaryCommand(
  storePath: string,
): Promise<DirectTaskRunSummary> {
  const result = await runPackagedCli([
    "summary",
    "--store",
    storePath,
    "--json",
  ]);

  return parseCliSummary(result.stdout);
}

async function runCommand(
  argv: readonly string[],
  cwd?: string,
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  const originalCwd = process.cwd();

  if (cwd !== undefined) {
    process.chdir(cwd);
  }

  try {
    const code = await runControlPlaneCommand(argv, {
      write: (text) => {
        stdout = text;
      },
      writeError: (text) => {
        stderr = text;
      },
    });

    return { code, stdout, stderr };
  } finally {
    if (cwd !== undefined) {
      process.chdir(originalCwd);
    }
  }
}

function sqliteArgs(sqlitePath: string): string[] {
  return ["--store-backend", "sqlite", "--sqlite-path", sqlitePath];
}

function postgresTestUrl(): string | undefined {
  return process.env.STONEFORGE_CONTROL_PLANE_POSTGRES_TEST_URL;
}

async function runPackagedCli(argv: readonly string[]): Promise<{
  stdout: string;
  stderr: string;
}> {
  await ensurePackagedCliBuilt();

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["dist/cli.js", ...argv],
      { cwd: controlPlanePackageDir(), env: childProcessEnv() },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

let packagedCliBuild: Promise<void> | undefined;

function ensurePackagedCliBuilt(): Promise<void> {
  packagedCliBuild ??= buildPackagedCli();
  return packagedCliBuild;
}

function buildPackagedCli(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "pnpm",
      ["run", "build"],
      { cwd: controlPlanePackageDir(), env: childProcessEnv() },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

function parseCliSummary(stdout: string): DirectTaskRunSummary {
  const jsonLine = lastJsonLine(stdout);

  return JSON.parse(jsonLine) as DirectTaskRunSummary;
}

function lastJsonLine(stdout: string): string {
  const lines = stdout.split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (line.startsWith("{") && line.endsWith("}")) {
      return line;
    }
  }

  throw new Error("Packaged CLI did not print a JSON summary.");
}

function controlPlanePackageDir(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

function childProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  delete env.NODE_V8_COVERAGE;

  return env;
}

function isCoverageRun(): boolean {
  return process.env.npm_lifecycle_event === "coverage";
}
