import type {
  LocalTaskConsole,
  LocalTaskDispatchResult,
  LocalTaskStartResult,
  LocalTaskConsoleView,
  LocalTaskRunResult,
  RunNoCodeTaskInput,
} from "@stoneforge/app-shell"

import { createElectronDesktopTaskClient } from "./desktop-client.js"

export interface DesktopTaskBridge {
  readonly dispatchNextTask: () => Promise<LocalTaskDispatchResult>
  readonly readTaskConsole: () => Promise<LocalTaskConsoleView>
  readonly runNoCodeTask: (
    input: RunNoCodeTaskInput
  ) => Promise<LocalTaskRunResult>
  readonly startNoCodeTask: (
    input: RunNoCodeTaskInput
  ) => Promise<LocalTaskStartResult>
}

export function createDesktopTaskBridge(
  client: LocalTaskConsole = createElectronDesktopTaskClient()
): DesktopTaskBridge {
  return {
    dispatchNextTask: () => client.dispatchNextTask(),
    readTaskConsole: () => client.readTaskConsole(),
    runNoCodeTask: (input) => client.runNoCodeTask(input),
    startNoCodeTask: (input) => client.startNoCodeTask(input),
  }
}
