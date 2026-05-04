import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: false,
    outDir: "../../dist/renderer",
  },
  plugins: [tailwindcss(), viteReact()],
  root: "src/renderer",
})
