import { createFileRoute } from "@tanstack/react-router"

import {
  HomePage,
  readLocalTaskConsole,
} from "../app/home/page.js"

export const Route = createFileRoute("/")({
  component: LocalWebConsole,
  loader: () => readLocalTaskConsole()
})

function LocalWebConsole() {
  return <HomePage state={Route.useLoaderData()} />
}
