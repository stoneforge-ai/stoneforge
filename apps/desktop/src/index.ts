import { createLocalTaskConsole } from "@stoneforge/app-shell"
import type {
  CreateLocalTaskConsoleInput,
  LocalControlPlaneConnectionMode,
  LocalTaskConsole,
} from "@stoneforge/app-shell"

export type DesktopLocalConnectionMode = Extract<
  LocalControlPlaneConnectionMode,
  "local" | "managed-by-desktop"
>

export interface CreateElectronDesktopTaskClientInput extends Omit<
  CreateLocalTaskConsoleInput,
  "connectionMode" | "idPrefix" | "workspaceLabel"
> {
  readonly connectionMode?: DesktopLocalConnectionMode
}

export type ElectronDesktopTaskClient = LocalTaskConsole

export { createDesktopTaskBridge } from "./bridge.js"
export type { DesktopTaskBridge } from "./bridge.js"

export function createElectronDesktopTaskClient(
  input: CreateElectronDesktopTaskClientInput = {}
): ElectronDesktopTaskClient {
  return createLocalTaskConsole({
    ...input,
    connectionMode: input.connectionMode ?? "managed-by-desktop",
    idPrefix: "desktop-local",
    workspaceLabel: "Desktop local Workspace",
  })
}
