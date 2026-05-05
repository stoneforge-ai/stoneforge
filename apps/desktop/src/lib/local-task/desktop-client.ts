import { createLocalTaskConsole } from "@stoneforge/app-shell"
import type {
  CreateLocalTaskConsoleInput,
  LocalControlPlaneConnectionMode,
  LocalTaskConsole
} from "@stoneforge/app-shell"

import { deterministicDesktopProviders } from "./deterministic-providers.js"

export type DesktopLocalConnectionMode = Extract<
  LocalControlPlaneConnectionMode,
  "local" | "managed-by-desktop"
>

export interface CreateElectronDesktopTaskClientInput
  extends Omit<
    CreateLocalTaskConsoleInput,
    "connectionMode" | "idPrefix" | "workspaceLabel"
  > {
  readonly connectionMode?: DesktopLocalConnectionMode
}

export type ElectronDesktopTaskClient = LocalTaskConsole

export function createElectronDesktopTaskClient(
  input: CreateElectronDesktopTaskClientInput = {}
): ElectronDesktopTaskClient {
  return createLocalTaskConsole({
    ...defaultDesktopTaskClientInput(),
    ...input,
    connectionMode: input.connectionMode ?? "managed-by-desktop",
    idPrefix: "desktop-local",
    workspaceLabel: "Desktop local Workspace"
  })
}

function defaultDesktopTaskClientInput(): CreateLocalTaskConsoleInput {
  if (process.env.STONEFORGE_DESKTOP_PROVIDER_MODE !== "deterministic") {
    return {}
  }

  return {
    providerInstances: deterministicDesktopProviders()
  }
}
