import { Data } from "effect"

export class PlacementFailure extends Data.TaggedError("PlacementFailure")<{
  readonly message: string
}> {}

export class ProviderStartFailure extends Data.TaggedError("ProviderStartFailure")<{
  readonly message: string
}> {}

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
