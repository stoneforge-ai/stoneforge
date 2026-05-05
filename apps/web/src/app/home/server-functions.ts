import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  createLocalTaskConsole,
  type LocalTaskConsole,
  type LocalTaskDispatchResult,
  type LocalTaskRunResult,
  type LocalTaskStartResult
} from "../../lib/local-task/console.js"
import { deterministicLocalProviders } from "../../lib/local-task/deterministic-providers.js"
import { taskRunFailureMessage } from "../../lib/local-task/errors.js"

const runNoCodeTaskInput = z.object({
  intent: z.string().trim().min(1),
  provider: z.enum(["claude-code", "openai-codex"]),
  title: z.string().trim().min(1),
})

let localTaskConsole: LocalTaskConsole | undefined

export type RunLocalNoCodeTaskServerResult =
  | {
      readonly run: LocalTaskRunResult
      readonly status: "completed"
    }
  | {
      readonly message: string
      readonly status: "failed"
    }

export type StartLocalNoCodeTaskServerResult =
  | {
      readonly start: LocalTaskStartResult
      readonly status: "started"
    }
  | {
      readonly message: string
      readonly status: "failed"
    }

export type DispatchLocalTaskServerResult =
  | {
      readonly dispatch: LocalTaskDispatchResult
      readonly status: "accepted"
    }
  | {
      readonly message: string
      readonly status: "failed"
    }

export const readLocalTaskConsole = createServerFn({ method: "GET" }).handler(
  () => {
    return getLocalTaskConsole().readTaskConsole()
  }
)

export const startLocalNoCodeTask = createServerFn({ method: "POST" })
  .inputValidator(runNoCodeTaskInput.parse)
  .handler(async ({ data }): Promise<StartLocalNoCodeTaskServerResult> => {
    try {
      const start = await getLocalTaskConsole().startNoCodeTask(data)

      return { start, status: "started" }
    } catch (cause) {
      return {
        message:
          cause instanceof Error
            ? taskRunFailureMessage(cause)
            : taskRunFailureMessage(undefined),
        status: "failed",
      }
    }
  })

export const dispatchLocalTask = createServerFn({ method: "POST" }).handler(
  async (): Promise<DispatchLocalTaskServerResult> => {
    try {
      const dispatch = await getLocalTaskConsole().dispatchNextTask()

      return { dispatch, status: "accepted" }
    } catch (cause) {
      return {
        message:
          cause instanceof Error
            ? taskRunFailureMessage(cause)
            : taskRunFailureMessage(undefined),
        status: "failed",
      }
    }
  }
)

export const runLocalNoCodeTask = createServerFn({ method: "POST" })
  .inputValidator(runNoCodeTaskInput.parse)
  .handler(async ({ data }): Promise<RunLocalNoCodeTaskServerResult> => {
    try {
      const run = await getLocalTaskConsole().runNoCodeTask(data)

      return { run, status: "completed" }
    } catch (cause) {
      return {
        message:
          cause instanceof Error
            ? taskRunFailureMessage(cause)
            : taskRunFailureMessage(undefined),
        status: "failed",
      }
    }
  })

function getLocalTaskConsole(): LocalTaskConsole {
  localTaskConsole = localTaskConsole ?? createConfiguredLocalTaskConsole()

  return localTaskConsole
}

function createConfiguredLocalTaskConsole(): LocalTaskConsole {
  if (process.env.STONEFORGE_WEB_PROVIDER_MODE === "deterministic") {
    return createLocalTaskConsole({
      providerInstances: deterministicLocalProviders()
    })
  }

  return createLocalTaskConsole()
}
