import { Effect } from "effect"

import { PlacementFailure } from "./errors.js"

export function placementEffect<A>(evaluate: () => A) {
  return Effect.try({
    try: evaluate,
    catch: (cause) =>
      new PlacementFailure({
        message: cause instanceof Error ? cause.message : "Placement failed."
      })
  })
}
