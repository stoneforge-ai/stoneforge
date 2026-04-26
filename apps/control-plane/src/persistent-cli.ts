import { join } from "node:path";

import { expectDirectTaskRunComplete } from "./direct-task-summary.js";
import {
  type ControlPlaneCommandStatus,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import {
  isSmokeFlowCommand,
  operationForCommand,
} from "./control-plane-cli-commands.js";
import {
  type CommandIo,
  writeStatus,
  writeSummary,
} from "./control-plane-cli-output.js";
import { runControlPlaneOperation } from "./control-plane-operations.js";
import { FileControlPlaneStore } from "./json-control-plane-store.js";
import {
  githubValueFlags,
  parseMergeProviderConfig,
} from "./github-integration-config.js";
import { createMergeRequestAdapter } from "./merge-request-provider.js";
import type { LoadControlPlaneOptions } from "./persistent-control-plane-context.js";
import { PersistentControlPlane } from "./persistent-control-plane.js";
import { runControlPlaneSmokeFlow } from "./persistent-tracer-bullet.js";
import { PostgresControlPlaneStore } from "./postgres-control-plane-store.js";
import { SQLiteControlPlaneStore } from "./sqlite-control-plane-store.js";

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

    if (isSmokeFlowCommand(parsed.command)) {
      const summary = await runControlPlaneSmokeFlow(
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
      await runCommand(controlPlane, parsed.command),
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

async function runCommand(
  controlPlane: PersistentControlPlane,
  command: string,
): Promise<ControlPlaneCommandStatus> {
  const operation = operationForCommand(command);
  const status = await runControlPlaneOperation(controlPlane, operation);

  return { ...status, command };
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
    command: command ?? "smoke-flow",
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
