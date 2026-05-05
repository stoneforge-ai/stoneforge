import { Data } from "effect"

export class PlacementFailure extends Data.TaggedError("PlacementFailure")<{
  readonly message: string
}> {}

export class ProviderStartFailure extends Data.TaggedError("ProviderStartFailure")<{
  readonly message: string
}> {}
