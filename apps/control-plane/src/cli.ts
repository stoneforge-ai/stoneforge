import { formatDirectTaskRunSummary, runDirectTaskScenario } from "./index.js"
import { runControlPlaneCommand } from "./persistent-cli.js"

if (process.argv.length > 2) {
  process.exitCode = await runControlPlaneCommand(process.argv.slice(2), {
    write: (text) => console.log(text),
    writeError: (text) => console.error(text),
  })
} else {
  const result = await runDirectTaskScenario()

  console.log(formatDirectTaskRunSummary(result.summary))
}
