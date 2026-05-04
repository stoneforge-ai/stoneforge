import type { ProviderSessionStartContext } from "../provider-models.js"

export function noCodePrompt(context: ProviderSessionStartContext): string {
  return [
    "Stoneforge no-code Task",
    "",
    `Title: ${context.task.title}`,
    "",
    "Intent:",
    context.task.intent,
    "",
    "Return a concise completion summary and do not edit files."
  ].join("\n")
}
