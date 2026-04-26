import type { ControlPlaneCommandStatus } from "./control-plane-store.js";
import { formatDirectTaskRunSummary } from "./direct-task-summary.js";

export interface CommandIo {
  write(text: string): void;
  writeError(text: string): void;
}

export function writeStatus(
  io: CommandIo,
  json: boolean,
  status: ControlPlaneCommandStatus,
): void {
  if (json) {
    io.write(JSON.stringify(status));
    return;
  }

  io.write(`${status.command}: ${status.id}${stateSuffix(status)}`);
}

export function writeSummary(
  io: CommandIo,
  json: boolean,
  summary: Parameters<typeof formatDirectTaskRunSummary>[0],
): void {
  if (json) {
    io.write(JSON.stringify(summary));
    return;
  }

  io.write(formatDirectTaskRunSummary(summary));
}

function stateSuffix(status: ControlPlaneCommandStatus): string {
  if (status.state === undefined) {
    return "";
  }

  return ` (${status.state})`;
}
