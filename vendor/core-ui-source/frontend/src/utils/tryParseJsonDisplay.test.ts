import { describe, expect, it } from "vitest";
import { formatToolValue, tryParseJsonDisplay } from "./tryParseJsonDisplay";

describe("tryParseJsonDisplay", () => {
  it("parses JSON object/array text", () => {
    expect(tryParseJsonDisplay('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJsonDisplay("[1,2]")).toEqual([1, 2]);
  });
  it("returns null for non-JSON / non-object text", () => {
    expect(tryParseJsonDisplay("hello")).toBeNull();
    expect(tryParseJsonDisplay("42")).toBeNull();
    expect(tryParseJsonDisplay("")).toBeNull();
    expect(tryParseJsonDisplay(null)).toBeNull();
    expect(tryParseJsonDisplay("{bad json")).toBeNull();
  });
});

describe("formatToolValue", () => {
  it("pretty-prints a JSON-encoded string (the native provider tool-result case)", () => {
    // Python json.dumps style: `": "` / `", "` separators, single line.
    const raw =
      '{"scope": "user", "scope_id": null, "workspace_id": "n.Workspace.dc7"}';
    expect(formatToolValue(raw)).toBe(
      [
        "{",
        '  "scope": "user",',
        '  "scope_id": null,',
        '  "workspace_id": "n.Workspace.dc7"',
        "}",
      ].join("\n"),
    );
  });

  it("pretty-prints an object value", () => {
    expect(formatToolValue({ a: 1, b: [2, 3] })).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    );
  });

  it("passes non-JSON strings through unchanged", () => {
    expect(formatToolValue("just text")).toBe("just text");
  });

  it("returns empty string for undefined", () => {
    expect(formatToolValue(undefined)).toBe("");
  });
});
