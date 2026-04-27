import {
  asVerificationRunId,
  type VerificationRunId,
  type MergeRequestId,
} from "@stoneforge/core"

import type {
  VerificationRun,
  MergeRequest,
  ProviderCheck,
  RecordProviderCheckInput,
} from "./models.js"
import { createVerificationRunRecord } from "./merge-request-records.js"

const failingStatePrecedence: readonly ProviderCheck["state"][] = [
  "failed",
  "running",
  "queued",
  "canceled",
]

export function upsertVerificationRunRecord(
  verificationRuns: Map<VerificationRunId, VerificationRun>,
  mergeRequest: MergeRequest,
  input: RecordProviderCheckInput,
  observedAt: string,
  nextId: () => string
): VerificationRun {
  const existing = findVerificationRun(
    verificationRuns,
    mergeRequest.id,
    mergeRequest.providerPullRequest.headSha
  )
  const verificationRun =
    existing ??
    createVerificationRunRecord(
      asVerificationRunId(nextId()),
      mergeRequest,
      observedAt
    )

  upsertProviderCheck(verificationRun, input, observedAt)
  verificationRun.state = deriveVerificationRunState(
    verificationRun.providerChecks
  )
  verificationRun.observedAt = observedAt
  verificationRuns.set(verificationRun.id, verificationRun)

  return verificationRun
}

export function rememberVerificationRun(
  mergeRequest: MergeRequest,
  verificationRunId: VerificationRunId
): void {
  if (mergeRequest.verificationRunIds.includes(verificationRunId)) {
    return
  }

  mergeRequest.verificationRunIds.push(verificationRunId)
}

function findVerificationRun(
  verificationRuns: Map<VerificationRunId, VerificationRun>,
  mergeRequestId: MergeRequestId,
  headSha: string
): VerificationRun | undefined {
  return Array.from(verificationRuns.values()).find((verificationRun) => {
    return (
      verificationRun.mergeRequestId === mergeRequestId &&
      verificationRun.headSha === headSha
    )
  })
}

function upsertProviderCheck(
  verificationRun: VerificationRun,
  input: RecordProviderCheckInput,
  observedAt: string
): void {
  const providerCheck: ProviderCheck = {
    providerCheckId: input.providerCheckId,
    name: input.name,
    state: input.state,
    required: input.required ?? true,
    observedAt,
  }
  const index = verificationRun.providerChecks.findIndex((check) => {
    return check.providerCheckId === input.providerCheckId
  })

  if (index === -1) {
    verificationRun.providerChecks.push(providerCheck)
    return
  }

  verificationRun.providerChecks[index] = providerCheck
}

function deriveVerificationRunState(
  providerChecks: readonly ProviderCheck[]
): VerificationRun["state"] {
  const requiredStates = new Set(
    providerChecks.filter((check) => check.required).map((check) => check.state)
  )

  return (
    failingStatePrecedence.find((state) => requiredStates.has(state)) ??
    "passed"
  )
}
