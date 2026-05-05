type JsonPrimitive = boolean | null | number | string
type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject

export interface JsonObject {
  readonly [key: string]: JsonValue | undefined
}

export type JsonRpcId = number | string

export interface JsonRpcRequest extends JsonObject {
  readonly id: JsonRpcId
  readonly method: string
  readonly params?: JsonObject
}

export interface JsonRpcNotification extends JsonObject {
  readonly method: string
  readonly params?: JsonObject
}

export interface JsonRpcSuccessResponse extends JsonObject {
  readonly id: JsonRpcId
  readonly result: JsonObject
}

export interface JsonRpcErrorObject extends JsonObject {
  readonly code: number
  readonly message: string
}

export interface JsonRpcErrorResponse extends JsonObject {
  readonly error: JsonRpcErrorObject
  readonly id: JsonRpcId
}

export type JsonRpcIncomingMessage =
  | JsonRpcErrorResponse
  | JsonRpcNotification
  | JsonRpcRequest
  | JsonRpcSuccessResponse

export type JsonRpcOutgoingMessage = JsonRpcNotification | JsonRpcRequest

export function isSuccessResponse(
  message: JsonObject
): message is JsonRpcSuccessResponse {
  return isJsonRpcId(message.id) && isJsonObject(message.result)
}

export function isErrorResponse(
  message: JsonObject
): message is JsonRpcErrorResponse {
  return isJsonRpcId(message.id) && isJsonRpcErrorObject(message.error)
}

export function isNotification(
  message: JsonObject
): message is JsonRpcNotification {
  return (
    typeof message.method === "string" &&
    message.id === undefined &&
    isOptionalJsonObject(message.params)
  )
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isOptionalJsonObject(value: JsonValue | undefined): value is
  | JsonObject
  | undefined {
  return value === undefined || isJsonObject(value)
}

function isJsonRpcId(value: JsonValue | undefined): value is JsonRpcId {
  return typeof value === "number" || typeof value === "string"
}

function isJsonRpcErrorObject(
  value: JsonValue | undefined
): value is JsonRpcErrorObject {
  return (
    isJsonObject(value) &&
    typeof value.code === "number" &&
    typeof value.message === "string"
  )
}
