import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"

import { Duration, Effect } from "effect"

import type {
  CodexAppServerClient,
  CodexAppServerTurnInput,
  CodexAppServerTurnResult,
} from "./models.js"
import { CodexAppServerJsonRpcConnection } from "./internal/codex-app-server-connection.js"
import {
  CodexAppServerFailure,
  CodexAppServerTimeout,
} from "./internal/errors.js"

const DEFAULT_CODEX_APP_SERVER_TIMEOUT_MS = 180_000
const MACOS_CODEX_APP_COMMAND =
  "/Applications/Codex.app/Contents/Resources/codex"
const CODEX_APP_SERVER_FALLBACK_FAILURE = new CodexAppServerFailure({
  message: "codex app-server request failed.",
})

export interface NodeCodexAppServerClientInput {
  readonly command?: string
  readonly commandArgs?: readonly string[]
  readonly requestTimeoutMs?: number
}

export interface CodexAppServerCommandLookup {
  readonly appCommandExists: (command: string) => boolean
  readonly configuredCommand?: string
  readonly environmentCommand?: string
  readonly macosAppCommand: string
  readonly platform: NodeJS.Platform
}

export function createNodeCodexAppServerClient(
  input: NodeCodexAppServerClientInput = {}
): CodexAppServerClient {
  return {
    runTurn: (turnInput) => runCodexAppServerTurn(input, turnInput),
  }
}

async function runCodexAppServerTurn(
  clientInput: NodeCodexAppServerClientInput,
  turnInput: CodexAppServerTurnInput
): Promise<CodexAppServerTurnResult> {
  const timeoutMs =
    clientInput.requestTimeoutMs ?? DEFAULT_CODEX_APP_SERVER_TIMEOUT_MS

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* acquireCodexAppServerConnection(clientInput)

        yield* codexPhase(
          "initialize",
          Effect.tryPromise({
            try: () => connection.initialize(),
            catch: (cause) =>
              cause instanceof Error
                ? codexFailureFromError(cause)
                : CODEX_APP_SERVER_FALLBACK_FAILURE,
          }),
          timeoutMs
        )
        const threadId = yield* codexPhase(
          "thread/start",
          Effect.tryPromise({
            try: () => connection.startThread(turnInput),
            catch: (cause) =>
              cause instanceof Error
                ? codexFailureFromError(cause)
                : CODEX_APP_SERVER_FALLBACK_FAILURE,
          }),
          timeoutMs
        )
        return yield* codexPhase(
          "turn/start",
          Effect.tryPromise({
            try: () => connection.startTurn(threadId, turnInput),
            catch: (cause) =>
              cause instanceof Error
                ? codexFailureFromError(cause)
                : CODEX_APP_SERVER_FALLBACK_FAILURE,
          }),
          timeoutMs
        )
      }).pipe(Effect.withSpan("provider.openai_codex.app_server_turn"))
    )
  )
}

function acquireCodexAppServerConnection(
  clientInput: NodeCodexAppServerClientInput
) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const process: ChildProcessWithoutNullStreams = spawn(
        codexCommand(clientInput.command),
        [...(clientInput.commandArgs ?? ["app-server"])],
        {
          stdio: ["pipe", "pipe", "pipe"],
        }
      )
      return new CodexAppServerJsonRpcConnection(process)
    }),
    (connection) => Effect.sync(() => connection.close())
  )
}

function codexCommand(configuredCommand: string | undefined): string {
  return resolveCodexAppServerCommand({
    appCommandExists: existsSync,
    configuredCommand,
    environmentCommand: process.env.STONEFORGE_CODEX_COMMAND,
    macosAppCommand: MACOS_CODEX_APP_COMMAND,
    platform: process.platform,
  })
}

export function resolveCodexAppServerCommand(
  lookup: CodexAppServerCommandLookup
): string {
  const configuredCommand =
    lookup.configuredCommand ?? lookup.environmentCommand
  if (configuredCommand !== undefined) {
    return configuredCommand
  }

  return defaultCodexAppServerCommand(lookup)
}

function defaultCodexAppServerCommand(
  lookup: CodexAppServerCommandLookup
): string {
  if (hasMacosAppCommand(lookup)) {
    return lookup.macosAppCommand
  }

  return "codex"
}

function hasMacosAppCommand(lookup: CodexAppServerCommandLookup): boolean {
  return (
    lookup.platform === "darwin" &&
    lookup.appCommandExists(lookup.macosAppCommand)
  )
}

function codexPhase<A>(
  phase: string,
  effect: Effect.Effect<A, CodexAppServerFailure>,
  timeoutMs: number
) {
  return effect.pipe(
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () =>
        new CodexAppServerTimeout({
          message: `codex app-server ${phase} timed out.`,
          phase,
        }),
    }),
    Effect.withSpan(`provider.openai_codex.${phase}`)
  )
}

function codexFailureFromError(error: Error): CodexAppServerFailure {
  return new CodexAppServerFailure({
    message: error.message,
  })
}
