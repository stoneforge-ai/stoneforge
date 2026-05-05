import type {
  LocalTaskConsoleView,
  LocalTaskProvider
} from "../lib/control-plane/index.js"

export interface LocalTaskConsoleDraft {
  readonly intent: string
  readonly provider: LocalTaskProvider
  readonly title: string
}

export interface LocalTaskConsoleCopy {
  readonly emptyState: string
  readonly fallbackError: string
  readonly heading: string
}

export interface LocalTaskConsoleViewProps {
  readonly copy: LocalTaskConsoleCopy
  readonly draft: LocalTaskConsoleDraft
  readonly errorMessage: string | null
  readonly onDraftChange: (draft: LocalTaskConsoleDraft) => void
  readonly onSubmit: () => Promise<void>
  readonly state: LocalTaskConsoleView
  readonly submitting: boolean
}
