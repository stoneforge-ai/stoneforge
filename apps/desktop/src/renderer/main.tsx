import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { HomePage } from "./app/home/page.js"
import "./styles.css"

const initialState = await window.stoneforgeDesktop.readTaskConsole()

createRoot(document.querySelector("#root") as HTMLElement).render(
  <StrictMode>
    <HomePage initialState={initialState} />
  </StrictMode>
)
