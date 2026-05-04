export function taskRunFailureMessage(cause: Error | undefined): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message
  }

  return "Task run failed before the provider returned an error message."
}
