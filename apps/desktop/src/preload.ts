import { contextBridge } from "electron"

import { createDesktopTaskBridge } from "./bridge.js"

const desktopBridgeGlobalName = "stoneforgeDesktop"
const desktopBridge = createDesktopTaskBridge()

contextBridge.exposeInMainWorld(desktopBridgeGlobalName, desktopBridge)
