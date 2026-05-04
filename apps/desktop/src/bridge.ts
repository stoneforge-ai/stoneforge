import type {
  CreateLocalTaskConsoleInput,
  LocalTaskConsole,
  LocalTaskConsoleView,
  LocalTaskRunResult,
  RunNoCodeTaskInput,
} from "@stoneforge/app-shell"
import { createLocalTaskConsole } from "@stoneforge/app-shell"

import { deterministicDesktopProviders } from "./deterministic-providers.js"

export interface DesktopTaskBridge {
  readonly readTaskConsole: () => Promise<LocalTaskConsoleView>
  readonly runNoCodeTask: (
    input: RunNoCodeTaskInput
  ) => Promise<LocalTaskRunResult>
}

export function createDesktopTaskBridge(
  client: LocalTaskConsole = createDefaultDesktopTaskClient()
): DesktopTaskBridge {
  return {
    readTaskConsole: () => client.readTaskConsole(),
    runNoCodeTask: (input) => client.runNoCodeTask(input),
  }
}

function createDefaultDesktopTaskClient(): LocalTaskConsole {
  return createLocalTaskConsole({
    ...defaultDesktopTaskClientInput(),
    connectionMode: "managed-by-desktop",
    idPrefix: "desktop-local",
    workspaceLabel: "Desktop local Workspace",
  })
}

function defaultDesktopTaskClientInput(): CreateLocalTaskConsoleInput {
  if (process.env.STONEFORGE_DESKTOP_PROVIDER_MODE !== "deterministic") {
    return {}
  }

  return {
    providerInstances: deterministicDesktopProviders(),
  }
}
