import { contextBridge } from "electron"

import { createDesktopTaskBridge } from "../lib/local-task/bridge.js"

const desktopBridgeGlobalName = "stoneforgeDesktop"
const desktopBridge = createDesktopTaskBridge()

contextBridge.exposeInMainWorld(desktopBridgeGlobalName, desktopBridge)
