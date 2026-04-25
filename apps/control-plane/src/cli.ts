import {
  formatDirectTaskRunSummary,
  runDirectTaskScenario,
} from "./index.js";

const result = await runDirectTaskScenario();

console.log(formatDirectTaskRunSummary(result.summary));
