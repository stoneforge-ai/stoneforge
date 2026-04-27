export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export type JsonFieldValue = JsonValue | undefined
export type JsonFieldReader<TValue> = (
  object: JsonObject,
  context: string
) => TValue
type JsonFieldReaders = {
  readonly [key: string]: JsonFieldReader<JsonFieldValue>
}
export type JsonObjectMapperOutput<TReaders extends JsonFieldReaders> = {
  [TKey in keyof TReaders]: ReturnType<TReaders[TKey]>
}

export function parseJsonValue(text: string): JsonValue {
  return JSON.parse(text) as JsonValue
}

export function parseJsonObject(text: string, context: string): JsonObject {
  const value = parseJsonValue(text)

  if (isJsonObject(value)) {
    return value
  }

  throw new Error(`${context} did not return a JSON object.`)
}

export function isJsonObject(
  value: JsonValue | undefined
): value is JsonObject {
  return (
    value !== undefined &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    value !== null
  )
}

export function jsonArray(value: JsonValue | undefined): JsonValue[] {
  if (Array.isArray(value)) {
    return value
  }

  return []
}

export function jsonObject(
  value: JsonValue | undefined
): JsonObject | undefined {
  if (isJsonObject(value)) {
    return value
  }

  return undefined
}

export function jsonString(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") {
    return value
  }

  return undefined
}

export function jsonNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number") {
    return value
  }

  return undefined
}

export function jsonBoolean(value: JsonValue | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value
  }

  return undefined
}

export function requiredNumber(
  object: JsonObject,
  key: string,
  context: string
): number {
  const value = jsonNumber(object[key])

  if (value !== undefined) {
    return value
  }

  throw new Error(`${context} did not include numeric ${key}.`)
}

export function requiredString(
  object: JsonObject,
  key: string,
  context: string
): string {
  const value = jsonString(object[key])

  if (value !== undefined) {
    return value
  }

  throw new Error(`${context} did not include string ${key}.`)
}

export function defineJsonObjectMapper<const TReaders extends JsonFieldReaders>(
  readers: TReaders
): JsonFieldReader<JsonObjectMapperOutput<TReaders>> {
  return (object, context) => {
    const entries = Object.entries(readers).map(([key, read]) => {
      return [key, read(object, context)]
    })

    return Object.fromEntries(entries) as JsonObjectMapperOutput<TReaders>
  }
}

export function requiredJsonNumber(key: string): JsonFieldReader<number> {
  return (object, context) => requiredNumber(object, key, context)
}

export function requiredJsonString(key: string): JsonFieldReader<string> {
  return (object, context) => requiredString(object, key, context)
}
