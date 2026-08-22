import { describe, expect, it } from "vitest";
import { isValidExplorerName } from "./explorerNames";

describe("isValidExplorerName", () => {
  it("accepts ordinary cross-platform names", () => {
    expect(isValidExplorerName("src")).toBe(true);
    expect(isValidExplorerName("main.py")).toBe(true);
    expect(isValidExplorerName("my component.tsx")).toBe(true);
  });

  it.each(["", ".", "..", "a/b", "a\\b", "bad?.js", "file. "])(
    "rejects invalid name %j",
    (name) => expect(isValidExplorerName(name)).toBe(false),
  );

  it.each(["CON", "nul.txt", "COM1.log", "lpt9"])(
    "rejects Windows-reserved name %j",
    (name) => expect(isValidExplorerName(name)).toBe(false),
  );
});
