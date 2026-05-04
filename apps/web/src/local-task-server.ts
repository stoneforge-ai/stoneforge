import { createServerFn } from "@tanstack/react-start"
import {
  completeProviderSession,
  defineProviderInstance,
  makeProviderInstanceId,
} from "@stoneforge/execution"
import type {
  ExecutionProviderInstance,
  ProviderSessionStartContext,
} from "@stoneforge/execution"
import { z } from "zod"

import {
  createLocalTaskConsole,
  type LocalTaskConsole,
  type LocalTaskRunResult,
} from "./local-task-console.js"
import { taskRunFailureMessage } from "./local-task-errors.js"

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

export const readLocalTaskConsole = createServerFn({ method: "GET" }).handler(
  () => {
    return getLocalTaskConsole().readTaskConsole()
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
      providerInstances: [
        deterministicLocalProvider(),
        deterministicCodexLocalProvider(),
      ],
    })
  }

  return createLocalTaskConsole()
}

function deterministicLocalProvider(): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionless",
    id: "claude-local-web",
    provider: "claude-code",
    startSession: async (context) =>
      completeDeterministicSession(
        context,
        `Completed ${context.task.title} in deterministic local web mode.`
      ),
  })
}

function deterministicCodexLocalProvider(): ExecutionProviderInstance {
  return defineProviderInstance({
    connectivity: "connectionful",
    id: "codex-local-web",
    provider: "openai-codex",
    startSession: async (context) =>
      completeDeterministicSession(
        context,
        `Completed ${context.task.title} with deterministic Codex local web mode.`
      ),
  })
}

function completeDeterministicSession(
  context: ProviderSessionStartContext,
  summary: string
): Awaited<ReturnType<ExecutionProviderInstance["startSession"]>> {
  const providerSession = {
    external:
      context.agent.provider === "claude-code"
        ? [{ kind: "claude.session" as const, sessionId: "local-web-dev" }]
        : [
            {
              kind: "codex.thread" as const,
              threadId: "local-web-dev-thread",
            },
            {
              kind: "codex.turn" as const,
              threadId: "local-web-dev-thread",
              turnId: "local-web-dev-turn",
            },
          ],
    provider: context.agent.provider,
    providerInstanceId: context.agent.providerInstanceId,
    providerSessionId:
      context.agent.provider === "claude-code"
        ? "claude-code:local-web-dev"
        : "openai-codex:local-web-dev-thread:local-web-dev-turn",
  }

  return completeProviderSession({
    context,
    events: [
      {
        kind: "provider.session.started",
        providerSessionId: providerSession.providerSessionId,
      },
      {
        kind: "provider.session.completed",
        status: "completed",
        summary,
      },
    ],
    logs: [],
    providerSession,
    summary,
    transcript: [{ role: "assistant", text: summary }],
  })
}
