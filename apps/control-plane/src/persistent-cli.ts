import { join } from "node:path";

import {
  expectDirectTaskRunComplete,
  formatDirectTaskRunSummary,
} from "./direct-task-summary.js";
import {
  type ControlPlaneCommandStatus,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import { FileControlPlaneStore } from "./json-control-plane-store.js";
import {
  githubValueFlags,
  parseMergeProviderConfig,
} from "./github-integration-config.js";
import { createMergeRequestAdapter } from "./merge-request-provider.js";
import type { LoadControlPlaneOptions } from "./persistent-control-plane-context.js";
import { PersistentControlPlane } from "./persistent-control-plane.js";
import { runPersistentTracerBullet } from "./persistent-tracer-bullet.js";
import { PostgresControlPlaneStore } from "./postgres-control-plane-store.js";
import { SQLiteControlPlaneStore } from "./sqlite-control-plane-store.js";

export interface CommandIo {
  write(text: string): void;
  writeError(text: string): void;
}

type CommandHandler = (
  controlPlane: PersistentControlPlane,
) => Promise<ControlPlaneCommandStatus>;

const commandHandlers = {
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
  "observe-provider-state": (controlPlane) =>
    controlPlane.observeProviderState(),
  "record-verification-passed": (controlPlane) =>
    controlPlane.recordVerificationPassed(),
  "request-review": (controlPlane) => controlPlane.requestReview(),
  "complete-review": (controlPlane) => controlPlane.completeReview(),
  approve: (controlPlane) => controlPlane.approve(),
  merge: (controlPlane) => controlPlane.merge(),
} satisfies Record<string, CommandHandler>;

type CommandName = keyof typeof commandHandlers;

export async function runControlPlaneCommand(
  argv: readonly string[],
  io: CommandIo,
): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    const store = createControlPlaneStore(parsed.store);
    const controlPlane = new PersistentControlPlane(
      store,
      controlPlaneOptions(parsed.mergeProvider),
    );

    if (parsed.command === "tracer-bullet") {
      const summary = await runPersistentTracerBullet(
        store,
        controlPlaneOptions(parsed.mergeProvider),
      );
      if (mergeExpected(parsed.mergeProvider)) {
        expectDirectTaskRunComplete(summary);
      }
      writeSummary(io, parsed.json, summary);
      return 0;
    }

    if (parsed.command === "summary") {
      writeSummary(io, parsed.json, await controlPlane.readSummary());
      return 0;
    }

    writeStatus(
      io,
      parsed.json,
      await runCommand(controlPlane, parsedCommandName(parsed.command)),
    );
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
  command: CommandName,
): Promise<ControlPlaneCommandStatus> {
  return commandHandlers[command](controlPlane);
}

function parseArgs(argv: readonly string[]): {
  command: string;
  store: ControlPlaneStoreConfig;
  json: boolean;
  mergeProvider: ReturnType<typeof parseMergeProviderConfig>;
} {
  const valueFlags = [
    "--store",
    "--store-backend",
    "--sqlite-path",
    "--postgres-url",
    "--json-store",
    ...githubValueFlags(),
  ] as const;
  const command = argv.find((arg, index) => {
    return !arg.startsWith("--") && !isOptionValue(argv, index, valueFlags);
  });

  return {
    command: command ?? "tracer-bullet",
    store: parseStoreConfig(argv),
    json: argv.includes("--json"),
    mergeProvider: parseMergeProviderConfig(argv, process.env),
  };
}

function controlPlaneOptions(
  config: ReturnType<typeof parseMergeProviderConfig>,
): LoadControlPlaneOptions {
  if (config.provider === "github") {
    return {
      mergeProvider: "github",
      mergeRequestAdapter: createMergeRequestAdapter(config),
      mergeEnabled: mergeExpected(config),
      repository: repositoryConfig(config),
      sourceBranchPrefix: config.github.sourceBranchPrefix,
    };
  }

  return {
    mergeProvider: "fake",
    mergeRequestAdapter: createMergeRequestAdapter(config),
    mergeEnabled: mergeExpected(config),
  };
}

function mergeExpected(
  config: ReturnType<typeof parseMergeProviderConfig>,
): boolean {
  return config.provider === "fake" || config.github.allowMerge;
}

function repositoryConfig(
  config: Extract<
    ReturnType<typeof parseMergeProviderConfig>,
    { provider: "github" }
  >,
) {
  return {
    installationId: String(config.github.installationId ?? "discovered"),
    owner: config.github.owner,
    repository: config.github.repo,
    defaultBranch: config.github.baseBranch,
  };
}

function parsedCommandName(command: string): CommandName {
  if (isCommandName(command)) {
    return command;
  }

  throw new Error(`Unknown command ${command}. Run tracer-bullet or summary.`);
}

function isCommandName(command: string): command is CommandName {
  return Object.prototype.hasOwnProperty.call(commandHandlers, command);
}

type StoreBackend = "json" | "postgres" | "sqlite";

interface ControlPlaneStoreConfig {
  backend: StoreBackend;
  jsonPath?: string;
  postgresUrl?: string;
  sqlitePath?: string;
}

function parseStoreConfig(argv: readonly string[]): ControlPlaneStoreConfig {
  const legacyStorePath = optionValue(argv, "--store");
  const backend = storeBackend(
    optionValue(argv, "--store-backend") ??
      process.env.STONEFORGE_CONTROL_PLANE_STORE ??
      legacyBackend(legacyStorePath),
  );

  if (backend === "json") {
    return { backend, jsonPath: jsonPath(argv, legacyStorePath) };
  }

  if (backend === "postgres") {
    return {
      backend,
      postgresUrl:
        optionValue(argv, "--postgres-url") ??
        process.env.STONEFORGE_CONTROL_PLANE_POSTGRES_URL,
    };
  }

  return {
    backend,
    sqlitePath:
      optionValue(argv, "--sqlite-path") ??
      process.env.STONEFORGE_CONTROL_PLANE_SQLITE_PATH ??
      join(process.cwd(), ".stoneforge", "control-plane.sqlite"),
  };
}

function createControlPlaneStore(
  config: ControlPlaneStoreConfig,
): ControlPlaneStore {
  if (config.backend === "json") {
    return new FileControlPlaneStore(
      config.jsonPath ??
        join(process.cwd(), ".stoneforge", "control-plane.json"),
    );
  }

  if (config.backend === "postgres") {
    return new PostgresControlPlaneStore(config.postgresUrl);
  }

  return new SQLiteControlPlaneStore(
    config.sqlitePath ??
      join(process.cwd(), ".stoneforge", "control-plane.sqlite"),
  );
}

function legacyBackend(legacyStorePath: string | undefined): StoreBackend {
  if (legacyStorePath === undefined) {
    return "sqlite";
  }

  return "json";
}

function jsonPath(
  argv: readonly string[],
  legacyStorePath: string | undefined,
): string {
  return (
    optionValue(argv, "--json-store") ??
    legacyStorePath ??
    process.env.STONEFORGE_CONTROL_PLANE_JSON_PATH ??
    join(process.cwd(), ".stoneforge", "control-plane.json")
  );
}

function storeBackend(value: string): StoreBackend {
  if (value === "json" || value === "postgres" || value === "sqlite") {
    return value;
  }

  throw new Error(
    `Unknown control-plane store backend ${value}. Use sqlite, postgres, or json.`,
  );
}

function optionValue(
  argv: readonly string[],
  option: string,
): string | undefined {
  const index = argv.indexOf(option);

  if (index < 0) {
    return undefined;
  }

  const value = argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

function isOptionValue(
  argv: readonly string[],
  index: number,
  valueFlags: readonly string[],
): boolean {
  const previous = argv[index - 1];

  return previous !== undefined && valueFlags.includes(previous);
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
