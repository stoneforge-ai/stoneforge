import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Electron desktop renderer", () => {
  it("uses a Vite React entrypoint and Tailwind stylesheet", () => {
    const html = readFileSync(
      new URL("./renderer/index.html", import.meta.url),
      "utf8"
    )
    const renderer = readFileSync(
      new URL("./renderer/main.tsx", import.meta.url),
      "utf8"
    )
    const styles = readFileSync(
      new URL("./renderer/styles.css", import.meta.url),
      "utf8"
    )

    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('<script type="module" src="/main.tsx"></script>')
    expect(renderer).toContain("createRoot")
    expect(renderer).toContain("Desktop Task Console")
    expect(renderer).toContain("window.stoneforgeDesktop")
    expect(styles).toContain('@import "tailwindcss";')
    expect(html).toContain("Content-Security-Policy")
  })
})
