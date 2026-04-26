import { describe, expect, it } from "vitest";

import {
  isJsonObject,
  jsonArray,
  jsonBoolean,
  jsonNumber,
  jsonObject,
  jsonString,
  parseJsonObject,
  parseJsonValue,
  requiredNumber,
  requiredString,
  type JsonObject,
} from "./github-json.js";

describe("GitHub JSON helpers", () => {
  it("parses JSON values and requires objects when requested", () => {
    expect(parseJsonValue("[1,true]")).toEqual([1, true]);
    expect(
      parseJsonObject('{"id":123,"name":"octo"}', "GitHub response"),
    ).toEqual({
      id: 123,
      name: "octo",
    });
    expect(() => parseJsonObject("[1,2,3]", "GitHub response")).toThrow(
      "GitHub response did not return a JSON object.",
    );
    expect(() => parseJsonObject("null", "GitHub response")).toThrow(
      "GitHub response did not return a JSON object.",
    );
  });

  it("narrows optional JSON values", () => {
    const object: JsonObject = {
      active: true,
      ids: [1, 2],
      name: "stoneforge",
    };

    expect(isJsonObject(object)).toBe(true);
    expect(isJsonObject(undefined)).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject(["not", "object"])).toBe(false);
    expect(jsonObject(object)).toBe(object);
    expect(jsonObject("stoneforge")).toBeUndefined();
    expect(jsonArray(object.ids)).toEqual([1, 2]);
    expect(jsonArray(object.name)).toEqual([]);
    expect(jsonString(object.name)).toBe("stoneforge");
    expect(jsonString(object.ids)).toBeUndefined();
    expect(jsonNumber(1)).toBe(1);
    expect(jsonNumber(object.name)).toBeUndefined();
    expect(jsonBoolean(object.active)).toBe(true);
    expect(jsonBoolean(object.name)).toBeUndefined();
  });

  it("requires typed fields with contextual errors", () => {
    const object: JsonObject = { number: 42, string: "value" };

    expect(requiredNumber(object, "number", "GitHub issue")).toBe(42);
    expect(requiredString(object, "string", "GitHub issue")).toBe("value");
    expect(() => requiredNumber(object, "string", "GitHub issue")).toThrow(
      "GitHub issue did not include numeric string.",
    );
    expect(() => requiredString(object, "number", "GitHub issue")).toThrow(
      "GitHub issue did not include string number.",
    );
  });
});
