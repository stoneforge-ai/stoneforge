import {
  asCIRunId,
  type CIRunId,
  type MergeRequestId,
} from "@stoneforge/core";

import type {
  CIRun,
  MergeRequest,
  RecordCIRunInput,
} from "./models.js";
import { createCIRunRecord } from "./merge-request-records.js";

export function upsertCIRunRecord(
  ciRuns: Map<CIRunId, CIRun>,
  mergeRequest: MergeRequest,
  input: RecordCIRunInput,
  observedAt: string,
  nextId: () => string,
): CIRun {
  const existing = findCIRun(
    ciRuns,
    mergeRequest.id,
    input.providerCheckId,
  );
  const ciRun =
    existing ??
    createCIRunRecord(
      asCIRunId(nextId()),
      mergeRequest,
      input,
      observedAt,
    );

  ciRun.name = input.name;
  ciRun.state = input.state;
  ciRun.observedAt = observedAt;
  ciRuns.set(ciRun.id, ciRun);

  return ciRun;
}

export function rememberCIRun(
  mergeRequest: MergeRequest,
  ciRunId: CIRunId,
): void {
  if (mergeRequest.ciRunIds.includes(ciRunId)) {
    return;
  }

  mergeRequest.ciRunIds.push(ciRunId);
}

function findCIRun(
  ciRuns: Map<CIRunId, CIRun>,
  mergeRequestId: MergeRequestId,
  providerCheckId: string,
): CIRun | undefined {
  return Array.from(ciRuns.values()).find((ciRun) => {
    return (
      ciRun.mergeRequestId === mergeRequestId &&
      ciRun.providerCheckId === providerCheckId
    );
  });
}
