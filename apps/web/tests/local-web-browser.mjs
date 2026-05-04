import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, "..")
const repoRoot = resolve(appRoot, "../..")
const appPort = 3100
const debugPort = 9223
const appUrl = `http://127.0.0.1:${String(appPort)}/`
const debugUrl = `http://127.0.0.1:${String(debugPort)}`

async function main() {
  const server = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(appPort),
      "--strictPort",
    ],
    {
      cwd: appRoot,
      env: { ...process.env, STONEFORGE_WEB_PROVIDER_MODE: "deterministic" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )

  let chrome

  try {
    await waitForHttp(appUrl)
    const chromeBin = findChromeBinary()
    const userDataDir = join(repoRoot, ".stoneforge-test/chrome")

    await rm(userDataDir, { force: true, recursive: true })
    await mkdir(userDataDir, { recursive: true })

    chrome = spawn(
      chromeBin,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${String(debugPort)}`,
        `--user-data-dir=${userDataDir}`,
        "about:blank",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    )

    const cdp = await connectToChrome()
    const target = await cdp.send("Target.createTarget", { url: appUrl })
    const attachment = await cdp.send("Target.attachToTarget", {
      flatten: true,
      targetId: target.targetId,
    })
    const sessionId = attachment.sessionId

    await cdp.send("Page.enable", {}, sessionId)
    await cdp.send("Runtime.enable", {}, sessionId)
    await waitForPageText(cdp, sessionId, "Local Task Console")
    await sleep(1_000)

    await runTask(cdp, sessionId, {
      intent: "Run Claude from the browser workflow.",
      provider: "claude-code",
      title: "Browser Claude Task",
    })
    await waitForPageText(cdp, sessionId, "Browser Claude Task")
    await waitForPageText(cdp, sessionId, "claude-code")

    await runTask(cdp, sessionId, {
      intent: "Run Codex from the browser workflow.",
      provider: "openai-codex",
      title: "Browser Codex Task",
    })
    const text = await waitForPageText(cdp, sessionId, "Browser Codex Task")

    assertIncludes(text, "Tasks")
    assertIncludes(text, "Assignments")
    assertIncludes(text, "Sessions")
    assertIncludes(text, "Lineage")
    assertIncludes(text, "openai-codex")
    assertIncludes(
      text,
      "Completed Browser Codex Task with deterministic Codex local web mode."
    )
  } finally {
    chrome?.kill("SIGTERM")
    server.kill("SIGTERM")
  }
}

async function runTask(cdp, sessionId, input) {
  await click(cdp, sessionId, `input[value="${input.provider}"]`)
  await setField(cdp, sessionId, "input[name='title']", input.title)
  await setField(cdp, sessionId, "textarea[name='intent']", input.intent)
  await click(cdp, sessionId, "button[type='submit']")
  await waitForEnabledSubmit(cdp, sessionId)
}

async function setField(cdp, sessionId, selector, value) {
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error("Missing form field.");
      }
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      valueSetter?.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
    })()`
  )
}

async function click(cdp, sessionId, selector) {
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        throw new Error("Missing clickable element.");
      }
      element.click();
    })()`
  )
}

async function waitForEnabledSubmit(cdp, sessionId) {
  await waitFor(cdp, sessionId, async () => {
    const value = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const button = document.querySelector("button[type='submit']");
        return button instanceof HTMLButtonElement && !button.disabled;
      })()`
    )

    return value === true
  })
}

async function waitForPageText(cdp, sessionId, expected) {
  let latestText = ""

  await waitFor(cdp, sessionId, async () => {
    latestText = String(
      await evaluate(cdp, sessionId, "document.body.innerText")
    )

    return latestText.toLowerCase().includes(expected.toLowerCase())
  })

  return latestText
}

async function waitFor(cdp, sessionId, predicate) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 15_000) {
    if (await predicate()) {
      return
    }

    await sleep(100)
  }

  const text = await evaluate(cdp, sessionId, "document.body.innerText")

  throw new Error(`Timed out waiting for browser workflow.\n\n${String(text)}`)
}

async function evaluate(cdp, sessionId, expression) {
  const response = await cdp.send(
    "Runtime.evaluate",
    {
      awaitPromise: true,
      expression,
      returnByValue: true,
    },
    sessionId
  )

  if (response.exceptionDetails !== undefined) {
    throw new Error(JSON.stringify(response.exceptionDetails))
  }

  return response.result.value
}

async function waitForHttp(url) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return
      }
    } catch {
      // Retry until Vite is listening.
    }

    await sleep(100)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function connectToChrome() {
  const version = await waitForChromeVersion()
  const socket = new WebSocket(version.webSocketDebuggerUrl)
  const cdp = new ChromeDevToolsProtocol(socket)

  await cdp.opened

  return cdp
}

async function waitForChromeVersion() {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(`${debugUrl}/json/version`)

      if (response.ok) {
        return response.json()
      }
    } catch {
      // Retry until Chrome exposes the DevTools endpoint.
    }

    await sleep(100)
  }

  throw new Error("Timed out waiting for Chrome DevTools.")
}

class ChromeDevToolsProtocol {
  constructor(socket) {
    this.nextId = 1
    this.opened = new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", reject, { once: true })
    })
    this.pending = new Map()
    this.socket = socket
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data)
      const pending = this.pending.get(message.id)

      if (pending === undefined) {
        return
      }

      this.pending.delete(message.id)

      if (message.error !== undefined) {
        pending.reject(new Error(JSON.stringify(message.error)))
        return
      }

      pending.resolve(message.result)
    })
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId
    this.nextId += 1

    const message =
      sessionId === undefined
        ? { id, method, params }
        : { id, method, params, sessionId }

    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { reject, resolve: resolvePromise })
      this.socket.send(JSON.stringify(message))
    })
  }
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter((candidate) => candidate !== undefined)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error("Set CHROME_BIN to run the local web browser workflow test.")
}

function assertIncludes(value, expected) {
  if (!value.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`Expected browser text to include ${expected}.`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

await main()
