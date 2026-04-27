type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand
}

export type TaskId = Brand<string, "TaskId">
export type DispatchIntentId = Brand<string, "DispatchIntentId">
export type AssignmentId = Brand<string, "AssignmentId">
export type SessionId = Brand<string, "SessionId">
export type LeaseId = Brand<string, "LeaseId">

export function asTaskId(value: string): TaskId {
  return brand<"TaskId">(value)
}

export function asDispatchIntentId(value: string): DispatchIntentId {
  return brand<"DispatchIntentId">(value)
}

export function asAssignmentId(value: string): AssignmentId {
  return brand<"AssignmentId">(value)
}

export function asSessionId(value: string): SessionId {
  return brand<"SessionId">(value)
}

export function asLeaseId(value: string): LeaseId {
  return brand<"LeaseId">(value)
}

export function parseTaskId(value: string): TaskId {
  return asTaskId(validIdValue(value, "TaskId"))
}

export function parseDispatchIntentId(value: string): DispatchIntentId {
  return asDispatchIntentId(validIdValue(value, "DispatchIntentId"))
}

export function parseAssignmentId(value: string): AssignmentId {
  return asAssignmentId(validIdValue(value, "AssignmentId"))
}

export function parseSessionId(value: string): SessionId {
  return asSessionId(validIdValue(value, "SessionId"))
}

export function parseLeaseId(value: string): LeaseId {
  return asLeaseId(validIdValue(value, "LeaseId"))
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

function brand<TBrand extends string>(value: string): Brand<string, TBrand> {
  return value as Brand<string, TBrand>
}

function validIdValue(value: string, label: string): string {
  if (idPattern.test(value)) {
    return value
  }

  throw new Error(
    `${label} must be a non-empty identifier containing only letters, numbers, ".", "_", "-", or ":".`
  )
}
