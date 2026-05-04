import type { DesktopTaskBridge } from "../index.js"

declare global {
  interface Window {
    readonly stoneforgeDesktop: DesktopTaskBridge
  }
}
