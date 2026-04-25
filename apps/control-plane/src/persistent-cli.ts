import { join } from "node:path";

import {
  expectDirectTaskRunComplete,
  formatDirectTaskRunSummary,
} from "./direct-task-summary.js";
import {
  FileControlPlaneStore,
  type ControlPlaneCommandStatus,
} from "./control-plane-store.js";
import { PersistentControlPlane } from "./persistent-control-plane.js";
import { runPersistentTracerBullet } from "./persistent-tracer-bullet.js";

export interface CommandIo {
  write(text: string): void;
  writeError(text: string): void;
}

type CommandHandler = (
  controlPlane: PersistentControlPlane,
) => Promise<ControlPlaneCommandStatus>;

const commandHandlers: Record<string, CommandHandler> = {
  reset: (controlPlane) => controlPlane.reset(),
  "initialize-workspace": (controlPlane) => controlPlane.initializeWorkspace(),
  "configure-repo": (controlPlane) => controlPlane.configureRepository(),
  "configure-runtime": (controlPlane) => controlPlane.configureRuntime(),
  "configure-agent": (controlPlane) => controlPlane.configureAgent(),
  "configure-role": (controlPlane) => controlPlane.configureRole(),
  "configure-policy": (controlPlane) => controlPlane.configurePolicy(),
  "validate-workspace": (controlPlane) => controlPlane.validateWorkspace(),
  "create-direct-task": (controlPlane) => controlPlane.createDirectTask(),
  "run-worker": (controlPlane) => controlPlane.runWorker(),
  "open-merge-request": (controlPlane) => controlPlane.openMergeRequest(),
  "record-ci-passed": (controlPlane) => controlPlane.recordCiPassed(),
  "request-review": (controlPlane) => controlPlane.requestReview(),
  "complete-review": (controlPlane) => controlPlane.completeReview(),
  approve: (controlPlane) => controlPlane.approve(),
  merge: (controlPlane) => controlPlane.merge(),
};

export async function runControlPlaneCommand(
  argv: readonly string[],
  io: CommandIo,
): Promise<number> {
  const parsed = parseArgs(argv);
  const store = new FileControlPlaneStore(parsed.storePath);
  const controlPlane = new PersistentControlPlane(store);

  try {
    if (parsed.command === "tracer-bullet") {
      const summary = await runPersistentTracerBullet(store);
      expectDirectTaskRunComplete(summary);
      writeSummary(io, parsed.json, summary);
      return 0;
    }

    if (parsed.command === "summary") {
      writeSummary(io, parsed.json, await controlPlane.readSummary());
      return 0;
    }

    writeStatus(io, parsed.json, await runCommand(controlPlane, parsed.command));
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      io.writeError(error.message);
      return 1;
    }

    /* v8 ignore next */
    io.writeError("Control-plane command failed.");
    return 1;
  }
}

function runCommand(
  controlPlane: PersistentControlPlane,
  command: string,
): Promise<ControlPlaneCommandStatus> {
  const handler = commandHandlers[command];

  if (handler === undefined) {
    throw new Error(`Unknown command ${command}. Run tracer-bullet or summary.`);
  }

  return handler(controlPlane);
}

function parseArgs(argv: readonly string[]): {
  command: string;
  storePath: string;
  json: boolean;
} {
  const storeIndex = argv.indexOf("--store");
  const explicitStorePath = storeIndex >= 0 ? argv[storeIndex + 1] : undefined;
  const command = argv.find((arg, index) => {
    return !arg.startsWith("--") && index !== storeIndex + 1;
  });

  return {
    command: command ?? "tracer-bullet",
    storePath:
      explicitStorePath ?? join(process.cwd(), ".stoneforge", "control-plane.json"),
    json: argv.includes("--json"),
  };
}

function writeStatus(
  io: CommandIo,
  json: boolean,
  status: ControlPlaneCommandStatus,
): void {
  if (json) {
    io.write(JSON.stringify(status));
    return;
  }

  io.write(`${status.command}: ${status.id}${stateSuffix(status)}`);
}

function writeSummary(
  io: CommandIo,
  json: boolean,
  summary: Parameters<typeof formatDirectTaskRunSummary>[0],
): void {
  if (json) {
    io.write(JSON.stringify(summary));
    return;
  }

  io.write(formatDirectTaskRunSummary(summary));
}

function stateSuffix(status: ControlPlaneCommandStatus): string {
  if (status.state === undefined) {
    return "";
  }

  return ` (${status.state})`;
}
