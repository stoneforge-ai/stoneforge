import { BrowserWindow, app } from "electron"
import { fileURLToPath } from "node:url"

async function createWindow() {
  const window = new BrowserWindow({
    height: 820,
    minHeight: 640,
    minWidth: 900,
    title: "Stoneforge Desktop",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: fileURLToPath(new URL("./preload.js", import.meta.url)),
    },
    width: 1180,
  })

  await window.loadFile(
    fileURLToPath(new URL("./renderer/index.html", import.meta.url))
  )

  if (process.env.STONEFORGE_DESKTOP_SMOKE === "1") {
    app.quit()
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

void app.whenReady().then(createWindow)
