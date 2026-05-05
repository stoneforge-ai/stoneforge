import { Data } from "effect"

export class CodexAppServerFailure extends Data.TaggedError(
  "CodexAppServerFailure"
)<{
  readonly message: string
}> {}

export class CodexAppServerTimeout extends Data.TaggedError(
  "CodexAppServerTimeout"
)<{
  readonly message: string
  readonly phase: string
}> {}
