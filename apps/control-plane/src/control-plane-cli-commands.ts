import {
  type ControlPlaneOperationName,
  controlPlaneOperationNames,
} from "./control-plane-operations.js";

const commandAliases = {
  "configure-repo": "configure-repository",
  "configure-role": "configure-role-definition",
  "validate-workspace": "evaluate-readiness",
  "run-worker": "execute-next-dispatch",
  "record-verification-passed": "record-local-verification-passed",
  "complete-review": "complete-agent-review",
  approve: "record-human-approval",
  merge: "merge-when-ready",
} satisfies Record<string, ControlPlaneOperationName>;

export function operationForCommand(
  command: string,
): ControlPlaneOperationName {
  const operation = aliasForCommand(command);

  if (operation !== undefined) {
    return operation;
  }

  if (isOperationName(command)) {
    return command;
  }

  throw new Error(
    `Unknown command ${command}. Run smoke-flow, tracer-bullet, or summary.`,
  );
}

export function isSmokeFlowCommand(command: string): boolean {
  return command === "smoke-flow" || command === "tracer-bullet";
}

function aliasForCommand(
  command: string,
): ControlPlaneOperationName | undefined {
  if (!Object.prototype.hasOwnProperty.call(commandAliases, command)) {
    return undefined;
  }

  return commandAliases[command as keyof typeof commandAliases];
}

function isOperationName(
  command: string,
): command is ControlPlaneOperationName {
  return controlPlaneOperationNames.includes(
    command as ControlPlaneOperationName,
  );
}
