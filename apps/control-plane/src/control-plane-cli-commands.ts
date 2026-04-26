import {
  type ControlPlaneOperationName,
  controlPlaneOperationNames,
} from "./control-plane-operations.js";

export function operationForCommand(
  command: string,
): ControlPlaneOperationName {
  if (isOperationName(command)) {
    return command;
  }

  throw new Error(`Unknown command ${command}. Run smoke-flow or summary.`);
}

export function isSmokeFlowCommand(command: string): boolean {
  return command === "smoke-flow";
}

function isOperationName(
  command: string,
): command is ControlPlaneOperationName {
  return controlPlaneOperationNames.includes(
    command as ControlPlaneOperationName,
  );
}
