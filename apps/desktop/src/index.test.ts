import { describe, expectTypeOf, it } from "vitest"

import type { LocalTaskConsole } from "@stoneforge/app-shell"

import {
  createElectronDesktopTaskClient,
  type CreateElectronDesktopTaskClientInput,
  type ElectronDesktopTaskClient,
} from "./index.js"

describe("Electron desktop Task client types", () => {
  it("keeps the desktop command client aligned with the shared local Task surface", () => {
    expectTypeOf(createElectronDesktopTaskClient)
      .parameter(0)
      .toEqualTypeOf<CreateElectronDesktopTaskClientInput | undefined>()
    expectTypeOf<ElectronDesktopTaskClient>().toEqualTypeOf<LocalTaskConsole>()
  })
})
